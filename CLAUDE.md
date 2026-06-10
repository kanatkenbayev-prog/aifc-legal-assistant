# МФЦА Правовой Ассистент — заметки проекта

## Архитектура
- **Frontend:** `index.html` (single-file SPA) → Netlify + GitHub Pages (авто-деплой при push)
- **Backend:** `worker/index.js` (Cloudflare Worker) → авто-деплой через Cloudflare Workers Builds
- **AI:** Llama 3.3 70B (Cloudflare Workers AI, бесплатно) + RAG (Vectorize `aifc-acts`) + эмбеддинги bge-base
- **Хранилище:** KV `AIFC_KV` (кэш ответов, рейтинг, rate-limit, мониторинг)
- **Cron:** ежедневный мониторинг изменений актов (06:00 UTC)
- Репозиторий: `kanatkenbayev-prog/aifc-legal-assistant`
- Live: https://aifc-legal-assistant.netlify.app · https://kanatkenbayev-prog.github.io/aifc-legal-assistant/

## ⏳ Отложено до live-релиза с платёжными шлюзами
> **НАПОМНИТЬ пользователю на следующих стадиях (после подключения платежей):**
- **Перейти на платные модели** для максимального качества ответов (например, **Claude через Anthropic API** на сервере вместо бесплатной Llama 3.3).
  - Причина: Llama изредка вставляет CJK-иероглифы в русский текст (сейчас лечится промптом + серверным фильтром `sanitizeText`, но первопричину устранит только смена модели).
  - Это также повысит точность юридических консультаций и качество русского языка.
- Решение принято: платные интеграции подключаем **после** live-релиза с прикрученными платёжными шлюзами.

## Известные технические детали
- CJK-фильтр: `sanitizeText()` в worker — вырезает иероглифы из вывода модели.
- Кросс-языковой RAG: `areaKeywordsEn()` добавляет английские термины к запросу (тексты актов английские, вопросы русские).
- RAG-загрузка: `/ingest` (со страниц aifc.kz) и `/ingest-text` (произвольный текст, секрет `INGEST_SECRET`).
- Substance Rules (налоговые льготы) загружены в RAG из официального PDF.

## Деплой
- Frontend: `git push` → авто на Netlify + Pages.
- Worker: `git push` → авто через Cloudflare Workers Builds (root dir `worker`, deploy `npx wrangler deploy`).
- Ручной деплой Worker при необходимости: `cd worker && npx wrangler deploy` (нужен Node 22).
