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

from director_service import agent, billing, generation, llm, nexoclip, render
from director_service.board import create_board, read_board
from director_service.db import ActivityLock, activity_held
from director_service.store import append_chat, create_project as insert_project, now_iso, read_director, update_director

BUSY_AGENT = "Director masih membalas pesan sebelumnya"
BUSY_GENERATION = "masih ada generate yang berjalan"
BUSY_RENDER = "video masih dirender"


class Busy(RuntimeError):
    pass


class NotEnoughCredits(RuntimeError):
    def __init__(self, needed: float, balance: float) -> None:
        super().__init__(f"Butuh minimal {needed:g} kredit untuk memulai project Director; saldo kamu {balance:g}.")
        self.needed, self.balance = needed, balance


RUN_MODES = ("guide", "auto")
MIN_START_CREDITS = 100.0  # like OpenArt Director: a new project needs a buffer for a first pass


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
        if generation.resume_running(project_id) is None:
            generation.release_loans(project_id)  # nothing will finish the crashed run: give its trusts back
        resume(project_id)
    if not activity_held(project_id, "render"):
        render.interrupted(project_id)


# ---------------------------------------------------------------- chat


def _turn(project_id: str) -> None:
    billing.require_credits(project_id)
    agent.watch_new_videos(project_id)  # the video analyst watches new attachments first
    agent.run_turn(project_id)
    # Once per turn (not per edit), so several tweaks to one asset cost one sheet.
    _kick_auto(project_id)  # e.g. a sheet the agent asked to redo with force
    auto_generate_assets(project_id)
    if _auto(project_id):  # "Just make it": what the Director prepared is approved for the user
        board = read_board(project_id)
        for request in board["requests"]:
            if request["status"] == "pending" and not request.get("auto"):
                try:
                    approve_request(project_id, request["id"], by_director=True)
                except (Busy, InvalidAction):
                    pass  # e.g. sheets still generating: approved when they finish (_after_generation)
    # Name the project after its script once there is one, when neither the Director nor the user named it.
    script = read_board(project_id)["script"]
    if script and script.get("title") and read_director(project_id).get("title_by", "auto") == "auto":
        update_director(project_id, title=script["title"][:80], title_by="agent")


def _check_start_credits(owner: str) -> None:
    if not (nexoclip.configured() and nexoclip.is_billable_user(owner)):
        return
    balance = nexoclip.Bridge(owner).balance()
    if balance < MIN_START_CREDITS:
        raise NotEnoughCredits(MIN_START_CREDITS, balance)


def create_project(owner: str, first_message: str, *, run_mode: str = "guide", meta: Optional[dict] = None) -> str:
    if run_mode not in RUN_MODES:
        raise InvalidAction("run_mode must be guide or auto")
    _check_start_credits(owner)
    title = first_message.strip().splitlines()[0][:80] or "Project baru"
    project_id = f"{_slug(title)}-{uuid.uuid4().hex[:6]}"
    idle = {"status": "idle", "error": None, "updated_at": now_iso()}
    insert_project(project_id, {"owner": owner, "title": title, "title_auto": True, "llm_model": llm.model_name(),
                                "agent": idle, "generation": idle, "run_mode": run_mode})
    create_board(project_id)
    append_chat(project_id, "user", first_message, kind="message", meta=meta or None)
    _background(project_id, "agent", lambda: _turn(project_id), BUSY_AGENT)
    return project_id


def rename_project(project_id: str, title: str) -> None:
    title = " ".join((title or "").split())[:80]
    if not title:
        raise InvalidAction("title is required")
    update_director(project_id, title=title, title_auto=False, title_by="user")  # the Director no longer renames it


def delete_project(project_id: str) -> None:
    if any(activity_held(project_id, activity) for activity in ("agent", "generation", "render")):
        raise Busy("project ini sedang bekerja (chat, generate atau render); tunggu selesai lalu hapus")
    from director_service.store import delete_project as remove

    remove(project_id)


def duplicate_project(project_id: str) -> str:
    """A copy to try another direction: the board as it is now (with the media already made, which stay shared
    assets), a fresh history and chat. Nothing is generated or charged."""
    from director_service.board import CONTENT_KEYS, read_board, update_board

    source = read_director(project_id)
    board = read_board(project_id)
    title = f"{source['title'][:70]} (salinan)"
    copy_id = f"{_slug(title)}-{uuid.uuid4().hex[:6]}"
    idle = {"status": "idle", "error": None, "updated_at": now_iso()}
    insert_project(copy_id, {"owner": source["owner"], "title": title, "title_auto": False, "title_by": "user", "llm_model": source["llm_model"],
                             "agent": idle, "generation": idle, "run_mode": source.get("run_mode") or "guide"})
    create_board(copy_id)

    def fill(copy: dict) -> None:
        for key in CONTENT_KEYS:
            copy[key] = board[key]
        copy["media"] = board["media"]  # generated sheets, frames and clips: the same assets, reused
        copy["video_notes"] = board.get("video_notes") or {}

    update_board(copy_id, fill, author="system", summary=f"Disalin dari {source['title'][:60]}")
    append_chat(copy_id, "assistant", f"Ini salinan dari *{source['title']}*: board dan media yang sudah dibuat ikut "
                "tersalin, riwayat chat dan generate mulai dari nol.", kind="message")
    return copy_id


def send_message(project_id: str, text: str, meta: Optional[dict] = None) -> None:
    if activity_held(project_id, "agent"):
        raise Busy(BUSY_AGENT)
    append_chat(project_id, "user", text, kind="message", meta=meta or None)
    _background(project_id, "agent", lambda: _turn(project_id), BUSY_AGENT)


