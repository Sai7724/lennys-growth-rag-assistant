"""API tests: session creation, health check, streaming chat endpoint.

The tests stub out the database and the LLM provider so they run with zero
external services (no Postgres, no Ollama, no cloud keys).
"""
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Dict, List

import pytest
from fastapi.testclient import TestClient

import app.api.chat as chat_module
import app.database as database_module
from app.main import app
from app.rag.retriever import FALLBACK_MESSAGE

# ── Fakes ─────────────────────────────────────────────────────────────────────


class FakeDBSession:
    """Minimal stand-in for an AsyncSession - just enough for create_session."""

    def __init__(self):
        self.added = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        self.added.append(obj)

    async def commit(self):
        pass

    async def refresh(self, obj):
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if not getattr(obj, "title", None):
            obj.title = "New Growth Chat"


class FakeRetriever:
    """Returns a fixed set of chunks or an empty list (fallback path)."""

    def __init__(self, chunks: List[Dict]):
        self._chunks = chunks

    async def retrieve_relevant_chunks(self, query, top_k=5, threshold=0.65):
        return self._chunks


class FakeProvider:
    """Yields canned tokens without touching any network."""

    async def generate_response(
        self, messages, system_prompt, temperature=0.3
    ) -> AsyncGenerator[str, None]:
        for token in ["Hello", " world"]:
            yield token


class FakeResult:
    """Stand-in for a SQLAlchemy result object."""

    def __init__(self, rows=None, scalars=None):
        self._rows = rows or []
        self._scalars = scalars or []

    def all(self):
        return self._rows

    def scalars(self):
        class _Scalars:
            def __init__(self, items):
                self._items = items

            def all(self):
                return self._items

        return _Scalars(self._scalars)


