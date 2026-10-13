"""The Director agent: an LLM that edits the project board through tools.

There is no fixed pipeline. Each user message starts a turn: the model sees
the conversation and the current board, calls whatever tools it needs (brief,
concepts, web research, script, elements, shots, generation requests), and
ends with a chat reply. It cannot spend credits on its own (request_generation
prices a request and the user approves it) and cannot change anything the
user locked. The same validated edit functions back the user's direct edits
in the board, and every change is recorded as a new board version.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Callable

from director_service import billing, board as boards, generation, llm, nexoclip, skills
from director_service.store import add_llm_cost, append_chat, append_llm_log, read_chat

MAX_STEPS = 12
HISTORY_ENTRIES = 40
BOARD_CHARS = 30000
_ID = re.compile(r"^[a-z0-9_]{2,40}$")

INSTRUCTIONS = """You are the AI Director inside nexoclip, a video creation studio. You chat with the user and
build their video on a shared project board using tools. You decide what to do next; there is no fixed pipeline.

What you can do (tools):
- update_brief: purpose/summary, look, aspect ratio, target duration, visual style, resolution, native audio on/off.
  look is the rendering of the whole video: realistic (live-action, real people), 3d_animation, anime, illustration
  or other (then describe it in style). ALWAYS settle the look first: if the user has not said it, ask before creating
  any element or shot (e.g. "Mau realistis seperti syuting asli, atau animasi 3D / anime / ilustrasi?"), and do not
  assume. If they already said it ("realistis", "kayak film asli", "anime"), just set it. upsert_element and set_shots
  are refused until the look is set. Every sheet, frame and clip then follows it: with realistic, characters are real
  people and props and places are real, never cartoon or 3D.
- set_concepts / choose_concept: 2-3 distinct creative directions (title, logline, approach, why it works) with your
  recommendation; record the one the user picks. Offer concepts before the script for a new idea, unless the user
  already has a clear concept or asks to skip.
- web_research: real web search for references, facts, trends (costs a little; use when it actually helps).
- write_script: the story/beat script as text.
- upsert_element / remove_element: every character, location and prop the story needs. Each is generated as ONE
  reference sheet image (character: front/3-4/side/back + expressions; location: 4 angles; prop: multi-view), and
  the sheet layout is added automatically, so the description only describes the subject itself: purely visual and
  specific (age, ethnicity, face, hair, build, wardrobe, palette; architecture, materials, light, time of day; shape,
  material, branding). Keep every detail the user gave, verbatim where possible.
  A prop sheet shows the object alone, without people. Only when the story needs a character physically using it (worn,
  held in a specific way, operated) set interaction, e.g. "worn on the wrist of Dimas"; otherwise leave it empty.
  One element = one subject, never a group: "four friends" are four characters, each with their own sheet. Make a
  separate location for every distinct place or set (and for a changed state of it, e.g. "studio" and "studio,
  wrecked"), and a separate prop for the advertised product and for every object that recurs across shots. There is no
  upper limit: create as many as the brief needs (e.g. 3 characters, 5 locations, 10 props). Every new or changed
  element's sheet is generated automatically at the end of the turn.
- set_scenes: group the story into scenes (id, title, description: where + what happens). Every shot belongs to a
  scene via scene_id; shots are numbered per scene (1.1, 1.2, 2.1 ...). Scenes alone are not a shot list: when you
  plan the visuals (or the user asks for shots / a storyboard), also call set_shots in the same turn. Never say shots
  exist unless set_shots succeeded.
- set_shots / update_shot / remove_shot: the ordered shot list. Each shot is one generated video clip of 4-15 s with
  a frame_prompt (the first frame as a still image) and a video_prompt (motion, camera, action, sound for that clip).
  List the element_ids that appear in the shot: their reference images are passed to the frame generation, and the
  frame is passed to the video, so looks stay consistent. Restate each character's key look in the prompts too.
  On-screen text/title cards are not generated as clips; note them in the script instead.
- Asset reference sheets (element:<id>) are generated AUTOMATICALLY at the end of every turn in which you create or
  change elements: no request or approval is needed. Use request_generation with force only to redo an up-to-date sheet.
- request_generation: prepare paid generation of frames and videos (frame:<shot_id>, video:<shot_id>). It adds
  missing dependencies and returns a credit estimate; the user must approve that card in the UI. Never say something
  was generated until the board shows it succeeded.

The user can also edit the board directly, lock items ("locked": true) and restore older versions. Treat locked items
as approved and final: tools refuse to change them, so ask the user to unlock in the board if a change is needed.
Messages like "[user edited: ...]" in the history are the user's own edits; respect them.

- render_video: join the shots into the final MP4 in timeline order (free, no credits). Each shot uses its video,
  or its frame held still when it has no video yet; shots with neither are skipped. Use it when the user asks for
  the final video / export / render. It runs in the background and shows its own card with progress and download.

Not available yet: voiceover/narration, music, transitions or captions in the render. Say so honestly; do not promise them.

How to work:
- Reply in the user's language (default Indonesian, casual, like a creative director). Keep replies short:
  a few sentences or a compact list. After using tools, say briefly what you changed and what you suggest next.
  Formatting: write titles of the film, ad or brand in *italics* (e.g. *Shore Thing*), use **bold** sparingly for the
  one or two key words, and plain short paragraphs or "- " lists; no headings or tables.
- If the request is vague (e.g. just a greeting), talk first and ask what they want to make. Ask at most 2-3
  questions at a time and offer defaults. When you have enough, act: you can fill in several parts in one turn.
- The user's explicit wishes beat any skill's process: if they say "just make it" / "langsung bikinin", fill gaps with
  sensible defaults (state them briefly) and build everything they asked for in this turn instead of asking first.
- Follow the user's lead: they can jump anywhere (skip research, give their own script, change one shot, regenerate
  one image, go back and change the concept). Change only what they asked and keep the rest intact.
