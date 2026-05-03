// VAG Diagnostic Engine v8 — fast + smart NHTSA override

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
    const { vin, vehicle, queryType, query, sources } = JSON.parse(event.body || '{}');
    if (!query) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Query required' }) };

    let vinHint = '';
    if (vin && vin.length === 17) {
      try {
        const nhtsaR = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
        if (nhtsaR.ok) {
          const data = await nhtsaR.json();
          const get = (key) => {
            const r = (data.Results || []).find(r => r.Variable === key);
            return r && r.Value && r.Value !== 'Not Applicable' ? r.Value : null;
          };
          const make = get('Make');
          const model = get('Model');
          const year = get('Model Year');
          const cyl = get('Engine Number of Cylinders');
          const disp = get('Displacement (L)');
          if (make) {
            vinHint = `VIN HINT (NHTSA, may be incomplete): ${year || '?'} ${make}${model ? ' ' + model : ''}${cyl ? ', ' + cyl + '-cyl' : ''}${disp ? ', ' + disp + 'L' : ''}\n⚠ NHTSA often wrong on VAG cylinder/engine. Cross-check with VAG truth.\n\n`;
          }
        }
      } catch {}
    }

    const sys = `Senior VAG technical specialist. Workshop pros depend on accuracy.

ENGINE TRUTH:
EA837=V6 3.0 TFSI SUPERCHARGED (S4 B8, S5, Q7 4L, A6/A7 C7).
EA839=V6 3.0/2.9 TFSI BITURBO (S4 B9, RS4, RS5, SQ5).
EA855=2.5 TFSI 5-CYL (RS3, TT RS) — ALWAYS 5-CYL.
EA888=2.0 TFSI 4-cyl turbo.
EA189=2.0 TDI Dieselgate. EA288=2.0 TDI modern.
EA211=1.2/1.4/1.5 TSI. EA896/EA897=V6 3.0 TDI.

FLUIDS: G 052 175 A2=Haldex. G 052 529 A2=DQ381. G 055 005 A2=DQ250. G 052 182 A2=DQ200.

RULES:
- NHTSA is unreliable for VAG. If conflicts with truth above, IGNORE NHTSA.
- NEVER invent specs. Uncertain = "⚠ VERIFY"
- NEVER cite percentages. Use: very common/common/occasional/rare.
- Start: ### Engine Verification. End: ### CONFIDENCE: HIGH/MED/LOW
- Use ### headers. Be direct.`;

    const usr = `${vinHint}${vehicle ? 'Vehicle: ' + vehicle + '\n' : ''}Query: ${query}

### Engine Verification
### Root Cause
### VCDS Procedure
### Fixes
### Parts/Fluids
### Canada Note
### CONFIDENCE: HIGH/MED/LOW`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
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
