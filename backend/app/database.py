"""Async SQLAlchemy engine, session factory, and DB bootstrap helpers."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.models.db_models import Base

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

HNSW_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_transcript_hnsw
ON transcript_chunks
USING hnsw (embedding vector_cosine_ops)
"""


async def init_db() -> None:
    """Create the pgvector extension and all tables if they do not exist."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)


async def create_hnsw_index() -> None:
    """Create the HNSW index on the transcript embedding column (idempotent)."""
    async with engine.begin() as conn:
        await conn.execute(text(HNSW_INDEX_SQL))


async def get_db():
    """FastAPI dependency yielding an async database session."""
    async with AsyncSessionLocal() as session:
        yield session