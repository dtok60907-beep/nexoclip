"""Runs agent turns and approved generation requests in the background.

Two independent activities per project, each guarded by a Postgres advisory
lock (so it also holds across several service instances): the agent turn
(chat + board edits) and a generation run. Chatting while images render is
fine; two turns or two runs of the same project at once are not.
"""

from __future__ import annotations

import re
import threading
import traceback
import uuid
from typing import Callable, Optional

from director_service import agent, billing, generation, llm, render
from director_service.board import create_board, read_board
from director_service.db import ActivityLock, activity_held
from director_service.store import append_chat, create_project as insert_project, now_iso, read_director, update_director

BUSY_AGENT = "Director masih membalas pesan sebelumnya"
BUSY_GENERATION = "masih ada generate yang berjalan"
BUSY_RENDER = "video masih dirender"


class Busy(RuntimeError):
    pass


class InvalidAction(RuntimeError):
    pass


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:40].strip("-") or "project"


def _set_activity(project_id: str, activity: str, status: str, error: Optional[str] = None) -> None:
    update_director(project_id, **{activity: {"status": status, "error": error, "updated_at": now_iso()}})


def _background(project_id: str, activity: str, work: Callable[[], None], busy_message: str,
                after: Optional[Callable[[], None]] = None) -> None:
    lock = ActivityLock(project_id, activity)
    if not lock.try_acquire():
        raise Busy(busy_message)

    def target() -> None:
        try:
            work()
            _set_activity(project_id, activity, "idle")
        except Exception as exc:  # shown to the user in chat and as the activity status
            traceback.print_exc()
            message = str(exc)[:400]
            _set_activity(project_id, activity, "error", message)
            prefix = {"agent": "Director gagal membalas", "render": "Render gagal"}.get(activity, "Generate gagal")
            append_chat(project_id, "assistant", f"{prefix}: {message}", kind="error")
        finally:
            lock.release()
            if after is not None:
                try:
                    after()
                except Exception:  # never let a follow-up hide the run's own outcome
                    traceback.print_exc()

    try:
        _set_activity(project_id, activity, "running")
        threading.Thread(target=target, name=f"director-{activity}-{project_id}", daemon=True).start()
    except Exception:
        lock.release()
        raise


def heal(project_id: str) -> None:
    """Fix statuses left "running" by a crashed instance, and resume an interrupted generation run."""
    director = read_director(project_id)
    if (director.get("agent") or {}).get("status") == "running" and not activity_held(project_id, "agent"):
        _set_activity(project_id, "agent", "error", "Balasan terputus (service restart). Coba lagi.")
    if not activity_held(project_id, "generation"):
        resume(project_id)
    if not activity_held(project_id, "render"):
        render.interrupted(project_id)


# ---------------------------------------------------------------- chat


def _turn(project_id: str) -> None:
    billing.require_credits(project_id)
    agent.run_turn(project_id)
    # Once per turn (not per edit), so several tweaks to one asset cost one sheet.
    _kick_auto(project_id)  # e.g. a sheet the agent asked to redo with force
    auto_generate_assets(project_id)
    # Name the project after its script once there is one, unless it was renamed since.
    script = read_board(project_id)["script"]
    if script and script.get("title") and read_director(project_id).get("title_auto", True):
        update_director(project_id, title=script["title"][:80], title_auto=False)


def create_project(owner: str, first_message: str) -> str:
    title = first_message.strip().splitlines()[0][:80] or "Project baru"
    project_id = f"{_slug(title)}-{uuid.uuid4().hex[:6]}"
    idle = {"status": "idle", "error": None, "updated_at": now_iso()}
    insert_project(project_id, {"owner": owner, "title": title, "title_auto": True, "llm_model": llm.model_name(),
                                "agent": idle, "generation": idle})
    create_board(project_id)
    append_chat(project_id, "user", first_message, kind="message")
    _background(project_id, "agent", lambda: _turn(project_id), BUSY_AGENT)
    return project_id


def send_message(project_id: str, text: str) -> None:
    if activity_held(project_id, "agent"):
        raise Busy(BUSY_AGENT)
    append_chat(project_id, "user", text, kind="message")
    _background(project_id, "agent", lambda: _turn(project_id), BUSY_AGENT)


def retry(project_id: str) -> None:
    """Answer the last user message again after a failed turn."""
    _background(project_id, "agent", lambda: _turn(project_id), BUSY_AGENT)


def edit(project_id: str, tool: str, args: dict) -> str:
    """A direct edit from the board. Refused while the agent is mid-turn, so the two never interleave."""
    if activity_held(project_id, "agent"):
        raise Busy(BUSY_AGENT)
    try:
        label = agent.apply_user_edit(project_id, tool, args)
    except agent.ToolError as exc:
        raise InvalidAction(str(exc)) from exc
    if tool in ("upsert_element", "update_brief"):  # the brief's style is part of every sheet prompt
        auto_generate_assets(project_id)
    return label


# ---------------------------------------------------------------- generation requests


def request_generation(project_id: str, items: list[str], force: bool = False) -> dict:
    """Prepare a priced request from the board. Asset sheets start right away; frames and
    videos wait for approve on their card."""
    try:
        result = agent.user_request(project_id, items, force)
    except agent.ToolError as exc:
        raise InvalidAction(str(exc)) from exc
    if result.get("auto"):
        start_auto(project_id, result["request_id"])
    return result


