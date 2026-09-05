"""Chat session lifecycle (single-user workspace)."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.db_models import Artifact, ChatMessage, ChatSession
from app.models.schemas import (
    SessionCreateResponse,
    SessionDetail,
    SessionMessage,
    SessionSummary,
)

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


@router.post("", response_model=SessionCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_session(db: AsyncSession = Depends(get_db)) -> ChatSession:
    session = ChatSession()
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("", response_model=List[SessionSummary])
async def list_sessions(db: AsyncSession = Depends(get_db)) -> List[SessionSummary]:
    """Return sessions that have at least one message, newest activity first.

    Empty sessions (created on page load but never used) are excluded so the
    sidebar only shows real conversations.
    """
    result = await db.execute(
        select(
            ChatSession.id,
            ChatSession.title,
            ChatSession.created_at,
            func.max(ChatMessage.created_at).label("last_message_at"),
            func.count(ChatMessage.id).label("message_count"),
        )
        .join(ChatMessage, ChatSession.id == ChatMessage.session_id)
        .group_by(ChatSession.id, ChatSession.title, ChatSession.created_at)
        .order_by(func.max(ChatMessage.created_at).desc())
    )
    return [
        SessionSummary(
            id=row.id,
            title=row.title,
            created_at=row.created_at,
            last_message_at=row.last_message_at,
            message_count=row.message_count,
        )
        for row in result.all()
    ]


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID, db: AsyncSession = Depends(get_db)
) -> None:
    """Delete a session and all of its messages."""
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Bulk-delete messages first to avoid any ORM lazy-load (MissingGreenlet)
    # that would occur if the cascade tried to resolve the messages collection.
    await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
    # Expunge the session object so the ORM doesn't try to refresh its
    # now-deleted messages relationship on commit.
    await db.delete(session)
    await db.flush()
    await db.commit()


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: UUID, db: AsyncSession = Depends(get_db)
) -> SessionDetail:
    """Return a session with its full message history (oldest first)."""
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.artifacts))
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return SessionDetail(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        messages=[
            SessionMessage(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                sources=msg.sources,
                created_at=msg.created_at,
                artifacts=[
                    {
                        "id": artifact.id,
                        "message_id": artifact.message_id,
                        "artifact_type": artifact.artifact_type,
                        "title": artifact.title,
                        "content": artifact.content,
                        "created_at": artifact.created_at,
                    }
                    for artifact in msg.artifacts
                ] if msg.artifacts else None,
            )
            for msg in result.scalars().all()
        ],
    )