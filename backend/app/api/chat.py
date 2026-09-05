"""Streaming chat endpoint (Server-Sent Events).

Per request it:
  1. Retrieves grounded transcript chunks (pgvector, similarity threshold).
  2. Routes to the requested LLM provider (ollama | gemini | glm | huggingface).
  3. Emits SSE events: `status` -> `sources` -> `token`* -> `[DONE]`.
  4. Falls back gracefully:
     - Artifact/code/generation requests always go to the LLM (no grounding needed).
     - Pure knowledge questions with no matching chunks return the fallback message.
"""
import json
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.db_models import Artifact, ChatMessage, ChatSession
from app.models.schemas import ChatRequest, SourceChunk
from app.providers.cloud_provider import GeminiProvider, GLMProvider, HuggingFaceProvider
from app.providers.ollama_provider import OllamaProvider
from app.rag.retriever import FALLBACK_MESSAGE, TranscriptRetriever
from app.skills.artifact_generator import ARTIFACT_PROMPT_HINT, parse_artifacts
from app.skills.ship30_writer import (
    SHIP30_SYSTEM_PROMPT,
    build_grounded_qa_system_prompt,
    build_ship30_prompt,
)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

# Keywords that signal the user wants generated output, not retrieved knowledge.
_GENERATION_RE = re.compile(
    r"\b(html|widget|code|build|create|generate|make|write|show me an?|"
    r"give me an?|design|draft|template|script|component|dashboard|chart|"
    r"graph|visuali[sz]e|artifact|snippet)\b",
    re.IGNORECASE,
)

FREEFORM_SYSTEM_PROMPT = (
    "You are the Lenny Growth Assistant, an expert in product management, "
    "growth strategies, and software development. "
    "Answer the user's request helpfully and completely using your own knowledge."
    "\n\n"
)


def _is_generation_request(message: str) -> bool:
    """Return True when the message is asking for code/widgets/artifacts."""
    return bool(_GENERATION_RE.search(message))


def get_retriever() -> TranscriptRetriever:
    """FastAPI dependency: shared, lazily-initialized transcript retriever."""
    return TranscriptRetriever()


def build_provider(name: Optional[str]):
    """Return a provider instance for the requested name (default from env)."""
    provider_name = (name or settings.default_provider).strip().lower()
    if provider_name == "gemini":
        return GeminiProvider()
    if provider_name == "glm":
        return GLMProvider()
    if provider_name == "huggingface":
        return HuggingFaceProvider()
    return OllamaProvider()


