import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import MIN_RANK_MANAGE_ACCOUNTS, has_min_rank, require_writer
from app.db.session import get_db
from app.models.user import User
from app.services import ledger_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/ledger", tags=["hash ledger"])


class AnchorRequest(BaseModel):
    note: str | None = None


def _senior(current_user: User = Depends(get_current_user)) -> User:
    if not has_min_rank(current_user, MIN_RANK_MANAGE_ACCOUNTS):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Anchoring and integrity drills require Deputy Superintendent rank or above.")
    return current_user


@router.get("")
def ledger(
    case_id: uuid.UUID = Depends(verified_case_id),
    recompute_files: bool = Query(True, description="Re-download every evidence file and re-hash it (slower, but proves file integrity)."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = ledger_service.verify(db, case_id, recompute_files=recompute_files)
    log_action(db, actor=current_user, action="ledger.verify", target_type="case", target_id=str(case_id), case_id=case_id,
               metadata={"is_valid": report["is_valid"], "broken_at_index": report["broken_at_index"]})
    return report


@router.post("/anchor", dependencies=[Depends(require_writer)])
def anchor(
    data: AnchorRequest,
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(_senior),
    db: Session = Depends(get_db),
) -> dict:
    try:
        record = ledger_service.anchor(db, case_id, by=current_user, note=data.note)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    log_action(db, actor=current_user, action="ledger.anchor", target_type="case", target_id=str(case_id), case_id=case_id,
               metadata={"head_hash": record.head_hash, "evidence_count": record.evidence_count})
    return ledger_service.verify(db, case_id, recompute_files=False)


@router.get("/checkpoint")
def checkpoint(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Downloadable checkpoint to be stored outside the system."""
    doc = ledger_service.checkpoint_document(db, case_id)
    log_action(db, actor=current_user, action="ledger.checkpoint_export", target_type="case", target_id=str(case_id), case_id=case_id)
    return Response(
        content=json.dumps(doc, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="chain-checkpoint-{case_id}.json"'},
    )


@router.post("/simulate-tamper", dependencies=[Depends(require_writer)])
def simulate_tamper(
    case_id: uuid.UUID = Depends(verified_case_id),
    index: int = Query(1, ge=0),
    current_user: User = Depends(_senior),
    db: Session = Depends(get_db),
) -> dict:
    """Integrity drill: edit one stored hash the way an insider with SQL access would, then verify."""
    try:
        report = ledger_service.simulate_tamper(db, case_id, index=index)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    log_action(db, actor=current_user, action="ledger.tamper_drill", target_type="case", target_id=str(case_id), case_id=case_id, metadata={"index": index})
    return report


@router.post("/restore", dependencies=[Depends(require_writer)])
def restore(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(_senior),
    db: Session = Depends(get_db),
) -> dict:
    report = ledger_service.restore(db, case_id)
    log_action(db, actor=current_user, action="ledger.tamper_drill_restored", target_type="case", target_id=str(case_id), case_id=case_id)
    return report
