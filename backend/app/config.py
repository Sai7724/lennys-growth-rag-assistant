"""Application settings loaded from environment / .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/app -> backend -> project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Load both .env files; backend/.env takes precedence over root .env
        env_file=(
            str(PROJECT_ROOT / ".env"),
            str(PROJECT_ROOT / "backend" / ".env"),
        ),
        env_file_encoding="utf-8",
        env_ignore_empty=False,
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Lenny Growth Assistant API"

    # Database
    database_url: str = (
        "postgresql+asyncpg://postgres:password123@localhost:5432/lenny_assistant"
    )

    # Provider routing
    default_provider: str = "ollama"  # "ollama" | "gemini" | "glm" | "huggingface"

    # Ollama (local)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen-uncensored:latest"

    # Cloud providers
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    glm_api_key: str = ""
    glm_model: str = "glm-4.7-flash"

    # Hugging Face
    hf_token: str = ""
    hf_model: str = "meta-llama/Llama-3.3-70B-Instruct"  # HF Inference API model

    # RAG / embeddings
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    similarity_threshold: float = 0.65
    top_k: int = 5

    # Ingestion
    chunk_size: int = 600
    chunk_overlap: int = 100
    # Defaults to <project root>/data/transcripts so ingestion works no matter
    # which directory the command is run from (backend/, repo root, container).
    transcript_dir: str = Field(
        default=str(PROJECT_ROOT / "data" / "transcripts"),
        validation_alias=AliasChoices("TRANSCRIPTS_DIR", "TRANSCRIPT_DIR"),
    )
    # Optional Git repo to clone/pull transcripts from (empty = local files only).
    transcripts_repo_url: str = (
        "https://github.com/ChatPRD/lennys-podcast-transcripts.git"
    )

    # CORS
    cors_origins: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()