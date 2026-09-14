"""Optional LLM backends for the Event Horizon operator assistant.

Every provider here is *optional*. `generate()` returns ``None`` on a missing
key, an unsupported provider, a transport error, a non-200 response or an empty
completion — and the caller then serves the deterministic scripted answer. No
failure in this module may ever block an operator from seeing the SOP.

Nothing here is allowed to widen what the assistant may say: the system prompt
is the same evidence boundary the scripted answer respects, and the incident and
SOP supplied by the caller are the only facts the model is given.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

# Groq sits behind Cloudflare, which rejects urllib's default `Python-urllib/3.x`
# user agent with HTTP 403 (error 1010). Every request here sends a real one.
USER_AGENT = "event-horizon-assistant/0.2"
TIMEOUT_S = 12

SYSTEM_PROMPT = (
    "You are the Event Horizon operator assistant. You explain only the evidence and the "
    "sample SOP supplied in the user message. "
    "Absolute rules: do not invent counts, densities, probabilities, timings, routes, camera "
    "names, contacts, approvals or procedure steps that are not in the supplied JSON. Do not "
    "suggest any action that is not in the supplied SOP — in particular do not suggest checking "
    "power, cabling, network, firmware or logs unless the SOP says so. Never state or imply that "
    "a crowd is safe, and never describe any reading as a probability of a dangerous event. "
    "Say plainly when the evidence does not support an answer. Every decision belongs to an "
    "authorised human. "
    "Answer in at most 120 words, in this order: what the evidence shows, what it does not "
    "establish, then the SOP steps verbatim in the order given. "
    "Plain text only: no markdown, no asterisks, no headings, no bullet symbols. Number the "
    "SOP steps 1., 2., 3. on their own lines."
)

# `gemini-flash-latest` rather than a pinned 2.5 release: Google has closed the
# 2.5 models to new API keys, so a pinned one 404s on a freshly issued key.
DEFAULT_MODELS = {
    "groq": "openai/gpt-oss-120b",
    "gemini": "gemini-flash-latest",
    "openai": "gpt-5-mini",
}

ENV_KEYS = {
    "groq": "GROQ_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
}


def configured_provider() -> str | None:
    """The provider that will actually be used, or None if no key is present.

    An explicit ``LLM_PROVIDER`` wins, but only if its key is set; otherwise the
    first provider with a key is used, so adding a key is enough to enable one.
    """
    named = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    if named in ENV_KEYS and os.getenv(ENV_KEYS[named]):
        return named
    if named and named not in ENV_KEYS:
        return None
    for provider, env_key in ENV_KEYS.items():
        if os.getenv(env_key):
            return provider
    return None


def describe() -> dict[str, Any]:
    """Non-secret view of the assistant configuration, safe to expose."""
    provider = configured_provider()
    return {
        "provider": provider,
        "model": model_for(provider) if provider else None,
        "keys_present": sorted(name for name, env in ENV_KEYS.items() if os.getenv(env)),
        "fallback": "deterministic scripted answer",
    }


def model_for(provider: str) -> str:
    override = os.getenv(f"{provider.upper()}_MODEL")
    return override.strip() if override else DEFAULT_MODELS[provider]


def generate(question: str, incident: dict[str, Any], sop: dict[str, Any]) -> tuple[str, str] | None:
    """Ask the configured provider to explain this incident against this SOP.

    @returns ``(text, "llm:<provider>/<model>")`` or ``None`` to fall back.
    """
    provider = configured_provider()
    if provider is None:
        return None

    model = model_for(provider)
    payload = json.dumps(
        {"question": question, "incident": incident, "sop": sop},
        ensure_ascii=False,
    )

    try:
        if provider == "gemini":
            text = _call_gemini(model, payload)
        elif provider == "groq":
            text = _call_openai_compatible(
                "https://api.groq.com/openai/v1/chat/completions",
                os.environ[ENV_KEYS["groq"]],
                model,
                payload,
            )
        else:
            text = _call_openai_compatible(
                "https://api.openai.com/v1/chat/completions",
                os.environ[ENV_KEYS["openai"]],
                model,
                payload,
            )
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, OSError):
        # Deliberately broad: any provider fault degrades to the scripted answer
        # rather than surfacing as an error in front of an operator.
        return None

    text = plain_text(text or "")
    return (text, f"llm:{provider}/{model}") if text else None


_MARKDOWN_EMPHASIS = re.compile(r"(\*\*|__|`)")
_MARKDOWN_HEADING = re.compile(r"^\s{0,3}#{1,6}\s*", re.MULTILINE)
_MARKDOWN_BULLET = re.compile(r"^\s*[-*•]\s+", re.MULTILINE)


def plain_text(text: str) -> str:
    """Strip markdown the model may emit despite the prompt.

    The console renders the answer as plain pre-wrapped text, so stray
    asterisks and hashes would show up literally in front of an operator.
    """
    text = _MARKDOWN_EMPHASIS.sub("", text)
    text = _MARKDOWN_HEADING.sub("", text)
    text = _MARKDOWN_BULLET.sub("- ", text)
    return text.strip()


def _post_json(url: str, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT, **headers},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
        return json.load(response)


def _call_openai_compatible(url: str, key: str, model: str, payload: str) -> str | None:
    """Groq and OpenAI both speak the chat-completions shape."""
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": payload},
        ],
        "temperature": 0.2,
        "max_completion_tokens": 700,
    }
    # Reasoning models spend the token budget thinking before they answer; a low
    # effort keeps the operator's answer inside the budget and inside a second.
    if "gpt-oss" in model or "qwen3" in model:
        body["reasoning_effort"] = "low"

    data = _post_json(url, {"Authorization": f"Bearer {key}"}, body)
    return data["choices"][0]["message"].get("content")


def _call_gemini(model: str, payload: str) -> str | None:
    data = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        {"x-goog-api-key": os.environ[ENV_KEYS["gemini"]]},
        {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": payload}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 700},
        },
    )
    parts = data["candidates"][0]["content"]["parts"]
    return "\n".join(part["text"] for part in parts if isinstance(part.get("text"), str))
