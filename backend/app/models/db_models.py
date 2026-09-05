"""SQLAlchemy ORM models backed by PostgreSQL + pgvector."""
import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import declarative_base, relationship

from app.rag.embeddings import EMBEDDING_DIMENSION

Base = declarative_base()


class TranscriptChunk(Base):
    """A single chunk of a podcast transcript with its embedding vector."""

    __tablename__ = "transcript_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    episode_title = Column(String(255), nullable=False)
    guest_name = Column(String(255), nullable=False)
    timestamp_ref = Column(String(50), nullable=True)
    chunk_text = Column(Text, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIMENSION))


class ChatSession(Base):
    """A single-user chat session."""

    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), default="New Growth Chat")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    messages = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    """A single message within a chat session, with optional cited sources."""

    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id"))
    role = Column(String(50), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    sources = Column(JSONB, nullable=True)  # JSON list of cited chunks
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    session = relationship("ChatSession", back_populates="messages")


class Artifact(Base):
    """A generated artifact (HTML/Markdown) associated with a message."""

    __tablename__ = "artifacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="CASCADE"))
    artifact_type = Column(String(50), nullable=False)  # "html" | "markdown"
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    message = relationship("ChatMessage", backref="artifacts")