- Never invent costs, results, sources or progress. Use the board below as the source of truth.
- When the user confirms something (a concept, the script) and asks you to continue, take the next steps yourself in
  that turn (e.g. after the script: elements, scenes and shots), then summarise.
- Finish what you start in the same turn: never end a turn by announcing what you are about to do. Do not narrate
  reading skills; just use them.

Skills (read_skill): craft guides from the OpenMontage project. Before doing a kind of work for the first time in a
conversation (intake on a vague brief, concept, script, shot plan, element prompts, video prompts, review), read the
matching skill and apply it. Some tools need their skill read in the same turn (if not, the guide is returned to you
and you must call the tool again): update_brief with a
summary or set_concepts needs idea-director, write_script needs script-director, upsert_element
needs image-gen-usage, and set_shots or a changed frame_prompt/video_prompt needs seedance-prompting.
These guides were written for a different agent that runs local tools, files, stages and checkpoints: take the
creative craft, and ignore instructions about tools, files, checkpoints, stages, audio or rendering you do not have.
Available skills:
"""


def _tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    # strict=False: most fields are optional, which strict mode does not allow.
    return {"type": "function", "name": name, "description": description, "strict": False,
            "parameters": {"type": "object", "properties": properties, "required": required, "additionalProperties": False}}


SHOT_FIELDS = {
    "id": {"type": "string", "description": "lowercase snake_case id, stable across edits"},
    "title": {"type": "string"},
    "description": {"type": "string", "description": "what happens, for the storyboard"},
    "scene_id": {"type": "string", "description": "id of the scene this shot belongs to"},
    "duration_seconds": {"type": "integer", "minimum": boards.MIN_SHOT_SECONDS, "maximum": boards.MAX_SHOT_SECONDS},
    "element_ids": {"type": "array", "items": {"type": "string"}},
    "frame_prompt": {"type": "string"},
    "video_prompt": {"type": "string"},
}

SCENE_FIELDS = {
    "id": {"type": "string", "description": "lowercase snake_case id"},
    "title": {"type": "string"},
    "description": {"type": "string", "description": "location + what happens"},
}

CONCEPT_FIELDS = {
    "id": {"type": "string", "description": "lowercase snake_case id"},
    "title": {"type": "string"},
    "logline": {"type": "string", "description": "one or two sentences"},
    "approach": {"type": "string", "description": "look, tone, structure"},
    "why": {"type": "string", "description": "why it fits the brief"},
}

TOOLS = [
    _tool("update_brief", "Set or change brief fields. Omit fields you are not changing.", {
        "summary": {"type": "string"},
        "aspect_ratio": {"type": "string", "enum": list(boards.ASPECT_RATIOS)},
        "duration_seconds": {"type": "integer", "minimum": 4, "maximum": 600},
        "look": {"type": "string", "enum": list(boards.LOOKS), "description": "rendering of the whole video; ask the user if unknown"},
        "style": {"type": "string", "description": "visual style applied to every image"},
        "resolution": {"type": "string", "enum": list(boards.RESOLUTIONS)},
        "generate_audio": {"type": "boolean", "description": "native ambient audio in video clips"},
    }, []),
    _tool("set_concepts", "Offer 2-3 creative directions and recommend one (replaces the current options).", {
        "options": {"type": "array", "items": {"type": "object", "properties": CONCEPT_FIELDS,
                                               "required": list(CONCEPT_FIELDS), "additionalProperties": False}},
        "recommended": {"type": "string", "description": "id of the recommended option"},
    }, ["options", "recommended"]),
    _tool("choose_concept", "Record the concept the user picked.", {"id": {"type": "string"}}, ["id"]),
    _tool("web_research", "Search the web and save concise notes with sources to the board.", {
        "query": {"type": "string"},
    }, ["query"]),
    _tool("write_script", "Write or replace the script.", {
        "title": {"type": "string"},
        "text": {"type": "string"},
    }, ["title", "text"]),
    _tool("upsert_element", "Create or update a character, location or prop.", {
        "id": {"type": "string", "description": "lowercase snake_case id"},
        "kind": {"type": "string", "enum": list(boards.ELEMENT_KINDS)},
        "name": {"type": "string"},
        "description": {"type": "string", "description": "visual prompt for its reference image"},
        "interaction": {"type": "string", "description": "props only, and only if needed: how a character uses it"},
    }, ["id", "kind", "name", "description"]),
    _tool("remove_element", "Remove an element.", {"id": {"type": "string"}}, ["id"]),
    _tool("set_scenes", "Replace the ordered scene list (shots keep their scene_id).", {
        "scenes": {"type": "array", "items": {"type": "object", "properties": SCENE_FIELDS,
                                              "required": list(SCENE_FIELDS), "additionalProperties": False}},
    }, ["scenes"]),
    _tool("set_shots", "Replace the whole ordered shot list. Media of shots whose id is kept are preserved.", {
        "shots": {"type": "array", "items": {"type": "object", "properties": SHOT_FIELDS,
                                             "required": [k for k in SHOT_FIELDS if k != "scene_id"], "additionalProperties": False}},
    }, ["shots"]),
    _tool("update_shot", "Change some fields of one shot, or move it with position (0-based).", {
        "id": {"type": "string"},
        **{k: v for k, v in SHOT_FIELDS.items() if k != "id"},
        "position": {"type": "integer", "minimum": 0},
    }, ["id"]),
    _tool("remove_shot", "Remove a shot.", {"id": {"type": "string"}}, ["id"]),
    _tool("read_skill", "Load a craft guide from the skills list.", {
        "name": {"type": "string", "enum": list(skills.SKILLS)},
    }, ["name"]),
    _tool("render_video", "Render the final MP4 from the shots in timeline order (free).", {}, []),
    _tool("request_generation", "Prepare paid generation (needs the user's approval in the UI).", {
        "items": {"type": "array", "items": {"type": "string"}, "description": "e.g. element:maya, frame:shot_01, video:shot_01"},
        "force": {"type": "boolean", "description": "regenerate even if already up to date"},
        "note": {"type": "string", "description": "one line for the user about what this is for"},
    }, ["items"]),
]


class ToolError(ValueError):
    pass


@dataclass(frozen=True)
class Ctx:
    project_id: str
    author: str  # "agent" or "user"

    def guard(self, item: Any, what: str) -> None:
        """The agent may not touch anything the user locked."""
        if self.author == "agent" and isinstance(item, dict) and item.get("locked"):
            raise ToolError(f"{what} is locked by the user; ask them to unlock it in the board first")

    def update(self, change: Callable[[dict[str, Any]], Any], summary: str | Callable[[Any], str]) -> Any:
        """Apply a change as one new version. summary may be a function of the change's result
        (for labels that need names only known inside the change)."""
        if not callable(summary):
            return boards.update_board(self.project_id, change, author=self.author, summary=summary)
        holder: dict[str, str] = {}

        def run(board: dict[str, Any]) -> Any:
            result = change(board)
            holder["summary"] = summary(result)
            return result

        return boards.update_board(self.project_id, run, author=self.author, summary=lambda: holder["summary"])


def _check_id(value: str) -> str:
    if not _ID.match(value or ""):
        raise ToolError(f"invalid id {value!r}: use 2-40 chars of a-z, 0-9, _")
    return value


def _clean_shot(raw: dict[str, Any], board: dict[str, Any]) -> dict[str, Any]:
    shot = {k: raw.get(k) for k in SHOT_FIELDS}
    _check_id(shot["id"])
    for key in ("title", "description", "frame_prompt", "video_prompt"):
        if not str(shot.get(key) or "").strip():
            raise ToolError(f"shot {shot['id']}: {key} is required")
        shot[key] = str(shot[key]).strip()
    try:
        duration = int(shot.get("duration_seconds") or 0)
    except (TypeError, ValueError):
        duration = 0
    if not boards.MIN_SHOT_SECONDS <= duration <= boards.MAX_SHOT_SECONDS:
        raise ToolError(f"shot {shot['id']}: duration_seconds must be {boards.MIN_SHOT_SECONDS}-{boards.MAX_SHOT_SECONDS}")
    shot["duration_seconds"] = duration
    ids = list(dict.fromkeys(shot.get("element_ids") or []))
    missing = [e for e in ids if not boards.element(board, e)]
    if missing:
        raise ToolError(f"shot {shot['id']}: unknown element_ids {missing}; create them with upsert_element first")
    shot["element_ids"] = ids
    scene_id = shot.get("scene_id") or None
    if board["scenes"]:
        if not scene_id or not boards.scene(board, scene_id):
            raise ToolError(f"shot {shot['id']}: scene_id must be one of {[s['id'] for s in board['scenes']]}")
    elif scene_id:
        raise ToolError(f"shot {shot['id']}: create scenes with set_scenes before using scene_id")
    shot["scene_id"] = scene_id
    shot["locked"] = bool(raw.get("locked"))
    return shot


def _same_shot(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return all(a.get(k) == b.get(k) for k in SHOT_FIELDS)


# ---------------------------------------------------------------- tool implementations


def _update_brief(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    fields = {k: v for k, v in args.items()
              if k in ("summary", "look", "aspect_ratio", "duration_seconds", "style", "resolution", "generate_audio") and v is not None}
    if "look" in fields and fields["look"] not in boards.LOOKS:
        raise ToolError("look must be one of " + ", ".join(boards.LOOKS))
    if fields.get("aspect_ratio") and fields["aspect_ratio"] not in boards.ASPECT_RATIOS:
        raise ToolError("aspect_ratio must be one of " + ", ".join(boards.ASPECT_RATIOS))
    if fields.get("resolution") and fields["resolution"] not in boards.RESOLUTIONS:
        raise ToolError("resolution must be one of " + ", ".join(boards.RESOLUTIONS))

    def change(board: dict[str, Any]) -> dict:
        ctx.guard(board["brief"], "the brief")
        board["brief"].update(fields)
        return dict(board["brief"])

    brief = ctx.update(change, "Memperbarui brief")
    return {"ok": True, "brief": brief}, "Memperbarui brief"


def _set_concepts(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    options = []
    for raw in args.get("options") or []:
        option = {k: str(raw.get(k) or "").strip() for k in CONCEPT_FIELDS}
        _check_id(option["id"])
        if not option["title"] or not option["logline"]:
            raise ToolError(f"concept {option['id']}: title and logline are required")
        options.append(option)
    if not 1 <= len(options) <= 4:
        raise ToolError("give 2-3 concept options")
    if len({o["id"] for o in options}) != len(options):
        raise ToolError("concept ids must be unique")
    recommended = args.get("recommended")
    if recommended not in {o["id"] for o in options}:
        raise ToolError("recommended must be one of the option ids")

    def change(board: dict[str, Any]) -> None:
        ctx.guard(board["concepts"], "the chosen concept")
        board["concepts"] = {"options": options, "recommended": recommended, "chosen": None, "locked": False}

    ctx.update(change, f"Menyusun {len(options)} konsep")
    return {"ok": True}, f"Menyusun {len(options)} konsep"


def _choose_concept(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    concept_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        concepts = board["concepts"]
        ctx.guard(concepts, "the chosen concept")
        option = next((o for o in concepts["options"] if o["id"] == concept_id), None)
        if option is None:
            raise ToolError(f"no concept {concept_id!r}")
        concepts["chosen"] = concept_id
        return option["title"]

    title = ctx.update(change, lambda title: f"Memilih konsep: {title}")
    return {"ok": True}, f"Memilih konsep: {title}"


def _web_research(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    query = str(args.get("query") or "").strip()
    if not query:
        raise ToolError("query is required")
    brief = boards.read_board(ctx.project_id)["brief"].get("summary") or ""
    text, usage = llm.chat([
        {"role": "system", "content": "You are a research assistant for a video director. Search the web and write concise, "
                                      "factual notes (max ~250 words) with the most useful findings for making the video. "
                                      "Only state what the sources support."},
        {"role": "user", "content": f"Project brief: {brief}\n\nResearch question: {query}"},
    ], web_search=True, max_tokens=2000)
    _bill(ctx.project_id, "web_research", usage)
    sources = list(dict.fromkeys(usage.get("cited_urls") or []))[:10]
    entry = {"id": f"res_{uuid.uuid4().hex[:6]}", "query": query, "notes": text.strip(), "sources": sources}
    ctx.update(lambda b: b["research"].append(entry), f"Riset: {query}")
    return {"ok": True, "notes": entry["notes"], "sources": sources}, f"Riset: {query}"


def _write_script(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    title, text = str(args.get("title") or "").strip(), str(args.get("text") or "").strip()
    if not text:
        raise ToolError("text is required")

    def change(board: dict[str, Any]) -> None:
        ctx.guard(board["script"], "the script")
        board["script"] = {"title": title, "text": text, "locked": bool((board["script"] or {}).get("locked"))}

    ctx.update(change, "Menulis naskah")
    return {"ok": True}, "Menulis naskah"


NEEDS_LOOK = ("the look is not set: ask the user first whether the video is realistic (live-action, real people) or "
              "3D animation, anime or illustration, then update_brief(look=...) before creating elements or shots")


def _require_look(ctx: Ctx) -> None:
    """The agent may not design assets or shots before the look of the video is settled."""
    if ctx.author == "agent" and not boards.read_board(ctx.project_id)["brief"].get("look"):
        raise ToolError(NEEDS_LOOK)


def _upsert_element(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    _require_look(ctx)
    item = {"id": _check_id(args.get("id")), "kind": args.get("kind"), "name": str(args.get("name") or "").strip(),
            "description": str(args.get("description") or "").strip()}
    if item["kind"] == "prop":
        item["interaction"] = str(args.get("interaction") or "").strip()
    if item["kind"] not in boards.ELEMENT_KINDS:
        raise ToolError("kind must be character, location or prop")
    if not item["name"] or len(item["description"]) < 20:
        raise ToolError("name and a visual description (20+ chars) are required")
    labels = {"character": "karakter", "location": "lokasi", "prop": "properti"}

    def change(board: dict[str, Any]) -> bool:
        existing = boards.element(board, item["id"])
        if existing:
            ctx.guard(existing, f"element {item['id']}")
            existing.update(item)
            return False
        board["elements"].append({**item, "locked": False})
        return True

    created = ctx.update(change, f"{labels[item['kind']].capitalize()}: {item['name']}")
    return {"ok": True, "created": created}, f"{'Menambah' if created else 'Mengubah'} {labels[item['kind']]}: {item['name']}"


def _remove_element(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    element_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        item = boards.element(board, element_id)
        if not item:
            raise ToolError(f"no element {element_id!r}")
        ctx.guard(item, f"element {element_id}")
        users = [s["id"] for s in board["shots"] if element_id in s.get("element_ids", []) and s.get("locked")]
        if users and ctx.author == "agent":
            raise ToolError(f"element {element_id} is used by locked shots {users}")
        board["elements"].remove(item)
        for shot in board["shots"]:
            shot["element_ids"] = [e for e in shot.get("element_ids", []) if e != element_id]
        return item["name"]

    name = ctx.update(change, lambda name: f"Menghapus elemen: {name}")
    return {"ok": True}, f"Menghapus elemen: {name}"


def _set_scenes(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    scenes = []
    for raw in args.get("scenes") or []:
        item = {k: str(raw.get(k) or "").strip() for k in SCENE_FIELDS}
        _check_id(item["id"])
        if not item["title"]:
            raise ToolError(f"scene {item['id']}: title is required")
        scenes.append(item)
    ids = [s["id"] for s in scenes]
    if len(ids) != len(set(ids)):
        raise ToolError("scene ids must be unique")

    def change(board: dict[str, Any]) -> int:
        orphans = [s["id"] for s in board["shots"] if s.get("scene_id") and s["scene_id"] not in ids]
        if orphans:
            raise ToolError(f"shots {orphans} still use removed scenes; move or remove them first")
        if not scenes and board["shots"] and any(s.get("scene_id") for s in board["shots"]):
            raise ToolError("cannot remove all scenes while shots use them")
        board["scenes"] = scenes
        return len(scenes)

    count = ctx.update(change, f"Menyusun {len(scenes)} scene")
    return {"ok": True, "scenes": count}, f"Menyusun {count} scene"


def _set_shots(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    _require_look(ctx)

    def change(board: dict[str, Any]) -> int:
        current = {s["id"]: s for s in board["shots"]}
        shots = []
        for raw in args.get("shots") or []:
            existing = current.get(raw.get("id"))
            shot = _clean_shot({**raw, "locked": bool(existing and existing.get("locked"))}, board)
            if existing and existing.get("locked") and not _same_shot(shot, existing):
                ctx.guard(existing, f"shot {existing['id']}")
            shots.append(shot)
        kept = {s["id"] for s in shots}
        for gone in (s for s in board["shots"] if s["id"] not in kept):
            ctx.guard(gone, f"shot {gone['id']}")
        ids = [s["id"] for s in shots]
        if len(ids) != len(set(ids)):
            raise ToolError("shot ids must be unique")
        board["shots"] = shots
        return len(shots)

    count = ctx.update(change, f"Menyusun {len(args.get('shots') or [])} shot")
    return {"ok": True, "shots": count}, f"Menyusun {count} shot"


def _update_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    shot_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        current = boards.shot(board, shot_id)
        if not current:
            raise ToolError(f"no shot {shot_id!r}")
        ctx.guard(current, f"shot {shot_id}")
        patch = {k: v for k, v in args.items() if k in SHOT_FIELDS and k != "id" and v is not None}
        updated = _clean_shot({**current, **patch}, board)
        index = board["shots"].index(current)
        board["shots"][index] = updated
        position = args.get("position")
        if position is not None:
            board["shots"].pop(index)
            board["shots"].insert(max(0, min(int(position), len(board["shots"]))), updated)
        return updated["title"]

    title = ctx.update(change, lambda title: f"Mengubah shot: {title}")
    return {"ok": True}, f"Mengubah shot: {title}"


def _remove_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    shot_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        current = boards.shot(board, shot_id)
        if not current:
            raise ToolError(f"no shot {shot_id!r}")
        ctx.guard(current, f"shot {shot_id}")
        board["shots"].remove(current)
        return current["title"]

    title = ctx.update(change, lambda title: f"Menghapus shot: {title}")
    return {"ok": True}, f"Menghapus shot: {title}"


def _timeline_order(board: dict[str, Any]) -> list[dict[str, Any]]:
    """Shots as the timeline shows them: by scene, then shots without a known scene."""
    scene_ids = [sc["id"] for sc in board["scenes"]]
    if not scene_ids:
        return list(board["shots"])
    ordered = [sh for sid in scene_ids for sh in board["shots"] if sh.get("scene_id") == sid]
    return ordered + [sh for sh in board["shots"] if sh.get("scene_id") not in scene_ids]


def _move_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """Move a shot to another place in the timeline (0-based). Dropped among another scene's
    shots, it joins that scene, so the timeline shows it exactly where it was dropped."""
    shot_id = args.get("id")
    try:
        to_index = int(args.get("to_index"))
    except (TypeError, ValueError) as exc:
        raise ToolError("to_index must be a number") from exc

    def change(board: dict[str, Any]) -> str:
        current = boards.shot(board, shot_id)
        if not current:
            raise ToolError(f"no shot {shot_id!r}")
        ctx.guard(current, f"shot {shot_id}")
        order = [sh for sh in _timeline_order(board) if sh is not current]
        index = max(0, min(to_index, len(order)))
        order.insert(index, current)
        neighbour = order[index - 1] if index > 0 else (order[1] if len(order) > 1 else None)
        if board["scenes"] and neighbour is not None and neighbour.get("scene_id"):
            current["scene_id"] = neighbour["scene_id"]
        board["shots"] = order
        return current["title"]

    title = ctx.update(change, lambda title: f"Memindah urutan shot: {title}")
    return {"ok": True}, f"Memindah urutan shot: {title}"


def _request_generation(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    keys = list(dict.fromkeys(str(k).strip() for k in args.get("items") or [] if str(k).strip()))
    if not keys:
        raise ToolError("items is required")
    force = bool(args.get("force"))
    if ctx.author == "agent" and generation.is_auto(keys) and not force:
        # New or changed sheets are generated automatically at the end of the turn.
        return ({"ok": True, "status": "asset reference sheets are generated automatically after this turn; no approval needed"},
                "Reference sheet aset akan dibuat otomatis")
    auto = generation.is_auto(keys)
    try:
        request = generation.create_request(ctx.project_id, keys, force=force, note=str(args.get("note") or ""), auto=auto)
    except generation.GenerationError as exc:
        raise ToolError(str(exc)) from exc
    est = request["estimate"]
    parts = []
    if est["images"]:
        parts.append(f"{est['images']} gambar")
    if est["videos"]:
        parts.append(f"{est['videos']} video ({est['video_seconds']} detik)")
    result = {"ok": True, "request_id": request["id"], "items": request["items"], "estimate": est, "auto": auto,
              "status": "generating now (asset sheets need no approval)" if auto else "waiting for the user to approve the card in the UI"}
    return result, f"Menyiapkan generate: {' + '.join(parts)}"


def _render_video(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    from director_service import session  # session imports this module

    try:
        item = session.start_render(ctx.project_id)
    except (session.Busy, session.InvalidAction) as exc:
        raise ToolError(str(exc)) from exc
    note = f"{len(item['shots'])} shot"
    if item["stills"]:
        note += f", {item['stills']} masih frame diam (belum ada video)"
    if item["skipped"]:
        note += f", {item['skipped']} dilewati (belum ada frame/video)"
    return ({"ok": True, "render_id": item["id"], "shots": len(item["shots"]), "stills": item["stills"],
             "skipped": item["skipped"], "status": "rendering in the background; the render card shows progress and the download"},
            f"Render video final ({note})")


def _read_skill(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    name = str(args.get("name") or "")
    try:
        text = skills.read(name)
    except KeyError as exc:
        raise ToolError(str(exc)) from exc
    note = ("Craft reference written for another agent. Use its creative guidance. Its process (stages, gates, "
            "checkpoints, 'ask before starting') never overrides what the user explicitly asked for in this conversation.")
    return {"ok": True, "skill": name, "note": note, "content": text}, f"Membaca skill: {name}"


def _set_lock(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: lock (approve) or unlock an item. target: brief | script | concepts | element:<id> | shot:<id>."""
    target, locked = str(args.get("target") or ""), bool(args.get("locked"))

    def change(board: dict[str, Any]) -> str:
        if target in ("brief", "script", "concepts"):
            item, name = board[target], {"brief": "brief", "script": "naskah", "concepts": "konsep"}[target]
        elif target.startswith("element:"):
            item = boards.element(board, target.split(":", 1)[1])
            name = item and item["name"]
        elif target.startswith("shot:"):
            item = boards.shot(board, target.split(":", 1)[1])
            name = item and item["title"]
        else:
            item, name = None, None
        if not item:
            raise ToolError(f"nothing to lock at {target!r}")
        item["locked"] = locked
        return name

    name = ctx.update(change, lambda name: f"{'Mengunci' if locked else 'Membuka kunci'} {name}")
    return {"ok": True}, f"{'Mengunci' if locked else 'Membuka kunci'} {name}"


