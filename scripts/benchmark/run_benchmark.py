#!/usr/bin/env python3
"""
AIFC Legal Benchmark Runner
Supports two question formats:
  - ChatGPT: {question, expected_topics}
  - Gemini:  {scenario, test_intent}

Usage:
  python3 run_benchmark.py                          # all questions from domains/
  python3 run_benchmark.py --domain tax             # one domain file
  python3 run_benchmark.py --difficulty hard        # filter by difficulty
  python3 run_benchmark.py --ids TAX-001,COMP-003  # specific IDs
  python3 run_benchmark.py --limit 20              # first N questions
  python3 run_benchmark.py --lang ru               # Russian language
"""

import json, subprocess, sys, time, re, argparse
from pathlib import Path
from collections import defaultdict
from datetime import datetime

WORKER   = "https://aifc-legal-proxy.aifclegal.workers.dev"
TEST_KEY = "aifc-admin-2026-v2"
TIMEOUT  = 90
BASE     = Path(__file__).parent
DOMAINS  = BASE / "domains"
RESULTS  = BASE / "results"
PASS_THRESHOLD = 60

GREEN  = "\033[0;32m"
RED    = "\033[0;31m"
YELLOW = "\033[1;33m"
BOLD   = "\033[1m"
NC     = "\033[0m"

# ── CLI ───────────────────────────────────────────────────────────────────────
ap = argparse.ArgumentParser()
ap.add_argument("--domain",     default=None, help="domain slug, e.g. tax")
ap.add_argument("--difficulty", default=None, choices=["easy","medium","hard","expert"])
ap.add_argument("--ids",        default=None, help="comma-separated IDs")
ap.add_argument("--limit",      type=int,     default=None)
ap.add_argument("--lang",       default="en", choices=["en","ru"])
args = ap.parse_args()

# ── Load questions from domains/ ──────────────────────────────────────────────
def load_domains() -> list:
    questions = []
    files = sorted(DOMAINS.glob("*.json")) if DOMAINS.exists() else []
    # also load legacy benchmark_v1.json
    legacy = BASE / "benchmark_v1.json"
    if legacy.exists():
        files = [legacy] + list(files)

    for f in files:
        data = json.loads(f.read_text())
        # Gemini format: {domain, questions: [{id, scenario, test_intent, ...}]}
        if isinstance(data, dict) and "questions" in data:
            domain_name = data.get("domain", f.stem)
            for q in data["questions"]:
                q.setdefault("domain", domain_name)
                questions.append(normalise(q))
        # ChatGPT format: [{id, domain, question, expected_topics, ...}]
        elif isinstance(data, list):
            for q in data:
                questions.append(normalise(q))
    return questions

def normalise(q: dict) -> dict:
    """Unified format: id, domain, difficulty, question, expected_topics, test_intent"""
    # Gemini uses 'scenario' as the question
    if "scenario" in q and "question" not in q:
        q["question"] = q["scenario"]
    # Extract scoring keywords from test_intent
    if "test_intent" in q and not q.get("expected_topics"):
        q["expected_topics"] = extract_keywords(q["test_intent"])
    q.setdefault("expected_topics", [])
    q.setdefault("difficulty", "medium")
    q.setdefault("test_intent", "")
    return q

def extract_keywords(intent: str) -> list:
    """Pull meaningful keywords from test_intent for scoring."""
    # Look for quoted terms, rule references, and key phrases
    quoted   = re.findall(r'«([^»]+)»|"([^"]+)"', intent)
    rules    = re.findall(r'(?:Schedule|Rule|Regulation|Section|ст\.)\s*[\d\.]+', intent, re.I)
    # Key legal terms
    terms_re = r'\b(?:Permission Schedule|FSMR|Substance|CIGA|ТК РК|Employment Regulations|' \
               r'Solvency Test|АО|ТОО|Articles|НДС|КПН|WHT|UBO|AML|MLRO|CIS Rules|' \
               r'Предохранитель|отказ|категорически|запрет|ничтожн|обязан)\b'
    key_terms = re.findall(terms_re, intent, re.I)
    flat = [t for pair in quoted for t in pair if t] + rules + key_terms
    return list(dict.fromkeys(flat))[:6]  # max 6 unique keywords

# ── Filter ────────────────────────────────────────────────────────────────────
questions = load_domains()
if args.ids:
    ids = set(args.ids.split(","))
    questions = [q for q in questions if q.get("id") in ids]
if args.domain:
    questions = [q for q in questions if args.domain.lower() in q.get("domain","").lower()]
if args.difficulty:
    questions = [q for q in questions if q.get("difficulty") == args.difficulty]
if args.limit:
    questions = questions[:args.limit]

if not questions:
    print("No questions matched filters.")
    sys.exit(0)

# ── Ask AIFCLex ───────────────────────────────────────────────────────────────
def ask(question: str, lang: str = "en") -> tuple:
    """Returns (text, error_msg)"""
    payload = json.dumps({
        "messages": [{"role": "user", "content": question}],
        "area": "Общее", "lang": lang, "test_key": TEST_KEY,
    })
    r = subprocess.run(
        ["curl","-s","-X","POST",f"{WORKER}/chat",
         "-H","Content-Type: application/json","-d",payload,"--max-time",str(TIMEOUT)],
        capture_output=True)
    text = ""
    error_msg = ""
    for line in r.stdout.decode("utf-8", errors="ignore").splitlines():
        try:
            d = json.loads(line)
            if d.get("type") == "token":
                text += d.get("t","")
            elif d.get("type") == "error":
                error_msg = d.get("message", str(d))
        except Exception:
            pass
    if not text and not error_msg and r.returncode != 0:
        error_msg = f"curl exit {r.returncode}"
    return text.strip(), error_msg

