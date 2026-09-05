"""Thin wrapper around the ingestion pipeline.

Primary entrypoint (per PRD and repo docs): `python -m app.scripts.ingest`.
This file also enables `python backend/scripts/ingest.py` from the repo root
and `python -m scripts.ingest` from backend/ — both delegate to the same code.

The pipeline clones/pulls the transcript repo (TRANSCRIPTS_REPO_URL), parses
episodes/*/transcript.md frontmatter, chunks (~600 chars / 100 overlap),
embeds, and loads into pgvector with an HNSW index.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.scripts.ingest import main  # noqa: E402

if __name__ == "__main__":
    main()