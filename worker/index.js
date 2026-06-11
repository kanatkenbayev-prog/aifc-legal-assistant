// ═══════════════════════════════════════════════════════════════════════════
//  МФЦА Правовой Ассистент — Cloudflare Worker (backend)
//  Возможности: чат со стримингом · RAG (Vectorize) · верификация ссылок ·
//  рейтинг ответов (KV) · rate-limiting · cron-мониторинг изменений в актах
// ═══════════════════════════════════════════════════════════════════════════

const INGEST_SECRET = 'aifc-rag-2026';      // защита эндпоинта загрузки RAG
const ADMIN_SECRET = 'aifc-admin-2026';     // защита /stats и /analyze (мониторинг)
const RATE_LIMIT_PER_MIN = 25;              // запросов в минуту с одного IP
const DAILY_NEURON_BUDGET = 100000;         // Workers Paid план — нейроны по pay-per-use, лимит для мониторинга
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const CHAT_MODEL  = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ── Полный список актов (название → URL) ──────────────────────────────────────
const ACTS = [
  ['AIFC Companies Regulations','https://aifc.kz/legal-framework/aifc-companies-regulations/','Корпоративное право'],
  ['Companies Rules','https://aifc.kz/legal-framework/companies-rules/','Корпоративное право'],
  ['AIFC General Partnership Regulations','https://aifc.kz/legal-framework/partnerships/','Корпоративное право'],
  ['General Partnership Rules','https://aifc.kz/legal-framework/general-partnership-rules/','Корпоративное право'],
  ['AIFC Limited Partnership Regulations','https://aifc.kz/legal-framework/aifc-limited-partnership-regulations/','Корпоративное право'],
  ['Limited Partnership Rules','https://aifc.kz/legal-framework/aifc-limited-partnership-rules/','Корпоративное право'],
  ['AIFC Limited Liability Partnership Regulations','https://aifc.kz/legal-framework/aifc-limited-liability-partnership-regulations/','Корпоративное право'],
  ['Limited Liability Partnership Rules','https://aifc.kz/legal-framework/aifc-limited-liability-partnership-rules/','Корпоративное право'],
  ['AIFC Foundations Regulations','https://aifc.kz/legal-framework/aifc-foundations-regulations/','Корпоративное право'],
  ['Special Purpose Company Rules','https://aifc.kz/legal-framework/special-purpose-company-rules/','Корпоративное право'],
  ['Non-Profit Incorporated Organisations Regulations','https://aifc.kz/legal-framework/non-profit-incorporated-organisations/','Корпоративное право'],
  ['Venture Studio Rules','https://aifc.kz/legal-framework/venture-studio-rules/','Корпоративное право'],
  ['AIFC Financial Services Framework Regulations','https://aifc.kz/legal-framework/aifc-financial-services-framework-regulations/','Финансовые услуги'],
  ['General Rules','https://aifc.kz/legal-framework/general-rules/','Финансовые услуги'],
  ['Conduct Of Business Rules','https://aifc.kz/legal-framework/conduct-of-business-rules/','Финансовые услуги'],
  ['Authorised Market Institution Rules','https://aifc.kz/legal-framework/authorised-market-institution-rules/','Финансовые услуги'],
  ['Market Rules','https://aifc.kz/legal-framework/market-rules/','Финансовые услуги'],
  ['Banking Business Prudential Rules','https://aifc.kz/legal-framework/banking-business-prudential-rules/','Финансовые услуги'],
  ['Islamic Banking Business Prudential Rules','https://aifc.kz/legal-framework/islamic-banking-business-prudential-rules/','Финансовые услуги'],
  ['Prudential Rules For Investment Firms','https://aifc.kz/legal-framework/prudential-rules-for-investment-firms/','Финансовые услуги'],
  ['Insurance And Reinsurance Prudential Rules','https://aifc.kz/legal-framework/insurance-and-reinsurance-prudential-rules/','Финансовые услуги'],
  ['Collective Investment Scheme Rules (CIS Rules)','https://orderly.myafsa.com/articles/collectiveinvestmentschemerules','Финансовые услуги'],
  ['AIFC Financial Technology Rules','https://aifc.kz/legal-framework/aifc-financial-technology-rules/','Финансовые услуги'],
  ['AIFC Rules on Digital Asset Activities','https://aifc.kz/legal-framework/aifc-rules-on-digital-asset-activities/','Финансовые услуги'],
  ['Multilateral And Organised Trading Facilities Rules','https://aifc.kz/legal-framework/multilateral-and-organised-trading-facilities-rules/','Финансовые услуги'],
  ['Sovereign Bonds Rules','https://aifc.kz/legal-framework/sovereign-bonds-rules/','Финансовые услуги'],
  ['Dematerialised Investment Rules','https://aifc.kz/legal-framework/dematerialised-investment-rules/','Финансовые услуги'],
  ['Rules For Pre-IPO Listings','https://aifc.kz/legal-framework/rules-for-pre-ipo-listings/','Финансовые услуги'],
  ['Recognition Rules','https://aifc.kz/legal-framework/recognition-rules/','Финансовые услуги'],
  ['Representative Office Rules','https://aifc.kz/legal-framework/representative-office-rules/','Финансовые услуги'],
  ['AIFC Rules on Providing Money Services','https://aifc.kz/legal-framework/aifc-rules-on-providing-money-services/','Финансовые услуги'],
  ['AIFC Auditor Rules','https://aifc.kz/legal-framework/aifc-auditor-rules/','Финансовые услуги'],
  ['Islamic Finance Rules','https://aifc.kz/legal-framework/islamic-finance-rules/','Финансовые услуги'],
  ['Perimeter Guidance','https://aifc.kz/legal-framework/perimeter-guidance/','Финансовые услуги'],
  ['Anti-Money Laundering And Counter-Terrorist Financing Rules','https://aifc.kz/legal-framework/anti-money-laundering-and-counter-terrorist-financing-rules-full-text/','AML/CTF'],
  ['Practical Guidance to AIFC AML/CTF Framework','https://aifc.kz/legal-framework/practical-guidance-to-aifc-anti-money-laundering-and-counter-terrorist-financing-framework/','AML/CTF'],
  ['AIFC Employment Regulations','https://aifc.kz/legal-framework/aifc-employment-regulations/','Трудовое право'],
  ['AIFC Rules on Keeping Records of Foreign Labour','https://aifc.kz/legal-framework/aifc-rules-on-keeping-records-of-foreign-labour-attracted-by-aifc-participants-and-aifc-bodies/','Трудовое право'],
  ['AIFC Qualifications Necessary for Employment','https://aifc.kz/legal-framework/aifc-qualifications-necessary-for-employment-in-the-aifc/','Трудовое право'],
  ['AIFC Court Regulations 2017','https://aifc.kz/legal-framework/aifc-court-regulations-2017/','Разрешение споров'],
  ['AIFC Court Rules 2018','https://aifc.kz/legal-framework/aifc-court-rules-2018/','Разрешение споров'],
  ['AIFC Arbitration Regulations','https://aifc.kz/legal-framework/aifc-arbitration-regulations/','Разрешение споров'],
  ['IAC Arbitration and Mediation Rules 2022','https://aifc.kz/legal-framework/iac-arbitration-and-mediation-rules-2022/','Разрешение споров'],
  ['Rules on Substantial Presence of AIFC Participants (CIT, VAT)','https://aifc.kz/legal-framework/rules-on-the-substantial-presence-of-the-aifc-participants-applying-tax-exemptions-for-the-payment-of-cit-vat/','Налоговое право'],
  ['Rules on Tax Administration','https://aifc.kz/legal-framework/tax-administration-rules-of-aifc-bodies-and-participants/','Налоговое право'],
  ['List of Financial Services Exempt from CIT and VAT','https://aifc.kz/legal-framework/the-list-of-financial-services-provided-by-the-aifc-participants-income-from-which-is-exempt-from-cit-and-vat/','Налоговое право'],
];

