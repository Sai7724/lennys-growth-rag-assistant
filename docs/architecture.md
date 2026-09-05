# The Lenny Growth Assistant — Architecture

## 1. End-to-End Component Diagram

```mermaid
flowchart TB
    subgraph Frontend["FRONTEND (Next.js 14 · :3000)"]
        CP["ChatPane (streaming SSE)"]
        MS["ModelSelector (provider + skill)"]
        AV["ArtifactViewer"]
        SF["SandboxedIframe\n(DOMPurify + sandbox=allow-scripts)"]
        CP --> MS
        AV --> SF
    end

    subgraph Backend["BACKEND (FastAPI · :8000)"]
        RT["/api/chat (SSE)"]
        SN["/api/sessions"]
        HC["/api/health"]
        SK["Ship 30 for 30 Skill Engine"]
        PR["Provider Router"]
        OLL["OllamaProvider :11434"]
        CLD["ClaudeProvider / OpenAIProvider"]
        RET["pgvector Retriever (HNSW, cosine ≤ 0.65)"]
        RT --> SK
        RT --> PR
        PR --> OLL
        PR --> CLD
        RT --> RET
    end

    subgraph Data["DATA"]
        PG[("PostgreSQL 16 + pgvector\n· transcript_chunks\n· chat_sessions\n· chat_messages")]
        TR["data/transcripts/*.txt|*.md"]
    end

    CP -- "POST /api/chat (SSE)" --> RT
    CP -- "POST /api/sessions" --> SN
    HC -.-> PG
    RET --> PG
    OLL -. "localhost" .-> OLH[(("Ollama llama3.2:3b"))]
    ING["ingest.py\n(chunk 600/100 · embed · HNSW)"] --> PG
    TR --> ING
```

## 2. Database Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE transcript_chunks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_title VARCHAR(255) NOT NULL,
    guest_name    VARCHAR(255) NOT NULL,
    timestamp_ref VARCHAR(50),
    chunk_text    TEXT NOT NULL,
    embedding     vector(384)
);

CREATE INDEX idx_transcript_hnsw
  ON transcript_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE chat_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title      VARCHAR(255) DEFAULT 'New Growth Chat',
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE chat_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role       VARCHAR(50) NOT NULL,            -- user | assistant | system
    content    TEXT NOT NULL,
    sources    JSONB,                           -- cited chunks for the message
    created_at TIMESTAMP DEFAULT now()
);
```

## 3. Retrieval Math

pgvector stores **cosine distance** `d = 1 − cos(a, b)` and exposes the
`<=>` operator with `vector_cosine_ops` (used by the HNSW index).

We convert distance to **cosine similarity**:

```
                a · b
cos(a, b) = ─────────────
            ‖a‖ · ‖b‖

similarity = 1 − cosine_distance(query, chunk) = cos(query, chunk)
```

**Decision rule:**

```
retrieved = { chunk ∈ top-(3·k) neighbors : similarity ≥ 0.65 }
```

If `retrieved = ∅`, the endpoint returns the exact message:
> *"I do not have sufficient information in Lenny's podcast archive to answer this."*

Embeddings (`all-MiniLM-L6-v2`) are L2-normalized at encode time, so cosine
similarity equals the dot product in practice.

## 4. LLM Provider Routing

```
provider field → build_provider(name)
    "ollama" -> OllamaProvider  (httpx stream → /api/chat)
    "claude" -> ClaudeProvider  (Anthropic SDK message stream)
    "openai" -> OpenAIProvider  (OpenAI SDK chat stream)
    <other>  -> DEFAULT_PROVIDER env fallback
```

Each provider implements `BaseLLMProvider.generate_response(messages,
system_prompt, temperature)` as an async token generator, so the SSE endpoint
is provider-agnostic.

## 5. Fallback Matrix

| Scenario | Behavior |
| --- | --- |
| No chunk clears the 0.65 threshold | Exact fallback message as a `token` event, then `[DONE]` |
| Ollama down / unreachable | SSE `token` event with `[Error: ...]`, then `[DONE]` |
| Cloud API key missing | SSE `token` event with `[Error: ANTHROPIC/OPENAI API key not configured...]` |
| Provider raises mid-stream | SSE `error` event with exception name/message, then `[DONE]` |
| Postgres unavailability | `/api/health` reports `database: unavailable`; chat still streams (persistence is best-effort); startup bootstrap is skipped, not fatal |
| Empty transcript corpus | Retriever returns `[]` → exact fallback message path |

## 6. Security Sandboxing Threat Model

**Goal:** render untrusted LLM-generated HTML/CSS/JS artifacts with **0 XSS
vulnerabilities**.

| Layer | Defense | What it stops |
| --- | --- | --- |
| **DOMPurify** (client, before render) | Sanitizes markup; strips event handlers (`on*`), `javascript:` URLs, dangerous elements | Attribute/vector-based XSS payloads inside the document |
| **`<iframe sandbox="allow-scripts">`** | Scripts run inside an **opaque origin**; `allow-same-origin` is intentionally omitted | Cookie theft, `localStorage`/`sessionStorage` reads, parent-DOM access, `parent.*`/`top.*` navigation, keylogging the host page |
| **No postMessage bridge** | The iframe has no channel to communicate with the parent | Data exfiltration from the artifact |
| **Content policy on generated artifacts** | Prompt hints ask models to emit self-contained `<html>` documents; no external network tokens beyond the model's own output | Server-side request forgery from artifact markup |

**Why `allow-same-origin` is omitted:** granting both `allow-scripts` and
`allow-same-origin` would let the iframe treat itself as same-origin with the
parent and silently disable the sandbox — the classic iframe XSS escape hatch.
We keep `allow-scripts` (so widgets can be interactive) but never
`allow-same-origin`.

**Residual risk (accepted):** an artifact can make its own network requests from
the opaque origin (e.g., fetch an image). That is isolated to the sandbox and
cannot read page data; acceptable per PRD scope.

## 7. Deployment Topology

- `docker-compose up` → `db` (pgvector/pgvector:pg16, :5432), `backend`
  (FastAPI, :8000), `frontend` (Next.js, :3000).
- Backend reaches host Ollama via `host.docker.internal:11434`
  (`extra_hosts: host-gateway`).
- `data/` is bind-mounted into the backend so ingestion can run in-container
  against host transcripts.
- Ingestion: `cd backend && python -m app.scripts.ingest`.