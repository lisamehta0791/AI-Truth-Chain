import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LocationScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    gps_lat: float
    gps_lng: float
    score: float
    explanation: dict
    computed_at: datetime