# ── Score ─────────────────────────────────────────────────────────────────────
def score(response: str, topics: list) -> tuple:
    if not topics:
        # No topics = check response is non-empty and not an error
        ok = len(response) > 100 and "error" not in response[:50].lower()
        return (100 if ok else 0), [], []
    low = response.lower()
    hit, miss = [], []
    for t in topics:
        words = [w for w in re.split(r'[\s/]+', t.lower()) if len(w) > 2]
        if t.lower() in low or any(w in low for w in words):
            hit.append(t)
        else:
            miss.append(t)
    pct = round(len(hit)/len(topics)*100)
    return pct, hit, miss

# ── Run ───────────────────────────────────────────────────────────────────────
print(f"\n{'═'*62}")
print(f"  AIFC Legal Benchmark v1")
print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  {len(questions)} вопросов  |  lang={args.lang}")
print(f"{'═'*62}\n")

results   = []
by_domain = defaultdict(lambda: {"pass":0,"fail":0,"scores":[]})
by_diff   = defaultdict(lambda: {"pass":0,"fail":0,"scores":[]})

for i, q in enumerate(questions, 1):
    qid    = q.get("id","?")
    domain = q.get("domain","?")
    diff   = q.get("difficulty","?")
    intent = q.get("test_intent","")

    print(f"  [{i:>3}/{len(questions)}] {qid}  ({domain}, {diff})")
    if intent:
        print(f"         {YELLOW}↳ {intent[:90]}{'…' if len(intent)>90 else ''}{NC}")

    response, err = ask(q["question"], args.lang)

    if not response:
        msg = err[:80] if err else "пустой ответ"
        print(f"         {RED}✗ ERROR — {msg}{NC}")
        rec = {"id":qid,"domain":domain,"difficulty":diff,"score":0,
               "pass":False,"error":True,"error_msg":msg,"hit":[],"miss":q["expected_topics"]}
    else:
        pct, hit, miss = score(response, q["expected_topics"])
        passed = pct >= PASS_THRESHOLD
        sym    = f"{GREEN}✓{NC}" if passed else f"{RED}✗{NC}"
        detail = f"hit: {', '.join(hit)}" if hit else ""
        if miss: detail += f"  | miss: {', '.join(miss)}"
        print(f"         {sym} {pct}% coverage  {detail}")
        rec = {"id":qid,"domain":domain,"difficulty":diff,"score":pct,
               "pass":passed,"error":False,"hit":hit,"miss":miss,
               "response_len":len(response)}

    results.append(rec)
    by_domain[domain]["pass" if rec["pass"] else "fail"] += 1
    by_domain[domain]["scores"].append(rec["score"])
    by_diff[diff]["pass" if rec["pass"] else "fail"] += 1
    by_diff[diff]["scores"].append(rec["score"])
    time.sleep(5)  # Opus 4.8 rate limit: ~12 rpm

# ── Summary ───────────────────────────────────────────────────────────────────
total  = len(results)
passed = sum(1 for r in results if r["pass"])
avg    = round(sum(r["score"] for r in results)/total) if total else 0

print(f"\n{'═'*62}")
print(f"  {BOLD}ИТОГ: {passed}/{total} PASS  |  Avg coverage: {avg}%{NC}")
print(f"{'═'*62}")

print(f"\n  {BOLD}По доменам:{NC}")
for domain, s in sorted(by_domain.items()):
    t = s["pass"]+s["fail"]
    a = round(sum(s["scores"])/len(s["scores"]))
    bar   = "█"*(a//10) + "░"*(10-a//10)
    color = GREEN if a>=70 else YELLOW if a>=50 else RED
    print(f"  {color}{bar}{NC}  {a:>3}%  {s['pass']}/{t}  {domain}")

print(f"\n  {BOLD}По сложности:{NC}")
for diff in ["easy","medium","hard","expert"]:
    if diff not in by_diff: continue
    s = by_diff[diff]
    t = s["pass"]+s["fail"]
    a = round(sum(s["scores"])/len(s["scores"]))
    color = GREEN if a>=70 else YELLOW if a>=50 else RED
    print(f"  {color}{a:>3}%{NC}  {s['pass']}/{t}  {diff}")

RESULTS.mkdir(exist_ok=True)
ts  = datetime.now().strftime("%Y%m%d_%H%M")
out = RESULTS / f"run_{ts}.json"
out.write_text(json.dumps({
    "timestamp":ts,"total":total,"passed":passed,"avg_coverage":avg,
    "by_domain":{d:{"pass":s["pass"],"fail":s["fail"],
                    "avg":round(sum(s["scores"])/len(s["scores"]))}
                 for d,s in by_domain.items()},
    "questions":results
}, indent=2, ensure_ascii=False))
print(f"\n  Результаты: {out}\n")
sys.exit(0 if passed==total else 1)
