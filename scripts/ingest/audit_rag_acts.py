import subprocess, json, re, time, urllib.parse
BASE="https://aifc-legal-proxy.aifclegal.workers.dev/admin/rag-probe?key=aifc-admin-2026-v2&q="
# Список актов из ACTS воркера
c=open('worker/index.js').read()
m=re.search(r'const ACTS = \[(.*?)\n\];', c, re.DOTALL)
acts=[(n,cat) for n,u,cat in re.findall(r"\['([^']+)','([^']+)','([^']+)'\]", m.group(1))]
# + новые залитые пробелы
gaps=[("AIFC Data Protection Regulations 2017","Защита ПД"),("AIFC Data Protection Rules 2018","Защита ПД"),
("AIFC Security Regulations 2017","Залог"),("AIFC Security Rules 2018","Залог"),
("AIFC Legal Services Regulations 2022","Юр.услуги"),("AIFC Legal Services Code 2022","Юр.услуги"),
("AIFC Investment Tax Residency Programme Regulations 2022","ITRP")]
allacts=acts+gaps

def norm(s): return re.sub(r'[^a-zа-я0-9]','',s.lower())
def core(name):  # ключевые слова имени акта для сопоставления
    return norm(re.sub(r'\b(AIFC|Rules|Regulations|on|and|the|of|for)\b','',name))

present=[]; missing=[]
for name,cat in allacts:
    q=urllib.parse.quote(f"{name} — что регулирует этот акт?")
    out=subprocess.run(["curl","-s",BASE+q,"--max-time","60"],capture_output=True).stdout.decode()
    try: srcs=[s['act'] for s in json.loads(out).get('sources',[])]
    except: srcs=[]
    cn=core(name)
    # совпадение если ядро имени акта пересекается с именем источника
    hit=any(cn[:12] in norm(s) or norm(s)[:12] in cn or core(s)==cn for s in srcs if s)
    # более мягкая проверка по значимым словам
    if not hit:
        words=[w for w in re.findall(r'[A-Za-z]{5,}', name) if w.lower() not in ('rules','aifc','regulations')]
        hit=any(all(w.lower() in s.lower() for w in words[:2]) for s in srcs if s and words)
    (present if hit else missing).append((name,cat,srcs[:2]))
    time.sleep(0.6)

print(f"=== АУДИТ RAG: {len(present)}/{len(allacts)} актов находят свой контент ===\n")
if missing:
    print(f"⚠ НЕ НАЙДЕНЫ / слабо ({len(missing)}):")
    for name,cat,srcs in missing:
        print(f"  ✗ {name}  [{cat}]  → top: {srcs}")
else:
    print("✓ Все акты присутствуют.")
