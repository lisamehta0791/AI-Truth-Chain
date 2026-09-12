"""
The Riverside Hotel scenario — a fictional, fully-worked demonstration case.

Seven stages, each a batch of evidence that arrives the way it would in a
real investigation: scene report first, CCTV and a witness the same night,
phone records and forensics days later, the post-mortem last. Every item is
ingested through the REAL pipeline (`evidence_service.ingest_evidence`):
hashed, chained, stored, extracted, compared for contradictions. Nothing here
is pre-computed or faked — that is the point of presenting it in stages.

The evidence is written so the AI has genuine conflicts to find:
  * the receptionist says the man left at 21:15; CCTV has him leaving at 20:47
  * his phone stays on the hotel's tower until 22:05
  * the post-mortem puts the death at 21:00–23:00 — after CCTV shows him gone
  * the seized knife is 18 cm; the fatal wound track is 9 cm deep

All names, places and events are fictional. Coordinates are real Chennai
locations so the map and location scoring have something to show.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.models.evidence import EvidenceType

# Marina / Santhome waterfront, Chennai — fictional "Riverside Hotel".
HOTEL = (13.0418, 80.2775)
REAR_LANE = (13.0421, 80.2769)
MARINA_ROAD = (13.0500, 80.2820)
ADYAR_BRIDGE = (13.0110, 80.2560)
SUSPECT_FLAT = (13.0067, 80.2206)  # Adyar


@dataclass
class DemoItem:
    evidence_type: EvidenceType
    filename: str
    description: str
    text: str
    uploader_badge: str
    witness_badge: str | None = None
    gps: tuple[float, float] | None = None
    captured_at: datetime | None = None
    language: str = "en"
    # Which generated illustration to attach (see demo/images.py).
    image: str | None = None


@dataclass
class DemoStage:
    key: str
    title: str
    narration: str
    items: list[DemoItem] = field(default_factory=list)
    # Non-evidence actions run after the items (see scenario_service._followup).
    followups: list[str] = field(default_factory=list)


def _t(day: int, hh: int, mm: int) -> datetime:
    # IST (UTC+5:30) expressed in UTC so timestamps compare correctly.
    return datetime(2025, 4, day, hh, mm, tzinfo=timezone.utc)


STAGES: list[DemoStage] = [
    DemoStage(
        key="scene",
        title="Scene attended",
        narration="Housekeeping finds a guest dead in room 412. The first officer on scene logs the scene report — with a live capture, because a Constable must.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.DOCUMENT,
                filename="scene-report-412.txt",
                description="First-response scene report, Room 412",
                uploader_badge="PC-7781",
                gps=HOTEL,
                captured_at=_t(15, 2, 5),  # 07:35 IST
                image="scene",
                text=(
                    "SCENE REPORT — Riverside Hotel, Santhome High Road, Chennai. 15 April 2025, 07:35. "
                    "Constable A. Pillai attending. Housekeeping staff Kavitha S. reported at 07:10 that the guest in "
                    "Room 412, registered as Mr. Devan Krishnan (male, 46), was found unresponsive on the floor beside the bed. "
                    "No pulse. Visible blood pooling around the left leg. A drinking glass and an open bottle of whisky on the desk. "
                    "The room door was locked from inside with the latch; the balcony door was closed. "
                    "The REAR SERVICE DOOR on the ground floor, which opens onto the service lane, was found forced open — "
                    "the strike plate is bent outward and there are fresh tool marks on the frame. "
                    "Scene sealed at 07:40 pending forensic team."
                ),
            ),
        ],
    ),
    DemoStage(
        key="cctv",
        title="CCTV pulled",
        narration="The hotel's camera exports arrive. Two cameras matter: the lobby, and the rear service door.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.CCTV_METADATA,
                filename="cctv-cam03-lobby.txt",
                description="CCTV Camera 03 — main lobby, evening of 14 April",
                uploader_badge="SI-1042",
                gps=HOTEL,
                captured_at=_t(14, 15, 17),  # 20:47 IST
                image="cctv_lobby",
                text=(
                    "CCTV EXPORT — Riverside Hotel Camera 03 (Lobby, facing main entrance). Date 14 April 2025. "
                    "19:41 — a male guest later identified as Devan Krishnan (Room 412) crosses the lobby toward the lifts with a second male, "
                    "approx. 35–40 years, dark jacket, carrying a black backpack. "
                    "20:47 — the second male (dark jacket, black backpack) exits the lobby alone through the main entrance, walking quickly. "
                    "No further sighting of this individual on Camera 03 for the rest of the night. Camera clock verified against NTP; drift under 2 seconds."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.CCTV_METADATA,
                filename="cctv-cam07-rear.txt",
                description="CCTV Camera 07 — rear service corridor",
                uploader_badge="SI-1042",
                gps=REAR_LANE,
                captured_at=_t(14, 15, 0),  # 20:30 IST
                image="cctv_rear",
                text=(
                    "CCTV EXPORT — Riverside Hotel Camera 07 (rear service corridor, ground floor). Date 14 April 2025. "
                    "20:30 — the rear service door opens from the OUTSIDE; a figure in a dark hooded jacket enters the corridor and "
                    "proceeds toward the service stairwell. Face not visible. "
                    "20:44 — the same figure returns down the service stairwell and exits through the rear service door. "
                    "Camera 07 has no coverage of the lane beyond the door."
                ),
            ),
        ],
    ),
    DemoStage(
        key="witness",
        title="Witness statement recorded",
        narration="The night receptionist gives a statement. His timing does not match the cameras.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.STATEMENT,
                filename="statement-ramesh-v1.txt",
                description="Statement of Ramesh Kumar, night receptionist",
                uploader_badge="SI-1042",
                gps=HOTEL,
                captured_at=_t(15, 5, 30),
                image="statement",
                text=(
                    "STATEMENT OF WITNESS — Ramesh Kumar, 29, night receptionist, Riverside Hotel. Recorded 15 April 2025, 11:00, "
                    "by Sub-Inspector A. Rao. I was on the front desk from 19:00 on 14 April until 07:00 the next morning. "
                    "At about 20:00 I heard raised voices from the fourth floor — two men arguing — it lasted a few minutes and stopped. "
                    "I saw the man who had come in with the guest from 412 leave the lobby at around 21:15. He was wearing a dark jacket and "
                    "seemed in a hurry. I did not see him again. I did not see anyone use the rear service door; it is normally kept locked "
                    "after 20:00. Nobody else went up to the fourth floor that I noticed."
                ),
            ),
        ],
    ),
    DemoStage(
        key="phone",
        title="Call detail records obtained",
        narration="The telecom operator returns the suspect's call and tower records. The phone stayed near the hotel long after CCTV shows him gone.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.PHONE_RECORD,
                filename="cdr-9840XXXX12.txt",
                description="Call detail records — mobile 98400-XXX12 (suspect), 14 April",
                uploader_badge="INSP-3310",
                gps=HOTEL,
                captured_at=_t(14, 16, 35),  # 22:05 IST
                image="cdr",
                text=(
                    "CALL DETAIL RECORD EXTRACT — subscriber 98400-XXX12 (registered to Arvind Sekar, Adyar, Chennai). 14 April 2025. "
                    "19:52 — outgoing voice call to 98410-XXX77 (Devan Krishnan), duration 4 min 12 s, serving cell SANTHOME-HR-2 (covers Riverside Hotel). "
                    "20:11 — SMS sent to 98410-XXX77, content not retained. "
                    "The handset remained attached to cell SANTHOME-HR-2 continuously from 19:38 until 22:05, when it re-attached to cell "
                    "MARINA-BCH-1 (Marina Beach Road). 22:41 — attached to ADYAR-BRG-3 (Adyar bridge). 23:09 — attached to ADYAR-RES-5 "
                    "(residential, Adyar), where it remained until 06:30 on 15 April."
                ),
            ),
        ],
    ),
    DemoStage(
        key="forensics",
        title="Forensic report and seized weapon",
        narration="The forensic team reports, and a kitchen knife recovered from the service lane is logged — with a second officer confirming collection.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.FORENSIC_REPORT,
                filename="fsl-report-2025-0418.txt",
                description="State FSL report — prints, blood, tool marks",
                uploader_badge="FR-3390",
                captured_at=_t(18, 9, 0),
                image="forensic",
                text=(
                    "FORENSIC SCIENCE LABORATORY REPORT — Case ref COT-2026-0001. Examined 16–18 April 2025. "
                    "(1) Latent fingerprints lifted from the interior handle of the rear service door: a match to Arvind Sekar (record on file). "
                    "(2) Blood-stained carpet section from Room 412: human blood, group B+, consistent with the deceased Devan Krishnan. "
                    "(3) Tool marks on the rear service door frame: consistent with a flat-bladed pry tool approximately 20 mm wide; NOT consistent with a knife blade. "
                    "(4) Whisky glass from Room 412: two sets of prints, the deceased and one unidentified. "
                    "(5) No fingerprints of Arvind Sekar were found inside Room 412."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.SEIZED_ITEM,
                filename="seized-knife-photo.png",
                description="Kitchen knife recovered from drain grate, rear service lane",
                uploader_badge="PC-7781",
                witness_badge="SI-1042",
                gps=REAR_LANE,
                captured_at=_t(15, 4, 50),
                image="knife",
                text=(
                    "SEIZURE MEMO — 15 April 2025, 10:20. Recovered from the storm-drain grate in the service lane behind the Riverside Hotel, "
                    "approximately 6 m from the rear service door: one stainless-steel kitchen knife, blade length 18 cm, black polymer handle, "
                    "with reddish-brown staining along the blade. Photographed in situ, bagged and sealed, tag EV-RH-0009. "
                    "Collected by Constable A. Pillai; witnessed by Sub-Inspector A. Rao."
                ),
            ),
        ],
    ),
    DemoStage(
        key="autopsy",
        title="Post-mortem report entered",
        narration="The forensic medical officer's report arrives. Its time-of-death window is the crux of the case.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.AUTOPSY_REPORT,
                filename="pm-report-devan-krishnan.txt",
                description="Post-mortem report — Devan Krishnan",
                uploader_badge="FR-3390",
                captured_at=_t(16, 6, 0),
                image="autopsy",
                text=(
                    "POST-MORTEM EXAMINATION REPORT — Deceased: Devan Krishnan, male, 46. Examined 16 April 2025, 11:30, Government Hospital mortuary, Chennai. "
                    "EXTERNAL: A single penetrating stab wound to the anterior LEFT THIGH, 3.1 cm wide, wound track 9 cm deep, transecting the femoral artery. "
                    "A 4 cm contusion with underlying subgaleal haematoma over the right parietal region of the HEAD, consistent with blunt impact against a flat surface. "
                    "Superficial abrasions on the anterior CHEST. No defensive injuries to the hands or forearms. "
                    "INTERNAL: Exsanguination from the femoral wound. No other significant injury. "
                    "TOXICOLOGY: Blood alcohol 0.08%; no other substances detected. "
                    "ESTIMATED TIME OF DEATH: between 21:00 and 23:00 on 14 April 2025, based on rigor, livor and gastric contents. "
                    "CAUSE OF DEATH: haemorrhage from a stab wound to the left thigh. MANNER: to be determined by investigation. "
                    "The wound dimensions are consistent with a single-edged blade approximately 3 cm wide; the track depth of 9 cm does not by itself establish blade length."
                ),
            ),
        ],
    ),
    DemoStage(
        key="movements",
        title="Vehicle movements traced",
        narration="Automatic number-plate reads place the suspect's car on the waterfront road that night. The location surface fills in.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.GPS_LOG,
                filename="anpr-TN09-XX-4471.txt",
                description="ANPR reads — vehicle TN 09 XX 4471 (registered to suspect)",
                uploader_badge="INSP-3310",
                gps=MARINA_ROAD,
                captured_at=_t(14, 17, 10),  # 22:40 IST
                image="anpr",
                text=(
                    "ANPR QUERY RESULT — vehicle TN 09 XX 4471, grey hatchback, registered to Arvind Sekar. 14–15 April 2025. "
                    "22:40 — Marina Beach Road northbound camera, Chennai (13.0500, 80.2820). "
                    "23:05 — Adyar bridge camera, southbound (13.0110, 80.2560). "
                    "No reads between 19:00 and 22:40. No reads after 23:05 until 08:12 on 15 April at the same Adyar bridge camera, northbound."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.GPS_LOG,
                filename="anpr-adyar.txt",
                description="ANPR read — Adyar bridge camera",
                uploader_badge="INSP-3310",
                gps=ADYAR_BRIDGE,
                captured_at=_t(14, 17, 35),
                text="ANPR — vehicle TN 09 XX 4471 read at Adyar bridge camera, southbound, 23:05 on 14 April 2025 (13.0110, 80.2560).",
            ),
        ],
    ),
]


STAGES.append(
    DemoStage(
        key="followup",
        title="Follow-up interview",
        narration="Ramesh is re-interviewed and his timing changes. Statement Reliability shows exactly what moved between the two versions.",
        followups=["statement_v2"],
    )
)
STAGES.append(
    DemoStage(
        key="prefiling",
        title="Pre-filing review",
        narration="The draft chargesheet is checked claim-by-claim against the evidence, closure readiness is scored, a field tablet syncs its offline queue, and a second open case with overlapping names surfaces in Case Similarity.",
        followups=["chargesheet_qa", "offline_sync", "closure_score"],
    )
)
STAGES.append(
    DemoStage(
        key="pattern",
        title="Pattern search across cases",
        narration="Three earlier files with the same signature — a hotel guest, a knife, a forced rear service door, a grey hatchback — are pulled into the system so Case Similarity can ask the question every investigator asks: has this happened before?",
        followups=["related_cases", "similar_case"],
    )
)

RAMESH_V2 = (
    "STATEMENT OF WITNESS - SECOND INTERVIEW - Ramesh Kumar, night receptionist. Recorded 17 April 2025, 10:30, by Inspector L. Mathew. "
    "I want to correct what I said earlier. Thinking about it again, the man in the dark jacket left the lobby earlier than I first said - "
    "it was closer to 20:45, not 21:15. I had confused it with a delivery that came at 21:15. I still heard the argument on the fourth floor "
    "at about 20:00. I also now recall that the rear service door alarm light on my console was off that evening, which it should not have been."
)

DRAFT_CHARGESHEET = (
    "DRAFT CHARGESHEET - State v. Arvind Sekar. It is alleged that on the night of 14 April 2025 the accused, Arvind Sekar, visited Devan "
    "Krishnan in Room 412 of the Riverside Hotel. At approximately 20:00 an argument took place. The accused caused a fatal stab wound to the "
    "deceased's left thigh with an 18 cm kitchen knife recovered from the service lane. The accused left the hotel through the main lobby at 21:15. "
    "The accused's fingerprints were recovered from inside Room 412. Call records show the accused telephoned the deceased at 19:52. "
    "The accused's vehicle was recorded on Marina Beach Road at 22:40."
)

def _d(year: int, month: int, day: int, hh: int, mm: int) -> datetime:
    return datetime(year, month, day, hh, mm, tzinfo=timezone.utc)


LAKEVIEW = (13.0067, 80.2570)  # Adyar riverside — fictional "Lakeview Lodge"
HARBOUR_INN = (13.0980, 80.2930)  # near the harbour — fictional "Harbour Inn"
KIOSK = (13.0505, 80.2812)

# Earlier files that share the Riverside signature. They are separate cases —
# separate evidence, separate chains, separate graphs — so Case Similarity has
# something honest to compare against: shared names, places, vehicles and a
# modus operandi, never a pre-written "these are linked".
RELATED_CASES: list[dict] = [
    dict(
        case_number="COT-2026-0002",
        title="Marina Beach Road - Assault (Demo)",
        description="Fictional: an assault on the waterfront five days before the Riverside death, naming the same man and the same grey hatchback.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.DOCUMENT,
                filename="fir-summary-0409.txt",
                description="FIR summary - Marina Beach Road assault",
                uploader_badge="INSP-3310",
                gps=MARINA_ROAD,
                captured_at=_d(2025, 4, 9, 18, 30),
                text=(
                    "FIR SUMMARY - 9 April 2025. Complainant Suresh Babu (male, 38) reports an assault near the Marina Beach Road northbound ANPR camera at about 23:30. "
                    "He states a man in a dark jacket stepped out of a grey hatchback, argued with him about money and threatened him with a kitchen knife. "
                    "The complainant names one Arvind Sekar as having been present at the scene. No weapon recovered. CCTV from a nearby kiosk is being sought."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.CCTV_METADATA,
                filename="cctv-kiosk-marina.txt",
                description="CCTV - Marina kiosk camera, 9 April",
                uploader_badge="SI-1042",
                gps=KIOSK,
                captured_at=_d(2025, 4, 10, 6, 0),
                image="cctv_lobby",
                text=(
                    "CCTV EXPORT - Marina kiosk camera, 9 April 2025. 23:26 - a grey hatchback, registration partially readable as TN 09 XX 44--, stops on the road shoulder. "
                    "23:28 - a male in a dark jacket and black backpack leaves the driver's seat and walks toward the complainant. 23:34 - the male returns to the car and drives north."
                ),
            ),
        ],
    ),
    dict(
        case_number="COT-2025-0417",
        title="Lakeview Lodge - Suspicious Death (Demo)",
        description="Fictional: a guest found dead in a locked room in February 2025, a rear service door forced, a knife wound to the thigh - the same signature as Riverside, two months earlier.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.DOCUMENT,
                filename="scene-report-lakeview-207.txt",
                description="Scene report - Lakeview Lodge, Room 207",
                uploader_badge="INSP-3310",
                gps=LAKEVIEW,
                captured_at=_d(2025, 2, 9, 2, 20),
                image="scene",
                text=(
                    "SCENE REPORT - Lakeview Lodge, Adyar, Chennai. 9 February 2025, 07:50. Sub-Inspector A. Rao attending. "
                    "The guest in Room 207, registered as Mr. Prakash Menon (male, 51), was found dead on the floor by housekeeping at 07:20. "
                    "A deep wound to the right thigh with heavy blood loss. The room door was latched from inside. "
                    "The rear service door on the ground floor was forced from outside - the strike plate bent and fresh tool marks on the frame. "
                    "A whisky bottle and two glasses on the desk. Scene sealed at 08:00."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.CCTV_METADATA,
                filename="cctv-lakeview-service.txt",
                description="CCTV - Lakeview service corridor, night of 8 February",
                uploader_badge="INSP-3310",
                gps=LAKEVIEW,
                captured_at=_d(2025, 2, 9, 5, 30),
                image="cctv_rear",
                text=(
                    "CCTV EXPORT - Lakeview Lodge service corridor camera, 8 February 2025. 21:12 - the rear service door opens from outside; a figure in a dark hooded jacket with a black backpack enters and takes the service stairwell. "
                    "21:41 - the same figure returns down the stairwell and leaves through the rear service door. No other use of the door between 20:00 and 06:00."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.GPS_LOG,
                filename="anpr-lakeview-0208.txt",
                description="ANPR reads - Adyar bridge camera, 8 February",
                uploader_badge="INSP-3310",
                gps=ADYAR_BRIDGE,
                captured_at=_d(2025, 2, 9, 10, 0),
                image="anpr",
                text=(
                    "ANPR QUERY RESULT - Adyar bridge camera, 8 February 2025. 20:58 - vehicle TN 09 XX 4471, grey hatchback, registered to Arvind Sekar, southbound (13.0110, 80.2560). "
                    "21:55 - the same vehicle northbound. No other reads for this plate that night."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.AUTOPSY_REPORT,
                filename="pm-report-prakash-menon.txt",
                description="Post-mortem report - Prakash Menon",
                uploader_badge="FR-3390",
                captured_at=_d(2025, 2, 11, 9, 0),
                image="document",
                text=(
                    "POST-MORTEM REPORT - Prakash Menon, male, 51. Examination 10 February 2025. Cause of death: haemorrhage from a single stab wound to the right thigh transecting the femoral artery. "
                    "Wound track approximately 8 cm, single-edged blade about 3 cm wide. Blood alcohol 0.09 percent. No defensive injuries to the hands or forearms. "
                    "Estimated time of death between 21:00 and 23:00 on 8 February 2025."
                ),
            ),
        ],
    ),
    dict(
        case_number="COT-2024-0982",
        title="Harbour Inn - Assault with a knife (Demo)",
        description="Fictional: November 2024, a lodger stabbed in the leg and survived; the rear service door forced; the attacker described as a man in a dark jacket with a backpack.",
        items=[
            DemoItem(
                evidence_type=EvidenceType.STATEMENT,
                filename="statement-victim-harbour.txt",
                description="Statement of Joseph Fernandes, victim",
                uploader_badge="SI-1042",
                gps=HARBOUR_INN,
                captured_at=_d(2024, 11, 23, 4, 0),
                image="document",
                text=(
                    "STATEMENT OF VICTIM - Joseph Fernandes, male, 44, lodger at Harbour Inn. Recorded 23 November 2024, 09:30, by Sub-Inspector A. Rao. "
                    "On the night of 22 November at about 22:30 a man in a dark jacket with a black backpack knocked at my room, room 118. He said he had come about money I owed. "
                    "We argued. He drew a kitchen knife and stabbed me in the left thigh, then ran down the back stairs. I heard the rear service door slam. "
                    "I did not know him. I would recognise him. He was about 35, thin, with a short beard."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.DOCUMENT,
                filename="scene-report-harbour-118.txt",
                description="Scene report - Harbour Inn, Room 118",
                uploader_badge="SI-1042",
                gps=HARBOUR_INN,
                captured_at=_d(2024, 11, 22, 19, 30),
                image="scene",
                text=(
                    "SCENE REPORT - Harbour Inn, Chennai. 22 November 2024, 23:40. Sub-Inspector A. Rao attending after an emergency call at 22:52. "
                    "The victim, Joseph Fernandes, was taken to Government General Hospital with a stab wound to the left thigh; condition stable. "
                    "The rear service door on the ground floor was found forced open with fresh tool marks on the frame. A kitchen knife with an 18 cm blade was recovered from the drain grate in the service lane behind the building."
                ),
            ),
            DemoItem(
                evidence_type=EvidenceType.FORENSIC_REPORT,
                filename="fsl-report-2024-1131.txt",
                description="State FSL report - knife, Harbour Inn",
                uploader_badge="FR-3390",
                captured_at=_d(2024, 12, 2, 6, 0),
                image="document",
                text=(
                    "STATE FORENSIC SCIENCE LABORATORY - report 2024/1131. Exhibit: kitchen knife, 18 cm single-edged blade, recovered from a drain grate in the service lane behind Harbour Inn. "
                    "Blood on the blade matches the victim Joseph Fernandes. A partial fingerprint on the handle was insufficient for identification. "
                    "Tool marks on the rear service door frame are consistent with a flat pry bar approximately 25 mm wide."
                ),
            ),
        ],
    ),
]

# Kept for callers that still import the single related case.
SIMILAR_CASE = dict(
    case_number=RELATED_CASES[0]["case_number"],
    title=RELATED_CASES[0]["title"],
    description=RELATED_CASES[0]["description"],
    text=RELATED_CASES[0]["items"][0].text,
)


def stage_index_by_key(key: str) -> int:
    for i, stage in enumerate(STAGES):
        if stage.key == key:
            return i
    raise KeyError(key)


def make_file_bytes(item: DemoItem) -> tuple[bytes, str]:
    """
    The bytes actually uploaded and hashed for an item. Illustrated items get a
    generated PNG (so the Evidence Vault has thumbnails); everything else is
    the text itself, which is also what the AI reads.
    """
    if item.image:
        from app.demo.images import render_evidence_image  # lazy: PIL is only needed here

        return render_evidence_image(item.image, item.description), "image/png"
    return item.text.encode("utf-8"), "text/plain"


def make_live_capture_bytes(badge: str) -> bytes:
    from app.demo.images import render_live_capture

    buf = io.BytesIO()
    render_live_capture(badge).save(buf, format="JPEG", quality=85)
    return buf.getvalue()
