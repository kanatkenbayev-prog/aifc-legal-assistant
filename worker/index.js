// ═══════════════════════════════════════════════════════════════════════════
//  МФЦА Правовой Ассистент — Cloudflare Worker (backend)
//  Возможности: чат со стримингом · RAG (Vectorize) · верификация ссылок ·
//  рейтинг ответов (KV) · rate-limiting · cron-мониторинг изменений в актах
// ═══════════════════════════════════════════════════════════════════════════

const INGEST_SECRET = 'aifc-rag-2026';      // защита эндпоинта загрузки RAG
const RATE_LIMIT_PER_MIN = 25;              // запросов в минуту с одного IP
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
  ['Collective Investment Scheme Rules','https://aifc.kz/legal-framework/collective-investment-scheme-rules/','Финансовые услуги'],
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

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

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
    const matches = await env.VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' });
    return (matches.matches || [])
      .filter(m => m.score > 0.45)
      .map(m => ({
        score: m.score,
        text: m.metadata?.text || '',
        act: m.metadata?.act || '',
        url: m.metadata?.url || '',
      }))
      .filter(m => m.text);
  } catch { return []; }
}

function formatRag(chunks) {
  if (!chunks.length) return '';
  let s = `\n== РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ ИЗ ПОЛНЫХ ТЕКСТОВ АКТОВ (RAG) ==\n`;
  chunks.forEach((c, i) => {
    s += `\n[Фрагмент ${i + 1}] из «${c.act}» (${c.url}):\n«${c.text.slice(0, 700)}»\n`;
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
function buildSystemPrompt({ area, lang, liveCtx, ragCtx }) {
  const langLine = lang === 'en' ? 'Respond in English.' : 'Отвечай строго на русском языке.';
  return `Ты — специализированный юридический ассистент по законодательству МФЦА (Международного финансового центра «Астана») и Республики Казахстан. Область права: ${area || 'Общее'}.
${ragCtx}${liveCtx}
== ВСТРОЕННАЯ БАЗА АКТОВ МФЦА (название → URL) ==
${ACTS_INDEX}

== ПРАВИЛА ==
- Всегда указывай полное название акта и прямую ссылку [Название](URL).
- Приоритет: фрагменты RAG > живые данные > встроенная база. НИКОГДА не выдумывай URL.
- Если в новостях есть изменения по теме — предупреди с ⚠️.
- В периметре МФЦА действует английское общее право, оно приоритетнее права РК — указывай коллизии.

== ДИАЛОГ ==
- Если вопрос неполный — задай 1–2 уточняющих вопроса ПЕРЕД полным ответом.
- В конце уточняющего вопроса ВСЕГДА добавляй отдельную последнюю строку с вариантами:
ЧИПЫ: Вариант А | Вариант Б | Вариант В | Другое
- Строку ЧИПЫ: добавляй ТОЛЬКО к уточняющим вопросам, не к полным консультациям.

== СТРУКТУРА ПОЛНОГО ОТВЕТА ==
## I. Краткий вывод
## II. Применимое законодательство ([Название] — статья — [URL])
## III. Детальный анализ
## IV. Приоритет норм МФЦА vs РК (если применимо)
## V. Практические рекомендации
## VI. Актуальность источников
## VII. Оговорка

${langLine}`;
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
  const text = cached.text || '';
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
  const ip = request.headers.get('cf-connecting-ip') || '';
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
        if (cached.text && !/^ЧИПЫ:/m.test(cached.text)) return streamFromCache(cached);
      } catch {}
    }
  }

  // Parallel: RAG retrieval + live data
  const [ragChunks, news, notices] = await Promise.all([
    ragRetrieve(env, `${area || ''} ${lastUser}`.trim()),
    fetchAifcNews(),
    fetchAfsaNotices(),
  ]);
  const { ctx: liveCtx, count: liveCount } = formatLive(news, notices);
  const ragCtx = formatRag(ragChunks);
  const systemPrompt = buildSystemPrompt({ area, lang, liveCtx, ragCtx });

  const aiStream = await env.AI.run(CHAT_MODEL, {
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: 2048, temperature: 0.2, stream: true,
  });

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
              const tok = JSON.parse(data).response || '';
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

      controller.close();
    },
  });

  return new Response(out, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', ...CORS } });
}

// ── Compliance check handler (AI + RAG over AIFC rules) ───────────────────────
async function handleCompliance(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!(await checkRateLimit(env, ip)))
    return json({ error: 'Слишком много запросов. Подождите минуту.' }, 429);

  let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { text = '', title = '', regulation = '', area = 'Корпоративное право' } = body;
  if (text.trim().length < 50) return json({ error: 'Текст слишком короткий для проверки.' }, 400);

  // Ограничиваем объём для контекста модели
  const doc = text.slice(0, 18000);
  const truncated = text.length > 18000;

  // RAG по релевантным нормам
  const ragChunks = await ragRetrieve(env, `${title} ${regulation} mandatory requirements obligations`.trim());
  const ragCtx = ragChunks.length
    ? '\n== ФРАГМЕНТЫ ПРИМЕНИМЫХ АКТОВ (RAG) ==\n' + ragChunks.map((c, i) =>
        `[${i + 1}] из «${c.act}» (${c.url}):\n«${c.text.slice(0, 700)}»`).join('\n\n')
    : '';

  const systemPrompt = `Ты — комплаенс-ревьюер по праву МФЦА (Международного финансового центра «Астана»). Пользователь модифицировал официальный шаблон «${title}», который должен соответствовать: ${regulation}.
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
    const response = await env.AI.run(CHAT_MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Проверь следующий документ:\n\n${doc}` },
      ],
      max_tokens: 1500, temperature: 0.1,
    });
    const analysis = response.response || '';
    const linkStatus = await verifyLinks(analysis);
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
async function handleRate(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad' }, 400); }
  const { msgId, vote } = body;
  if (!msgId || !['up', 'down'].includes(vote)) return json({ error: 'bad' }, 400);
  if (env.AIFC_KV) {
    const key = `rate:${vote}`;
    const cur = parseInt(await env.AIFC_KV.get(key) || '0', 10);
    await env.AIFC_KV.put(key, String(cur + 1));
    await env.AIFC_KV.put(`vote:${msgId}`, vote, { expirationTtl: 2592000 });
  }
  return json({ ok: true });
}

// ── Changes (cron monitor) read handler ───────────────────────────────────────
async function handleChanges(env) {
  if (!env.AIFC_KV) return json({ changes: [] });
  const raw = await env.AIFC_KV.get('changes');
  return json({ changes: raw ? JSON.parse(raw) : [] });
}

// ── RAG ingestion handler ─────────────────────────────────────────────────────
function chunkText(text, size = 1400, overlap = 200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += (size - overlap)) {
    chunks.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
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
          metadata: { act: name, url: actUrl, cat, text: batch[k].slice(0, 1000) },
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
    if (request.method !== 'POST' && path !== '/') return new Response('Not found', { status: 404 });

    if (path === '/rate') return handleRate(request, env);
    if (path === '/compliance') return handleCompliance(request, env);
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
