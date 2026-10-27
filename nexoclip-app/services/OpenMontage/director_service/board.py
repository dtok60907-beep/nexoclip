"""The project board: everything the Director has decided so far.

Creative content (brief, concepts, research, elements, script, shots) is
versioned: every change by the agent or the user stores a snapshot in
board_versions with its author and a one-line summary, so the history can be
browsed and any version restored. Runtime state (generated media, generation
requests) lives next to it but is not versioned.

Media are derived from the board: every element gets a reference image, every
shot a first frame (referencing its elements' images) and a video (animating
that frame). A media item is "stale" when its prompt/params or the media it
depends on changed after it was generated.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any, Callable, Optional, TypeVar

from director_service.db import Jsonb, notify, tx

ASPECT_RATIOS = ("16:9", "9:16", "1:1", "4:3", "3:4", "21:9")  # all of them Seedance 2.5 output ratios
RESOLUTIONS = ("480p", "720p", "1080p")
ELEMENT_KINDS = ("character", "location", "prop")
# The look of the whole video. Asked up front: it decides how every sheet, frame and clip is rendered.
# The creative brief beyond the one-line summary (all free text, empty when unknown).
BRIEF_DETAILS = ("goal", "audience", "platform", "key_message", "product", "tone", "references", "cta", "must_have",
                 "avoid")
LOOKS = ("realistic", "3d_animation", "anime", "illustration", "other")
MIN_SHOT_SECONDS, MAX_SHOT_SECONDS = 4, 15
# The prompt templates a project is made with (brief.templates). 2: the layouts BytePlus Dramagic uses (character
# close-up + three-view, location with a top-down view, references limited to what each kind gives, constraints at the
# end of every clip). Projects from before stay on 1, so their sheets and clips are not suddenly out of date.
PROMPT_TEMPLATES = 2
TERMINAL_OK = "succeeded"
CONTENT_KEYS = ("brief", "concepts", "research", "elements", "script", "scenes", "shots", "audio")
RUNTIME_KEYS = ("media", "requests", "renders", "video_notes")

T = TypeVar("T")


# Separate audio laid over the joined clips in the render (ElevenLabs), all optional: voiceover lines, each on
# a shot (shot.vo_text, read in the voice of audio.voiceover from shot.vo_offset seconds into that shot), and
# one music bed. audio.voiceover.text is an older single narration read from the start of the video.
MIN_MUSIC_SECONDS, MAX_MUSIC_SECONDS = 3, 300
MAX_VO_LINE_CHARS = 1000
DEFAULT_VO_OFFSET = 0.3


def empty_audio() -> dict[str, Any]:
    return {"voiceover": {"text": "", "voice_id": "", "voice_name": ""},
            "music": {"prompt": "", "duration_seconds": None, "instrumental": True},
            # directions the agent offers (set_audio_options); the user picks one in the Audio panel
            "options": [], "recommended": None, "chosen": None}


def video_seconds(board: dict[str, Any]) -> int:
    """Planned length of the final video: the shots minus their trims, else the brief's target."""
    total = sum(max(1.0, float(s.get("duration_seconds") or 0) - float(s.get("trim_start") or 0) - float(s.get("trim_end") or 0))
                for s in board["shots"])
    return int(round(total)) or int(board["brief"].get("duration_seconds") or 0)


def empty_board() -> dict[str, Any]:
    return {
        "brief": {"summary": "", "look": "", "video_type": "", "aspect_ratio": "16:9", "duration_seconds": None, "style": "",
                  "resolution": "720p", "generate_audio": True, "templates": PROMPT_TEMPLATES,
                  # Dramagic's method: clips made straight from the element sheets, no keyframe image per shot.
                  "keyframes": False,
                  **{k: "" for k in BRIEF_DETAILS}},
        "concepts": {"options": [], "recommended": None, "chosen": None, "locked": False},
        "research": [],
        "elements": [],
        "script": None,
        "scenes": [],
        "shots": [],
        "audio": empty_audio(),
        "media": {},
        "requests": [],
        "renders": [],
        # what the video analyst saw in each video the user attached: asset id -> description
        "video_notes": {},
    }


