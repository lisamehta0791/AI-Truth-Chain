import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.timeline import VerificationStatus


class Severity(str, enum.Enum):
    MINOR = "minor"
    MAJOR = "major"


class Contradiction(Base):
    """A flagged conflict between two evidence items (PDF §3.3). Never auto-resolves."""
    __tablename__ = "contradictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    evidence_a_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evidence.id"))
    evidence_b_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evidence.id"))

    severity: Mapped[Severity] = mapped_column(Enum(Severity, name="contradiction_severity"))
    confidence: Mapped[float] = mapped_column(Numeric(4, 3))
    explanation: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.REQUIRES_REVIEW,
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GuidanceSuggestion(Base):
    """Investigation Guidance Agent output — a checklist item, never a legal authority (PDF §3.4)."""
    __tablename__ = "guidance_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    triggered_by_evidence_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evidence.id"), nullable=True
    )

    suggestion: Mapped[str] = mapped_column(Text, nullable=False)
    legal_reference: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g. "BNS Section 103"
    confidence: Mapped[float] = mapped_column(Numeric(4, 3))

    status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.REQUIRES_REVIEW,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LegalKnowledgeBaseEntry(Base):
    """Curated BNS/CrPC corpus the Guidance Agent retrieves from — never model memory."""
    __tablename__ = "legal_knowledge_base"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section_code: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # embedding column added via a dedicated migration once pgvector dimension is finalized in Phase 3