HANDLERS: dict[str, Callable[[Ctx, dict[str, Any]], tuple[dict, str]]] = {
    "read_skill": _read_skill,
    "update_brief": _update_brief,
    "set_concepts": _set_concepts,
    "choose_concept": _choose_concept,
    "web_research": _web_research,
    "write_script": _write_script,
    "upsert_element": _upsert_element,
    "remove_element": _remove_element,
    "set_scenes": _set_scenes,
    "set_shots": _set_shots,
    "update_shot": _update_shot,
    "remove_shot": _remove_shot,
    "request_generation": _request_generation,
    "render_video": _render_video,
}

# What the user may change directly from the board (same validation as the agent).
USER_EDITS: dict[str, Callable[[Ctx, dict[str, Any]], tuple[dict, str]]] = {
    "update_brief": _update_brief,
    "choose_concept": _choose_concept,
    "write_script": _write_script,
    "upsert_element": _upsert_element,
    "remove_element": _remove_element,
    "update_shot": _update_shot,
    "remove_shot": _remove_shot,
    "move_shot": _move_shot,
    "set_scenes": _set_scenes,
    "set_lock": _set_lock,
}


def user_request(project_id: str, items: list[str], force: bool = False) -> dict[str, Any]:
    """Generation prepared from the board (e.g. a shot's Generate button): same estimate card, same approval."""
    result, label = _request_generation(Ctx(project_id, "user"), {"items": items, "force": force})
    append_chat(project_id, "user", label, kind="request", meta={"tool": "request_generation", "request_id": result["request_id"]})
    return result


