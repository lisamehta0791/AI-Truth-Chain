import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import can_view_raw_evidence, require_writer
from app.db.session import get_db
from app.models.evidence import EvidenceType
from app.models.user import User
from app.repositories import evidence_repository
from app.schemas.evidence import (
    ChainIntegrityReport,
    ChainOfCustodyEventOut,
    EvidenceOut,
    WitnessConfirmRequest,
)
from app.services import evidence_service, storage_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.post("", response_model=EvidenceOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_writer)])
async def upload_evidence(
    case_id: uuid.UUID = Form(...),
    evidence_type: EvidenceType = Form(...),
    file: UploadFile = File(...),
    witness_officer_id: uuid.UUID | None = Form(None),
    device_metadata: str | None = Form(None),  # JSON-encoded string from the client
    captured_at: datetime | None = Form(None),
    gps_lat: float | None = Form(None),
    gps_lng: float | None = Form(None),
    description: str | None = Form(None),
    language: str | None = Form(None),
    text_content: str | None = Form(None),  # raw evidentiary text the AI pipeline reads (Phase 3)
    # Proof-of-presence selfie taken by the device camera at collection time.
    # Mandatory for field ranks (Constable/HC/ASI) — see
    # core/permissions.requires_live_capture and evidence_service's gate.
    live_capture: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EvidenceOut:
    parsed_metadata = None
    if device_metadata:
        try:
            parsed_metadata = json.loads(device_metadata)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail="device_metadata must be valid JSON") from exc

    file_bytes = await file.read()
    live_capture_bytes = await live_capture.read() if live_capture is not None else None

    try:
        evidence = await evidence_service.ingest_evidence(
            db,
            case_id=case_id,
            evidence_type=evidence_type,
            file_bytes=file_bytes,
            original_filename=file.filename,
            content_type=file.content_type,
            uploader=current_user,
            witness_officer_id=witness_officer_id,
            device_metadata=parsed_metadata,
            captured_at=captured_at,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
            description=description,
            language=language,
            extracted_text=text_content,
            live_capture_bytes=live_capture_bytes,
            live_capture_content_type=live_capture.content_type if live_capture else None,
        )
    except evidence_service.LiveCaptureRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except evidence_service.WitnessRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except evidence_service.InvalidWitnessError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return evidence


@router.post("/{evidence_id}/confirm-witness", response_model=EvidenceOut, dependencies=[Depends(require_writer)])
async def confirm_witness(
    evidence_id: uuid.UUID,
    data: WitnessConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EvidenceOut:
    evidence = evidence_repository.get_by_id(db, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")

    try:
        evidence = await evidence_service.confirm_witness(db, evidence=evidence, witness=current_user, notes=data.notes)
    except evidence_service.InvalidWitnessError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return evidence


@router.get("", response_model=list[EvidenceOut])
def list_evidence_for_case(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EvidenceOut]:
    items = evidence_repository.list_for_case(db, case_id)
    log_action(
        db, actor=current_user, action="evidence.list", target_type="case",
        target_id=str(case_id), case_id=case_id,
    )
    return items


@router.get("/{evidence_id}", response_model=EvidenceOut)
def get_evidence(
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EvidenceOut:
    evidence = evidence_repository.get_by_id(db, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")

    # Every view is audited, not just edits (PDF §7) — this is the choke point for that requirement.
    log_action(
        db, actor=current_user, action="evidence.view", target_type="evidence",
        target_id=str(evidence.id), case_id=evidence.case_id,
    )
    return evidence


@router.get("/{evidence_id}/download-url")
def get_download_url(
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Raw file bytes are gated by role — Legal Reviewer sees metadata only (PDF §7 PII minimization)."""
    if not can_view_raw_evidence(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your role can view evidence metadata but not download raw evidence files.",
        )
    evidence = evidence_repository.get_by_id(db, evidence_id)
    if evidence is None or evidence.storage_key is None:
        raise HTTPException(status_code=404, detail="Evidence file not found")

    url = storage_service.generate_presigned_download_url(evidence.storage_key)
    log_action(
        db, actor=current_user, action="evidence.download", target_type="evidence",
        target_id=str(evidence.id), case_id=evidence.case_id,
    )
    return {"url": url, "expires_in_seconds": 300}


@router.get("/{evidence_id}/chain", response_model=list[ChainOfCustodyEventOut])
def get_chain_of_custody(
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChainOfCustodyEventOut]:
    evidence = evidence_repository.get_by_id(db, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return evidence_repository.list_custody_events(db, evidence_id)


@router.get("/case/{case_id}/chain-integrity", response_model=ChainIntegrityReport)
def check_chain_integrity(
    case_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChainIntegrityReport:
    is_valid, broken_index, count = evidence_service.verify_case_chain(db, case_id)
    return ChainIntegrityReport(
        case_id=case_id, is_valid=is_valid, broken_at_index=broken_index, evidence_count=count
    )
