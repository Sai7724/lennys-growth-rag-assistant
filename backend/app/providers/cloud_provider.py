"""Cloud LLM providers: Gemini, GLM, and Hugging Face — all streaming."""
import json
from typing import AsyncGenerator, Dict, List, Optional

import httpx

from app.config import settings
from app.providers.base import BaseLLMProvider


async def _stream_openai_compatible(
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    system_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 2048,
) -> AsyncGenerator[str, None]:
    """Helper to stream from any OpenAI-compatible chat completions endpoint via httpx."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "temperature": max(temperature, 0.01),
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "stream": True,
        "max_tokens": max_tokens,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    yield f"[Error: Request failed ({response.status_code}): {body.decode('utf-8', errors='replace')[:300]}]"
                    return
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            parsed = json.loads(data_str)
                            choices = parsed.get("choices") or []
                            if choices and choices[0].get("delta", {}).get("content"):
                                yield choices[0]["delta"]["content"]
                        except Exception:
                            continue
    except Exception as exc:
        yield f"[Error: Provider request failed ({type(exc).__name__}): {str(exc)[:300]}]"


class GeminiProvider(BaseLLMProvider):
    """Google Gemini via the google-genai SDK (2.x) async streaming API."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or settings.gemini_api_key
        self.model = model or settings.gemini_model

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        temperature: float = 0.3,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            yield (
                "[Error: Gemini API key not configured. "
                "Set GEMINI_API_KEY in your environment.]"
            )
            return

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.api_key)

        # Convert OpenAI message format → Gemini format
        gemini_contents = [
            types.Content(
                role="user" if m["role"] == "user" else "model",
                parts=[types.Part(text=m["content"])],
            )
            for m in messages
        ]

        async for chunk in await client.aio.models.generate_content_stream(
            model=self.model,
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=temperature,
            ),
        ):
            if chunk.text:
                yield chunk.text


class GLMProvider(BaseLLMProvider):
    """ZhipuAI GLM via its OpenAI-compatible API (https://open.bigmodel.cn/api/paas/v4/)."""

    GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or settings.glm_api_key
        self.model = model or settings.glm_model

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        temperature: float = 0.3,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            yield (
                "[Error: GLM API key not configured. "
                "Set GLM_API_KEY in your environment.]"
            )
            return

        async for token in _stream_openai_compatible(
            base_url=self.GLM_BASE_URL,
            api_key=self.api_key,
            model=self.model,
            messages=messages,
            system_prompt=system_prompt,
            temperature=temperature,
        ):
            yield token


class HuggingFaceProvider(BaseLLMProvider):
    """Hugging Face Inference API via the router endpoint."""

    HF_BASE_URL = "https://router.huggingface.co/v1"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or settings.hf_token
        target_model = model or settings.hf_model
        # mistralai/Mistral-7B-Instruct is deprecated on HF serverless router chat completions
        if not target_model or "mistralai/Mistral-7B" in target_model:
            target_model = "meta-llama/Llama-3.3-70B-Instruct"
        self.model = target_model

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        temperature: float = 0.3,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            yield (
                "[Error: Hugging Face token not configured. "
                "Set HF_TOKEN in your environment.]"
            )
            return

        async for token in _stream_openai_compatible(
            base_url=self.HF_BASE_URL,
            api_key=self.api_key,
            model=self.model,
            messages=messages,
            system_prompt=system_prompt,
            temperature=temperature,
        ):
            yield token
