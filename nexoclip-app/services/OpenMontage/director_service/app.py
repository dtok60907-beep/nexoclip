"""HTTP API for the AI Director agent.

Run: python -m uvicorn director_service.app:app --port 4760
Needs DIRECTOR_DATABASE_URL (Postgres); the schema is migrated on startup.

In deployment the service is reached only through nexoclip-app's
/api/director proxy, which authenticates the nexoclip session and sets
X-Nexoclip-User-Id. When DIRECTOR_PROXY_SECRET is set every request must
carry it in X-Director-Proxy-Secret, so the identity header cannot be
forged by anything else that can reach the port.
"""

from __future__ import annotations

import asyncio
import contextlib
import functools
import hmac
import io
import json
import os
import tarfile
import threading
import time
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from director_service import billing, db, live, nexoclip, session
from director_service.generation import generation_credits
from director_service.board import list_versions, read_board, restore_version, version_content, view_for_ui
from director_service.store import find_project, list_projects, read_chat

LOCAL_OWNER = "local"
PROXY_SECRET_ENV = "DIRECTOR_PROXY_SECRET"
PROXY_SECRET_HEADER = "x-director-proxy-secret"
HEARTBEAT_SECONDS = 20.0
REPO_ROOT = Path(__file__).resolve().parents[1]
# What this service runs, offered to every user under AGPL-3.0 section 13.
SOURCE_PATHS = ("LICENSE", "director_service", "skills")


