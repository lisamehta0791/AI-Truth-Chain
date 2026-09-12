"""
Generated illustrations for demo evidence.

Real cases carry photographs, CCTV stills and scanned documents; a demo
that uploads bare .txt files looks like a spreadsheet. These renderers produce
plausible-looking, clearly-labelled *synthetic* images — a CCTV frame with a
timestamp burn-in, a document scan, a seized-item photo card — so the Evidence
Vault reads like a real vault. Every image is stamped DEMO so it can never be
mistaken for an actual exhibit.
"""
from __future__ import annotations

import io
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 960, 640
INK = (225, 226, 234)
DIM = (130, 140, 150)
CYAN = (0, 229, 255)
AMBER = (254, 201, 49)
RED = (255, 77, 109)


def _font(size: int, mono: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in (["consola.ttf", "cour.ttf"] if mono else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _stamp_demo(d: ImageDraw.ImageDraw) -> None:
    d.rectangle([W - 190, H - 44, W - 12, H - 12], outline=AMBER, width=2)
    d.text((W - 178, H - 38), "DEMO — SYNTHETIC", fill=AMBER, font=_font(16, mono=True))


def _base(bg=(12, 16, 22)) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), bg)
    return img, ImageDraw.Draw(img)


def _noise(img: Image.Image, amount: int = 18) -> Image.Image:
    rnd = random.Random(7)
    px = img.load()
    for _ in range(amount * 900):
        x, y = rnd.randrange(W), rnd.randrange(H)
        r, g, b = px[x, y]
        n = rnd.randrange(-amount, amount)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return img


def _cctv(title: str, timestamp: str, figure_x: int, hooded: bool) -> Image.Image:
    img, d = _base((18, 22, 28))
    # floor / wall planes
    d.polygon([(0, 420), (W, 420), (W, H), (0, H)], fill=(30, 34, 40))
    d.rectangle([0, 0, W, 420], fill=(22, 26, 32))
    for x in range(0, W, 80):  # tiled floor perspective lines
        d.line([(x, 420), (x + 120, H)], fill=(40, 46, 54), width=1)
    d.line([(0, 420), (W, 420)], fill=(60, 68, 78), width=2)
    # door / lift frames
    d.rectangle([120, 160, 260, 420], outline=(70, 78, 90), width=3)
    d.rectangle([700, 150, 850, 420], outline=(70, 78, 90), width=3)
    # figure silhouette
    fx = figure_x
    d.ellipse([fx - 22, 200, fx + 22, 244], fill=(46, 52, 62))
    d.rounded_rectangle([fx - 40, 244, fx + 40, 380], radius=18, fill=(40, 46, 56))
    if hooded:
        d.pieslice([fx - 34, 186, fx + 34, 254], 180, 360, fill=(36, 40, 50))
    d.rectangle([fx - 34, 380, fx - 8, 470], fill=(34, 38, 46))
    d.rectangle([fx + 8, 380, fx + 34, 470], fill=(34, 38, 46))
    # burn-in
    d.text((16, 14), title, fill=INK, font=_font(22, mono=True))
    d.text((16, 44), timestamp, fill=CYAN, font=_font(20, mono=True))
    d.text((W - 150, 14), "● REC", fill=RED, font=_font(20, mono=True))
    img = _noise(img, 14).filter(ImageFilter.GaussianBlur(0.6))
    d = ImageDraw.Draw(img)
    for y in range(0, H, 3):  # scanlines
        d.line([(0, y), (W, y)], fill=(10, 12, 16), width=1)
    _stamp_demo(d)
    return img


def _document(title: str, lines: list[str], ref: str) -> Image.Image:
    img, d = _base((236, 234, 228))  # paper
    d.rectangle([0, 0, W, 90], fill=(28, 32, 40))
    d.text((32, 22), title, fill=INK, font=_font(30))
    d.text((32, 58), ref, fill=CYAN, font=_font(16, mono=True))
    y = 120
    for line in lines:
        d.text((48, y), line, fill=(40, 42, 48), font=_font(20))
        y += 34
    d.rectangle([48, H - 120, 340, H - 60], outline=(120, 120, 130), width=2)
    d.text((60, H - 108), "Seal / Signature", fill=(120, 120, 130), font=_font(16))
    _stamp_demo(d)
    return img


