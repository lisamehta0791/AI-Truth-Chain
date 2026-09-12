import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import MIN_RANK_MANAGE_ACCOUNTS, has_min_rank, require_writer
from app.db.session import get_db
from app.demo import scenario_service
from app.demo.scenario_service import ScenarioError
from app.models.case import Case
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter(prefix="/demo", tags=["demo scenario"])


def _presenter(current_user: User = Depends(get_current_user)) -> User:
    """
    Driving the scenario is a presenter's action, not an investigator's: it
    fabricates evidence into a case. Restricted to command ranks so a junior
    account cannot pollute a live case by clicking the wrong button.
    """
    if not has_min_rank(current_user, MIN_RANK_MANAGE_ACCOUNTS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only officers of Deputy Superintendent rank or above can drive the demonstration scenario.",
        )
    return current_user


@router.get("/scenario")
def scenario_status(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return scenario_service.describe(db, case_id)


@router.post("/scenario/next", dependencies=[Depends(require_writer)])
async def scenario_next(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(_presenter),
    db: Session = Depends(get_db),
) -> dict:
    case = db.get(Case, case_id)
    try:
        result = await scenario_service.load_next_stage(db, case)
    except ScenarioError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    log_action(
        db, actor=current_user, action="demo.stage_loaded", target_type="case", target_id=str(case_id),
        case_id=case_id, metadata={"stage": result["stage"]},
    )
    return result


@router.post("/scenario/all", dependencies=[Depends(require_writer)])
async def scenario_all(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(_presenter),
    db: Session = Depends(get_db),
) -> dict:
    case = db.get(Case, case_id)
    result = await scenario_service.load_all(db, case)
    log_action(
        db, actor=current_user, action="demo.all_stages_loaded", target_type="case", target_id=str(case_id),
        case_id=case_id,
    )
    return result


@router.post("/scenario/reset", dependencies=[Depends(require_writer)])
def scenario_reset(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(_presenter),
    db: Session = Depends(get_db),
) -> dict:
    case = db.get(Case, case_id)
    result = scenario_service.reset_case(db, case)
    log_action(
        db, actor=current_user, action="demo.case_reset", target_type="case", target_id=str(case_id),
        case_id=case_id, metadata={"removed_evidence": result["removed_evidence"]},
    )
    return result
