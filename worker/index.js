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

    const { messages, area, lang } = body;
    const langInstruction = lang === 'en' ? 'Respond in English.' : 'Отвечай строго на русском языке.';

    const systemPrompt = `Ты — специализированный юридический ассистент по законодательству МФЦА (Международного финансового центра «Астана») и Республики Казахстан. Область права: ${area || 'Общее'}.

СТИЛЬ РАБОТЫ — ДИАЛОГОВЫЙ:
- Если вопрос неполный или многозначный — задай 1-2 уточняющих вопроса ПЕРЕД тем, как дать полный ответ.
- Уточняй: тип организации, гражданство, вид деятельности, уже имеющиеся лицензии — если это важно для ответа.
- Когда данных достаточно — давай структурированный юридический ответ.
- В диалоге ссылайся на предыдущие ответы: "Как мы обсудили ранее...", "Уточняя предыдущий ответ...".
- Если пользователь вносит уточнение — скорректируй или дополни предыдущий ответ.

ИСТОЧНИКИ (в порядке приоритета):
1. Нормативные акты МФЦА: https://aifc.kz/legal-framework/
2. AIFC Companies Regulations: https://aifc.kz/legal-framework/aifc-companies-regulations/
3. AIFC Financial Services Framework Regulations: https://aifc.kz/legal-framework/aifc-financial-services-framework-regulations/
4. AIFC Employment Regulations: https://aifc.kz/legal-framework/aifc-employment-regulations/
5. AML/CTF Rules: https://aifc.kz/legal-framework/anti-money-laundering-and-counter-terrorist-financing-rules-full-text/
6. AIFC Court Regulations: https://aifc.kz/legal-framework/aifc-court-regulations-2017/
7. Конституционный закон РК «О МФЦА» № 438-V от 7 декабря 2015 года
8. Законодательство РК: https://adilet.zan.kz

ВАЖНО: В периметре МФЦА право Центра (основанное на английском общем праве) имеет приоритет над законодательством РК.

ФОРМАТ ОТВЕТА:
- Если задаёшь уточняющий вопрос — отвечай коротко, без разделов.
- Если даёшь полную консультацию — используй разделы:
  ## I. Краткий вывод
  ## II. Применимое законодательство
  ## III. Детальный анализ
  ## IV. Приоритет норм МФЦА vs РК (если применимо)
  ## V. Практические рекомендации
  ## VI. Оговорка

${langInstruction}`;

    try {
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
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