def _knife() -> Image.Image:
    img, d = _base((16, 18, 22))
    d.rectangle([60, 80, W - 60, H - 80], fill=(28, 30, 36))
    # evidence scale bar
    for i in range(0, 18):
        x = 120 + i * 40
        d.line([(x, H - 130), (x, H - 118)], fill=INK, width=2)
        if i % 5 == 0:
            d.text((x - 6, H - 112), f"{i}", fill=INK, font=_font(14, mono=True))
    d.text((120, H - 160), "cm", fill=DIM, font=_font(14, mono=True))
    # handle + blade
    d.rounded_rectangle([140, 300, 330, 350], radius=20, fill=(22, 22, 24), outline=(60, 60, 66), width=2)
    d.polygon([(330, 305), (840, 318), (860, 326), (330, 346)], fill=(150, 156, 166))
    d.polygon([(330, 305), (840, 318), (330, 326)], fill=(190, 196, 206))
    for x in range(420, 800, 37):  # staining
        d.ellipse([x, 318, x + 14, 330], fill=(110, 40, 44))
    d.text((80, 100), "EXHIBIT EV-RH-0009 — kitchen knife, blade 18 cm", fill=INK, font=_font(22))
    d.text((80, 132), "Recovered: rear service lane drain grate · 15 Apr 2025 10:20", fill=DIM, font=_font(16, mono=True))
    _stamp_demo(d)
    return img


def _scene() -> Image.Image:
    img, d = _base((20, 22, 26))
    d.rectangle([0, 0, W, 360], fill=(34, 36, 42))  # wall
    d.rectangle([0, 360, W, H], fill=(58, 50, 46))  # carpet
    d.rectangle([80, 200, 420, 420], fill=(70, 62, 60))  # bed
    d.rectangle([80, 180, 420, 210], fill=(90, 82, 80))
    d.rectangle([620, 240, 860, 420], fill=(46, 44, 48))  # desk
    d.rectangle([700, 200, 720, 240], fill=(120, 90, 40))  # bottle
    # blood pool
    d.ellipse([430, 430, 640, 520], fill=(92, 28, 34))
    d.ellipse([470, 450, 600, 505], fill=(110, 34, 40))
    # evidence markers
    for i, (x, y) in enumerate([(520, 440), (690, 400), (300, 470)], start=1):
        d.polygon([(x, y), (x + 34, y), (x + 17, y - 42)], fill=AMBER)
        d.text((x + 11, y - 34), str(i), fill=(20, 20, 20), font=_font(18))
    d.text((16, 14), "SCENE — Riverside Hotel, Room 412", fill=INK, font=_font(22, mono=True))
    d.text((16, 44), "15 Apr 2025 07:38  ·  Constable A. Pillai", fill=CYAN, font=_font(18, mono=True))
    _stamp_demo(d)
    return img


def _cdr() -> Image.Image:
    rows = [
        ("19:52:10", "VOICE OUT", "98410-XXX77", "04:12", "SANTHOME-HR-2"),
        ("20:11:44", "SMS OUT", "98410-XXX77", "—", "SANTHOME-HR-2"),
        ("20:47:00", "LOC UPDATE", "—", "—", "SANTHOME-HR-2"),
        ("21:30:05", "LOC UPDATE", "—", "—", "SANTHOME-HR-2"),
        ("22:05:18", "HANDOVER", "—", "—", "MARINA-BCH-1"),
        ("22:41:02", "HANDOVER", "—", "—", "ADYAR-BRG-3"),
        ("23:09:37", "HANDOVER", "—", "—", "ADYAR-RES-5"),
    ]
    img, d = _base((14, 18, 24))
    d.text((32, 24), "CALL DETAIL RECORD — 98400-XXX12", fill=INK, font=_font(26, mono=True))
    d.text((32, 60), "Operator extract · 14 Apr 2025 · DEMO", fill=DIM, font=_font(16, mono=True))
    heads = ["TIME", "TYPE", "B-PARTY", "DUR", "CELL"]
    xs = [32, 190, 380, 600, 700]
    for x, hd in zip(xs, heads):
        d.text((x, 110), hd, fill=CYAN, font=_font(16, mono=True))
    d.line([(32, 136), (W - 32, 136)], fill=(60, 70, 80), width=1)
    y = 150
    for row in rows:
        for x, cell in zip(xs, row):
            d.text((x, y), cell, fill=INK if row[1] != "HANDOVER" else AMBER, font=_font(18, mono=True))
        d.line([(32, y + 30), (W - 32, y + 30)], fill=(34, 40, 48), width=1)
        y += 40
    _stamp_demo(d)
    return img


