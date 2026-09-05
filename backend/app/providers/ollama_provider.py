"""Ollama (local) LLM provider using the streaming /api/chat endpoint."""
import json
from typing import AsyncGenerator, Dict, List

import httpx

from app.config import settings
from app.providers.base import BaseLLMProvider


class OllamaProvider(BaseLLMProvider):
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 120.0,
    ):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model
        self.timeout = timeout

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        temperature: float = 0.3,
    ) -> AsyncGenerator[str, None]:
        # "think": False disables the hidden thinking phase on Qwen3-style
        # reasoning models; without it they burn tokens (and time) reasoning
        # and the visible answer can be delayed or never start.
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "stream": True,
            "options": {"temperature": temperature},
            "think": False,
        }

        # Connect timeout = 10s, read timeout = None (unlimited — model may
        # take a while to load/generate, especially for long artifact prompts).
        timeout = httpx.Timeout(connect=10.0, read=None, write=30.0, pool=5.0)

        saw_content = False

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/api/chat", json=payload
                ) as response:
                    if response.status_code != 200:
                        detail = (await response.aread()).decode(errors="ignore")[:300]
                        yield (
                            "[Error: Ollama unavailable "
                            f"(HTTP {response.status_code}): {detail}]"
                        )
                        return
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            saw_content = True
                            yield content
                    # Some reasoning builds ignore "think": False and stream only
                    # hidden thinking tokens. Surface that instead of an empty reply.
                    if not saw_content:
                        yield (
                            "[Error: the Ollama model responded with reasoning only and "
                            "no visible answer. Pull a non-reasoning model "
                            "(e.g. `ollama pull llama3.2:3b`) and set OLLAMA_MODEL. "
                            f"Model: {self.model}]"
                        )
        except httpx.ConnectError as exc:
            yield (
                "[Error: Cannot reach Ollama at "
                f"{self.base_url} ({type(exc).__name__}). "
                "Is the Ollama server running?]"
            )
        except httpx.HTTPError as exc:
            yield (
                "[Error: Ollama request failed "
                f"({type(exc).__name__}): {str(exc)[:200]}]"
            )