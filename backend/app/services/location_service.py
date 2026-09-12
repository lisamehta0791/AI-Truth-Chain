"""
Predictive Location Agent. Deliberately rule-based, not a trained model —
PDF §3.5 requires this be "explainable heatmap — heuristic scoring, not
black-box ML", and PDF §6 lists location prediction as "Rule-based geospatial
scoring" explicitly outside the AI/RAG column. No LLM or embedding call
happens anywhere in this file.

Scoring combines two weighted, fully-explained factors per grid cell:
  - recency: how recently the newest evidence pinned to that cell arrived
    (exponential decay), because fresher information about a location is
    more actionable than stale information.
  - reliability: a function of (a) whether the evidence was two-person
    confirmed at collection and (b) how objective the evidence type is
    (a GPS log or CCTV frame is more reliable for "where" than a verbal
    witness statement).
Every score's `explanation` stores both raw factors and the evidence IDs
that fed it, so the map can show exactly why a region is highlighted.
"""
import math
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.websocket_manager import manager
from app.models.analysis import LocationScore
from app.models.evidence import Evidence, EvidenceType
from app.repositories import evidence_repository, location_repository

_HIGH_RELIABILITY_TYPES = {EvidenceType.GPS_LOG, EvidenceType.CCTV_METADATA, EvidenceType.PHONE_RECORD}
_GRID_PRECISION = 3  # ~111m at the equator; groups nearby pins into one scored region
_RECENCY_HALF_LIFE_HOURS = 48.0


def _reliability_for(evidence: Evidence) -> float:
    type_component = 1.0 if evidence.evidence_type in _HIGH_RELIABILITY_TYPES else 0.7
    confirmation_component = 1.0 if evidence.witness_officer_id is not None else 0.75
    return round(type_component * confirmation_component, 3)


def _recency_for(evidence: Evidence, now: datetime) -> float:
    uploaded_at = evidence.uploaded_at
    if uploaded_at.tzinfo is None:
        uploaded_at = uploaded_at.replace(tzinfo=timezone.utc)
    hours_since = max((now - uploaded_at).total_seconds() / 3600.0, 0.0)
    return round(math.exp(-hours_since / _RECENCY_HALF_LIFE_HOURS), 3)


async def compute_scores_for_case(db: Session, case_id: uuid.UUID) -> list[LocationScore]:
    all_evidence = evidence_repository.list_for_case(db, case_id)
    located = [e for e in all_evidence if e.gps_lat is not None and e.gps_lng is not None]

    location_repository.delete_for_case(db, case_id)
    if not located:
        return []

    now = datetime.now(timezone.utc)
    cells: dict[tuple[float, float], list[Evidence]] = {}
    for evidence in located:
        cell_key = (round(float(evidence.gps_lat), _GRID_PRECISION), round(float(evidence.gps_lng), _GRID_PRECISION))
        cells.setdefault(cell_key, []).append(evidence)

    created: list[LocationScore] = []
    for (lat, lng), items in cells.items():
        recency_values = [_recency_for(e, now) for e in items]
        reliability_values = [_reliability_for(e) for e in items]
        recency_weight = max(recency_values)
        reliability_weight = sum(reliability_values) / len(reliability_values)
        score = round(min(max(0.5 * recency_weight + 0.5 * reliability_weight, 0.0), 1.0), 3)

        location_score = LocationScore(
            case_id=case_id,
            gps_lat=lat,
            gps_lng=lng,
            score=score,
            explanation={
                "recency_weight": recency_weight,
                "reliability_weight": round(reliability_weight, 3),
                "evidence_count": len(items),
                "evidence_ids": [str(e.id) for e in items],
                "method": "heuristic: 0.5*recency + 0.5*reliability, rule-based (not AI/ML)",
            },
        )
        created.append(location_repository.create(db, location_score))

    await manager.broadcast(case_id, {"type": "location.updated", "regions_scored": len(created)})
    return created