def auto_generate_assets(project_id: str) -> Optional[str]:
    """Generate every element sheet that is missing or out of date, without an approval step."""
    board = read_board(project_id)
    specs = generation.media_specs(board)
    busy_keys = generation.open_keys(board)
    memo: dict = {}
    keys = [k for k in specs if k.startswith(generation.AUTO_PREFIX) and k not in busy_keys
            and generation.needs_generation(board, k, specs, memo)]
    if not keys:
        return None
    try:
        request = generation.create_request(project_id, keys, auto=True, note="Reference sheet aset (otomatis)")
    except generation.GenerationError:
        return None
    append_chat(project_id, "assistant", f"Generate {len(request['items'])} reference sheet aset",
                kind="request", meta={"tool": "auto_generation", "request_id": request["id"]})
    start_auto(project_id, request["id"])
    return request["id"]


def start_auto(project_id: str, request_id: str) -> None:
    """Run an automatic request now, or leave it queued until the current run finishes."""
    try:
        _start(project_id, request_id, log_approval=False)
    except Busy:
        pass  # picked up by _kick_auto when the running generation ends


def _kick_auto(project_id: str) -> None:
    board = read_board(project_id)
    queued = [r for r in board["requests"] if r["status"] == "pending" and r.get("auto")]
    if not queued:
        return
    request = queued[0]
    if not generation.request_is_current(board, request):
        generation.set_request_status(project_id, request["id"], "superseded")
        auto_generate_assets(project_id)
        return
    start_auto(project_id, request["id"])


def _summary(result: dict) -> str:
    done, failed = len(result["succeeded"]), result["failed"]
    text = f"Generate selesai: {done} berhasil"
    if failed:
        first_key, first_error = next(iter(failed.items()))
        text += f", {len(failed)} gagal ({first_key}: {first_error})"
    return text + "."


def _finish(project_id: str, request_id: str) -> None:
    try:
        result = generation.run_request(project_id, request_id)
    except Exception:
        generation.set_request_status(project_id, request_id, "failed")
        raise
    generation.set_request_status(project_id, request_id, "failed" if result["failed"] else "done", result=result)
    append_chat(project_id, "assistant", _summary(result), kind="generation", meta={"request_id": request_id})


def approve_request(project_id: str, request_id: str) -> None:
    board = read_board(project_id)
    request = generation.find_request(board, request_id)
    if request is None:
        raise InvalidAction("request not found")
    if request["status"] != "pending":
        raise InvalidAction(f"request is {request['status']}, not pending")
    if not generation.request_is_current(board, request):
        generation.set_request_status(project_id, request_id, "superseded")
        raise InvalidAction("prompt-nya berubah setelah estimasi dibuat; minta Director siapkan estimasi baru")
    _start(project_id, request_id, log_approval=True)


def _next_queued_auto(project_id: str) -> Optional[str]:
    board = read_board(project_id)
    for request in board["requests"]:
        if request["status"] == "pending" and request.get("auto"):
            if generation.request_is_current(board, request):
                return request["id"]
            generation.set_request_status(project_id, request["id"], "superseded")
    return None


def _start(project_id: str, request_id: str, *, log_approval: bool) -> None:
    def work() -> None:
        billing.require_credits(project_id)
        generation.set_request_status(project_id, request_id, "running")
        if log_approval:
            append_chat(project_id, "user", "Approve generate", kind="approval", meta={"request_id": request_id})
        _finish(project_id, request_id)
        # Drain asset sheets queued while this ran, under the same lock.
        while (queued := _next_queued_auto(project_id)) is not None:
            generation.set_request_status(project_id, queued, "running")
            _finish(project_id, queued)

    _background(project_id, "generation", work, BUSY_GENERATION, after=lambda: _kick_auto(project_id))


def reject_request(project_id: str, request_id: str) -> None:
    request = generation.find_request(read_board(project_id), request_id)
    if request is None or request["status"] != "pending":
        raise InvalidAction("there is no pending request with that id")
    generation.set_request_status(project_id, request_id, "rejected")
    append_chat(project_id, "user", "Batal generate", kind="approval", meta={"request_id": request_id})


def resume(project_id: str) -> None:
    """Keep polling a run that was in flight when an instance died (never resubmits finished work)."""
    request_id = generation.resume_running(project_id)
    if not request_id:
        return
    try:
        _background(project_id, "generation", lambda: _finish(project_id, request_id), BUSY_GENERATION,
                    after=lambda: _kick_auto(project_id))
    except Busy:
        pass


# ---------------------------------------------------------------- final video


def start_render(project_id: str) -> dict:
    """Join the shots into one MP4 in the background. Free: no model is called."""
    if activity_held(project_id, "render"):
        raise Busy(BUSY_RENDER)
    try:
        item = render.create(project_id)
    except render.RenderError as exc:
        raise InvalidAction(str(exc)) from exc
    append_chat(project_id, "assistant", "Render video final", kind="render", meta={"render_id": item["id"]})

    def work() -> None:
        try:
            render.run(project_id, item["id"])
        except Exception as exc:
            render.fail(project_id, item["id"], str(exc))
            raise

    try:
        _background(project_id, "render", work, BUSY_RENDER)
    except Busy:
        render.fail(project_id, item["id"], BUSY_RENDER)
        raise
    return item
