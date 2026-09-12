import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.contradiction import Severity
from app.models.timeline import VerificationStatus


class ContradictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    evidence_a_id: uuid.UUID
    evidence_b_id: uuid.UUID
    severity: Severity
    confidence: float
    explanation: str
    status: VerificationStatus
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    created_at: datetime


class ContradictionReviewRequest(BaseModel):
    notes: str | None = None
