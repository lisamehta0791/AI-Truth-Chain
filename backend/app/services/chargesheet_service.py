import uuid

from sqlalchemy.orm import Session

from app.core.websocket_manager import manager
from app.models.analysis import ChargesheetCheck, ChargesheetCheckStatus
from app.repositories import chargesheet_repository
from app.services.ai import chargesheet as ai_chargesheet


async def run_qa(db: Session, *, case_id: uuid.UUID, chargesheet_text: str) -> list[ChargesheetCheck]:
    raw_checks = ai_chargesheet.run_chargesheet_qa(db, case_id=case_id, chargesheet_text=chargesheet_text)

    chargesheet_repository.delete_for_case(db, case_id)

    created: list[ChargesheetCheck] = []
    for raw in raw_checks:
        try:
            status = ChargesheetCheckStatus(raw.get("status", "missing_support"))
        except ValueError:
            status = ChargesheetCheckStatus.MISSING_SUPPORT

        check = ChargesheetCheck(
            case_id=case_id,
            claim_text=raw.get("claim_text", ""),
            status=status,
            linked_evidence_ids=raw.get("linked_source_ids", []),
        )
        created.append(chargesheet_repository.create(db, check))

    await manager.broadcast(
        case_id,
        {
            "type": "chargesheet.checked",
            "total_claims": len(created),
            "conflicts": sum(1 for c in created if c.status == ChargesheetCheckStatus.CONFLICT),
        },
    )
    return created
