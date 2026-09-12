import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.analysis import ChargesheetCheckStatus


class ChargesheetRunRequest(BaseModel):
    case_id: uuid.UUID
    chargesheet_text: str


class ChargesheetCheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    claim_text: str
    status: ChargesheetCheckStatus
    linked_evidence_ids: list | None
    created_at: datetime
