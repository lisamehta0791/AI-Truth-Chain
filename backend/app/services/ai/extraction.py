"""
AI Timeline Builder's extraction step. Every entity/event this produces is
returned with a source excerpt and a confidence score, and is written to the
database as AI_EXTRACTED_UNVERIFIED — never VERIFIED — per PDF §2/§3.2. This
module never sets a human-decision status; only timeline_service (on an
explicit officer confirm action) can do that.
"""
import uuid

from sqlalchemy.orm import Session

from app.services.ai import rag_engine
from app.services.ai.provider import AIProviderError, get_ai_provider

_SYSTEM_PROMPT = """You are an evidence-extraction assistant for a police investigation system.
You extract FACTS explicitly stated in the provided evidence text. You do not infer guilt,
speculate, or add information not present in the text.

Given the evidence text and prior case context (if any), return ONLY a JSON object shaped exactly like:
{
  "events": [
    {
      "description": "short factual description of what happened",
      "event_time": "ISO-8601 timestamp ONLY if the text (or prior case context) gives BOTH a date and a time; a bare clock time such as '8:30 PM' with no date must be null — never invent a date, never use today's date",
      "event_type": "one short snake_case label, e.g. witness_observation, movement, communication",
      "source_excerpt": "the exact quoted span from the evidence text this event is based on",
      "confidence": 0.0-1.0
    }
  ],
  "entities": [
    {"type": "person|location|device|document", "name": "string", "attributes": {}}
  ]
}
If the text contains no extractable factual events, return {"events": [], "entities": []}.
Do not include any text outside the JSON object."""


def extract_from_evidence_text(
    db: Session,
    *,
    case_id: uuid.UUID,
    evidence_id: uuid.UUID,
    text: str,
) -> dict:
    """
    Returns the raw structured extraction dict (events + entities). The caller
    (evidence_service) is responsible for persisting TimelineEvent rows and
    triggering the contradiction check — this function only calls the model
    and grounds it in retrieved prior-case context.
    """
    prior_chunks = rag_engine.retrieve(db, query=text[:500], case_id=case_id, source_type="evidence", top_k=5)
    context_block = rag_engine.build_context_block(prior_chunks)

    user_content = (
        f"PRIOR CASE CONTEXT:\n{context_block}\n\n"
        f"NEW EVIDENCE TEXT (evidence_id={evidence_id}):\n{text}"
    )

    provider = get_ai_provider()
    try:
        result = provider.extract(system_prompt=_SYSTEM_PROMPT, user_content=user_content)
    except AIProviderError:
        return {"events": [], "entities": [], "ai_error": True}

    result.setdefault("events", [])
    result.setdefault("entities", [])
    return result
