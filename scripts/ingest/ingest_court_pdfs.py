import subprocess, re, json, time, os, pypdf

INGEST_URL = "https://aifc-legal-proxy.aifclegal.workers.dev/ingest-text"
SECRET = "aifc-rag-2026-v2"
SLUGS = ["case-no-12-of-2025","case-no-15-of-2026","case-no-16-of-2026",
"case-no-17-of-2026","case-no-2-40-and-18-of-2023","case-no-2-of-2026",
"case-no-20-and-24-of-2025-3","case-no-28-of-2024-3","case-no-4-of-2026",
"case-no-42-of-2025","case-no-45-of-2025","case-no-66-of-2025","case-no-75-of-2025"]

def sh(args): return subprocess.run(args, capture_output=True).stdout

def page_info(slug):
    h = sh(["curl","-s","-A","Mozilla/5.0",f"https://court.aifc.kz/judgments/{slug}/","-L","--max-time","30"]).decode("utf-8","ignore")
    pdfs = re.findall(r'href=["\']([^"\']+\.pdf)["\']', h, re.I)
    eng = [p for p in pdfs if 'eng' in p.lower()] or pdfs
    t = re.sub(r'<[^>]+>',' ', re.sub(r'<(script|style)[^>]*>.*?</\1>','',h,flags=re.DOTALL))
    t = re.sub(r'&[a-z#0-9]+;',' ',t); t=re.sub(r'\s+',' ',t).strip()
    case_no=(re.search(r'CASE No:\s*([A-Z0-9\-/]+)',t) or [None,""])[1]
    date=(re.search(r'\b(\d{2}\.\d{2}\.\d{4})\b',t) or [None,""])[1]
    title=re.search(r'Judgments\s*/\s*(.*?)\s*CASE No',t)
    parties=title.group(1).strip() if title else ""
    return (eng[0] if eng else None), case_no, date, parties

def pdf_text(url):
    fn=f"/tmp/jx_{abs(hash(url))}.pdf"
    sh(["curl","-s","-A","Mozilla/5.0",url,"-L","-o",fn,"--max-time","60"])
    if not os.path.exists(fn) or os.path.getsize(fn)<2000: return ""
    try:
        r=pypdf.PdfReader(fn)
        t="\n".join(p.extract_text() for p in r.pages)
    except Exception as e:
        return ""
    finally:
        try: os.remove(fn)
        except: pass
    return re.sub(r'\n{3,}','\n\n', re.sub(r'[ \t]+',' ',t)).strip()

ok=0; total_chunks=0
for slug in SLUGS:
    pdf_url, case_no, date, parties = page_info(slug)
    if not pdf_url:
        print(f"  SKIP {slug}: no PDF link"); continue
    if pdf_url.startswith('/'): pdf_url="https://court.aifc.kz"+pdf_url
    txt = pdf_text(pdf_url)
    if len(txt) < 300:
        print(f"  SKIP {slug}: text too short ({len(txt)})"); continue
    header=f"AIFC COURT JUDGMENT\nCase No: {case_no}\nDate: {date}\nParties: {parties}\nSource: {pdf_url}\n\n"
    payload=json.dumps({"key":SECRET,"id":f"court-{slug}",
        "act":f"AIFC Court Judgment — {case_no or slug} ({parties[:55]})",
        "url":f"https://court.aifc.kz/judgments/{slug}/","cat":"Судебные споры",
        "doc_type":"judgment","rule_number":case_no,"text":header+txt})
    out=sh(["curl","-s","-X","POST",INGEST_URL,"-H","Content-Type: application/json","-d",payload,"--max-time","90"]).decode()
    try:
        res=json.loads(out)
        if res.get('ok'):
            ok+=1; total_chunks+=res.get('upserted',0)
            print(f"  OK  {case_no:24} chunks={res.get('chunks'):2} | {parties[:50]}")
        else:
            print(f"  ERR {slug}: {out[:120]}")
    except Exception:
        print(f"  ERR {slug}: {out[:120]}")
    time.sleep(3)
print(f"\nЗалито дел: {ok}, всего векторов: {total_chunks}")
