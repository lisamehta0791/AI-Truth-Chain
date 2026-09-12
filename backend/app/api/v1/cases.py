from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.permissions import can_view_all_cases
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.case import Case
from app.models.user import User
from app.repositories import case_repository
from app.schemas.case import CaseCreate, CaseOut
from app.services.audit_service import log_action

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_writer)])
def create_case(
    data: CaseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CaseOut:
    if case_repository.get_by_case_number(db, data.case_number):
        raise HTTPException(status_code=400, detail="A case with this case number already exists.")

    case = Case(
        case_number=data.case_number,
        title=data.title,
        description=data.description,
        created_by=current_user.id,
    )
    case = case_repository.create(db, case)
    case_repository.add_member(db, case.id, current_user.id)
    log_action(db, actor=current_user, action="case.create", target_type="case", target_id=str(case.id))
    return case


@router.get("", response_model=list[CaseOut])
def list_my_cases(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CaseOut]:
    # Superintendent and above see every case (cross-case visibility is a
    # command function — see permissions.MIN_RANK_CROSS_CASE_VIEW); everyone
    # else sees the cases they are a member of.
    if can_view_all_cases(current_user):
        return case_repository.list_all(db)
    return case_repository.list_for_user(db, current_user.id)


@router.get("/{case_id}", response_model=CaseOut)
def get_case(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CaseOut:
    import uuid

    case = case_repository.get_by_id(db, uuid.UUID(case_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")

    log_action(
        db, actor=current_user, action="case.view", target_type="case",
        target_id=str(case.id), case_id=case.id,
    )
    return case