const ACTS_INDEX = ACTS.map(([n,u,c]) => `- ${n} (${c}): ${u}`).join('\n');

// ── HTML helpers ──────────────────────────────────────────────────────────────
function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function extractBetween(html, open, close) {
  const out = []; let pos = 0;
  while (pos < html.length) {
    const s = html.indexOf(open, pos); if (s === -1) break;
    const e = html.indexOf(close, s + open.length); if (e === -1) break;
    out.push(html.slice(s + open.length, e)); pos = e + close.length;
  }
  return out;
}

// ── Точные цитаты (Citation Database) — ключевые нормы с конкретными ссылками ──
// Используются как дополнительный контекст в промпте, чтобы модель давала точные ссылки
const CITATION_DB = `
== БАЗА ТОЧНЫХ ЦИТАТ (ссылки на конкретные нормы) ==
Используй эти точные ссылки при ответах на соответствующие вопросы. НИКОГДА не упоминай только название акта — всегда добавляй номер правила/раздела.

КОРПОРАТИВНОЕ ПРАВО — РЕГИСТРАЦИЯ КОМПАНИЙ:
• Требование о регистрации: AIFC Companies Regulations 2017, Part 3, Rule 3 — любая компания, ведущая деятельность в МФЦА, подлежит регистрации в AFSA.
• Private Company (Ltd): AIFC Companies Regulations, Part 5 — нет минимального уставного капитала, минимум 1 акционер, минимум 1 директор.
• Public Company: AIFC Companies Regulations, Rule 28 — минимальный оплаченный капитал 25 000 USD до регистрации.
• LLP: AIFC Limited Liability Partnership Regulations, Part 2, Rule 4 — создаётся минимум двумя партнёрами.
• Филиал (Branch): AIFC Companies Regulations, Part 18, Rule 174 — регистрация представительства иностранной компании.
• Устав (Articles): Companies Rules, Rule 5 — типовой устав может быть принят без изменений или заменён индивидуальным.

ФИНАНСОВЫЕ УСЛУГИ — ЛИЦЕНЗИРОВАНИЕ:
• Обязанность лицензирования: AIFC Financial Services and Markets Regulations (FSMR) 2017, Part 3, Rule 31 — осуществление регулируемой деятельности без разрешения запрещено.
• Виды регулируемой деятельности: FSMR 2017, Schedule 1 — полный перечень: управление активами, брокерские услуги, кастодиальная деятельность, банкинг, страхование, управление фондами.
• Консультационная деятельность (без управления активами): FSMR 2017, Schedule 3 — юридический, управленческий и стратегический консалтинг НЕ является регулируемой деятельностью AFSA.
• Условия получения лицензии: AFSA Authorisation Rules (Conduct of Business Rules), Rule 2.1 — заявитель должен соответствовать критериям «fit and proper».

НАЛОГОВЫЕ ЛЬГОТЫ — SUBSTANCE:
• Основание льготы: Конституционный закон РК «О МФЦА» от 07.12.2015 № 438-V, ст. 6 — освобождение от КПН и НДС до 01.01.2066.
• Условия substance: Rules on Substantial Presence of AIFC Participants (CIT/VAT), п. 3.1 (Qualified Employees), п. 3.2 (Operating Expenditure), Приложение (таблица CIGA по видам деятельности).
• Дивиденды от КЗ-компаний в МФЦА: Налоговый кодекс РК, ст. 645, п. 10 — ставка 15% у источника, если нет освобождения по СИДН или Substance Rules.

ТРУДОВОЕ ПРАВО:
• Применимое право: AIFC Employment Regulations 2017, Rule 1.2 — применяются ко всем трудовым договорам с работой в МФЦА.
• Испытательный срок: AIFC Employment Regulations, Rule 8 — не более 3 месяцев.
• Уведомление об увольнении: AIFC Employment Regulations, Rule 14 — минимум 1 месяц, если договором не предусмотрено иное.
• Ежегодный отпуск: AIFC Employment Regulations, Rule 18 — минимум 20 рабочих дней.

ИНВЕСТИЦИОННЫЕ ФОНДЫ (CIS):
• Регистрация фонда: CIS Rules, Rule 4.2 — Application for Registration; Rule 4.3 — требования к регистрации фонда.
• Типы фондов: CIS Rules, Rule 2.2 — Exempt Funds и Non-Exempt Funds; Rule 2.4 — Specialist Funds.
• Управляющий фондом: CIS Rules, Rule 1.1 — обязательно наличие зарегистрированного Domestic Fund Manager или признанного Foreign Fund Manager.
• Маркетинг фондов: CIS Rules, Rule 5.1 — ограничения на маркетинг; Rule 5.3 — требования к информационному меморандуму.
• Инвестиционные ограничения: CIS Rules, Rule 6.4 (диверсификация рисков), Rule 6.9 (ограничения на заимствования).

РАЗРЕШЕНИЕ СПОРОВ:
• Юрисдикция AIFC Court: AIFC Court Regulations 2017, Rule 5 — исключительная юрисдикция по спорам между участниками МФЦА.
• IAC (арбитраж): AIFC Arbitration Regulations 2017 — IAC Rules применяются при наличии арбитражной оговорки.
• Оспаривание арбитражного решения: AIFC Arbitration Regulations, Rule 34 — основания для отмены; срок — 3 месяца с даты решения.
`;

// Обёртка над нативным AI binding — упрощает вызовы и позволит добавить провайдер позднее.
function aiChat(env, messages, { maxTokens = 2048, temperature = 0.2, stream = false } = {}) {
  return env.AI.run(CHAT_MODEL, { messages, max_tokens: maxTokens, temperature, stream });
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// ── Analytics / usage tracking (KV) ───────────────────────────────────────────
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

// Примерная стоимость операций в «нейронах» Cloudflare AI (для оценки расхода)
const NEURON_COST = { chat: 250, compliance: 350, embed: 2 };

// Объединяет дневной агрегат stat:YYYY-MM-DD (read-modify-write).
async function bumpDaily(env, patch) {
  if (!env.AIFC_KV) return;
  const key = `stat:${dayKey()}`;
  let cur = {};
  try { cur = JSON.parse(await env.AIFC_KV.get(key) || '{}'); } catch {}
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number') cur[k] = (cur[k] || 0) + v;
    else if (k === 'area' && v)   { cur.areas = cur.areas || {}; cur.areas[v] = (cur.areas[v] || 0) + 1; }
    else if (k === 'lang' && v)   { cur.langs = cur.langs || {}; cur.langs[v] = (cur.langs[v] || 0) + 1; }
    else if (k === 'country' && v){ cur.countries = cur.countries || {}; cur.countries[v] = (cur.countries[v] || 0) + 1; }
  }
  cur.neurons = cur.neurons || 0;
  await env.AIFC_KV.put(key, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 60 }); // 60 дней
}

