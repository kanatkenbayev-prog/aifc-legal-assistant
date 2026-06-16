#!/usr/bin/env python3
"""
Пилот: загрузка решений Суда МФЦА в Vectorize RAG
Запуск: python3 scripts/load_court_judgments.py

Перед запуском убедитесь, что worker запущен (wrangler dev) или укажите WORKER_URL.
"""

import io
import sys
import time
import requests
import pypdf

WORKER_URL = "https://aifc-legal-proxy.aifclegal.workers.dev"
INGEST_SECRET = "aifc-rag-2026"

# 8 отобранных дел: 4 апелляционных + 4 знаковых CFI
CASES = [
    {
        "id": "court-CA-2025-0041",
        "case": "AIFC-C/CA/2025/0041",
        "area": "disputes",
        "label": "Sinohydro v Qazavtojol (Court of Appeal, Feb 2026) — строительный контракт",
        "pdf": "https://court.aifc.kz/wp-content/uploads/2026/02/AIFC-Court-Case-No.-41-of-2025-Judgment_ENG__.pdf",
    },
    {
        "id": "court-CA-2024-0046",
        "case": "AIFC-C/CA/2024/0046",
        "area": "disputes",
        "label": "Intl Academy of Medicine v Health Dept (Court of Appeal, Mar 2025) — административный спор",
        "pdf": "https://court.aifc.kz/wp-content/uploads/2025/03/AIFC-Court-Case-No.-46-of-2024-Judgment_ENG_.pdf",
    },
    {
        "id": "court-CA-2025-0001",
        "case": "AIFC-C/CA/2025/0001",
        "area": "disputes",
        "label": "Qazavtojol v Sinohydro (Court of Appeal, Mar 2025) — строительный контракт апелляция",
        "pdf": "https://court.aifc.kz/wp-content/uploads/2025/03/AIFC-Court-Case-No.-1-of-2025-Judgment_ENG.pdf",
    },
    {
        "id": "court-CA-2025-0028",
        "case": "AIFC-C/CA/2025/0028",
        "area": "disputes",
        "label": "Sinohydro v Qazavtojol (Court of Appeal, Aug 2025) — строительный контракт",
        "pdf": "https://court.aifc.kz/wp-content/uploads/2025/08/AIFC-Court-Case-No.-28-of-2025-Judgment_ENG.pdf",
    },
    {
        "id": "court-CFI-2023-0033",
        "case": "AIFC-C/CFI/2023/0033",
        "area": "disputes",
        "label": "Arbitration challenge — отвод арбитра (IAC), Sir Rupert Jackson",
        "pdf": "https://court.aifc.kz/wp-content/uploads/2025/03/AIFC-Court-Case-No.-33-of-2023-Judgment-anonymised.pdf",
    },
    {
        "id": "court-CFI-2023-0035",
        "case": "AIFC-C/CFI/2023/0035",
        "area": "financial",
        "label": "Cashdrive v AFSA — challenge to regulatory decision",
        "pdf": "https://court.aifc.kz/wp-content/uploads/2024/04/AIFC-Court-Case-No.-35-of-2023-Judgment_ENG.pdf",
    },
    {
        "id": "court-CFI-2024-0005",
        "case": "AIFC-C/CFI/2024/0005",
        "area": "financial",
        "label": "107 Bondholders v NEF Qazaqstan — bond enforcement",
        "pdf": "https://court.aifc.kz/wp-content/uploads/2024/04/AIFC-Court-Case-No.-5-of-2024-Judgment_ENG.pdf",
    },
    {
        "id": "court-CFI-2024-0028",
        "case": "AIFC-C/CFI/2024/0028",
        "area": "disputes",
        "label": "Intl Academy v Almaty Health Dept (CFI) — юрисдикция МФЦА vs государственный орган",
        "pdf": "https://court.aifc.kz/wp-content/uploads/2025/06/AIFC-Court-Case-No.-28-of-2024-Judgment-and-Order_ENG_.pdf",
    },
]

CHUNK_SIZE = 3000  # символов на чанк


def extract_pdf_text(pdf_bytes: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    parts = []
    for page in reader.pages:
        t = page.extract_text() or ""
        parts.append(t)
    return "\n".join(parts).strip()


def chunk_text(text: str, size: int = CHUNK_SIZE) -> list[str]:
    chunks = []
    while text:
        chunks.append(text[:size])
        text = text[size:]
    return chunks


def ingest_case(case_id: str, text: str, act_name: str, source_url: str) -> dict:
    resp = requests.post(
        f"{WORKER_URL}/ingest-text",
        json={
            "key": INGEST_SECRET,
            "id": case_id,
            "act": act_name,
            "url": source_url,
            "cat": "Судебные решения МФЦА",
            "text": text[:40000],
        },
        timeout=60,
    )
    return resp.json()


def process_case(case: dict) -> bool:
    print(f"\n{'='*60}")
    print(f"📥  {case['case']}")
    print(f"    {case['label']}")
    print(f"    PDF: {case['pdf']}")

    # Скачиваем PDF
    try:
        r = requests.get(case["pdf"], timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200:
            print(f"    ❌ HTTP {r.status_code} — пропускаем")
            return False
        pdf_bytes = r.content
        print(f"    ✓ Скачан ({len(pdf_bytes)//1024} KB)")
    except Exception as e:
        print(f"    ❌ Ошибка скачивания: {e}")
        return False

    # Извлекаем текст
    try:
        text = extract_pdf_text(pdf_bytes)
        if len(text) < 200:
            print(f"    ❌ Слишком мало текста ({len(text)} симв.) — вероятно сканированный PDF")
            return False
        print(f"    ✓ Текст извлечён ({len(text)} симв.)")
    except Exception as e:
        print(f"    ❌ Ошибка извлечения: {e}")
        return False

    # Worker сам разбивает на чанки (до 40000 символов за вызов)
    # Если текст длиннее — шлём несколькими кусками по 38000
    segments = [text[i:i+38000] for i in range(0, len(text), 38000)]
    print(f"    → {len(segments)} сегмент(ов) → Worker")

    ok = 0
    for i, segment in enumerate(segments):
        seg_id = case["id"] if len(segments) == 1 else f"{case['id']}-p{i}"
        try:
            result = ingest_case(
                case_id=seg_id,
                text=segment,
                act_name=f"AIFC Court Judgment {case['case']}",
                source_url=case["pdf"],
            )
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
    print("🏛️  МФЦА Правовой Ассистент — загрузка решений Суда")
    print(f"    Worker: {WORKER_URL}")
    print(f"    Дел в пилоте: {len(CASES)}\n")

    results = []
    for case in CASES:
        success = process_case(case)
        results.append((case["case"], success))

    print(f"\n{'='*60}")
    print("ИТОГИ:")
    for case_id, success in results:
        icon = "✅" if success else "❌"
        print(f"  {icon}  {case_id}")

    loaded = sum(1 for _, s in results if s)
    print(f"\n{loaded}/{len(CASES)} дел успешно загружено в Vectorize.")
    if loaded > 0:
        print("Проверьте ассистента: задайте вопрос об арбитраже или строительных спорах МФЦА.")


if __name__ == "__main__":
    main()
