"""
Local LLM client backed by Ollama.

Runs entirely on the local machine — no API keys, no external calls, no
per-token cost. Used to generate vendor chat replies and AI voice call
transcripts.

Every public function degrades gracefully: if Ollama is not running or a
request fails, callers get `None` back and fall through to the static
keyword responses. The app must never break because the model is down.

Configuration (environment variables):
    OLLAMA_HOST   default http://localhost:11434
    OLLAMA_MODEL  default qwen2.5:3b

Model choice: qwen2.5:3b is the default. Compared against qwen2.5:7b on the
actual vendor-chat prompts, 7b was marginally more conversational but averaged
roughly 25% slower per reply with no gain in factual accuracy — both models
correctly stick to the fleet data given to them once the system prompt avoids
example values the model could mistake for facts (see
communication.py::_vendor_system_prompt for that lesson). For an interactive
chat demo, 3b's speed wins. Set OLLAMA_MODEL=qwen2.5:7b to switch.
"""

import json
import logging
import os
from typing import Generator

import requests

logger = logging.getLogger(__name__)


OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")

# Chat replies are short; keep the timeout tight so the UI stays responsive.
# A cold start (model loading into RAM) costs ~15s, so this must exceed that.
CHAT_TIMEOUT = 45

# Transcripts are longer multi-turn generations and need more headroom.
TRANSCRIPT_TIMEOUT = 90

# How long Ollama holds the model in memory after a request. Without this the
# model unloads between requests and every call pays the cold-start penalty.
KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")


def is_available() -> bool:
    """Return True if the Ollama server is reachable and has the model."""

    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        response.raise_for_status()

        models = [m["name"] for m in response.json().get("models", [])]

        # Ollama reports tags like "qwen2.5:3b"; accept a bare-name match too
        # so OLLAMA_MODEL=qwen2.5 still resolves.
        return any(
            name == OLLAMA_MODEL or name.startswith(f"{OLLAMA_MODEL}:")
            for name in models
        )

    except requests.RequestException:
        return False


def chat(
    system_prompt: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 300,
    timeout: int = CHAT_TIMEOUT,
) -> str | None:
    """
    Run a chat completion against the local model.

    Args:
        system_prompt: Persona and instructions for the model.
        messages: Conversation turns as [{"role": "user"|"assistant",
            "content": str}, ...].
        temperature: Sampling temperature.
        max_tokens: Upper bound on generated tokens.
        timeout: Seconds to wait before giving up.

    Returns:
        The generated text, or None if generation failed for any reason.
    """

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            *messages,
        ],
        "stream": False,
        "keep_alive": KEEP_ALIVE,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/chat",
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()

        content = (
            response.json()
            .get("message", {})
            .get("content", "")
            .strip()
        )

        return content or None

    except requests.Timeout:
        logger.warning(
            "Ollama request timed out after %ss (model=%s)",
            timeout,
            OLLAMA_MODEL,
        )
        return None

    except requests.RequestException as exc:
        logger.warning("Ollama request failed: %s", exc)
        return None

    except (KeyError, ValueError) as exc:
        logger.warning("Unexpected Ollama response shape: %s", exc)
        return None


def chat_stream(
    system_prompt: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 300,
    timeout: int = CHAT_TIMEOUT,
) -> Generator[str, None, None]:
    """
    Run a streaming chat completion against the local model.

    Yields text chunks as they are generated. If the request fails before
    any chunk is produced, the generator simply yields nothing — callers
    should check whether they received any output and fall back to the
    static replies if not (same contract as `chat()` returning None).

    If the connection drops mid-stream, whatever was already yielded stays
    with the caller; there is no retry, since partial replies are still
    useful to display and the caller can decide how to handle the cutoff.
    """

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            *messages,
        ],
        "stream": True,
        "keep_alive": KEEP_ALIVE,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/chat",
            json=payload,
            timeout=timeout,
            stream=True,
        )
        response.raise_for_status()

        for line in response.iter_lines():
            if not line:
                continue

            try:
                chunk = json.loads(line)
            except json.JSONDecodeError:
                continue

            piece = chunk.get("message", {}).get("content", "")
            if piece:
                yield piece

            if chunk.get("done"):
                break

    except requests.Timeout:
        logger.warning(
            "Ollama stream timed out after %ss (model=%s)",
            timeout,
            OLLAMA_MODEL,
        )
        return

    except requests.RequestException as exc:
        logger.warning("Ollama stream failed: %s", exc)
        return


def warmup() -> bool:
    """
    Load the model into memory ahead of the first real request.

    A cold Ollama model costs roughly 15 seconds on first token. Calling this
    at application startup moves that cost off the user's first message.
    Returns True if the model responded.
    """

    if not is_available():
        logger.info(
            "Ollama not available at %s (model=%s); "
            "chat and voice will use static fallback replies",
            OLLAMA_HOST,
            OLLAMA_MODEL,
        )
        return False

    result = chat(
        system_prompt="You are a helpful assistant.",
        messages=[{"role": "user", "content": "Reply with the single word: ready"}],
        max_tokens=5,
        timeout=CHAT_TIMEOUT,
    )

    if result:
        logger.info("LLM warm and ready (model=%s)", OLLAMA_MODEL)
        return True

    logger.warning("LLM warmup failed (model=%s)", OLLAMA_MODEL)
    return False


def model_info() -> dict:
    """Return current LLM configuration and availability, for diagnostics."""

    return {
        "provider": "ollama",
        "host": OLLAMA_HOST,
        "model": OLLAMA_MODEL,
        "keep_alive": KEEP_ALIVE,
        "available": is_available(),
    }
