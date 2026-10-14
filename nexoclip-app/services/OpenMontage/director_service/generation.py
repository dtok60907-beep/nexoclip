"""Paid image/video generation, always behind an explicit user approval.

The agent can only *request* generation: a request lists media keys, pulls in
the dependencies they need (a frame needs its elements' images, a video its
frame), and gets a credit estimate. Nothing is submitted until the user
approves that request in the UI. Runs go tier by tier (elements, frames,
videos) through the nexoclip bridge, so each tier can reference the previous
tier's results, and every submit carries an idempotency key so a restart or a
retry never pays twice for the same media.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
import uuid
from typing import Any, Optional

from director_service import billing, nexoclip
from director_service.board import (
    TERMINAL_OK,
    media_specs,
    needs_generation,
    read_board,
    shot,
    spec_sig,
    tier,
    update_board,
)
from director_service.store import now_iso

POLL_SECONDS = 5.0
JOB_TIMEOUT_SECONDS = 1800
TRUST_TIMEOUT_SECONDS = 180
OPEN_STATUSES = ("pending", "running")


class GenerationError(RuntimeError):
    pass


def _closure(board: dict[str, Any], keys: list[str], specs: dict[str, dict[str, Any]], force: bool) -> list[str]:
    """The requested keys plus every dependency that still needs generating, in tier order."""
    wanted: set[str] = set()
    memo: dict[str, bool] = {}

    def visit(key: str, explicit: bool) -> None:
        if key in wanted:
            return
        if (board["media"].get(key) or {}).get("uploaded") and not (explicit and force):
            return  # the user's own file: neither it nor what it was meant to be made from is generated
        if (explicit and force) or needs_generation(board, key, specs, memo):
            wanted.add(key)
        for dep in specs[key]["deps"]:
            visit(dep, False)

    for key in keys:
        visit(key, True)
    return sorted(wanted, key=lambda k: (tier(k, specs), list(specs).index(k)))


AUTO_PREFIX = "element:"


def is_auto(keys: list[str]) -> bool:
    """Reference sheets are cheap and needed before anything else: they run without an approval step."""
    return bool(keys) and all(k.startswith(AUTO_PREFIX) for k in keys)


def open_keys(board: dict[str, Any]) -> set[str]:
    return {k for r in board["requests"] if r["status"] in OPEN_STATUSES for k in r["items"]}


def create_request(project_id: str, keys: list[str], *, force: bool = False, note: str = "", auto: bool = False) -> dict[str, Any]:
    """Validate, expand and price a generation request.

    There is at most one pending request that waits for approval: it works like
    a cart, so a new one absorbs whatever the previous unapproved one asked for.
    Automatic (asset-sheet) requests stand alone and never join that cart.
    """
    board = read_board(project_id)
    specs = media_specs(board)
    unknown = [k for k in keys if k not in specs]
    if unknown:
        raise GenerationError(f"unknown media: {', '.join(unknown)}. Valid keys look like element:<id>, frame:<shot_id>, video:<shot_id>, scene:<first shot_id of a scene video>, edit:<shot_id> (after setting edit_instruction).")
    open_request = None if auto else next((r for r in board["requests"] if r["status"] == "pending" and not r.get("auto")), None)
    if open_request:
        keys = list(dict.fromkeys([*(k for k in open_request["requested"] if k in specs), *keys]))
        force = force or bool(open_request.get("force"))
        note = "; ".join(n for n in (open_request.get("note"), note) if n)
    items = _closure(board, keys, specs, force)
    if not auto:
        # Sheets never wait in the approval cart: they are generated automatically on their own.
        items = [k for k in items if not k.startswith(AUTO_PREFIX)]
    if not items:
        raise GenerationError("nothing to approve: it is up to date, or only asset sheets (those are generated automatically)")

    bridge = billing.bridge_for(project_id)
    estimate: dict[str, Any] = {
        "available": bridge is not None,
        "images": sum(1 for k in items if specs[k]["kind"] == "image"),
        "videos": sum(1 for k in items if specs[k]["kind"] == "video"),
        "audio": sum(1 for k in items if specs[k]["kind"] == "audio"),
        # an edit keeps its source's length (duration -1), so it is left out of this count
        "video_seconds": sum(max(0, specs[k]["params"].get("duration", 0)) for k in items if specs[k]["kind"] == "video"),
        "credits": 0.0,
        "usd": 0.0,
    }
    per_item: dict[str, Any] = {}
    if bridge is not None:
        for key in items:
            price = bridge.estimate(kind=specs[key]["kind"], prompt=specs[key]["prompt"], parameters=specs[key]["params"])
            per_item[key] = price
            estimate["credits"] += price["credits"]
            estimate["usd"] += price["usd"]
    estimate["credits"] = round(estimate["credits"], 2)
    estimate["usd"] = round(estimate["usd"], 4)

    request = {
        "id": f"req_{uuid.uuid4().hex[:8]}",
        "status": "pending",
        "items": items,
        "requested": keys,
        "force": force,
        "auto": auto,
        "note": note,
        "estimate": estimate,
        "item_estimates": per_item,
        "spec_sigs": {k: spec_sig(specs[k]) for k in items},
        "created_at": now_iso(),
    }

    def save(b: dict[str, Any]) -> None:
        for old in b["requests"]:
            if old["status"] == "pending" and not old.get("auto") and not auto:
                old["status"] = "superseded"
        b["requests"].append(request)

    update_board(project_id, save)
    return request


def find_request(board: dict[str, Any], request_id: str) -> Optional[dict[str, Any]]:
    return next((r for r in board["requests"] if r["id"] == request_id), None)


def set_request_status(project_id: str, request_id: str, status: str, **extra: Any) -> dict[str, Any]:
    def change(board: dict[str, Any]) -> dict[str, Any]:
        request = find_request(board, request_id)
        request.update(status=status, updated_at=now_iso(), **extra)
        return dict(request)

    return update_board(project_id, change)


def request_is_current(board: dict[str, Any], request: dict[str, Any]) -> bool:
    """False if the agent changed a requested prompt after the user saw the estimate."""
    specs = media_specs(board)
    return all(k in specs and spec_sig(specs[k]) == request["spec_sigs"].get(k) for k in request["items"])


# ---------------------------------------------------------------- running


def _first_output(generation: dict[str, Any], prefix: str) -> str:
    outputs = generation.get("outputs") or []
    preferred = [o for o in outputs if str(o.get("contentType") or "").startswith(prefix)] or outputs
    if not preferred or not preferred[0].get("assetId"):
        raise GenerationError("generation finished without media output")
    return str(preferred[0]["assetId"])


def _error_text(generation: dict[str, Any]) -> str:
    error = generation.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "generation failed")
    return str(error or f"generation {generation.get('status')}")


def _set_media(project_id: str, key: str, **fields: Any) -> None:
    def change(board: dict[str, Any]) -> None:
        board["media"].setdefault(key, {}).update(fields)

    update_board(project_id, change)


MAX_TAKES = 12


def _take(asset_id: str, spec_sig: Optional[str], dep_assets: list, generated_at: Optional[str]) -> dict[str, Any]:
    return {"asset_id": asset_id, "spec_sig": spec_sig, "dep_assets": dep_assets, "generated_at": generated_at}


def _record_take(project_id: str, key: str, *, asset_id: str, spec_sig: Optional[str], dep_assets: list,
                 generated_at: str, uploaded: bool = False, from_scene: Optional[str] = None) -> None:
    """A new result becomes the active take; earlier takes stay selectable (board.media[key].takes)."""
    def change(board: dict[str, Any]) -> None:
        media = board["media"].setdefault(key, {})
        takes = list(media.get("takes") or [])
        if not takes and media.get("asset_id") and media.get("done_spec_sig"):
            # media from before takes existed: keep its last result as the first take
            takes.append(_take(media["asset_id"], media["done_spec_sig"], media.get("dep_assets") or [],
                               media.get("generated_at")))
        takes = [t for t in takes if t["asset_id"] != asset_id] + [{**_take(asset_id, spec_sig, dep_assets, generated_at),
                                                                     **({"uploaded": True} if uploaded else {}),
                                                                     **({"from_scene": from_scene} if from_scene else {})}]
        media.update(status=TERMINAL_OK, asset_id=asset_id, error=None, done_spec_sig=spec_sig, dep_assets=dep_assets,
                     generated_at=generated_at, takes=takes[-MAX_TAKES:], uploaded=uploaded)

    update_board(project_id, change)


def _edited_take(project_id: str, key: str, asset_id: str) -> None:
    """An edited clip becomes the shot's active video take (the edit made from its current spec)."""
    board = read_board(project_id)
    video_key = "video:" + key.split(":", 1)[1]
    spec = media_specs(board).get(video_key)
    current = board["media"].get(video_key) or {}
    if spec is None:
        return
    _record_take(project_id, video_key, asset_id=asset_id, spec_sig=current.get("done_spec_sig") or spec_sig(spec),
                 dep_assets=current.get("dep_assets") or [], generated_at=now_iso())


