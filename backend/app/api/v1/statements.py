import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.user import User
from app.repositories import statement_repository
from app.schemas.statement import StatementVersionCreate, StatementVersionOut
from app.services import statement_service

router = APIRouter(prefix="/statements", tags=["statements"])


@router.post("", response_model=StatementVersionOut, dependencies=[Depends(require_writer)])
def add_statement_version(
    data: StatementVersionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StatementVersionOut:
    return statement_service.add_version(
        db, evidence_id=data.evidence_id, text=data.text, language=data.language, actor=current_user
    )


@router.get("/{evidence_id}", response_model=list[StatementVersionOut])
def list_statement_versions(
    evidence_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StatementVersionOut]:
    return statement_repository.list_for_evidence(db, evidence_id)
