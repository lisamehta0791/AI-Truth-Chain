import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class VerificationStatus(str, enum.Enum):
    """
    The single enum used everywhere an AI claim meets a human decision.
    This is the structural enforcement of PDF §2 ("AI assists, humans decide") —
    every AI-derived record in the schema carries one of these, never a bare boolean.
    """
    VERIFIED = "verified"
    AI_EXTRACTED_UNVERIFIED = "ai_extracted_unverified"
    AI_HYPOTHESIS = "ai_hypothesis"
    HUMAN_CONFIRMED = "human_confirmed"
    DISMISSED = "dismissed"
    REQUIRES_REVIEW = "requires_review"


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    source_evidence_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evidence.id"), nullable=True
    )

    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.AI_EXTRACTED_UNVERIFIED,
    )
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)  # 0.000–1.000
    extracted_entities: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)  # exact quoted span shown to officer

    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
