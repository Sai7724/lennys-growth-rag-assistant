# Agent Execution Log — The Lenny Growth Assistant

**Agent:** Forward Deployed Engineer (FDE) · **Date:** 2026-09-04
**Objective:** Build and deploy the Lenny Growth Assistant strictly per PRD, no scope creep.

## 1. Build Order

1. **Repository root** — `docker-compose.yml`, `.env.example`, README, docs skeleton.
2. **Backend core** — `config.py` (pydantic-settings), `database.py` (async engine,
   pgvector bootstrap, HNSW index SQL), ORM models (`transcript_chunks`,
   `chat_sessions`, `chat_messages`), Pydantic schemas.
3. **Provider layer** — `base.py` ABC; `ollama_provider.py` (httpx stream to
   `/api/chat`); `cloud_provider.py` (Anthropic + OpenAI SDK streams).
4. **RAG layer** — `embeddings.py` (lazy, cached `all-MiniLM-L6-v2`, 384-dim,
   L2-normalized, pure cosine helper); `retriever.py` (pgvector `<=>` HNSW
   nearest-neighbor scan, cosine ≥ 0.65 filter, exact PRD fallback constant).
5. **Skill engine** — `ship30_writer.py` (grounded QA + Ship 30 system prompts
   and `build_ship30_prompt`), `artifact_generator.py` (`<artifact>` regex
   parsing/wrapping + prompt hint).
6. **API** — `/api/health`, `/api/sessions`, `/api/chat` (SSE: `sources` →
   `token`* → `[DONE]`), provider routing, mode routing, best-effort message
   persistence, `main.py` (lifespan bootstrap + CORS).
7. **Ingestion** — `app/scripts/ingest.py` (chunk 600/100, metadata extraction,
   batch embedding, HNSW index, dedupe) + `scripts/ingest.py` wrapper.
8. **Tests** — `test_api.py` (health, session, streaming, ship30 mode, fallback)
   and `test_retrieval.py` (cosine math, chunking, metadata, threshold filtering,
   sort order, fallback string contract). All run with zero external services.
9. **Frontend** — Next.js 14 App Router; `lib/api.ts` (SSE client + artifact
   extraction), `hooks/useChatStream.ts`, `ChatPane`, `MessageItem`,
   `ModelSelector`, `ArtifactViewer`, `SandboxedIframe` (DOMPurify +
   `sandbox="allow-scripts"`, no `allow-same-origin`).
10. **Docs** — PRD, architecture, design, this log.

## 2. Intentional Deviations / Additions (documented, minimal)

| Item | Why |
| --- | --- |
| `backend/app/scripts/ingest.py` (module) | PRD mandates `python -m app.scripts.ingest`; a runnable module needs to live in the `app` package. Kept `backend/scripts/ingest.py` as a thin wrapper to honor the specified tree. |
| `frontend/src/app/globals.css`, `postcss.config.js`, `next.config.mjs`, `next-env.d.ts` | Required plumbing for Tailwind/Next builds; the tree cannot build without them. |
| `backend/pytest.ini` | Sets `asyncio_mode = auto` so the specified async tests run under pytest-asyncio. |
| `data/transcripts/*.md` (2 sample files) | Ingestion needs input data to function; samples document the expected format and are clearly labeled for replacement with the real corpus. |
| `docker-compose.yml` adds `./data:/app/data` bind mount + `TRANSCRIPT_DIR` | Lets ingestion run inside the container against host files (operational resilience). |
| OpenAI provider + UI option | Present in the PRD architecture diagram (OpenAIProvider); surfaced as an optional third toggle. |

## 3. Verification Performed

- All backend modules pass `python -m py_compile` (syntax checked end-to-end).
- Test suite designed to run **without** Postgres/Ollama/API keys via
  dependency overrides and provider stubs.
- Frontend TypeScript is strict-mode clean by inspection; full `next build`
  + `pytest` execution requires the repo machine's toolchain/dependencies.

## 4. How to Run

```bash
# 1. Start infrastructure (Postgres/pgvector, backend, frontend)
docker-compose up --build

# 2. (Host, with Ollama running) pull the local model
ollama pull llama3.2:3b

# 3. Ingest transcripts (from backend/)
cd backend
python -m app.scripts.ingest          # uses data/transcripts via TRANSCRIPT_DIR

# 4. Run tests (from backend/)
pytest -q

# 5. Open the app
#    http://localhost:3000
```

## 5. Open Items / Assumptions

- Transcript corpus = samples only; replace `data/transcripts/*.md` with real
  Lenny transcripts named `Title - Guest.ext`.
- Cloud providers need `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the
  environment; local mode needs none.
- First token latency on local hardware depends on CPU/GPU and model size;
  `llama3.2:3b` quantized is the reference target for the <4s SLA.