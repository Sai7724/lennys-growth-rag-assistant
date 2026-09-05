# The Lenny Growth Assistant — Product Requirements Document (PRD)

## 1. Product Summary

**The Lenny Growth Assistant** turns 200+ hours of Lenny's Podcast into an
on-demand, battle-tested growth strategist. Growth PMs, PM leaders, and startup
founders ask a product strategy question and receive grounded, attributed
answers — or a publication-ready "Ship 30 for 30" essay — with every claim
traceable to an episode, guest, and timestamp. No listening required, no
hallucinations, no unsafe rendering.

## 2. User Persona & Job-To-Be-Done

| Field | Value |
| --- | --- |
| **Primary users** | Growth Product Managers, PM Leaders, Startup Founders |
| **JTBD** | When faced with complex product strategy decisions (PLG loops, retention strategies, pricing tiering), users need immediate, battle-tested operational tactics from elite tech leaders (Lenny's Podcast guests), formatted as grounded answers or publication-ready strategic essays — without listening to 200+ hours of audio. |
| **Pain points solved** | Generic LLM hallucinations; lack of real-world tactical attribution; fragmented notes across podcast episodes; unsafe rendering of generated UI components/documents. |

## 3. Core Metrics & Targets

1. **Retrieval Citation Accuracy (≥ 90%):** Percentage of factual claims in
   generated answers directly backed by retrieved transcript chunks with valid
   timestamps and guest attributions.
2. **Local Inference Latency (< 4s to first token):** Streaming response onset
   time when executing on local hardware via Ollama (`llama3.2:3b` / `mistral:7b`).
3. **Artifact Security Isolation (0 XSS Vulnerabilities):** Complete client-side
   isolation when rendering untrusted HTML/CSS artifacts inside a sandboxed iframe.

## 4. Success Criteria

- The system answers retrieval questions **only** from transcript context.
- Every assistant answer carries visible source attribution (episode/guest/
  timestamp) produced by the RAG pipeline.
- A similarity threshold guard (default **0.65** cosine) blocks low-confidence
  retrieval; below the threshold the system returns the exact fallback message.
- The user can hot-swap the LLM provider per request without restarting.
- Generated HTML artifacts render in complete isolation (0 XSS escape vectors).

## 5. Core Features (In Scope)

### 5.1 Grounded Q&A
- FastAPI backend with streaming **SSE** endpoint: `POST /api/chat`.
- pgvector (PostgreSQL) vector store with **HNSW** indexing.
- Retrieval via 384-dim `all-MiniLM-L6-v2` embeddings; cosine similarity cutoff
  of **0.65**; strict fallback message when no chunk clears the threshold.

### 5.2 Dual Model Layer
- **Local:** Ollama (`llama3.2:3b`) — zero data leakage, $0 cost.
- **Cloud:** Anthropic Claude / OpenAI — higher fidelity, faster first token.
- Provider chosen **per request** (`provider` field / `DEFAULT_PROVIDER` env).

### 5.3 Ship 30 for 30 Skill Engine
- `mode="ship30"` injects a strict essay-ghostwriter prompt:
  ~1,250 words, curiosity-gap hook (lines 1–3), short paragraphs, H2/H3
  headers, bold anchor words, guest attribution, and a closing **Actionable
  Checklist**.

### 5.4 Side-by-Side Dual-Pane Frontend (Next.js 14 + Tailwind)
- Left pane: streaming chat with provider/skill switchers.
- Right pane: Claude-style **Artifact Viewer** (`<iframe sandbox="allow-scripts">`
  + DOMPurify) that auto-opens when `<artifact>` tags stream in.

### 5.5 Operational Plumbing
- Single-command startup: `docker-compose up`.
- Single-command local ingestion: `python -m app.scripts.ingest`.
- Automated `pytest` suite covering API routes, retrieval, and fallbacks.

## 6. Key Technical Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| **Hallucination** | Vector distance thresholding (`>0.65` cosine). Below threshold → exact fallback: *"I do not have sufficient information in Lenny's podcast archive to answer this."* |
| **Local inference resource constraints** | Quantized 3B/7B models (`llama3.2:3b`) + small context embedding model (384-dim) |
| **Client-side XSS via HTML artifacts** | DOMPurify sanitization of generated markup + `<iframe sandbox="allow-scripts">` (no `allow-same-origin`) |
| **Ollama downtime / missing API keys** | Graceful SSE error events; provider hot-swap; documented fallback matrix (see architecture.md) |
| **Empty pgvector results** | Strict fallback message; health endpoint reports DB status |

## 7. Assumptions Log

1. Transcripts are **pre-downloaded** into `data/transcripts/` as `.txt`/`.md`
   files named `Episode Title - Guest Name.ext` (or with `Title:`/`Guest:`
   headers). Included sample files demonstrate the format and must be replaced
   with real corpus data for production use.
2. Ollama runs on the host at `http://localhost:11434` (Docker backend reaches
   it via `host.docker.internal`).
3. Single concurrent user; no session auth; sessions are ephemeral by design.
4. Cloud providers require `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`; local mode
   requires none.
5. The similarity threshold (0.65) is a configurable product dial via
   `SIMILARITY_THRESHOLD`.

## 8. Definition of Done

- [x] File tree matches the spec (plus minimal plumbing: `globals.css`,
      `postcss.config.js`, `next.config.mjs`, `pytest.ini`, `data/transcripts/`).
- [x] `docker-compose up` boots db + backend + frontend.
- [x] Ingestion pipeline vectorizes transcripts and builds the HNSW index.
- [x] Streaming chat returns `sources` + `token` SSE events, or the fallback.
- [x] Provider toggle works per request (Ollama / Claude / OpenAI).
- [x] Artifact viewer renders sanitized HTML in a sandboxed iframe.
- [x] `pytest` suite passes with no external services required.