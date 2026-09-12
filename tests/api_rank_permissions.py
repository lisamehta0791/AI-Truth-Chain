"""Exercises the rank/role/view-only rules against the live API."""
import json
import time

UNIQ = str(int(time.time()))  # unique per run: the duplicate-badge guard is itself under test
import urllib.error
import urllib.request

import os
B = os.environ.get("API_URL", "http://127.0.0.1:8000")
DOMAIN = "demo.chainoftruth.example"
PW = "DemoPass!2026"


def req(method, path, tok=None, body=None):
    r = urllib.request.Request(B + path, method=method)
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, data, timeout=60) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:  # noqa: BLE001
        return "ERR", str(e)


def login(local):
    st, b = req("POST", "/api/v1/auth/login", body={"email": f"{local}@{DOMAIN}", "password": PW})
    assert st == 200, f"login {local} -> {st} {b[:200]}"
    return json.loads(b)["access_token"]


toks = {n: login(n) for n in
        ["arjun.pillai", "ananya.rao", "lisa.mathew", "vikram.nair", "rajesh.menon", "sameer.kulkarni"]}
print("all logins OK\n")

passed = failed = 0


def check(label, actual, expected):
    global passed, failed
    ok = actual == expected
    globals()['passed' if ok else 'failed'] = (passed + 1) if ok else (failed + 1)
    if ok:
        passed_local = True
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: got {actual}, expected {expected}")
    return ok


results = []


def t(label, actual, expected):
    results.append((label, actual, expected, actual == expected))
    print(f"  {'PASS' if actual == expected else 'FAIL'}  {label:<62} got={actual} want={expected}")


print("--- who can provision accounts (GET /users/ranks returns creatable ranks) ---")
for who in ["arjun.pillai", "ananya.rao", "lisa.mathew", "vikram.nair", "rajesh.menon"]:
    st, b = req("GET", "/api/v1/users/ranks", toks[who])
    n = len(json.loads(b)) if st == 200 else -1
    print(f"     {who:<16} -> {n} creatable ranks")

t("Constable cannot provision (0 ranks)", len(json.loads(req('GET', '/api/v1/users/ranks', toks['arjun.pillai'])[1])), 0)
t("Inspector cannot provision (below DSP)", len(json.loads(req('GET', '/api/v1/users/ranks', toks['lisa.mathew'])[1])), 0)
t("SP can provision ranks below SP (6)", len(json.loads(req('GET', '/api/v1/users/ranks', toks['vikram.nair'])[1])), 6)
t("Commissioner can provision below CP (9)", len(json.loads(req('GET', '/api/v1/users/ranks', toks['rajesh.menon'])[1])), 9)

print("\n--- privilege escalation attempts ---")
esc = {"full_name": "Escalation Test", "badge_number": f"ESC-{UNIQ}-1", "email": f"esc1-{UNIQ}@{DOMAIN}",
       "password": "TempPass!2026", "role": "supervisor", "rank": "director_general"}
t("SP creating a DGP is refused", req("POST", "/api/v1/users", toks["vikram.nair"], esc)[0], 403)

esc2 = dict(esc, email=f"esc2-{UNIQ}@{DOMAIN}", badge_number=f"ESC-{UNIQ}-2", rank="superintendent")
t("SP creating an equal-rank SP is refused", req("POST", "/api/v1/users", toks["vikram.nair"], esc2)[0], 403)

esc3 = dict(esc, email=f"esc3-{UNIQ}@{DOMAIN}", badge_number=f"ESC-{UNIQ}-3", rank="constable")
t("Constable creating a Constable is refused", req("POST", "/api/v1/users", toks["arjun.pillai"], esc3)[0], 403)

esc4 = dict(esc, email=f"esc4-{UNIQ}@{DOMAIN}", badge_number=f"ESC-{UNIQ}-4", rank="inspector")
t("View-only SP (prosecutor) cannot provision", req("POST", "/api/v1/users", toks["sameer.kulkarni"], esc4)[0], 403)

print("\n--- legitimate provisioning ---")
good = {"full_name": "Sub-Inspector Test Officer", "badge_number": f"SI-{UNIQ}", "email": f"si{UNIQ}@{DOMAIN}",
        "password": "TempPass!2026", "role": "investigating_officer", "rank": "sub_inspector",
        "station": "Riverside Police Station"}
st, b = req("POST", "/api/v1/users", toks["vikram.nair"], good)
t("SP creating an SI succeeds", st, 201)
if st == 201:
    created = json.loads(b)
    t("  created account records its creator", created["created_by_id"] is not None, True)
    t("  new officer can log in", req("POST", "/api/v1/auth/login",
      body={"email": good["email"], "password": good["password"]})[0], 200)
    st2, _ = req("POST", f"/api/v1/users/{created['id']}/deactivate", toks["vikram.nair"])
    t("  SP can deactivate the junior officer", st2, 204 if st2 == 204 else 200)

print("\n--- duplicate guard ---")
t("duplicate badge number refused", req("POST", "/api/v1/users", toks["rajesh.menon"],
  dict(good, email=f"other@{DOMAIN}"))[0], 400)

print("\n--- personnel directory visibility ---")
st, b = req("GET", "/api/v1/users", toks["arjun.pillai"])
t("Constable sees only themselves", len(json.loads(b)) if st == 200 else -1, 1)
st, b = req("GET", "/api/v1/users", toks["rajesh.menon"])
t("Commissioner sees full roster (>=7)", len(json.loads(b)) >= 7 if st == 200 else False, True)

print("\n--- rank metadata exposed to the UI ---")
st, b = req("GET", "/api/v1/users/me", toks["rajesh.menon"])
me = json.loads(b)
t("me.rank_abbreviation == CP", me.get("rank_abbreviation"), "CP")
t("me.seniority is numeric", isinstance(me.get("seniority"), int), True)
st, b = req("GET", "/api/v1/users/me", toks["sameer.kulkarni"])
t("prosecutor flagged view-only", json.loads(b).get("is_view_only"), True)

ok = sum(1 for *_, p in results if p)
print(f"\n{'=' * 70}\n{ok}/{len(results)} rank checks passed")
for label, a, e, p in results:
    if not p:
        print(f"  FAILED: {label} (got {a}, wanted {e})")