// Добавляет элемент в ограниченный список (последние N).
async function pushList(env, key, item, max = 80) {
  if (!env.AIFC_KV) return;
  let arr = [];
  try { arr = JSON.parse(await env.AIFC_KV.get(key) || '[]'); } catch {}
  arr.unshift(item);
  await env.AIFC_KV.put(key, JSON.stringify(arr.slice(0, max)), { expirationTtl: 60 * 60 * 24 * 60 });
}

// Трекинг события — вызывать через ctx.waitUntil, не блокирует ответ.
function track(env, ctx, ev) {
  if (!env.AIFC_KV || !ctx) return;
  const tasks = [];
  const patch = { [ev.type]: 1, neurons: ev.neurons || 0 };
  if (ev.cache_hit)   patch.cache_hit = ev.cache_hit;
  if (ev.area)        patch.area = ev.area;
  if (ev.lang)        patch.lang = ev.lang;
  if (ev.country)     patch.country = ev.country;
  if (ev.latencyMs)   patch.latency_total = ev.latencyMs;
  if (ev.isFundQuery) patch.fund_query = 1;
  if (ev.isLawyerMode)patch.lawyer_mode = 1;
  if (ev.ragCount)    patch.rag_hits = ev.ragCount;
  tasks.push(bumpDaily(env, patch));

  // Уникальные IP за день (храним в Set-like строке, max 500 записей)
  if (ev.ip) tasks.push((async () => {
    const dk = `stat:ips:${dayKey()}`;
    let ips = []; try { ips = JSON.parse(await env.AIFC_KV.get(dk) || '[]'); } catch {}
    if (!ips.includes(ev.ip)) {
      ips.push(ev.ip);
      if (ips.length > 500) ips = ips.slice(-500);
      await env.AIFC_KV.put(dk, JSON.stringify(ips), { expirationTtl: 60 * 60 * 24 * 60 });
    }
  })());

  if (ev.question) tasks.push(pushList(env, 'stat:recent_q',
    { q: ev.question.slice(0, 200), area: ev.area || '', lang: ev.lang || '', ts: Date.now(), cached: !!ev.cached,
      latencyMs: ev.latencyMs || 0, ragCount: ev.ragCount || 0 }, 100));
  if (ev.negative) tasks.push(pushList(env, 'stat:negative_q', ev.negative, 50));
  ctx.waitUntil(Promise.all(tasks).catch(() => {}));
}

// ── Live data fetchers (free scraping) ────────────────────────────────────────
async function fetchAifcNews() {
  try {
    const res = await fetch('https://aifc.kz/', { cf: { cacheTtl: 3600 } });
    if (!res.ok) return [];
    const html = await res.text();
    const dates = [...html.matchAll(/(\d{2}\.\d{2}\.\d{4})/g)];
    const titles = [...html.matchAll(/<h[23][^>]*>([^<]{10,200})<\/h[23]>/gi)];
    return titles.slice(0, 8).map((m, i) => ({
      title: stripTags(m[1]).trim(), date: dates[i]?.[1] || '', url: 'https://aifc.kz/news/',
    })).filter(x => x.title.length > 10);
  } catch { return []; }
}

async function fetchAfsaNotices() {
  try {
    const res = await fetch('https://afsa.aifc.kz/notice-register/', { cf: { cacheTtl: 3600 } });
    if (!res.ok) return [];
    const html = await res.text();
    return extractBetween(html, '<tr', '</tr>').slice(0, 8)
      .map(r => ({ title: stripTags(r).slice(0, 150).trim(), url: 'https://afsa.aifc.kz/notice-register/' }))
      .filter(r => r.title.length > 10).slice(0, 5);
  } catch { return []; }
}

// ── RAG: retrieval ────────────────────────────────────────────────────────────
async function ragRetrieve(env, query) {
  try {
    const emb = await env.AI.run(EMBED_MODEL, { text: [query] });
    const vector = emb.data[0];
    const matches = await env.VECTORIZE.query(vector, { topK: 7, returnMetadata: 'all' });
    return (matches.matches || [])
      .filter(m => m.score > 0.42)
      .map(m => ({
        score: m.score,
        text: m.metadata?.text || '',
        act: m.metadata?.act || '',
        url: m.metadata?.url || '',
      }))
      .filter(m => m.text);
  } catch { return []; }
}

// Удаляет иероглифы/нелатинские письменности (CJK, кана, хангыль) — артефакт Llama
const CJK_RE = /[⺀-⻿　-〿぀-ヿ㄀-ㄯ㄰-㆏㐀-䶿一-鿿ꀀ-꓏가-힯豈-﫿＀-￯]/g;
function sanitizeText(s) {
  return (s || '').replace(CJK_RE, '');
}

// Английские ключевые термины по области права (для кросс-языкового RAG)
function areaKeywordsEn(area) {
  const map = {
    'Налоговое право': 'tax exemption corporate income tax CIT VAT substantial presence core income generating activities CIGA qualified employees operating expenses',
    'Корпоративное право': 'company incorporation shares shareholders directors articles of association partnership',
    'Финансовые услуги': 'financial services regulated activity licence prudential conduct of business AFSA collective investment scheme fund manager CIS Rules domestic fund foreign fund exempt fund specialist fund unit prospectus',
    'AML/KYC': 'anti money laundering counter terrorist financing customer due diligence KYC MLRO',
    'Трудовое право': 'employment contract employee working hours leave termination',
    'Разрешение споров': 'AIFC court arbitration mediation dispute resolution claim',
  };
  return map[area] || '';
}

function formatRag(chunks) {
  if (!chunks.length) return '';
  let s = `\n== РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ ИЗ ПОЛНЫХ ТЕКСТОВ АКТОВ (RAG) ==\n`;
  chunks.forEach((c, i) => {
    s += `\n[Фрагмент ${i + 1}] из «${c.act}» (${c.url}):\n«${c.text.slice(0, 1200)}»\n`;
  });
  s += `\nИспользуй эти фрагменты как первоисточник. Цитируй конкретные положения дословно, когда уместно.\n`;
  return s;
}

// ── Live context ──────────────────────────────────────────────────────────────
function formatLive(news, notices) {
  const today = new Date().toLocaleDateString('ru-RU');
  let s = '', count = 0;
  if (news.length) {
    s += `\nПоследние новости МФЦА (${today}):\n`;
    news.forEach(n => { s += `- ${n.date ? `[${n.date}] ` : ''}${n.title} → ${n.url}\n`; count++; });
  }
  if (notices.length) {
    s += `\nУведомления AFSA:\n`;
    notices.forEach(n => { s += `- ${n.title} → ${n.url}\n`; count++; });
  }
  return { ctx: count ? `\n== ДАННЫЕ В РЕАЛЬНОМ ВРЕМЕНИ ==\n${s}` : '', count };
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt({ area, lang, liveCtx, ragCtx, isFundQuery, isLawyerMode }) {
  const langHeader = lang === 'en'
    ? '🌐 LANGUAGE RULE (ABSOLUTE): Respond ONLY in English regardless of the language of source documents or RAG context. Sources in other languages are reference material only.'
    : '🌐 ЯЗЫК ОТВЕТА (АБСОЛЮТНОЕ ПРАВИЛО): Отвечай ИСКЛЮЧИТЕЛЬНО на русском языке кириллицей — НЕЗАВИСИМО от языка источников, актов и RAG-контекста. Английские источники — только основа анализа. Латиница только для названий актов, терминов и URL. ЗАПРЕЩЕНЫ иероглифы и любые нелатинские/некириллические символы.';
  const langFooter = lang === 'en'
    ? 'FINAL CHECK: Is your entire response in English? If not, rewrite it. NEVER output CJK or other non-Latin characters.'
    : 'ФИНАЛЬНАЯ ПРОВЕРКА: Весь ли ответ на русском языке? Если нет — перепиши. Недопустимы: китайские, японские, корейские и любые иные иероглифы.';

  return `${langHeader}

Ты — AIFC Legal Assistant Pro, самый точный, дисциплинированный и надёжный ИИ-эксперт по праву Международного финансового центра «Астана» (AIFC). Область права: ${area || 'Общее'}.

Ты работаешь исключительно на основе: English Common Law, AIFC Regulations, AFSA Rules, Guidance Notes, Practice Directions и Constitutional Statute of the AIFC. Право РК применяется только в зонах пересечения с AIFC.
${ragCtx}${liveCtx}
${CITATION_DB}
== ВСТРОЕННАЯ БАЗА АКТОВ МФЦА (название → URL) ==
${ACTS_INDEX}

════════════════════════════════════════════
КРИТИЧЕСКИЕ ПРАВИЛА (нарушение = недопустимо)
════════════════════════════════════════════

1. STRICT CITATIONS — ОБЯЗАТЕЛЬНО В КАЖДОМ ПРЕДЛОЖЕНИИ С НОРМОЙ
   - КАЖДОЕ предложение, содержащее юридическое утверждение, ЗАКАНЧИВАЕТСЯ ссылкой в квадратных скобках.
   - Формат: [Название акта, Rule X] или [Название акта, Part X, Rule Y](URL).
   - Примеры правильных ссылок:
       [AIFC Companies Regulations, Part 5, Rule 28]
       [AIFC Employment Regulations, Rule 18]
       [FSMR 2017, Part 3, Rule 31]
       [CIS Rules, Rule 4.2]
       [Substantial Presence Rules, п. 3.1]
   - Если раздел неизвестен точно — [Название акта, Part X] (не придумывать номер).
   - ЗАПРЕЩЕНО: абзац без единой ссылки []. ЗАПРЕЩЕНО: только название акта без номера части/правила.

2. ЖЁСТКОЕ РАЗДЕЛЕНИЕ ЮРИСДИКЦИЙ
   - Корпоративное право, акции, governance, регистрация, Articles of Association — только AIFC.
   - Право РК упоминай ТОЛЬКО в зонах пересечения (налоги, валютный контроль, трудовые отношения, казахстанские ТОО).
   - Всегда явно разделяй:
     «По праву AIFC: …»
     «По законодательству Республики Казахстан: …»
     «Пересечение юрисдикций: …»
   - ЗАПРЕЩЕНО смешивать нормы AIFC и РК в одном предложении без маркировки.

3. HARDCODED FACTS — ЗАПРЕЩЕНО ИЗМЕНЯТЬ ИЛИ ОКРУГЛЯТЬ
   ┌─ КАПИТАЛ ─────────────────────────────────────────────────────────────────┐
   │ Private Company = НЕТ минимального уставного капитала [Companies Regs, Part 5]│
   │ Public Company  = 25 000 USD оплаченного капитала ДО регистрации [Rule 28]   │
   │ LLP / LP        = НЕТ минимального капитала                                  │
   └───────────────────────────────────────────────────────────────────────────┘
   ┌─ СРОКИ РЕГИСТРАЦИИ ────────────────────────────────────────────────────────┐
   │ Стандарт: 10–15 рабочих дней [AFSA Registration Process]                    │
   │ Сложные кейсы (лицензия, фонд, редомициляция): 20–30 рабочих дней           │
   │ ЗАПРЕЩЕНО писать: «1–3 дня», «5 дней», «неделя», «быстро»                   │
   └───────────────────────────────────────────────────────────────────────────┘
   ┌─ SUBSTANCE (три обязательных критерия) ────────────────────────────────────┐
   │ 1. Qualified Employees (квалифицированные сотрудники в МФЦА)                 │
   │ 2. Operating Expenditure (реальные операционные расходы в МФЦА)              │
   │ 3. CIGA — Core Income Generating Activities (выполняются в МФЦА)             │
   │ Источник: [Substantial Presence Rules, п. 3.1, 3.2, Приложение]              │
   │ НЕТ фиксированного числа сотрудников — оценка по существу деятельности       │
   │ Нарушение → КПН 20%, штрафы, исключение из МФЦА, потеря льгот до 2066 г.    │
   └───────────────────────────────────────────────────────────────────────────┘
   ┌─ ЛИЦЕНЗИРОВАНИЕ AFSA ──────────────────────────────────────────────────────┐
   │ Лицензия НЕ нужна: IT-консалтинг, юруслуги, стратегический консалтинг,       │
   │   management consulting, HR, семейный офис (только своя семья) [FSMR, Sch.3] │
   │ Лицензия ОБЯЗАТЕЛЬНА: управление активами, брокераж, фонды (Fund Manager),   │
   │   банкинг, страхование, кастодиальная деятельность [FSMR, Part 3, Rule 31]   │
   └───────────────────────────────────────────────────────────────────────────┘
   ┌─ НАЛОГИ — ДИВИДЕНДЫ ──────────────────────────────────────────────────────┐
   │ AIFC-холдинг ← дивиденды от ТОО РК: КПН у источника 15% (по умолчанию)    │
   │ Ставка 0%: при соблюдении Substance Rules или СИДН [НК РК, ст. 645, п. 10] │
   └───────────────────────────────────────────────────────────────────────────┘
   ┌─ ТРУДОВЫЕ НОРМЫ ───────────────────────────────────────────────────────────┐
   │ Испытательный срок: максимум 3 месяца [Employment Regulations, Rule 8]      │
   │ Ежегодный отпуск: минимум 20 рабочих дней [Employment Regulations, Rule 18] │
   │ Уведомление об увольнении: минимум 1 месяц [Employment Regulations, Rule 14]│
   └───────────────────────────────────────────────────────────────────────────┘
   ┌─ НАЛОГОВЫЕ ЛЬГОТЫ ─────────────────────────────────────────────────────────┐
   │ Срок льгот: до 01.01.2066 [Конституционный закон РК № 438-V, ст. 6]        │
   └───────────────────────────────────────────────────────────────────────────┘${isFundQuery ? `
   ┌─ ФОНДЫ (CIS RULES — ПРИОРИТЕТ) ───────────────────────────────────────────┐
   │ Регистрация фонда: [CIS Rules, Rule 4.2–4.3]                                │
   │ Типы: Exempt / Non-Exempt / Specialist Fund [CIS Rules, Rule 2.2, 2.4]      │
   │ Источник: https://orderly.myafsa.com/articles/collectiveinvestmentschemerules│
   └───────────────────────────────────────────────────────────────────────────┘` : ''}

4. ZERO TOLERANCE TO HALLUCINATIONS
   - НИКОГДА не придумывай нормы, номера правил, сроки, суммы или требования — даже если очень похожи на реальные.
   - Лучше сказать «информация недостаточна» или «рекомендую уточнить», чем дать приблизительный или предполагаемый ответ.
   - Если источник не найден в RAG, Citation DB или ACTS_INDEX — это значит его там нет, а не повод придумать похожий.

5. ОБЯЗАТЕЛЬНЫЙ АНАЛИЗ РИСКОВ
   На вопросах про substance, лицензирование, «матрёшку», холдинги, AML/KYC, дивиденды, налоговые льготы, фонды, санкции, офшоры — ОБЯЗАТЕЛЬНО указывай:
   - 🚩 Красные флаги (конкретные нарушения или риски)
   - Уровень риска: Низкий / Средний / Высокий / Критический
   - Возможные последствия (включая потерю налоговых льгот до 2066 года, штрафы, отзыв лицензии, уголовная ответственность при AML)
   - Substance Rules: всегда оценивай по CIGA, квалификации и активности директора, расходам, сотрудникам, офису. Давай персональный risk assessment.

6. СТИЛЬ ОТВЕТА
   - ${isLawyerMode ? '🔬 РЕЖИМ ЮРИСТА АКТИВЕН: углублённый технический анализ — полные ссылки на нормы, коллизии, ratio decidendi, риски для due diligence. Профессиональная юридическая терминология.' : '👤 Режим предпринимателя: прямой вывод → пошаговые действия → таблицы/чек-листы → риски → рекомендация уточнить. Без избыточного юридического жаргона.'}
   - Таблицы и чек-листы — для сравнений, документов, требований.
   - При анализе уставов и договоров — сравнивай со Standard Articles (Schedule 5 для Private Company, Schedule 6 для Public Company).
   - При генерации документов — предоставляй английскую версию с глоссарием ключевых терминов на русском. Всегда указывай, что это шаблон.
   - Если вопрос неполный — задай 1–2 уточняющих вопроса ПЕРЕД полным ответом и добавь:
     ЧИПЫ: Вариант А | Вариант Б | Вариант В | Другое
     (строку ЧИПЫ: только к уточняющим вопросам, не к полным ответам)

7. ЕСЛИ ИНФОРМАЦИЯ НЕ НАЙДЕНА — ЧЕСТНОСТЬ, НЕ ГАЛЛЮЦИНАЦИИ
   - Если точной нормы нет в RAG-базе, Citation DB или ACTS_INDEX:
     «В доступных материалах AIFC по этому конкретному сценарию прямого регулирования не обнаружено. Рекомендую уточнить детали или обратиться к лицензированному Legal Adviser».
   - Не извиняйся эмоционально. Нейтральный деловой тон.

8. ПРИОРИТЕТ ИСТОЧНИКОВ
   Фрагменты RAG → Живые данные aifc.kz → Citation DB → ACTS_INDEX → знания модели.
   НИКОГДА не выдумывай URL. Если в новостях есть изменения по теме — предупреди с ⚠️.

════════════════════════════════════════════
СТРУКТУРА ПОЛНОГО ОТВЕТА
════════════════════════════════════════════
**Вывод:** [1–2 предложения — прямой ответ]

**Применимые нормы:**
- [Акт, Rule/Section X](URL) — суть нормы

**Анализ:**
[Детальный разбор с цитатами]

**По праву AIFC / По законодательству РК:** *(только если затронуты обе юрисдикции)*

**Риски и красные флаги:** *(обязательно для тем из Правила 5)*
- 🚩 [риск] — Уровень: Критический/Высокий/Средний/Низкий

**Рекомендации:**
[Практические шаги]

**Это общая информация, подготовленная ИИ на основе открытых источников AIFC. Для официального юридического заключения и совершения действий обязательно обращайтесь к лицензированному Legal Adviser AIFC / AFSA.**

${langFooter}`;
}

// ── Rate limiting (KV) ────────────────────────────────────────────────────────
async function checkRateLimit(env, ip) {
  if (!env.AIFC_KV || !ip) return true;
  const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
  const cur = parseInt(await env.AIFC_KV.get(key) || '0', 10);
  if (cur >= RATE_LIMIT_PER_MIN) return false;
  await env.AIFC_KV.put(key, String(cur + 1), { expirationTtl: 120 });
  return true;
}

// ── Link verification ─────────────────────────────────────────────────────────
function extractUrls(text) {
  const seen = new Set();
  const m = [
    ...text.matchAll(/\]\((https?:\/\/[^)]+)\)/g),
    ...text.matchAll(/(?<!\()(https?:\/\/(?:aifc\.kz|adilet\.zan\.kz|afsa\.aifc\.kz|publicreg\.myafsa\.com)[^\s),>"]+)/g),
  ];
  return m.map(x => x[1] || x[0]).filter(u => !seen.has(u) && seen.add(u)).slice(0, 20);
}
async function verifyUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cf: { cacheTtl: 3600 }, signal: AbortSignal.timeout(5000) });
    return [url, { ok: res.ok, status: res.status }];
  } catch { return [url, { ok: false, status: 0 }]; }
}
async function verifyLinks(text) {
  const urls = extractUrls(text);
  if (!urls.length) return {};
  return Object.fromEntries(await Promise.all(urls.map(verifyUrl)));
}

// ── Response cache (KV) ───────────────────────────────────────────────────────
const CACHE_TTL = 21600; // 6 часов

function normalizeQuestion(q) {
  return q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

async function cacheKey(q, area, lang) {
  const raw = `${lang}|${area}|${normalizeQuestion(q)}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return 'qa:' + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Поток из готового кэшированного ответа (мгновенно)
function streamFromCache(cached) {
  const enc = new TextEncoder();
  const msgId = crypto.randomUUID();
  const text = sanitizeText(cached.text || '');
  const out = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(JSON.stringify({
        type: 'meta', msgId, liveCount: cached.liveCount || 0,
        ragCount: (cached.ragSources || []).length, ragSources: cached.ragSources || [], cached: true,
      }) + '\n'));
      // Отдаём текст крупными кусками для эффекта печати, но почти мгновенно
      const step = 24;
      for (let i = 0; i < text.length; i += step) {
        controller.enqueue(enc.encode(JSON.stringify({ type: 'token', t: text.slice(i, i + step) }) + '\n'));
      }
      controller.enqueue(enc.encode(JSON.stringify({
        type: 'done', linkStatus: cached.linkStatus || {}, brokenCount: cached.brokenCount || 0,
      }) + '\n'));
      controller.close();
    },
  });
  return new Response(out, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', ...CORS } });
}

// ── Streaming chat handler ────────────────────────────────────────────────────
async function handleChat(request, env, ctx) {
  const chatStart = Date.now();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const country = request.headers.get('cf-ipcountry') || '';
  if (!(await checkRateLimit(env, ip)))
    return json({ error: 'Слишком много запросов. Подождите минуту.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { messages = [], area, lang } = body;
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // Кэш: только для одиночных вопросов (без контекста диалога) длиной 8–400 симв.
  const singleTurn = messages.filter(m => m.role === 'user').length === 1 && messages.length <= 2;
  const cacheable = singleTurn && lastUser.length >= 8 && lastUser.length <= 400;
  let ck = null;
  if (cacheable && env.AIFC_KV) {
    ck = await cacheKey(lastUser, area, lang);
    const hit = await env.AIFC_KV.get(ck);
    if (hit) {
      try {
        const cached = JSON.parse(hit);
        // не кэшируем уточняющие вопросы (с чипами)
        if (cached.text && !/^ЧИПЫ:/m.test(cached.text)) {
          track(env, ctx, { type: 'chat', cache_hit: 1, area, question: lastUser, cached: true });
          return streamFromCache(cached);
        }
      } catch {}
    }
  }

  // Parallel: RAG retrieval + live data
  // Английские якорные термины по области права — улучшают кросс-языковой поиск
  const isFundQuery = /фонд|фонда|фондов|фондам|фонде|инвестфонд|cis rules|коллективн|паевой|fund manager|domestic fund|foreign fund|exempt fund|specialist fund|unit|паи|пай|управляющ.*компан/i.test(lastUser);
  // Режим юриста: явная команда или профессиональная терминология
  const isLawyerMode = /режим юриста|lawyer mode|ratio decidendi|obiter dictum|ultra vires|mens rea|fiduciary|indemnification|representations and warranties|material adverse change|conditions precedent/i
    .test(messages.map(m => m.content).join(' '));
  const cisBoost = isFundQuery ? 'CIS Rules collective investment scheme fund manager domestic fund foreign fund exempt specialist fund registration prospectus unit dealing' : '';
  const ragQuery = `${area || ''} ${lastUser} ${areaKeywordsEn(area)} ${cisBoost}`.trim();
  const [ragChunks, news, notices] = await Promise.all([
    ragRetrieve(env, ragQuery),
    fetchAifcNews(),
    fetchAfsaNotices(),
  ]);
  const { ctx: liveCtx, count: liveCount } = formatLive(news, notices);
  const ragCtx = formatRag(ragChunks);
  const systemPrompt = buildSystemPrompt({ area, lang, liveCtx, ragCtx, isFundQuery, isLawyerMode });

  const aiStream = await aiChat(env,
    [{ role: 'system', content: systemPrompt }, ...messages],
    { maxTokens: 2048, temperature: 0.2, stream: true }
  );

  const msgId = crypto.randomUUID();
  const ragSources = ragChunks.map(c => ({ act: c.act, url: c.url }));

  // Transform Workers-AI SSE → our NDJSON protocol, accumulate full text for KV
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '', fullText = '';

  const out = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({
        type: 'meta', msgId, liveCount, ragCount: ragChunks.length, ragSources,
      }) + '\n'));

      const reader = aiStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const tok = sanitizeText(JSON.parse(data).response || '');
              if (tok) { fullText += tok; controller.enqueue(encoder.encode(JSON.stringify({ type: 'token', t: tok }) + '\n')); }
            } catch {}
          }
        }
      } catch (e) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: String(e) }) + '\n'));
      }

      // Verify links after generation
      const linkStatus = await verifyLinks(fullText);
      const brokenCount = Object.values(linkStatus).filter(v => !v.ok).length;
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', linkStatus, brokenCount }) + '\n'));

      // Persist Q/A for rating context (24h)
      if (env.AIFC_KV) ctx.waitUntil(env.AIFC_KV.put(`msg:${msgId}`,
        JSON.stringify({ q: lastUser, area, ts: Date.now() }), { expirationTtl: 86400 }));

      // Сохраняем в кэш (только полные ответы, не уточняющие вопросы)
      if (ck && env.AIFC_KV && fullText.length > 200 && !/^ЧИПЫ:/m.test(fullText)) {
        ctx.waitUntil(env.AIFC_KV.put(ck, JSON.stringify({
          text: fullText, linkStatus, brokenCount, liveCount, ragSources,
        }), { expirationTtl: CACHE_TTL }));
      }

      // Метрика: сгенерированный ответ (не из кэша)
      track(env, ctx, {
        type: 'chat', area, lang, question: lastUser, neurons: NEURON_COST.chat,
        ip, country, latencyMs: Date.now() - chatStart,
        isFundQuery, isLawyerMode, ragCount: ragChunks.length,
      });

      controller.close();
    },
  });

  return new Response(out, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', ...CORS } });
}

// ── Compliance check handler (AI + RAG over AIFC rules) ───────────────────────
async function handleCompliance(request, env, ctx) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!(await checkRateLimit(env, ip)))
    return json({ error: 'Слишком много запросов. Подождите минуту.' }, 429);

  let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { text = '', title = '', regulation = '', area = 'Корпоративное право' } = body;
  if (text.trim().length < 50) return json({ error: 'Текст слишком короткий для проверки.' }, 400);

  // Ограничиваем объём для контекста модели
  const doc = text.slice(0, 18000);
  const truncated = text.length > 18000;

  // RAG по релевантным нормам.
  // Режим «все области»: ищем нормы по содержанию самого документа,
  // двумя запросами (начало и середина текста) для более широкого покрытия.
  const autoMode = area === 'auto' || !regulation;
  let ragChunks;
  if (autoMode) {
    const head = doc.slice(0, 1200);
    const mid = doc.length > 3000 ? doc.slice(Math.floor(doc.length / 2), Math.floor(doc.length / 2) + 1200) : '';
    const [r1, r2] = await Promise.all([
      ragRetrieve(env, `${head} mandatory requirements obligations`),
      mid ? ragRetrieve(env, `${mid} mandatory requirements obligations`) : Promise.resolve([]),
    ]);
    const seen = new Set();
    ragChunks = [...r1, ...r2].filter(c => {
      const k = c.act + '|' + c.text.slice(0, 80);
      if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 7);
  } else {
    ragChunks = await ragRetrieve(env, `${title} ${regulation} mandatory requirements obligations`.trim());
  }
  const ragCtx = ragChunks.length
    ? '\n== ФРАГМЕНТЫ ПРИМЕНИМЫХ АКТОВ (RAG) ==\n' + ragChunks.map((c, i) =>
        `[${i + 1}] из «${c.act}» (${c.url}):\n«${c.text.slice(0, 700)}»`).join('\n\n')
    : '';

  const scopeLine = autoMode
    ? `Пользователь предоставил документ «${title || 'Пользовательский документ'}». Проверь его по ВСЕМ применимым областям права МФЦА (корпоративное, финансовые услуги, налоговое в т.ч. substantial presence, AML/CTF, трудовое, споры) — сам определи, какие нормы применимы к этому документу.`
    : `Пользователь модифицировал официальный шаблон «${title}», который должен соответствовать: ${regulation}.`;

  const systemPrompt = `Ты — комплаенс-ревьюер по праву МФЦА (Международного финансового центра «Астана»). ${scopeLine}
${ragCtx}

ЗАДАЧА: проверить, остаётся ли модифицированный документ В РАМКАХ обязательных требований МФЦА.
Проанализируй текст и верни структурированный ответ строго в формате Markdown на русском языке:

## ⚖️ Итог проверки
[Одно предложение: соответствует / есть замечания / есть нарушения]

## ❌ Нарушения обязательных норм
[Список положений, противоречащих императивным требованиям МФЦА, или «Не выявлено». Для каждого — что нарушено и ссылка на норму [Название](URL).]

## ⚠️ Риски и замечания
[Спорные или рискованные изменения, которые стоит проверить у юриста, или «Не выявлено».]

## ✅ Рекомендации
[Конкретные правки, чтобы привести документ в соответствие.]

Опирайся на фрагменты RAG и встроенную базу актов. Не выдумывай нормы и URL. Будь конкретным, ссылайся на статьи/разделы, где возможно.`;

  try {
    const response = await aiChat(env, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Проверь следующий документ:\n\n${doc}` },
      ], { maxTokens: 1500, temperature: 0.1 });
    const analysis = sanitizeText(response.response || '');
    const linkStatus = await verifyLinks(analysis);
    track(env, ctx, { type: 'compliance', area: autoMode ? 'Все области' : area, neurons: NEURON_COST.compliance });
    return json({
      analysis, truncated,
      ragCount: ragChunks.length,
      ragSources: ragChunks.map(c => ({ act: c.act, url: c.url })),
      linkStatus,
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ── Rating handler ────────────────────────────────────────────────────────────
async function handleRate(request, env, ctx) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad' }, 400); }
  const { msgId, vote } = body;
  if (!msgId || !['up', 'down'].includes(vote)) return json({ error: 'bad' }, 400);
  if (env.AIFC_KV) {
    const key = `rate:${vote}`;
    const cur = parseInt(await env.AIFC_KV.get(key) || '0', 10);
    await env.AIFC_KV.put(key, String(cur + 1));
    await env.AIFC_KV.put(`vote:${msgId}`, vote, { expirationTtl: 2592000 });
    // Дневная метрика + сбор вопросов с негативной оценкой для анализа
    let negative = null;
    if (vote === 'down') {
      try {
        const ctxData = JSON.parse(await env.AIFC_KV.get(`msg:${msgId}`) || 'null');
        if (ctxData?.q) negative = { q: ctxData.q.slice(0, 200), area: ctxData.area || '', ts: Date.now() };
      } catch {}
    }
    track(env, ctx, { type: vote === 'up' ? 'vote_up' : 'vote_down', negative });
  }
  return json({ ok: true });
}

// ── Changes (cron monitor) read handler ───────────────────────────────────────
async function handleChanges(env) {
  if (!env.AIFC_KV) return json({ changes: [] });
  const raw = await env.AIFC_KV.get('changes');
  return json({ changes: raw ? JSON.parse(raw) : [] });
}

// ── Pageview beacon (public, lightweight) ─────────────────────────────────────
async function handleTrack(request, env, ctx) {
  let body = {}; try { body = await request.json(); } catch {}
  const country = request.cf?.country || '??';
  const patch = { pageview: 1 };
  // считаем страну
  if (env.AIFC_KV && ctx) {
    ctx.waitUntil((async () => {
      await bumpDaily(env, patch);
      const key = `stat:geo`;
      let geo = {}; try { geo = JSON.parse(await env.AIFC_KV.get(key) || '{}'); } catch {}
      geo[country] = (geo[country] || 0) + 1;
      await env.AIFC_KV.put(key, JSON.stringify(geo), { expirationTtl: 60 * 60 * 24 * 60 });
    })().catch(() => {}));
  }
  return json({ ok: true });
}

// ── Stats aggregate (protected) ───────────────────────────────────────────────
async function handleStats(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== ADMIN_SECRET) return json({ error: 'forbidden' }, 403);
  if (!env.AIFC_KV) return json({ error: 'no storage' }, 500);

  // последние 14 дней
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = `stat:${dayKey(d)}`;
    let v = {}; try { v = JSON.parse(await env.AIFC_KV.get(key) || '{}'); } catch {}
    days.push({ date: dayKey(d), ...v });
  }
  // Уникальные IP за каждый день
  const ipCounts = await Promise.all(
    days.map(d => env.AIFC_KV.get(`stat:ips:${d.date}`)
      .then(x => { try { return JSON.parse(x || '[]').length; } catch { return 0; } }))
  );
  days.forEach((d, i) => { d.unique_users = ipCounts[i]; });

  const [recentQ, negativeQ, upTotal, downTotal] = await Promise.all([
    env.AIFC_KV.get('stat:recent_q').then(x => { try { return JSON.parse(x || '[]'); } catch { return []; } }),
    env.AIFC_KV.get('stat:negative_q').then(x => { try { return JSON.parse(x || '[]'); } catch { return []; } }),
    env.AIFC_KV.get('rate:up').then(x => parseInt(x || '0', 10)),
    env.AIFC_KV.get('rate:down').then(x => parseInt(x || '0', 10)),
  ]);

  // агрегаты за период
  const areas = {}, langs = {}, countries = {};
  days.forEach(d => {
    if (d.areas)     for (const [k, v] of Object.entries(d.areas))     areas[k]     = (areas[k] || 0) + v;
    if (d.langs)     for (const [k, v] of Object.entries(d.langs))     langs[k]     = (langs[k] || 0) + v;
    if (d.countries) for (const [k, v] of Object.entries(d.countries)) countries[k] = (countries[k] || 0) + v;
  });

  const sum = (f) => days.reduce((s, d) => s + (d[f] || 0), 0);
  const todayNeurons = days[days.length - 1].neurons || 0;
  const totalChats = sum('chat') || 1;
  const avgLatencyMs = Math.round(sum('latency_total') / totalChats);

  return json({
    period: '14d',
    days,
    totals: {
      chat: sum('chat'), compliance: sum('compliance'), cache_hit: sum('cache_hit'),
      pageview: sum('pageview'), vote_up: sum('vote_up'), vote_down: sum('vote_down'),
      neurons: sum('neurons'), unique_users: sum('unique_users'),
      fund_queries: sum('fund_query'), lawyer_mode: sum('lawyer_mode'),
      rag_hits: sum('rag_hits'),
    },
    avgLatencyMs,
    ratingsAllTime: { up: upTotal, down: downTotal },
    today: { neurons: todayNeurons, budget: DAILY_NEURON_BUDGET, remaining: Math.max(0, DAILY_NEURON_BUDGET - todayNeurons) },
    areas, langs, countries, recentQ, negativeQ,
  });
}

