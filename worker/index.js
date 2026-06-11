// ═══════════════════════════════════════════════════════════════════════════
//  МФЦА Правовой Ассистент — Cloudflare Worker (backend)
//  Возможности: чат со стримингом · RAG (Vectorize) · верификация ссылок ·
//  рейтинг ответов (KV) · rate-limiting · cron-мониторинг изменений в актах
// ═══════════════════════════════════════════════════════════════════════════

// ═══ LAUNCH-ФЛАГ ═══
// false = пред-релиз: ПОЛНАЯ телеметрия (текст запросов, сырые IP) для отладки/тестов.
// true  = публичный релиз: session-only (без текста запросов, IP только хешем) под Privacy Policy.
// Флипни в true ОДНОВРЕМЕННО с публикацией Политики конфиденциальности на сайте.
const PUBLIC_RELEASE = false;

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
  // ── Расширение базы: валюта, ликвидация, миграция, контракты, иерархия норм ──
  ['AIFC Rules on Currency Regulation and Provision of Information','https://aifc.kz/legal-framework/aifc-rules-on-currency-regulation-and-provision-of-information-in-the-aifc/','Валютное регулирование'],
  ['AIFC Insolvency Regulations','https://aifc.kz/legal-framework/aifc-insolvency-regulations/','Несостоятельность и ликвидация'],
  ['Insolvency Rules','https://aifc.kz/legal-framework/insolvency-rules/','Несостоятельность и ликвидация'],
  ['Terms and Procedures for Entry into RK for Foreign Nationals (AIFC)','https://aifc.kz/legal-framework/the-terms-of-and-procedures-for-entry-into-the-republic-of-kazakhstan-and-leaving-the-republic-of-kazakhstan-for-foreign-nationals-and-stateless-persons-coming-to-kazakhstan-to-conduct-activities-i/','Миграция'],
  ['AIFC Contract Regulations','https://aifc.kz/legal-framework/aifc-contract-regulations/','Договорное право'],
  ['AIFC Regulations on Obligations','https://aifc.kz/legal-framework/aifc-regulations-on-obligations/','Договорное право'],
  ['AIFC Regulations on Damages and Remedies','https://aifc.kz/legal-framework/aifc-regulations-on-damages-and-remedies/','Договорное право'],
  ['AIFC Personal Property Regulations','https://aifc.kz/legal-framework/aifc-personal-property-regulations/','Договорное право'],
  ['AIFC Regulations on AIFC Acts','https://aifc.kz/legal-framework/aifc-regulations-on-aifc-acts/','Иерархия актов МФЦА'],
  // ── Доп. категории: трасты, интеллектуальная собственность, сборы, платёжные системы ──
  ['AIFC Trust Regulations','https://aifc.kz/legal-framework/aifc-trust-regulations/','Трасты'],
  ['AIFC Intellectual Property Regulations','https://aifc.kz/legal-framework/aifc-intellectual-property-regulations/','Интеллектуальная собственность'],
  ['Fees Rules','https://aifc.kz/legal-framework/fees-rules/','Сборы и пошлины'],
  ['AIFC Payment System Settlement Finality Regulations','https://aifc.kz/legal-framework/aifc-payment-system-settlement-finality-regulations/','Платёжные системы'],
  ['AIFC Netting Regulations','https://aifc.kz/legal-framework/aifc-netting-regulations/','Платёжные системы'],
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
• Классы акций и особые права (включая veto): Standard Articles (Schedule 5) по умолчанию НЕ содержат таких положений, но компания ВПРАВЕ отступить от типового устава и создать классы акций с особыми правами [AIFC Companies Regulations, Part 5; Companies Rules — раздел о классах акций]. Изменения устава подлежат регистрации у Registrar. ВАЖНО: право вето на крупные сделки/дивиденды чаще целесообразнее оформлять в Shareholder Agreement, а не в Articles (гибче, меньше риска при due diligence и продаже компании). НЕ указывай конкретный номер раздела о классах акций, если он не подтверждён RAG.

ФИНАНСОВЫЕ УСЛУГИ — ЛИЦЕНЗИРОВАНИЕ:
• Обязанность лицензирования: AIFC Financial Services and Markets Regulations (FSMR) 2017, Part 3, Rule 31 — осуществление регулируемой деятельности без разрешения запрещено.
• Виды регулируемой деятельности: FSMR 2017, Schedule 1 — полный перечень: управление активами, брокерские услуги, кастодиальная деятельность, банкинг, страхование, управление фондами.
• Консультационная деятельность (без управления активами): FSMR 2017, Schedule 3 — юридический, управленческий и стратегический консалтинг НЕ является регулируемой деятельностью AFSA.
• Условия получения лицензии: AFSA Authorisation Rules (Conduct of Business Rules), Rule 2.1 — заявитель должен соответствовать критериям «fit and proper».

