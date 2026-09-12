"""
Chargesheet QA's AI step. Splits the officer-provided chargesheet draft into
individual factual claims and checks each against the case's verified/
unverified timeline via the same shared RAG engine, in comparison mode
(PDF §6). This is pre-filing QA for a human legal reviewer — it never
produces a legal judgment, only PASS/WARNING/CONFLICT/MISSING_SUPPORT labels.
"""
import uuid

from sqlalchemy.orm import Session

from app.services.ai import rag_engine
from app.services.ai.provider import AIProviderError, get_ai_provider

_SYSTEM_PROMPT = """You are a chargesheet pre-filing quality-assurance assistant for a police case
management system. Break the CHARGESHEET DRAFT into individual factual claims. For each claim,
check it against the EXISTING CASE TIMELINE CONTEXT and classify it as one of:
"pass" (clearly supported by the case timeline), "warning" (partially supported or supported only
by unverified AI-extracted events), "conflict" (contradicts the case timeline), or
"missing_support" (no supporting evidence found in the timeline context at all).
You are not a legal authority — you only check factual consistency with the case record, and this
is quality assurance for a human legal reviewer, not a legal determination.

Return ONLY a JSON object shaped exactly like:
{
  "checks": [
    {
      "claim_text": "the claim as stated or lightly paraphrased from the chargesheet draft",
      "status": "pass" | "warning" | "conflict" | "missing_support",
      "linked_source_ids": ["source_id values from the context block that support or conflict with this claim"]
    }
  ]
}
Do not include any text outside the JSON object."""


def run_chargesheet_qa(db: Session, *, case_id: uuid.UUID, chargesheet_text: str) -> list[dict]:
    timeline_chunks = rag_engine.retrieve(
        db, query=chargesheet_text[:800], case_id=case_id, source_type="evidence", top_k=10
    )
    context_block = rag_engine.build_context_block(timeline_chunks)
    user_content = f"EXISTING CASE TIMELINE CONTEXT:\n{context_block}\n\nCHARGESHEET DRAFT:\n{chargesheet_text}"

    provider = get_ai_provider()
    try:
        result = provider.reason(system_prompt=_SYSTEM_PROMPT, user_content=user_content)
    except AIProviderError:
        return []

    return result.get("checks", [])
