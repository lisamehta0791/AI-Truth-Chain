"""
Seeds the demo cast and the demo case.

The cast deliberately spans the whole rank ladder so the rank-based access
rules are demonstrable live: a Constable who must supply a live capture to log
evidence, an Inspector who can confirm AI findings, an SP who can provision
accounts, a Commissioner who sees everything, and a view-only prosecutor who
can read the case but cannot alter a single record.

Run from the project root with the backend venv active:

    python scripts/seed_demo_case.py               # officers + the empty demo case
    python scripts/seed_demo_case.py --scenario    # ...and load every stage of the Riverside
                                                   # scenario through the real AI pipeline
                                                   # (~8 minutes; needs the AI key in backend/.env)

All data below is fictional. No real people, cases, or victims.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.case import Case, CaseMember  # noqa: E402
from app.models.user import PoliceRank, User, UserRole  # noqa: E402
import app.models  # noqa: E402,F401  — ensure all tables are registered on Base.metadata

DEMO_PASSWORD = "DemoPass!2026"  # local/demo only — never used outside seeded dev data
DOMAIN = "demo.chainoftruth.example"  # RFC 2606 reserved — can never be a real address

# Ordered junior -> senior so the printed output reads like a chain of command.
DEMO_USERS = [
    dict(
        full_name="Constable Arjun Pillai",
        badge_number="PC-7781",
        email=f"arjun.pillai@{DOMAIN}",
        role=UserRole.INVESTIGATING_OFFICER,
        rank=PoliceRank.CONSTABLE,
        station="Riverside Police Station",
        note="Field rank — must supply a live capture when logging evidence.",
    ),
    dict(
        full_name="Sub-Inspector Ananya Rao",
        badge_number="SI-1042",
        email=f"ananya.rao@{DOMAIN}",
        role=UserRole.INVESTIGATING_OFFICER,
        rank=PoliceRank.SUB_INSPECTOR,
        station="Riverside Police Station",
        note="Can confirm/dismiss AI findings.",
    ),
    dict(
        full_name="Inspector Lisa Mathew",
        badge_number="INSP-3310",
        email=f"lisa.mathew@{DOMAIN}",
        role=UserRole.INVESTIGATING_OFFICER,
        rank=PoliceRank.INSPECTOR,
        station="Riverside Police Station",
        note="Investigating officer of record; can read the audit log.",
    ),
    dict(
        full_name="Dr. Meera Iyer",
        badge_number="FR-3390",
        email=f"meera.iyer@{DOMAIN}",
        role=UserRole.FORENSIC_REVIEWER,
        rank=PoliceRank.DEPUTY_SUPERINTENDENT,
        station="State Forensic Science Laboratory",
        note="Reviews autopsy/forensic AI hypotheses.",
    ),
    dict(
        full_name="Superintendent Vikram Nair",
        badge_number="SP-2201",
        email=f"vikram.nair@{DOMAIN}",
        role=UserRole.SUPERVISOR,
        rank=PoliceRank.SUPERINTENDENT,
        station="District Police Headquarters",
        note="Can provision accounts below SP and view every case.",
    ),
    dict(
        full_name="Commissioner Rajesh Menon",
        badge_number="CP-1001",
        email=f"rajesh.menon@{DOMAIN}",
        role=UserRole.SUPERVISOR,
        rank=PoliceRank.COMMISSIONER,
        station="City Police Commissionerate",
        note="Full visibility; can provision any rank below Commissioner.",
    ),
    dict(
        full_name="Adv. Sameer Kulkarni (Public Prosecutor)",
        badge_number="LR-5502",
        email=f"sameer.kulkarni@{DOMAIN}",
        role=UserRole.LEGAL_REVIEWER,
        rank=PoliceRank.SUPERINTENDENT,
        station="Office of the Public Prosecutor",
        is_view_only=True,
        note="VIEW-ONLY: reads the full case record, cannot modify anything.",
    ),
]

DEMO_CASE = dict(
    case_number="COT-2026-0001",
    title="Riverside Hotel — Suspicious Death (Demo)",
    description=(
        "Fictional demonstration case seeded for the Chain of Truth build. A guest was found "
        "deceased at a riverside hotel; CCTV, a witness statement, call detail records and a "
        "post-mortem report disagree about when the suspect left the premises. No real persons, "
        "victims, or evidence are represented."
    ),
)


def run() -> None:
    db = SessionLocal()
    try:
        created: dict[str, User] = {}
        # Matched on badge_number, not email: badge_number is the stable
        # identity and is UNIQUE, so matching on email meant that editing a
        # demo email here made re-seeding fail on a badge_number collision
        # instead of updating the existing row.
        for spec in DEMO_USERS:
            existing = db.query(User).filter_by(badge_number=spec["badge_number"]).first()
            if existing:
                user = existing
                verb = "Updated"
            else:
                user = User(badge_number=spec["badge_number"])
                db.add(user)
                verb = "Created"

            user.full_name = spec["full_name"]
            user.email = spec["email"]
            user.role = spec["role"]
            user.rank = spec["rank"]
            user.station = spec["station"]
            user.is_view_only = spec.get("is_view_only", False)
            user.hashed_password = hash_password(DEMO_PASSWORD)
            user.is_active = True
            db.flush()
            created[spec["badge_number"]] = user
            print(f"  {verb:<8} {user.rank_abbreviation:<4} {user.full_name}")

        # Record who provisioned whom, so the Personnel page shows a real
        # chain of command rather than a flat list of orphan accounts.
        commissioner = created["CP-1001"]
        sp = created["SP-2201"]
        for badge, creator in [
            ("SP-2201", commissioner),
            ("INSP-3310", sp),
            ("FR-3390", sp),
            ("LR-5502", commissioner),
            ("SI-1042", created["INSP-3310"]),
            ("PC-7781", created["INSP-3310"]),
        ]:
            created[badge].created_by_id = creator.id

        case = db.query(Case).filter_by(case_number=DEMO_CASE["case_number"]).first()
        if not case:
            case = Case(**DEMO_CASE, created_by=created["INSP-3310"].id)
            db.add(case)
            db.flush()
            print(f"\n  Created case {case.case_number} — {case.title}")
        else:
            case.title = DEMO_CASE["title"]
            case.description = DEMO_CASE["description"]
            print(f"\n  Updated case {case.case_number}")

        existing_members = {m.user_id for m in db.query(CaseMember).filter_by(case_id=case.id)}
        for user in created.values():
            if user.id not in existing_members:
                db.add(CaseMember(case_id=case.id, user_id=user.id))

        db.commit()

        print("\n" + "=" * 68)
        print("Seed complete. All demo accounts share password:", DEMO_PASSWORD)
        print("=" * 68)
        for spec in DEMO_USERS:
            print(f"  {spec['email']:<44} {spec['note']}")
    finally:
        db.close()


def load_scenario() -> None:
    """Load every stage of the Riverside scenario (and the related cases) through the real pipeline."""
    import asyncio
    import time

    from app.demo import scenario_service  # noqa: E402

    async def go() -> None:
        db = SessionLocal()
        try:
            case = db.query(Case).filter_by(case_number=DEMO_CASE["case_number"]).first()
            assert case is not None
            status = scenario_service.describe(db, case.id)
            print(f"\nScenario: {status['loaded_count']}/{status['total']} stages already loaded")
            while not status["complete"]:
                t0 = time.time()
                result = await scenario_service.load_next_stage(db, case)
                status = result
                print(f"  stage {result['loaded_count']:>2}/{result['total']}  {result['title']:<38} {time.time() - t0:5.0f}s")
            print("Scenario complete — every page has data.")
        finally:
            db.close()

    asyncio.run(go())


if __name__ == "__main__":
    run()
    if "--scenario" in sys.argv:
        load_scenario()