НАЛОГОВЫЕ ЛЬГОТЫ — SUBSTANCE:
• Основание льготы: Конституционный закон РК «О МФЦА» от 07.12.2015 № 438-V, ст. 6 — освобождение от КПН и НДС до 01.01.2066.
• Условия substance: Rules on Substantial Presence of AIFC Participants (CIT/VAT), п. 3.1 (Qualified Employees), п. 3.2 (Operating Expenditure), Приложение (таблица CIGA по видам деятельности).
• Дивиденды от КЗ-компаний в МФЦА: Налоговый кодекс РК, ст. 645, п. 10 — ставка 15% у источника, если нет освобождения по СИДН или Substance Rules.
• Последствия нарушения substance (например, длительное отсутствие CIGA): потеря налоговых льгот (КПН/НДС) и доначисление, штрафы, в крайнем случае — принудительный Strike Off (исключение из реестра). При этом AFSA, как правило, СНАЧАЛА предоставляет срок на устранение нарушения (remediation) до применения санкций; Strike Off — крайняя мера. Для Pure Equity Holding последствия мягче (сниженные требования). НЕ указывай конкретный срок remediation в днях/месяцах, если он не подтверждён первоисточником.
• Номинальный («nominal») директор: ключевой риск — признание структуры фиктивной («sham director»), если директор не осуществляет реальный контроль и не принимает стратегических решений. Это бьёт по substance (mind & management) и AML (нет реального контролирующего лица). Митигация: реальные полномочия директора, co-director / substance manager, Directors Services Agreement, документированные board minutes и доказательства реального управления [Rules on Substantial Presence; AIFC Companies Regulations, Part 8 (Directors' Duties); AML/CTF Rules].

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

ОБЯЗАННОСТИ ДИРЕКТОРОВ И СДЕЛКИ С ЗАИНТЕРЕСОВАННОСТЬЮ:
• Обязанности директоров (добросовестность, продвижение интересов компании, должная осмотрительность и навык, избежание конфликта интересов, декларирование заинтересованности) закреплены в AIFC Companies Regulations, Part 8 «Directors» (по модели UK Companies Act 2006). ⚠ НЕ указывай конкретный номер Section, если он не получен из RAG — ссылайся на «Part 8 (Directors' Duties)».
• Беспроцентный заём директору / сделка с заинтересованностью требует соблюдения процедуры одобрения и декларирования интереса. Заём директору на личные нужды без одобрения = нарушение duty to avoid conflict of interest [AIFC Companies Regulations, Part 8 (Directors' Duties)].

МАНИПУЛИРОВАНИЕ РЫНКОМ (MARKET ABUSE):
• Запрет манипулирования рынком и злоупотреблений установлен в AIFC Financial Services and Markets Regulations (FSMR), раздел Market Abuse, и детализирован в AIFC Market Rules (MAR). ⚠ НЕ приводи «дословную» цитату нормы и точный номер Section/Rule, если текст не получен из RAG — назови акт и раздел, рекомендуй сверку с первоисточником.

ИЕРАРХИЯ АКТОВ МФЦА (при коллизии норм):
• Верховенство: Конституция РК → Конституционный закон РК «О МФЦА» № 438-V от 07.12.2015 → Акты МФЦА (Regulations) → Правила МФЦА (Rules). При прямом противоречии приоритет у акта более высокого уровня; Конституционный закон имеет приоритет над любыми Regulations и Rules МФЦА.
• Порядок принятия и иерархия актов: AIFC Regulations on AIFC Acts.

ВАЛЮТНОЕ РЕГУЛИРОВАНИЕ И КАПИТАЛ:
• Уставный капитал компании МФЦА может быть выражен в любой валюте (как правило USD). Требование формировать капитал в тенге по валютному законодательству РК на участников МФЦА в этой части НЕ распространяется [AIFC Companies Regulations, Part 5; AIFC Rules on Currency Regulation].

НЕСОСТОЯТЕЛЬНОСТЬ И ЛИКВИДАЦИЯ:
• Банкротство и ликвидация участников МФЦА регулируются AIFC Insolvency Regulations и Insolvency Rules; процедуру ведёт AFSA / назначенный ликвидатор, а не государственный суд РК.

МИГРАЦИЯ И ВИЗЫ:
• Въезд и пребывание иностранных работников участников МФЦА регулируются специальной процедурой [Terms and Procedures for Entry into RK for Foreign Nationals coming to conduct activities in AIFC]. Директор-нерезидент, работающий из-за рубежа, формально не обязан получать РВП/ВНЖ РК — но фактическая работа извне создаёт риск по Substance Rules.
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
  if (ev.repaired)    patch.struct_repaired = 1;
  if (ev.structDefect)patch.struct_defect = 1;
  tasks.push(bumpDaily(env, patch));

  // Уникальные пользователи за день. На релизе (session-only) — необратимый хеш IP,
  // в пред-релизе — сырой IP (для отладки/выявления злоупотреблений).
  if (ev.ip) tasks.push((async () => {
    const tag = PUBLIC_RELEASE ? (await sha256hex(ev.ip + '|aifc-salt')).slice(0, 12) : ev.ip;
    const dk = `stat:ips:${dayKey()}`;
    let hs = []; try { hs = JSON.parse(await env.AIFC_KV.get(dk) || '[]'); } catch {}
    if (!hs.includes(tag)) {
      hs.push(tag);
      if (hs.length > 500) hs = hs.slice(-500);
      await env.AIFC_KV.put(dk, JSON.stringify(hs), { expirationTtl: 60 * 60 * 24 * 60 });
    }
  })());

  // recent_q: метаданные всегда; текст запроса — только в пред-релизе (НЕ под Privacy Policy).
  const rq = { area: ev.area || '', lang: ev.lang || '', ts: Date.now(), cached: !!ev.cached,
    latencyMs: ev.latencyMs || 0, ragCount: ev.ragCount || 0 };
  if (!PUBLIC_RELEASE && ev.question) rq.q = ev.question.slice(0, 200);
  tasks.push(pushList(env, 'stat:recent_q', rq, 100));

  if (ev.negative) {
    const nq = { area: ev.area || '', lang: ev.lang || '', ts: Date.now() };
    if (!PUBLIC_RELEASE && ev.negative && ev.negative.q) nq.q = String(ev.negative.q).slice(0, 200);
    tasks.push(pushList(env, 'stat:negative_q', nq, 50));
  }
  ctx.waitUntil(Promise.all(tasks).catch(() => {}));
}

// Необратимый хеш строки (SHA-256, hex) — для анонимизации IP и подобного.
async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
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
    const matches = await env.VECTORIZE.query(vector, { topK: 12, returnMetadata: 'all' });
    const all = (matches.matches || [])
      .map(m => ({
        score: m.score,
        text: m.metadata?.text || '',
        act: m.metadata?.act || '',
        url: m.metadata?.url || '',
      }))
      .filter(m => m.text);

    // Каскадный отбор против «синдрома Я не знаю»:
    // уверенные совпадения (>0.42) берём всегда; если их меньше 3 — добираем
    // менее уверенными (до порога 0.34), помечая их как ориентировочные.
    const STRONG = 0.42, FLOOR = 0.34;
    const strong = all.filter(m => m.score > STRONG);
    if (strong.length >= 3) return strong.slice(0, 8);
    const relaxed = all.filter(m => m.score > FLOOR)
      .map(m => ({ ...m, weak: m.score <= STRONG }));
    return relaxed.slice(0, 8);
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
    const tag = c.weak ? ' [ориентировочно — проверь применимость]' : '';
    s += `\n[Фрагмент ${i + 1}] из «${c.act}»${tag} (${c.url}):\n«${c.text.slice(0, 1200)}»\n`;
  });
  s += `\nИспользуй эти фрагменты как первоисточник. Цитируй конкретные положения дословно, когда уместно. `
    + `Фрагменты с пометкой «ориентировочно» могут быть менее точны — опирайся на них с осторожностью, но НЕ отказывайся от ответа только из-за этого.\n`;
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
function buildSystemPrompt({ area, lang, liveCtx, ragCtx, isFundQuery, isLawyerMode, isDocGen }) {
  // Исключение для генерации документов: тело документа на английском допускается даже при lang=ru.
  const docLangExc = (isDocGen && lang !== 'en')
    ? ' ИСКЛЮЧЕНИЕ — РЕЖИМ ДОКУМЕНТА: официальный текст шаблона/договора оформляй на АНГЛИЙСКОМ (язык, имеющий юридическую силу в МФЦА), а пояснения, перевод и комментарии — на русском. Это не нарушение языкового правила.'
    : '';
  const langHeader = lang === 'en'
    ? '🌐 LANGUAGE RULE (ABSOLUTE): Respond ONLY in English regardless of the language of source documents or RAG context. Sources in other languages are reference material only.'
    : '🌐 ЯЗЫК ОТВЕТА (АБСОЛЮТНОЕ ПРАВИЛО): Отвечай на русском языке кириллицей — НЕЗАВИСИМО от языка источников, актов и RAG-контекста. Английские источники — только основа анализа. Латиница только для названий актов, терминов и URL. ЗАПРЕЩЕНЫ иероглифы и любые нелатинские/некириллические символы.' + docLangExc;
  const langFooter = lang === 'en'
    ? 'FINAL CHECK: Is your entire response in English? If not, rewrite it. NEVER output CJK or other non-Latin characters.'
    : (isDocGen
        ? 'ФИНАЛЬНАЯ ПРОВЕРКА: пояснения и перевод — на русском; тело официального документа — на английском (это требование режима документа). Недопустимы иероглифы.'
        : 'ФИНАЛЬНАЯ ПРОВЕРКА: Весь ли ответ на русском языке? Если нет — перепиши. Недопустимы: китайские, японские, корейские и любые иные иероглифы.');

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

0. COMPLIANCE GUARDRAIL — ВЫСШИЙ ПРИОРИТЕТ (важнее всех остальных правил)
   Ты — профессиональный юридический инструмент. Ты НЕ помогаешь обходить закон.
   ❌ ОТКАЗЫВАЙ в запросах, цель которых — противоправное действие, в т.ч.:
      • сокрытие реальных бенефициаров (UBO) от регуляторов, AFSA, налоговых или банков;
      • уклонение от налогов (tax evasion), сокрытие доходов/активов, фиктивные расходы;
      • обход санкций (sanctions circumvention), работа с подсанкционными лицами в обход режима;
      • отмывание денег, структурирование платежей для обхода порогов (smurfing), запутывание происхождения средств;
      • фиктивный substance, «бумажные» компании для введения регулятора в заблуждение;
      • сокрытие активов от кредиторов, суда или при банкротстве; подделка документов.
   ПРИ ОТКАЗЕ действуй как старший юрист, а не как цензор:
      1) Кратко и нейтрально откажи в противоправной части (без морализаторства и без пошагового «как обойти»).
      2) Назови, какие нормы/режимы это нарушает (AML/CTF Rules, UBO-раскрытие, FSMR, санкционный режим, НК РК) — со ссылками.
      3) ПРЕДЛОЖИ ЗАКОННУЮ АЛЬТЕРНАТИВУ с раскрытием: легальное налоговое планирование в рамках Substance Rules, корректное раскрытие UBO, комплаентное структурирование, добровольное декларирование, обращение к лицензированному адвокату/комплаенс-офицеру.
   ✅ НЕ ПУТАЙ с законными запросами — на них отвечай полноценно:
      • законная налоговая оптимизация и льготы МФЦА при выполнении Substance;
      • выбор организационно-правовой формы, холдинговые структуры с реальной экономической целью;
      • законная конфиденциальность владения (без сокрытия от регулятора при обязательном раскрытии).
   Грань простая: планирование В РАМКАХ закона с раскрытием — помогаешь; сокрытие/обман регулятора/обход — отказываешь и перенаправляешь в легальное русло.
   Отказ оформляй в стандартной структуре ответа: **Вывод:** (отказ + причина) → **Применимые нормы:** → **Законная альтернатива:**. Тон — деловой, уважительный, без нравоучений.

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
   - ТОЧНОСТЬ НАЗВАНИЙ АКТОВ:
       • Акт о substance: полное название «Rules on the Substantial Presence of the AIFC Participants applying tax exemptions for the payment of CIT and VAT». Дай его при первом упоминании; далее допустимо сокращение «Substantial Presence Rules».
       • НИКОГДА не пиши «AIFC Tax Regulations», «AIFC Tax Exemptions Regulations», «Economic Substance Rules» / «AIFC Rules on Economic Substance» — таких актов НЕ существует (Economic Substance — термин других юрисдикций, не МФЦА).
       • Налоговые льготы МФЦА: ссылайся на Конституционный закон РК «О МФЦА» № 438-V, Rules on Substantial Presence, Rules on Tax Administration, List of Financial Services Exempt from CIT/VAT, НК РК — по применимости.

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
   ┌─ SUBSTANCE: ТИП ХОЛДИНГА + MIND & MANAGEMENT ──────────────────────────────┐
   │ Офиц. название: «Rules on the Substantial Presence of the AIFC Participants │
   │   applying tax exemptions for the payment of CIT and VAT». Используй его.   │
   │ Pure Equity Holding Company (ТОЛЬКО владение акциями/долями, без активного │
   │   управления) → СНИЖЕННЫЕ требования substance: достаточно соответствия     │
   │   обязанностям по подаче отчётности + адекватные помещения и персонал для   │
   │   владения участием. Полный набор CIGA не требуется.                        │
   │ Active Holding / Asset Management / финансирование, IP, торговля →          │
   │   ПОЛНЫЕ требования substance (CIGA + Qualified Employees + OpEx в МФЦА).    │
   │ MIND & MANAGEMENT TEST («demonstrable mind and management»): оценивай, ГДЕ  │
   │   реально принимаются стратегические решения (board meetings, ключевой       │
   │   менеджмент). 100% удалённое принятие решений — даже при директоре-резиденте │
   │   — = ВЫСОКИЙ риск несоответствия.                                          │
   │ Виртуальный офис допустим ТОЛЬКО в совокупности с другими факторами.        │
   │ [Rules on the Substantial Presence of the AIFC Participants (CIT, VAT)]     │
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
   │ КПН = 0%, НДС = 0% для фин. услуг при выполнении Substance Rules             │
   │ После 2066: стандартный КПН РК 20% и НДС 16%                                │
   │ ЗАПРЕЩЕНО писать «бессрочные льготы» или опускать дату 2066                  │
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
   - ⚠ ЗАПРОС «ПРОЦИТИРУЙ ДОСЛОВНО»: приводи точную цитату нормы ТОЛЬКО если её текст присутствует в RAG-фрагментах. Если дословного текста нет — НЕ сочиняй цитату и номер. Ответь: «Дословный текст нормы в доступной базе отсутствует. Норма содержится в [акт, раздел по названию]; для точной цитаты сверьтесь с первоисточником: [URL]».
   - ⚠ ЗАПРОС «ТОЧНЫЙ НОМЕР Section/Rule»: если конкретный номер не подтверждён RAG или Citation DB — НЕ указывай номер наугад (это критическая ошибка). Сошлись на акт и Part/раздел по названию и добавь «точную нумерацию уточните в актуальной редакции».
   - ⚠ ЗАПРЕЩЕНО использовать плейсхолдеры в ссылках: «Article X», «Part X, Rule Y», «Rule …». Если номер неизвестен — пиши название раздела словами, без подстановочных символов.
   - ⚠ «ЕСТЬ ЛИ В РЕЕСТРЕ КОМПАНИЯ X» / «ПЕРЕЧИСЛИ ИЗМЕНЕНИЯ ЗА ПОСЛЕДНИЕ N МЕСЯЦЕВ»: у тебя нет live-доступа к реестру AFSA и истории поправок в реальном времени. Честно скажи это и направь к первоисточнику (publicreg.myafsa.com, afsa.aifc.kz/notice-register). НЕ выдумывай статусы лицензий и списки изменений.

