# -*- coding: utf-8 -*-
import json, urllib.request, time, datetime

ENDPOINT = "https://aifc-legal-proxy.aifclegal.workers.dev/chat"
TEST_KEY = "aifc-admin-2026-v2"

Q = [
 ("Налоговое право / Foundations", "CFC + Substance Carve-Out + MLI PPT (2027)",
  "Иностранный HNWI (резидент страны — участницы MLI с активным PPT) учреждает AIFC Foundation + Master-Feeder структуру, где Foundation владеет 100% AIFC CIS (Managing Investments), а доход — преимущественно от AIX-listed securities и дивидендов. Страна founder применяет CFC с substance carve-out (ATAD-style). Foundation имеет 4 квалифицированных сотрудника и офис в МФЦА, но mind & management частично остаётся в стране founder. Применит ли страна founder PPT (Principal Purpose Test) MLI к отказу в льготах DTT? Сохранится ли 0% КПН в РК? Какой тест substance будет решающим? Полные ссылки на MLI, DTT, Substantial Presence Rules 2027 и НК РК."),
 ("Цифровые активы", "Stablecoin Issuance + Systemic Risk + AFSA Intervention",
  "AIFC-licensed DASP выпускает fiat-backed stablecoin на $450 млн, pegged к KZT/USD. В момент стресса (депег на 8%) AFSA инициирует emergency measures и требует принудительного выкупа. Имеет ли AFSA такие полномочия? Каковы права держателей stablecoin? Применяется ли режим «too big to fail» или systemic importance? Возможен ли bail-in? Ссылки на DAA Rules, FSMR, Prudential Rules и Constitutional Statute."),
 ("Разрешение споров", "AIFC Court Judgment vs Государство РК (Sovereign Immunity)",
  "AIFC Court присудил участнику МФЦА $85 млн по инвестиционному контракту с госорганом РК. Государство ссылается на sovereign immunity и отказывается исполнять. Можно ли принудительно исполнить решение против государственного имущества в РК? Применяется ли AIFC Court к спорам с государством? Возможен ли параллельный ICSID / UNCITRAL арбитраж? Ссылки на Constitutional Statute, AIFC Court Regulations и практику."),
 ("Трудовое право", "Non-Compete + Garden Leave + Reputational Damage Claim",
  "Ключевой сотрудник (ex-Head of Trading) после 9-месячного garden leave начинает работать у прямого конкурента и публично критикует бывшего работодателя. Работодатель требует $3,5 млн (reputational damages + liquidated damages). Насколько enforceable non-compete + non-disparagement clause в AIFC Court? Судебная практика по restraint of trade + defamation в 2026 году."),
 ("Корпоративное право / Insolvency", "Strike Off + Asset Tracing + Bona Vacantia vs Creditors",
  "AFSA применила compulsory Strike Off. В течение 14 месяцев после исключения компания восстановлена. Часть активов (в т.ч. крипто на $42 млн) была передана как bona vacantia и продана третьим лицам. Могут ли акционеры/кредиторы истребовать активы обратно? Какой приоритет у требований? Ссылки на Companies Regulations Part 16 и Insolvency Rules."),
 ("Налоговое право", "Tax Residency Certificate + Aggressive Tax Authority Challenge (2027)",
  "Участник ITRP ($60k) получает Tax Residency Certificate РК. Налоговая служба страны происхождения (DTT с РК) проводит агрессивную проверку и отказывается признавать резидентство РК, применяя GAAR + CFC. Может ли участник успешно защитить статус в Mutual Agreement Procedure (MAP)? Какую роль играет AIFC Investment Tax Residency Programme в MAP? Риски двойного налогообложения."),
 ("Финансовые услуги", "CIS + Forced Redemption + Investor Protection",
  "AIFC Non-Exempt CIS в условиях рыночного стресса объявляет forced redemption units по цене на 35% ниже NAV. Инвесторы (в т.ч. иностранные HNWI) оспаривают действия в AIFC Court. Какие права инвесторов по CIS Rules? Может ли Fund Manager быть привлечён к ответственности? Ссылки на CIS Rules, COB Rules и практику AIFC Court."),
 ("Разрешение споров", "Parallel Proceedings: AIFC Court + Foreign Court + ICSID",
  "Государственный орган РК расторгает Investment Contract и инициирует иск в суде РК. Участник МФЦА подаёт в AIFC Court и одновременно начинает ICSID арбитраж. Возможны ли три параллельных производства? Какой приоритет? Может ли AIFC Court приостановить производство в суде РК?"),
 ("AML/KYC", "AML/CTF + Sanctions Evasion Scheme Detection",
  "AIFC DASP фиксирует сложную цепочку транзакций на $280 млн с признаками sanctions evasion через российские и иранские юрлица с использованием AIFC-структур. MLRO не подаёт SAR/STR в течение 7 дней. Какие последствия для фирмы и лично для MLRO? Возможен ли criminal liability? Ссылки на AML/CTF Rules 2026 и международные санкционные режимы."),
 ("Foundations / Наследство", "Foundation + Divorce + Forced Heirship Multi-Jurisdictional Attack",
  "Founder (резидент ОАЭ) создаёт AIFC Foundation на $180 млн. После развода бывшая супруга (резидент страны с forced heirship) оспаривает структуру одновременно в суде ОАЭ, Англии и РК. Какое право применит каждый суд? Насколько сильна защита AIFC Foundations Regulations? Возможен ли piercing the corporate veil?"),
 ("Финансовые услуги / M&A", "Change of Control + Prudential + Systemic Risk Buffer (2027)",
  "Китайский sovereign wealth fund приобретает 81% в крупном AIFC Authorised Firm (системно значимом). AFSA вводит дополнительный Systemic Risk Buffer. Насколько это законно? Можно ли оспорить в AIFC Court? Какие дополнительные capital и reporting requirements?"),
 ("Корпоративное право / Insolvency", "Insolvency Recognition + COMI Dispute",
  "AIFC Company инициирует winding-up в AIFC Court. Основные активы и кредиторы — в Сингапуре и Гонконге. Иностранные суды отказываются признавать COMI (Centre of Main Interests) в AIFC. Как обеспечить cross-border recognition? Применяется ли UNCITRAL Model Law в AIFC? Ссылки на Insolvency Rules и судебную практику."),
 ("Налоговое право", "Tax Stability Clause + Material Adverse Change",
  "Investment Contract с Правительством РК содержит tax stability clause до 2045 года. В 2027 году принимается новый НК РК, существенно ухудшающий положение. Можно ли оспорить изменения в AIFC Court? Какой приоритет у Constitutional Statute ст. 6 vs новый НК?"),
 ("Цифровые активы", "Digital Asset Custody Breach + Class Action",
  "AIFC Custodian теряет доступ к приватным ключам клиентов на $620 млн (хакерская атака). Клиенты подают коллективный иск в AIFC Court. Какова ответственность Custodian по DAA Rules? Применяется ли limitation of liability? Возможен ли regulatory capital call?"),
 ("Разрешение споров", "Ultimate Hybrid Dispute — AIFC Court vs RK Constitutional Court vs Foreign Sanctions",
  "AFSA и КГД одновременно применяют санкции к участнику МФЦА по запросу иностранного государства (вторичные санкции). Участник оспаривает действия в AIFC Court, суде РК и международном арбитраже. Какой суд/форум имеет приоритет? Возможен ли judicial review действий AFSA/КГД по мотивам международных санкций?"),
]