def _split_scene(project_id: str, bridge: nexoclip.Bridge, key: str, asset_id: str) -> None:
    """A scene video (several shots in one Seedance generation) is cut at the shots' timecodes, and each piece
    becomes that shot's video take, so the timeline, trims, extends, edits and the render work per shot as before.
    The cut follows the planned durations, scaled if the clip came out a little longer or shorter."""
    from director_service import render

    board = read_board(project_id)
    specs = media_specs(board)
    planned = [(sid, int(sh["duration_seconds"])) for sid in (specs.get(key) or {}).get("shots", [])
               if (sh := shot(board, sid))]
    if not planned:
        return
    downloaded = bridge.download(asset_id)
    with tempfile.TemporaryDirectory(prefix="director-scene-") as tmp:
        source = os.path.join(tmp, "scene.mp4")
        with open(source, "wb") as fh:
            fh.write(downloaded.content)
        length = render.duration_of(source) or sum(d for _, d in planned)
        scale = length / sum(d for _, d in planned)
        cursor = 0.0
        for index, (sid, seconds) in enumerate(planned):
            part = os.path.join(tmp, f"{sid}.mp4")
            keep = seconds * scale if index < len(planned) - 1 else max(0.5, length - cursor)
            render._run(["-y", "-ss", f"{cursor:.3f}", "-t", f"{keep:.3f}", "-i", source, "-map", "0:v", "-map", "0:a?",
                         "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "192k",
                         "-movflags", "+faststart", part])
            cursor += keep
            with open(part, "rb") as fh:
                piece = bridge.upload_render(content=fh.read(), filename=f"{sid}.mp4")
            board = read_board(project_id)
            spec = media_specs(board).get(f"video:{sid}")
            if spec is None:
                continue
            dep_assets = [(board["media"].get(dep) or {}).get("asset_id") for dep in spec["deps"]]
            _record_take(project_id, f"video:{sid}", asset_id=piece, spec_sig=spec_sig(spec), dep_assets=dep_assets,
                         generated_at=now_iso(), from_scene=key)


