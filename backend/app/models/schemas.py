"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SessionCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    created_at: datetime


class SessionSummary(BaseModel):
    """One row in the sidebar conversation list."""

    id: UUID
    title: str
    created_at: datetime
    last_message_at: datetime
    message_count: int


class SourceChunk(BaseModel):
    """A retrieved transcript chunk surfaced to the client for citation."""

    id: Optional[str] = None
    episode_title: str
    guest_name: str
    timestamp_ref: Optional[str] = None
    chunk_text: str
    similarity: Optional[float] = None


class Artifact(BaseModel):
    """A generated artifact (HTML/Markdown) associated with a message."""

    id: UUID
    message_id: UUID
    artifact_type: str
    title: str
    content: str
    created_at: datetime


class SessionMessage(BaseModel):
    """A single stored message, returned when opening a session."""

    id: UUID
    role: str
    content: str
    sources: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    artifacts: Optional[List[Artifact]] = None


class SessionDetail(BaseModel):
    """A session plus its full message history."""

    id: UUID
    title: str
    created_at: datetime
    messages: List[SessionMessage]


class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(min_length=1, max_length=8000)
    mode: Optional[str] = "default"  # "default" | "ship30"
    provider: Optional[str] = None  # "ollama" | "gemini" | "glm" | "huggingface" (None → default)


class HealthResponse(BaseModel):
    status: str
    database: str
    provider: str