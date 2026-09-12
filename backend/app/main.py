from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description=(
        "AI-Assisted Evidence Integrity & Investigation System for Police and Judiciary. "
        "AI assists investigators — it does not determine guilt. All conclusions require human verification."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["system"])
def health_check() -> dict:
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}
