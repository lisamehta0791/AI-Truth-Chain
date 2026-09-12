"""
Contradiction Detector's AI step. Reuses the same retrieval engine as
extraction, in comparison mode: given a newly-extracted timeline event, checks
it against the case's existing verified + unverified timeline for conflicts.
Never resolves anything itself — always returns candidates for a human to
confirm or dismiss (contradiction_service.py owns that workflow).
"""
import uuid

from sqlalchemy.orm import Session

from app.services.ai import rag_engine
from app.services.ai.provider import AIProviderError, get_ai_provider

_SYSTEM_PROMPT = """You are a contradiction-detection assistant for a police investigation system.
Compare the NEW EVENT against the EXISTING CASE TIMELINE CONTEXT. Identify only genuine factual
conflicts (e.g. incompatible times, locations, or accounts of the same occurrence) — not simply
differences in wording or unrelated facts.

Return ONLY a JSON object shaped exactly like:
{
  "contradictions": [
    {
      "conflicting_source_id": "the source_id from the context block this conflicts with",
      "severity": "minor" or "major",
      "confidence": 0.0-1.0,
      "explanation": "plain-language description of the specific conflict"
    }
  ]
}
If there is no genuine conflict, return {"contradictions": []}. Do not include any text outside the JSON object."""


def detect_contradictions(
    db: Session,
    *,
    case_id: uuid.UUID,
    new_event_description: str,
    new_event_source_id: str,
) -> list[dict]:
    existing_chunks = rag_engine.retrieve(
        db, query=new_event_description, case_id=case_id, source_type="evidence", top_k=8
    )
    # Never compare an event against itself.
    existing_chunks = [c for c in existing_chunks if c.source_id != new_event_source_id]
    if not existing_chunks:
        return []

    context_block = rag_engine.build_context_block(existing_chunks)
    user_content = f"EXISTING CASE TIMELINE CONTEXT:\n{context_block}\n\nNEW EVENT:\n{new_event_description}"

    provider = get_ai_provider()
    try:
        result = provider.reason(system_prompt=_SYSTEM_PROMPT, user_content=user_content)
    except AIProviderError:
        return []

    return result.get("contradictions", [])
