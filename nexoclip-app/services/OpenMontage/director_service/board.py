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
from typing import Any, Callable, Optional, TypeVar

from director_service.db import Jsonb, notify, tx

ASPECT_RATIOS = ("16:9", "9:16", "1:1")
RESOLUTIONS = ("480p", "720p", "1080p")
ELEMENT_KINDS = ("character", "location", "prop")
# The look of the whole video. Asked up front: it decides how every sheet, frame and clip is rendered.
# The creative brief beyond the one-line summary (all free text, empty when unknown).
BRIEF_DETAILS = ("goal", "audience", "platform", "key_message", "product", "tone", "references", "cta", "must_have",
                 "avoid")
LOOKS = ("realistic", "3d_animation", "anime", "illustration", "other")
MIN_SHOT_SECONDS, MAX_SHOT_SECONDS = 4, 15
TERMINAL_OK = "succeeded"
CONTENT_KEYS = ("brief", "concepts", "research", "elements", "script", "scenes", "shots", "audio")
RUNTIME_KEYS = ("media", "requests", "renders")

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
        "brief": {"summary": "", "look": "", "aspect_ratio": "16:9", "duration_seconds": None, "style": "",
                  "resolution": "720p", "generate_audio": True, **{k: "" for k in BRIEF_DETAILS}},
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


def look_rendering(brief: dict[str, Any]) -> str:
    return LOOK_RENDERING.get(brief.get("look") or "", "")


def sheet_prompt(item: dict[str, Any], style: str, look: str = "") -> str:
    if not look:  # project from before looks were asked: unchanged prompt
        prompt = SHEET_TEMPLATES[item["kind"]].format(description=item["description"])
        return prompt + (f"\nStyle: {style}" if style else "")
    interaction = (item.get("interaction") or "").strip() if item["kind"] == "prop" else ""
    template = PROP_IN_USE if interaction else LOOK_SHEET_TEMPLATES[item["kind"]]
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
MAX_VIDEO_REFERENCES = 30  # Seedance 2.5 reference_image limit


def video_references(board: dict[str, Any], shot: dict[str, Any]) -> list[str]:
    """The shot's frame, then the reference sheet of every element in it."""
    sheets = [f"element:{e}" for e in shot.get("element_ids", []) if element(board, e)]
    return [f"frame:{shot['id']}", *sheets][:MAX_VIDEO_REFERENCES]


def reference_legend(board: dict[str, Any], deps: list[str], user_images: int = 0, user_videos: int = 0) -> str:
    lines = ["References:", "@Image1 is the opening frame of this shot: start the clip from it."]
    for n, dep in enumerate(deps[1:], start=2):
        item = element(board, dep.split(":", 1)[1])
        lines.append(f"@Image{n} is the reference sheet of {item['name']} ({item['kind']}), several views of it on one "
                     f"image: show {KEEP_IDENTITY.get(item['kind'], KEEP_IDENTITY['prop'])}. Never show the sheet layout itself.")
    for n in range(len(deps) + 1, len(deps) + 1 + user_images):
        lines.append(f"@Image{n} is a reference the user gave for this shot: follow its style, composition and mood.")
    for n in range(1, user_videos + 1):
        lines.append(f"@Video{n} is a reference video the user gave: follow its motion, camera movement and pacing.")
    return "\n".join(lines) if len(lines) > 2 else ""


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
        prompt = sheet_prompt(item, style, look)
        photos = item.get("photos") or []
        if photos:
            prompt += "\n" + FROM_PHOTOS.format(kind=item["kind"], keep=PHOTO_KEEP.get(item["kind"], PHOTO_KEEP["prop"]))
        specs[f"element:{item['id']}"] = {
            "kind": "image", "label": f"{item['name']} — reference sheet", "prompt": prompt, "deps": [],
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


def _shot_specs(board: dict[str, Any], item: dict[str, Any], specs: dict[str, dict[str, Any]], ratio: str,
                audio: dict[str, Any]) -> None:
    brief = board["brief"]
    refs = [f"element:{e}" for e in item.get("element_ids", []) if element(board, e)]
    images, videos = user_references(item)
    frame_prompt = _with_look(item["frame_prompt"], brief)
    if images:
        frame_prompt += f"\nThe last {len(images)} reference image(s) are the user's references: follow their style and composition."
    specs[f"frame:{item['id']}"] = {
        "kind": "image", "label": f"{item['title']} — frame", "prompt": frame_prompt, "deps": refs,
        "params": {"aspectRatio": ratio},
        **({"extra_images": images} if images else {}),
    }
    deps = video_references(board, item)[:MAX_VIDEO_REFERENCES - len(images)]
    legend = reference_legend(board, deps, len(images), len(videos))
    video_prompt = _with_look(item["video_prompt"], brief)
    specs[f"video:{item['id']}"] = {
        "kind": "video", "label": f"{item['title']} — video",
        "prompt": f"{video_prompt}\n{legend}" if legend else video_prompt,
        "deps": deps,
        "params": {"aspectRatio": ratio, "duration": int(item["duration_seconds"]), **audio},
        **({"extra_images": images} if images else {}), **({"ref_videos": videos} if videos else {}),
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
    needed = (
        media.get("status") != TERMINAL_OK
        or media.get("done_spec_sig") != spec_sig(spec)
        or any(needs_generation(board, dep, specs, memo) for dep in spec["deps"])
        or media.get("dep_assets") != [(board["media"].get(dep) or {}).get("asset_id") for dep in spec["deps"]]
    )
    memo[key] = needed
    return needed


def tier(key: str, specs: Optional[dict[str, dict[str, Any]]] = None) -> int:
    """Generation order: everything a key depends on runs in an earlier tier (a continuation after
    the clip it extends, an edit after the clip it edits)."""
    if specs is None or key not in specs:
        return {"element": 0, "audio": 0, "vo": 0, "frame": 1, "video": 2, "edit": 3}[key.split(":", 1)[0]]
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
            # Generated media are nexoclip assets owned by the user; the browser loads them
            # from nexoclip's own /api/assets/<id>/download with its session.
            "asset_id": media.get("asset_id") if status == TERMINAL_OK else None,
            # Every result so far, newest first; "outdated" ones were made from an older prompt.
            "takes": [{"asset_id": t["asset_id"], "generated_at": t.get("generated_at"),
                       "outdated": t.get("spec_sig") != spec_sig(spec)}
                      for t in reversed(media.get("takes") or [])],
        }
    return {**{k: board[k] for k in (*CONTENT_KEYS, "requests", "renders")}, "media": media_view, "version": board.get("version")}
