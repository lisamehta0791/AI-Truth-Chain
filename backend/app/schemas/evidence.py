import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.evidence import CustodyAction, EvidenceStatus, EvidenceType


class DeviceMetadata(BaseModel):
    """
    Locked at upload time and never edited afterward — mirrors PDF §3.1's
    "device metadata capture/lock" requirement.
    """
    device_id: str | None = None
    device_model: str | None = None
    capture_app_version: str | None = None


class EvidenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    evidence_type: EvidenceType
    status: EvidenceStatus
    uploaded_by: uuid.UUID
    witness_officer_id: uuid.UUID | None
    storage_key: str | None
    original_filename: str | None
    device_metadata: dict | None
    captured_at: datetime | None
    uploaded_at: datetime
    gps_lat: float | None
    gps_lng: float | None
    sha256_hash: str
    previous_hash: str | None
    description: str | None
    language: str | None
    extracted_text: str | None

    # Proof-of-presence capture. The hash is exposed (so the UI can show the
    # capture is tamper-evident) but the storage key is not turned into a URL
    # here — an officer's photo is fetched through the same role-gated
    # presigned-URL route as any other evidence file.
    live_capture_sha256: str | None = None
    live_capture_at: datetime | None = None


class ChainOfCustodyEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    evidence_id: uuid.UUID
    actor_id: uuid.UUID
    action: CustodyAction
    hash_at_event: str | None
    notes: str | None
    occurred_at: datetime


class WitnessConfirmRequest(BaseModel):
    notes: str | None = None


class ChainIntegrityReport(BaseModel):
    case_id: uuid.UUID
    is_valid: bool
    broken_at_index: int | None
    evidence_count: int
