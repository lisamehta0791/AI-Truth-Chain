"""
Statement Reliability Flagging. Deliberately NOT AI — a line-level diff is
deterministic and auditable, and the build prompt is explicit that this
feature must not call a witness "unreliable" as a conclusion, only surface
what changed and when for a human to weigh. No LLM call happens here.
"""
import difflib
import uuid

from sqlalchemy.orm import Session

from app.models.analysis import StatementVersion
from app.models.user import User
from app.repositories import statement_repository
from app.services.audit_service import log_action


def _compute_diff(previous_text: str, new_text: str) -> str:
    diff_lines = difflib.unified_diff(
        previous_text.splitlines(), new_text.splitlines(), lineterm="", fromfile="previous", tofile="new"
    )
    return "\n".join(diff_lines)


def add_version(db: Session, *, evidence_id: uuid.UUID, text: str, language: str, actor: User) -> StatementVersion:
    previous = statement_repository.get_latest_for_evidence(db, evidence_id)
    next_version_no = (previous.version_no + 1) if previous else 1
    diff_text = _compute_diff(previous.text, text) if previous else None

    version = StatementVersion(
        evidence_id=evidence_id,
        version_no=next_version_no,
        text=text,
        language=language,
        diff_from_previous=diff_text,
    )
    version = statement_repository.create(db, version)

    log_action(
        db, actor=actor, action="statement.new_version", target_type="evidence",
        target_id=str(evidence_id), metadata={"version_no": next_version_no, "has_diff": diff_text is not None},
    )
    return version
