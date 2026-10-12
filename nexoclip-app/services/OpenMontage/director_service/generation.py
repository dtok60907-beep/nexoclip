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
import time
import uuid
from typing import Any, Optional

from director_service import billing, nexoclip
from director_service.board import (
    TERMINAL_OK,
    media_specs,
    needs_generation,
    read_board,
    spec_sig,
    tier,
    update_board,
)
from director_service.store import now_iso

POLL_SECONDS = 5.0
JOB_TIMEOUT_SECONDS = 1800
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
        if (explicit and force) or needs_generation(board, key, specs, memo):
            wanted.add(key)
        for dep in specs[key]["deps"]:
            visit(dep, False)

    for key in keys:
        visit(key, True)
    return sorted(wanted, key=lambda k: (tier(k), list(specs).index(k)))


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
        raise GenerationError(f"unknown media: {', '.join(unknown)}. Valid keys look like element:<id>, frame:<shot_id>, video:<shot_id>.")
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
        "video_seconds": sum(specs[k]["params"].get("duration", 0) for k in items if specs[k]["kind"] == "video"),
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


def _run_tier(project_id: str, bridge: nexoclip.Bridge, keys: list[str]) -> None:
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
        params = dict(spec["params"])
        if dep_assets:
            params["referenceImages"] = [nexoclip.asset_reference(a) for a in dep_assets]
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
            kind = "video" if key.startswith("video:") else "image"
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
                    _set_media(project_id, key, status=TERMINAL_OK, asset_id=asset_id, error=None,
                               done_spec_sig=media.get("pending_spec_sig"), dep_assets=media.get("pending_dep_assets", []),
                               generated_at=now_iso())
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
    request = find_request(read_board(project_id), request_id)
    for level in (0, 1, 2):
        keys = [k for k in request["items"] if tier(k) == level]
        if keys:
            _run_tier(project_id, bridge, keys)
    board = read_board(project_id)
    succeeded = [k for k in request["items"] if (board["media"].get(k) or {}).get("status") == TERMINAL_OK]
    failed = {k: (board["media"].get(k) or {}).get("error") or "failed" for k in request["items"] if k not in succeeded}
    return {"succeeded": succeeded, "failed": failed}


def resume_running(project_id: str) -> Optional[str]:
    """A request left "running" by a restart, if any."""
    board = read_board(project_id)
    running = [r for r in board["requests"] if r["status"] == "running"]
    return running[-1]["id"] if running else None
