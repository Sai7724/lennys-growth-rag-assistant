"""FastAPI application entrypoint for the Lenny Growth Assistant."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import artifacts, chat, health, models, sessions
from app.config import settings
from app.database import create_hnsw_index, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Bootstrap the vector store on startup (best-effort)."""
    try:
        await init_db()
        await create_hnsw_index()
    except Exception as exc:  # noqa: BLE001 - startup must not crash without DB
        print(f"[startup] Database bootstrap skipped: {exc}")
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(models.router)
app.include_router(sessions.router)
app.include_router(artifacts.router)
app.include_router(chat.router)


@app.get("/")
async def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/api/health"}