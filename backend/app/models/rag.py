import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, JSON, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Embedding dimension depends on the embedding provider chosen in Phase 3
# (e.g. 1024 for Voyage, 1536 for OpenAI text-embedding-3-small). Set once here.
EMBEDDING_DIM = 1024


class RagChunk(Base):
    """
    Shared pgvector-backed chunk store used by every RAG-backed feature (timeline
    extraction, contradiction detection, guidance, autopsy cross-check, chargesheet QA).
    `source_type` disambiguates case evidence chunks from legal-knowledge-base chunks
    so retrieval never accidentally mixes case facts with statutory text.
    """
    __tablename__ = "rag_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)  # "evidence" | "legal_kb" | ...
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    case_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OfflineSyncQueueEntry(Base):
    """
    Offline-first evidence logging (PDF §4). The client captures original_timestamp
    and original_hash *before* connectivity returns; the sync service validates
    against these rather than recomputing them, so provenance survives the gap.
    """
    __tablename__ = "offline_sync_queue"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    original_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    original_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
