"""Automatic transcript ingestion pipeline.

1. Syncs the transcript corpus from a Git repository (clone on first run,
   `git pull` afterwards; optional — set `TRANSCRIPTS_REPO_URL` to disable).
2. Discovers transcript files: `episodes/{guest}/transcript.md` (the
   ChatPRD/lennys-podcast-transcripts layout) or legacy `.txt`/`.md` files.
3. Parses YAML frontmatter metadata (guest, title, publish_date).
4. Chunks transcripts (~600 chars, 100 overlap).
5. Embeds chunks with all-MiniLM-L6-v2 (384-dim).
6. Upserts into `transcript_chunks` (dedupe by text) and builds the HNSW index.

Usage:
    python -m app.scripts.ingest                    # clone/pull + ingest
    python -m app.scripts.ingest --no-sync          # local files only
    python -m app.scripts.ingest --repo-url <git>  # different repo
"""
import argparse
import asyncio
import pathlib
import re
import shutil
import sys
from typing import List, Optional, Tuple

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, create_hnsw_index, init_db
from app.models.db_models import TranscriptChunk
from app.rag.embeddings import embed_texts

TRANSCRIPT_GLOB = ("*.md", "*.txt")
TITLE_GUEST_RE = re.compile(r"^(?P<title>.+?)\s*-\s*(?P<guest>.+)$")
DEFAULT_TITLE = "Unknown Episode"
DEFAULT_GUEST = "Unknown Guest"


# ── Repo sync ─────────────────────────────────────────────────────────────────


def sync_transcripts_repo(
    data_dir: pathlib.Path, repo_url: Optional[str] = None
) -> None:
    """Clone the transcript repo on first run, `git pull` afterwards.

    Non-git content already present in `data_dir` (e.g. legacy local samples)
    is preserved by moving it to a `_legacy_backup` sibling directory.
    """
    repo_url = (repo_url or settings.transcripts_repo_url or "").strip()
    if not repo_url:
        print("[ingest] TRANSCRIPTS_REPO_URL not set — using local files only.")
        return

    try:
        import git  # GitPython
    except ImportError as exc:
        raise SystemExit(
            "GitPython is required for repo sync. Install with: "
            "pip install GitPython"
        ) from exc

    if not data_dir.exists():
        print(f"[ingest] Cloning {repo_url} -> {data_dir} ...")
        git.Repo.clone_from(repo_url, str(data_dir))
        return

    if (data_dir / ".git").is_dir():
        print("[ingest] Updating existing transcript repository (git pull) ...")
        git.Repo(str(data_dir)).remotes.origin.pull()
        return

    # Existing non-git content: preserve it, then clone fresh.
    has_content = any(data_dir.iterdir())
    if has_content:
        backup = data_dir.with_name(data_dir.name + "_legacy_backup")
        n = 1
        while backup.exists():
            n += 1
            backup = data_dir.with_name(f"{data_dir.name}_legacy_backup{n}")
        print(
            f"[ingest] Moving pre-existing content {data_dir} -> {backup} "
            "(repo clone will replace it)."
        )
        shutil.move(str(data_dir), str(backup))

    print(f"[ingest] Cloning {repo_url} -> {data_dir} ...")
    git.Repo.clone_from(repo_url, str(data_dir))


# ── Discovery & parsing ───────────────────────────────────────────────────────


def discover_transcript_files(data_dir: pathlib.Path) -> List[pathlib.Path]:
    """Find transcript files.

    Preferred layout: `{data_dir}/episodes/{guest}/transcript.md` (the
    ChatPRD/lennys-podcast-transcripts repo). Falls back to any `.md`/`.txt`
    files under `data_dir`, excluding README/index scaffold files.
    """
    episodes = data_dir / "episodes"
    if episodes.is_dir():
        return sorted(episodes.glob("*/transcript.md"))

    files: List[pathlib.Path] = []
    for pattern in TRANSCRIPT_GLOB:
        for path in sorted(data_dir.rglob(pattern)):
            name = path.name.upper()
            parts = [p.lower() for p in path.parts]
            if "README" in name:
                continue
            if "index" in parts or "scripts" in parts:
                continue
            files.append(path)
    return files


def parse_frontmatter(content: str):
    """Split YAML frontmatter from transcript body.

    Returns (metadata_dict, body). If there is no frontmatter, returns
    ({}, content) unchanged.
    """
    if not content.startswith("---"):
        return {}, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content

    import yaml

    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        meta = {}
    body = parts[2]
    if not isinstance(meta, dict):
        meta = {}
    return meta, body


def _guest_from_folder(file_path: pathlib.Path) -> str:
    """Derive a guest name from the `episodes/{guest}/transcript.md` folder."""
    parts = file_path.parts
    try:
        idx = parts.index("episodes")
    except ValueError:
        return DEFAULT_GUEST
    if idx + 1 < len(parts):
        name = parts[idx + 1].replace("-", " ").replace("_", " ").strip()
        return " ".join(w.capitalize() for w in name.split()) or DEFAULT_GUEST
    return DEFAULT_GUEST


