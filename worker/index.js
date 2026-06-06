export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const { query, area, lang } = body;

    const langInstruction = lang === 'en' ? 'Respond in English.' : 'Отвечай строго на русском языке.';

    const systemPrompt = `Ты — специализированный юридический ассистент по законодательству МФЦА (Международного финансового центра «Астана») и Республики Казахстан. Область права: ${area || 'Общее'}.

ИСТОЧНИКИ (в порядке приоритета):
1. Нормативные акты МФЦА: https://aifc.kz/legal-framework/acts/
2. Правила МФЦА: https://aifc.kz/legal-framework/rules/
3. Конституционный закон РК «О МФЦА» № 438-V от 7 декабря 2015 года
4. Законодательство РК: https://adilet.zan.kz

ВАЖНО: В периметре МФЦА право Центра (основанное на английском общем праве) имеет приоритет над законодательством РК.

СТРУКТУРА ОТВЕТА:
## I. Краткий вывод
## II. Применимое законодательство (название + статья + URL)
## III. Детальный правовой анализ
## IV. Приоритет норм МФЦА vs РК (если применимо)
## V. Практические рекомендации
## VI. Актуальность источников
## VII. Оговорка

${langInstruction}`;

    try {
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        max_tokens: 2048,
        temperature: 0.3,
      });

      return new Response(JSON.stringify({ text: response.response }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
