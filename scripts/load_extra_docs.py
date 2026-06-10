#!/usr/bin/env python3
"""
Загрузка дополнительных документов в Vectorize RAG:
  - AIFC Data Protection Regulations 2025
  - AIFC Data Protection Rules 2025
  - Guidance for Fund Management Activity and Funds in the AIFC
  - CIS Rules v8 (актуальная версия, PDF-копия для полноты)

Запуск: python3 scripts/load_extra_docs.py
"""

import io, sys, time, requests, pypdf

WORKER_URL   = "https://aifc-legal-proxy.aifclegal.workers.dev"
INGEST_SECRET = "aifc-rag-2026"
CHUNK_SIZE   = 3500   # символов на чанк
MAX_SEG      = 38000  # максимум символов за один /ingest-text вызов

DOCS = [
    {
        "id":  "data-protection-regulations-2025",
        "act": "AIFC Data Protection Regulations 2025",
        "cat": "Защита данных",
        "url": "https://aifc.kz/legal-framework/aifc-data-protection-regulations/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/06/aifc-data-protection-regulations-2025-1.pdf",
    },
    {
        "id":  "data-protection-rules-2025",
        "act": "AIFC Data Protection Rules 2025",
        "cat": "Защита данных",
        "url": "https://aifc.kz/legal-framework/aifc-data-protection-rules/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/06/aifc-data-protection-rules-2025-2.pdf",
    },
    {
        "id":  "guidance-fund-management-aifc",
        "act": "AFSA Guidance for Fund Management Activity and Funds in the AIFC",
        "cat": "Финансовые услуги",
        "url": "https://aifc.kz/legal-framework/guidance-for-fund-management-activity-and-funds-in-the-aifc/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/06/guidance-for-fund-management-activity-and-funds-in-the-aifc.pdf",
    },
    {
        "id":  "cis-rules-v8-2025",
        "act": "AIFC Collective Investment Scheme Rules v8 (2025)",
        "cat": "Финансовые услуги",
        "url": "https://aifc.kz/legal-framework/collective-investment-scheme-rules/",
        "pdf": "https://aifc.kz/wp-content/uploads/2024/06/cis_v8_fr0009-01.01.2025.pdf",
    },
]


def extract_pdf_text(pdf_bytes: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(p.extract_text() or "" for p in reader.pages).strip()


def ingest_segment(seg_id: str, text: str, act: str, url: str, cat: str) -> dict:
    resp = requests.post(
        f"{WORKER_URL}/ingest-text",
        json={"key": INGEST_SECRET, "id": seg_id, "act": act, "url": url, "cat": cat, "text": text},
        timeout=90,
    )
    return resp.json()


def process_doc(doc: dict) -> bool:
    print(f"\n{'='*60}")
    print(f"📥  {doc['act']}")
    print(f"    PDF: {doc['pdf']}")

    try:
        r = requests.get(doc["pdf"], timeout=45, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200:
            print(f"    ❌ HTTP {r.status_code}")
            return False
        print(f"    ✓ Скачан ({len(r.content)//1024} KB)")
    except Exception as e:
        print(f"    ❌ Ошибка скачивания: {e}")
        return False

    try:
        text = extract_pdf_text(r.content)
        if len(text) < 200:
            print(f"    ❌ Мало текста ({len(text)} симв.) — возможно сканированный PDF")
            return False
        print(f"    ✓ Текст извлечён ({len(text)} симв.)")
    except Exception as e:
        print(f"    ❌ Ошибка извлечения: {e}")
        return False

    segments = [text[i:i+MAX_SEG] for i in range(0, len(text), MAX_SEG)]
    print(f"    → {len(segments)} сегмент(ов)")

    ok = 0
    for i, seg in enumerate(segments):
        seg_id = doc["id"] if len(segments) == 1 else f"{doc['id']}-p{i}"
        try:
            result = ingest_segment(seg_id, seg, doc["act"], doc["url"], doc["cat"])
            if result.get("ok"):
                print(f"    ✅ сегмент {i}: {result.get('chunks')} чанков, {result.get('upserted')} векторов")
                ok += 1
            else:
                print(f"    ⚠️  сегмент {i}: {result}")
        except Exception as e:
            print(f"    ❌ сегмент {i}: {e}")
        time.sleep(1)

    return ok > 0


def main():
    print("📚  МФЦА Правовой Ассистент — загрузка дополнительных документов")
    print(f"    Worker: {WORKER_URL}")
    print(f"    Документов: {len(DOCS)}\n")

    results = []
    for doc in DOCS:
        success = process_doc(doc)
        results.append((doc["act"], success))

    print(f"\n{'='*60}")
    print("ИТОГИ:")
    for name, success in results:
        print(f"  {'✅' if success else '❌'}  {name}")

    loaded = sum(1 for _, s in results if s)
    print(f"\n{loaded}/{len(DOCS)} документов загружено в Vectorize.")
    if loaded > 0:
        print("Проверьте: задайте вопрос про Data Protection, Fund Management или CIS Rules.")


if __name__ == "__main__":
    main()
