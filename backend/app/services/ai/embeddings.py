"""
Anthropic does not offer its own embedding model — Voyage AI is Anthropic's
recommended embeddings partner (docs.claude.com/en/docs/build-with-claude/embeddings).
This module wraps Voyage behind the same EmbeddingProvider interface used
everywhere else in the RAG pipeline, and falls back to a deterministic local
embedding ONLY when no VOYAGE_API_KEY is configured, so the pipeline still
runs end-to-end for a keyless demo. The fallback is not a real embedding
model and is never silently swapped in for a paid key — it logs a warning
every time it's used.
"""
import hashlib
import logging
from abc import ABC, abstractmethod
from functools import lru_cache

from app.config import get_settings
from app.models.rag import EMBEDDING_DIM

settings = get_settings()
logger = logging.getLogger(__name__)


class EmbeddingProvider(ABC):
    @abstractmethod
    def embed(self, text: str) -> list[float]:
        ...

    @abstractmethod
    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        ...


class VoyageEmbeddingProvider(EmbeddingProvider):
    def __init__(self) -> None:
        import voyageai  # imported lazily so the package is only required when actually used

        self._client = voyageai.Client(api_key=settings.voyage_api_key)
        self._model = settings.voyage_embedding_model

    def embed(self, text: str) -> list[float]:
        return self.embed_batch([text])[0]

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        result = self._client.embed(texts, model=self._model, input_type="document")
        return result.embeddings


class DeterministicFallbackEmbeddingProvider(EmbeddingProvider):
    """
    NOT a real embedding model. Produces a fixed-length pseudo-vector from a
    hash of the text so pgvector storage/similarity-search code paths can be
    exercised without any external API key. Retrieval quality with this
    fallback is not representative of the real system — it exists purely so
    Phase 3 is runnable end-to-end in a keyless local environment.
    """

    def __init__(self) -> None:
        logger.warning(
            "EmbeddingProvider fallback in use — no VOYAGE_API_KEY configured. "
            "Retrieval quality will NOT reflect production behavior."
        )

    def embed(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        # Repeat/trim the digest bytes to EMBEDDING_DIM floats in [0, 1).
        values = [(digest[i % len(digest)] / 255.0) for i in range(EMBEDDING_DIM)]
        return values

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(t) for t in texts]


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    if settings.embedding_provider == "voyage" and settings.voyage_api_key:
        return VoyageEmbeddingProvider()
    return DeterministicFallbackEmbeddingProvider()
