import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.timeline import VerificationStatus


class TimelineEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    source_evidence_id: uuid.UUID | None
    event_time: datetime
    event_type: str
    description: str
    verification_status: VerificationStatus
    confidence: float | None
    extracted_entities: dict | None
    source_excerpt: str | None
    confirmed_by: uuid.UUID | None
    confirmed_at: datetime | None
    created_at: datetime


class TimelineConfirmRequest(BaseModel):
    notes: str | None = None
