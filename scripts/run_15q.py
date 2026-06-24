# -*- coding: utf-8 -*-
import json, urllib.request, time, datetime

ENDPOINT = "https://aifc-legal-proxy.aifclegal.workers.dev/chat"
TEST_KEY = "aifc-admin-2026-v2"  # обход кэша → свежий RAG, полный ответ

Q = [
 ("Налоговое право / Foundations", "CFC + AIFC Foundation",
  "Иностранный HNWI — налоговый резидент страны с активными правилами CFC (например, Россия или ЕС) — учреждает AIFC Foundation, которая владеет 100% AIFC Private Company (Managing Investments). Foundation получает значительные дивиденды и capital gains от AIX-listed securities. Применяются ли CFC-правила страны founder к нераспределённому доходу Foundation в 2026 году? Какой налоговый статус самой Foundation в РК? Как структурировать распределения, чтобы минимизировать CFC-начисления? Точные ссылки на НК РК 2026, AIFC Foundations Regulations, Substantial Presence Rules и типичные DTT."),
 ("Digital Assets / Налоги", "Digital Asset + VAT + Travel Rule",
  "AIFC-licensed DASP проводит обмен USDT на KZT на сумму $4,2 млн в одной транзакции. Применяется ли освобождение от НДС (0%)? Какие требования Travel Rule и thresholds для mandatory reporting в 2026 году? Каковы penalties за нарушение AML/CTF и налогового режима? Ссылки на DAA Rules, AML/CTF Rules (2026), List of Financial Services Exempt from CIT/VAT и НК РК."),
 ("Финансовые услуги / M&A", "Change of Control + Prudential Capital",
  "Фонд из ОАЭ приобретает 72% акций AIFC Authorised Firm (Class B, Dealing & Advising). Сделка $180 млн. Какие дополнительные prudential capital requirements возникают после change of control? Требуется ли повторная оценка Approved Individuals? Срок рассмотрения AFSA и последствия закрытия сделки без одобрения. Ссылки на FSMR, GEN Rules, PINS 2026 и section 48 Framework Regulations."),
 ("Разрешение споров", "Enforcement AIFC Court Judgment против КГД",
  "AIFC Court присудил AIFC Participant $27 млн с другого участника. Параллельно КГД доначислил этому же участнику $27 млн налогов. Как обеспечить принудительное исполнение решения AIFC Court в РК? Возможно ли приостановление исполнительного производства КГД? Ссылки на AIFC Court Regulations, Constitutional Statute № 438-V и практику исполнения."),
 ("Трудовое право", "Garden Leave + Non-Compete + Liquidated Damages",
  "Руководитель инвестиционного департамента (стаж 4 года) увольняется по собственному желанию. Работодатель требует 9 месяцев garden leave и 18-месячный non-compete по всему ЕАЭС + СНГ с liquidated damages $1,2 млн. Насколько это enforceable по AIFC Employment Regulations 2017/2026? Требуется ли компенсация? Судебная практика AIFC Court."),
 ("Налоговое право", "Pure Equity Holding — Substance Test 2026",
  "AIFC Company является чистым холдингом (Pure Equity Holding), владеет пакетами акций в 8 дочерних компаниях и не оказывает услуг третьим лицам. Достаточно ли substance в виде одного директора + виртуального офиса для сохранения 0% CIT? Какие именно CIGA и Operating Expenditure требования применяются в 2026 году? Ссылки на Substantial Presence Rules (Appendix) и Joint Orders с КГД."),
 ("Корпоративное право", "Cross-Border Insolvency + Recognition",
  "AIFC Private Company (активы $95 млн, долги $140 млн) инициирует winding-up в AIFC Court. Кредитор начинает параллельную процедуру в Сингапуре. Будет ли AIFC Court признавать иностранное insolvency proceeding? Какой закон применяется к распределению активов в РК? Ссылки на AIFC Insolvency Rules и UNCITRAL Model Law status в AIFC."),
 ("Налоговое право", "Investment Contract + Tax Stability Clause",
  "AIFC Participant заключает Investment Contract с Министерством инвестиций РК на $650 млн. Контракт содержит clause о стабильности налогового режима. В 2027 году вносятся поправки в НК РК, ухудшающие положение. Сохранится ли 0% CIT до 2066 года? Какой форум разрешит спор (AIFC Court / суд РК / IAC)? Ссылки на Constitutional Statute ст. 6, Предпринимательский кодекс и практику."),
 ("Foundations / Наследство", "AIFC Foundation + Foreign Forced Heirship",
  "Founder из юрисдикции с обязательной долей наследования (forced heirship) вносит $220 млн в AIFC Foundation + Purpose Trust. Один из детей оспаривает структуру в суде страны origin. Какое право будет применять иностранный суд? Насколько сильна защита AIFC law? Налоговые последствия для beneficiaries."),
 ("AML/KYC", "AML High-Risk Transaction + MLRO Liability",
  "MLRO AIFC-компании (Private Banking) видит транзакцию $18 млн с PEP и признаками layering. Порог подачи STR в 2026 году? Ответственность MLRO и фирмы при задержке подачи более 3 рабочих дней. Ссылки на AML/CTF Rules 2026 и казахстанский Закон о противодействии легализации."),
 ("Финансовые услуги", "Reverse Solicitation vs Active Marketing",
  "Иностранная (не-AIFC) фирма рассылает предложения услуг 40 казахстанским HNWI через AIFC-платформу, утверждая reverse solicitation. Требуется ли AFSA licence? Какие доказательства нужны AFSA для квалификации как active marketing? Риски и актуальная позиция AFSA 2026."),
 ("Налоговое право", "ITRP Tax Residency Dispute + Treaty Override",
  "Участник ITRP ($60 000 инвестиция) получает сертификат Investment Resident. Налоговая служба его основной страны (DTT с РК) считает его резидентом своей страны и применяет CFC. Как разрешается конфликт? Сохраняется ли освобождение иностранного дохода в РК? Ссылки на ITRP Regulations section 31 и DTT."),
 ("Финансовые услуги / Налоги", "Public Offer CIS Units on AIX",
  "AIFC CIS проводит публичное размещение units на AIX на $150 млн. Какие обязательные disclosure требования и liability за prospectus? Налогообложение capital gains для иностранных инвесторов? Licensing и ongoing obligations Fund Manager. Ссылки на CIS Rules, AIX Listing Rules и tax exemptions."),
 ("Корпоративное право / Налоги", "Strike Off, Restoration и Retroactive Tax",
  "AFSA применила Strike Off к AIFC Company за существенное несоблюдение substance. Через 11 месяцев компания восстанавливается (restoration). Восстанавливаются ли налоговые льготы 0% за период Strike Off? Каковы последствия для акционеров и кредиторов? Ссылки на Companies Regulations и взаимодействие с КГД."),
 ("Разрешение споров", "Hybrid Tax-Regulatory Dispute + Parallel Proceedings",
  "КГД доначислил AIFC Participant 2,8 млрд тенге, одновременно AFSA инициировала regulatory action за нарушение Substance Rules. Участник подаёт иск в AIFC Court и параллельно арбитраж в IAC. Возможны ли parallel proceedings? Какой приоритет у решений? Полные ссылки на все применимые акты."),
]

