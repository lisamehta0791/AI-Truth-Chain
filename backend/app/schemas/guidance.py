import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.timeline import VerificationStatus


class GuidanceSuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    triggered_by_evidence_id: uuid.UUID | None
    suggestion: str
    legal_reference: str
    confidence: float
    status: VerificationStatus
    created_at: datetime


class GuidanceReviewRequest(BaseModel):
    notes: str | None = None