5. ОБЯЗАТЕЛЬНЫЙ АНАЛИЗ РИСКОВ
   На вопросах про substance, лицензирование, «матрёшку», холдинги, AML/KYC, дивиденды, налоговые льготы, фонды, санкции, офшоры — ОБЯЗАТЕЛЬНО указывай:
   - 🚩 Красные флаги (конкретные нарушения или риски)
   - Уровень риска: Низкий / Средний / Средне-высокий / Высокий / Критический
   - Возможные последствия (включая потерю налоговых льгот до 2066 года, доначисления, штрафы, отзыв лицензии, уголовная ответственность при AML)
   - Substance: оценивай по типу холдинга (Pure Equity Holding → сниженные требования; Active/Asset Mgmt → полные CIGA), mind & management test (где принимаются решения), Qualified Employees, OpEx, офису. Давай персональный risk assessment.
   - ПОЭТАПНЫЙ РАЗБОР ЦЕПОЧКИ («матрёшка» ТОО ↔ AIFC, дивиденды, займы, выплаты): разбирай КАЖДЫЙ этап отдельно:
       • Этап 1 (ТОО РК → AIFC-холдинг): КПН у источника, условия 0% (Substance / СИДН), валютный контроль.
       • Этап 2 (AIFC → физлицо / нерезидент): налог на распределение, ИПН, WHT.
       • Налоговые последствия и риски на КАЖДОМ этапе по отдельности.
       • Риски CFC (КИК по НК РК), валютного контроля и провала substance — указывай явно.

