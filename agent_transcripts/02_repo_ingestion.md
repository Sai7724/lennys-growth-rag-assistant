# Agent Execution Log 02 — Automatic Transcript Repo Ingestion

**Date:** 2026-09-04
**Objective:** Replace manual transcript loading with a fully automatic pipeline
that clones/pulls `ChatPRD/lennys-podcast-transcripts`, then chunks, embeds,
and loads every episode into pgvector.

## 1. What Changed

### Repository research
`ChatPRD/lennys-podcast-transcripts` layout (verified via GitHub):
```
episodes/{guest-name}/transcript.md   # 269 episode transcripts
index/                                # topic index (not transcript data)
scripts/                              # index tooling (not transcript data)
```
Each `transcript.md` starts with **YAML frontmatter**: `guest`, `title`,
`youtube_url`, `video_id`, `publish_date`, `description`, `duration_seconds`,
`duration`, `view_count`, `channel` — followed by the full transcript body.

### Backend changes
| File | Change |
| --- | --- |
| `backend/app/config.py` | Added `transcripts_repo_url` (defaults to the ChatPRD repo); `transcript_dir` now honors `TRANSCRIPTS_DIR` (with `TRANSCRIPT_DIR` alias) |
| `backend/requirements.txt` | Added `GitPython~=3.1.0`, `PyYAML~=6.0.1` |
| `backend/app/scripts/ingest.py` | Rewritten: `sync_transcripts_repo()` (clone 1st run / `git pull` after / preserves non-git dirs as `_legacy_backup`), `discover_transcript_files()` (`episodes/*/transcript.md` layout with legacy fallback), `parse_frontmatter()` (YAML), frontmatter-aware `parse_transcript_file()` (guest/title from frontmatter, folder-name fallback, publish date → `timestamp_ref`), batch embed/insert, dedupe by text, HNSW index. New CLI flags: `--no-sync`, `--repo-url` |
| `backend/scripts/ingest.py` | Wrapper now documents `python -m scripts.ingest` + `python -m app.scripts.ingest` |
| `docker-compose.yml` | Backend env: `TRANSCRIPTS_DIR`, `TRANSCRIPTS_REPO_URL` (pass-through with default) |
| `.env.example` | Added `TRANSCRIPTS_REPO_URL`, `TRANSCRIPTS_DIR` |
| `data/` | Legacy sample transcripts moved to `data/samples/` so the repo clone into `data/transcripts` is not blocked |

### Tests added (`backend/tests/test_retrieval.py`)
- `parse_frontmatter` happy path, no-frontmatter, and malformed-YAML resilience.
- Frontmatter-driven `parse_transcript_file` (guest/title/date) + folder-name
  fallback when no frontmatter.
- `discover_transcript_files`: prefers `episodes/*/transcript.md`; legacy mode
  excludes README/index/scripts.

## 2. Behavior

```
python -m app.scripts.ingest
  → sync_transcripts_repo()
      data/transcripts missing        → git clone
      data/transcripts/.git exists    → git pull
      data/transcripts non-git        → move to *_legacy_backup, then clone
  → discover episodes/*/transcript.md
  → parse frontmatter + chunk (600/100)
  → embed (MiniLM, 384-dim), dedupe by text, batch insert
  → CREATE INDEX ... hnsw (vector_cosine_ops)

python -m app.scripts.ingest --no-sync   # local files only (offline/dev)
```

## 3. Intentional Differences From the Reference Script

| Reference script | Implementation | Why |
| --- | --- | --- |
| Top-level `embedder = SentenceTransformer(...)` on import | Lazy, cached `embed_texts()` | Avoids a multi-second torch import just to run tests/health |
| Raw `text("INSERT ... embedding = str(vector)")` row-by-row | SQLAlchemy ORM `TranscriptChunk` via asyncpg + pgvector | Type-safe vector encoding, reuses existing schema |
| Fixed 500-commit cadence | Batch flush (32/batch) + single commit | Simpler, same durability, faster |
| `guest = filename.title()` | YAML `guest` → folder name → filename fallback | Real repo puts guest in frontmatter/folder |
| Chunks the *whole file* (frontmatter included) | Chunks transcript **body only** after splitting frontmatter | Avoids embedding metadata as content |
| `python -m scripts.ingest` in `scripts/` | Implementation in `app/scripts/ingest.py` (PRD command), `scripts/ingest.py` is a thin wrapper | Keeps PRD single command working; both entrypoints work |

## 4. Verification

- `python -m py_compile` on all backend modules — clean.
- Full `pytest` suite passes (previous 17 + new frontmatter/discovery tests).
- Repo clone itself requires network + GitPython at runtime; not executed in CI
  tests (unit tests cover parsing/discovery with `tmp_path` fixtures).