def _anpr() -> Image.Image:
    img, d = _base((18, 20, 26))
    d.rectangle([0, 300, W, H], fill=(36, 38, 44))
    for x in range(0, W, 120):
        d.rectangle([x, 470, x + 60, 480], fill=(200, 200, 190))
    d.rounded_rectangle([320, 250, 640, 430], radius=30, fill=(96, 100, 108))
    d.rectangle([340, 280, 620, 340], fill=(40, 44, 52))
    d.rounded_rectangle([400, 380, 560, 416], radius=4, fill=(240, 240, 220))
    d.text((412, 386), "TN 09 XX 4471", fill=(20, 20, 20), font=_font(22, mono=True))
    d.rectangle([396, 376, 564, 420], outline=CYAN, width=3)
    d.text((16, 14), "ANPR — MARINA BEACH ROAD N/B", fill=INK, font=_font(22, mono=True))
    d.text((16, 44), "14 Apr 2025 22:40:11  ·  conf 0.97", fill=CYAN, font=_font(18, mono=True))
    _stamp_demo(d)
    return _noise(img, 10)


def render_evidence_image(kind: str, description: str) -> bytes:
    if kind == "cctv_lobby":
        img = _cctv("CAM 03 — LOBBY", "14-04-2025 20:47:00", 560, hooded=False)
    elif kind == "cctv_rear":
        img = _cctv("CAM 07 — REAR SERVICE CORRIDOR", "14-04-2025 20:30:12", 400, hooded=True)
    elif kind == "knife":
        img = _knife()
    elif kind == "scene":
        img = _scene()
    elif kind == "cdr":
        img = _cdr()
    elif kind == "anpr":
        img = _anpr()
    elif kind == "statement":
        img = _document(
            "STATEMENT OF WITNESS",
            [
                "Name: Ramesh Kumar        Age: 29        Occupation: Night receptionist",
                "Recorded: 15 April 2025, 11:00 by Sub-Inspector A. Rao",
                "",
                "I was on the front desk from 19:00 on 14 April until 07:00.",
                "At about 20:00 I heard raised voices from the fourth floor.",
                "I saw the man who had come in with the guest from 412 leave",
                "the lobby at around 21:15. He was wearing a dark jacket.",
                "I did not see anyone use the rear service door.",
            ],
            "Riverside Hotel · COT-2026-0001 · Statement v1",
        )
    elif kind == "forensic":
        img = _document(
            "FORENSIC SCIENCE LABORATORY — REPORT",
            [
                "Case ref: COT-2026-0001            Examined: 16–18 April 2025",
                "",
                "(1) Latent prints, rear service door interior handle: MATCH — Arvind Sekar",
                "(2) Carpet section, Room 412: human blood, group B+ (deceased)",
                "(3) Tool marks, door frame: flat pry tool ~20 mm — NOT a knife blade",
                "(4) Whisky glass: two print sets — deceased + one unidentified",
                "(5) No prints of Arvind Sekar recovered inside Room 412",
            ],
            "State FSL Chennai · Report 2025/0418",
        )
    elif kind == "autopsy":
        img = _document(
            "POST-MORTEM EXAMINATION REPORT",
            [
                "Deceased: Devan Krishnan, M, 46       Examined: 16 April 2025, 11:30",
                "",
                "Stab wound, anterior LEFT THIGH, 3.1 cm wide, track 9 cm — femoral artery transected",
                "Contusion 4 cm, right parietal HEAD — blunt impact, flat surface",
                "Superficial abrasions, anterior CHEST. No defensive injuries.",
                "Toxicology: blood alcohol 0.08%",
                "Estimated time of death: 21:00 – 23:00, 14 April 2025",
                "Cause: haemorrhage (femoral). Manner: to be determined.",
            ],
            "Government Hospital Mortuary, Chennai · FMO",
        )
    elif kind == "document":
        img = _document(description.upper()[:48], ["", "Scanned document — see extracted text for the full record.", "", "This illustration is generated for the demonstration."], "Demo scan")
    else:
        img, d = _base()
        d.text((32, 32), description, fill=INK, font=_font(24))
        _stamp_demo(d)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_live_capture(badge: str) -> Image.Image:
    """A synthetic 'selfie' frame — a silhouette, a timestamp and the badge."""
    img = Image.new("RGB", (640, 480), (24, 28, 34))
    d = ImageDraw.Draw(img)
    d.ellipse([250, 90, 390, 230], fill=(60, 66, 76))
    d.rounded_rectangle([190, 240, 450, 480], radius=60, fill=(48, 54, 64))
    d.text((16, 14), f"LIVE CAPTURE · {badge}", fill=CYAN, font=_font(20, mono=True))
    d.text((16, 40), "DEMO — synthetic frame", fill=AMBER, font=_font(16, mono=True))
    return _noise(img, 12) if False else img
