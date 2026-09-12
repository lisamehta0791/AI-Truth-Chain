import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.user import User
from app.repositories import chargesheet_repository
from app.schemas.chargesheet import ChargesheetCheckOut, ChargesheetRunRequest
from app.services import chargesheet_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/chargesheet", tags=["chargesheet"])


@router.get("", response_model=list[ChargesheetCheckOut])
def list_chargesheet_checks(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChargesheetCheckOut]:
    return chargesheet_repository.list_for_case(db, case_id)


@router.post("/run", response_model=list[ChargesheetCheckOut], dependencies=[Depends(require_writer)])
async def run_chargesheet_qa(
    data: ChargesheetRunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChargesheetCheckOut]:
    checks = await chargesheet_service.run_qa(db, case_id=data.case_id, chargesheet_text=data.chargesheet_text)
    log_action(
        db, actor=current_user, action="chargesheet.run", target_type="case",
        target_id=str(data.case_id), case_id=data.case_id, metadata={"claims_checked": len(checks)},
    )
    return checks
