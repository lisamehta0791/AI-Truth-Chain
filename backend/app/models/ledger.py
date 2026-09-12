import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ChainAnchor(Base):
    """
    A checkpoint of a case's hash chain, taken by a senior officer.

    The chain lets anyone DETECT tampering after the fact — but an attacker
    with write access to this database could rewrite every hash consistently
    and the chain would still verify. Anchoring is the answer: the head hash
    and the digest of the whole chain are written here AND exported as a
    signed checkpoint that is stored somewhere the database cannot reach (a
    court registry, a print-out in the case diary, a public timestamping
    service). A rewritten chain then disagrees with the anchor, and the
    disagreement is the proof.
    """
    __tablename__ = "chain_anchors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), nullable=False)
    head_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    chain_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False)
    anchored_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    anchored_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # HMAC over (case_id, head_hash, chain_digest, evidence_count, anchored_at)
    signature: Mapped[str] = mapped_column(String(64), nullable=False)