def apply_user_edit(project_id: str, tool: str, args: dict[str, Any]) -> str:
    handler = USER_EDITS.get(tool)
    if handler is None:
        raise ToolError(f"cannot edit with {tool!r}")
    _, label = handler(Ctx(project_id, "user"), args)
    # Shown in the chat and fed back to the agent, so it knows what the user changed.
    append_chat(project_id, "user", label, kind="edit", meta={"tool": tool})
    return label


# ---------------------------------------------------------------- the turn


def _bill(project_id: str, purpose: str, usage: dict[str, Any]) -> None:
    billing.charge_llm(project_id, llm.model_name(), usage)
    add_llm_cost(project_id, float(usage.get("cost") or 0.0))
    append_llm_log(project_id, {"purpose": purpose, "model": llm.model_name(), "cost_usd": usage.get("cost"),
                                "input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens")})


def _instructions(project_id: str) -> str:
    board_json = json.dumps(boards.summary_for_agent(boards.read_board(project_id)), ensure_ascii=False)
    if len(board_json) > BOARD_CHARS:
        board_json = board_json[:BOARD_CHARS] + " ...(truncated)"
    return f"{INSTRUCTIONS}{skills.index_text()}\n\nCURRENT PROJECT BOARD (JSON):\n{board_json}"