def ask(area, q):
    payload = {"messages":[{"role":"user","content":q}], "area":area, "lang":"ru", "test_key":TEST_KEY}
    for attempt in range(6):
        try:
            req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(),
                headers={"Content-Type":"application/json","User-Agent":"curl/8"})
            text=""; srcs=[]
            for line in urllib.request.urlopen(req, timeout=180):
                try:
                    d=json.loads(line)
                    if d.get("type")=="token": text+=d.get("t","")
                    if d.get("type")=="meta":
                        srcs=[s.get("act","") for s in d.get("ragSources",[])]
                except: pass
            if text: return text, srcs
        except Exception as e:
            time.sleep(10)
    return "[ОШИБКА: пустой ответ после ретраев]", []

out = []
out.append(f"# AIFCLex — прогон 15 продвинутых вопросов (21–35)\n")
out.append(f"_Сгенерировано: {datetime.datetime.now():%Y-%m-%d %H:%M} · модель: Claude Opus 4.8 · RAG (акты AIFC + судебная практика) · обход кэша._\n")
out.append("> Ответы носят информационно-справочный характер. Цель файла — внешняя проверка точности (Grok).\n")
N=len(Q)
for i,(area,title,q) in enumerate(Q,21):
    print(f"[{i}/35] {title} …", flush=True)
    ans, srcs = ask(area, q)
    out.append(f"\n---\n\n## Вопрос {i}. {title}\n")
    out.append(f"**Область:** {area}\n")
    out.append(f"**Запрос:** {q}\n")
    out.append(f"\n**Ответ AIFCLex:**\n\n{ans}\n")
    if srcs:
        out.append(f"\n**Источники RAG (retrieved):** " + "; ".join(dict.fromkeys(s[:70] for s in srcs)) + "\n")
    time.sleep(5)

path = "/Users/kanat_kenbayev/Desktop/AIFCLex-15-вопросов-21-35-ответы.md"
open(path,"w",encoding="utf-8").write("\n".join(out))
print("ГОТОВО →", path)
