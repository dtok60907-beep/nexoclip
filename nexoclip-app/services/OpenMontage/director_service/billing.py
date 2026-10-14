"""Bills the project's owner through the nexoclip bridge.

When the bridge is not configured (local dev) nothing is billed and paid
generation is unavailable; text stages still run for free.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from director_service import llm, nexoclip
from director_service.store import read_director

log = logging.getLogger(__name__)


def bridge_for(project_id: str) -> Optional[nexoclip.Bridge]:
    if not nexoclip.configured():
        return None
    return nexoclip.Bridge(read_director(project_id)["owner"])


def require_credits(project_id: str) -> None:
    bridge = bridge_for(project_id)
    if bridge is not None and bridge.balance() <= 0:
        raise nexoclip.InsufficientCredits()


def charge_llm(project_id: str, model: str, usage: dict[str, Any]) -> float:
    bridge = bridge_for(project_id)
    if bridge is None:
        return 0.0
    try:
        return bridge.charge_text(
            model=model,
            input_tokens=int(usage.get("input_tokens") or 0),
            cached_input_tokens=llm.cached_tokens(usage),
            output_tokens=int(usage.get("output_tokens") or 0),
            idempotency_key=f"{project_id}:{uuid.uuid4()}",
        )
    except nexoclip.BridgeError:
        # The model already answered; a billing hiccup must not lose the user's work.
        log.exception("charging LLM usage failed for project %s", project_id)
        return 0.0
