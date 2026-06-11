#!/usr/bin/env python3
"""
Глубокая загрузка полных PDF ключевых актов в Vectorize RAG (шаги 2-3).
Заменяет «тонкие» чанки со страниц-обёрток aifc.kz на полный текст норм.

Акты:
  - AIFC Companies Regulations V8      → Part 8 (Directors' Duties) для Q44
  - AIFC Market Rules V13              → Market Abuse для Q43
  - AIFC Financial Services (FSMR) V12 → Market Abuse / Regulated Activities
  - AIFC Rules on Currency Regulation  → Q1
  - AIFC Insolvency Regulations V3     → Q6
  - AIFC Insolvency Rules V3           → Q6
  - AIFC Contract Regulations          → Q45

Запуск: python3 scripts/load_deep_pdfs.py
"""

import io, sys, time, requests, pypdf

WORKER_URL    = "https://aifc-legal-proxy.aifclegal.workers.dev"
INGEST_SECRET = "aifc-rag-2026"
MAX_SEG       = 38000    # символов за один /ingest-text вызов
PER_DOC_CAP   = 240000   # верхний предел символов на документ (ограничивает время/нейроны)

DOCS = [
    {
        "id":  "deep-companies-regs-v8",
        "act": "AIFC Companies Regulations 2017 (V8, full text)",
        "cat": "Корпоративное право",
        "url": "https://aifc.kz/legal-framework/aifc-companies-regulations/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/06/comreg_v8_01.01.25.pdf",
    },
    {
        "id":  "deep-market-rules-v13",
        "act": "AIFC Market Rules (MAR) V13 (full text)",
        "cat": "Финансовые услуги",
        "url": "https://aifc.kz/legal-framework/market-rules/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/06/mar_v13_01.01.2026.pdf",
    },
    {
        "id":  "deep-fsmr-v12",
        "act": "AIFC Financial Services and Markets Regulations (FSMR) V12 (full text)",
        "cat": "Финансовые услуги",
        "url": "https://aifc.kz/legal-framework/aifc-financial-services-framework-regulations/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/05/fsfr_v12-18.10.2024-itf_gk.pdf",
    },
    {
        "id":  "deep-currency-regulation",
        "act": "AIFC Rules on Currency Regulation and Provision of Information (full text)",
        "cat": "Валютное регулирование",
        "url": "https://aifc.kz/legal-framework/aifc-rules-on-currency-regulation-and-provision-of-information-in-the-aifc/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/05/aifc-rules-on-currency-regulation-and-provision-of-information-on-currency-transactions-in-the-aifc-with-amendments-as-of-15-february-2024-eng.pdf",
    },
    {
        "id":  "deep-insolvency-regs-v3",
        "act": "AIFC Insolvency Regulations V3 (full text)",
        "cat": "Несостоятельность и ликвидация",
        "url": "https://aifc.kz/legal-framework/aifc-insolvency-regulations/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/06/ireg_v3_14_01.01.2025.pdf",
    },
    {
        "id":  "deep-insolvency-rules-v3",
        "act": "AIFC Insolvency Rules V3 (full text)",
        "cat": "Несостоятельность и ликвидация",
        "url": "https://aifc.kz/legal-framework/insolvency-rules/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/06/ir_v3_gr0008_01.01.2025.pdf",
    },
    {
        "id":  "deep-contract-regs",
        "act": "AIFC Contract Regulations (full text)",
        "cat": "Договорное право",
        "url": "https://aifc.kz/legal-framework/aifc-contract-regulations/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/05/aifc-c1.pdf",
    },
]


def extract_pdf_text(pdf_bytes: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(p.extract_text() or "" for p in reader.pages).strip()


def ingest_segment(seg_id, text, act, url, cat):
    resp = requests.post(
        f"{WORKER_URL}/ingest-text",
        json={"key": INGEST_SECRET, "id": seg_id, "act": act, "url": url, "cat": cat,
              "text": text, "reset": True},
        timeout=120,
    )
    try:
        return resp.json()
    except Exception:
        return {"ok": False, "status": resp.status_code, "body": resp.text[:200]}


def process_doc(doc):
    print(f"\n{'='*64}")
    print(f"  {doc['act']}")
    try:
        r = requests.get(doc["pdf"], timeout=60, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200:
            print(f"    HTTP {r.status_code} — пропуск")
            return False
        print(f"    Скачан: {len(r.content)//1024} KB")
    except Exception as e:
        print(f"    Ошибка скачивания: {e}")
        return False

    try:
        text = extract_pdf_text(r.content)
    except Exception as e:
        print(f"    Ошибка извлечения текста: {e}")
        return False

    if len(text) < 500:
        print(f"    Мало текста ({len(text)}) — возможно скан PDF, пропуск")
        return False

    text = text[:PER_DOC_CAP]
    segments = [text[i:i+MAX_SEG] for i in range(0, len(text), MAX_SEG)]
    print(f"    Текст: {len(text)} симв. → {len(segments)} сегмент(ов)")

    total_vectors = 0
    for i, seg in enumerate(segments):
        seg_id = f"{doc['id']}-s{i}"
        res = ingest_segment(seg_id, seg, doc["act"], doc["url"], doc["cat"])
        if res.get("ok"):
            total_vectors += res.get("upserted", 0)
            print(f"    сегмент {i}: {res.get('chunks')} чанков, {res.get('upserted')} векторов")
        else:
            print(f"    сегмент {i}: ОШИБКА {res}")
        time.sleep(2)
    print(f"    ИТОГО: {total_vectors} векторов")
    return total_vectors > 0


def main():
    print("Глубокая PDF-загрузка ключевых актов в Vectorize")
    results = []
    for doc in DOCS:
        ok = process_doc(doc)
        results.append((doc["act"], ok))
        time.sleep(2)

    print(f"\n{'='*64}\nИТОГИ:")
    for name, ok in results:
        print(f"  {'OK ' if ok else 'FAIL'}  {name}")
    print(f"\n{sum(1 for _,o in results if o)}/{len(results)} документов загружено.")


if __name__ == "__main__":
    main()