def build_history(project_id: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for entry in read_chat(project_id, limit=HISTORY_ENTRIES):
        kind, text = entry.get("kind"), entry.get("text") or ""
        if kind == "edit":
            items.append({"role": "user", "content": f"[user edited: {text}]"})
        elif kind == "card":
            continue  # a UI card for something the tool log already covers
        elif kind == "request" and entry.get("role") == "user":
            items.append({"role": "user", "content": f"[user prepared generation: {text}]"})
        elif entry.get("role") == "user":
            items.append({"role": "user", "content": text})
        elif kind in ("activity", "request"):
            items.append({"role": "assistant", "content": f"[tool used: {text}]"})
        elif kind in ("generation", "error"):
            items.append({"role": "assistant", "content": f"[system: {text}]"})
        else:
            items.append({"role": "assistant", "content": text})
    return items


def _args(call: dict[str, Any]) -> dict[str, Any]:
    try:
        args = json.loads(call["arguments"] or "{}")
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}


# Creative output the agent may only write with the matching OpenMontage skill in context
# (the model reliably skips "please read the guide" instructions otherwise).
REQUIRED_SKILLS: dict[str, tuple[tuple[str, ...], Callable[[dict[str, Any]], bool]]] = {
    "update_brief": (("idea-director",), lambda a: bool(a.get("summary"))),
    "set_concepts": (("idea-director",), lambda a: True),
    "write_script": (("script-director",), lambda a: True),
    "upsert_element": (("image-gen-usage",), lambda a: True),
    "set_shots": (("seedance-prompting",), lambda a: True),
    "update_shot": (("seedance-prompting",), lambda a: bool(a.get("frame_prompt") or a.get("video_prompt"))),
}


