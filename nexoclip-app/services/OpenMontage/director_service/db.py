"""Postgres access for the Director: pool, migrations, change notifications, locks.

Lives in its own schema (default "director") inside nexoclip's database, so
its migrations never collide with nexoclip-app's. Every write that the UI
should see calls notify(); a listener thread forwards those NOTIFYs to the
SSE hub, so updates reach the browser no matter which instance wrote them.
"""

from __future__ import annotations

import contextlib
import os
import re
import threading
from typing import Any, Callable, Iterator, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

URL_ENV = "DIRECTOR_DATABASE_URL"
SCHEMA_ENV = "DIRECTOR_DB_SCHEMA"
CHANNEL = "director_changes"

_pool: Optional[ConnectionPool] = None
_pool_lock = threading.Lock()

MIGRATIONS: list[str] = [
    # 1: initial schema
    """
    CREATE TABLE projects (
        id            text PRIMARY KEY,
        owner         text NOT NULL,
        title         text NOT NULL,
        title_auto    boolean NOT NULL DEFAULT true,
        llm_model     text NOT NULL,
        llm_cost_usd  double precision NOT NULL DEFAULT 0,
        agent         jsonb NOT NULL DEFAULT '{}'::jsonb,
        generation    jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX projects_owner_created ON projects (owner, created_at DESC);

    -- Current board: creative content (versioned) and runtime state (media, requests; not versioned).
    CREATE TABLE boards (
        project_id  text PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
        version     integer NOT NULL,
        content     jsonb NOT NULL,
        runtime     jsonb NOT NULL,
        updated_at  timestamptz NOT NULL DEFAULT now()
    );

    -- One snapshot of the creative content per change, for history, compare and restore.
    CREATE TABLE board_versions (
        project_id  text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        version     integer NOT NULL,
        content     jsonb NOT NULL,
        author      text NOT NULL,
        summary     text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, version)
    );

    CREATE TABLE messages (
        id          bigserial PRIMARY KEY,
        project_id  text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        role        text NOT NULL,
        kind        text NOT NULL,
        text        text NOT NULL,
        meta        jsonb,
        created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX messages_project ON messages (project_id, id);

    CREATE TABLE llm_calls (
        id          bigserial PRIMARY KEY,
        project_id  text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        entry       jsonb NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
    );
    """,
]


def schema() -> str:
    name = os.environ.get(SCHEMA_ENV) or "director"
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", name):
        raise ValueError(f"invalid {SCHEMA_ENV}: {name!r}")
    return name


def configured() -> bool:
    return bool(os.environ.get(URL_ENV))


def pool() -> ConnectionPool:
    global _pool
    with _pool_lock:
        if _pool is None:
            url = os.environ.get(URL_ENV)
            if not url:
                raise RuntimeError(f"{URL_ENV} is not set")
            _pool = ConnectionPool(
                url,
                min_size=1,
                max_size=int(os.environ.get("DIRECTOR_DB_POOL_SIZE") or 10),
                kwargs={"options": f"-c search_path={schema()}", "row_factory": dict_row, "autocommit": False},
                open=True,
            )
        return _pool


def close() -> None:
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.close()
            _pool = None


@contextlib.contextmanager
def tx() -> Iterator[psycopg.Connection]:
    """A connection inside one transaction (committed on success, rolled back on error)."""
    with pool().connection() as conn:
        with conn.transaction():
            yield conn


def migrate() -> None:
    name = schema()
    with psycopg.connect(os.environ[URL_ENV], autocommit=True) as conn:
        # Serialise concurrent instances booting at once.
        conn.execute("SELECT pg_advisory_lock(hashtext('director_migrations'))")
        try:
            conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{name}"')
            conn.execute(f'CREATE TABLE IF NOT EXISTS "{name}".schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
            done = {row[0] for row in conn.execute(f'SELECT version FROM "{name}".schema_migrations')}
            for number, sql in enumerate(MIGRATIONS, start=1):
                if number in done:
                    continue
                with conn.transaction():
                    conn.execute(f'SET LOCAL search_path TO "{name}"')
                    conn.execute(sql)
                    conn.execute(f'INSERT INTO "{name}".schema_migrations (version) VALUES (%s)', (number,))
        finally:
            conn.execute("SELECT pg_advisory_unlock(hashtext('director_migrations'))")


def notify(conn: psycopg.Connection, project_id: str) -> None:
    """Tell every instance's SSE hub that this project changed (sent on commit)."""
    conn.execute("SELECT pg_notify(%s, %s)", (f"{schema()}_{CHANNEL}", project_id))


def listen(on_change: Callable[[str], None], stop: threading.Event) -> None:
    """Blocking loop for a daemon thread: forward NOTIFY payloads to on_change."""
    while not stop.is_set():
        try:
            with psycopg.connect(os.environ[URL_ENV], autocommit=True) as conn:
                conn.execute(f'LISTEN "{schema()}_{CHANNEL}"')
                while not stop.is_set():
                    for note in conn.notifies(timeout=1.0):
                        on_change(note.payload)
        except psycopg.Error:
            stop.wait(2.0)  # database restarting; reconnect


# ---------------------------------------------------------------- activity locks


def _lock_key(project_id: str, activity: str) -> str:
    return f"{schema()}:{project_id}:{activity}"


class ActivityLock:
    """A session-level advisory lock held on a dedicated connection for a whole background job."""

    def __init__(self, project_id: str, activity: str) -> None:
        self._key = _lock_key(project_id, activity)
        self._conn: Optional[psycopg.Connection] = None

    def try_acquire(self) -> bool:
        conn = psycopg.connect(os.environ[URL_ENV], autocommit=True)
        got = conn.execute("SELECT pg_try_advisory_lock(hashtextextended(%s, 0))", (self._key,)).fetchone()[0]
        if not got:
            conn.close()
            return False
        self._conn = conn
        return True

    def release(self) -> None:
        if self._conn is not None:
            try:
                self._conn.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (self._key,))
            finally:
                self._conn.close()
                self._conn = None


def activity_held(project_id: str, activity: str) -> bool:
    """True if some instance is running this activity right now."""
    lock = ActivityLock(project_id, activity)
    if lock.try_acquire():
        lock.release()
        return False
    return True


__all__ = ["Jsonb", "tx", "migrate", "notify", "listen", "ActivityLock", "activity_held", "configured", "close", "schema"]
