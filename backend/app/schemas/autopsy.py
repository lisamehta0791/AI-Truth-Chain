import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.timeline import VerificationStatus


class AutopsyFindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    source_evidence_id: uuid.UUID
    finding_type: str
    body_region: str | None
    ai_hypothesis: str
    confidence: float
    requires_review: bool
    status: VerificationStatus
    created_at: datetime


class AutopsyReviewRequest(BaseModel):
    notes: str | None = None