6. СТИЛЬ ОТВЕТА
   - ${isLawyerMode ? '🔬 РЕЖИМ ЮРИСТА АКТИВЕН: углублённый технический анализ — полные ссылки на нормы, коллизии, ratio decidendi, риски для due diligence. Профессиональная юридическая терминология.' : '👤 Режим предпринимателя: прямой вывод → пошаговые действия → таблицы/чек-листы → риски → рекомендация уточнить. Без избыточного юридического жаргона.'}
   - Таблицы и чек-листы — для сравнений, документов, требований.
   - При анализе уставов и договоров — сравнивай со Standard Articles (Schedule 5 для Private Company, Schedule 6 для Public Company).
   - При генерации документов — предоставляй английскую версию с глоссарием ключевых терминов на русском. Всегда указывай, что это шаблон.${isDocGen ? `
   📄 РЕЖИМ ГЕНЕРАЦИИ ДОКУМЕНТА (двуязычный формат):
     • Официальный текст документа МФЦА — ВСЕГДА на английском (governing language), даже если запрос на русском. Английский — язык, имеющий юридическую силу в МФЦА.
     • Структура вывода:
         1) **EN — Official document** : полный текст документа на английском.
         2) **RU — Перевод для понимания** : секционный русский перевод (не имеющий силы, «for reference only»).
         3) Короткий глоссарий ключевых терминов EN→RU.
     • Обязательно пометь: «Английская версия имеет преимущественную силу. Русский перевод — справочный.»
     • В конце — «Это шаблон, подготовленный ИИ. Перед использованием проверьте у лицензированного Legal Adviser AIFC.»` : ''}
   - Если вопрос неполный — задай 1–2 уточняющих вопроса ПЕРЕД полным ответом и добавь:
     ЧИПЫ: Вариант А | Вариант Б | Вариант В | Другое
     (строку ЧИПЫ: только к уточняющим вопросам, не к полным ответам)

7. БАЛАНС: ОТВЕЧАЙ ПО СУЩЕСТВУ, НО БЕЗ ГАЛЛЮЦИНАЦИЙ
   - СНАЧАЛА попробуй ответить, опираясь на ЛЮБОЙ доступный источник: фрагменты RAG (включая «ориентировочные»), Citation DB, ACTS_INDEX и общеизвестные принципы права МФЦА (МФЦА основан на английском общем праве; акты построены по модели UK/DIFC).
   - Полный отказ «не обнаружено» допустим ТОЛЬКО когда нет вообще никакой опоры: пусто в RAG, нет в Citation DB/ACTS_INDEX И тема вне общеизвестных принципов. Не отказывайся лишь потому, что фрагменты короткие или помечены «ориентировочно».
   - Если общая норма понятна, но точный номер не подтверждён — дай ответ по существу со ссылкой на акт/раздел словами и пометь «точную нумерацию уточните в актуальной редакции». Это ЛУЧШЕ, чем отказ.
   - Когда основы действительно нет: «В доступных материалах AIFC по этому конкретному сценарию прямого регулирования не обнаружено. Рекомендую уточнить детали или обратиться к лицензированному Legal Adviser». Нейтральный деловой тон, без эмоциональных извинений.

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

// Детекция структурного дефекта ответа (для пост-валидации и гейта кэширования).
// Возвращает код дефекта или null. Лечим регенерацией только структурные дефекты —
// token-drop цифр (модельный артефакт fp8) НЕ триггерит регенерацию.
function structureDefect(text) {
  const t = text || '';
  if (/^ЧИПЫ:/m.test(t)) return null;                 // уточняющий вопрос — структура не нужна
  if (t.length < 200) return null;                    // короткий/служебный ответ
  if (!/\*\*Вывод/.test(t)) return 'no_conclusion';   // нет обязательного блока «Вывод»
  // Плейсхолдеры в ссылках: [Article X], [Part X, Rule Y], [Rule …], [Section X]
  if (/\[[^\]]*\b(Article|Part|Rule|Section)\s+[XYZ]\b[^\]]*\]/.test(t)) return 'placeholder_cite';
  if (/\[[^\]]*Rule\s*…[^\]]*\]/.test(t)) return 'placeholder_cite';
  return null;
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
  // Генерация документа/шаблона → официальный текст на английском + русский перевод
  const isDocGen = /составь|сгенерируй|подготовь|напиши|сформируй|драфт|шаблон|образец|договор|соглашение|устав|резолюци|доверенност|заявлени|жалоб|письмо|notice|agreement|articles|resolution|deed|draft|template|nda/i.test(lastUser);
  const cisBoost = isFundQuery ? 'CIS Rules collective investment scheme fund manager domestic fund foreign fund exempt specialist fund registration prospectus unit dealing' : '';
  const ragQuery = `${area || ''} ${lastUser} ${areaKeywordsEn(area)} ${cisBoost}`.trim();
  const [ragChunks, news, notices] = await Promise.all([
    ragRetrieve(env, ragQuery),
    fetchAifcNews(),
    fetchAfsaNotices(),
  ]);
  const { ctx: liveCtx, count: liveCount } = formatLive(news, notices);
  const ragCtx = formatRag(ragChunks);
  const systemPrompt = buildSystemPrompt({ area, lang, liveCtx, ragCtx, isFundQuery, isLawyerMode, isDocGen });

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

      // ── Пост-валидация структуры: одна тихая регенерация при структурном дефекте ──
      // Документы-шаблоны (isDocGen) не обязаны иметь «**Вывод:**» — пропускаем проверку.
      let finalText = fullText;
      let repaired = false;
      const defect = isDocGen ? null : structureDefect(fullText);
      if (defect) {
        try {
          const fix = await aiChat(env, [
            { role: 'system', content: systemPrompt },
            ...messages,
            { role: 'system', content:
              'КРИТИЧНО: предыдущий черновик нарушил формат. Перепиши ответ СТРОГО по структуре, '
              + 'начиная с «**Вывод:**», с блоками «Применимые нормы», «Анализ», «Риски и красные флаги» где уместно. '
              + 'ЗАПРЕЩЕНЫ ссылки-плейсхолдеры вида [Article X], [Part X, Rule Y], [Rule …]. '
              + 'Если точный номер нормы неизвестен — назови акт и раздел словами, без подстановок.' },
          ], { maxTokens: 2048, temperature: 0.15, stream: false });
          const fixed = sanitizeText(fix?.response || '');
          if (fixed.length > 200 && !structureDefect(fixed)) {
            finalText = fixed;
            repaired = true;
          }
        } catch {}
      }

      // Verify links (на финальном тексте)
      const linkStatus = await verifyLinks(finalText);
      const brokenCount = Object.values(linkStatus).filter(v => !v.ok).length;
      // Если был ремонт — отдаём replaceText, фронт подменит отображённый ответ
      controller.enqueue(encoder.encode(JSON.stringify({
        type: 'done', linkStatus, brokenCount,
        ...(repaired ? { replaceText: finalText } : {}),
      }) + '\n'));

      // Контекст для оценки ответа (24ч). На релизе — только область (session-only);
      // в пред-релизе дополнительно сохраняем вопрос для отладки негативных оценок.
      if (env.AIFC_KV) ctx.waitUntil(env.AIFC_KV.put(`msg:${msgId}`,
        JSON.stringify(PUBLIC_RELEASE ? { area, ts: Date.now() } : { q: lastUser, area, ts: Date.now() }),
        { expirationTtl: 86400 }));

      // Кэшируем ТОЛЬКО структурно валидные полные ответы (не залипает брак/плейсхолдеры).
      // Документы-шаблоны кэшируем без проверки на «**Вывод:**».
      if (ck && env.AIFC_KV && finalText.length > 200 && (isDocGen || !structureDefect(finalText))) {
        ctx.waitUntil(env.AIFC_KV.put(ck, JSON.stringify({
          text: finalText, linkStatus, brokenCount, liveCount, ragSources,
        }), { expirationTtl: CACHE_TTL }));
      }

      // Метрика: сгенерированный ответ (не из кэша). Ремонт = +1 генерация (нейроны ×2).
      track(env, ctx, {
        type: 'chat', area, lang, question: lastUser,
        neurons: NEURON_COST.chat * (repaired ? 2 : 1),
        ip, country, latencyMs: Date.now() - chatStart,
        isFundQuery, isLawyerMode, ragCount: ragChunks.length,
        structDefect: defect || '', repaired,
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
    // Дневная метрика. Для негативной оценки: область всегда; текст вопроса —
    // только в пред-релизе (если он был сохранён в msg:).
    let negative = null, area = '';
    if (vote === 'down') {
      try {
        const ctxData = JSON.parse(await env.AIFC_KV.get(`msg:${msgId}`) || 'null');
        if (ctxData) { area = ctxData.area || ''; negative = ctxData.q ? { q: ctxData.q, area } : true; }
      } catch {}
    }
    track(env, ctx, { type: vote === 'up' ? 'vote_up' : 'vote_down', negative, area });
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
    // На релизе (session-only) тексты не хранятся — анализируем обезличенные метаданные;
    // в пред-релизе передаём и сами вопросы, если они сохранены.
    recentByArea: (stats.recentQ || []).slice(0, 30).reduce((m, x) => { const a = x.area || 'н/д'; m[a] = (m[a] || 0) + 1; return m; }, {}),
    negativeByArea: (stats.negativeQ || []).slice(0, 15).reduce((m, x) => { const a = x.area || 'н/д'; m[a] = (m[a] || 0) + 1; return m; }, {}),
    ...(PUBLIC_RELEASE ? {} : {
      recentQuestions: (stats.recentQ || []).slice(0, 30).map(x => x.q).filter(Boolean),
      negativeQuestions: (stats.negativeQ || []).slice(0, 15).map(x => x.q).filter(Boolean),
    }),
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
// Граница нормы: перенос строки + начало пункта/раздела
// (нумерованный пункт «28.», «5.1», «(1)» или заголовок PART/Rule/Section/Schedule/Chapter/Article).
const NORM_BOUNDARY = /\n(?=\s*(?:\d+[.\)]|\(\d+\)|PART\b|Part\b|CHAPTER\b|Chapter\b|SCHEDULE\b|Schedule\b|Rule\b|Section\b|Article\b)\s)/g;

function chunkText(text, size = 1200, overlap = 300) {
  // Нарезка с перекрытием + выравнивание по границам НОРМ (Rule/Section/пункт),
  // чтобы каждый чанк был самодостаточным и не рвал правило посередине.
  // Это повышает релевантность ретрива и лечит «синдром Я не знаю».
  const step = size - overlap;
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = i + size;
    if (end < text.length) {
      // Ищем границу нормы в окне [end-200, end+300]; берём ближайшую к end.
      const wStart = Math.max(i + step, end - 200);
      const wEnd = Math.min(text.length, end + 300);
      const slice = text.slice(wStart, wEnd);
      let best = -1;
      for (const m of slice.matchAll(NORM_BOUNDARY)) {
        const pos = wStart + m.index + 1; // позиция сразу после \n
        if (best === -1 || Math.abs(pos - end) < Math.abs(best - end)) best = pos;
      }
      if (best !== -1) {
        end = best;
      } else {
        // Фоллбэк: ближайший перенос строки (±200)
        const nl = text.indexOf('\n', end);
        if (nl !== -1 && nl - end <= 200) end = nl + 1;
      }
    }
    const chunk = text.slice(i, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    i = Math.max(end - overlap, i + step); // сохраняем перекрытие, гарантируем прогресс
  }
  return chunks;
}

// Удаляет диапазон возможных ID `${prefix}-0..${prefix}-(n-1)` (для чистого переингеста
// без «осиротевших» векторов при изменившемся числе чанков). Несуществующие ID игнорируются.
async function deleteIdRange(env, prefix, n = 400) {
  const ids = Array.from({ length: n }, (_, k) => `${prefix}-${k}`);
  try { await env.VECTORIZE.deleteByIds(ids); } catch {}
}

async function handleIngest(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== INGEST_SECRET) return json({ error: 'forbidden' }, 403);
  const start = parseInt(url.searchParams.get('start') || '0', 10);
  const count = parseInt(url.searchParams.get('count') || '2', 10);
  const reset = url.searchParams.get('reset') === '1';
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
      if (reset) await deleteIdRange(env, `act${globalIdx}`);
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
  const { key, id, act, url, cat = 'Налоговое право', text = '', reset = false } = body;
  if (key !== INGEST_SECRET) return json({ error: 'forbidden' }, 403);
  if (!id || !act || !text || text.length < 50) return json({ error: 'id, act, text required' }, 400);

  if (reset) await deleteIdRange(env, id);
  const chunks = chunkText(text.slice(0, 40000)).filter(c => c.trim().length > 80);
  let total = 0;
  for (let b = 0; b < chunks.length; b += 8) {
    const batch = chunks.slice(b, b + 8);
    const emb = await env.AI.run(EMBED_MODEL, { text: batch });
    const vectors = emb.data.map((values, k) => ({
      id: `${id}-${b + k}`,
      values,
      metadata: { act, url: url || '', cat, text: batch[k].slice(0, 1200) },
    }));
    await env.VECTORIZE.upsert(vectors);
    total += vectors.length;
  }
  return json({ ok: true, id, act, chunks: chunks.length, upserted: total });
}

