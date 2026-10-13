"""Signed client for nexoclip's internal storyboard bridge (`/api/internal/storyboard`).

Same contract as Jellyfish's client: HMAC-SHA256 over JSON
`[userId, "storyboard", timestamp, nonce, sha256(request)]` with the shared
bridge secret, `request` sent as a JSON string so both sides hash identical
bytes. Every image/video job and every LLM call is billed to the user's
nexoclip credits through this bridge.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional

import requests

PROJECT_SCOPE = "storyboard"
SOURCE = "director"
# Must match STORYBOARD_MODELS in nexoclip-app/app/api/internal/storyboard/route.js.
IMAGE_MODEL = "bytedance-seed/seedream-4.5"
VIDEO_MODEL = "byteplus/seedance-2.5-unfiltered"
ACTIVE_STATUSES = {"queued", "running", "processing", "pending"}
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)


class BridgeError(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


class InsufficientCredits(BridgeError):
    def __init__(self) -> None:
        super().__init__(402, "Kredit nexoclip tidak cukup. Top up kredit lalu coba lagi.")


@dataclass(frozen=True)
class Downloaded:
    content: bytes
    content_type: str


def _compact(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def sign_request(*, user_id: str, request: dict[str, Any], secret: str, timestamp: Optional[int] = None, nonce: Optional[str] = None) -> dict[str, Any]:
    request_json = _compact(request)
    ts = int(time.time()) if timestamp is None else timestamp
    nonce_value = nonce or str(uuid.uuid4())
    digest = hashlib.sha256(request_json.encode("utf-8")).hexdigest()
    canonical = _compact([user_id, PROJECT_SCOPE, ts, nonce_value, digest])
    signature = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return {"userId": user_id, "timestamp": ts, "nonce": nonce_value, "signature": signature, "request": request_json}


# Voiceover voices: the premade ElevenLabs voices nexoclip offers (ELEVENLABS_VOICES in
# src/services/elevenlabsAudio.js; a nexoclip test keeps the two lists identical).
VOICES = [
    {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "George", "gender": "male", "description": "warm, mature narrator"},
    {"id": "nPczCjzI2devNBz1zQrb", "name": "Brian", "gender": "male", "description": "deep, resonant, ads and trailers"},
    {"id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel", "gender": "male", "description": "authoritative, news style"},
    {"id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Liam", "gender": "male", "description": "young, energetic"},
    {"id": "iP95p4xoKVk53GoZ742B", "name": "Chris", "gender": "male", "description": "casual, friendly"},
    {"id": "CwhRBWXzGAHq8TQ4Fs17", "name": "Roger", "gender": "male", "description": "laid-back, confident"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "gender": "female", "description": "soft, reassuring"},
    {"id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "gender": "female", "description": "warm, upbeat storyteller"},
    {"id": "cgSgspJ2msm6clMCkdW9", "name": "Jessica", "gender": "female", "description": "young, bright, playful"},
    {"id": "FGY2WhTYpPnrIDTdsKH5", "name": "Laura", "gender": "female", "description": "quirky, lively"},
    {"id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "gender": "female", "description": "smooth, seductive"},
    {"id": "pFZP5JQG7iQjIQuC4Bku", "name": "Lily", "gender": "female", "description": "gentle, elegant"},
]
AUDIO_TIMEOUT_SECONDS = 300.0  # a few minutes of music can take a while


def configured() -> bool:
    return bool(os.environ.get("NEXOCLIP_INTERNAL_URL") and os.environ.get("NEXOCLIP_BRIDGE_SECRET"))


def is_billable_user(user_id: str) -> bool:
    return bool(_UUID.match(user_id or ""))


class Bridge:
    def __init__(self, user_id: str, *, timeout_s: float = 60.0) -> None:
        if not configured():
            raise BridgeError(503, "nexoclip bridge is not configured (NEXOCLIP_INTERNAL_URL / NEXOCLIP_BRIDGE_SECRET)")
        if not is_billable_user(user_id):
            raise BridgeError(401, "this project has no nexoclip user to bill")
        self.user_id = user_id
        self._timeout = timeout_s
        self._url = os.environ["NEXOCLIP_INTERNAL_URL"].rstrip("/") + "/api/internal/storyboard"
        self._secret = os.environ["NEXOCLIP_BRIDGE_SECRET"]

    def _post(self, request: dict[str, Any], *, timeout: Optional[float] = None) -> requests.Response:
        body = sign_request(user_id=self.user_id, request=request, secret=self._secret)
        try:
            response = requests.post(self._url, json=body, timeout=timeout or self._timeout, allow_redirects=True)
        except requests.RequestException as exc:
            raise BridgeError(503, f"nexoclip bridge unreachable: {exc}") from exc
        if response.status_code == 402:
            raise InsufficientCredits()
        if response.status_code >= 400:
            try:
                message = response.json().get("error") or response.text
            except ValueError:
                message = response.text
            raise BridgeError(response.status_code, f"nexoclip request failed ({response.status_code}): {message}"[:500])
        return response

    def balance(self) -> float:
        return float(self._post({"action": "balance"}).json().get("balance") or 0)

    def estimate(self, *, kind: str, prompt: str, parameters: dict[str, Any]) -> dict[str, float]:
        request = {"action": "estimate", "kind": kind, "prompt": prompt, "parameters": parameters}
        if kind == "audio":
            request["parameters"] = {**parameters, "text": prompt}
        else:
            request["model"] = _model(kind)
        data = self._post(request).json()
        return {"credits": float(data.get("credits") or 0), "usd": float(data.get("usd") or 0)}

    def generate_audio(self, *, text: str, parameters: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        """Voiceover / music (ElevenLabs). Generated within the request, so it returns the stored
        asset; a retry with the same key returns the same asset without paying again."""
        response = self._post({"action": "generate-audio", "source": SOURCE, "idempotencyKey": idempotency_key,
                               "audio": {**parameters, "text": text}}, timeout=AUDIO_TIMEOUT_SECONDS)
        data = response.json()
        return {"asset_id": str(data["assetId"]), "credits": float(data.get("credits") or 0)}

    def charge_text(self, *, model: str, input_tokens: int, output_tokens: int, idempotency_key: str) -> float:
        response = self._post({
            "action": "charge-text", "source": SOURCE, "model": model, "inputTokens": int(input_tokens),
            "outputTokens": int(output_tokens), "idempotencyKey": idempotency_key,
        })
        return float(response.json().get("credits") or 0)

    def import_asset(self, *, content: bytes, content_type: str, filename: str) -> str:
        response = self._post({
            "action": "import-asset", "source": SOURCE, "filename": filename, "contentType": content_type,
            "dataBase64": base64.b64encode(content).decode("ascii"),
        })
        return str(response.json()["reference"])

    def upload_render(self, *, content: bytes, filename: str) -> str:
        """Store the final MP4 in the user's workspace; returns its asset id. Sent as the raw body
        (not base64 JSON) to a dedicated route, signed over its size and sha256."""
        meta = {"action": "upload-render", "filename": filename, "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest()}
        signed = sign_request(user_id=self.user_id, request=meta, secret=self._secret)
        headers = {
            "Content-Type": "video/mp4",
            "X-Director-User-Id": signed["userId"],
            "X-Director-Timestamp": str(signed["timestamp"]),
            "X-Director-Nonce": signed["nonce"],
            "X-Director-Signature": signed["signature"],
            "X-Director-Request": base64.b64encode(signed["request"].encode("utf-8")).decode("ascii"),
        }
        url = self._url.rsplit("/api/", 1)[0] + "/api/internal/director/render-upload"
        try:
            response = requests.post(url, data=content, headers=headers, timeout=600)
        except requests.RequestException as exc:
            raise BridgeError(503, f"nexoclip unreachable: {exc}") from exc
        if response.status_code >= 400:
            try:
                message = response.json().get("error") or response.text
            except ValueError:
                message = response.text
            raise BridgeError(response.status_code, f"upload render gagal ({response.status_code}): {message}"[:500])
        return str(response.json()["assetId"])

    def submit(self, *, kind: str, prompt: str, parameters: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        response = self._post({
            "action": "submit", "source": SOURCE,
            "input": {"kind": kind, "model": _model(kind), "prompt": prompt, "parameters": parameters, "idempotencyKey": idempotency_key},
        })
        return dict(response.json()["generation"])

    def status(self, generation_id: str) -> dict[str, Any]:
        return dict(self._post({"action": "status", "generationId": generation_id}).json()["generation"])

    def download(self, asset_id: str) -> Downloaded:
        response = self._post({"action": "download-asset", "assetId": asset_id}, timeout=600.0)
        return Downloaded(content=response.content, content_type=response.headers.get("content-type") or "application/octet-stream")


def _model(kind: str) -> str:
    if kind == "image":
        return IMAGE_MODEL
    if kind == "video":
        return VIDEO_MODEL
    raise ValueError(f"unsupported generation kind {kind!r}")


def asset_reference(asset_id: str) -> str:
    """The tenant-asset form nexoclip accepts in referenceImages."""
    return f"/api/assets/{asset_id}/download"
