"""
Seeds `legal_knowledge_base` with a small curated set of procedural
checklist items and embeds each into the shared `rag_chunks` table
(source_type="legal_kb", case_id=None) so the Investigation Guidance Agent
can retrieve them (PDF §3.4).

IMPORTANT — these entries are ILLUSTRATIVE PLACEHOLDER CONTENT for the
hackathon demo, written in our own words to describe generic, well-known
investigative best practices. They are NOT verified legal citations. A real
deployment must replace this file's content with a corpus reviewed by a
qualified legal professional before any suggestion is treated as reliable —
the Guidance Agent is a checklist assistant, never a legal authority
(build prompt, "INVESTIGATION GUIDANCE" section).

Run from the project root, backend venv active:
    python scripts/seed_legal_kb.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.db.session import SessionLocal  # noqa: E402
from app.models.contradiction import LegalKnowledgeBaseEntry  # noqa: E402
from app.services.ai import rag_engine  # noqa: E402

# section_code values are illustrative placeholders only — see module docstring.
ENTRIES = [
    dict(
        section_code="BNSS Section 105 (illustrative)",
        title="Seizure memo requirements",
        text=(
            "When property or an item is seized during an investigation, prepare a seizure memo at the "
            "time of seizure, listing each item individually with distinguishing marks, and have it signed "
            "by at least two independent witnesses present at the scene. Provide a copy of the memo to the "
            "person from whom the item was seized, where applicable."
        ),
    ),
    dict(
        section_code="BNSS Section 180 (illustrative)",
        title="Recording witness statements",
        text=(
            "Record a witness's statement as close to their own words as practicable, noting the exact date, "
            "time, and location of recording. If a witness's account changes in a later statement, note the "
            "discrepancy explicitly in the case file rather than silently updating the earlier record."
        ),
    ),
    dict(
        section_code="BNSS Section 51 (illustrative)",
        title="Medical examination of an arrested person",
        text=(
            "When a person is arrested, arrange a medical examination without unreasonable delay, and record "
            "any injuries noted at the time of arrest. This protects both the arrested person and the "
            "investigating officer by creating a contemporaneous record independent of later claims."
        ),
    ),
    dict(
        section_code="BNSS Section 106 (illustrative)",
        title="Forwarding seized property to the magistrate",
        text=(
            "Seized property that is not required for immediate investigative use should be forwarded to the "
            "jurisdictional magistrate promptly, with an accompanying report describing the circumstances of "
            "seizure and its relevance to the case."
        ),
    ),
    dict(
        section_code="BNSS Section 172 (illustrative)",
        title="Maintaining the case diary",
        text=(
            "Maintain a case diary recording the day-to-day progress of the investigation, including places "
            "visited, persons examined, and reasoning for investigative decisions. A well-maintained diary "
            "supports the credibility of the investigation if the timeline or decisions are later questioned."
        ),
    ),
    dict(
        section_code="BSA Section 63 (illustrative)",
        title="Handling electronic/digital evidence",
        text=(
            "When collecting electronic evidence (device data, CCTV footage, phone records), preserve the "
            "original media where possible, generate a hash of the digital copy at the time of collection, "
            "and record the collecting device and software used, so the evidence's integrity can be verified "
            "later."
        ),
    ),
]


def run() -> None:
    db = SessionLocal()
    try:
        created = 0
        for entry_data in ENTRIES:
            existing = (
                db.query(LegalKnowledgeBaseEntry)
                .filter_by(section_code=entry_data["section_code"])
                .first()
            )
            if existing:
                continue

            entry = LegalKnowledgeBaseEntry(**entry_data)
            db.add(entry)
            db.flush()

            rag_engine.ingest_text(
                db,
                source_type="legal_kb",
                source_id=entry.section_code,
                case_id=None,
                text=f"{entry.title}. {entry.text}",
            )
            created += 1
            print(f"Seeded + embedded: {entry.section_code} — {entry.title}")

        db.commit()
        print(f"\nDone. {created} new legal knowledge base entries seeded and embedded.")
        print("Reminder: this content is illustrative placeholder text, not verified legal citations.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