def _run_audio(project_id: str, bridge: nexoclip.Bridge, key: str, spec: dict[str, Any], media: dict[str, Any]) -> None:
    """Voiceover / music: nexoclip generates it within the call and returns the stored asset."""
    sig = spec_sig(spec)
    attempt = int(media.get("attempt") or 0) + 1
    _set_media(project_id, key, status="running", attempt=attempt, error=None, pending_spec_sig=sig, pending_dep_assets=[])
    try:
        result = bridge.generate_audio(text=spec["prompt"], parameters=spec["params"],
                                       idempotency_key=f"{project_id}:{key}:{sig[:24]}:{attempt}")
    except nexoclip.BridgeError as exc:
        _set_media(project_id, key, status="failed", error=str(exc)[:300])
        return
    _record_take(project_id, key, asset_id=result["asset_id"], spec_sig=sig, dep_assets=[], generated_at=now_iso())


TRUST_RETRY_SECONDS = (2, 4, 8, 16)  # BytePlus rate-limits CreateAsset (HTTP 429) when images come in quick succession


def _start_trust(bridge: nexoclip.Bridge, asset_id: str) -> str:
    """Start one trust, waiting and retrying while BytePlus says it is busy (429 / 5xx)."""
    for pause in (*TRUST_RETRY_SECONDS, None):
        try:
            return bridge.trust(asset_id, "start")
        except nexoclip.BridgeError as exc:
            if pause is None or not (exc.status == 429 or exc.status >= 500):
                raise
            time.sleep(pause * RETRY_SCALE)
    raise AssertionError("unreachable")


