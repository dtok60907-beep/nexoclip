"""Live, in-memory events for the browser that are not board changes: the Director's reply as it is
being written. The agent runs in this process, and so do the SSE streams that listen (one instance),
so this goes straight to them without a database round trip.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, Optional

DRAFT_INTERVAL_SECONDS = 0.12  # at most ~8 updates a second per project

_publish: Optional[Callable[[str, dict[str, Any]], None]] = None
_last: dict[str, float] = {}
_lock = threading.Lock()


def bind(publish: Callable[[str, dict[str, Any]], None]) -> None:
    global _publish
    _publish = publish


def draft(project_id: str, text: str, *, force: bool = False) -> None:
    """The reply written so far (throttled); an empty text clears it."""
    if _publish is None:
        return
    now = time.monotonic()
    with _lock:
        if not force and text and now - _last.get(project_id, 0.0) < DRAFT_INTERVAL_SECONDS:
            return
        _last[project_id] = now
    _publish(project_id, {"type": "draft", "text": text})
