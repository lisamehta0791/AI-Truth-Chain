import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.db.session import get_db
from app.models.user import User
from app.schemas.closure import ClosureReadinessScoreOut
from app.services import closure_service

router = APIRouter(prefix="/closure-score", tags=["closure-score"])


@router.get("", response_model=ClosureReadinessScoreOut)
def compute_closure_readiness(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClosureReadinessScoreOut:
    """Computed fresh on every request — cheap, and always reflects the case's current state."""
    return closure_service.compute_score_for_case(db, case_id)