RETRY_SCALE = 1.0  # tests set 0


def _trust(bridge: nexoclip.Bridge, asset_ids: list[str]) -> list[str]:
    """Make these images BytePlus trusted assets (Seedance refuses images with faces otherwise) and wait until they
    are active. Returns the ones trusted here, to remove again after the videos: the BytePlus account holds only a
    few dozen trusted assets, so they are borrowed per generation. A failure leaves the image untrusted."""
    started, waiting = [], set()
    for asset_id in dict.fromkeys(asset_ids):
        try:
            if bridge.trust(asset_id, "status") == "active":
                continue
            status = _start_trust(bridge, asset_id)
        except nexoclip.BridgeError:
            continue
        started.append(asset_id)
        if status != "active":
            waiting.add(asset_id)
    deadline = time.monotonic() + TRUST_TIMEOUT_SECONDS
    while waiting and time.monotonic() < deadline:
        time.sleep(POLL_SECONDS)
        for asset_id in sorted(waiting):
            try:
                status = bridge.trust(asset_id, "status")
            except nexoclip.BridgeError:
                continue
            if status != "processing":
                waiting.discard(asset_id)
    return started


def _loans(project_id: str, add: list[str] = (), drop: list[str] = ()) -> dict[str, str]:
    """The project's open trust loans, written down so a crash cannot leave them taking BytePlus slots forever."""
    def change(board: dict[str, Any]) -> dict[str, str]:
        loans = dict(board.get("trust_loans") or {})
        loans.update({a: loans.get(a) or now_iso() for a in add})
        for a in drop:
            loans.pop(a, None)
        board["trust_loans"] = loans
        return loans

    return update_board(project_id, change)


def _untrust(project_id: str, bridge: nexoclip.Bridge, asset_ids: list[str]) -> None:
    returned = []
    for asset_id in asset_ids:
        try:
            bridge.trust(asset_id, "remove")
            returned.append(asset_id)
        except nexoclip.BridgeError:
            pass  # stays on the loan list and is given back by the next sweep
    if returned:
        _loans(project_id, drop=returned)


def release_loans(project_id: str, bridge: Optional[nexoclip.Bridge] = None) -> int:
    """Give back every trust this project still holds (after a run, or one a crash left behind)."""
    loans = list(read_board(project_id).get("trust_loans") or {})
    bridge = bridge or (billing.bridge_for(project_id) if loans else None)
    if loans and bridge is not None:
        _untrust(project_id, bridge, loans)
    return len(loans)


# Seedance 2.5's limits for a reference video: at least 407,696 pixels a frame, 24-60 fps, 2-30 s.
MIN_VIDEO_PIXELS, MIN_FPS, MAX_FPS, MAX_REFERENCE_SECONDS = 409_600, 24, 60, 30


def video_shape(path: str) -> tuple[tuple[int, int], float]:
    """((width, height), fps) of a video file, zeros when unknown."""
    import re
    import subprocess

    from director_service import render

    probe = subprocess.run([render.ffmpeg_exe(), "-hide_banner", "-nostdin", "-i", path], capture_output=True, text=True)
    line = next((ln for ln in probe.stderr.splitlines() if "Video:" in ln), "")
    size = re.search(r"\b(\d{2,5})x(\d{2,5})\b", line)
    fps = re.search(r"([\d.]+) fps", line)
    return (int(size.group(1)), int(size.group(2))) if size else (0, 0), float(fps.group(1)) if fps else 0.0


