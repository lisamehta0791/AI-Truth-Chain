"""
Rebuilds a case's evidence graph on demand from data that already exists
elsewhere (evidence records, AI-extracted entities on timeline events, GPS
coordinates) rather than requiring a separate manual graph-editing workflow.

Digital Evidence Correlation is implemented here as RELATED_TO edges between
evidence items that share a location — deliberately simple/deterministic
rather than another AI call, since "these two things were logged at the same
place" is a fact, not an inference.
"""
import uuid

from sqlalchemy.orm import Session

from app.models.graph import EntityRelationship, EntityType, RelationType
from app.repositories import evidence_repository, graph_repository, timeline_repository

_EXTRACTED_TYPE_MAP = {
    "person": EntityType.PERSON,
    "location": EntityType.LOCATION,
    "device": EntityType.DEVICE,
    "document": EntityType.DOCUMENT,
}
_GRID_PRECISION = 3  # matches location_service's grid — same "same place" definition throughout the app


def _relationship(case_id, from_id, to_id, relation_type, source_evidence_id) -> EntityRelationship:
    return EntityRelationship(
        case_id=case_id,
        from_entity_id=from_id,
        to_entity_id=to_id,
        relation_type=relation_type,
        source_evidence_id=source_evidence_id,
    )


def rebuild_graph_for_case(db: Session, case_id: uuid.UUID) -> None:
    graph_repository.clear_for_case(db, case_id)

    evidence_items = evidence_repository.list_for_case(db, case_id)
    evidence_entities = {}
    for evidence in evidence_items:
        # Human description first ("Statement of Ramesh Kumar"), filename as a
        # fallback — a graph of filenames reads like a directory listing.
        name = (
            evidence.description
            or evidence.original_filename
            or f"{evidence.evidence_type.value} ({str(evidence.id)[:8]})"
        )
        entity = graph_repository.get_or_create_entity(db, case_id=case_id, entity_type=EntityType.EVIDENCE, name=name)
        evidence_entities[evidence.id] = entity

    # AI-extracted entities (person/location/device/document) -> MENTIONS edges from their source evidence.
    for event in timeline_repository.list_for_case(db, case_id):
        if not event.source_evidence_id or event.source_evidence_id not in evidence_entities:
            continue
        source_entity = evidence_entities[event.source_evidence_id]
        extracted = (event.extracted_entities or {}).get("entities", [])
        for raw_entity in extracted:
            entity_type = _EXTRACTED_TYPE_MAP.get(raw_entity.get("type"))
            name = raw_entity.get("name")
            if not entity_type or not name:
                continue
            target_entity = graph_repository.get_or_create_entity(db, case_id=case_id, entity_type=entity_type, name=name)
            graph_repository.create_relationship(
                db,
                _relationship(case_id, source_entity.id, target_entity.id, RelationType.MENTIONS, event.source_evidence_id),
            )

    # Digital Evidence Correlation: evidence sharing a rounded GPS cell gets a LOCATED_AT
    # edge to a shared Location entity, then a direct RELATED_TO edge between each other.
    cells: dict[tuple[float, float], list[uuid.UUID]] = {}
    for evidence in evidence_items:
        if evidence.gps_lat is None or evidence.gps_lng is None:
            continue
        key = (round(float(evidence.gps_lat), _GRID_PRECISION), round(float(evidence.gps_lng), _GRID_PRECISION))
        cells.setdefault(key, []).append(evidence.id)

    for (lat, lng), evidence_ids in cells.items():
        location_entity = graph_repository.get_or_create_entity(
            db, case_id=case_id, entity_type=EntityType.LOCATION, name=f"{lat}, {lng}"
        )
        for evidence_id in evidence_ids:
            graph_repository.create_relationship(
                db,
                _relationship(case_id, evidence_entities[evidence_id].id, location_entity.id, RelationType.LOCATED_AT, evidence_id),
            )
        for i, ev_a in enumerate(evidence_ids):
            for ev_b in evidence_ids[i + 1 :]:
                graph_repository.create_relationship(
                    db,
                    _relationship(case_id, evidence_entities[ev_a].id, evidence_entities[ev_b].id, RelationType.RELATED_TO, None),
                )
