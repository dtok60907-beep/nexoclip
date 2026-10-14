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


# Video price per second for each resolution, shown next to the resolution picker. Prices are the same for every
# user (nexoclip's rate table and markup), so one lookup an hour is enough.
PRICE_TTL_SECONDS = 3600
_PROBE_SECONDS = 10
_video_prices: dict[str, Any] = {"at": 0.0, "credits": {}}


def video_credits_per_second(project_id: str) -> dict[str, float]:
    """{"480p": credits, "720p": ..., "1080p": ...} for one second of Seedance video; {} when unknown."""
    import time

    from director_service.board import RESOLUTIONS

    if _video_prices["credits"] and time.monotonic() - _video_prices["at"] < PRICE_TTL_SECONDS:
        return dict(_video_prices["credits"])
    bridge = bridge_for(project_id)
    if bridge is None:
        return {}
    credits = {}
    try:
        for resolution in RESOLUTIONS:
            price = bridge.estimate(kind="video", prompt="price per second", parameters={
                "duration": _PROBE_SECONDS, "resolution": resolution, "aspectRatio": "16:9", "generateAudio": True})
            credits[resolution] = round(float(price["credits"]) / _PROBE_SECONDS, 1)
    except (nexoclip.BridgeError, KeyError, TypeError, ValueError):
        log.exception("could not price video seconds")
        return dict(_video_prices["credits"])
    _video_prices.update(at=time.monotonic(), credits=credits)
    return dict(credits)
