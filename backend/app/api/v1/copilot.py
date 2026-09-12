import asyncio
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.db.session import get_db
from app.models.user import User
from app.services.ai import copilot
from app.services.audit_service import log_action

router = APIRouter(prefix="/copilot", tags=["investigation copilot"])


class CopilotQuestion(BaseModel):
    case_id: uuid.UUID
    question: str = Field(min_length=3, max_length=600)


class CopilotAnswer(BaseModel):
    answer: str
    citations: list[str]
    confidence: float
    gaps: list[str]
    ai_unavailable: bool


@router.get("/suggestions")
def suggestions(current_user: User = Depends(get_current_user)) -> list[str]:
    return copilot.SUGGESTED_QUESTIONS


@router.post("/ask", response_model=CopilotAnswer)
async def ask(
    data: CopilotQuestion,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CopilotAnswer:
    """
    Read-only, so view-only accounts may use it. Every question is audited:
    what an officer asked the file is itself part of the investigative record.
    """
    verified_case_id(data.case_id, db)  # 404 on unknown case, same rule as every case-scoped route
    result = await asyncio.to_thread(copilot.ask, db, case_id=data.case_id, question=data.question)
    log_action(
        db, actor=current_user, action="copilot.ask", target_type="case", target_id=str(data.case_id),
        case_id=data.case_id,
        metadata={"question": data.question[:300], "confidence": result["confidence"], "citations": len(result["citations"])},
    )
    return CopilotAnswer(**result)