def _sse(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


DEFAULT_SESSION_TITLE = "New Growth Chat"


def _derive_session_title(content: str) -> str:
    """Short, readable sidebar title from the first user message."""
    cleaned = " ".join(content.strip().split())
    if not cleaned:
        return DEFAULT_SESSION_TITLE
    return cleaned[:80] + ("…" if len(cleaned) > 80 else "")


async def _persist_message(
    session_id: str, role: str, content: str, sources: Optional[List[Dict]]
) -> Optional[str]:
    """Best-effort persistence; chat must never break because of a DB hiccup.
    Returns the message ID if successful, None otherwise.
    """
    try:
        async with AsyncSessionLocal() as db:
            if role == "user":
                session = await db.get(ChatSession, session_id)
                if session is not None and session.title == DEFAULT_SESSION_TITLE:
                    session.title = _derive_session_title(content)
            message = ChatMessage(
                session_id=session_id,
                role=role,
                content=content,
                sources=sources,
            )
            db.add(message)
            await db.commit()
            await db.refresh(message)
            return str(message.id)
    except Exception:
        return None


def _source_payload(chunks: List[Dict]) -> List[SourceChunk]:
    return [
        SourceChunk(
            id=chunk.get("id"),
            episode_title=chunk["episode_title"],
            guest_name=chunk["guest_name"],
            timestamp_ref=chunk.get("timestamp_ref"),
            chunk_text=chunk["chunk_text"],
            similarity=round(chunk.get("similarity", 0.0), 4),
        )
        for chunk in chunks
    ]


async def _persist_artifacts(message_id: Optional[str], content: str) -> None:
    """Extracts and persists artifacts from message content."""
    if not message_id:
        return
    try:
        artifacts = parse_artifacts(content)
        if not artifacts:
            return
        async with AsyncSessionLocal() as db:
            for artifact in artifacts:
                db.add(
                    Artifact(
                        message_id=message_id,
                        artifact_type=artifact.type,
                        title=artifact.title,
                        content=artifact.html,
                    )
                )
            await db.commit()
    except Exception:
        # Artifact persistence is best-effort; don't break the chat flow
        pass


@router.post("")
async def stream_chat(
    req: ChatRequest,
    retriever: TranscriptRetriever = Depends(get_retriever),
) -> StreamingResponse:
    # Detect generation vs knowledge request and pick the provider up front.
    generation_request = _is_generation_request(req.message)
    llm = build_provider(req.provider)
    mode = (req.mode or "default").strip().lower()

    # Persist the user message before streaming begins.
    await _persist_message(req.session_id, "user", req.message, None)

    # Fetch conversation history for context (last 10 messages)
    conversation_history: List[Dict[str, str]] = []
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == req.session_id)
                .where(ChatMessage.role.in_(["user", "assistant"]))
                .order_by(ChatMessage.created_at.desc())
                .limit(10)
            )
            messages = result.scalars().all()
            # Reverse to get chronological order (oldest first)
            for msg in reversed(messages):
                conversation_history.append({
                    "role": msg.role,
                    "content": msg.content
                })
    except Exception:
        # If we can't fetch history, continue without it
        pass

    def build_prompts(chunks: List[Dict]):
        """Mode/intent-aware prompt construction, given retrieved chunks and conversation history."""
        # Build conversation context string
        history_context = ""
        if conversation_history:
            history_lines = []
            for msg in conversation_history:
                if msg["role"] == "user":
                    history_lines.append(f"User: {msg['content']}")
                else:
                    history_lines.append(f"Assistant: {msg['content']}")
            history_context = "\n\nCONVERSATION HISTORY:\n" + "\n".join(history_lines) + "\n\n"

        if mode == "ship30":
            user_prompt = build_ship30_prompt(req.message, chunks)
            if history_context:
                user_prompt = history_context + "CURRENT QUESTION:\n" + user_prompt
            return (
                SHIP30_SYSTEM_PROMPT + "\n\n" + ARTIFACT_PROMPT_HINT,
                user_prompt,
            )
        if generation_request:
            # Code / artifact / widget request — freeform mode, enriched with
            # any retrieved context if available but not required.
            context_hint = ""
            if chunks:
                from app.skills.ship30_writer import format_context_chunks
                context_hint = (
                    "\n\nFor additional context, here are relevant podcast insights:\n"
                    + format_context_chunks(chunks)
                    + "\n\n"
                )
            user_prompt = history_context + "CURRENT REQUEST:\n" + req.message + context_hint
            return FREEFORM_SYSTEM_PROMPT + ARTIFACT_PROMPT_HINT, user_prompt
        user_prompt = history_context + "CURRENT QUESTION:\n" + req.message
        return (
            build_grounded_qa_system_prompt(chunks) + "\n\n" + ARTIFACT_PROMPT_HINT,
            user_prompt,
        )

    def generating_status() -> str:
        if mode == "ship30":
            return "Writing your publication-ready essay…"
        if generation_request:
            return "Creating your answer…"
        return "Generating your answer…"

    async def event_generator() -> AsyncGenerator[str, None]:
        # 1. Status: searching the transcript archive.
        yield _sse({"type": "status", "content": "Searching Lenny's transcript archive for relevant insights…"})

        try:
            chunks = await retriever.retrieve_relevant_chunks(
                req.message, top_k=settings.top_k, threshold=settings.similarity_threshold
            )
        except Exception as exc:  # retrieval must never kill the stream
            print(f"[chat] retrieval failed: {exc}")
            chunks = []
            yield _sse({"type": "status", "content": "Couldn't reach the transcript archive — answering from knowledge"})

        # 2. Status: what the search turned up.
        if chunks:
            yield _sse({"type": "status", "content": f"Found {len(chunks)} relevant insights from the podcast"})
        elif generation_request or mode == "ship30":
            yield _sse({"type": "status", "content": "No matching transcripts — generating from knowledge"})
        else:
            yield _sse({"type": "status", "content": "No matching insights found"})

        sources_payload = _source_payload(chunks)
        yield _sse({"type": "sources", "content": [s.model_dump() for s in sources_payload]})

        # Only hard-block with fallback for pure knowledge questions with no matches.
        if not chunks and not generation_request and mode != "ship30":
            yield _sse({"type": "token", "content": FALLBACK_MESSAGE})
            yield "data: [DONE]\n\n"
            await _persist_message(req.session_id, "assistant", FALLBACK_MESSAGE, [])
            return

        # 3. Status: generating the reply.
        system_prompt, user_prompt = build_prompts(chunks)
        yield _sse({"type": "status", "content": generating_status()})

        collected: List[str] = []
        try:
            async for token in llm.generate_response(
                [{"role": "user", "content": user_prompt}],
                system_prompt=system_prompt,
                temperature=0.3,
            ):
                collected.append(token)
                yield _sse({"type": "token", "content": token})
        except Exception as exc:
            error_msg = f"[Error: {type(exc).__name__}: {str(exc)[:500]}]"
            collected.append(error_msg)
            yield _sse({"type": "error", "content": error_msg})

        assistant_message_id = await _persist_message(
            req.session_id, "assistant", "".join(collected), [s.model_dump() for s in sources_payload]
        )
        # Persist any artifacts extracted from the assistant's response
        await _persist_artifacts(assistant_message_id, "".join(collected))
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )