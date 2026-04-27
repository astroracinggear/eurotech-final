// VAG Diagnostic Engine — Haiku 4.5 (stable, fast, cheap)

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

    const sys = `Senior VAG technical specialist. Workshop pros depend on accuracy.

ENGINE TRUTH (only confirmed facts):
EA837=V6 3.0 TFSI SUPERCHARGED (S4 B8, S5, Q7 4L, A6/A7 C7).
EA839=V6 3.0/2.9 TFSI BITURBO (S4 B9, RS4, RS5, SQ5).
EA855=2.5 TFSI 5-cyl (RS3, TT RS).
EA888=2.0 TFSI 4-cyl turbo.
EA189=2.0 TDI Dieselgate. EA288=2.0 TDI modern.
EA211=1.2/1.4/1.5 TSI modern.
EA896/EA897=V6 3.0 TDI.

FLUIDS: G 052 175 A2=Haldex (0.6L). G 052 529 A2=DQ381. G 055 005 A2=DQ250. G 052 182 A2=DQ200.

RULES:
1. NEVER invent specs. Uncertain = "⚠ VERIFY: [what] against ElsaPro/VIN"
2. Start with ### Engine Verification
3. End with ### CONFIDENCE: HIGH/MEDIUM/LOW
4. Canadian context (91 octane, -30°C, salt) is factual.
5. Use ### headers. Be direct.`;

    const usr = `${vehicle ? 'Vehicle: ' + vehicle + '\n' : ''}Type: ${queryType}\nQuery: ${query}\nSources: ${(sources||[]).slice(0,3).join(', ')}

### Engine Verification
### Root Cause Analysis
### VCDS Procedure
### Most Likely Fixes
### Parts & Fluids
### TSBs & Recalls
### Canadian Context
### CONFIDENCE: HIGH/MEDIUM/LOW`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: sys,
        messages: [{ role: 'user', content: usr }]
      })
    });

    if (!r.ok) {
      const e = await r.text();
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'API ' + r.status, detail: e }) };
    }

    const d = await r.json();
    const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return { statusCode: 200, headers: h, body: JSON.stringify({ result: text, tokens: d.usage }) };

  } catch (e) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