def ask(area, q):
    payload = {"messages":[{"role":"user","content":q}], "area":area, "lang":"ru", "test_key":TEST_KEY}
    for attempt in range(8):
        try:
            req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(),
                headers={"Content-Type":"application/json","User-Agent":"curl/8"})
            text=""; srcs=[]
            for line in urllib.request.urlopen(req, timeout=200):
                try:
                    d=json.loads(line)
                    if d.get("type")=="token": text+=d.get("t","")
                    if d.get("type")=="meta":
                        srcs=[s.get("act","") for s in d.get("ragSources",[])]
                except: pass
            if text and len(text)>500: return text, srcs
        except Exception as e:
            time.sleep(12)
    return "[ОШИБКА: пустой ответ после ретраев]", []

out = []
out.append(f"# AIFCLex — прогон 15 ультра-жёстких вопросов (36–50)\n")
out.append(f"_Сгенерировано: {datetime.datetime.now():%Y-%m-%d %H:%M} · модель: Claude Opus 4.8 · RAG (акты AIFC + судебная практика) · обход кэша._\n")
out.append("> Уровень Senior International Counsel. Ответы носят информационно-справочный характер. Цель файла — внешняя проверка точности (Grok).\n")
for i,(area,title,q) in enumerate(Q,36):
    print(f"[{i}/50] {title} …", flush=True)
    ans, srcs = ask(area, q)
    out.append(f"\n---\n\n## Вопрос {i}. {title}\n")
    out.append(f"**Область:** {area}\n")
    out.append(f"**Запрос:** {q}\n")
    out.append(f"\n**Ответ AIFCLex:**\n\n{ans}\n")
    if srcs:
        out.append(f"\n**Источники RAG (retrieved):** " + "; ".join(dict.fromkeys(s[:70] for s in srcs)) + "\n")
    time.sleep(5)

path = "/Users/kanat_kenbayev/Desktop/AIFCLex-15-вопросов-36-50-ответы.md"
open(path,"w",encoding="utf-8").write("\n".join(out))
print("ГОТОВО →", path)
