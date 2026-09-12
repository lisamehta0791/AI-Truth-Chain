import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.db.session import get_db
from app.models.user import User
from app.schemas.similarity import CaseSimilarityMatchOut
from app.services import case_similarity_service

router = APIRouter(prefix="/case-similarity", tags=["case-similarity"])


@router.get("", response_model=list[CaseSimilarityMatchOut])
def find_similar_cases(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CaseSimilarityMatchOut]:
    return case_similarity_service.compute_similarities_for_case(db, case_id)


@router.get("/compare")
def compare_cases(
    other_id: uuid.UUID,
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Side-by-side comparison of two cases: shared names, places, vehicles and modus operandi."""
    from app.core.permissions import can_view_all_cases
    from app.repositories import case_repository

    other = case_repository.get_by_id(db, other_id)
    if other is None:
        raise HTTPException(status_code=404, detail="The other case does not exist.")
    if not can_view_all_cases(current_user) and all(c.id != other_id for c in case_repository.list_for_user(db, current_user.id)):
        raise HTTPException(status_code=403, detail="You are not attached to the other case.")
    try:
        return case_similarity_service.compare_cases(db, case_id, other_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
