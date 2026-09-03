"""
LLM client with two interchangeable backends: Groq (cloud) and Ollama (local).

Provider selection:
  - If GROQ_API_KEY is set, Groq is used (fast cloud inference, sub-second).
  - Otherwise falls back to Ollama running locally.
  - If neither is available, callers get None / empty and fall through to the
    static keyword responses. The app must never break because the model is
    down.

The public API (chat, chat_stream, warmup, model_info, is_available) is
provider-agnostic — callers in communication.py don't know or care which
backend answered.

Configuration (environment variables):
    GROQ_API_KEY   (unset)                     enables Groq when present
    GROQ_MODEL     moonshotai/kimi-k2-instruct Groq model (Kimi K2 by default)
    OLLAMA_HOST    http://localhost:11434       local fallback
    OLLAMA_MODEL   qwen2.5:3b                    local fallback model

Model choice:
  - Groq + Kimi K2: very high quality, sub-second latency, free tier
    (30 req/min). Preferred for the hosted demo.
  - Ollama + qwen2.5:3b: fully local, no key, no cost. Good offline fallback,
    3-6s warm latency.
"""

import json
import logging
import os
from typing import Generator

import requests

logger = logging.getLogger(__name__)


# --------------------------------------------------
# Configuration
# --------------------------------------------------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")

# Which backend is active. Groq wins when its key is present.
PROVIDER = "groq" if GROQ_API_KEY else "ollama"

# Chat replies are short. Groq is sub-second; Ollama cold start can be ~15s,
# so the timeout must exceed that when running locally.
CHAT_TIMEOUT = 45

# Transcripts are longer multi-turn generations and need more headroom.
TRANSCRIPT_TIMEOUT = 90

# How long Ollama holds the model in memory after a request (Ollama only).
KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")


def _active_model() -> str:
    return GROQ_MODEL if PROVIDER == "groq" else OLLAMA_MODEL


# --------------------------------------------------
# Availability
# --------------------------------------------------

def is_available() -> bool:
    """Return True if the active backend is reachable."""

    if PROVIDER == "groq":
        # A configured key is treated as available; the first real call will
        # surface any auth error and fall back to static replies.
        return bool(GROQ_API_KEY)

    # Ollama: check the server is up and the model is pulled.
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        response.raise_for_status()
        models = [m["name"] for m in response.json().get("models", [])]
        return any(
            name == OLLAMA_MODEL or name.startswith(f"{OLLAMA_MODEL}:")
            for name in models
        )
    except requests.RequestException:
        return False


# --------------------------------------------------
# Groq backend (OpenAI-compatible API)
# --------------------------------------------------

def _groq_chat(
    system_prompt: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    timeout: int,
) -> str | None:

    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "system", "content": system_prompt}, *messages],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    try:
        response = requests.post(
            f"{GROQ_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
        content = (
            response.json()["choices"][0]["message"]["content"].strip()
        )
        return content or None

    except requests.RequestException as exc:
        logger.warning("Groq request failed: %s", exc)
        return None
    except (KeyError, IndexError, ValueError) as exc:
        logger.warning("Unexpected Groq response shape: %s", exc)
        return None


def _groq_chat_stream(
    system_prompt: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    timeout: int,
) -> Generator[str, None, None]:

    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "system", "content": system_prompt}, *messages],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    try:
        response = requests.post(
            f"{GROQ_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json=payload,
            timeout=timeout,
            stream=True,
        )
        response.raise_for_status()

        for line in response.iter_lines():
            if not line:
                continue

            # SSE frames from the OpenAI-compatible endpoint: "data: {json}"
            text = line.decode("utf-8") if isinstance(line, bytes) else line
            if not text.startswith("data:"):
                continue

            data = text[5:].strip()
            if data == "[DONE]":
                break

            try:
                chunk = json.loads(data)
                piece = chunk["choices"][0]["delta"].get("content", "")
                if piece:
                    yield piece
            except (json.JSONDecodeError, KeyError, IndexError):
                continue

    except requests.RequestException as exc:
        logger.warning("Groq stream failed: %s", exc)
        return


# --------------------------------------------------
# Ollama backend
# --------------------------------------------------

def _ollama_chat(
    system_prompt: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    timeout: int,
) -> str | None:

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system_prompt}, *messages],
        "stream": False,
        "keep_alive": KEEP_ALIVE,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }

    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/chat", json=payload, timeout=timeout
        )
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "").strip()
        return content or None

    except requests.Timeout:
        logger.warning("Ollama request timed out after %ss", timeout)
        return None
    except requests.RequestException as exc:
        logger.warning("Ollama request failed: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.warning("Unexpected Ollama response shape: %s", exc)
        return None


def _ollama_chat_stream(
    system_prompt: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    timeout: int,
) -> Generator[str, None, None]:

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system_prompt}, *messages],
        "stream": True,
        "keep_alive": KEEP_ALIVE,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }

    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/chat", json=payload, timeout=timeout, stream=True
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
        logger.warning("Ollama stream timed out after %ss", timeout)
        return
    except requests.RequestException as exc:
        logger.warning("Ollama stream failed: %s", exc)
        return


# --------------------------------------------------
# Public API (provider-agnostic)
# --------------------------------------------------

def chat(
    system_prompt: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 300,
    timeout: int = CHAT_TIMEOUT,
) -> str | None:
    """
    Run a chat completion against the active backend.

    Returns the generated text, or None if generation failed for any reason
    (so callers can fall back to static replies).
    """
    if PROVIDER == "groq":
        return _groq_chat(system_prompt, messages, temperature, max_tokens, timeout)
    return _ollama_chat(system_prompt, messages, temperature, max_tokens, timeout)


def chat_stream(
    system_prompt: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 300,
    timeout: int = CHAT_TIMEOUT,
) -> Generator[str, None, None]:
    """
    Stream a chat completion against the active backend.

    Yields text chunks as generated. Yields nothing if the request fails
    before any chunk (callers detect empty output and fall back).
    """
    if PROVIDER == "groq":
        yield from _groq_chat_stream(
            system_prompt, messages, temperature, max_tokens, timeout
        )
    else:
        yield from _ollama_chat_stream(
            system_prompt, messages, temperature, max_tokens, timeout
        )


def warmup() -> bool:
    """
    Prime the active backend ahead of the first real request.

    For Ollama this loads the model into RAM (~15s cold start). For Groq it's
    a cheap connectivity check. Non-fatal — failure just means static replies.
    """
    if not is_available():
        logger.info(
            "LLM not available (provider=%s, model=%s); "
            "chat and voice will use static fallback replies",
            PROVIDER, _active_model(),
        )
        return False

    result = chat(
        system_prompt="You are a helpful assistant.",
        messages=[{"role": "user", "content": "Reply with the single word: ready"}],
        max_tokens=5,
        timeout=CHAT_TIMEOUT,
    )

    if result:
        logger.info("LLM warm and ready (provider=%s, model=%s)", PROVIDER, _active_model())
        return True

    logger.warning("LLM warmup failed (provider=%s, model=%s)", PROVIDER, _active_model())
    return False


def model_info() -> dict:
    """Return current LLM configuration and availability, for diagnostics."""
    return {
        "provider": PROVIDER,
        "model": _active_model(),
        "host": GROQ_BASE_URL if PROVIDER == "groq" else OLLAMA_HOST,
        "keep_alive": KEEP_ALIVE if PROVIDER == "ollama" else None,
        "available": is_available(),
    }
