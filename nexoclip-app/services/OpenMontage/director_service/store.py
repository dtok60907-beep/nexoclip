"""Projects, chat and LLM log in Postgres (see db.py)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from director_service.db import Jsonb, notify, tx

PROJECT_FIELDS = ("owner", "title", "title_auto", "llm_model", "llm_cost_usd", "agent", "generation")
JSON_FIELDS = {"agent", "generation"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _project(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "created_at": _iso(row["created_at"]), "updated_at": _iso(row["updated_at"])}


def create_project(project_id: str, data: dict[str, Any]) -> None:
    fields = [f for f in PROJECT_FIELDS if f in data]
    values = [Jsonb(data[f]) if f in JSON_FIELDS else data[f] for f in fields]
    with tx() as conn:
        conn.execute(
            f"INSERT INTO projects (id, {', '.join(fields)}) VALUES (%s, {', '.join(['%s'] * len(fields))})",
            (project_id, *values),
        )
        notify(conn, project_id)


def read_director(project_id: str) -> dict[str, Any]:
    with tx() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id = %s", (project_id,)).fetchone()
    if row is None:
        raise KeyError(project_id)
    return _project(row)


def find_project(project_id: str) -> Optional[dict[str, Any]]:
    try:
        return read_director(project_id)
    except KeyError:
        return None


def list_projects(owner: str) -> list[dict[str, Any]]:
    with tx() as conn:
        rows = conn.execute(
            """SELECT p.*, EXISTS (
                   SELECT 1 FROM boards b, jsonb_array_elements(b.runtime->'requests') r
                   WHERE b.project_id = p.id AND r->>'status' = 'pending') AS needs_approval
               FROM projects p WHERE owner = %s ORDER BY created_at DESC""",
            (owner,),
        ).fetchall()
    return [_project(r) for r in rows]


def update_director(project_id: str, **changes: Any) -> None:
    unknown = set(changes) - set(PROJECT_FIELDS)
    if unknown:
        raise KeyError(f"unknown project fields {unknown}")
    sets = ", ".join(f"{f} = %s" for f in changes)
    values = [Jsonb(v) if f in JSON_FIELDS else v for f, v in changes.items()]
    with tx() as conn:
        conn.execute(f"UPDATE projects SET {sets}, updated_at = now() WHERE id = %s", (*values, project_id))
        notify(conn, project_id)


def add_llm_cost(project_id: str, cost_usd: float) -> None:
    with tx() as conn:
        conn.execute("UPDATE projects SET llm_cost_usd = llm_cost_usd + %s WHERE id = %s", (float(cost_usd or 0), project_id))


def append_chat(project_id: str, role: str, text: str, *, kind: str = "message", meta: Optional[dict[str, Any]] = None) -> None:
    with tx() as conn:
        conn.execute(
            "INSERT INTO messages (project_id, role, kind, text, meta) VALUES (%s, %s, %s, %s, %s)",
            (project_id, role, kind, text, Jsonb(meta) if meta else None),
        )
        notify(conn, project_id)


def read_chat(project_id: str, limit: Optional[int] = None) -> list[dict[str, Any]]:
    with tx() as conn:
        if limit:
            rows = conn.execute(
                "SELECT * FROM (SELECT * FROM messages WHERE project_id = %s ORDER BY id DESC LIMIT %s) t ORDER BY id",
                (project_id, limit),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM messages WHERE project_id = %s ORDER BY id", (project_id,)).fetchall()
    return [
        {"id": r["id"], "role": r["role"], "kind": r["kind"], "text": r["text"], "ts": _iso(r["created_at"]),
         **({"meta": r["meta"]} if r["meta"] else {})}
        for r in rows
    ]


def append_llm_log(project_id: str, entry: dict[str, Any]) -> None:
    with tx() as conn:
        conn.execute("INSERT INTO llm_calls (project_id, entry) VALUES (%s, %s)", (project_id, Jsonb(entry)))