def extract_metadata(file_path: pathlib.Path) -> Tuple[str, str]:
    """Legacy metadata extraction (no frontmatter).

    Prefers "Episode Title - Guest Name.ext" filenames, then `Title:` /
    `Guest:` header lines, then the file stem.
    """
    title, guest = DEFAULT_TITLE, DEFAULT_GUEST

    match = TITLE_GUEST_RE.match(file_path.stem)
    if match:
        title, guest = match.group("title").strip(), match.group("guest").strip()

    try:
        head = file_path.read_text(encoding="utf-8", errors="ignore").splitlines()[:10]
    except OSError:
        head = []

    for line in head:
        stripped = line.strip()
        lowered = stripped.lower()
        if lowered.startswith("title:"):
            value = stripped.split(":", 1)[1].strip()
            if value:
                title = value
        elif lowered.startswith("guest:"):
            value = stripped.split(":", 1)[1].strip()
            if value:
                guest = value
        elif stripped.startswith("# ") and title == DEFAULT_TITLE:
            title = stripped.lstrip("#").strip()

    return title, guest


def split_into_chunks(
    text: str,
    chunk_size: int = 600,
    overlap: int = 100,
) -> List[str]:
    """Deterministic sliding-window chunker with overlap.

    Prefers to break at sentence boundaries (". ") near the chunk target so
    chunks stay readable. Overlap preserves context across chunk boundaries.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    chunks: List[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            boundary = text.rfind(". ", start + chunk_size // 2, end)
            if boundary != -1:
                end = boundary + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks


def parse_transcript_file(file_path: pathlib.Path, chunk_size: int, overlap: int):
    """Yield (episode_title, guest_name, timestamp_ref, chunk_text) rows.

    `timestamp_ref` carries the episode publish date when available (the
    transcripts do not contain in-episode timestamps).
    """
    raw = file_path.read_text(encoding="utf-8", errors="ignore")
    meta, body = parse_frontmatter(raw)

    title = str(meta.get("title") or "").strip() or extract_metadata(file_path)[0]
    guest = str(meta.get("guest") or "").strip() or _guest_from_folder(file_path)
    if guest == DEFAULT_GUEST:
        guest = extract_metadata(file_path)[1]
    timestamp_ref = str(meta.get("publish_date") or "").strip() or None

    for chunk in split_into_chunks(body, chunk_size=chunk_size, overlap=overlap):
        yield title, guest, timestamp_ref, chunk


# ── Ingestion ─────────────────────────────────────────────────────────────────


async def ingest_transcripts(
    transcript_dir: str,
    repo_url: Optional[str] = None,
    sync: bool = True,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
    batch_size: int = 32,
) -> int:
    chunk_size = chunk_size or settings.chunk_size
    chunk_overlap = chunk_overlap if chunk_overlap is not None else settings.chunk_overlap

    data_dir = pathlib.Path(transcript_dir)

    if sync:
        sync_transcripts_repo(data_dir, repo_url=repo_url)

    if not data_dir.exists():
        raise SystemExit(f"Transcript directory not found: {data_dir}")

    files = discover_transcript_files(data_dir)
    if not files:
        print(
            f"[ingest] No transcript files found in {data_dir} "
            f"(expected episodes/*/transcript.md or {', '.join(TRANSCRIPT_GLOB)})."
        )
        return 0

    print(f"[ingest] Found {len(files)} transcript file(s).")

    await init_db()

    # De-duplicate: skip chunk rows whose text already exists.
    async with AsyncSessionLocal() as db:
        existing_result = await db.execute(select(TranscriptChunk.chunk_text))
        existing = set(existing_result.scalars().all())
        print(f"[ingest] {len(existing)} existing chunks in DB.")

    rows = []  # (episode_title, guest_name, timestamp_ref, chunk_text)
    for file_path in files:
        for title, guest, timestamp_ref, chunk in parse_transcript_file(
            file_path, chunk_size, chunk_overlap
        ):
            if chunk in existing:
                continue
            rows.append((title, guest, timestamp_ref, chunk))
    print(f"[ingest] {len(rows)} new chunks to insert.")

    inserted = 0
    async with AsyncSessionLocal() as db:
        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]
            embeddings = await asyncio.to_thread(
                embed_texts, [row[3] for row in batch]
            )
            for (title, guest, timestamp_ref, chunk), embedding in zip(batch, embeddings):
                db.add(
                    TranscriptChunk(
                        episode_title=title,
                        guest_name=guest,
                        timestamp_ref=timestamp_ref,
                        chunk_text=chunk,
                        embedding=embedding,
                    )
                )
            await db.flush()
            inserted += len(batch)
            print(f"[ingest] inserted {inserted}/{len(rows)}")
        await db.commit()

    await create_hnsw_index()
    print(f"[ingest] Done. HNSW index ready ({inserted} chunks inserted).")
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clone/pull Lenny's transcripts, chunk, embed, and ingest into pgvector."
    )
    parser.add_argument("--dir", default=settings.transcript_dir, help="Transcript folder.")
    parser.add_argument(
        "--repo-url",
        default=None,
        help="Override TRANSCRIPTS_REPO_URL for this run.",
    )
    parser.add_argument(
        "--no-sync",
        action="store_true",
        help="Skip git clone/pull; ingest whatever is in --dir locally.",
    )
    parser.add_argument("--chunk-size", type=int, default=settings.chunk_size)
    parser.add_argument("--chunk-overlap", type=int, default=settings.chunk_overlap)
    args = parser.parse_args()

    asyncio.run(
        ingest_transcripts(
            transcript_dir=args.dir,
            repo_url=args.repo_url,
            sync=not args.no_sync,
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
        )
    )


if __name__ == "__main__":
    sys.exit(main())