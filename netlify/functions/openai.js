exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing OPENAI_API_KEY environment variable' })
      };
    }

    const { mode, payload, image } = JSON.parse(event.body || '{}');

    let messages = [];

    if (mode === 'price') {
      messages = [
        {
          role: 'system',
          content: 'Jsi konzervativní gemologický pricing analytik. Odpovídej česky, stručně, strukturovaně. Nikdy netvrď definitivní pravost nebo investiční doporučení.'
        },
        {
          role: 'user',
          content:
            'Posuď tento drahý kámen a pricing. Databázová cena je referenční retailová hodnota. Zhodnoť Retail ČR, Wholesale ČR, Nákup Ideal, profit, rizika a co ověřit:\n\n' +
            JSON.stringify(payload, null, 2)
        }
      ];
    }

    if (mode === 'vision') {
      messages = [
        {
          role: 'system',
          content: 'Jsi konzervativní gemologický AI screening asistent. Nikdy nepotvrzuj pravost pouze z fotografie.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Analyzuj fotografii drahého kamene. Uveď pravděpodobný typ kamene, barvu, brus, viditelné vady, red flags, podezření na syntetiku nebo imitaci a doporučené gemologické testy. Na konec vrať JSON objekt se strukturou: {"gemType":"diamond|ruby|sapphire|emerald|alexandrite|tanzanite|spinel|tourmaline|aquamarine|opal|garnet|topaz|amethyst|other","colorGrade":"weak|medium|strong|vivid","clarity":"included|slightly|eyeClean|loupeClean","cut":"cabochon|standard|fine|excellent"}'
            },
            {
              type: 'image_url',
              image_url: {
                url: image
              }
            }
          ]
        }
      ];
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 1200
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data.error?.message || 'OpenAI API error',
          raw: data
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: data.choices?.[0]?.message?.content || 'Bez odpovědi.'
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: e.message || 'Internal server error'
      })
    };
  }
};