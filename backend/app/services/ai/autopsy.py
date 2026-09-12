"""
Autopsy/Post-Mortem Cross-Check's AI step. Compares the autopsy report text
against the case's existing timeline (time-of-death consistency, injury vs.
reported mechanism) using the same shared RAG engine as extraction/
contradiction detection. Every output is a hypothesis, never a diagnosis or
conclusion — the mandatory review-disclaimer is appended server-side in
autopsy_service.py, not left to the model to remember to include.
"""
import uuid

from sqlalchemy.orm import Session

from app.services.ai import rag_engine
from app.services.ai.provider import AIProviderError, get_ai_provider

_SYSTEM_PROMPT = """You are a forensic cross-check assistant for a police investigation system.
Compare the AUTOPSY REPORT TEXT against the EXISTING CASE TIMELINE CONTEXT for consistency —
for example, whether a stated time of death aligns with witness-reported last-seen times, or
whether a described injury is consistent with a weapon/mechanism mentioned elsewhere in the case.
You identify hypotheses for a forensic medical officer to review — you never state a cause of
death or any medical conclusion with certainty.

Return ONLY a JSON object shaped exactly like:
{
  "findings": [
    {
      "finding_type": "one short snake_case label, e.g. time_of_death_alignment, weapon_injury_consistency",
      "body_region": "short label if applicable, else null",
      "ai_hypothesis": "plain-language hypothesis describing the consistency or inconsistency observed",
      "confidence": 0.0-1.0
    }
  ]
}
If there is nothing meaningfully cross-checkable, return {"findings": []}. Do not include any text
outside the JSON object."""


def cross_check_autopsy_text(db: Session, *, case_id: uuid.UUID, autopsy_text: str) -> list[dict]:
    timeline_chunks = rag_engine.retrieve(
        db, query=autopsy_text[:500], case_id=case_id, source_type="evidence", top_k=8
    )
    context_block = rag_engine.build_context_block(timeline_chunks)
    user_content = f"EXISTING CASE TIMELINE CONTEXT:\n{context_block}\n\nAUTOPSY REPORT TEXT:\n{autopsy_text}"

    provider = get_ai_provider()
    try:
        result = provider.reason(system_prompt=_SYSTEM_PROMPT, user_content=user_content)
    except AIProviderError:
        return []

    return result.get("findings", [])
