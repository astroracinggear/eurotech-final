exports.handler = async (event) => {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'No API key configured' }) };
  try {
    const { vehicle, queryType, query, sources } = JSON.parse(event.body || '{}');
    if (!query) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Query required' }) };
    const sys = 'VAG expert (VW/Audi/SEAT/SKODA). Use G-numbers for fluids, VCDS addresses, ### headers. Be concise.';
    const usr = (vehicle ? 'Vehicle: ' + vehicle + '\n' : '') + 'Type: ' + queryType + '\nQuery: ' + query + '\nSources: ' + (sources||[]).slice(0,3).join(', ') + '\n\n### Root Cause\n### VCDS Steps\n### Fix\n### Parts & Fluids\n### Canada Note';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, system: sys, messages: [{ role: 'user', content: usr }] })
    });
    if (!r.ok) { const e = await r.text(); return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'API error ' + r.status, detail: e }) }; }
    const d = await r.json();
    const text = (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
    return { statusCode: 200, headers: h, body: JSON.stringify({ result: text }) };
  } catch(e) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
