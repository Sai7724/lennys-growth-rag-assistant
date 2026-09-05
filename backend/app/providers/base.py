"""Abstract base class for LLM providers."""
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, List


class BaseLLMProvider(ABC):
    """Interface implemented by every LLM backend (local or cloud)."""

    @abstractmethod
    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        temperature: float = 0.3,
    ) -> AsyncGenerator[str, None]:
        """Yield response tokens as they are generated."""
        yield  # pragma: no cover
        raise NotImplementedError