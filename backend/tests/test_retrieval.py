"""Retrieval tests: vector similarity math, chunking, threshold filtering,
and the exact fallback message contract."""
import uuid
from typing import List

import pytest

from app.models.db_models import TranscriptChunk
from app.rag.embeddings import compute_cosine_similarity
from app.rag.retriever import FALLBACK_MESSAGE, TranscriptRetriever
from app.scripts.ingest import (
    discover_transcript_files,
    extract_metadata,
    parse_frontmatter,
    parse_transcript_file,
    split_into_chunks,
)

THRESHOLD = 0.65


# ── Cosine similarity math ────────────────────────────────────────────────────


def test_cosine_similarity_identical_is_one():
    assert compute_cosine_similarity([1.0, 0.0, 0.0], [1.0, 0.0, 0.0]) == pytest.approx(1.0)


def test_cosine_similarity_orthogonal_is_zero():
    assert compute_cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_similarity_partial_match():
    sim = compute_cosine_similarity([1.0, 0.0], [0.8, 0.6])
    assert sim == pytest.approx(0.8, abs=1e-5)


def test_cosine_similarity_zero_vector_is_zero():
    assert compute_cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0


# ── Chunking ──────────────────────────────────────────────────────────────────


def test_chunking_respects_size_and_produces_overlap():
    text = "".join(f"segment number {i}. " for i in range(200))
    chunks = split_into_chunks(text, chunk_size=600, overlap=100)
    assert len(chunks) > 1
    assert all(len(c) <= 620 for c in chunks)  # small slack for boundary breaks
    assert all(len(c) > 0 for c in chunks)
    # Adjacent chunks share the tail of the previous chunk (overlap continuity).
    assert chunks[0][-100:] in chunks[1]


def test_chunking_empty_text():
    assert split_into_chunks("   \n  ") == []


# ── Metadata extraction ───────────────────────────────────────────────────────


def test_metadata_from_filename(tmp_path):
    file_path = tmp_path / "How to Grow - Alice Smith.md"
    file_path.write_text("Guest: Alice Smith\nSome body text.")
    title, guest = extract_metadata(file_path)
    assert title == "How to Grow"
    assert guest == "Alice Smith"


def test_metadata_falls_back_to_headers(tmp_path):
    file_path = tmp_path / "random_stem.txt"
    file_path.write_text("Title: Pricing Tiers\nGuest: Bob Lee\nbody")
    title, guest = extract_metadata(file_path)
    assert title == "Pricing Tiers"
    assert guest == "Bob Lee"


# ── YAML frontmatter parsing (repo format) ────────────────────────────────────


def test_parse_frontmatter_extracts_metadata_and_body():
    content = (
        "---\n"
        "guest: Casey Winters\n"
        "title: Retention IRL\n"
        "publish_date: 2024-01-15\n"
        "youtube_url: https://youtu.be/abc\n"
        "---\n"
        "First sentence of the transcript.\n"
    )
    meta, body = parse_frontmatter(content)
    assert meta["guest"] == "Casey Winters"
    assert meta["title"] == "Retention IRL"
    # PyYAML parses ISO dates into datetime.date; the pipeline stringifies it.
    assert str(meta["publish_date"]) == "2024-01-15"
    assert "First sentence of the transcript." in body


def test_parse_frontmatter_no_frontmatter():
    meta, body = parse_frontmatter("Just a plain transcript body.")
    assert meta == {}
    assert body == "Just a plain transcript body."


def test_parse_frontmatter_malformed_yaml_does_not_crash():
    meta, body = parse_frontmatter("---\nguest: [unclosed\n---\nbody\n")
    assert meta == {}
    assert "body" in body


def test_parse_transcript_file_uses_frontmatter(tmp_path):
    episode_dir = tmp_path / "episodes" / "casey-winters"
    episode_dir.mkdir(parents=True)
    file_path = episode_dir / "transcript.md"
    file_path.write_text(
        "---\n"
        "guest: Casey Winters\n"
        "title: Retention Playbooks\n"
        "publish_date: 2024-03-01\n"
        "---\n"
        + "Sentence one. " * 40
    )
    rows = list(parse_transcript_file(file_path, chunk_size=200, overlap=50))
    assert len(rows) >= 2
    title, guest, timestamp_ref, chunk = rows[0]
    assert title == "Retention Playbooks"
    assert guest == "Casey Winters"
    assert timestamp_ref == "2024-03-01"
    assert len(chunk) > 0


def test_parse_transcript_file_falls_back_to_folder_name(tmp_path):
    episode_dir = tmp_path / "episodes" / "lena-khan"
    episode_dir.mkdir(parents=True)
    file_path = episode_dir / "transcript.md"
    file_path.write_text("Plain body without frontmatter. " * 30)
    rows = list(parse_transcript_file(file_path, chunk_size=300, overlap=50))
    _, guest, timestamp_ref, _ = rows[0]
    assert guest == "Lena Khan"
    assert timestamp_ref is None


