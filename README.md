# МФЦА Правовой Ассистент — AIFC Legal Assistant

Интерактивный AI-ассистент для юридических консультаций по законодательству МФЦА (Международного финансового центра «Астана») и Республики Казахстан.

🌐 **Живой сайт:** https://kanat-kenbayev.github.io/aifc-legal-assistant/

## Возможности

### Чат и консультации
- **Диалоговый чат** с историей — задавайте уточнения, ассистент помнит контекст
- **Быстрые чипы** — когда AI задаёт уточняющий вопрос, появляются кнопки с вариантами ответа
- **Язык интерфейса** — русский / English (ответ на языке вопроса)
- **Область права** — корпоративное, финансовые услуги, налоговое, трудовое, споры, AML/KYC
- **Живые данные** — каждый запрос получает свежие новости с aifc.kz и уведомления AFSA
- **Верификация ссылок** — все URL проверяются в реальном времени (✓ зелёные / ⚠️ битые)
- **Кэш частых вопросов** — повторные вопросы отдаются мгновенно из KV (⚡ из кэша)
- **Сохранение истории** — чат автоматически сохраняется в браузере (localStorage)
- **Экспорт в PDF** — кнопка ⬇ PDF в шапке сайта

### База знаний (RAG)
- **60 актов МФЦА** — Companies Regulations, FSMR, Employment Regulations, AML Rules, валютное регулирование, несостоятельность/ликвидация, миграция, договорное право, иерархия актов, трасты, интеллектуальная собственность, сборы, платёжные системы и др.
- **Глубокая PDF-загрузка** — полные тексты ключевых актов (Companies Regs V8 / Part 8 Directors, Market Rules V13 / Market Abuse, FSMR V12, Insolvency, Currency, Contract Regs) для точных постатейных цитат
- **CIS Rules** — полная база по коллективным инвестиционным схемам (orderly.myafsa.com)
- **Substance Rules** — правила налогового присутствия (CIGA, Qualified Employees, OpEx)
- **Решения Суда МФЦА** — 6 знаковых дел (CFI и Court of Appeal, 2023–2026) в векторной базе
- **Citation DB** — 35+ точных ссылок на конкретные нормы (Rule/Section), инжектируются в каждый промпт

### Инструменты (вкладка 🧰)
- **Substance Checker** — пошаговая оценка соответствия требованиям налогового присутствия МФЦА (CIGA, сотрудники, расходы, офис, директора), итоговый risk score
- **Registration Wizard** — интерактивный мастер выбора структуры юрлица МФЦА с планом регистрации, сроками и чек-листом документов
- **Генератор документов** — двуязычные шаблоны (EN + RU глоссарий): запрос в AFSA, решение участника, NDA
- **Учредительные документы** — официальные шаблоны AFSA (Articles of Association, LP/LLP Partnership Agreements) с AI-проверкой правок

### Качество ответов (AIFC Legal Assistant Pro v4.5)
- **Strict Citations** — каждое юридическое утверждение заканчивается точной ссылкой [Акт, Rule X]
- **Anti-hallucination** — запрет выдуманных номеров и плейсхолдеров; на «процитируй дословно» без текста в базе — честный отказ со ссылкой на первоисточник
- **Forced structure** — пост-валидация: при отсутствии блока «**Вывод:**» или плейсхолдерах ответ тихо перегенерируется один раз; кэшируются только валидные ответы
- **Разделение юрисдикций** — AIFC и РК всегда явно маркированы в ответе
- **Анализ рисков** — на темах substance/лицензирование/AML/холдинги: красные флаги + уровень риска
- **Режим юриста** — расширенный технический анализ по профессиональным запросам
- **Честность** — если нормы нет в базе, ассистент говорит об этом прямо

### Аналитика (встроенная, без внешних сервисов)
- Дневные счётчики: запросы, кэш-хиты, уникальные пользователи (по IP), нейроны
- Breakdown по: языку запроса, стране, области права
- Latency, ragCount, fund/lawyer mode rate
- Топ-100 последних вопросов, негативные оценки
- Доступно через `/stats?key=...` и панель `admin.html`

