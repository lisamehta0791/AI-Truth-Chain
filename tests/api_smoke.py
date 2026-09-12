import json, urllib.request, urllib.error
import os
B = os.environ.get("API_URL", "http://127.0.0.1:8000")
def req(method,path,tok=None,body=None):
    r=urllib.request.Request(B+path,method=method)
    if tok: r.add_header("Authorization","Bearer "+tok)
    data=None
    if body is not None:
        data=json.dumps(body).encode(); r.add_header("Content-Type","application/json")
    try:
        with urllib.request.urlopen(r,data,timeout=60) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return "ERR", str(e)[:200]

st,b=req("POST","/api/v1/auth/login",body={"email":"vikram.nair@demo.chainoftruth.example","password":"DemoPass!2026"})
tok=json.loads(b)["access_token"] if st==200 else None
print("login supervisor:",st)
st, b = req("GET", "/api/v1/cases", tok)
cases = json.loads(b)
CASE = cases[0]["id"]  # discovered, never hardcoded: ids change on every reseed
OTHER = cases[1]["id"] if len(cases) > 1 else CASE
print("case:", CASE)
gets=[
 "/api/v1/users/me","/api/v1/users","/api/v1/cases",f"/api/v1/cases/{CASE}",
 f"/api/v1/evidence?case_id={CASE}", f"/api/v1/evidence/case/{CASE}/chain-integrity",
 f"/api/v1/timeline?case_id={CASE}", f"/api/v1/contradictions?case_id={CASE}",
 f"/api/v1/guidance?case_id={CASE}", f"/api/v1/audit?case_id={CASE}",
 f"/api/v1/location?case_id={CASE}", f"/api/v1/autopsy?case_id={CASE}",
 f"/api/v1/chargesheet?case_id={CASE}", f"/api/v1/graph?case_id={CASE}",
 f"/api/v1/closure-score?case_id={CASE}", f"/api/v1/case-similarity?case_id={CASE}",
 f"/api/v1/case-similarity/compare?case_id={CASE}&other_id={OTHER}",
 f"/api/v1/ledger?case_id={CASE}&recompute_files=false", f"/api/v1/demo/scenario?case_id={CASE}",
 "/api/v1/copilot/suggestions",
 "/api/v1/sync/status?device_id=smoke-test-device",
]
fails=[]
for g in gets:
    st,b=req("GET",g,tok)
    flag="" if st in (200,201) else "   <<<<<<"
    print(f"{st}  GET {g}{flag}")
    if st not in (200,201): fails.append((g,st,b))
print("\n--- FAILURES ---")
for g,st,b in fails: print(g,st,b)
