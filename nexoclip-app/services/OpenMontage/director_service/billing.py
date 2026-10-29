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


# A model call is billed after it ran, so it must not start unless the balance covers the most one call can cost:
# an AI Director step with a large, uncached context is about $0.10 (~16 credits at the production markup), a video
# analysis a few credits. Below that the call is not made, instead of charging only what is left.
MIN_STEP_CREDITS = 20.0
MIN_ANALYSIS_CREDITS = 5.0


def require_credits(project_id: str, minimum: float = 0.0) -> None:
    bridge = bridge_for(project_id)
    if bridge is not None:
        balance = bridge.balance()
        if balance <= 0 or balance < minimum:
            raise nexoclip.InsufficientCredits()


def balance_short(project_id: str, minimum: float) -> Optional[float]:
    """The balance when it is below minimum (the call should not run), else None."""
    bridge = bridge_for(project_id)
    if bridge is None:
        return None
    try:
        balance = bridge.balance()
    except nexoclip.BridgeError:
        return None  # an unreachable balance check must not block the user; the bridge still refuses at 0
    return balance if balance < minimum else None


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
_video_prices: dict[str, dict[str, Any]] = {}  # per video model: {"at", "credits"}


def video_credits_per_second(project_id: str) -> dict[str, float]:
    """{"480p": credits, "720p": ..., "1080p": ...} for one second of the project's video model; {} when unknown."""
    import time

    from director_service.board import read_board, video_model

    chosen = video_model(read_board(project_id)["brief"])
    cached = _video_prices.get(chosen["model"]) or {"at": 0.0, "credits": {}}
    if cached["credits"] and time.monotonic() - cached["at"] < PRICE_TTL_SECONDS:
        return dict(cached["credits"])
    bridge = bridge_for(project_id)
    if bridge is None:
        return {}
    credits = {}
    try:
        for resolution in chosen["resolutions"]:
            price = bridge.estimate(kind="video", prompt="price per second", model=chosen["model"], parameters={
                "duration": _PROBE_SECONDS, "resolution": resolution, "aspectRatio": "16:9", "generateAudio": True})
            credits[resolution] = round(float(price["credits"]) / _PROBE_SECONDS, 1)
    except (nexoclip.BridgeError, KeyError, TypeError, ValueError):
        log.exception("could not price video seconds")
        return dict(cached["credits"])
    _video_prices[chosen["model"]] = {"at": time.monotonic(), "credits": credits}
    return dict(credits)