class Hub:
    """Fan-out of "project changed" signals to SSE streams in this process."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self, project_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.setdefault(project_id, set()).add(queue)
        return queue

    def unsubscribe(self, project_id: str, queue: asyncio.Queue) -> None:
        self._subscribers.get(project_id, set()).discard(queue)

    def _publish(self, project_id: str) -> None:
        for queue in list(self._subscribers.get(project_id, ())):
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(project_id)

    def publish_threadsafe(self, project_id: str) -> None:
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._publish, project_id)

    def _publish_event(self, project_id: str, event: dict[str, Any]) -> None:
        for queue in list(self._subscribers.get(project_id, ())):
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(event)

    def publish_event_threadsafe(self, project_id: str, event: dict[str, Any]) -> None:
        """A live event (live.py) passed to the browser as is, not as a "changed, refetch" signal."""
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._publish_event, project_id, event)


hub = Hub()


TRUST_SWEEP_SECONDS = 900


def _sweep_loans(stop: threading.Event) -> None:
    """Every 15 minutes, give back BytePlus trusts that no running generation holds any more."""
    while not stop.wait(TRUST_SWEEP_SECONDS):
        try:
            session.sweep_trust_loans()
        except Exception:  # noqa: BLE001 - the sweep must keep running
            pass


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    await asyncio.to_thread(db.migrate)
    hub.bind(asyncio.get_running_loop())
    live.bind(hub.publish_event_threadsafe)
    stop = threading.Event()
    listener = threading.Thread(target=db.listen, args=(hub.publish_threadsafe, stop), name="director-listen", daemon=True)
    listener.start()
    threading.Thread(target=_sweep_loans, args=(stop,), name="director-trust-sweep", daemon=True).start()
    try:
        yield
    finally:
        stop.set()
        db.close()


app = FastAPI(title="AI Director", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.middleware("http")
async def require_proxy_secret(request: Request, call_next):
    expected = os.environ.get(PROXY_SECRET_ENV, "")
    # The platform healthcheck carries no secret; /health reveals nothing.
    if expected and request.url.path != "/api/director/health":
        supplied = request.headers.get(PROXY_SECRET_HEADER, "")
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            return JSONResponse({"detail": "forbidden"}, status_code=403)
    return await call_next(request)


class Attachment(BaseModel):
    """An image or video the user added to a chat message (a nexoclip asset in their workspace)."""
    asset_id: str = Field(pattern=r"^[A-Za-z0-9-]{8,64}$")
    kind: Literal["image", "video"]
    name: str = Field(default="", max_length=200)


class Mention(BaseModel):
    """An @mention in a chat message: a shot or an element of the board."""
    type: Literal["shot", "element"]
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(default="", max_length=120)


def _message_meta(attachments: list[Attachment], mentions: list[Mention]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    if attachments:
        meta["attachments"] = [a.model_dump() for a in attachments]
    if mentions:
        meta["mentions"] = [m.model_dump() for m in mentions]
    return meta


class CreateProjectBody(BaseModel):
    # The user's first chat message.
    brief: str = Field(min_length=1, max_length=20000)
    run_mode: Literal["guide", "auto"] = "guide"
    attachments: list[Attachment] = Field(default_factory=list, max_length=10)
    mentions: list[Mention] = Field(default_factory=list, max_length=20)


class MessageBody(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    attachments: list[Attachment] = Field(default_factory=list, max_length=10)
    mentions: list[Mention] = Field(default_factory=list, max_length=20)


class SettingsBody(BaseModel):
    run_mode: Literal["guide", "auto"]


class EditBody(BaseModel):
    tool: str = Field(min_length=1, max_length=40)
    args: dict[str, Any] = Field(default_factory=dict)


class RequestBody(BaseModel):
    items: list[str] = Field(min_length=1, max_length=60)
    force: bool = False


class RestoreBody(BaseModel):
    version: int = Field(ge=1)


def _owner(user_id: Optional[str]) -> str:
    return (user_id or "").strip() or LOCAL_OWNER


def _owned_project(project_id: str, owner: str) -> dict[str, Any]:
    if len(project_id) > 80:
        raise HTTPException(status_code=400, detail="invalid project id")
    project = find_project(project_id)
    if project is None or project["owner"] != owner:
        raise HTTPException(status_code=404, detail="project not found")
    return project


def _project_view(project_id: str) -> dict[str, Any]:
    session.heal(project_id)
    project = find_project(project_id)
    return {
        "project_id": project_id,
        "title": project["title"],
        "created_at": project["created_at"],
        "llm_model": project["llm_model"],
        "llm_cost_usd": project["llm_cost_usd"],
        "llm_credits": project.get("llm_credits") or 0,
        "run_mode": project.get("run_mode") or "guide",
        "generation_credits": generation_credits(read_board(project_id)),
        "video_credits_per_second": billing.video_credits_per_second(project_id),
        "agent": project["agent"],
        "generation": project["generation"],
        "render": project.get("render") or {"status": "idle"},
        "board": view_for_ui(project_id, read_board(project_id)),
        "chat": read_chat(project_id),
    }


def _call(fn, *args):
    try:
        return fn(*args)
    except session.Busy as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except session.InvalidAction as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except session.NotEnoughCredits as exc:
        raise HTTPException(status_code=402, detail=str(exc))


@app.get("/api/director/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/api/director/voices")
async def voices() -> dict:
    """Voices for a voiceover (premade ElevenLabs voices)."""
    return {"voices": nexoclip.VOICES}


@app.post("/api/director/projects", status_code=201)
async def create_project(body: CreateProjectBody, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    project_id = await asyncio.to_thread(_call, lambda: session.create_project(
        _owner(x_nexoclip_user_id), body.brief, run_mode=body.run_mode, meta=_message_meta(body.attachments, body.mentions)))
    return {"project_id": project_id}


@app.get("/api/director/projects")
async def projects(x_nexoclip_user_id: Optional[str] = Header(default=None)) -> list:
    rows = await asyncio.to_thread(list_projects, _owner(x_nexoclip_user_id))
    return [{
        "project_id": r["id"],
        "title": r["title"],
        "created_at": r["created_at"],
        "busy": "running" in ((r["agent"] or {}).get("status"), (r["generation"] or {}).get("status")),
        "needs_approval": r["needs_approval"],
    } for r in rows]


@app.get("/api/director/projects/{project_id}")
async def get_project(project_id: str, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    return await asyncio.to_thread(_project_view, project_id)


@app.post("/api/director/projects/{project_id}/messages")
async def post_message(project_id: str, body: MessageBody, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    await asyncio.to_thread(_call, session.send_message, project_id, body.text, _message_meta(body.attachments, body.mentions))
    return {"accepted": True}


@app.post("/api/director/projects/{project_id}/settings")
async def settings(project_id: str, body: SettingsBody, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    await asyncio.to_thread(_call, session.set_run_mode, project_id, body.run_mode)
    return {"ok": True}


@app.post("/api/director/projects/{project_id}/retry")
async def retry(project_id: str, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    project = await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    if (project["agent"] or {}).get("status") != "error":
        raise HTTPException(status_code=400, detail="the last reply did not fail")
    await asyncio.to_thread(_call, session.retry, project_id)
    return {"retrying": True}


@app.post("/api/director/projects/{project_id}/edit")
async def edit(project_id: str, body: EditBody, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    label = await asyncio.to_thread(_call, session.edit, project_id, body.tool, body.args)
    return {"ok": True, "label": label}


@app.get("/api/director/projects/{project_id}/versions")
async def versions(project_id: str, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> list:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    return await asyncio.to_thread(list_versions, project_id)


@app.get("/api/director/projects/{project_id}/versions/{version}")
async def version(project_id: str, version: int, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    content = await asyncio.to_thread(version_content, project_id, version)
    if content is None:
        raise HTTPException(status_code=404, detail="version not found")
    return content


@app.post("/api/director/projects/{project_id}/restore")
async def restore(project_id: str, body: RestoreBody, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))

    def run() -> int:
        if db.activity_held(project_id, "agent"):
            raise session.Busy(session.BUSY_AGENT)
        try:
            new_version = restore_version(project_id, body.version)
        except KeyError:
            raise session.InvalidAction("version not found")
        from director_service.store import append_chat

        append_chat(project_id, "user", f"Kembali ke versi {body.version}", kind="edit", meta={"tool": "restore"})
        return new_version

    return {"version": await asyncio.to_thread(_call, run)}


@app.post("/api/director/projects/{project_id}/requests")
async def create_request(project_id: str, body: RequestBody, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    result = await asyncio.to_thread(_call, session.request_generation, project_id, body.items, body.force)
    return {"request_id": result["request_id"], "items": result["items"], "estimate": result["estimate"]}


@app.post("/api/director/projects/{project_id}/requests/{request_id}/approve")
async def approve_request(project_id: str, request_id: str, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    await asyncio.to_thread(_call, session.approve_request, project_id, request_id)
    return {"approved": request_id}


@app.post("/api/director/projects/{project_id}/requests/{request_id}/reject")
async def reject_request(project_id: str, request_id: str, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    await asyncio.to_thread(_call, session.reject_request, project_id, request_id)
    return {"rejected": request_id}


@app.post("/api/director/projects/{project_id}/renders", status_code=201)
async def create_render(project_id: str, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> dict:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))
    item = await asyncio.to_thread(_call, session.start_render, project_id)
    return {"render_id": item["id"], "shots": len(item["shots"]), "stills": item["stills"]}


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@app.get("/api/director/projects/{project_id}/events")
async def project_events(project_id: str, request: Request, x_nexoclip_user_id: Optional[str] = Header(default=None)) -> StreamingResponse:
    await asyncio.to_thread(_owned_project, project_id, _owner(x_nexoclip_user_id))

    async def stream():
        queue = hub.subscribe(project_id)
        try:
            yield _sse({"type": "hello", "project_id": project_id})
            while True:
                if await request.is_disconnected():
                    return
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
                except asyncio.TimeoutError:
                    yield _sse({"type": "heartbeat", "ts": time.time()})
                    continue
                if isinstance(item, dict):  # a live draft: sent at once, only the newest of a burst
                    while not queue.empty() and isinstance(queue._queue[0], dict):  # type: ignore[attr-defined]
                        item = queue.get_nowait()
                    yield _sse(item)
                    continue
                await asyncio.sleep(0.2)  # coalesce bursts of writes into one refetch
                drafts = []
                while not queue.empty():
                    extra = queue.get_nowait()
                    if isinstance(extra, dict):
                        drafts.append(extra)
                yield _sse({"type": "change", "project_id": project_id})
                if drafts:
                    yield _sse(drafts[-1])
        finally:
            hub.unsubscribe(project_id, queue)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@functools.lru_cache(maxsize=1)
def _source_archive() -> bytes:
    def keep(info: tarfile.TarInfo) -> tarfile.TarInfo | None:
        name = info.name.rsplit("/", 1)[-1]
        if name == "__pycache__" or name.endswith((".pyc", ".env")) or name.startswith(".env"):
            return None
        return info

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for rel in SOURCE_PATHS:
            path = REPO_ROOT / rel
            if path.exists():
                archive.add(path, arcname=f"nexoclip-director-source/{rel}", filter=keep)
    return buffer.getvalue()


@app.get("/api/director/source")
async def source_code() -> Response:
    data = await asyncio.to_thread(_source_archive)
    return Response(data, media_type="application/gzip", headers={
        "Content-Disposition": 'attachment; filename="nexoclip-director-source.tar.gz"',
        "Cache-Control": "private, max-age=3600",
    })