def _split(board: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return {k: board[k] for k in CONTENT_KEYS}, {k: board[k] for k in RUNTIME_KEYS}


def _merge(content: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
    return {**empty_board(), **copy.deepcopy(content), **copy.deepcopy(runtime)}


def create_board(project_id: str) -> None:
    content, runtime = _split(empty_board())
    with tx() as conn:
        conn.execute("INSERT INTO boards (project_id, version, content, runtime) VALUES (%s, 1, %s, %s)",
                     (project_id, Jsonb(content), Jsonb(runtime)))
        conn.execute("INSERT INTO board_versions (project_id, version, content, author, summary) VALUES (%s, 1, %s, 'system', %s)",
                     (project_id, Jsonb(content), "Project dibuat"))
        notify(conn, project_id)


def read_board(project_id: str) -> dict[str, Any]:
    with tx() as conn:
        row = conn.execute("SELECT version, content, runtime FROM boards WHERE project_id = %s", (project_id,)).fetchone()
    if row is None:
        raise KeyError(project_id)
    board = _merge(row["content"], row["runtime"])
    board["version"] = row["version"]
    return board


def update_board(project_id: str, change: Callable[[dict[str, Any]], T], *, author: str = "system",
                 summary: str | Callable[[], str] = "") -> T:
    """Read-modify-write in one transaction (row lock), so the agent, user edits and a
    generation run never clobber each other. A content change becomes a new version."""
    with tx() as conn:
        row = conn.execute("SELECT version, content, runtime FROM boards WHERE project_id = %s FOR UPDATE",
                           (project_id,)).fetchone()
        if row is None:
            raise KeyError(project_id)
        board = _merge(row["content"], row["runtime"])
        before_content, before_runtime = _split(board)
        before_content, before_runtime = copy.deepcopy(before_content), copy.deepcopy(before_runtime)
        result = change(board)
        content, runtime = _split(board)
        version = row["version"]
        if content != before_content:
            version += 1
            conn.execute("INSERT INTO board_versions (project_id, version, content, author, summary) VALUES (%s, %s, %s, %s, %s)",
                         (project_id, version, Jsonb(content), author, (summary() if callable(summary) else summary) or "Perubahan"))
        if content != before_content or runtime != before_runtime:
            conn.execute("UPDATE boards SET version = %s, content = %s, runtime = %s, updated_at = now() WHERE project_id = %s",
                         (version, Jsonb(content), Jsonb(runtime), project_id))
            notify(conn, project_id)
        return result


def list_versions(project_id: str, limit: int = 100) -> list[dict[str, Any]]:
    with tx() as conn:
        rows = conn.execute(
            "SELECT version, author, summary, created_at FROM board_versions WHERE project_id = %s ORDER BY version DESC LIMIT %s",
            (project_id, limit),
        ).fetchall()
    return [{**r, "created_at": r["created_at"].isoformat()} for r in rows]


def version_content(project_id: str, version: int) -> Optional[dict[str, Any]]:
    with tx() as conn:
        row = conn.execute("SELECT content FROM board_versions WHERE project_id = %s AND version = %s",
                           (project_id, version)).fetchone()
    return None if row is None else {**{k: empty_board()[k] for k in CONTENT_KEYS}, **row["content"]}


def restore_version(project_id: str, version: int, *, author: str = "user") -> int:
    """Make an old version current again (as a new version). Generated media are kept;
    whatever no longer matches its prompt simply shows as needing regeneration."""
    snapshot = version_content(project_id, version)
    if snapshot is None:
        raise KeyError(f"version {version}")

    def change(board: dict[str, Any]) -> None:
        for key in CONTENT_KEYS:
            board[key] = copy.deepcopy(snapshot[key])

    update_board(project_id, change, author=author, summary=f"Kembali ke versi {version}")
    return read_board(project_id)["version"]


def element(board: dict[str, Any], element_id: str) -> Optional[dict[str, Any]]:
    return next((e for e in board["elements"] if e["id"] == element_id), None)


def shot(board: dict[str, Any], shot_id: str) -> Optional[dict[str, Any]]:
    return next((s for s in board["shots"] if s["id"] == shot_id), None)


def scene(board: dict[str, Any], scene_id: str) -> Optional[dict[str, Any]]:
    return next((s for s in board["scenes"] if s["id"] == scene_id), None)


# ---------------------------------------------------------------- media specs


# Every element is generated as ONE reference sheet, so a single image carries all the
# views later frames need to keep the character / location / prop consistent.
SHEET_TEMPLATES = {
    "character": (
        "Character reference sheet, one image on a plain light-grey studio background. The same character shown "
        "full body in a row: front view, three-quarter view, side profile and back view, plus two head close-ups "
        "(neutral and smiling). Identical face, proportions, hairstyle, outfit and colours in every view; even soft "
        "studio lighting; clean layout with space between views; no text, labels or watermarks.\nCharacter: {description}"
    ),
    "location": (
        "Location reference sheet, one image laid out as a 2x2 grid of the same place: wide establishing shot, "
        "reverse angle, medium shot of the main area, and a close detail of key textures and props. Identical "
        "architecture, layout, materials, lighting and time of day in all four panels; no people; no text, labels "
        "or watermarks.\nLocation: {description}"
    ),
    "prop": (
        "Prop / product reference sheet, one image on a plain light-grey studio background. The same object shown "
        "front, side, back and three-quarter, plus a close-up of materials, details and any branding. Identical "
        "shape, scale, colours and finish in every view; soft even studio lighting; no text, labels or watermarks."
        "\nObject: {description}"
    ),
}


# Sheets for projects that chose a look (brief.look). Projects from before keep SHEET_TEMPLATES
# as they were, so their existing sheets are not suddenly out of date (and regenerated, at a cost).
LOOK_SHEET_TEMPLATES = {
    "character": (
        "Character reference sheet, one image on a plain light-grey studio background. The same character shown "
        "full body in a row: front view, three-quarter view, side profile and back view, plus two head close-ups "
        "(neutral and smiling). Identical face, proportions, hairstyle, outfit and colours in every view; even soft "
        "lighting; clean layout with space between views; only this one character; no text, labels or watermarks."
        "\nCharacter: {description}"
    ),
    "location": (
        "Location reference sheet, one image laid out as a 2x2 grid of the same place: wide establishing shot, "
        "reverse angle, medium shot of the main area, and a close detail of key textures. Identical architecture, "
        "layout, materials, lighting and time of day in all four panels; empty of people; no text, labels or "
        "watermarks.\nLocation: {description}"
    ),
    "prop": (
        "Prop / product reference sheet, one image on a plain light-grey studio background. The object alone: front, "
        "side, back and three-quarter views, plus a close-up of materials, details and any branding. No people, no "
        "hands, no body parts, no mannequins. Identical shape, scale, colours and finish in every view; soft even "
        "lighting; no text, labels or watermarks.\nObject: {description}"
    ),
}
# Sheets of projects on templates 2.
DRAMAGIC_SHEET_TEMPLATES = {
    **LOOK_SHEET_TEMPLATES,
    "character": (
        "Character reference sheet, one 16:9 image on a plain light-grey studio background, without dividing lines. "
        "Left, about 40% of the width: an upper-body close-up from the chest up, frontal and at eye level, showing the "
        "face, hairstyle, expression, eye contact, upper-body clothing and accessories. Right, about 60% of the width: "
        "the same character full body three times, front view, side view and back view, in a neutral standing pose. "
        "Identical face, proportions, hairstyle, outfit and colours in every view; even soft lighting; only this one "
        "character; no text, labels or watermarks.\nCharacter: {description}"
    ),
    "location": (
        "Location reference sheet, one 16:9 image in four panels of the same place: top left the front view, centred "
        "and complete; top right a top-down view of the whole layout from high above; bottom left the reverse view from "
        "behind; bottom right a side view. The same place, lighting, colours and time of day in all four panels. Only "
        "the place and its fixed furniture: no people, no animals, nothing that moves on its own, no effects. Straight "
        "lines stay straight, the horizon level and verticals vertical: no fisheye, no barrel distortion, no "
        "curvature. No text, labels or watermarks.\nLocation: {description}"
    ),
}
PROP_IN_USE = (
    "Prop / product reference sheet, one image on a plain light-grey studio background. Left half: the object alone in "
    "front, side and three-quarter views, no people. Right half: the object in use, {interaction}; show only as much of "
    "the person as the interaction needs. Identical shape, scale, colours and finish throughout; soft even lighting; "
    "no text, labels or watermarks.\nObject: {description}"
)
# How each look is rendered: added to every sheet, frame and clip prompt of the project.
LOOK_RENDERING = {
    "realistic": ("Photorealistic, real photograph / live-action footage: real people with natural skin texture and "
                  "real proportions, real materials and physically accurate light, shot on a full-frame cinema camera. "
                  "Not an illustration, not a 3D render, not anime, not a cartoon, not CGI."),
    "3d_animation": "Stylised 3D animated feature-film look: appealing 3D characters, soft global illumination, rich materials.",
    "anime": "Japanese anime look: clean line art, cel shading, anime character design.",
    "illustration": "Hand-drawn 2D illustration look: painterly textures, illustrated characters and backgrounds.",
    "other": "",
}


# Templates 2: Seedream 5 drifts to airbrushed, idol-like faces unless "realistic" also rules the beauty look out.
REALISTIC_SKIN = ("Unretouched: natural skin texture with visible pores and small imperfections, ordinary believable "
                  "faces, no beauty filter, no airbrushed, doll-like or idol-like look.")


def look_rendering(brief: dict[str, Any]) -> str:
    rendering = LOOK_RENDERING.get(brief.get("look") or "", "")
    if rendering and brief.get("look") == "realistic" and templates(brief) >= 2:
        rendering += " " + REALISTIC_SKIN
    return rendering


def templates(brief: dict[str, Any]) -> int:
    return int(brief.get("templates") or 1)


def keyframes(brief: dict[str, Any]) -> bool:
    """Whether shots get a first-frame image that their clip starts from (projects from before 27 Oct 2026). New
    projects make every clip from the sheets alone, like Dramagic: frames made one by one drifted in faces and
    positions, and the clip jumped between them."""
    return brief.get("keyframes", True) is not False


def sheet_prompt(item: dict[str, Any], style: str, look: str = "", version: int = 1) -> str:
    if not look:  # project from before looks were asked: unchanged prompt
        prompt = SHEET_TEMPLATES[item["kind"]].format(description=item["description"])
        return prompt + (f"\nStyle: {style}" if style else "")
    # Templates 2: a prop sheet is always the object alone (Dramagic): people on it are strangers to the character
    # sheets and get copied into clips. How it is used is told in the shots, with the characters' own sheets.
    interaction = (item.get("interaction") or "").strip() if item["kind"] == "prop" and version < 2 else ""
    sheets = DRAMAGIC_SHEET_TEMPLATES if version >= 2 else LOOK_SHEET_TEMPLATES
    template = PROP_IN_USE if interaction else sheets[item["kind"]]
    prompt = template.format(description=item["description"], interaction=interaction)
    rendering = LOOK_RENDERING.get(look, "")
    return prompt + (f"\nLook: {rendering}" if rendering else "") + (f"\nStyle: {style}" if style else "")


MAX_ELEMENT_PHOTOS = 4
MIN_KEPT_SECONDS = 1  # a trimmed clip keeps at least this much
FROM_PHOTOS = ("Base it on the attached reference photo(s) of this exact {kind}: keep its identity exactly as photographed "
               "({keep}); the description only fills in what the photos do not show.")
PHOTO_KEEP = {"character": "same face, facial structure, skin tone, hair and build",
              "location": "same layout, architecture, materials and landmarks",
              "prop": "same shape, proportions, materials, colours, logo and markings"}


# A variant is another state of an element (a pressed flower, a torn dress, the studio wrecked, another outfit): its
# sheet is made from the original's sheet, so everything the description does not change stays the same.
FROM_ORIGINAL = ("Reference image {n} is the reference sheet of {name}: this is the same {kind} in another state. Keep "
                 "everything the description does not change exactly as in that sheet, and lay this sheet out the same way.")


def variant_source(board: dict[str, Any], item: dict[str, Any]) -> Optional[dict[str, Any]]:
    """The element this one is a variant of: another element of the same kind that is not a variant itself."""
    original = element(board, item.get("variant_of") or "")
    if original is None or original["id"] == item["id"] or original["kind"] != item["kind"] or original.get("variant_of"):
        return None
    return original


def _with_look(prompt: str, brief: dict[str, Any]) -> str:
    rendering = look_rendering(brief)
    return f"{prompt}\nLook: {rendering}" if rendering else prompt


# How the video prompt names each reference image, in the order they are sent (Seedance omni: "@Image N",
# the same citation and identity wording Canvas uses in lib/mention-prompt.ts).
KEEP_IDENTITY = {
    "character": "the exact same person/character, and preserve facial identity, facial structure, skin tone, hairstyle, "
                 "wardrobe and distinguishing features without substitution or redesign",
    "location": "the exact same location, and preserve its spatial layout, architecture, landmarks, materials and "
                "distinguishing details without substitution or redesign",
    "prop": "the exact same object, and preserve its shape, geometry, materials, colors, markings and distinguishing "
            "details without substitution or redesign",
}
# Templates 2: what Seedance may take from each kind of reference sheet, so a sheet's poses, layout or extra people
# are not copied into the clip (Dramagic's wording).
REFERENCE_USE = {
    "character": "take only the appearance, face, hairstyle and clothing of this character from it",
    "location": "take only the spatial layout, architecture and lighting of this place from it; people in that image are "
                "not used",
    "prop": "take only the structure, material and colour of this object from it",
}


def reference_line(n: int, item: dict[str, Any], version: int) -> str:
    """How the video prompt names element reference @Image<n>."""
    if version >= 2:
        use = REFERENCE_USE.get(item["kind"], REFERENCE_USE["prop"])
        return (f"@Image{n} is the reference sheet of {item['name']} ({item['kind']}), several views of it on one image: "
                f"{use}. Never show the sheet layout itself.")
    return (f"@Image{n} is the reference sheet of {item['name']} ({item['kind']}), several views of it on one image: "
            f"show {KEEP_IDENTITY.get(item['kind'], KEEP_IDENTITY['prop'])}. Never show the sheet layout itself.")


def scene_setting(board: dict[str, Any], scene_id: Optional[str]) -> str:
    """Templates 2: the scene's time of day and lighting, said once before the shots."""
    item = scene(board, scene_id or "") or {}
    lines = [f"{label}: {item[key].strip()}" for key, label in (("time", "Time"), ("lighting", "Lighting"))
             if (item.get(key) or "").strip()]
    return "\n".join(lines)


def clip_constraints(board: dict[str, Any]) -> str:
    """Templates 2: the fixed rules at the end of every clip prompt."""
    lines = ["Strict constraints:",
             "- Keep every character's identity, the number of people, costumes, who holds which prop, where everyone "
             "is in the space and who speaks consistent.",
             "- Each character appears only once in a frame: no duplicates, clones or twins.",
             "- No subtitles, captions or text overlays."]
    if ((board.get("audio") or {}).get("music") or {}).get("prompt", "").strip():
        lines.append("- No background music: the music is added later.")
    return "\n".join(lines)


MAX_VIDEO_REFERENCES = 30  # Seedance 2.5 reference_image limit


def video_references(board: dict[str, Any], shot: dict[str, Any]) -> list[str]:
    """The shot's frame, then the reference sheet of every element in it."""
    sheets = [f"element:{e}" for e in shot.get("element_ids", []) if element(board, e)]
    return [f"frame:{shot['id']}", *sheets][:MAX_VIDEO_REFERENCES]


def reference_legend(board: dict[str, Any], deps: list[str], user_images: int = 0, user_videos: int = 0) -> str:
    lines = ["References:", "@Image1 is the opening frame of this shot: start the clip from it."]
    for n, dep in enumerate(deps[1:], start=2):
        lines.append(reference_line(n, element(board, dep.split(":", 1)[1]), templates(board["brief"])))
    for n in range(len(deps) + 1, len(deps) + 1 + user_images):
        lines.append(f"@Image{n} is a reference the user gave for this shot: follow its style, composition and mood.")
    for n in range(1, user_videos + 1):
        lines.append(f"@Video{n} is a reference video the user gave: follow its motion, camera movement and pacing.")
    return "\n".join(lines) if len(lines) > 2 else ""


MENTION = re.compile(r"@([a-z0-9_]{2,40})\b")


def mentioned_elements(board: dict[str, Any], text: str) -> list[str]:
    """Ids of the board's elements named with @<id> in a prompt, in order."""
    return [m for m in dict.fromkeys(MENTION.findall(text or "")) if element(board, m)]


def compile_mentions(text: str, names: dict[str, str]) -> tuple[str, bool]:
    """Replace @<element_id> with how the model should see that element; returns (text, any replaced)."""
    hit = False

    def swap(match: re.Match) -> str:
        nonlocal hit
        if match.group(1) not in names:
            return match.group(0)
        hit = True
        return names[match.group(1)]

    return MENTION.sub(swap, text or ""), hit


def user_references(item: dict[str, Any]) -> tuple[list[str], list[str]]:
    """The user's own images and videos attached to a shot as references."""
    refs = item.get("reference_assets") or []
    return [r["asset_id"] for r in refs if r["kind"] == "image"], [r["asset_id"] for r in refs if r["kind"] == "video"]


def media_specs(board: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """What should exist, keyed "element:<id>", "frame:<shot>", "video:<shot>"."""
    brief = board["brief"]
    ratio = brief.get("aspect_ratio") or "16:9"
    style = (brief.get("style") or "").strip()
    look = brief.get("look") or ""
    specs: dict[str, dict[str, Any]] = {}
    for item in board["elements"]:
        prompt = sheet_prompt(item, style, look, templates(brief))
        photos = item.get("photos") or []
        if photos:
            prompt += "\n" + FROM_PHOTOS.format(kind=item["kind"], keep=PHOTO_KEEP.get(item["kind"], PHOTO_KEEP["prop"]))
        original = variant_source(board, item)
        if original is not None:
            # The original's sheet goes after the user's photos (generation sends photos first, then deps).
            prompt += "\n" + FROM_ORIGINAL.format(n=len(photos) + 1, name=original["name"], kind=item["kind"])
        specs[f"element:{item['id']}"] = {
            "kind": "image", "label": f"{item['name']} — reference sheet", "prompt": prompt,
            "deps": [f"element:{original['id']}"] if original is not None else [],
            "params": {"aspectRatio": "16:9"},
            **({"photos": list(photos)} if photos else {}),
        }
    for item in board["shots"]:
        audio = {"resolution": brief.get("resolution") or "720p", "generateAudio": bool(brief.get("generate_audio"))}
        source = extended_shot(board, item)
        if source is not None:
            # A continuation: Seedance extends the source shot's clip, so it has no frame of its own.
            specs[f"video:{item['id']}"] = {
                "kind": "video", "label": f"{item['title']} — video (lanjutan)",
                "prompt": _with_look(f"{EXTEND_PREFIX}{item['video_prompt']}", brief), "deps": [f"video:{source['id']}"],
                "params": {"aspectRatio": "adaptive", "duration": int(item["duration_seconds"]), **audio,
                           "omniReferenceTaskType": "extend"},
            }
        else:
            _shot_specs(board, item, specs, ratio, audio)
        instruction = (item.get("edit_instruction") or "").strip()
        if instruction:
            specs[f"edit:{item['id']}"] = {
                "kind": "video", "label": f"{item['title']} — edit video",
                "prompt": f"Edit the video: {instruction}. Keep everything else exactly as it is.",
                "deps": [f"video:{item['id']}"],
                "params": {"aspectRatio": "adaptive", "duration": -1, **audio, "omniReferenceTaskType": "edit"},
            }
    clip_audio = {"resolution": brief.get("resolution") or "720p", "generateAudio": bool(brief.get("generate_audio"))}
    for block in scene_blocks(board):
        specs[block["key"]] = _scene_spec(board, block, ratio, clip_audio)
    audio = board.get("audio") or empty_audio()
    voiceover = audio.get("voiceover") or {}
    if voiceover.get("voice_id"):
        for item in board["shots"]:
            line = (item.get("vo_text") or "").strip()
            if line:
                specs[f"vo:{item['id']}"] = {
                    "kind": "audio", "label": f"{item['title']} — VO", "prompt": line, "deps": [],
                    "params": {"type": "voiceover", "voiceId": voiceover["voice_id"]},
                }
    if (voiceover.get("text") or "").strip() and voiceover.get("voice_id"):
        specs["audio:voiceover"] = {
            "kind": "audio", "label": "Voiceover", "prompt": voiceover["text"].strip(), "deps": [],
            "params": {"type": "voiceover", "voiceId": voiceover["voice_id"]},
        }
    music = audio.get("music") or {}
    if (music.get("prompt") or "").strip():
        seconds = int(music.get("duration_seconds") or video_seconds(board) or 30)
        specs["audio:music"] = {
            "kind": "audio", "label": "Musik", "prompt": music["prompt"].strip(), "deps": [],
            "params": {"type": "music", "durationSeconds": max(MIN_MUSIC_SECONDS, min(MAX_MUSIC_SECONDS, seconds)),
                       "instrumental": bool(music.get("instrumental", True))},
        }
    return specs


EXTEND_PREFIX = "Extend the video: continue it seamlessly from its last moment, same people, place, light and camera. "


def extended_shot(board: dict[str, Any], item: dict[str, Any]) -> Optional[dict[str, Any]]:
    """The shot this one continues (video extend), if any."""
    seen = {item["id"]}
    current = item
    while current.get("extends"):  # follow the chain so a loop (a extends b extends a) is ignored
        current = shot(board, current["extends"])
        if current is None or current["id"] in seen:
            return None
        seen.add(current["id"])
    return shot(board, item["extends"]) if item.get("extends") else None


def _sheet_legend(board: dict[str, Any], element_ids: list[str], user_images: int = 0, user_videos: list[str] = (),
                  used_by: Optional[Callable[[str], str]] = None) -> tuple[str, dict[str, str]]:
    """References of a clip made from the sheets alone: @Image1.. are the sheets, then the user's images."""
    version = templates(board["brief"])
    lines, names = ["References:"], {}
    for n, element_id in enumerate(element_ids, start=1):
        item = element(board, element_id)
        names[element_id] = f"{item['name']} (@Image{n})"
        lines.append(reference_line(n, item, version))
    for n in range(len(element_ids) + 1, len(element_ids) + 1 + user_images):
        lines.append(f"@Image{n} is a reference the user gave: use it only for style, composition and mood.")
    for n, asset_id in enumerate(user_videos, start=1):
        where = f" for {used_by(asset_id)}" if used_by else ""
        lines.append(f"@Video{n} is a reference video the user gave{where}: use it only for its motion, camera movement "
                     f"and pacing, not its people or place.")
    return ("\n".join(lines) if len(lines) > 1 else ""), names


def _sheet_shot_spec(board: dict[str, Any], item: dict[str, Any], ratio: str, audio: dict[str, Any]) -> dict[str, Any]:
    """One shot's clip from the sheets of its elements (no keyframe)."""
    brief = board["brief"]
    images, videos = user_references(item)
    ids = [e for e in item.get("element_ids", []) if element(board, e)][:MAX_VIDEO_REFERENCES - len(images)]
    legend, names = _sheet_legend(board, ids, len(images), videos)
    body = _with_look(compile_mentions(item["video_prompt"], names)[0], brief)
    prompt = "\n\n".join(p for p in (legend, scene_setting(board, item.get("scene_id")), body, clip_constraints(board)) if p)
    return {
        "kind": "video", "label": f"{item['title']} — video", "prompt": prompt, "deps": [f"element:{e}" for e in ids],
        "params": {"aspectRatio": ratio, "duration": int(item["duration_seconds"]), **audio,
                   "omniReferenceTaskType": "reference"},
        **({"extra_images": images} if images else {}), **({"ref_videos": videos} if videos else {}),
    }


def _shot_specs(board: dict[str, Any], item: dict[str, Any], specs: dict[str, dict[str, Any]], ratio: str,
                audio: dict[str, Any]) -> None:
    brief = board["brief"]
    if not keyframes(brief):
        specs[f"video:{item['id']}"] = _sheet_shot_spec(board, item, ratio, audio)
        return
    refs = [f"element:{e}" for e in item.get("element_ids", []) if element(board, e)]
    images, videos = user_references(item)
    # @element mentions name the reference images they point at (Seedream: "reference image N").
    frame_names = {}
    for n, dep in enumerate(refs, start=1):
        el = element(board, dep.split(":", 1)[1])
        frame_names[el["id"]] = f"{el['name']} (reference image {n})"
    frame_text, mentioned = compile_mentions(item["frame_prompt"], frame_names)
    frame_prompt = _with_look(frame_text, brief)
    if refs and templates(brief) >= 2:
        # Always, even when the prompt names people without @mentions: Seedream must know which sheet is whom.
        frame_prompt += "\nReference images: " + "; ".join(
            f"image {n} is the reference sheet of {el['name']} ({el['kind']}): "
            f"{REFERENCE_USE.get(el['kind'], REFERENCE_USE['prop'])}"
            for n, el in ((n, element(board, d.split(':', 1)[1])) for n, d in enumerate(refs, start=1))
        ) + ". Every person's face, hair and clothes match their own sheet exactly; never copy a sheet's layout."
    elif mentioned:
        frame_prompt += "\nReference images: " + "; ".join(
            f"image {n} is the reference sheet of {element(board, d.split(':', 1)[1])['name']}, several views on one image: "
            f"keep its identity, never copy the sheet layout" for n, d in enumerate(refs, start=1)) + "."
    if images:
        frame_prompt += f"\nThe last {len(images)} reference image(s) are the user's references: follow their style and composition."
    specs[f"frame:{item['id']}"] = {
        "kind": "image", "label": f"{item['title']} — frame", "prompt": frame_prompt, "deps": refs,
        "params": {"aspectRatio": ratio},
        **({"extra_images": images} if images else {}),
    }
    deps = video_references(board, item)[:MAX_VIDEO_REFERENCES - len(images)]
    legend = reference_legend(board, deps, len(images), len(videos))
    video_names = {}
    for n, dep in enumerate(deps[1:], start=2):
        el = element(board, dep.split(":", 1)[1])
        video_names[el["id"]] = f"{el['name']} (@Image{n})"
    video_prompt = _with_look(compile_mentions(item["video_prompt"], video_names)[0], brief)
    if templates(brief) >= 2:
        # Dramagic's order: references, the scene's time and light, the shot, then the fixed constraints.
        prompt = "\n\n".join(p for p in (legend, scene_setting(board, item.get("scene_id")), video_prompt,
                                           clip_constraints(board)) if p)
    else:
        prompt = f"{video_prompt}\n{legend}" if legend else video_prompt
    specs[f"video:{item['id']}"] = {
        "kind": "video", "label": f"{item['title']} — video",
        "prompt": prompt,
        "deps": deps,
        "params": {"aspectRatio": ratio, "duration": int(item["duration_seconds"]), **audio},
        **({"extra_images": images} if images else {}), **({"ref_videos": videos} if videos else {}),
    }


MAX_SCENE_SECONDS = 30  # Seedance 2.5's longest single generation


def _first_appearance(board: dict[str, Any], shots: list[dict[str, Any]]) -> list[str]:
    """Element ids of these shots in the order they first appear: mentions in the prompts, then element_ids.
    Seedance maps references to characters best when they are uploaded in that order."""
    order: list[str] = []
    for item in shots:
        for element_id in [*mentioned_elements(board, item.get("video_prompt") or ""), *item.get("element_ids", [])]:
            if element(board, element_id) and element_id not in order:
                order.append(element_id)
    return order


MAX_SCENE_REFERENCE_VIDEOS = 3  # the user's reference videos in one scene video (Seedance takes 10, 30 s in total)


def _scene_eligible(board: dict[str, Any], item: dict[str, Any]) -> bool:
    """A shot can be part of a scene video: it has its own frame (no continuation) and no video the user uploaded."""
    return not item.get("extends") and not (board["media"].get(f"video:{item['id']}") or {}).get("uploaded")


def _scene_videos(shots: list[dict[str, Any]]) -> list[str]:
    return list(dict.fromkeys(a for s in shots for a in user_references(s)[1]))


def scene_blocks(board: dict[str, Any]) -> list[dict[str, Any]]:
    """Runs of consecutive shots of one scene that are generated together as one Seedance video, the shots' frames
    as keyframes: at most 30 s and 30 reference images each, at least two shots (one shot is just its own video).
    A block is keyed by its first shot: "scene:<shot_id>"."""
    blocks: list[dict[str, Any]] = []
    for sc in board["scenes"]:
        run: list[dict[str, Any]] = []

        def close() -> None:
            if len(run) >= 2:
                blocks.append({"key": f"scene:{run[0]['id']}", "scene_id": sc["id"], "shots": [s["id"] for s in run],
                               "seconds": sum(int(s["duration_seconds"]) for s in run)})
            run.clear()

        for item in board["shots"]:
            if item.get("scene_id") != sc["id"]:
                continue
            if not _scene_eligible(board, item):
                close()
                continue
            candidate = [*run, item]
            frames = len(candidate) if keyframes(board["brief"]) else 0
            images = frames + len(_first_appearance(board, candidate)) + sum(len(user_references(s)[0]) for s in candidate)
            if (sum(int(s["duration_seconds"]) for s in candidate) > MAX_SCENE_SECONDS or images > MAX_VIDEO_REFERENCES
                    or len(_scene_videos(candidate)) > MAX_SCENE_REFERENCE_VIDEOS):
                close()
            run.append(item)
        close()
    return blocks


STYLE_LINE = re.compile(r"^\s*(style:.*?)(?=\s+camera:|\n|$)", re.IGNORECASE | re.DOTALL)


def _hoisted_style(prompts: list[str]) -> tuple[str, list[str]]:
    """The "Style: ..." part every shot starts with (its own line, or up to "Camera:"), said once for the scene."""
    found = [STYLE_LINE.match(p or "") for p in prompts]
    styles = {m.group(1).strip() for m in found if m}
    if len(styles) == 1 and all(found):
        return styles.pop(), [(p or "")[m.end():].strip() for p, m in zip(prompts, found)]
    return "", [(p or "").strip() for p in prompts]


def _scene_spec(board: dict[str, Any], block: dict[str, Any], ratio: str, audio: dict[str, Any]) -> dict[str, Any]:
    """One video for several shots (Seedance 2.5 keyframes): each shot's frame is the keyframe at the moment the
    shot starts, the elements' sheets follow in order of first appearance, then the user's reference images."""
    brief = board["brief"]
    shots = [shot(board, sid) for sid in block["shots"]]
    elements_in_order = _first_appearance(board, shots)
    user_images = [a for s in shots for a in user_references(s)[0]]
    if not keyframes(brief):
        return _sheet_scene_spec(board, block, shots, elements_in_order, user_images, ratio, audio)
    frames = [f"frame:{s['id']}" for s in shots]
    deps = [*frames, *(f"element:{e}" for e in elements_in_order)]
    count = len(frames)
    names: dict[str, str] = {}
    lines = [f"Use @Image1 through @Image{count} as keyframes in that order.", "Use @Image1 as the first frame.",
             "It defines the opening of Shot 1: composition, subject positions, poses, props and camera direction."]
    starts, cursor = [], 0
    for s in shots:
        starts.append(cursor)
        cursor += int(s["duration_seconds"])
    for n in range(2, count + 1):
        lines.append(f"@Image{n} defines the opening of Shot {n}, reached with a hard cut at {starts[n - 1]}s.")
    for n, element_id in enumerate(elements_in_order, start=count + 1):
        item = element(board, element_id)
        names[element_id] = f"{item['name']} (@Image{n})"
        lines.append(reference_line(n, item, templates(brief)))
    for n in range(count + len(elements_in_order) + 1, count + len(elements_in_order) + 1 + len(user_images)):
        lines.append(f"@Image{n} is a reference the user gave: use it only for style, composition and mood.")
    user_videos = _scene_videos(shots)
    for n, asset_id in enumerate(user_videos, start=1):
        used_by = [str(i) for i, s in enumerate(shots, start=1) if asset_id in user_references(s)[1]]
        lines.append(f"@Video{n} is a reference video the user gave for Shot {', '.join(used_by)}: use it only for its "
                     f"motion, camera movement and pacing, not its people or place.")
    style, bodies = _hoisted_style([compile_mentions(s["video_prompt"], names)[0] for s in shots])
    parts = ["\n".join(lines)]
    if style:
        parts.append(style)
    version = templates(brief)
    if version >= 2 and scene_setting(board, block["scene_id"]):
        parts.append(scene_setting(board, block["scene_id"]))
    for n, (s, body, start) in enumerate(zip(shots, bodies, starts), start=1):
        end = start + int(s["duration_seconds"])
        parts.append(f"Shot {n} | {start}-{end}s\n{body}" + ("\nHard cut." if n < count else ""))
    title = (scene(board, block["scene_id"]) or {}).get("title") or block["scene_id"]
    prompt = _with_look("\n\n".join(parts), brief)
    if version >= 2:
        prompt += "\n\n" + clip_constraints(board)
    return {
        "kind": "video", "label": f"{title} — video scene ({count} shot, {cursor}s)",
        "prompt": prompt, "deps": deps, "shots": list(block["shots"]),
        "params": {"aspectRatio": ratio, "duration": cursor, **audio, "omniReferenceTaskType": "reference"},
        **({"extra_images": user_images} if user_images else {}), **({"ref_videos": user_videos} if user_videos else {}),
    }


def _sheet_scene_spec(board: dict[str, Any], block: dict[str, Any], shots: list[dict[str, Any]], elements_in_order: list[str],
                      user_images: list[str], ratio: str, audio: dict[str, Any]) -> dict[str, Any]:
    """One clip for several shots made from the sheets alone, the way Dramagic writes a storyboard: references with
    what to take from each, the scene's time and light, every shot's [Layout] / [Action] with its timing, constraints."""
    brief = board["brief"]
    user_videos = _scene_videos(shots)

    def used_by(asset_id: str) -> str:
        return "Shot " + ", ".join(str(i) for i, s in enumerate(shots, start=1) if asset_id in user_references(s)[1])

    legend, names = _sheet_legend(board, elements_in_order, len(user_images), user_videos, used_by)
    style, bodies = _hoisted_style([compile_mentions(s["video_prompt"], names)[0] for s in shots])
    starts, cursor = [], 0
    for s in shots:
        starts.append(cursor)
        cursor += int(s["duration_seconds"])
    parts = [legend, style, scene_setting(board, block["scene_id"]),
             f"One clip of {len(shots)} shots with a hard cut between them, each shot at its time below:"]
    for n, (s, body, start) in enumerate(zip(shots, bodies, starts), start=1):
        parts.append(f"Shot {n} | {start}-{start + int(s['duration_seconds'])}s\n{body}")
    title = (scene(board, block["scene_id"]) or {}).get("title") or block["scene_id"]
    prompt = _with_look("\n\n".join(p for p in parts if p), brief) + "\n\n" + clip_constraints(board)
    return {
        "kind": "video", "label": f"{title} — video scene ({len(shots)} shot, {cursor}s)",
        "prompt": prompt, "deps": [f"element:{e}" for e in elements_in_order], "shots": list(block["shots"]),
        "params": {"aspectRatio": ratio, "duration": cursor, **audio, "omniReferenceTaskType": "reference"},
        **({"extra_images": user_images} if user_images else {}), **({"ref_videos": user_videos} if user_videos else {}),
    }


def spec_sig(spec: dict[str, Any]) -> str:
    basis = {k: spec[k] for k in ("kind", "prompt", "params", "deps")}
    for key in ("photos", "extra_images", "ref_videos"):  # only when present, so older specs keep their signature
        if spec.get(key):
            basis[key] = spec[key]
    return hashlib.sha256(json.dumps(basis, sort_keys=True).encode("utf-8")).hexdigest()


def needs_generation(board: dict[str, Any], key: str, specs: Optional[dict] = None, memo: Optional[dict] = None) -> bool:
    specs = media_specs(board) if specs is None else specs
    memo = {} if memo is None else memo
    if key in memo:
        return memo[key]
    spec = specs[key]
    media = board["media"].get(key) or {}
    if media.get("uploaded") and media.get("status") == TERMINAL_OK:
        memo[key] = False  # the user's own file: it stands until they replace or regenerate it
        return False
    needed = (
        media.get("status") != TERMINAL_OK
        or media.get("done_spec_sig") != spec_sig(spec)
        or any(needs_generation(board, dep, specs, memo) for dep in spec["deps"])
        or media.get("dep_assets") != [(board["media"].get(dep) or {}).get("asset_id") for dep in spec["deps"]]
    )
    memo[key] = needed
    return needed


AUDIO_TIER = 9  # voiceover and music go last, once the clips they are laid over exist


def tier(key: str, specs: Optional[dict[str, dict[str, Any]]] = None) -> int:
    """Generation order: everything a key depends on runs in an earlier tier (a continuation after
    the clip it extends, an edit after the clip it edits), and audio after all of it."""
    if key.startswith(("vo:", "audio:")):
        return AUDIO_TIER
    if specs is None or key not in specs:
        return {"element": 0, "audio": 0, "vo": 0, "frame": 1, "video": 2, "scene": 2, "edit": 3}[key.split(":", 1)[0]]
    return 1 + max((tier(dep, specs) for dep in specs[key]["deps"]), default=-1)


# ---------------------------------------------------------------- views


def summary_for_agent(board: dict[str, Any]) -> dict[str, Any]:
    """Compact board for the model: content plus media state, without runtime noise."""
    specs = media_specs(board)
    memo: dict[str, bool] = {}

    def media_state(key: str) -> str:
        if key not in specs:
            return "n/a"  # e.g. the frame of a continuation shot
        media = board["media"].get(key) or {}
        status = media.get("status") or "none"
        if status == TERMINAL_OK and needs_generation(board, key, specs, memo):
            return "stale"
        return status

    view = copy.deepcopy({k: board[k] for k in ("brief", "concepts", "script", "scenes")})
    view["research"] = [{"id": r["id"], "query": r["query"], "notes": r["notes"][:1500]} for r in board["research"]]
    view["elements"] = [{**e, "image": media_state(f"element:{e['id']}")} for e in board["elements"]]
    view["shots"] = [{**s, "frame": media_state(f"frame:{s['id']}"), "video": media_state(f"video:{s['id']}")}
                     for s in board["shots"]]
    # several shots generated as one video (keyframes); its result is cut back into the shots' videos
    view["scene_videos"] = [{**b, "video": media_state(b["key"])} for b in scene_blocks(board)]
    view["audio"] = {**empty_audio(), **copy.deepcopy(board.get("audio") or {}),
                     "voiceover_media": media_state("audio:voiceover"), "music_media": media_state("audio:music")}
    view["pending_requests"] = [
        {"id": r["id"], "status": r["status"], "items": r["items"], "estimate": r.get("estimate")}
        for r in board["requests"] if r["status"] in ("pending", "running")
    ]
    return view


def view_for_ui(project_id: str, board: dict[str, Any]) -> dict[str, Any]:
    specs = media_specs(board)
    memo: dict[str, bool] = {}
    # In a request that is waiting or running: its Generate buttons are disabled so it is never asked for twice.
    queued = {k for r in board["requests"] if r["status"] in ("pending", "running", "needs_credits") for k in r["items"]}
    media_view = {}
    for key, spec in specs.items():
        media = board["media"].get(key) or {}
        status = media.get("status") or "none"
        media_view[key] = {
            "kind": spec["kind"],
            "label": spec["label"],
            "prompt": spec["prompt"],
            "status": status,
            "stale": status == TERMINAL_OK and needs_generation(board, key, specs, memo),
            "error": media.get("error"),
            "in_request": key in queued,
            # Generated media are nexoclip assets owned by the user; the browser loads them
            # from nexoclip's own /api/assets/<id>/download with its session.
            "asset_id": media.get("asset_id") if status == TERMINAL_OK else None,
            "uploaded": bool(media.get("uploaded")) and status == TERMINAL_OK,  # the user's own file
            # Every result so far, newest first; "outdated" ones were made from an older prompt.
            "takes": [{"asset_id": t["asset_id"], "generated_at": t.get("generated_at"), "uploaded": bool(t.get("uploaded")),
                       "from_scene": t.get("from_scene"),
                       "outdated": not t.get("uploaded") and t.get("spec_sig") != spec_sig(spec)}
                      for t in reversed(media.get("takes") or [])],
        }
    return {**{k: board[k] for k in (*CONTENT_KEYS, "requests", "renders", "video_notes")}, "media": media_view,
            "scene_blocks": scene_blocks(board), "version": board.get("version")}
