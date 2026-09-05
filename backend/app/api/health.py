"""Health checks: service liveness + DB reachability."""
from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.models.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    db_status = "ok"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "unavailable"
    return HealthResponse(status="ok", database=db_status, provider=settings.default_provider)