// ── Cron: monitor act pages + update sources for changes ──────────────────────
// Сигнатура: длина + хеш стрипнутого текста (ловит изменения с тем же объёмом).
function contentSig(text) {
  const slice = text.slice(0, 8000);
  let h = 0;
  for (let i = 0; i < slice.length; i++) { h = (h * 31 + slice.charCodeAt(i)) | 0; }
  return `${slice.length}:${h}`;
}

async function checkUrl(env, name, actUrl, changes, extra = {}) {
  try {
    const res = await fetch(actUrl, { cf: { cacheTtl: 0 } });
    if (!res.ok) return;
    const sig = contentSig(stripTags(await res.text()));
    const prevKey = `mon:${actUrl}`;
    const prev = await env.AIFC_KV.get(prevKey);
    if (prev && prev !== sig) {
      changes.unshift({ act: name, url: actUrl, date: new Date().toISOString().slice(0, 10), ...extra });
    }
    await env.AIFC_KV.put(prevKey, sig);
  } catch {}
}

async function runMonitor(env) {
  if (!env.AIFC_KV) return;
  const changes = JSON.parse(await env.AIFC_KV.get('changes') || '[]');

  // 1) Ротация по всем актам: за ~3 дня покрываем весь список (окно 20 со сдвигом по дню).
  const WINDOW = 20;
  const dayNum = Math.floor(Date.now() / 86400000);
  const offset = (dayNum * WINDOW) % ACTS.length;
  const rotated = ACTS.slice(offset).concat(ACTS.slice(0, offset)).slice(0, WINDOW);
  for (const [name, actUrl] of rotated) await checkUrl(env, name, actUrl, changes);

  // 2) Источники обновлений МФЦА — всегда проверяем (новые редакции, поправки, консультации).
  const UPDATE_SOURCES = [
    ['🆕 Consultation Papers (предстоящие поправки)', 'https://aifc.kz/legal-framework-cat/consultation-papers/'],
    ['⚖️ AFSA Notice Register (регуляторные уведомления)', 'https://afsa.aifc.kz/notice-register/'],
    ['📋 Legal Framework (новые акты)', 'https://aifc.kz/legal-framework/'],
  ];
  for (const [name, srcUrl] of UPDATE_SOURCES) await checkUrl(env, name, srcUrl, changes, { source: true });

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
