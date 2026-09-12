import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.user import User
from app.repositories import location_repository
from app.schemas.location import LocationScoreOut
from app.services import location_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/location", tags=["location"])


@router.get("", response_model=list[LocationScoreOut])
def list_location_scores(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LocationScoreOut]:
    return location_repository.list_for_case(db, case_id)


@router.post("/compute", response_model=list[LocationScoreOut], dependencies=[Depends(require_writer)])
async def compute_location_scores(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LocationScoreOut]:
    scores = await location_service.compute_scores_for_case(db, case_id)
    log_action(
        db, actor=current_user, action="location.compute", target_type="case",
        target_id=str(case_id), case_id=case_id, metadata={"regions_scored": len(scores)},
    )
    return scores
