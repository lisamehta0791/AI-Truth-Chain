"""
Investigation Copilot — question answering over ONE case's evidence.

Retrieval-grounded: the model only sees chunks that were actually logged to
this case (plus the current timeline, open contradictions and findings), and
is instructed to answer from those, cite which evidence each claim rests on,
and say plainly when the file does not contain an answer. It never sees other
cases and never speculates about guilt.

Every answer carries `citations` (evidence ids) so the UI can link each claim
back to the exact record, and `confidence` so the officer can weigh it.
"""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.contradiction import Contradiction
from app.models.analysis import AutopsyFinding
from app.models.evidence import Evidence
from app.models.timeline import TimelineEvent, VerificationStatus
from app.services.ai import rag_engine
from app.services.ai.provider import AIProviderError, get_ai_provider

_SYSTEM_PROMPT = """You are the Investigation Copilot inside a police evidence-integrity system.
You answer an officer's question using ONLY the case material provided: retrieved evidence excerpts,
the case timeline, open contradictions and post-mortem findings.

Rules you must follow:
- Answer from the material. If it does not contain the answer, say so explicitly and suggest what
  evidence would resolve it. Never invent facts, dates, names or times.
- Never assert guilt or innocence. Describe what the evidence shows and what it leaves open.
- Distinguish AI-extracted, unverified items from human-confirmed ones when it matters.
- Cite evidence: every factual claim must reference the evidence_id(s) it comes from.
- Be concise: short paragraphs or a short list. Plain language an officer can read aloud.

Return ONLY a JSON object shaped exactly like:
{
  "answer": "the answer, in plain text (markdown lists allowed)",
  "citations": ["evidence_id", "..."],
  "confidence": 0.0-1.0,
  "gaps": ["what the file does not establish, if anything"]
}
Do not include any text outside the JSON object."""

SUGGESTED_QUESTIONS = [
    "What is the timeline of the suspect's movements?",
    "Which statements conflict with the CCTV?",
    "What does the post-mortem say about the time of death?",
    "Which evidence places the suspect at the hotel?",
    "What has not been verified by an officer yet?",
    "What evidence is still missing from this case?",
]


def _case_context(db: Session, case_id: uuid.UUID) -> str:
    lines: list[str] = []
    evidence = db.query(Evidence).filter_by(case_id=case_id).order_by(Evidence.uploaded_at).all()
    lines.append("EVIDENCE ITEMS:")
    for e in evidence:
        lines.append(f"- evidence_id={e.id} | {e.evidence_type.value} | {e.description or e.original_filename} | status={e.status.value}")

    events = db.query(TimelineEvent).filter_by(case_id=case_id).order_by(TimelineEvent.event_time).all()
    lines.append("\nTIMELINE (chronological):")
    for t in events[:60]:
        stated = (t.extracted_entities or {}).get("time_stated", True)
        when = t.event_time.isoformat() if stated else "time not stated in source"
        verified = "HUMAN-CONFIRMED" if t.verification_status == VerificationStatus.HUMAN_CONFIRMED else "AI-extracted, unverified"
        lines.append(f"- [{when}] {t.description} (source evidence_id={t.source_evidence_id}; {verified})")

    contradictions = db.query(Contradiction).filter_by(case_id=case_id).all()
    if contradictions:
        lines.append("\nCONTRADICTIONS:")
        for c in contradictions:
            lines.append(f"- [{c.severity.value}, {c.status.value}] {c.explanation} (evidence_ids {c.evidence_a_id}, {c.evidence_b_id})")

    findings = db.query(AutopsyFinding).filter_by(case_id=case_id).all()
    if findings:
        lines.append("\nPOST-MORTEM CROSS-CHECK FINDINGS (AI hypotheses unless confirmed):")
        for f in findings:
            lines.append(f"- [{f.finding_type} @ {f.body_region or 'unspecified'}, {f.status.value}] {f.ai_hypothesis} (evidence_id={f.source_evidence_id})")
    return "\n".join(lines)


def ask(db: Session, *, case_id: uuid.UUID, question: str) -> dict:
    chunks = rag_engine.retrieve(db, query=question, case_id=case_id, source_type="evidence", top_k=8)
    excerpts = rag_engine.build_context_block(chunks)
    user_content = (
        f"RETRIEVED EVIDENCE EXCERPTS (most relevant first):\n{excerpts}\n\n"
        f"CASE CONTEXT:\n{_case_context(db, case_id)}\n\n"
        f"OFFICER'S QUESTION:\n{question}"
    )
    try:
        result = get_ai_provider().reason(system_prompt=_SYSTEM_PROMPT, user_content=user_content)
    except AIProviderError as exc:
        return {
            "answer": (
                "The AI provider is not available, so I cannot read the case file right now. "
                f"({exc})"
            ),
            "citations": [],
            "confidence": 0.0,
            "gaps": [],
            "ai_unavailable": True,
        }

    # Only keep citations that are real evidence ids in this case.
    valid = {str(e.id) for e in db.query(Evidence.id).filter_by(case_id=case_id).all()}
    cites = [c for c in result.get("citations", []) if isinstance(c, str) and c in valid]
    return {
        "answer": str(result.get("answer", "")).strip() or "The case file does not contain enough to answer that.",
        "citations": cites,
        "confidence": float(result.get("confidence", 0.5) or 0.0),
        "gaps": [str(g) for g in result.get("gaps", []) if g],
        "ai_unavailable": False,
    }
