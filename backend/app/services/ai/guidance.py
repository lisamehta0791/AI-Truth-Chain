"""
Investigation Guidance Agent's AI step. Retrieves ONLY from the curated
legal_kb corpus (never the case's own evidence chunks, and never bare model
memory) so every suggestion traces back to a specific seeded section — see
PDF §3.4's requirement that this "avoid unreliable memorized law."
"""
import uuid

from sqlalchemy.orm import Session

from app.services.ai import rag_engine
from app.services.ai.provider import AIProviderError, get_ai_provider

_SYSTEM_PROMPT = """You are an investigation-guidance assistant for a police case-management system.
You suggest a single NEXT PROCEDURAL STEP based on the case situation described, grounded ONLY in the
provided legal/procedural reference material. You are NOT a legal authority — you never tell the officer
what the law requires with certainty, and you never suggest this replaces a prosecutor, legal officer, or
the investigator's own judgment.

Return ONLY a JSON object shaped exactly like:
{
  "suggestion": "one concrete, actionable next step, framed as a checklist item",
  "legal_reference": "the section_code from the reference material this is grounded in",
  "confidence": 0.0-1.0
}
If nothing in the reference material is clearly relevant, return
{"suggestion": null, "legal_reference": null, "confidence": 0.0}.
Do not include any text outside the JSON object."""


def generate_guidance_suggestion(
    db: Session,
    *,
    case_id: uuid.UUID,
    situation_text: str,
) -> dict | None:
    legal_chunks = rag_engine.retrieve(db, query=situation_text, case_id=None, source_type="legal_kb", top_k=4)
    if not legal_chunks:
        return None

    context_block = rag_engine.build_context_block(legal_chunks)
    user_content = f"LEGAL/PROCEDURAL REFERENCE MATERIAL:\n{context_block}\n\nCASE SITUATION:\n{situation_text}"

    provider = get_ai_provider()
    try:
        result = provider.reason(system_prompt=_SYSTEM_PROMPT, user_content=user_content)
    except AIProviderError:
        return None

    if not result.get("suggestion") or not result.get("legal_reference"):
        return None
    return result
