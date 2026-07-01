# -*- coding: utf-8 -*-
"""A/B: Opus 4.8 vs Sonnet 5 — скорость + качество (детерминированные факты, с ретраями)."""
import json, urllib.request, time, statistics

ENDPOINT = "https://aifc-legal-proxy.aifclegal.workers.dev/chat"
KEY = "aifc-admin-2026-v2"
MODELS = {"Opus 4.8": "claude-opus-4-8", "Sonnet 5": "claude-sonnet-5"}

AREA = {"TBL-CAP":"Финансовые услуги","TBL-FEE":"Финансовые услуги","TBL-CIS":"Финансовые услуги",
        "TBL-COB":"Финансовые услуги","TBL-AIX":"Финансовые услуги","TBL-ITRP":"Налоговое право",
        "TBL-IIT":"Налоговое право","TBL-INS":"Финансовые услуги","TBL-CONTROL":"Финансовые услуги",
        "TBL-CAPTIVE":"Финансовые услуги","TBL-EMP":"Трудовое право","TBL-PROP":"Налоговое право","TBL-DIV":"Налоговое право"}
def area_for(fid):
    for k,v in AREA.items():
        if fid.startswith(k): return v
    return "Финансовые услуги"

allf = json.load(open("scripts/benchmark/domains_fact/table_facts.json"))["questions"]
SUBSET = {"TBL-CAP-INV-001","TBL-CAP-BANK-003","TBL-FEE-APP-005","TBL-FEE-SUP-007",
          "TBL-CIS-008","TBL-AIX-012","TBL-ITRP-014","TBL-IIT-016","TBL-CONTROL-021","TBL-DIV-019"}
facts = [f for f in allf if f["id"] in SUBSET]

def norm(s): return " ".join(s.lower().replace(",", " ").split())

def ask(model, q, area):
    payload = {"messages":[{"role":"user","content":q}], "area":area, "lang":"ru", "test_key":KEY, "model":model}
    for attempt in range(5):
        try:
            req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(),
                headers={"Content-Type":"application/json","User-Agent":"curl/8"})
            t0 = time.time(); first = None; text = ""
            for line in urllib.request.urlopen(req, timeout=180):
                try:
                    d = json.loads(line)
                    if d.get("type") == "token":
                        if first is None: first = time.time() - t0
                        text += d.get("t","")
                except: pass
            if len(text) > 200:
                return {"ttft": first or 0, "total": time.time()-t0, "chars": len(text), "text": text}
        except Exception:
            pass
        time.sleep(18)
    return {"ttft":0,"total":0,"chars":0,"text":""}

def grade(item, text):
    low = norm(text)
    exp = any(norm(e) in low for e in item["expected_exact_match"])
    forb = any(norm(f) in low for f in item.get("forbidden_match", []))
    return exp and not forb

results = {m: {"pass":0, "ttft":[], "total":[], "chars":[]} for m in MODELS}
print(f"Прогон {len(facts)} чистых фактов × {len(MODELS)} модели (с ретраями)\n")
for i, item in enumerate(facts, 1):
    area = area_for(item["id"])
    line = f"[{i:2}/{len(facts)}] {item['id']:18}"
    for name, mid in MODELS.items():
        r = ask(mid, item["question"], area)
        ok = grade(item, r["text"]) if r["text"] else False
        results[name]["pass"] += ok
        if r["text"]:
            results[name]["ttft"].append(r["ttft"])
            results[name]["total"].append(r["total"])
            results[name]["chars"].append(r["chars"])
        line += f" | {name}: {'✓' if ok else '✗'} {r['total']:4.1f}s {r['chars']:5}c"
        time.sleep(6)
    print(line, flush=True)

print("\n===== ИТОГ =====")
n = len(facts)
for name in MODELS:
    r = results[name]
    med = lambda a: statistics.median(a) if a else 0
    print(f"{name:10} | факты {r['pass']}/{n} ({100*r['pass']//n}%) "
          f"| TTFT медиана {med(r['ttft']):.1f}s "
          f"| полный медиана {med(r['total']):.1f}s "
          f"| длина медиана {int(med(r['chars']))}c")
