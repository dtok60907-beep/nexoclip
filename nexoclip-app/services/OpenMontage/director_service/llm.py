"""Responses API client for the director's text LLM.

A dola-seed model, or a BytePlus endpoint (ep-...), runs on BytePlus ModelArk (BYTEPLUS_API_KEY, BYTEPLUS_BASE_URL), whose Responses API matches
OpenAI's. A GPT model runs on OpenAI with DIRECTOR_OPENAI_API_KEY (not OPENAI_API_KEY) so OpenMontage's own
OpenAI-backed tools (TTS, GPT Image) never pick this key up — it is for the director's text model only.
A vendor/model id (x-ai/grok-4.5) runs on OpenRouter (OPENROUTER_API_KEY), whose Responses API keeps no state: the
conversation of a turn is kept here and resent in full every step instead of previous_response_id.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Callable, Optional

import requests

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OPENROUTER_RESPONSES_URL = "https://openrouter.ai/api/v1/responses"
OPENROUTER_KEY_ENV = "OPENROUTER_API_KEY"
GROK_MODEL = "x-ai/grok-4.5"
# Our BytePlus inference endpoint for Seed 2.1 Turbo (reasoning effort is sent with every request).
DEFAULT_MODEL = "ep-20261019153359-9pfqc"
KEY_ENV = "DIRECTOR_OPENAI_API_KEY"
BYTEPLUS_KEY_ENV = "BYTEPLUS_API_KEY"
BYTEPLUS_URL_ENV = "BYTEPLUS_BASE_URL"
KEY_FILE = Path(__file__).resolve().parent.parent / "director.env"

# The models the Director may use: Seed 2.1 on BytePlus, or GPT-5 and newer, never a -pro or -sol model.
# Keep in step with STORYBOARD_TEXT_PRICES in nexoclip-app/src/services/storyboardTextPricing.js, which bills them.
# (input, cached input, output) USD per 1M tokens; GPT: OpenAI standard tier for contexts up to 272K tokens
# (developers.openai.com/api/docs/pricing, October 2026). Every agent step resends the conversation, so on OpenAI
# most input is cached and billed at the cached rate.
PRICES_PER_MILLION = {
    # BytePlus ModelArk standard online inference (ai.byteplus.com model pricing, October 2026).
    "dola-seed-2-1-turbo-260628": (0.50, 0.10, 2.50),
    "ep-20261019153359-9pfqc": (0.50, 0.10, 2.50),  # Seed 2.1 Turbo endpoint
    "ep-20261019153353-45w94": (0.50, 0.10, 2.50),  # earlier Seed 2.1 Turbo endpoint
    "gpt-5.6-terra": (2.00, 0.20, 12.00),
    "gpt-5.6-luna": (0.20, 0.02, 1.20),
    "gpt-5.5": (5.00, 0.50, 30.00),
    "gpt-5.4": (2.50, 0.25, 15.00),
    "gpt-5.4-mini": (0.75, 0.075, 4.50),
    "gpt-5.2": (1.75, 0.175, 14.00),
    "gpt-5.1": (1.25, 0.125, 10.00),
    "gpt-5": (1.25, 0.125, 10.00),
    "gpt-5-mini": (0.25, 0.025, 2.00),
    # OpenRouter list price for prompts up to 200K tokens (openrouter.ai/x-ai/grok-4.5, October 2026).
    "x-ai/grok-4.5": (2.00, 0.30, 6.00),  # GROK_MODEL
}

# The models a user can pick for a project (the composer's model picker): the deployment's default text model, or
# Grok on OpenRouter. The pick also decides who looks at the images and videos the user attaches.
LLM_CHOICES = ("seed", "grok")
# The models reason before answering; "medium" matches the Seed endpoint's own setting (sent every request, so it wins).
REASONING_EFFORT_ENV = "DIRECTOR_REASONING_EFFORT"
WEB_SEARCH_CALL_USD = 0.025


class LLMError(RuntimeError):
    pass


def model_name() -> str:
    return os.environ.get("DIRECTOR_LLM_MODEL") or DEFAULT_MODEL


def project_model(stored: str | None) -> str:
    """The model a project runs on: Grok when the user picked it, else the deployment's default (also for projects
    made under an older default model)."""
    return GROK_MODEL if stored == GROK_MODEL else model_name()


def choice_for(stored: str | None) -> str:
    return "grok" if stored == GROK_MODEL else "seed"


def model_for_choice(choice: str) -> str:
    if choice not in LLM_CHOICES:
        raise ValueError(f"llm must be one of {', '.join(LLM_CHOICES)}")
    return GROK_MODEL if choice == "grok" else model_name()


def _checked_model(model: str | None = None) -> str:
    model = model or model_name()
    if model not in PRICES_PER_MILLION:
        raise LLMError(f"model {model!r} is not allowed for the Director (Seed 2.1, or GPT-5 or newer, not -pro / -sol)")
    return model


def _on_byteplus(model: str) -> bool:
    return model.startswith(("dola-seed-", "ep-"))  # a Seed model, or one of our BytePlus inference endpoints


def on_openrouter(model: str) -> bool:
    return "/" in model  # OpenRouter ids are vendor/model


def _provider(model: str) -> str:
    return "BytePlus" if _on_byteplus(model) else "OpenRouter" if on_openrouter(model) else "OpenAI"


def _endpoint(model: str) -> tuple[str, str]:
    """(Responses API URL, API key) for the model's provider."""
    if _on_byteplus(model):
        key, base = os.environ.get(BYTEPLUS_KEY_ENV), (os.environ.get(BYTEPLUS_URL_ENV) or "").rstrip("/")
        if not key or not base:
            raise LLMError(f"{BYTEPLUS_KEY_ENV} and {BYTEPLUS_URL_ENV} must be set")
        return f"{base}/responses", key
    if on_openrouter(model):
        key = os.environ.get(OPENROUTER_KEY_ENV)
        if not key:
            raise LLMError(f"{OPENROUTER_KEY_ENV} is not set")
        return OPENROUTER_RESPONSES_URL, key
    key = _api_key()
    if not key:
        raise LLMError(f"{KEY_ENV} is not set")
    return OPENAI_RESPONSES_URL, key


