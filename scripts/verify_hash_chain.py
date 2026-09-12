"""
Verifies the SHA-256 hash chain for a case's evidence — the same check the
GET /api/v1/evidence/case/{id}/chain-integrity endpoint performs, exposed as a
standalone script so it can be run independently of the API (e.g. by a court
technical expert reviewing the raw database) without trusting the running
application server.

Usage (from the project root, backend venv active):
    python scripts/verify_hash_chain.py <case_id>
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.db.session import SessionLocal  # noqa: E402
from app.repositories import evidence_repository  # noqa: E402
from app.services import hash_chain_service  # noqa: E402


def main(case_id_str: str) -> None:
    case_id = uuid.UUID(case_id_str)
    db = SessionLocal()
    try:
        items = evidence_repository.list_for_case(db, case_id)
        if not items:
            print(f"No evidence found for case {case_id}.")
            return

        pairs = [(item.sha256_hash, item.previous_hash) for item in items]
        is_valid, broken_index = hash_chain_service.verify_chain(pairs)

        print(f"Case {case_id}: {len(items)} evidence item(s) in chain.\n")
        for i, item in enumerate(items):
            marker = "  " if is_valid or broken_index != i else ">>"
            print(
                f"{marker} [{i}] {item.evidence_type.value:<16} "
                f"hash={item.sha256_hash[:12]}… prev={str(item.previous_hash)[:12] if item.previous_hash else 'None':<12} "
                f"uploaded_at={item.uploaded_at}"
            )

        print()
        if is_valid:
            print("RESULT: Chain is INTACT. No tampering detected.")
        else:
            print(f"RESULT: Chain is BROKEN at index {broken_index}. Investigate immediately.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/verify_hash_chain.py <case_id>")
        sys.exit(1)
    main(sys.argv[1])
