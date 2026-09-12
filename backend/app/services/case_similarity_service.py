"""
Case Similarity Search. Deterministic Jaccard-style overlap over each case's
evidence-graph entities and evidence-type mix — not an AI/embedding
similarity, so the method is fully inspectable. The build prompt is explicit
that similarity must be visibly distinguished from proof; `matched_factors`
always states the method and the exact shared items, so a match is never
presented as "these cases are connected," only "these cases share N named
entities/patterns."
"""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis import CaseSimilarityMatch
from app.models.case import Case
from app.models.evidence import Evidence
from app.models.graph import Entity
from app.repositories import similarity_repository


def _case_signature(db: Session, case_id: uuid.UUID) -> tuple[set[str], set[str]]:
    entity_names = {e.name.lower() for e in db.scalars(select(Entity).where(Entity.case_id == case_id))}
    evidence_types = {e.evidence_type.value for e in db.scalars(select(Evidence).where(Evidence.case_id == case_id))}
    return entity_names, evidence_types


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def compute_similarities_for_case(
    db: Session, case_id: uuid.UUID, min_score: float = 0.05
) -> list[CaseSimilarityMatch]:
    similarity_repository.clear_for_case(db, case_id)

    this_entities, this_types = _case_signature(db, case_id)
    other_cases = list(db.scalars(select(Case).where(Case.id != case_id)))

    created: list[CaseSimilarityMatch] = []
    for other_case in other_cases:
        other_entities, other_types = _case_signature(db, other_case.id)
        entity_overlap = _jaccard(this_entities, other_entities)
        type_overlap = _jaccard(this_types, other_types)
        score = round(0.7 * entity_overlap + 0.3 * type_overlap, 3)
        if score < min_score:
            continue

        match = CaseSimilarityMatch(
            case_id=case_id,
            matched_case_id=other_case.id,
            similarity_score=score,
            matched_factors={
                "shared_entities": sorted(this_entities & other_entities),
                "shared_evidence_types": sorted(this_types & other_types),
                "method": (
                    "deterministic Jaccard overlap of named entities (70%) and evidence-type "
                    "mix (30%) — similarity, not proof of connection"
                ),
            },
        )
        created.append(similarity_repository.create(db, match))

    return created


# ---------------------------------------------------------------------------
# Side-by-side comparison of two cases — "has this happened before?"
# ---------------------------------------------------------------------------
import math  # noqa: E402
import re  # noqa: E402

from app.models.timeline import TimelineEvent  # noqa: E402

# A fixed, visible vocabulary of modus-operandi signals. The comparison
# reports which of these appear in BOTH files, so a reviewer can see exactly
# why two cases are called alike — no learned model, no hidden weights.
MO_VOCABULARY: dict[str, list[str]] = {
    "knife": ["knife", "blade", "stab"],
    "thigh wound": ["thigh", "femoral"],
    "forced rear door": ["rear service door", "back door", "forced", "tool mark", "pry"],
    "hotel or lodge": ["hotel", "lodge", "inn", "room "],
    "dark jacket": ["dark jacket", "hooded", "dark hooded"],
    "backpack": ["backpack"],
    "grey hatchback": ["hatchback", "grey car", "tn 09"],
    "argument over money": ["argument", "argued", "money", "owed"],
    "night": ["night", "21:", "22:", "23:"],
    "alcohol": ["whisky", "alcohol", "drinking"],
    "no defensive injuries": ["no defensive injuries", "defensive injur"],
}


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _profile(db: Session, case: Case) -> dict:
    evidence = list(db.scalars(select(Evidence).where(Evidence.case_id == case.id).order_by(Evidence.uploaded_at)))
    entities = list(db.scalars(select(Entity).where(Entity.case_id == case.id)))
    events = list(db.scalars(select(TimelineEvent).where(TimelineEvent.case_id == case.id).order_by(TimelineEvent.event_time)))
    text = " ".join((e.extracted_text or "") + " " + (e.description or "") for e in evidence).lower()
    signals = {k for k, words in MO_VOCABULARY.items() if any(w in text for w in words)}
    plates = sorted(set(re.findall(r"\b[A-Z]{2}\s?\d{2}\s?[A-Z]{1,2}\s?\d{4}\b", text.upper())))
    stated = [e.captured_at for e in evidence if e.captured_at is not None]
    return {
        "case": case,
        "evidence": evidence,
        "entities": entities,
        "events": events,
        "signals": signals,
        "plates": plates,
        "first_seen": min(stated) if stated else None,
        "last_seen": max(stated) if stated else None,
    }


