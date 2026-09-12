import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.timeline import VerificationStatus


class LocationScore(Base):
    """
    Predictive Location Agent output (PDF §3.5). Explicitly rule-based/heuristic —
    `explanation` always stores the weighted factors so the score is never a black box.
    """
    __tablename__ = "location_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    gps_lat: Mapped[float] = mapped_column(Numeric(9, 6))
    gps_lng: Mapped[float] = mapped_column(Numeric(9, 6))
    score: Mapped[float] = mapped_column(Numeric(4, 3))
    explanation: Mapped[dict] = mapped_column(JSON)  # {"recency_weight":..., "reliability_weight":..., ...}
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AutopsyFinding(Base):
    """
    Autopsy/Post-Mortem Analysis Agent (PDF §3.7). `requires_review` defaults True and
    is never settable to False by the AI layer — only a forensic reviewer confirm action
    changes verification_status.
    """
    __tablename__ = "autopsy_findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    source_evidence_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evidence.id"))

    finding_type: Mapped[str] = mapped_column(String(128))  # e.g. "time_of_death_alignment", "weapon_injury_consistency"
    body_region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ai_hypothesis: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(4, 3))
    requires_review: Mapped[bool] = mapped_column(default=True)

    status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.AI_HYPOTHESIS,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChargesheetCheckStatus(str, enum.Enum):
    PASS = "pass"
    WARNING = "warning"
    CONFLICT = "conflict"
    MISSING_SUPPORT = "missing_support"


class ChargesheetCheck(Base):
    """Pre-filing consistency QA for a human legal reviewer (PDF §3.6) — never a verdict."""
    __tablename__ = "chargesheet_checks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ChargesheetCheckStatus] = mapped_column(
        Enum(ChargesheetCheckStatus, name="chargesheet_check_status")
    )
    linked_evidence_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClosureReadinessScore(Base):
    """Case Closure Readiness dashboard number (Additional feature)."""
    __tablename__ = "closure_readiness_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    score: Mapped[float] = mapped_column(Numeric(5, 2))
    factors: Mapped[dict] = mapped_column(JSON)  # unresolved gaps/contradictions/review items breakdown
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CaseSimilarityMatch(Base):
    """Case Similarity Search result (Additional feature)."""
    __tablename__ = "case_similarity_matches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    matched_case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    similarity_score: Mapped[float] = mapped_column(Numeric(4, 3))
    matched_factors: Mapped[dict] = mapped_column(JSON)


class StatementVersion(Base):
    """Statement Reliability Flagging — tracks changes across interview versions (Additional feature)."""
    __tablename__ = "statement_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    evidence_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("evidence.id"))
    version_no: Mapped[int] = mapped_column(nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(32), default="en")
    diff_from_previous: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
