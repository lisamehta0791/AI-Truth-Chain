import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.db.session import get_db
from app.models.user import User
from app.repositories import graph_repository
from app.schemas.graph import GraphResponse
from app.services import graph_service

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("", response_model=GraphResponse)
def get_case_graph(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GraphResponse:
    """
    Rebuilt fresh on every request rather than cached — fine at hackathon
    case/evidence volume, and guarantees the graph never drifts from the
    evidence/timeline data it's derived from.
    """
    graph_service.rebuild_graph_for_case(db, case_id)
    return GraphResponse(
        entities=graph_repository.list_entities_for_case(db, case_id),
        relationships=graph_repository.list_relationships_for_case(db, case_id),
    )
