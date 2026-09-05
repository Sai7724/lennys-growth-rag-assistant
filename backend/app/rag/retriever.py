"""pgvector hybrid similarity retriever over transcript chunks.

Retrieval contract (mirrors the PRD):
  - Embed the user query with the 384-dim MiniLM model.
  - Query the nearest chunks by cosine distance (HNSW index).
  - Keep only chunks whose cosine similarity >= threshold (default 0.65).
  - If nothing clears the threshold, the caller must emit the fallback message.
"""
from typing import Callable, Dict, List, Optional

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.db_models import TranscriptChunk
from app.rag.embeddings import embed_text

FALLBACK_MESSAGE = (
    "I do not have sufficient information in Lenny's podcast archive to answer this."
)


class TranscriptRetriever:
    def __init__(
        self,
        session_factory: Optional[Callable] = None,
        embed_fn: Optional[Callable[[str], List[float]]] = None,
        threshold: Optional[float] = None,
        top_k: int = 5,
    ):
        self._session_factory = session_factory or AsyncSessionLocal
        self._embed_fn = embed_fn or embed_text
        self.threshold = threshold if threshold is not None else settings.similarity_threshold
        self.top_k = top_k or settings.top_k

    async def retrieve_relevant_chunks(
        self,
        query: str,
        top_k: Optional[int] = None,
        threshold: Optional[float] = None,
    ) -> List[Dict]:
        """Return chunks whose cosine similarity to the query clears the threshold.

        Results are ordered by similarity (highest first) and capped at top_k.
        """
        top_k = top_k or self.top_k
        threshold = float(threshold if threshold is not None else self.threshold)

        query_vec = self._embed_fn(query)

        async with self._session_factory() as session:
            result = await session.execute(
                select(TranscriptChunk, TranscriptChunk.embedding.cosine_distance(query_vec).label("dist"))
                .order_by(
                    TranscriptChunk.embedding.cosine_distance(query_vec)  # type: ignore[attr-defined]
                )
                .limit(top_k * 3)
            )
            rows = result.mappings().all()

        candidates: List[Dict] = []
        for row in rows:
            chunk = row["TranscriptChunk"]
            dist = float(row["dist"])
            similarity = 1.0 - dist
            if similarity >= threshold:
                candidates.append(
                    {
                        "id": str(chunk.id),
                        "episode_title": chunk.episode_title,
                        "guest_name": chunk.guest_name,
                        "timestamp_ref": chunk.timestamp_ref,
                        "chunk_text": chunk.chunk_text,
                        "similarity": similarity,
                    }
                )

        candidates.sort(key=lambda c: c["similarity"], reverse=True)
        return candidates[:top_k]