def _reasoning() -> dict[str, str]:
    return {"effort": os.environ.get(REASONING_EFFORT_ENV) or "medium"}


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


def cached_tokens(usage: dict[str, Any]) -> int:
    """Input tokens served from the provider's prompt cache (billed at the cached rate)."""
    details = usage.get("input_tokens_details") or usage.get("prompt_tokens_details") or {}
    return min(int(details.get("cached_tokens") or 0), int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0))


def _cost_usd(model: str, payload: dict[str, Any]) -> float:
    usage = payload.get("usage") or {}
    if on_openrouter(model) and isinstance(usage.get("cost"), (int, float)):
        return float(usage["cost"])  # OpenRouter reports what it billed, web searches and long-prompt rates included
    price_in, price_cached, price_out = PRICES_PER_MILLION.get(model, (0.0, 0.0, 0.0))
    cached = cached_tokens(usage)
    cost = (((usage.get("input_tokens") or 0) - cached) * price_in + cached * price_cached
            + (usage.get("output_tokens") or 0) * price_out) / 1e6
    searches = sum(1 for item in payload.get("output") or [] if item.get("type") == "web_search_call")
    return cost + searches * WEB_SEARCH_CALL_USD


def chat(
    messages: list[dict[str, str]],
    *,
    web_search: bool = False,
    max_tokens: int = 16000,
    model: str | None = None,
) -> tuple[str, dict[str, Any]]:
    model = _checked_model(model)
    url, api_key = _endpoint(model)
    provider = _provider(model)
    body: dict[str, Any] = {
        "model": model,
        "reasoning": _reasoning(),
        "input": [{"role": m["role"], "content": m["content"]} for m in messages],
        "max_output_tokens": max_tokens,
    }
    if web_search and on_openrouter(model):
        # OpenRouter's search tool (the provider's own search on Grok); citations come back as url_citation notes.
        body["tools"] = [{"type": "openrouter:web_search"}]
    elif web_search:
        body["tools"] = [{"type": "web_search"}]
        # Without this the model happily skips searching and invents sources.
        body["tool_choice"] = "required"
        if not _on_byteplus(model):
            # Without this the response only carries URLs the model chose to
            # annotate, so real search results look "invented" to the source check.
            body["include"] = ["web_search_call.action.sources"]
    # No json_object mode: on long prompts it can stall emitting whitespace
    # until max_output_tokens; extract_json handles fenced or bare JSON instead.
    try:
        response = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
            timeout=(10, 600),
        )
    except requests.RequestException as exc:
        raise LLMError(f"{provider} request failed: {exc}") from exc
    if not response.ok:
        try:
            detail = response.json().get("error", {}).get("message")
        except ValueError:
            detail = response.text[:300]
        raise LLMError(f"{provider} returned {response.status_code}: {detail}")
    payload = response.json()
    if payload.get("status") not in (None, "completed"):
        reason = (payload.get("incomplete_details") or {}).get("reason")
        raise LLMError(f"{provider} response {payload.get('status')}: {reason}")
    text = _output_text(payload)
    if not text:
        raise LLMError(f"{provider} returned no text output")
    usage = dict(payload.get("usage") or {})
    usage["cost"] = _cost_usd(model, payload)
    usage["model"] = model
    usage["cited_urls"] = _cited_urls(payload)
    return text, usage


CONNECT_RETRIES = 2


