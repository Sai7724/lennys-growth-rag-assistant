"""Artifact management API."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.db_models import Artifact
from app.models.schemas import Artifact as ArtifactSchema

router = APIRouter(prefix="/api/artifacts", tags=["Artifacts"])


@router.get("", response_model=List[ArtifactSchema])
async def list_artifacts(db: AsyncSession = Depends(get_db)) -> List[ArtifactSchema]:
    """Return all artifacts, ordered by creation date (newest first)."""
    result = await db.execute(
        select(Artifact).order_by(Artifact.created_at.desc())
    )
    artifacts = result.scalars().all()
    return [
        ArtifactSchema(
            id=artifact.id,
            message_id=artifact.message_id,
            artifact_type=artifact.artifact_type,
            title=artifact.title,
            content=artifact.content,
            created_at=artifact.created_at,
        )
        for artifact in artifacts
    ]


@router.get("/{artifact_id}", response_model=ArtifactSchema)
async def get_artifact(artifact_id: UUID, db: AsyncSession = Depends(get_db)) -> ArtifactSchema:
    """Return a single artifact by ID."""
    artifact = await db.get(Artifact, artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return ArtifactSchema(
        id=artifact.id,
        message_id=artifact.message_id,
        artifact_type=artifact.artifact_type,
        title=artifact.title,
        content=artifact.content,
        created_at=artifact.created_at,
    )
