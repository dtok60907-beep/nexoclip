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
LOOKS = ("realistic", "3d_animation", "anime", "illustration", "other")
MIN_SHOT_SECONDS, MAX_SHOT_SECONDS = 4, 15
TERMINAL_OK = "succeeded"
CONTENT_KEYS = ("brief", "concepts", "research", "elements", "script", "scenes", "shots")
RUNTIME_KEYS = ("media", "requests", "renders")

T = TypeVar("T")


def empty_board() -> dict[str, Any]:
    return {
        "brief": {"summary": "", "look": "", "aspect_ratio": "16:9", "duration_seconds": None, "style": "",
                  "resolution": "720p", "generate_audio": False},
        "concepts": {"options": [], "recommended": None, "chosen": None, "locked": False},
        "research": [],
        "elements": [],
        "script": None,
        "scenes": [],
        "shots": [],
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


def _with_look(prompt: str, brief: dict[str, Any]) -> str:
    rendering = look_rendering(brief)
    return f"{prompt}\nLook: {rendering}" if rendering else prompt


def media_specs(board: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """What should exist, keyed "element:<id>", "frame:<shot>", "video:<shot>"."""
    brief = board["brief"]
    ratio = brief.get("aspect_ratio") or "16:9"
    style = (brief.get("style") or "").strip()
    look = brief.get("look") or ""
    specs: dict[str, dict[str, Any]] = {}
    for item in board["elements"]:
        specs[f"element:{item['id']}"] = {
            "kind": "image", "label": f"{item['name']} — reference sheet", "prompt": sheet_prompt(item, style, look), "deps": [],
            "params": {"aspectRatio": "16:9"},
        }
    for item in board["shots"]:
        refs = [f"element:{e}" for e in item.get("element_ids", []) if element(board, e)]
        specs[f"frame:{item['id']}"] = {
            "kind": "image", "label": f"{item['title']} — frame", "prompt": _with_look(item["frame_prompt"], brief), "deps": refs,
            "params": {"aspectRatio": ratio},
        }
        specs[f"video:{item['id']}"] = {
            "kind": "video", "label": f"{item['title']} — video", "prompt": _with_look(item["video_prompt"], brief),
            "deps": [f"frame:{item['id']}"],
            "params": {"aspectRatio": ratio, "duration": int(item["duration_seconds"]),
                       "resolution": brief.get("resolution") or "720p",
                       "generateAudio": bool(brief.get("generate_audio"))},
        }
    return specs


def spec_sig(spec: dict[str, Any]) -> str:
    basis = {k: spec[k] for k in ("kind", "prompt", "params", "deps")}
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


def tier(key: str) -> int:
    return {"element": 0, "frame": 1, "video": 2}[key.split(":", 1)[0]]


# ---------------------------------------------------------------- views


def summary_for_agent(board: dict[str, Any]) -> dict[str, Any]:
    """Compact board for the model: content plus media state, without runtime noise."""
    specs = media_specs(board)
    memo: dict[str, bool] = {}

    def media_state(key: str) -> str:
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
        }
    return {**{k: board[k] for k in (*CONTENT_KEYS, "requests", "renders")}, "media": media_view, "version": board.get("version")}
