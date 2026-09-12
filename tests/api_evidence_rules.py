"""Live-capture gate + view-only enforcement, against the live API."""
import io
import json
import urllib.error
import urllib.request
import uuid

import os
B = os.environ.get("API_URL", "http://127.0.0.1:8000")
DOMAIN = "demo.chainoftruth.example"
PW = "DemoPass!2026"
results = []


def t(label, actual, expected):
    results.append((label, actual, expected, actual == expected))
    print(f"  {'PASS' if actual == expected else 'FAIL'}  {label:<58} got={actual} want={expected}")


def jreq(method, path, tok=None, body=None):
    r = urllib.request.Request(B + path, method=method)
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, data, timeout=90) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def multipart(fields, files):
    """fields: dict[str,str]; files: list[(name, filename, content_type, bytes)]"""
    boundary = "----cot" + uuid.uuid4().hex
    buf = io.BytesIO()
    for k, v in fields.items():
        buf.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    for name, fname, ctype, blob in files:
        buf.write(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{fname}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n".encode()
        )
        buf.write(blob)
        buf.write(b"\r\n")
    buf.write(f"--{boundary}--\r\n".encode())
    return boundary, buf.getvalue()


def upload(tok, fields, files):
    boundary, body = multipart(fields, files)
    r = urllib.request.Request(B + "/api/v1/evidence", data=body, method="POST")
    r.add_header("Authorization", "Bearer " + tok)
    r.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def login(local):
    st, b = jreq("POST", "/api/v1/auth/login", body={"email": f"{local}@{DOMAIN}", "password": PW})
    assert st == 200, f"{local}: {st} {b[:200]}"
    return json.loads(b)["access_token"]


tok = {n: login(n) for n in ["arjun.pillai", "ananya.rao", "sameer.kulkarni", "vikram.nair"]}

# A dedicated scratch case, so test uploads never pollute the demo case that
# presenters walk through. Created once, reused on reruns, emptied afterwards.
existing = [c for c in json.loads(jreq("GET", "/api/v1/cases", tok["vikram.nair"])[1]) if c["case_number"] == "TEST-EVIDENCE-RULES"]
if existing:
    case_id = existing[0]["id"]
else:
    st, b = jreq("POST", "/api/v1/cases", tok["vikram.nair"],
                 {"case_number": "TEST-EVIDENCE-RULES", "title": "Automated test scratch case",
                  "description": "Created by tests/api_evidence_rules.py. Safe to ignore."})
    assert st == 201, f"could not create scratch case: {st} {b[:200]}"
    case_id = json.loads(b)["id"]
print(f"scratch case={case_id}")

TXT = b"Statement text file."
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64  # minimal JPEG-ish blob

print("--- live capture gate (field rank = Constable) ---")
st, b = upload(tok["arjun.pillai"],
               {"case_id": case_id, "evidence_type": "statement",
                "text_content": "Constable notes: door was forced open."},
               [("file", "note.txt", "text/plain", TXT)])
t("Constable WITHOUT live capture is refused", st, 422)
if st == 422:
    print(f"        -> {json.loads(b)['detail'][:100]}")

st, b = upload(tok["arjun.pillai"],
               {"case_id": case_id, "evidence_type": "statement",
                "text_content": "Constable notes: the rear service door was forced open at 8:30 PM."},
               [("file", "note.txt", "text/plain", TXT),
                ("live_capture", "selfie.jpg", "image/jpeg", JPG)])
t("Constable WITH live capture succeeds", st, 201)
if st == 201:
    ev = json.loads(b)
    t("  live capture hash stored", bool(ev.get("live_capture_sha256")), True)
    t("  live capture timestamp stored", bool(ev.get("live_capture_at")), True)

print("\n--- non-field rank does not need a live capture ---")
st, b = upload(tok["ananya.rao"],
               {"case_id": case_id, "evidence_type": "statement",
                "text_content": "SI corroborates the rear door was forced."},
               [("file", "si.txt", "text/plain", TXT)])
t("Sub-Inspector without live capture succeeds", st, 201)

print("\n--- view-only account (public prosecutor) ---")
st, b = upload(tok["sameer.kulkarni"],
               {"case_id": case_id, "evidence_type": "statement", "text_content": "should not persist"},
               [("file", "x.txt", "text/plain", TXT)])
t("view-only cannot upload evidence", st, 403)

st, _ = jreq("POST", "/api/v1/cases", tok["sameer.kulkarni"],
             {"case_number": "COT-VIEWONLY", "title": "should not exist"})
t("view-only cannot create a case", st, 403)

st, b = jreq("GET", f"/api/v1/contradictions?case_id={case_id}", tok["sameer.kulkarni"])
t("view-only CAN read contradictions", st, 200)
conts = json.loads(b) if st == 200 else []
if conts:
    cid = conts[0]["id"]
    st, _ = jreq("POST", f"/api/v1/contradictions/{cid}/confirm", tok["sameer.kulkarni"], {"notes": "x"})
    t("view-only cannot confirm a contradiction", st, 403)
    st, _ = jreq("POST", f"/api/v1/contradictions/{cid}/confirm", tok["ananya.rao"], {"notes": "verified"})
    t("Sub-Inspector CAN confirm a contradiction", st, 200)
else:
    print("  (no contradictions yet to test confirm/dismiss on)")

st, b = jreq("GET", f"/api/v1/timeline?case_id={case_id}", tok["sameer.kulkarni"])
t("view-only CAN read the timeline", st, 200)

# Empty the scratch case so reruns start clean and nothing lingers.
jreq("POST", f"/api/v1/demo/scenario/reset?case_id={case_id}", tok["vikram.nair"])

ok = sum(1 for *_, p in results if p)
print(f"\n{'=' * 70}\n{ok}/{len(results)} evidence-rule checks passed")
for label, a, e, p in results:
    if not p:
        print(f"  FAILED: {label} (got {a}, wanted {e})")