def set_run_mode(project_id: str, run_mode: str) -> None:
    if run_mode not in RUN_MODES:
        raise InvalidAction("run_mode must be guide or auto")
    update_director(project_id, run_mode=run_mode)


def _auto(project_id: str) -> bool:
    return read_director(project_id).get("run_mode") == "auto"


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
    if tool in ("upsert_element", "update_brief", "set_element_photos"):  # the brief's style is part of every sheet prompt
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


def approve_request(project_id: str, request_id: str, *, by_director: bool = False) -> None:
    """Approve a request; one held at the credit gate is approved again ("Lanjutkan") after a top-up."""
    board = read_board(project_id)
    request = generation.find_request(board, request_id)
    if request is None:
        raise InvalidAction("request not found")
    if request["status"] not in ("pending", "needs_credits"):
        raise InvalidAction(f"request is {request['status']}, not pending")
    if not generation.request_is_current(board, request):
        # Something it would generate changed after the estimate (a prompt, the ratio, the resolution...): never charge
        # for what the user did not see. Price the same items again and show that estimate to approve instead.
        generation.set_request_status(project_id, request_id, "superseded")
        try:
            fresh = generation.create_request(project_id, request["requested"], force=bool(request.get("force")),
                                              note=request.get("note") or "")
        except generation.GenerationError as exc:
            raise InvalidAction(f"isi permintaan berubah setelah estimasi dibuat dan sekarang tidak ada yang perlu dibuat: {exc}") from exc
        if by_director:
            _start(project_id, fresh["id"], log_approval=False)
            return
        append_chat(project_id, "assistant", "Ada yang berubah sejak estimasi dibuat, jadi estimasinya saya hitung ulang. "
                    "Cek angka barunya, lalu approve lagi.", kind="message")
        append_chat(project_id, "assistant", "Estimasi baru", kind="request",
                    meta={"tool": "request_generation", "request_id": fresh["id"]})
        return
    _start(project_id, request_id, log_approval=not by_director)


def _credit_gate(project_id: str, request: dict) -> bool:
    """True (and the request held at the gate, with a note in the chat) when the balance cannot pay for it."""
    bridge = billing.bridge_for(project_id)
    needed = float((request.get("estimate") or {}).get("credits") or 0)
    if bridge is None or needed <= 0:
        return False
    balance = bridge.balance()
    if balance >= needed:
        return False
    first = request["status"] != "needs_credits"
    generation.set_request_status(project_id, request["id"], "needs_credits",
                                  credit_gate={"needed": needed, "balance": round(balance, 2)})
    if first:
        append_chat(project_id, "assistant", f"Kredit kurang: butuh {needed:g}, saldo {balance:g}.", kind="credit_gate",
                    meta={"request_id": request["id"], "needed": needed, "balance": round(balance, 2)})
    return True


def _next_queued_auto(project_id: str) -> Optional[str]:
    board = read_board(project_id)
    for request in board["requests"]:
        if request["status"] == "pending" and request.get("auto"):
            if generation.request_is_current(board, request):
                return request["id"]
            generation.set_request_status(project_id, request["id"], "superseded")
    return None


def _start(project_id: str, request_id: str, *, log_approval: bool) -> None:
    request = generation.find_request(read_board(project_id), request_id)
    if request is not None and not request.get("auto") and _credit_gate(project_id, request):
        return

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

    _background(project_id, "generation", work, BUSY_GENERATION, after=lambda: _after_generation(project_id))


def _after_generation(project_id: str) -> None:
    _kick_auto(project_id)
    if not _auto(project_id):
        return
    board = read_board(project_id)
    # "Just make it": approve what waited for the sheets, then export once every shot has its video.
    waiting = [r for r in board["requests"] if r["status"] == "pending" and not r.get("auto")]
    if waiting:
        try:
            approve_request(project_id, waiting[0]["id"], by_director=True)
        except (Busy, InvalidAction):
            pass
        return
    if any(r["status"] in ("pending", "running", "needs_credits") for r in board["requests"]) or not board["shots"]:
        return
    if not all((board["media"].get(f"video:{s['id']}") or {}).get("status") == generation.TERMINAL_OK for s in board["shots"]):
        return
    latest = board["renders"][-1] if board["renders"] else None
    if latest and latest.get("board_version") == board.get("version") and latest["status"] in ("done", "running", "pending"):
        return
    try:
        start_render(project_id)
    except (Busy, InvalidAction):
        pass


def reject_request(project_id: str, request_id: str) -> None:
    request = generation.find_request(read_board(project_id), request_id)
    if request is None or request["status"] != "pending":
        raise InvalidAction("there is no pending request with that id")
    generation.set_request_status(project_id, request_id, "rejected")
    append_chat(project_id, "user", "Batal generate", kind="approval", meta={"request_id": request_id})


def sweep_trust_loans() -> int:
    """Give back BytePlus trusts held by projects that are not generating (a crash, a project nobody reopens)."""
    from director_service.db import tx

    with tx() as conn:
        rows = conn.execute("SELECT project_id FROM boards WHERE runtime->'trust_loans' IS NOT NULL "
                            "AND runtime->'trust_loans' <> '{}'::jsonb").fetchall()
    released = 0
    for row in rows:
        project_id = row["project_id"]
        if not activity_held(project_id, "generation") and generation.resume_running(project_id) is None:
            try:
                released += generation.release_loans(project_id)
            except Exception:  # noqa: BLE001 - one project's failure must not stop the sweep
                traceback.print_exc()
    return released


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


def start_render(project_id: str, options: Optional[dict] = None) -> dict:
    """Join the shots into one video (the Export dialog's resolution, fps and format) in the background. Free."""
    if activity_held(project_id, "render"):
        raise Busy(BUSY_RENDER)
    try:
        item = render.create(project_id, options)
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
