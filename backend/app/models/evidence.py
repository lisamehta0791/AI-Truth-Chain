import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EvidenceType(str, enum.Enum):
    PHOTO = "photo"
    VIDEO = "video"
    AUDIO = "audio"
    DOCUMENT = "document"
    STATEMENT = "statement"
    FORENSIC_REPORT = "forensic_report"
    AUTOPSY_REPORT = "autopsy_report"
    CCTV_METADATA = "cctv_metadata"
    PHONE_RECORD = "phone_record"
    GPS_LOG = "gps_log"
    SEIZED_ITEM = "seized_item"


class EvidenceStatus(str, enum.Enum):
    PENDING_CONFIRMATION = "pending_confirmation"   # waiting on two-person confirmation
    LOGGED = "logged"                               # hash-chained and stored
    AI_PROCESSED = "ai_processed"                   # extraction/RAG has run
    FLAGGED = "flagged"                              # part of an open contradiction


class Evidence(Base):
    """
    Every evidence item. `sha256_hash` and `previous_hash` form the tamper-evident
    hash chain (PDF §3.1) — this table intentionally has NO AI-derived columns;
    hashing/chaining is deterministic cryptography, not AI (PDF §6).
    """
    __tablename__ = "evidence"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    evidence_type: Mapped[EvidenceType] = mapped_column(Enum(EvidenceType, name="evidence_type"))
    status: Mapped[EvidenceStatus] = mapped_column(
        Enum(EvidenceStatus, name="evidence_status"), default=EvidenceStatus.PENDING_CONFIRMATION
    )

    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    witness_officer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )  # the second confirming officer, required for physical evidence (PDF §3.1 fix)

    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)

    device_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # GPS, device ID, capture ts
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    gps_lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    gps_lng: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)

    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(32), nullable=True)  # multi-language support

    # Raw text the AI pipeline reads (typed/transcribed statement text, an
    # officer's manual caption of a photo/video, an OCR'd document, etc.).
    # Kept separate from `description` (a human-facing summary) so extraction
    # always runs against the actual evidentiary text, not a paraphrase of it.
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- Live capture (proof-of-presence for field ranks) ----
    # A photo taken by the collecting officer's own camera at the moment of
    # logging. Field ranks (Constable/HC/ASI) cannot log evidence without one:
    # it is a second independent signal tying a named officer to a place and
    # time, which is exactly the "one person can't fake this alone" bar the
    # spec sets for evidence provenance (PDF §3.1). Hashed like any other
    # evidence file so it cannot be swapped after the fact.
    live_capture_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    live_capture_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    live_capture_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    custody_events: Mapped[list["ChainOfCustodyEvent"]] = relationship(back_populates="evidence")


class CustodyAction(str, enum.Enum):
    COLLECTED = "collected"
    WITNESS_CONFIRMED = "witness_confirmed"
    HASH_LOGGED = "hash_logged"
    VIEWED = "viewed"
    TRANSFERRED = "transferred"
    AI_PROCESSED = "ai_processed"
    SYNCED_FROM_OFFLINE = "synced_from_offline"


class ChainOfCustodyEvent(Base):
    """Every touch of an evidence item — collection, confirmation, transfer, access."""
    __tablename__ = "chain_of_custody_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    evidence_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evidence.id"))
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    action: Mapped[CustodyAction] = mapped_column(Enum(CustodyAction, name="custody_action"))
    hash_at_event: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    evidence: Mapped["Evidence"] = relationship(back_populates="custody_events")