def _fit_reference_video(project_id: str, bridge: nexoclip.Bridge, asset_id: str) -> str:
    """The user's reference video as Seedance accepts it: scaled up when it is too small, frame rate brought into
    24-60 fps, cut to 30 s. A fitted copy is uploaded once and remembered; a video that fits is sent as it is."""
    from director_service import render

    known = (read_board(project_id)["media"].get(f"fit:{asset_id}") or {}).get("asset_id")
    if known:
        return known
    downloaded = bridge.download(asset_id)
    with tempfile.TemporaryDirectory(prefix="director-ref-") as tmp:
        source = os.path.join(tmp, "ref.mp4")
        with open(source, "wb") as fh:
            fh.write(downloaded.content)
        (width, height), fps = video_shape(source)
        length = render.duration_of(source)
        small = 0 < width * height < MIN_VIDEO_PIXELS
        odd_fps = fps and not MIN_FPS <= fps <= MAX_FPS
        if not (small or odd_fps or length > MAX_REFERENCE_SECONDS):
            fitted = asset_id
        else:
            scale = (MIN_VIDEO_PIXELS / (width * height)) ** 0.5 if small else 1.0
            filters = [f"scale={int(width * scale / 2 + 1) * 2}:{int(height * scale / 2 + 1) * 2}:flags=lanczos"] if small else []
            if odd_fps:
                filters.append(f"fps={min(MAX_FPS, max(MIN_FPS, fps))}")
            out = os.path.join(tmp, "fitted.mp4")
            render._run(["-y", "-i", source, "-t", str(MAX_REFERENCE_SECONDS), *(["-vf", ",".join(filters)] if filters else []),
                         "-map", "0:v", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                         "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", out])
            with open(out, "rb") as fh:
                fitted = bridge.upload_render(content=fh.read(), filename=f"reference-{asset_id[:8]}.mp4")
    _set_media(project_id, f"fit:{asset_id}", asset_id=fitted)
    return fitted


def _run_tier(project_id: str, bridge: nexoclip.Bridge, keys: list[str]) -> None:
    borrowed: list[str] = []
    try:
        _run_tier_keys(project_id, bridge, keys, borrowed)
    finally:
        _untrust(project_id, bridge, borrowed)


def _run_tier_keys(project_id: str, bridge: nexoclip.Bridge, keys: list[str], borrowed: list[str]) -> None:
    submitted: list[str] = []
    submit_error: Optional[Exception] = None
    for key in keys:
        board = read_board(project_id)
        spec = media_specs(board)[key]
        media = board["media"].get(key) or {}
        dep_assets = [(board["media"].get(dep) or {}).get("asset_id") for dep in spec["deps"]]
        if any(not a for a in dep_assets):
            _set_media(project_id, key, status="failed", error="a reference it depends on was not generated")
            continue
        sig = spec_sig(spec)
        if (media.get("status") == "running" and media.get("generation_id")
                and media.get("pending_spec_sig") == sig and media.get("pending_dep_assets") == dep_assets):
            submitted.append(key)  # submitted before a restart: poll it instead of paying twice
            continue
        if spec["kind"] == "audio":
            _run_audio(project_id, bridge, key, spec, media)
            continue
        params = dict(spec["params"])
        # Clips a key builds on (extend / edit) go as reference videos, everything else as images,
        # the user's own photos first.
        try:
            user_videos = [_fit_reference_video(project_id, bridge, a) for a in spec.get("ref_videos", [])]
        except Exception as exc:  # noqa: BLE001 - a broken upload fails this one item, not the run
            _set_media(project_id, key, status="failed", error=f"video referensi tidak bisa disiapkan: {exc}"[:300])
            continue
        videos = [*(a for dep, a in zip(spec["deps"], dep_assets) if dep.startswith("video:")), *user_videos]
        images = [*spec.get("photos", []), *(a for dep, a in zip(spec["deps"], dep_assets) if not dep.startswith("video:")),
                  *spec.get("extra_images", [])]
        people = [a for dep, a in zip(spec["deps"], dep_assets) if dep in spec.get("people_deps", ())]
        if people:
            fresh = [a for a in _trust(bridge, people) if a not in borrowed]
            if fresh:
                _loans(project_id, add=fresh)
                borrowed.extend(fresh)
        if images:
            params["referenceImages"] = [nexoclip.asset_reference(a) for a in images]
        if videos:
            params["referenceVideos"] = [nexoclip.asset_reference(a) for a in videos]
        attempt = int(media.get("attempt") or 0) + 1
        basis = hashlib.sha256(json.dumps([sig, dep_assets]).encode("utf-8")).hexdigest()[:24]
        try:
            generation = bridge.submit(kind=spec["kind"], prompt=spec["prompt"], parameters=params,
                                       idempotency_key=f"{project_id}:{key}:{basis}:{attempt}")
        except nexoclip.BridgeError as exc:
            submit_error = exc
            break
        _set_media(project_id, key, generation_id=generation["id"], status="running", attempt=attempt, error=None,
                   pending_spec_sig=sig, pending_dep_assets=dep_assets)
        submitted.append(key)

    deadline = time.monotonic() + JOB_TIMEOUT_SECONDS
    pending = set(submitted)
    while pending:
        for key in sorted(pending):
            board = read_board(project_id)
            media = board["media"][key]
            kind = "video" if key.startswith(("video:", "edit:", "scene:")) else "image"
            try:
                generation = bridge.status(media["generation_id"])
            except nexoclip.BridgeError:
                continue  # transient; the deadline bounds how long we keep trying
            status = str(generation.get("status") or "")
            if status in nexoclip.ACTIVE_STATUSES:
                continue
            if status == TERMINAL_OK:
                try:
                    asset_id = _first_output(generation, f"{kind}/")
                except GenerationError as exc:
                    _set_media(project_id, key, status="failed", error=str(exc))
                else:
                    # The result is already a nexoclip asset in the user's workspace; keep the id only.
                    _record_take(project_id, key, asset_id=asset_id, spec_sig=media.get("pending_spec_sig"),
                                 dep_assets=media.get("pending_dep_assets", []), generated_at=now_iso())
                    if key.startswith("edit:"):
                        _edited_take(project_id, key, asset_id)
                    if key.startswith("scene:"):
                        try:
                            _split_scene(project_id, bridge, key, asset_id)
                        except Exception as exc:  # the scene video itself is kept; only the per-shot pieces are missing
                            _set_media(project_id, key, error=f"video scene jadi, tapi gagal dipotong per shot: {exc}"[:300])
            else:
                _set_media(project_id, key, status="failed", error=_error_text(generation))
            pending.discard(key)
        if pending:
            if time.monotonic() > deadline:
                for key in pending:
                    _set_media(project_id, key, status="failed", error="timed out waiting for nexoclip")
                break
            time.sleep(POLL_SECONDS)

    if submit_error is not None:
        raise submit_error