def compare_cases(db: Session, case_id: uuid.UUID, other_id: uuid.UUID) -> dict:
    a_case = db.get(Case, case_id)
    b_case = db.get(Case, other_id)
    if a_case is None or b_case is None:
        raise ValueError("Both cases must exist.")
    a, b = _profile(db, a_case), _profile(db, b_case)

    a_names = {e.name.lower(): e for e in a["entities"]}
    b_names = {e.name.lower(): e for e in b["entities"]}
    shared_entities = [
        {"name": a_names[n].name, "type": a_names[n].entity_type.value, "type_in_other": b_names[n].entity_type.value}
        for n in sorted(set(a_names) & set(b_names))
    ]
    a_types = {e.evidence_type.value for e in a["evidence"]}
    b_types = {e.evidence_type.value for e in b["evidence"]}

    pairs: list[dict] = []
    for ea in a["evidence"]:
        if ea.gps_lat is None:
            continue
        for eb in b["evidence"]:
            if eb.gps_lat is None:
                continue
            d = _haversine_m((float(ea.gps_lat), float(ea.gps_lng)), (float(eb.gps_lat), float(eb.gps_lng)))
            if d <= 600:
                pairs.append({"a": ea.description or ea.original_filename, "b": eb.description or eb.original_filename, "distance_m": round(d), "lat": float(ea.gps_lat), "lng": float(ea.gps_lng)})
    best: dict[str, dict] = {}
    for sp in pairs:  # closest pair per A-item
        if sp["a"] not in best or sp["distance_m"] < best[sp["a"]]["distance_m"]:
            best[sp["a"]] = sp
    shared_places = list(best.values())

    shared_signals = sorted(a["signals"] & b["signals"])
    shared_plates = sorted(set(a["plates"]) & set(b["plates"]))
    entity_overlap = _jaccard(set(a_names), set(b_names))
    type_overlap = _jaccard(a_types, b_types)
    signal_overlap = _jaccard(a["signals"], b["signals"])
    score = round(0.45 * entity_overlap + 0.15 * type_overlap + 0.4 * signal_overlap, 3)

    gap_days = None
    if a["first_seen"] and b["first_seen"]:
        gap_days = abs((a["first_seen"] - b["first_seen"]).days)

    def summary(p: dict) -> dict:
        c: Case = p["case"]
        people = [e.name for e in p["entities"] if e.entity_type.value in ("suspect", "person", "witness")][:8]
        places = [e.name for e in p["entities"] if e.entity_type.value == "location"][:6]
        return {
            "id": str(c.id),
            "case_number": c.case_number,
            "title": c.title,
            "status": c.status.value,
            "opened_at": c.created_at.isoformat() if c.created_at else None,
            "evidence_count": len(p["evidence"]),
            "evidence_types": sorted({e.evidence_type.value for e in p["evidence"]}),
            "event_count": len(p["events"]),
            "first_seen": p["first_seen"].isoformat() if p["first_seen"] else None,
            "last_seen": p["last_seen"].isoformat() if p["last_seen"] else None,
            "people": people,
            "places": places,
            "signals": sorted(p["signals"]),
            "plates": p["plates"],
            "key_events": [
                {"time": ev.event_time.isoformat(), "description": ev.description, "status": ev.verification_status.value}
                for ev in p["events"][:6]
            ],
        }

    if score >= 0.35 or (len(shared_signals) >= 4 and (shared_entities or shared_plates)):
        verdict = "strong pattern match — treat as a lead, not proof"
    elif score >= 0.15 or len(shared_signals) >= 3:
        verdict = "partial overlap — worth a look"
    else:
        verdict = "little in common"
    return {
        "a": summary(a),
        "b": summary(b),
        "score": score,
        "verdict": verdict,
        "shared_entities": shared_entities,
        "shared_places": shared_places,
        "shared_signals": shared_signals,
        "shared_plates": shared_plates,
        "shared_evidence_types": sorted(a_types & b_types),
        "gap_days": gap_days,
        "method": (
            "deterministic: 45% named-entity overlap, 15% evidence-type mix, 40% modus-operandi signal overlap "
            "(fixed vocabulary, listed) — similarity is a lead, never proof of connection"
        ),
    }
