# Chain of Truth

AI-Assisted Evidence Integrity & Investigation System for Police and Judiciary.

> **AI assists investigators — it does not determine guilt. All conclusions require human verification.**

All 7 build phases are complete. This README is the single, complete setup guide — run every step in
order the first time.

## Run everything (one command)

After the one-time setup below (Docker Desktop, `backend/.venv`, `frontend/node_modules`, `.env`),
start the whole stack from **this** checkout with:

```powershell
.\scripts\dev.ps1              # Postgres + MinIO, migrations, seed, backend :8000, frontend :5173
.\scripts\dev.ps1 -Scenario    # ...and load every stage of the demo scenario (~8 min, needs the AI key)
```

The script first **stops anything stale on ports 8000 and 5173** — if a backend started from an older
copy of the code is still running, that is the reason a page looks empty or a feature "isn't there".
Then open <http://localhost:5173> and sign in with a demo account (`DemoPass!2026`).

## What's built
- Tamper-evident evidence logging (SHA-256 hash chain, two-person confirmation, device metadata lock)
- **Live-capture proof of presence** — field ranks must photograph themselves with the device camera
  at the point of collection; the capture is hashed alongside the evidence
- AI Timeline Builder + Contradiction Detector, with human confirm/dismiss workflow
- Investigation Guidance Agent (grounded only in a curated legal knowledge base)
- Predictive Location on a real-world map, Autopsy Cross-Check (anatomical viewer with bones / organs /
  combined layers, severity markers, callouts and an AI mapping sequence), Chargesheet QA