def run_request(project_id: str, request_id: str) -> dict[str, Any]:
    """Generate an approved request. Returns {succeeded: [...], failed: {key: error}}."""
    bridge = billing.bridge_for(project_id)
    if bridge is None:
        raise GenerationError("generate gambar/video butuh koneksi kredit nexoclip (bridge belum dikonfigurasi)")
    board = read_board(project_id)
    request = find_request(board, request_id)
    specs = media_specs(board)
    levels = {k: tier(k, specs) for k in request["items"]}
    try:
        for level in sorted(set(levels.values())):
            keys = [k for k in request["items"] if levels[k] == level]
            _run_tier(project_id, bridge, keys)
    finally:
        release_loans(project_id, bridge)  # also what a run interrupted by a restart had borrowed
    board = read_board(project_id)
    succeeded = [k for k in request["items"] if (board["media"].get(k) or {}).get("status") == TERMINAL_OK]
    failed = {k: (board["media"].get(k) or {}).get("error") or "failed" for k in request["items"] if k not in succeeded}
    return {"succeeded": succeeded, "failed": failed}


def generation_credits(board: dict[str, Any]) -> float:
    """Credits spent on frames, videos and sheets so far: the estimate of every item that was generated
    (nexoclip settles each job at its actual usage, so this is close, not exact)."""
    total = 0.0
    for request in board["requests"]:
        succeeded = set((request.get("result") or {}).get("succeeded") or [])
        total += sum(float(price.get("credits") or 0) for key, price in (request.get("item_estimates") or {}).items()
                     if key in succeeded)
    return round(total, 2)


def resume_running(project_id: str) -> Optional[str]:
    """A request left "running" by a restart, if any."""
    board = read_board(project_id)
    running = [r for r in board["requests"] if r["status"] == "running"]
    return running[-1]["id"] if running else None