def _post(url: str, api_key: str, body: dict[str, Any], *, stream: bool = False) -> requests.Response:
    """POST to the Responses API, retrying only failures to connect.

    A connection that never got established cannot have been billed, so it is
    safe to retry; a timeout or reset after the request was sent is not retried.
    """
    for attempt in range(CONNECT_RETRIES + 1):
        try:
            return requests.post(
                url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=body,
                timeout=(10, 600),
                stream=stream,
            )
        except requests.ConnectionError as exc:
            if attempt == CONNECT_RETRIES or not _before_send(exc):
                raise LLMError(f"{_provider(body['model'])} request failed: {exc}") from exc
            time.sleep(1.5 * (attempt + 1))
        except requests.RequestException as exc:
            raise LLMError(f"{_provider(body['model'])} request failed: {exc}") from exc
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
    on_text: Optional[Callable[[str], None]] = None,
    model: str | None = None,
) -> dict[str, Any]:
    """One Responses API step with function tools.

    With on_text the reply is streamed and on_text gets the text written so far after every piece.

    Returns {"id", "text", "calls": [{"call_id", "name", "arguments"}], "usage"}.
    Within one agent turn, later steps pass previous_response_id and only the
    function_call_output items, so the model keeps its own tool-call context.
    """
    model = _checked_model(model)
    stateless = on_openrouter(model)
    if stateless and previous_response_id:
        earlier = _conversations.get(previous_response_id)
        if earlier is None:
            raise LLMError("OpenRouter conversation of this turn was lost; send the message again")
        input_items = [*earlier, *input_items]
    url, api_key = _endpoint(model)
    provider = _provider(model)
    body: dict[str, Any] = {
        "model": model,
        "reasoning": _reasoning(),
        "instructions": instructions,
        "input": input_items,
        "tools": tools,
        "max_output_tokens": max_tokens,
        "parallel_tool_calls": True,
    }
    if previous_response_id and not stateless:
        body["previous_response_id"] = previous_response_id
    if on_text is not None:
        body["stream"] = True
    response = _post(url, api_key, body, stream=on_text is not None)
    if not response.ok:
        try:
            detail = response.json().get("error", {}).get("message")
        except ValueError:
            detail = response.text[:300]
        raise LLMError(f"{provider} returned {response.status_code}: {detail}")
    payload = _read_stream(response, on_text) if on_text is not None else response.json()
    if payload.get("status") not in (None, "completed"):
        reason = (payload.get("incomplete_details") or {}).get("reason")
        raise LLMError(f"{provider} response {payload.get('status')}: {reason}")
    calls = [
        {"call_id": item["call_id"], "name": item["name"], "arguments": item.get("arguments") or "{}"}
        for item in payload.get("output") or []
        if item.get("type") == "function_call"
    ]
    usage = dict(payload.get("usage") or {})
    usage["cost"] = _cost_usd(model, payload)
    usage["model"] = model
    if stateless and payload.get("id"):
        _remember(payload["id"], [*input_items, *_replayable(payload)])
    return {"id": payload.get("id"), "text": _output_text(payload), "calls": calls, "usage": usage}


# OpenRouter keeps no state, so the input and output of each step are kept here (by response id) for the next step of
# the same turn. A turn runs in one process; only the latest few turns are kept.
MAX_CONVERSATIONS = 64
_conversations: dict[str, list[dict[str, Any]]] = {}


def _remember(response_id: str, items: list[dict[str, Any]]) -> None:
    while len(_conversations) >= MAX_CONVERSATIONS:
        _conversations.pop(next(iter(_conversations)))
    _conversations[response_id] = items


def _replayable(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """The output items to send back as input: the reasoning (encrypted, so the model keeps its train of thought),
    the assistant's text and its tool calls."""
    return [item for item in payload.get("output") or [] if item.get("type") in ("reasoning", "message", "function_call")]


def _read_stream(response: requests.Response, on_text: Callable[[str], None]) -> dict[str, Any]:
    """Follow a streamed Responses API reply (server-sent events) and return its final response object."""
    text = ""
    try:
        # Decoded here as UTF-8: BytePlus sends text/event-stream without a charset, which requests would read as
        # ISO-8859-1, turning every emoji and dash into mojibake ("ðµ", "â").
        for line in response.iter_lines():
            raw = line.decode("utf-8", errors="replace") if isinstance(line, bytes) else line
            if not raw or not raw.startswith("data:"):
                continue
            data = raw[5:].strip()
            if data == "[DONE]":
                break
            try:
                event = json.loads(data)
            except json.JSONDecodeError:
                continue
            kind = event.get("type")
            if kind == "response.output_text.delta":
                text += event.get("delta") or ""
                on_text(text)
            elif kind in ("response.completed", "response.incomplete", "response.failed"):
                return event.get("response") or {}
            elif kind == "error":
                raise LLMError(f"Stream error: {event.get('message') or event.get('code')}")
    except requests.RequestException as exc:
        raise LLMError(f"Stream broke off: {exc}") from exc
    finally:
        response.close()
    raise LLMError("Stream ended without a response")


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
