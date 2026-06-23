import subprocess, json, re, time, sys
URL="https://aifc-legal-proxy.aifclegal.workers.dev/ingest-text"; S="aifc-rag-2026-v2"

TARGETS = [
 ("dp-regs","AIFC Data Protection Regulations 2017","Защита персональных данных","pdf",
   "https://aifc.kz/wp-content/uploads/2024/06/aifc-data-protection-regulations-2025-1.pdf",
   "https://aifc.kz/legal-framework/aifc-data-protection-regulations/"),
 ("dp-rules","AIFC Data Protection Rules 2018","Защита персональных данных","pdf",
   "https://aifc.kz/wp-content/uploads/2024/06/aifc-data-protection-rules-2025-2.pdf",
   "https://aifc.kz/legal-framework/aifc-data-protection-rules/"),
 ("sec-regs","AIFC Security Regulations 2017","Обеспечение и залог","pdf",
   "https://aifc.kz/files/legals/214/file/7.-aifc-security-regulations-2017_new-design.pdf",
   "https://aifc.kz/legal-framework/aifc-security-regulations/"),
 ("sec-rules","AIFC Security Rules 2018","Обеспечение и залог","html",
   "https://aifc.kz/legal-framework/aifc-security-rules/aifc-security-rules-full-text/",
   "https://aifc.kz/legal-framework/aifc-security-rules/"),
 ("ls-regs","AIFC Legal Services Regulations 2022","Регулирование юридических услуг","html",
   "https://aifc.kz/legal-framework/aifc-legal-services-regulations/aifc-legal-services-regulations-full-text/",
   "https://aifc.kz/legal-framework/aifc-legal-services-regulations/"),
 ("ls-code","AIFC Legal Services Code 2022","Регулирование юридических услуг","html",
   "https://aifc.kz/legal-framework/legal-services-code/legal-services-code-full-text/",
   "https://aifc.kz/legal-framework/legal-services-code/"),
 ("itrp-regs","AIFC Investment Tax Residency Programme Regulations 2022","Налоговое резидентство (ITRP)","pdf",
   "https://aifc.kz/wp-content/uploads/2024/10/aifc-investment-tax-residency-programme-regulations.pdf",
   "https://aifc.kz/legal-framework/guidance-on-the-aifc-investment-tax-residency-programme/"),
]

def fetch_html(u):
    h=subprocess.run(["curl","-s","-A","Mozilla/5.0",u,"-L","--max-time","30"],capture_output=True).stdout.decode("utf-8","ignore")
    h=re.sub(r'<(script|style)[^>]*>.*?</\1>','',h,flags=re.DOTALL)
    t=re.sub(r'<[^>]+>',' ',h); t=re.sub(r'&#8217;|&#039;',"'",t); t=re.sub(r'&[a-z#0-9]+;',' ',t); t=re.sub(r'\s+',' ',t).strip()
    # отрезаем хвостовую навигацию (меню сайта)
    cut=t.find('ABOUT US About us Vision and Mission')
    if cut>500: t=t[:cut]
    return t

def fetch_pdf(u):
    subprocess.run(["curl","-s","-A","Mozilla/5.0",u,"-L","-o","/tmp/_gap.pdf","--max-time","60"],capture_output=True)
    try:
        import pypdf
        return "\n".join(p.extract_text() for p in pypdf.PdfReader("/tmp/_gap.pdf").pages)
    except Exception as e:
        return ""

total_ok=0
for cid,name,cat,typ,src,landing in TARGETS:
    text = fetch_pdf(src) if typ=="pdf" else fetch_html(src)
    text=re.sub(r'\s+',' ',text).strip()
    if len(text)<800:
        print(f"  SKIP {cid}: текст слишком короткий ({len(text)}) — {src}"); continue
    # режем на сегменты ≤38000, чтобы обойти лимит ingestDoc и не потерять текст
    segs=[text[i:i+38000] for i in range(0,len(text),38000)]
    okparts=0
    for n,seg in enumerate(segs):
        d={"key":S,"id":f"{cid}-p{n}","reset":True,
           "act":name+(f" (часть {n+1}/{len(segs)})" if len(segs)>1 else ""),
           "url":landing,"cat":cat,"doc_type":"regulation","rule_number":name,"text":seg}
        out=subprocess.run(["curl","-s","-X","POST",URL,"-H","Content-Type: application/json","-d",json.dumps(d),"--max-time","120"],capture_output=True).stdout.decode()
        try:
            r=json.loads(out)
            if r.get("ok"): okparts+=1
        except: pass
        time.sleep(2)
    print(f"  {'OK' if okparts else 'ERR'} {cid}: {name} | {len(text)} симв → {okparts}/{len(segs)} сегм.")
    if okparts: total_ok+=1
print(f"\nЗалито актов: {total_ok}/{len(TARGETS)}")