- Statement Reliability, interactive Evidence Graph + Digital Evidence Correlation,
  Case Closure Readiness, Case Similarity Search with side-by-side **case comparison** ("has this
  happened before?"), Offline-First sync architecture
- **Rank- and role-based access control** with top-down account provisioning (see below)
- Full audit trail, live WebSocket updates
- Public landing page, responsive layout, keyboard-accessible focus states, reduced-motion support

## The demonstration scenario

The seeded case **COT-2026-0001 — Riverside Hotel** ships with a ten-stage scenario
(`backend/app/demo/riverside.py`): scene report → CCTV → witness statement → call records → forensics
and a seized weapon → post-mortem → vehicle movements → a follow-up interview (the witness changes his
timing; Statement Reliability shows the diff) → pre-filing review (draft chargesheet checked claim by
claim, closure readiness scored, a field tablet's offline queue synced) → **pattern search** (three
earlier cases with the same signature — a hotel guest, a knife, a forced rear service door, a grey
hatchback — are loaded as their own files so Case Similarity can compare them side by side: shared
names, places, vehicles and modus operandi, with a verdict that is explicitly a lead, never proof).
Along the way the scenario also scores the location surface, writes a custody trail (exhibits to the
FSL and back, a Superintendent's review) and anchors the hash chain. Every stage is ingested through the **real**
pipeline — hashed, chained, stored in MinIO, read by the AI, checked for contradictions. Nothing is
pre-computed.

On **every** case page, officers of Deputy Superintendent rank or above see a **Demo strip** with
*Load full demo*, *Next stage* and *Reset*; lower ranks see the progress only. Present it a
stage at a time: the receptionist's 21:15 sighting arrives in stage 3 and is flagged against the
20:47 CCTV exit from stage 2, live, in front of the audience. Each stage takes 20–60 s because the
model is genuinely reasoning over the evidence.

The same engine is exposed as an API (`/api/v1/demo/scenario`, `/next`, `/all`, `/reset`) and the
illustrations attached to demo evidence (CCTV stills, scanned reports, the seized knife) are generated
synthetically by `backend/app/demo/images.py` and stamped **DEMO — SYNTHETIC** so they can never be
mistaken for exhibits.

## Investigation Copilot

The Command Center carries a chat panel that answers questions about the open case. It is grounded:
the model only sees evidence chunks retrieved from **this** case plus the current timeline,
contradictions and post-mortem findings; every claim carries the evidence it rests on; and it is
instructed to say when the file does not contain an answer rather than guess. Every question is
written to the audit trail. Endpoint: `POST /api/v1/copilot/ask`.

## Hash Ledger — and the "someone could just edit the database" objection

`/ledger` shows the chain as blocks and verifies it two ways: every evidence **file** is re-downloaded
and re-hashed against the hash recorded at collection, and every **link** (`previous_hash`) is walked.
That catches an altered file, an edited hash, and a deleted/inserted/reordered record.

What a hash chain cannot catch on its own is an administrator rewriting *every* hash consistently.
That is what **anchoring** is for: a Deputy Superintendent or above records the chain digest
(`POST /api/v1/ledger/anchor`) and exports a signed checkpoint (`GET /api/v1/ledger/checkpoint`) to be
kept outside the system — case diary, court registry, or a public timestamping service in a real
deployment. A rewritten chain no longer reproduces its anchor, and the mismatch is the proof.

The page includes a presenter's **drill**: it edits one stored hash exactly as an insider with SQL
access would, the chain immediately reports the block and the reason, the anchor shows as violated,
and *restore* undoes it. Ledger verification is deterministic cryptography — no AI is involved.

## Authority model: rank + role

Two independent axes, because collapsing them would be wrong — a Constable and a Commissioner can
both be the investigating officer of record, and a forensic reviewer's authority comes from their
function, not their seniority.

| Axis | Question it answers | Values |
|---|---|---|
| **Role** | What do you *do* on a case? | investigating officer · supervisor · forensic reviewer · legal reviewer |
| **Rank** | How *senior* are you? | Constable → HC → ASI → SI → Inspector → DSP → SP → DIG → IG → Commissioner → DGP |

Rank thresholds (all enforced server-side in `backend/app/core/permissions.py`):

| Capability | Minimum rank |
|---|---|
| Log evidence **without** a live capture | Sub-Inspector (field ranks below this must supply one) |
| Confirm or dismiss an AI finding | Sub-Inspector |
| View victim/witness PII | Sub-Inspector |
| Read the audit trail | Inspector |
| Provision and deactivate accounts | Deputy Superintendent |
| View every case, not just your own | Superintendent |

**Accounts are created top-down.** You can only provision a rank strictly *below* your own, so a
Sub-Inspector cannot mint a Commissioner login. The creator is recorded on every account
(`created_by_id`), making the chain of who authorised each login auditable.

**View-only accounts** (`is_view_only`) are an override on top of rank: a public prosecutor or
auditor reads the full case record at their clearance and cannot write anything — every mutating
route rejects them. A view-only Commissioner sees everything and changes nothing.

> The frontend hides controls you lack the authority to use, but that is a courtesy, not a control.
> Every rule above is re-checked on the server. See `tests/api_rank_permissions.py`, which attempts
> privilege escalation and asserts each attempt is refused.

The API is self-documenting: with the backend running, open <http://localhost:8000/docs> for every
endpoint with its schema. The database schema is the set of migrations in `backend/alembic/versions/`.

## Prerequisites

| Software | Version | Verify |
|---|---|---|
| Node.js | 20 LTS+ | `node -v` |
| Python | 3.11+ | `python --version` |
| Docker Desktop | latest | `docker --version` |
| Git | latest | `git --version` |

## 1. Get the project into VS Code

```powershell
cd C:\path\to\your\projects
git clone <your-repo-url> chain-of-truth   # or create the folder and copy files in
cd chain-of-truth
code .
```

## 2. Environment variables

```powershell
copy .env.example .env
```
Defaults work for local dev. For AI features (extraction, contradiction detection, guidance, autopsy
cross-check, chargesheet QA) to actually run, set the API key for whichever provider `AI_PROVIDER`
names in `.env`:

| `AI_PROVIDER` | Key to set | Model setting |
|---|---|---|
| `groq` (default) | `GROQ_API_KEY` | `GROQ_MODEL` |
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |

Without a key, evidence still uploads/hashes/logs correctly — the AI stages are skipped, a warning is
logged, and the UI receives an `evidence.ai_skipped` WebSocket event rather than the upload failing.
Everything that is NOT AI — hashing, the chain, custody, location scoring, closure readiness, case
similarity — keeps working without a key. Note this means an absent contradiction flag is **not** a
clean bill of health when no key is configured.

For real embeddings (better RAG retrieval quality) set `VOYAGE_API_KEY`; without it, a local
deterministic fallback embedding is used and clearly logged as such.

Generate a real JWT secret for anything beyond local dev:
```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## 3. Start Postgres (with pgvector) and MinIO

```powershell
docker compose up -d
docker compose ps    # both cot_db and cot_minio should show healthy/running
```

> **The container publishes Postgres on host port 5433, not 5432.** This is deliberate: 5432 is very
> often already taken by a PostgreSQL server installed natively on the machine, and if both are
> listening your client silently connects to the *wrong* one (which has no `chain_of_truth` database
> or role). Confirm the mapping shows `0.0.0.0:5433->5432/tcp`:
> ```powershell
> docker compose ps
> ```
> If it shows `->5432` instead, the container is running from an older version of the compose file —
> recreate it with `docker compose up -d --force-recreate db`.

## 4. Backend setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

### Run database migrations
The initial migration is already committed under `backend/alembic/versions/`, so just apply it:
```powershell
alembic upgrade head
```
Do **not** run `alembic revision --autogenerate` on a fresh clone — the schema is already captured,
and autogenerating would create a second, duplicate initial migration. Only use `revision
--autogenerate` after you change a model.

### Seed data
```powershell
cd ..
python scripts/seed_demo_case.py
python scripts/seed_legal_kb.py
```
The first creates seven fictional officers spanning the rank ladder (all share password
`DemoPass!2026`) and one fictional demo case (`COT-2026-0001`) — empty until you load the scenario
from the Command Center (see *The demonstration scenario* above). Signing in as the Constable and then
as the Commissioner is the fastest way to see authority actually change what the app exposes — the
login screen lists all seven and signs you in with one click. The second seeds and embeds the curated legal knowledge base
the Investigation Guidance Agent retrieves from.

### Start the backend
```powershell
cd backend
uvicorn app.main:app --reload --port 8000
```
Verify: `http://localhost:8000/docs` shows the full OpenAPI UI; `http://localhost:8000/health`
returns `{"status": "ok", ...}`.

## 5. Frontend setup

New terminal:
```powershell
cd frontend
npm install
npm run dev
```
Verify: `http://localhost:5173` shows the login screen. Sign in as any seeded user, e.g.
`ananya.rao@demo.chainoftruth.example` / `DemoPass!2026`.

## 6. Test the full flow

1. Sign in as the Superintendent (`vikram.nair@demo.chainoftruth.example`) and press **Load full demo**
   on the demo strip of any page — or present it stage by stage with **Next stage**. Stage 3 (the
   receptionist's statement) is flagged against the stage-2 CCTV exit live, in front of the audience.
2. Walk the modules from the Command Center: Timeline → Contradictions (confirm one) → Autopsy
   cross-check → Hash Ledger (run the tamper drill, then restore) → Case Similarity (compare Riverside
   with Lakeview Lodge) → Case review.
3. Sign in as the Constable (`arjun.pillai@…`) and try to log evidence — the live capture is required;
   sign in as the prosecutor (`sameer.kulkarni@…`) and note that nothing can be changed.
4. Run `python scripts/verify_hash_chain.py <case_id>` from the project root to independently verify
   the evidence hash chain outside the running application.

### Automated tests

They run against the live, seeded stack (start it first). All honour `API_URL` / `APP_URL`.

```powershell
python tests\api_smoke.py              # every GET endpoint returns 200
python tests\api_rank_permissions.py   # rank ladder, provisioning, escalation attempts refused
python tests\api_evidence_rules.py     # live-capture gate, view-only enforcement (own scratch case)
npm install playwright-core            # once, at the project root; needs Edge or Chrome
node tests\e2e_browser.js              # every page, three ranks, no console errors
```

## Testing on mobile/tablet widths
Resize the browser or use dev tools device emulation — the sidebar collapses into a hamburger drawer
below the `md` breakpoint (768px). The Autopsy 3D viewer and Evidence Graph remain functional at
narrower widths but are most usable on tablet+.

## Deployment
```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
This builds and runs the full stack (Postgres, MinIO, backend, frontend) in containers. Known scaling
limit: the WebSocket manager is in-process, so run a single backend replica (or add a Redis pub/sub
layer) before scaling out.

## Troubleshooting

**`connection refused` / `could not connect to server` on startup, migrations, or seeding**
The database container isn't reachable at the port `DATABASE_URL` names. Check the published port
matches:
```powershell
docker compose ps                       # expect 0.0.0.0:5433->5432/tcp for cot_db
docker compose up -d --force-recreate db
```

**`password authentication failed for user "chain_of_truth"` or `database "chain_of_truth" does not exist`**
You are almost certainly connected to a *different* PostgreSQL than the container — typically one
installed natively on Windows and listening on 5432. Verify:
```powershell
Get-Service -Name '*postgres*'          # a running native server is the usual culprit
```
Keep the container on 5433 (the default here) so the two can coexist. Also confirm
`POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL` are identical — they are separate
settings and must match.

**Postgres credentials changed but the old ones still work**
`POSTGRES_PASSWORD` is only applied when the data volume is first created. To re-initialize from
scratch (this **deletes all local evidence and case data**):
```powershell
docker compose down -v
docker compose up -d
```
Then re-run `alembic upgrade head` and both seed scripts.

**`ImportError: email-validator is not installed`**
Your virtualenv predates the dependency list. Reinstall: `pip install -e ".[dev]"` from `backend/`.

**`ValueError: password cannot be longer than 72 bytes` on login/seeding**
A stale `passlib` install. The project now uses `bcrypt` directly; reinstall with
`pip install -e ".[dev]"` from `backend/`.

**Evidence uploads return 500**
Should no longer happen with a missing AI key — uploads succeed and the AI stage is skipped. If you
still see a 500, check the backend log for the stage that failed; hashing/storage errors (e.g. MinIO
not running) *will* legitimately fail an upload, since evidence integrity is not optional.

**Swagger UI "Authorize" returns 422**
Use the padlock with an email in the `username` field. `/docs` authorizes against
`POST /api/v1/auth/token` (OAuth2 form). The React client uses `POST /api/v1/auth/login` (JSON).

**Frontend loads but every request fails / CORS error**
`cors_origins` in `backend/app/config.py` allows `http://localhost:5173`. If you run Vite on another
port, add that origin there. Note the frontend reads `VITE_*` from the **repo-root** `.env`
(configured via `envDir` in `frontend/vite.config.ts`), not from `frontend/.env`.

## Project structure
```
backend/app/api/v1/      one router per module (evidence, timeline, contradictions, ledger, copilot, demo …)
backend/app/services/    the logic: hashing + chain, AI pipeline, ledger, similarity, location scoring …
backend/app/services/ai/ the LLM adapters (Groq / OpenAI / Anthropic) and the extraction prompts
backend/app/demo/        the Riverside scenario, the related cases and the synthetic illustrations
backend/alembic/         database migrations (the schema)
frontend/src/pages/      one page per module
frontend/src/components/ anatomy viewer, demo strip, shell, shared UI kit (ui/), graph, evidence intake
scripts/                 dev.ps1 (run everything), seed_demo_case.py, seed_legal_kb.py, verify_hash_chain.py
tests/                   API and browser tests against the live stack
```

## Security notes
- No secrets are hard-coded — everything sensitive comes from `.env` (gitignored).
- RBAC is enforced server-side (`backend/app/core/permissions.py`), never only in the UI.
- For production, lock down the audit log at the database level:
  ```sql
  REVOKE UPDATE, DELETE ON audit_log FROM <your_app_db_role>;
  ```
- Rotate `JWT_SECRET_KEY` and all API keys before any real deployment; the values in `.env.example`
  are placeholders only.

## Known limitations (honest, not hidden)
- WebSocket connections are held in-process — see the scaling note above.
- Offline sync (`scripts`/`Offline Sync` page) is a real queue architecture but does not
  automatically replay queued captures through the full evidence pipeline — see
  `backend/app/services/sync_service.py`'s docstring for exactly what's demo-scope vs. production-real.
- The Autopsy 3D viewer uses placeholder primitive geometry, not a real anatomical asset — clearly
  labeled in `frontend/src/components/autopsy3d/AutopsyViewer.tsx`.
- The legal knowledge base seeded by `scripts/seed_legal_kb.py` is illustrative placeholder content,
  not verified legal citations — see that script's docstring.


## License

Released under the [MIT License](LICENSE).

> The Software is provided "as is", without warranty of any kind. This project is a
> decision-support tool for investigators: **AI assists, humans decide.** No output of this
> system is a legal determination, and nothing here is a substitute for review by a qualified
> investigating officer, forensic medical officer, or public prosecutor.
