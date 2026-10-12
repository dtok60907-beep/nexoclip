"""BytePlus-direct Seedance 2.5 "unfiltered" video generation.

Mirrors nexoclip-app's own direct BytePlus adapter
(src/providers/direct/byteplusAdapter.js) instead of the Volcengine-Ark-CN
path tools/video/seedance_ark.py uses: same async /contents/generations/tasks
submit + poll + download flow, same env vars nexoclip-app already has
configured (BYTEPLUS_API_KEY, BYTEPLUS_BASE_URL,
BYTEPLUS_SEEDANCE_2_5_ENDPOINT). "Unfiltered" is a catalog label for a
differently-provisioned BytePlus endpoint, not a moderation bypass — BytePlus
can still reject a request.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    RetryPolicy,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)

# Rough per-second cost for budget tracking in Backlot only. Not authoritative
# billing — actual billing happens on the BytePlus/nexoclip side.
APPROX_COST_USD_PER_SECOND = 0.35

TERMINAL_STATUSES = frozenset({"succeeded", "failed", "cancelled", "expired"})


class BytePlusSeedanceVideo(BaseTool):
    name = "byteplus_seedance_video"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "byteplus"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.ASYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = [
        "env:BYTEPLUS_API_KEY",
        "env:BYTEPLUS_BASE_URL",
        "env:BYTEPLUS_SEEDANCE_2_5_ENDPOINT",
    ]
    install_instructions = (
        "Set BYTEPLUS_API_KEY, BYTEPLUS_BASE_URL, and "
        "BYTEPLUS_SEEDANCE_2_5_ENDPOINT to the same BytePlus Model Ark "
        "credentials/endpoint id nexoclip-app already uses for "
        "byteplus/seedance-2.5-unfiltered."
    )
    agent_skills = ["seedance-2-0"]

    capabilities = ["generate_video", "image_to_video", "text_to_video"]
    supports = {"reference_images": True, "duration": True}
    best_for = [
        "per-shot video generation billed through the same BytePlus account "
        "nexoclip-app already pays for",
    ]

    input_schema = {
        "type": "object",
        "required": ["prompt"],
        "properties": {
            "prompt": {"type": "string"},
            "reference_image_url": {
                "type": "string",
                "description": "Image URL to animate (image-to-video). Omit for text-to-video.",
            },
            "duration": {
                "type": "integer",
                "minimum": 4,
                "maximum": 30,
                "default": 6,
            },
            "aspect_ratio": {
                "type": "string",
                "enum": ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
                "default": "16:9",
            },
            "resolution": {
                "type": "string",
                "enum": ["480p", "720p", "1080p", "4k"],
                "default": "720p",
            },
            "generate_audio": {"type": "boolean", "default": True},
            "watermark": {"type": "boolean", "default": False},
            "poll_interval_seconds": {"type": "number", "default": 5},
            "timeout_seconds": {"type": "number", "default": 600},
            "output_path": {"type": "string"},
        },
    }

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=1024, network_required=True
    )
    retry_policy = RetryPolicy(max_retries=1, backoff_seconds=5.0, retryable_errors=["rate_limit", "timeout", "server_error"])
    idempotency_key_fields = ["prompt", "reference_image_url", "duration", "aspect_ratio", "resolution"]
    side_effects = ["submits a paid task to BytePlus Model Ark", "writes the completed video to output_path"]
    user_visible_verification = ["Watch the downloaded clip for continuity and that content moderation did not reject it"]

    def _get_api_key(self) -> str | None:
        return os.environ.get("BYTEPLUS_API_KEY")

    def _get_base_url(self) -> str | None:
        return os.environ.get("BYTEPLUS_BASE_URL")

    def _get_endpoint_model(self) -> str | None:
        return os.environ.get("BYTEPLUS_SEEDANCE_2_5_ENDPOINT")

    def get_status(self) -> ToolStatus:
        if self._get_api_key() and self._get_base_url() and self._get_endpoint_model():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        duration = inputs.get("duration", 6)
        return round(APPROX_COST_USD_PER_SECOND * float(duration), 4)

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        import requests

        api_key = self._get_api_key()
        base_url = self._get_base_url()
        endpoint_model = self._get_endpoint_model()
        if not api_key or not base_url or not endpoint_model:
            return ToolResult(
                success=False,
                error="BYTEPLUS_API_KEY/BYTEPLUS_BASE_URL/BYTEPLUS_SEEDANCE_2_5_ENDPOINT not set. "
                + self.install_instructions,
            )

        start = time.time()
        prompt = inputs["prompt"]
        reference_image_url = inputs.get("reference_image_url")
        duration = inputs.get("duration", 6)
        aspect_ratio = inputs.get("aspect_ratio", "16:9")
        resolution = inputs.get("resolution", "720p")
        generate_audio = inputs.get("generate_audio", True)
        watermark = inputs.get("watermark", False)
        poll_interval = inputs.get("poll_interval_seconds", 5)
        timeout_seconds = inputs.get("timeout_seconds", 600)

        root = str(base_url).rstrip("/")
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        if reference_image_url:
            content.append({
                "type": "image_url",
                "role": "reference_image",
                "image_url": {"url": reference_image_url},
            })

        body = {
            "model": endpoint_model,
            "content": content,
            "duration": duration,
            "resolution": resolution,
            "ratio": aspect_ratio,
            "generate_audio": generate_audio,
            "watermark": watermark,
        }

        try:
            submit_resp = requests.post(
                f"{root}/contents/generations/tasks", headers=headers, json=body, timeout=(10, 60)
            )
            if not submit_resp.ok:
                detail = None
                try:
                    detail = submit_resp.json().get("error", {}).get("message")
                except Exception:
                    detail = submit_resp.text[:300]
                raise RuntimeError(f"BytePlus submit returned {submit_resp.status_code}: {detail}")
            task_id = submit_resp.json().get("id")
            if not task_id:
                raise RuntimeError("BytePlus submit succeeded but returned no task id")

            poll_url = f"{root}/contents/generations/tasks/{task_id}"
            elapsed = 0.0
            status_payload: dict[str, Any] = {}
            while elapsed < timeout_seconds:
                status_resp = requests.get(poll_url, headers=headers, timeout=30)
                status_resp.raise_for_status()
                status_payload = status_resp.json()
                status = status_payload.get("status")
                if status in TERMINAL_STATUSES:
                    break
                time.sleep(poll_interval)
                elapsed += poll_interval
            else:
                raise RuntimeError(f"BytePlus Seedance task timed out after {timeout_seconds}s")

            if status_payload.get("status") != "succeeded":
                raise RuntimeError(f"BytePlus Seedance task {status_payload.get('status')}: {status_payload.get('error')}")

            result_content = status_payload.get("content") or {}
            video_url = result_content.get("video_url") or result_content.get("url")
            if not video_url:
                raise RuntimeError("BytePlus Seedance task succeeded but returned no video content")

            # Pre-signed TOS result URL lives on a different host than the Ark
            # API base — fetch it directly, unauthenticated (same as
            # byteplusAdapter.js's downloadContent()).
            video_resp = requests.get(video_url, timeout=120)
            video_resp.raise_for_status()

            output_path = Path(inputs.get("output_path") or "byteplus_seedance_video.mp4")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(video_resp.content)
        except Exception as exc:
            return ToolResult(success=False, error=f"BytePlus Seedance generation failed: {exc}")

        return ToolResult(
            success=True,
            data={"provider": "byteplus", "model": "byteplus/seedance-2.5-unfiltered", "prompt": prompt, "task_id": task_id, "outputs": [str(output_path)]},
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model="byteplus/seedance-2.5-unfiltered",
        )
