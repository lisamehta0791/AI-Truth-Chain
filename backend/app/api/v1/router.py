from fastapi import APIRouter

from app.api.v1 import (
    audit,
    autopsy,
    auth,
    case_similarity,
    cases,
    chargesheet,
    closure_score,
    contradictions,
    copilot,
    demo,
    evidence,
    graph,
    guidance,
    ledger,
    location,
    statements,
    sync,
    timeline,
    users,
    ws,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(cases.router)
api_router.include_router(evidence.router)
api_router.include_router(timeline.router)
api_router.include_router(contradictions.router)
api_router.include_router(guidance.router)
api_router.include_router(audit.router)
api_router.include_router(location.router)
api_router.include_router(autopsy.router)
api_router.include_router(chargesheet.router)
api_router.include_router(statements.router)
api_router.include_router(graph.router)
api_router.include_router(closure_score.router)
api_router.include_router(case_similarity.router)
api_router.include_router(sync.router)
api_router.include_router(demo.router)
api_router.include_router(copilot.router)
api_router.include_router(ledger.router)
api_router.include_router(ws.router)

# All planned routers are now wired. Phase 7 is polish/hardening, not new endpoints.