def test_discover_transcript_files_prefers_episodes_layout(tmp_path):
    episodes = tmp_path / "episodes"
    (episodes / "guest-a").mkdir(parents=True)
    (episodes / "guest-b").mkdir()
    (episodes / "guest-a" / "transcript.md").write_text("a")
    (episodes / "guest-b" / "transcript.md").write_text("b")
    (tmp_path / "stray.md").write_text("stray")
    (tmp_path / "README.md").write_text("readme")

    files = discover_transcript_files(tmp_path)
    assert len(files) == 2
    assert all("transcript.md" in str(f) for f in files)


def test_discover_transcript_files_legacy_excludes_readme(tmp_path):
    (tmp_path / "Retention - Casey Winters.md").write_text("x")
    (tmp_path / "README.md").write_text("readme")
    files = discover_transcript_files(tmp_path)
    assert len(files) == 1
    assert "README" not in files[0].name


# ── Retriever threshold filtering ─────────────────────────────────────────────


class _FakeResult:
    def __init__(self, rows, query_vec=None):
        self._rows = rows
        self._query_vec = query_vec

    def mappings(self):
        return _FakeMappings(self._rows, self._query_vec)

    def scalars(self):
        return _FakeScalars(self._rows)


class _FakeMappings:
    def __init__(self, rows, query_vec=None):
        self._rows = rows
        self._query_vec = query_vec

    def all(self):
        if self._query_vec is not None:
            from app.rag.embeddings import compute_cosine_similarity
            return [
                {
                    "TranscriptChunk": row,
                    "dist": 1.0 - compute_cosine_similarity(self._query_vec, row.embedding),
                }
                for row in self._rows
            ]
        return [
            {
                "TranscriptChunk": row,
            }
            for row in self._rows
        ]


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self) -> List[TranscriptChunk]:
        return self._rows


class _FakeSession:
    def __init__(self, rows, query_vec=None):
        self._rows = rows
        self._query_vec = query_vec

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def execute(self, stmt):
        return _FakeResult(self._rows, self._query_vec)


def _chunk_row(episode: str, guest: str, embedding: List[float]) -> TranscriptChunk:
    return TranscriptChunk(
        id=uuid.uuid4(),
        episode_title=episode,
        guest_name=guest,
        timestamp_ref="00:12:30",
        chunk_text=f"sample text from {episode}",
        embedding=embedding,
    )


async def test_retriever_keeps_only_above_threshold():
    similar = _chunk_row("Retention", "Casey W", [1.0, 0.0])
    unrelated = _chunk_row("Pricing", "Bob Lee", [0.0, 1.0])

    retriever = TranscriptRetriever(
        session_factory=lambda: _FakeSession([similar, unrelated], query_vec=[1.0, 0.0]),
        embed_fn=lambda _query: [1.0, 0.0],  # matches `similar`
        threshold=THRESHOLD,
        top_k=5,
    )
    results = await retriever.retrieve_relevant_chunks("retention question")
    assert len(results) == 1
    assert results[0]["episode_title"] == "Retention"
    assert results[0]["similarity"] >= THRESHOLD


async def test_retriever_returns_empty_below_threshold():
    unrelated = _chunk_row("Pricing", "Bob Lee", [0.0, 1.0])

    retriever = TranscriptRetriever(
        session_factory=lambda: _FakeSession([unrelated], query_vec=[1.0, 0.0]),
        embed_fn=lambda _query: [1.0, 0.0],  # nothing matches
        threshold=THRESHOLD,
        top_k=5,
    )
    results = await retriever.retrieve_relevant_chunks("retention question")
    assert results == []


async def test_retriever_sorts_by_similarity_descending():
    rows = [
        _chunk_row("Medium", "Mid G", [0.9, 0.1]),
        _chunk_row("Low", "Low G", [0.3, 0.4]),  # cosine 0.6 -> below threshold
        _chunk_row("High", "High G", [1.0, 0.0]),
    ]
    retriever = TranscriptRetriever(
        session_factory=lambda: _FakeSession(rows, query_vec=[1.0, 0.0]),
        embed_fn=lambda _query: [1.0, 0.0],
        threshold=THRESHOLD,
        top_k=5,
    )
    results = await retriever.retrieve_relevant_chunks("query")
    assert [r["episode_title"] for r in results] == ["High", "Medium"]
    assert results[0]["similarity"] >= results[1]["similarity"]


# ── Fallback contract ─────────────────────────────────────────────────────────


def test_fallback_message_is_exact_prd_string():
    assert (
        FALLBACK_MESSAGE
        == "I do not have sufficient information in Lenny's podcast archive to answer this."
    )