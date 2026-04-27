// VAG Diagnostic Engine v4.3 — Sonnet 4.6 optimized for speed
// Reduced max_tokens to fit within Netlify 10s limit

exports.handler = async (event) => {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'No API key' }) };

  try {
    const { vehicle, queryType, query, sources } = JSON.parse(event.body || '{}');
    if (!query) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Query required' }) };

    const sys = `Senior VAG technical specialist. Be concise.

ENGINE TRUTH (use only):
EA837=V6 3.0 TFSI supercharged. EA839=V6 biturbo. EA855=2.5 5-cyl. EA888=2.0T 4-cyl. EA189=2.0 TDI Dieselgate. EA288=2.0 TDI modern. EA211=1.2/1.4/1.5 TSI. EA896/EA897=V6 TDI.

FLUIDS: G 052 175 A2=Haldex. G 052 529 A2=DQ381. G 055 005 A2=DQ250. G 052 182 A2=DQ200.

Never invent specs. Uncertain = "VERIFY: [what]". Use ### headers.`;

    const usr = `${vehicle ? 'Vehicle: ' + vehicle + '\n' : ''}Query: ${query}

### Engine Verification
### Root Cause
### VCDS Procedure
### Fixes
### Parts/Fluids
### Canada Note
### CONFIDENCE: HIGH/MED/LOW`;

    // 8s timeout — must finish before Netlify 10s limit
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: sys,
        messages: [{ role: 'user', content: usr }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!r.ok) {
      const e = await r.text();
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'API ' + r.status, detail: e }) };
    }

    const d = await r.json();
    const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return { statusCode: 200, headers: h, body: JSON.stringify({ result: text, tokens: d.usage }) };

  } catch (e) {
    if (e.name === 'AbortError') {
      return { statusCode: 504, headers: h, body: JSON.stringify({ error: 'Request timed out at 8.5s. Try a more specific query.' }) };
    }
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
