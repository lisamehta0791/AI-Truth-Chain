"""
Tamper-evident hashing. This entire module is deterministic cryptography with
NO AI/LLM calls anywhere in it — kept in its own file/service specifically so
it is obvious in both code and API docs that hashing is "Cryptographic
hashing (NOT AI)" per the spec's own table (PDF §6).
"""
import hashlib


def compute_sha256(data: bytes) -> str:
    """Hash of the raw evidence file bytes."""
    return hashlib.sha256(data).hexdigest()


def compute_chain_link_hash(current_file_hash: str, previous_hash: str | None) -> str:
    """
    The "chain" hash actually stored as previous_hash pointer semantics: each
    evidence record stores its own file hash (current_file_hash) AND a
    pointer to the previous record's file hash (previous_hash), so tampering
    with any earlier record breaks verification for every record after it.
    This helper additionally returns a combined link hash used only for the
    integrity-check routine below — the stored `previous_hash` column always
    holds the *previous record's own file hash*, not this combined value.
    """
    combined = f"{previous_hash or ''}{current_file_hash}".encode("utf-8")
    return hashlib.sha256(combined).hexdigest()


def verify_chain(ordered_hash_pairs: list[tuple[str, str | None]]) -> tuple[bool, int | None]:
    """
    Verifies a case's evidence chain, oldest first. Each tuple is
    (sha256_hash, previous_hash) for one evidence record.
    Returns (is_valid, index_of_first_break_or_None).
    """
    expected_previous: str | None = None
    for index, (current_hash, stored_previous_hash) in enumerate(ordered_hash_pairs):
        if stored_previous_hash != expected_previous:
            return False, index
        expected_previous = current_hash
    return True, None