def missing_skills(call: dict[str, Any], skills_read: set[str]) -> list[str]:
    rule = REQUIRED_SKILLS.get(call["name"])
    if not rule or not rule[1](_args(call)):
        return []
    return [name for name in rule[0] if name not in skills_read]


# Which board card to show in the chat after a turn that changed it.
CARD_FOR_TOOL = {
    "update_brief": "brief", "set_concepts": "concepts", "choose_concept": "concepts", "write_script": "script",
    "upsert_element": "assets", "remove_element": "assets", "set_scenes": "shots", "set_shots": "shots",
    "update_shot": "shots", "remove_shot": "shots", "web_research": "research",
}
CARD_ORDER = ("brief", "concepts", "research", "script", "assets", "shots")


MAX_NUDGES = 2


def _call_key(call: dict[str, Any]) -> str:
    target = _args(call).get("id")
    return f"{call['name']}:{target}" if target else call["name"]


def _call_label(call: dict[str, Any]) -> str:
    args = _args(call)
    target = args.get("name") or args.get("title") or args.get("id")
    return f"{call['name']}({target})" if target else call["name"]


def run_turn(project_id: str) -> str:
    """Answer the latest user message, using tools as needed. Returns the reply text."""
    input_items: list[dict[str, Any]] = build_history(project_id)
    skills_read: set[str] = set()
    cards: set[str] = set()
    refused: dict[str, str] = {}  # calls held back for a skill and not yet redone: key -> label
    nudges = 0
    previous_id = None

    def show_cards() -> None:
        for card in CARD_ORDER:
            if card in cards:
                append_chat(project_id, "assistant", card, kind="card", meta={"card": card})

    for _ in range(MAX_STEPS):
        step = llm.respond(input_items, instructions=_instructions(project_id), tools=TOOLS,
                           previous_response_id=previous_id)
        _bill(project_id, "agent", step["usage"])
        if not step["calls"] and refused and nudges < MAX_NUDGES:
            # The model is about to wrap up (often claiming the work is done) while calls it made were
            # held back for their skill guide. Drop that reply and have it redo them first.
            nudges += 1
            input_items = [{"role": "user", "content": (
                "[system] Not done yet: these calls were NOT applied because their guide had to load first: "
                + "; ".join(refused.values()) + ". The guides are loaded now. Call them again now, then reply.")}]
            previous_id = step["id"]
            continue
        if not step["calls"]:
            show_cards()
            reply = step["text"].strip() or "Oke."
            append_chat(project_id, "assistant", reply, kind="message")
            return reply
        if step["text"].strip():
            append_chat(project_id, "assistant", step["text"].strip(), kind="message")
        outputs = []
        for call in step["calls"]:
            missing = missing_skills(call, skills_read)
            if missing:
                # Load the guide for the model instead of only refusing: it then retries with it in
                # context, rather than ending the turn with "I'll read the guide first".
                loaded = {}
                for name in missing:
                    skill_result = _execute(project_id, {"name": "read_skill", "arguments": json.dumps({"name": name})})
                    if skill_result.get("ok"):
                        skills_read.add(name)
                        loaded[name] = skill_result["content"]
                result = {"ok": False,
                          "error": f"not applied yet: {call['name']} needs the {', '.join(missing)} guide, loaded below. "
                                   f"Apply it and call {call['name']} again in this turn.",
                          "skill_content": loaded}
                refused[_call_key(call)] = _call_label(call)
            else:
                result = _execute(project_id, call)
                if call["name"] == "read_skill" and result.get("ok"):
                    skills_read.add(result["skill"])
                if result.get("ok") and call["name"] in CARD_FOR_TOOL:
                    cards.add(CARD_FOR_TOOL[call["name"]])
                if result.get("ok"):
                    refused.pop(_call_key(call), None)
            outputs.append({"type": "function_call_output", "call_id": call["call_id"],
                            "output": json.dumps(result, ensure_ascii=False)})
        input_items = outputs
        previous_id = step["id"]
    show_cards()
    reply = "Aku berhenti dulu di sini supaya tidak kebablasan. Cek board-nya, lalu bilang mau lanjut ke mana."
    append_chat(project_id, "assistant", reply, kind="message")
    return reply


def _execute(project_id: str, call: dict[str, Any]) -> dict[str, Any]:
    handler = HANDLERS.get(call["name"])
    if handler is None:
        return {"ok": False, "error": f"unknown tool {call['name']}"}
    try:
        args = json.loads(call["arguments"] or "{}")
        if not isinstance(args, dict):
            raise ToolError("arguments must be an object")
        result, label = handler(Ctx(project_id, "agent"), args)
    except (ToolError, json.JSONDecodeError, TypeError, ValueError, llm.LLMError, nexoclip.BridgeError) as exc:
        return {"ok": False, "error": str(exc)}
    meta = {"tool": call["name"]}
    if call["name"] == "request_generation" and result.get("request_id"):
        meta["request_id"] = result["request_id"]
        append_chat(project_id, "assistant", label, kind="request", meta=meta)
    else:
        append_chat(project_id, "assistant", label, kind="activity", meta=meta)
    return result
