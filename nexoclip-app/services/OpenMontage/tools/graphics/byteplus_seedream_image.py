"""BytePlus-direct Seedream image generation.

Calls BytePlus Model Ark's OpenAI-compatible /images/generations endpoint
directly (same path nexoclip-app's own direct provider,
src/providers/direct/imageAdapters.js:createBytePlusImageAdapter, uses),
rather than going through fal.ai like tools/graphics/seedream_image.py does.
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

# Seedream rejects images below 3,686,400px; these presets satisfy that floor
# while preserving each supported aspect ratio (same table nexoclip-app uses).
IMAGE_SIZES = {
    "1:1": "1920x1920",
    "2:3": "1728x2560",
    "3:2": "2560x1728",
    "9:16": "1728x3072",
    "16:9": "3072x1728",
}

# Rough per-image cost for budget tracking in Backlot. Not authoritative
# billing — actual billing happens on the BytePlus/nexoclip side.
APPROX_COST_USD_PER_IMAGE = 0.04


class BytePlusSeedreamImage(BaseTool):
    name = "byteplus_seedream_image"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "byteplus"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = ["env:BYTEPLUS_API_KEY", "env:BYTEPLUS_BASE_URL"]
    install_instructions = (
        "Set BYTEPLUS_API_KEY and BYTEPLUS_BASE_URL to your BytePlus Model Ark "
        "credentials (the same ones nexoclip-app's BYTEPLUS_API_KEY/"
        "BYTEPLUS_BASE_URL use)."
    )
    agent_skills = ["visual-style"]

    capabilities = ["generate_image", "text_to_image", "image_to_image"]
    supports = {"custom_size": True, "reference_images": True}
    best_for = [
        "stills generated directly through the BytePlus account already used "
        "by nexoclip, instead of a separate fal.ai key",
    ]

    input_schema = {
        "type": "object",
        "required": ["prompt"],
        "properties": {
            "prompt": {"type": "string"},
            "model": {
                "type": "string",
                "description": "BytePlus Seedream model id.",
                "default": "seedream-4-5-251128",
            },
            "aspect_ratio": {
                "type": "string",
                "enum": list(IMAGE_SIZES.keys()),
                "default": "16:9",
            },
            "reference_image_urls": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional reference image URLs (image-to-image).",
            },
            "output_path": {"type": "string"},
        },
    }

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=100, network_required=True
    )
    retry_policy = RetryPolicy(max_retries=2, retryable_errors=["rate_limit", "timeout"])
    idempotency_key_fields = ["prompt", "model", "aspect_ratio", "reference_image_urls"]
    side_effects = ["writes image file to output_path", "calls BytePlus Model Ark API"]
    user_visible_verification = ["Inspect generated image for subject/style accuracy"]

    def _get_api_key(self) -> str | None:
        return os.environ.get("BYTEPLUS_API_KEY")

    def _get_base_url(self) -> str | None:
        return os.environ.get("BYTEPLUS_BASE_URL")

    def get_status(self) -> ToolStatus:
        if self._get_api_key() and self._get_base_url():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return APPROX_COST_USD_PER_IMAGE

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        import requests

        api_key = self._get_api_key()
        base_url = self._get_base_url()
        if not api_key or not base_url:
            return ToolResult(
                success=False,
                error="BYTEPLUS_API_KEY/BYTEPLUS_BASE_URL not set. " + self.install_instructions,
            )

        start = time.time()
        prompt = inputs["prompt"]
        model = inputs.get("model") or "seedream-4-5-251128"
        aspect_ratio = inputs.get("aspect_ratio", "16:9")
        size = IMAGE_SIZES.get(aspect_ratio)
        reference_image_urls = inputs.get("reference_image_urls") or []

        root = str(base_url).rstrip("/")
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "response_format": "url",
        }
        if size:
            payload["size"] = size
        if reference_image_urls:
            payload["image"] = reference_image_urls

        try:
            response = requests.post(
                f"{root}/images/generations",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=(10, 120),
            )
            if not response.ok:
                detail = None
                try:
                    detail = response.json().get("error", {}).get("message")
                except Exception:
                    detail = response.text[:300]
                raise RuntimeError(f"BytePlus returned {response.status_code}: {detail}")
            data = response.json()
            images = data.get("data") or []
            if not images:
                raise RuntimeError("BytePlus returned no images")

            output_path = Path(inputs.get("output_path") or "byteplus_seedream_image.png")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            image_url = images[0].get("url")
            if not image_url:
                raise RuntimeError("BytePlus image result has no url")
            image_resp = requests.get(image_url, timeout=60)
            image_resp.raise_for_status()
            output_path.write_bytes(image_resp.content)
        except Exception as exc:
            return ToolResult(success=False, error=f"BytePlus Seedream generation failed: {exc}")

        return ToolResult(
            success=True,
            data={"provider": "byteplus", "model": model, "prompt": prompt, "outputs": [str(output_path)]},
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=model,
        )