class _Stub:
    """Generic attribute bag for fake ORM objects."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class FakeListDBSession:
    """Fake DB session for GET /api/sessions (returns no rows)."""

    async def execute(self, stmt):
        return FakeResult(rows=[])


class FakeDetailDBSession:
    """Fake DB session for GET /api/sessions/{id}."""

    def __init__(self, session=None, messages=None):
        self._session = session
        self._messages = messages or []

    async def get(self, model, ident):
        return self._session

    async def execute(self, stmt):
        return FakeResult(scalars=self._messages)


class FakeDeleteDBSession:
    """Fake DB session for DELETE /api/sessions/{id}."""

    def __init__(self, session=None):
        self._session = session
        self.deleted = []

    async def get(self, model, ident):
        return self._session

    async def execute(self, stmt):
        return FakeResult()

    async def delete(self, obj):
        self.deleted.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        pass


def _chunk(episode="Retention Playbooks", sim=0.91):
    return {
        "id": str(uuid.uuid4()),
        "episode_title": episode,
        "guest_name": "Casey Winters",
        "timestamp_ref": "00:12:30",
        "chunk_text": "Teams that move the aha rate from 20 to 40 percent see "
                      "proportional improvements in D30 retention.",
        "similarity": sim,
    }


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def client(monkeypatch):
    # Stub the DB session dependency for session creation.
    async def fake_get_db():
        yield FakeDBSession()

    app.dependency_overrides[database_module.get_db] = fake_get_db

    # Stub best-effort message persistence so chat tests never contact a DB.
    monkeypatch.setattr(chat_module, "AsyncSessionLocal", lambda: FakeDBSession())

    # Stub the LLM provider so streaming never hits a real model.
    monkeypatch.setattr(chat_module, "build_provider", lambda name: FakeProvider())

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    # database may be "ok" (real DB) or "unavailable" (no DB) in CI — must not crash.
    assert body["database"] in {"ok", "unavailable"}


def test_create_session(client):
    response = client.post("/api/sessions")
    assert response.status_code == 201
    body = response.json()
    assert body["id"]
    assert body["title"] == "New Growth Chat"
    assert body["created_at"]


def test_stream_chat_returns_sources_and_tokens(client):
    app.dependency_overrides[chat_module.get_retriever] = lambda: FakeRetriever(
        [_chunk()]
    )

    response = client.post(
        "/api/chat",
        json={
            "session_id": str(uuid.uuid4()),
            "message": "How did Airbnb optimize early retention?",
            "mode": "default",
            "provider": "ollama",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    text = response.text
    # Dynamic status events precede the payload
    assert '"type": "status"' in text
    assert "Searching Lenny's transcript archive" in text
    assert "Found 1 relevant insights" in text
    assert "Generating your answer" in text
    # Retrieval metadata event
    assert '"type": "sources"' in text
    assert "Casey Winters" in text
    # Streamed token events
    assert '"type": "token"' in text
    assert "Hello" in text and "world" in text
    # Termination marker
    assert "data: [DONE]" in text


def test_stream_chat_respects_mode_ship30(client, monkeypatch):
    captured = {}

    async def fake_generate(self, messages, system_prompt, temperature=0.3):
        captured["system_prompt"] = system_prompt
        captured["user_prompt"] = messages[0]["content"]
        yield "essay draft"

    class ModeAwareProvider(FakeProvider):
        generate_response = fake_generate

    monkeypatch.setattr(
        chat_module, "build_provider", lambda name: ModeAwareProvider()
    )
    app.dependency_overrides[chat_module.get_retriever] = lambda: FakeRetriever(
        [_chunk()]
    )

    response = client.post(
        "/api/chat",
        json={
            "session_id": str(uuid.uuid4()),
            "message": "Write a Ship 30 essay on retention.",
            "mode": "ship30",
            "provider": "ollama",
        },
    )
    assert response.status_code == 200
    assert "essay draft" in response.text
    assert "Ship 30 for 30" in captured["system_prompt"]
    assert "TRANSCRIPT CONTEXT" in captured["user_prompt"]


def test_list_sessions_empty(client):
    app.dependency_overrides[database_module.get_db] = lambda: FakeListDBSession()

    response = client.get("/api/sessions")
    assert response.status_code == 200
    assert response.json() == []


def test_get_session_not_found(client):
    app.dependency_overrides[database_module.get_db] = lambda: FakeDetailDBSession(
        session=None
    )

    response = client.get(f"/api/sessions/{uuid.uuid4()}")
    assert response.status_code == 404


def test_get_session_returns_messages(client):
    session_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    session = _Stub(
        id=session_id,
        title="How did Airbnb optimize early retention?",
        created_at=now,
    )
    message = _Stub(
        id=uuid.uuid4(),
        role="user",
        content="How did Airbnb optimize early retention?",
        sources=None,
        created_at=now,
    )
    app.dependency_overrides[database_module.get_db] = lambda: FakeDetailDBSession(
        session=session, messages=[message]
    )

    response = client.get(f"/api/sessions/{session_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(session_id)
    assert body["title"] == session.title
    assert len(body["messages"]) == 1
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][0]["content"] == message.content


def test_delete_session_not_found(client):
    app.dependency_overrides[database_module.get_db] = lambda: FakeDeleteDBSession(
        session=None
    )

    response = client.delete(f"/api/sessions/{uuid.uuid4()}")
    assert response.status_code == 404


def test_delete_session_removes_session(client):
    session_id = uuid.uuid4()
    fake = FakeDeleteDBSession(session=_Stub(id=session_id))
    app.dependency_overrides[database_module.get_db] = lambda: fake

    response = client.delete(f"/api/sessions/{session_id}")
    assert response.status_code == 204
    assert response.content == b""
    assert len(fake.deleted) == 1


def test_derive_session_title():
    from app.api.chat import _derive_session_title

    assert (
        _derive_session_title("  How   did   Airbnb   optimize   early   retention?  ")
        == "How did Airbnb optimize early retention?"
    )
    long_title = _derive_session_title("word " * 100)
    assert len(long_title) <= 81  # 80 chars + optional ellipsis
    assert long_title.endswith("…")


def test_stream_chat_falls_back_below_threshold(client):
    app.dependency_overrides[chat_module.get_retriever] = lambda: FakeRetriever([])

    response = client.post(
        "/api/chat",
        json={
            "session_id": str(uuid.uuid4()),
            "message": "What did Lenny say about dogfooding at Netflix?",
            "mode": "default",
            "provider": "ollama",
        },
    )
    assert response.status_code == 200
    assert FALLBACK_MESSAGE in response.text
    assert "data: [DONE]" in response.text
    # No provider tokens should have been produced on the fallback path.
    assert '"type": "error"' not in response.text