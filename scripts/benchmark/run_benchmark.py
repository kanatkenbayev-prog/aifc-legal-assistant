#!/usr/bin/env python3
"""
AIFC Legal Benchmark Runner
Usage:
  python3 run_benchmark.py                         # all questions
  python3 run_benchmark.py --domain Companies      # one domain
  python3 run_benchmark.py --difficulty easy       # one difficulty
  python3 run_benchmark.py --ids AIFC-001,COMP-003 # specific IDs
  python3 run_benchmark.py --limit 20              # first N questions
"""

import json, subprocess, sys, time, re, os
from pathlib import Path
from collections import defaultdict
from datetime import datetime

WORKER   = "https://aifc-legal-proxy.aifclegal.workers.dev"
TEST_KEY = "aifc-admin-2026-v2"
TIMEOUT  = 90   # seconds per question (Opus is slow)
BENCH    = Path(__file__).parent / "benchmark_v1.json"
RESULTS  = Path(__file__).parent / "results"

# ── CLI args ─────────────────────────────────────────────────────────────────
import argparse
ap = argparse.ArgumentParser()
ap.add_argument("--domain",     default=None)
ap.add_argument("--difficulty", default=None)
ap.add_argument("--ids",        default=None)
ap.add_argument("--limit",      type=int, default=None)
ap.add_argument("--lang",       default="en", choices=["en","ru"])
args = ap.parse_args()

# ── Load questions ────────────────────────────────────────────────────────────
questions = json.loads(BENCH.read_text())

if args.ids:
    ids = set(args.ids.split(","))
    questions = [q for q in questions if q["id"] in ids]
if args.domain:
    questions = [q for q in questions if q["domain"] == args.domain]
if args.difficulty:
    questions = [q for q in questions if q["difficulty"] == args.difficulty]
if args.limit:
    questions = questions[:args.limit]

# ── Ask AIFCLex ───────────────────────────────────────────────────────────────
def ask(question: str, lang: str = "en") -> str:
    payload = json.dumps({
        "messages": [{"role": "user", "content": question}],
        "area": "Общее",
        "lang": lang,
        "test_key": TEST_KEY,
    })
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{WORKER}/chat",
         "-H", "Content-Type: application/json",
         "-d", payload, "--max-time", str(TIMEOUT)],
        capture_output=True
    )
    raw = r.stdout.decode("utf-8", errors="ignore")
    # Extract token stream → full text
    text = ""
    for line in raw.splitlines():
        try:
            d = json.loads(line)
            if d.get("type") == "token":
                text += d.get("t", "")
        except Exception:
            pass
    return text.strip()

# ── Score: keyword coverage ───────────────────────────────────────────────────
def score_response(response: str, expected_topics: list) -> tuple[int, list, list]:
    """Returns (score_pct, hit_topics, missed_topics)"""
    resp_lower = response.lower()
    hit, miss = [], []
    for topic in expected_topics:
        # Match any word from the topic phrase
        words = [w for w in re.split(r'[\s/]+', topic.lower()) if len(w) > 3]
        if any(w in resp_lower for w in words) or topic.lower() in resp_lower:
            hit.append(topic)
        else:
            miss.append(topic)
    pct = round(len(hit) / len(expected_topics) * 100) if expected_topics else 100
    return pct, hit, miss

# ── Run ───────────────────────────────────────────────────────────────────────
PASS_THRESHOLD = 60   # % topic coverage to count as PASS

GREEN  = "\033[0;32m"
RED    = "\033[0;31m"
YELLOW = "\033[1;33m"
BOLD   = "\033[1m"
NC     = "\033[0m"

print(f"\n{'═'*60}")
print(f"  AIFC Legal Benchmark v1")
print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  {len(questions)} questions  |  lang={args.lang}")
print(f"{'═'*60}\n")

results   = []
by_domain = defaultdict(lambda: {"pass": 0, "fail": 0, "scores": []})
by_diff   = defaultdict(lambda: {"pass": 0, "fail": 0, "scores": []})

for i, q in enumerate(questions, 1):
    qid    = q["id"]
    domain = q["domain"]
    diff   = q["difficulty"]
    print(f"  [{i:>3}/{len(questions)}] {qid} ({domain}, {diff})")

    response = ask(q["question"], args.lang)

    if not response or "error" in response[:50].lower():
        print(f"  {RED}✗ ERROR{NC} — пустой или ошибочный ответ")
        result = {"id": qid, "domain": domain, "difficulty": diff,
                  "score": 0, "pass": False, "error": True,
                  "hit": [], "miss": q["expected_topics"], "response_len": 0}
    else:
        score, hit, miss = score_response(response, q["expected_topics"])
        passed = score >= PASS_THRESHOLD
        symbol = f"{GREEN}✓{NC}" if passed else f"{RED}✗{NC}"
        print(f"  {symbol} {score}% topics covered  "
              f"{'hit: ' + ', '.join(hit) if hit else ''}  "
              f"{'| miss: ' + ', '.join(miss) if miss else ''}")
        result = {"id": qid, "domain": domain, "difficulty": diff,
                  "score": score, "pass": passed, "error": False,
                  "hit": hit, "miss": miss, "response_len": len(response)}

    results.append(result)
    by_domain[domain]["pass" if result["pass"] else "fail"] += 1
    by_domain[domain]["scores"].append(result["score"])
    by_diff[diff]["pass" if result["pass"] else "fail"] += 1
    by_diff[diff]["scores"].append(result["score"])

    time.sleep(1)   # be gentle on the worker

# ── Summary ────────────────────────────────────────────────────────────────────
total   = len(results)
passed  = sum(1 for r in results if r["pass"])
avg     = round(sum(r["score"] for r in results) / total) if total else 0

print(f"\n{'═'*60}")
print(f"  {BOLD}ИТОГ: {passed}/{total} PASS  |  Avg coverage: {avg}%{NC}")
print(f"{'═'*60}")

print(f"\n  {BOLD}По доменам:{NC}")
for domain, stat in sorted(by_domain.items()):
    t = stat["pass"] + stat["fail"]
    a = round(sum(stat["scores"]) / len(stat["scores"]))
    bar = "█" * (a // 10) + "░" * (10 - a // 10)
    color = GREEN if a >= 70 else YELLOW if a >= 50 else RED
    print(f"  {color}{bar}{NC}  {a:>3}%  {stat['pass']}/{t}  {domain}")

print(f"\n  {BOLD}По сложности:{NC}")
for diff in ["easy", "medium", "hard", "expert"]:
    if diff not in by_diff:
        continue
    stat = by_diff[diff]
    t = stat["pass"] + stat["fail"]
    a = round(sum(stat["scores"]) / len(stat["scores"]))
    color = GREEN if a >= 70 else YELLOW if a >= 50 else RED
    print(f"  {color}{a:>3}%{NC}  {stat['pass']}/{t}  {diff}")

# ── Save results ───────────────────────────────────────────────────────────────
RESULTS.mkdir(exist_ok=True)
ts = datetime.now().strftime("%Y%m%d_%H%M")
out = RESULTS / f"run_{ts}.json"
out.write_text(json.dumps({
    "timestamp": ts, "total": total, "passed": passed, "avg_coverage": avg,
    "by_domain": {d: {"pass": s["pass"], "fail": s["fail"],
                       "avg": round(sum(s["scores"])/len(s["scores"]))}
                  for d, s in by_domain.items()},
    "questions": results
}, indent=2, ensure_ascii=False))
print(f"\n  Результаты сохранены: {out}\n")

sys.exit(0 if passed == total else 1)
