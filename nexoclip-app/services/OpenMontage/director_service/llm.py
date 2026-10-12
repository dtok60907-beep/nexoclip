"""OpenAI Responses API client for the director's text LLM.

Reads DIRECTOR_OPENAI_API_KEY (not OPENAI_API_KEY) so OpenMontage's own
OpenAI-backed tools (TTS, GPT Image) never pick this key up — it is for the
director's text model only.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

import requests

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-4.1-mini"
KEY_ENV = "DIRECTOR_OPENAI_API_KEY"
KEY_FILE = Path(__file__).resolve().parent.parent / "director.env"

# USD per 1M tokens (input, output) for cost tracking in the chat log.
PRICES_PER_MILLION = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1": (2.00, 8.00),
}
WEB_SEARCH_CALL_USD = 0.025


class LLMError(RuntimeError):
    pass


def model_name() -> str:
    return os.environ.get("DIRECTOR_LLM_MODEL") or DEFAULT_MODEL


def _api_key() -> str | None:
    key = os.environ.get(KEY_ENV)
    if key:
        return key
    if KEY_FILE.is_file():
        for line in KEY_FILE.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == KEY_ENV and value.strip():
                return value.strip().strip("'\"")
    return None


def _output_text(payload: dict[str, Any]) -> str:
    chunks = []
    for item in payload.get("output") or []:
        if item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            if part.get("type") == "output_text":
                chunks.append(part.get("text") or "")
    return "".join(chunks)


def _cost_usd(model: str, payload: dict[str, Any]) -> float:
    usage = payload.get("usage") or {}
    price_in, price_out = PRICES_PER_MILLION.get(model, (0.0, 0.0))
    cost = (usage.get("input_tokens") or 0) * price_in / 1e6 + (usage.get("output_tokens") or 0) * price_out / 1e6
    searches = sum(1 for item in payload.get("output") or [] if item.get("type") == "web_search_call")
    return cost + searches * WEB_SEARCH_CALL_USD


def chat(
    messages: list[dict[str, str]],
    *,
    web_search: bool = False,
    max_tokens: int = 16000,
) -> tuple[str, dict[str, Any]]:
    api_key = _api_key()
    if not api_key:
        raise LLMError(f"{KEY_ENV} is not set")
    model = model_name()
    body: dict[str, Any] = {
        "model": model,
        "input": [{"role": m["role"], "content": m["content"]} for m in messages],
        "max_output_tokens": max_tokens,
    }
    if web_search:
        body["tools"] = [{"type": "web_search"}]
        # Without this the model happily skips searching and invents sources.
        body["tool_choice"] = "required"
        # Without this the response only carries URLs the model chose to
        # annotate, so real search results look "invented" to the source check.
        body["include"] = ["web_search_call.action.sources"]
    # No json_object mode: on long prompts it can stall emitting whitespace
    # until max_output_tokens; extract_json handles fenced or bare JSON instead.
    try:
        response = requests.post(
            OPENAI_RESPONSES_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
            timeout=(10, 600),
        )
    except requests.RequestException as exc:
        raise LLMError(f"OpenAI request failed: {exc}") from exc
    if not response.ok:
        try:
            detail = response.json().get("error", {}).get("message")
        except ValueError:
            detail = response.text[:300]
        raise LLMError(f"OpenAI returned {response.status_code}: {detail}")
    payload = response.json()
    if payload.get("status") not in (None, "completed"):
        reason = (payload.get("incomplete_details") or {}).get("reason")
        raise LLMError(f"OpenAI response {payload.get('status')}: {reason}")
    text = _output_text(payload)
    if not text:
        raise LLMError("OpenAI returned no text output")
    usage = dict(payload.get("usage") or {})
    usage["cost"] = _cost_usd(model, payload)
    usage["cited_urls"] = _cited_urls(payload)
    return text, usage


CONNECT_RETRIES = 2


def _post(api_key: str, body: dict[str, Any]) -> requests.Response:
    """POST to the Responses API, retrying only failures to connect.

    A connection that never got established cannot have been billed, so it is
    safe to retry; a timeout or reset after the request was sent is not retried.
    """
    for attempt in range(CONNECT_RETRIES + 1):
        try:
            return requests.post(
                OPENAI_RESPONSES_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=body,
                timeout=(10, 600),
            )
        except requests.ConnectionError as exc:
            if attempt == CONNECT_RETRIES or not _before_send(exc):
                raise LLMError(f"OpenAI request failed: {exc}") from exc
            time.sleep(1.5 * (attempt + 1))
        except requests.RequestException as exc:
            raise LLMError(f"OpenAI request failed: {exc}") from exc
    raise AssertionError("unreachable")


_CONNECT_FRAMES = {"_new_conn", "create_connection", "do_handshake", "_validate_conn", "connect"}


def _before_send(exc: BaseException) -> bool:
    """True if the failure happened while opening the connection (DNS/TCP/TLS), before any request bytes."""
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        tb = current.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_name in _CONNECT_FRAMES:
                return True
            tb = tb.tb_next
        current = current.__cause__ or current.__context__
    return False


def respond(
    input_items: list[dict[str, Any]],
    *,
    instructions: str,
    tools: list[dict[str, Any]],
    previous_response_id: str | None = None,
    max_tokens: int = 8000,
) -> dict[str, Any]:
    """One Responses API step with function tools.

    Returns {"id", "text", "calls": [{"call_id", "name", "arguments"}], "usage"}.
    Within one agent turn, later steps pass previous_response_id and only the
    function_call_output items, so the model keeps its own tool-call context.
    """
    api_key = _api_key()
    if not api_key:
        raise LLMError(f"{KEY_ENV} is not set")
    model = model_name()
    body: dict[str, Any] = {
        "model": model,
        "instructions": instructions,
        "input": input_items,
        "tools": tools,
        "max_output_tokens": max_tokens,
        "parallel_tool_calls": True,
    }
    if previous_response_id:
        body["previous_response_id"] = previous_response_id
    response = _post(api_key, body)
    if not response.ok:
        try:
            detail = response.json().get("error", {}).get("message")
        except ValueError:
            detail = response.text[:300]
        raise LLMError(f"OpenAI returned {response.status_code}: {detail}")
    payload = response.json()
    if payload.get("status") not in (None, "completed"):
        reason = (payload.get("incomplete_details") or {}).get("reason")
        raise LLMError(f"OpenAI response {payload.get('status')}: {reason}")
    calls = [
        {"call_id": item["call_id"], "name": item["name"], "arguments": item.get("arguments") or "{}"}
        for item in payload.get("output") or []
        if item.get("type") == "function_call"
    ]
    usage = dict(payload.get("usage") or {})
    usage["cost"] = _cost_usd(model, payload)
    return {"id": payload.get("id"), "text": _output_text(payload), "calls": calls, "usage": usage}


def _cited_urls(payload: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    for item in payload.get("output") or []:
        if item.get("type") == "web_search_call":
            for source in (item.get("action") or {}).get("sources") or []:
                if source.get("url"):
                    urls.append(source["url"])
        if item.get("type") == "message":
            for part in item.get("content") or []:
                for note in part.get("annotations") or []:
                    if note.get("type") == "url_citation" and note.get("url"):
                        urls.append(note["url"])
    return urls


def normalize_url(url: str) -> str:
    """Compare URLs ignoring scheme case, trailing slash and OpenAI's utm tag."""
    url = re.sub(r"([?&])utm_source=openai(&|$)", lambda m: m.group(1) if m.group(2) else "", url.strip())
    url = url.rstrip("?&").rstrip("/")
    return re.sub(r"^https?://(www\.)?", "", url, flags=re.IGNORECASE).lower()


_FENCE = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL)


def extract_json(text: str) -> dict[str, Any]:
    match = _FENCE.search(text)
    candidate = match.group(1) if match else text
    start = candidate.find("{")
    if start == -1:
        raise ValueError("response contains no JSON object")
    # raw_decode stops at the end of the first object, so a stray trailing
    # brace or a sentence after the JSON does not sink an otherwise good answer.
    data, _ = json.JSONDecoder().raw_decode(candidate, start)
    if not isinstance(data, dict):
        raise ValueError("response JSON is not an object")
    return data
