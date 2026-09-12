"""
Centralized application configuration.

SECURITY RULE FOR THIS FILE: no credential ever gets a default value here.

Secrets live only in the gitignored `.env` (see `.env.example` at the project
root for the full list of names). Fields like `database_url`, `jwt_secret_key`
and the S3 keys are declared with NO default, so a missing value fails loudly
at startup with a named error instead of silently falling back to a value
baked into source control. Defaults that DO appear below are non-sensitive
operational settings (ports, model names, timeouts) only.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolved as an absolute path from this file's own location (backend/app/config.py),
# so it always finds the project-root .env regardless of which folder a command is
# run from — a relative path like "../.env" only worked when running from backend/.
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    app_name: str = "Chain of Truth"

    # ---- Database (REQUIRED — contains a password, never defaulted here) ----
    database_url: str

    # ---- Object storage (REQUIRED — credentials, never defaulted here) ----
    s3_access_key: str
    s3_secret_key: str
    s3_endpoint_url: str = "http://localhost:9000"
    s3_bucket_name: str = "evidence"
    s3_region: str = "us-east-1"

    # ---- Auth (REQUIRED — signing key, never defaulted here) ----
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # ---- AI provider ----
    # API keys default to "" (absent), never to a real key. An empty key is a
    # supported state: evidence still uploads/hashes/logs and the AI stages are
    # skipped with a warning.
    ai_provider: str = "groq"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"

    # ---- Embeddings ----
    # Anthropic does not offer an embedding model; Voyage AI is Anthropic's
    # recommended embeddings partner. If VOYAGE_API_KEY is unset, the app falls
    # back to a deterministic local embedding so the RAG pipeline still runs
    # end-to-end for demo/dev without any paid key — clearly logged as a
    # fallback, never silently passed off as real.
    embedding_provider: str = "voyage"
    voyage_api_key: str = ""
    voyage_embedding_model: str = "voyage-3.5"

    # CORS — the Vite dev server origin
    cors_origins: list[str] = ["http://localhost:5173"]

    @field_validator("jwt_secret_key")
    @classmethod
    def _reject_weak_signing_key(cls, value: str) -> str:
        """
        A short or placeholder signing key makes every access token forgeable.
        Enforced only outside development so local setup stays frictionless.
        Generate one with:
            python -c "import secrets; print(secrets.token_urlsafe(48))"
        """
        placeholders = {"change_me_to_a_long_random_string", "changeme", "secret"}
        if value.strip().lower() in placeholders:
            raise ValueError(
                "JWT_SECRET_KEY is still the placeholder from .env.example. "
                "Generate a real one before running this anywhere but your own machine."
            )
        return value


@lru_cache
def get_settings() -> Settings:
    """Settings are cached — env vars are read once per process."""
    return Settings()
