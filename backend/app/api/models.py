"""Models endpoint — returns configured provider/model info for the UI."""
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api", tags=["Models"])


class ProviderInfo(BaseModel):
    value: str        # provider key sent in chat requests
    label: str        # short display name
    model: str        # full model name
    local: bool       # True = runs locally, no API key needed
    available: bool   # False = API key not configured


class ModelsResponse(BaseModel):
    providers: list[ProviderInfo]
    default: str


@router.get("/models", response_model=ModelsResponse)
async def get_models() -> ModelsResponse:
    providers = [
        ProviderInfo(
            value="ollama",
            label="Ollama",
            model=settings.ollama_model,
            local=True,
            available=True,
        ),
        ProviderInfo(
            value="gemini",
            label="Gemini",
            model=settings.gemini_model,
            local=False,
            available=bool(settings.gemini_api_key),
        ),
        ProviderInfo(
            value="glm",
            label="GLM",
            model=settings.glm_model,
            local=False,
            available=bool(settings.glm_api_key),
        ),
        ProviderInfo(
            value="huggingface",
            label="HuggingFace",
            model="meta-llama/Llama-3.3-70B-Instruct" if "mistralai/Mistral-7B" in settings.hf_model else settings.hf_model,
            local=False,
            available=bool(settings.hf_token),
        ),
    ]
    return ModelsResponse(providers=providers, default=settings.default_provider)