## Стек

| Компонент | Технология |
|---|---|
| Frontend | HTML5 / CSS3 / Vanilla JS (Single Page App, без фреймворков) |
| Хостинг | GitHub Pages |
| AI-модель | Llama 3.3 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| Бэкенд | Cloudflare Workers (serverless, Workers Paid план) |
| Векторная база | Cloudflare Vectorize (`aifc-acts`, 768d cosine, ~900+ векторов) |
| Embeddings | `@cf/baai/bge-base-en-v1.5` |
| KV-хранилище | Cloudflare KV — кэш, рейтинги, rate-limit, аналитика |
| Живые данные | Прямой скрапинг aifc.kz, afsa.aifc.kz |
| Верификация | HEAD-запросы через Cloudflare Worker |
| CI/CD | GitHub Actions → Cloudflare Workers Builds (auto-deploy on push) |

## Архитектура

```
Браузер (GitHub Pages)
  └─► POST https://aifc-legal-proxy.aifclegal.workers.dev/chat
         ├─ Rate limiting (KV, 25 req/min per IP)
         ├─ Cache check (KV SHA-256 key, 2h TTL)
         ├─ Parallel:
         │    ├─ RAG retrieval (Vectorize, topK=7, score>0.42)
         │    │    └─ Cross-lingual boost (English anchor terms for RU queries)
         │    ├─ Live scraping: aifc.kz news
         │    └─ Live scraping: afsa.aifc.kz notices
         ├─ buildSystemPrompt (lang, area, RAG ctx, Citation DB, ACTS_INDEX)
         │    ├─ isFundQuery → CIS Rules boost
         │    └─ isLawyerMode → technical response style
         ├─ Llama 3.3 70B streaming (NDJSON protocol)
         ├─ Structure post-validation → silent self-repair on defect
         ├─ Link verification (HEAD requests, parallel)
         ├─ Cache write (valid answers only) + Analytics track (waitUntil)
         └─ NDJSON stream → frontend (meta / token / done[/replaceText] events)

Cron (06:00 UTC): монитор всех актов (ротация) + Consultation Papers + AFSA Notice Register
```

## Деплой

### Frontend (GitHub Pages)
```bash
git push origin main
# Автодеплой через GitHub Actions
```

### Worker (Cloudflare)
```bash
cd worker
npx wrangler deploy
# Или автоматически через Cloudflare Workers Builds (GitHub push)
```

### Загрузка в RAG
```bash
# Акты МФЦА
python3 scripts/ingest_acts.py

# Решения Суда МФЦА
python3 scripts/load_court_judgments.py
```

## Источники права в базе знаний

1. Нормативные акты МФЦА — https://aifc.kz/legal-framework/
2. CIS Rules (коллективные инвестиционные схемы) — https://orderly.myafsa.com/articles/collectiveinvestmentschemerules
3. Конституционный закон РК «О МФЦА» № 438-V от 7 декабря 2015 года
4. Substance Rules (CIGA/налоговое присутствие) — https://aifc.kz/legal-framework/
5. Реестр лицензий AFSA — https://publicreg.myafsa.com/
6. Уведомления AFSA — https://afsa.aifc.kz/notice-register/
7. Решения Суда МФЦА — https://court.aifc.kz/

## Статус разработки

| Функция | Статус |
|---|---|
| Чат + RAG + Streaming | ✅ Готово |
| CIS Rules в базе знаний | ✅ Готово |
| Судебные решения (6 дел) | ✅ Готово |
| Substance Checker | ✅ Готово |
| Registration Wizard | ✅ Готово |
| Встроенная аналитика (KV) | ✅ Готово |
| System Prompt Pro v2 | ✅ Готово |
| Accounts + quota система | 🔜 После запуска |
| ioka payments | 🔜 После запуска |
| ToS / Privacy Policy | 🔜 После запуска |
| Claude API (вместо Llama) | 🔜 После запуска |

---

*Версия 3.0 · Июнь 2026 · AI-powered, no API keys required*
