"""
One retrieval engine, reused by every RAG-backed feature as a different
prompt/comparison mode over the same chunks (PDF §6): extraction grounding,
contradiction detection, guidance, autopsy cross-check, and chargesheet QA
all call `retrieve()` here rather than each keeping its own vector-search
logic — see the module docstrings in this package.
"""
import re
import uuid

from sqlalchemy.orm import Session

from app.models.rag import RagChunk
from app.repositories import rag_repository
from app.services.ai.embeddings import get_embedding_provider

_CHUNK_TARGET_CHARS = 800
_CHUNK_OVERLAP_CHARS = 100


def chunk_text(text: str) -> list[str]:
    """Simple sentence-aware sliding-window chunker — adequate for the short-form
    evidence text (statements, reports) this system deals with; swap for a
    smarter splitter later without changing any caller."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if len(current) + len(sentence) > _CHUNK_TARGET_CHARS and current:
            chunks.append(current.strip())
            current = current[-_CHUNK_OVERLAP_CHARS:] + " " + sentence
        else:
            current = f"{current} {sentence}".strip()
    if current.strip():
        chunks.append(current.strip())
    return chunks or [text.strip()]


def ingest_text(
    db: Session,
    *,
    source_type: str,
    source_id: str,
    case_id: uuid.UUID | None,
    text: str,
) -> list[RagChunk]:
    """Chunks `text`, embeds each chunk, and stores it in the shared pgvector table."""
    if not text or not text.strip():
        return []

    provider = get_embedding_provider()
    chunks = chunk_text(text)
    embeddings = provider.embed_batch(chunks)

    stored: list[RagChunk] = []
    for chunk_text_value, embedding in zip(chunks, embeddings, strict=True):
        stored.append(
            rag_repository.insert_chunk(
                db,
                RagChunk(
                    source_type=source_type,
                    source_id=source_id,
                    case_id=case_id,
                    chunk_text=chunk_text_value,
                    embedding=embedding,
                ),
            )
        )
    return stored


def retrieve(
    db: Session,
    *,
    query: str,
    case_id: uuid.UUID | None = None,
    source_type: str | None = None,
    top_k: int = 6,
) -> list[RagChunk]:
    provider = get_embedding_provider()
    query_embedding = provider.embed(query)
    return rag_repository.similarity_search(
        db, query_embedding=query_embedding, case_id=case_id, source_type=source_type, top_k=top_k
    )


def build_context_block(chunks: list[RagChunk]) -> str:
    """Renders retrieved chunks as a numbered, source-tagged block for prompt insertion,
    so every generated claim can be traced back to a specific source_type/source_id."""
    lines = []
    for i, chunk in enumerate(chunks, start=1):
        lines.append(f"[{i}] (source_type={chunk.source_type}, source_id={chunk.source_id})\n{chunk.chunk_text}")
    return "\n\n".join(lines) if lines else "(no prior case context available)"