// ── AI analyst: analyse metrics, suggest improvements & monetization ──────────
async function handleAnalyze(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== ADMIN_SECRET) return json({ error: 'forbidden' }, 403);

  // собираем те же агрегаты, что и /stats
  const statsRes = await handleStats(request, env);
  const stats = await statsRes.json();
  if (stats.error) return json(stats, 403);

  const brief = {
    totals: stats.totals,
    ratingsAllTime: stats.ratingsAllTime,
    todayQuota: stats.today,
    areas: stats.areas,
    topCountries: Object.entries(stats.geo).sort((a, b) => b[1] - a[1]).slice(0, 6),
    last14days: stats.days.map(d => ({ date: d.date, chat: d.chat || 0, pageview: d.pageview || 0, down: d.vote_down || 0 })),
    recentQuestions: (stats.recentQ || []).slice(0, 30).map(q => q.q),
    negativeQuestions: (stats.negativeQ || []).slice(0, 15).map(q => q.q),
  };

  const systemPrompt = `Ты — продуктовый и growth-аналитик SaaS-сервиса «МФЦА Правовой Ассистент» (ИИ-консультант по праву МФЦА для юристов и бизнеса в Казахстане). Сервис готовится к платному запуску (тариф ~5000₸/мес, провайдер ioka, фикс-расходы ~45000₸/мес как ИП, точка безубыточности ~15 подписчиков).

Тебе дают реальные метрики использования. Проанализируй их и дай КОНКРЕТНЫЕ, практичные выводы на русском языке в формате Markdown:

## 📊 Ключевые наблюдения
[Что говорят цифры: тренды трафика, активность, соотношение генераций и кэша, оценки]

## ⚠️ Проблемы и риски
[Где проблемы: негативные оценки и их темы, расход квоты ИИ, провалы вовлечённости]

## 🎯 Улучшения сервиса
[Что доработать в продукте/контенте, исходя из популярных и проблемных вопросов]

## 💰 Монетизация и рост
[Конкретные идеи по тарифам, удержанию, привлечению, исходя из данных и контекста запуска]

Будь конкретным и опирайся ТОЛЬКО на предоставленные цифры. Если данных мало — честно скажи об этом и предложи, что отслеживать. Не выдумывай метрики.`;

  try {
    const response = await aiChat(env, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Метрики использования сервиса (последние 14 дней):\n\n${JSON.stringify(brief, null, 2)}` },
      ], { maxTokens: 1800, temperature: 0.3 });
    return json({ analysis: sanitizeText(response.response || ''), brief });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ── RAG ingestion handler ─────────────────────────────────────────────────────
function chunkText(text, size = 1200, overlap = 300) {
  // Нарезка с перекрытием + выравнивание по границам абзацев/правил.
  // Overlap 300 симв. гарантирует, что норма, разрезанная на стыке чанков,
  // попадёт целиком хотя бы в один из них.
  const step = size - overlap;
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = i + size;
    if (end < text.length) {
      // Сдвигаем конец вперёд до ближайшего переноса строки (макс +200 симв.)
      // чтобы не рвать правило посередине предложения
      const nl = text.indexOf('\n', end);
      if (nl !== -1 && nl - end <= 200) end = nl + 1;
    }
    chunks.push(text.slice(i, end));
    if (end >= text.length) break;
    i += step;
  }
  return chunks;
}

async function handleIngest(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== INGEST_SECRET) return json({ error: 'forbidden' }, 403);
  const start = parseInt(url.searchParams.get('start') || '0', 10);
  const count = parseInt(url.searchParams.get('count') || '2', 10);
  const slice = ACTS.slice(start, start + count);
  let totalChunks = 0;
  const report = [];

  for (let ai = 0; ai < slice.length; ai++) {
    const [name, actUrl, cat] = slice[ai];
    try {
      const res = await fetch(actUrl, { cf: { cacheTtl: 86400 } });
      if (!res.ok) { report.push({ name, ok: false, status: res.status }); continue; }
      const text = stripTags(await res.text());
      // Limit: keep first ~20k chars to bound CPU
      const chunks = chunkText(text.slice(0, 20000)).filter(c => c.trim().length > 100);
      const globalIdx = start + ai;
      // Embed in sub-batches
      for (let b = 0; b < chunks.length; b += 8) {
        const batch = chunks.slice(b, b + 8);
        const emb = await env.AI.run(EMBED_MODEL, { text: batch });
        const vectors = emb.data.map((values, k) => ({
          id: `act${globalIdx}-${b + k}`,
          values,
          metadata: { act: name, url: actUrl, cat, text: batch[k].slice(0, 1200) },
        }));
        await env.VECTORIZE.upsert(vectors);
        totalChunks += vectors.length;
      }
      report.push({ name, ok: true, chunks: chunks.length });
    } catch (e) {
      report.push({ name, ok: false, error: String(e) });
    }
  }

  const nextStart = start + count;
  return json({ processed: slice.length, totalChunks, nextStart, done: nextStart >= ACTS.length, report });
}

// ── Ingest arbitrary provided text into Vectorize (manual knowledge additions) ─
async function handleIngestText(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { key, id, act, url, cat = 'Налоговое право', text = '' } = body;
  if (key !== INGEST_SECRET) return json({ error: 'forbidden' }, 403);
  if (!id || !act || !text || text.length < 50) return json({ error: 'id, act, text required' }, 400);

  const chunks = chunkText(text.slice(0, 40000)).filter(c => c.trim().length > 80);
  let total = 0;
  for (let b = 0; b < chunks.length; b += 8) {
    const batch = chunks.slice(b, b + 8);
    const emb = await env.AI.run(EMBED_MODEL, { text: batch });
    const vectors = emb.data.map((values, k) => ({
      id: `${id}-${b + k}`,
      values,
      metadata: { act, url: url || '', cat, text: batch[k].slice(0, 1000) },
    }));
    await env.VECTORIZE.upsert(vectors);
    total += vectors.length;
  }
  return json({ ok: true, id, act, chunks: chunks.length, upserted: total });
}

// ── Cron: monitor act category pages for changes ──────────────────────────────
async function runMonitor(env) {
  if (!env.AIFC_KV) return;
  const changes = JSON.parse(await env.AIFC_KV.get('changes') || '[]');
  for (const [name, actUrl] of ACTS.slice(0, 20)) {  // sample to bound CPU
    try {
      const res = await fetch(actUrl, { cf: { cacheTtl: 0 } });
      if (!res.ok) continue;
      const html = await res.text();
      // hash the "last updated"-ish signature: length + first 2000 chars of stripped text
      const sig = String(stripTags(html).slice(0, 3000).length);
      const prevKey = `mon:${actUrl}`;
      const prev = await env.AIFC_KV.get(prevKey);
      if (prev && prev !== sig) {
        changes.unshift({ act: name, url: actUrl, date: new Date().toISOString().slice(0, 10) });
      }
      await env.AIFC_KV.put(prevKey, sig);
    } catch {}
  }
  await env.AIFC_KV.put('changes', JSON.stringify(changes.slice(0, 50)));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Router
// ═══════════════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/changes') return handleChanges(env);
    if (request.method === 'GET' && path === '/ingest') return handleIngest(request, env);
    if (request.method === 'GET' && path === '/stats') return handleStats(request, env);
    if (request.method === 'GET' && path === '/analyze') return handleAnalyze(request, env);
    if (request.method !== 'POST' && path !== '/') return new Response('Not found', { status: 404 });

    if (path === '/track') return handleTrack(request, env, ctx);
    if (path === '/rate') return handleRate(request, env, ctx);
    if (path === '/compliance') return handleCompliance(request, env, ctx);
    if (path === '/ingest') return handleIngest(request, env);
    if (path === '/ingest-text') return handleIngestText(request, env);
    // default: chat (streaming)
    try {
      return await handleChat(request, env, ctx);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMonitor(env));
  },
};
