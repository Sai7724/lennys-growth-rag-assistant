"""Embedding utilities backed by sentence-transformers/all-MiniLM-L6-v2.

The model is loaded lazily (and cached) so importing this module stays cheap
and tests never pay the torch import cost unless they actually embed.

If HF_TOKEN is set in the environment the SentenceTransformer download call
will authenticate with Hugging Face, which is required for gated/private models
(e.g. any Llama-family embedding model) and avoids anonymous rate-limits.
"""
from functools import lru_cache
from typing import List, Sequence

import numpy as np

from app.config import settings

EMBEDDING_DIMENSION = 384


@lru_cache
def get_embedding_model():
    """Load (once) the sentence-transformers embedding model.

    Passes the HF token when available so gated models can be downloaded
    without a separate `huggingface-cli login` step.
    """
    from sentence_transformers import SentenceTransformer

    token: str | None = settings.hf_token or None  # empty string → None
    return SentenceTransformer(settings.embedding_model, token=token)


def embed_texts(texts: Sequence[str]) -> List[List[float]]:
    """Embed a batch of texts, returning normalized unit vectors."""
    if not texts:
        return []
    model = get_embedding_model()
    vectors = model.encode(
        list(texts),
        normalize_embeddings=True,
        batch_size=32,
        show_progress_bar=False,
    )
    return vectors.tolist()


def embed_text(text: str) -> List[float]:
    """Embed a single text."""
    return embed_texts([text])[0]


def compute_cosine_similarity(a: List[float], b: List[float]) -> float:
    """Cosine similarity between two dense vectors."""
    vec_a = np.asarray(a, dtype=np.float32).reshape(-1)
    vec_b = np.asarray(b, dtype=np.float32).reshape(-1)
    norm_prod = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
    if norm_prod == 0.0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / norm_prod)