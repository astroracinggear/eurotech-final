// VAG Diagnostic Engine v7 — NHTSA validation override
// When NHTSA data conflicts with known VAG facts, trust VAG facts

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

    let vinData = null;
    if (vin && vin.length === 17) {
      try {
        const nhtsaR = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
        if (nhtsaR.ok) {
          const data = await nhtsaR.json();
          const get = (key) => {
            const r = (data.Results || []).find(r => r.Variable === key);
            return r && r.Value && r.Value !== 'Not Applicable' ? r.Value : null;
          };
          vinData = {
            make: get('Make'),
            model: get('Model'),
            year: get('Model Year'),
            trim: get('Trim') || get('Series'),
            displacement: get('Displacement (L)'),
            cylinders: get('Engine Number of Cylinders'),
            fuelType: get('Fuel Type - Primary'),
            transmission: get('Transmission Style'),
            drive: get('Drive Type'),
            plant: get('Plant Country'),
            bodyClass: get('Body Class')
          };
        }
      } catch {}
    }

    const sys = `Senior VAG technical specialist. Workshop pros depend on accuracy.

ENGINE TRUTH (only confirmed facts):
EA837=V6 3.0 TFSI SUPERCHARGED (S4 B8, S5, Q7 4L, A6/A7 C7).
EA839=V6 3.0/2.9 TFSI BITURBO (S4 B9, RS4, RS5, SQ5).
EA855=2.5 TFSI 5-CYLINDER (RS3, TT RS) — ALWAYS 5-CYL, NEVER 4-CYL.
EA888=2.0 TFSI 4-cyl turbo (Golf GTI/R, A4 base, A3, etc.).
EA189=2.0 TDI Dieselgate. EA288=2.0 TDI modern.
EA211=1.2/1.4/1.5 TSI modern.
EA896/EA897=V6 3.0 TDI.

FLUIDS: G 052 175 A2=Haldex (0.6L). G 052 529 A2=DQ381. G 055 005 A2=DQ250. G 052 182 A2=DQ200.

NHTSA DATA RELIABILITY RULES — CRITICAL:
- NHTSA is unreliable for VAG specifics. It often gets cylinder count, engine code, and trim WRONG.
- If NHTSA says "4-cyl" but the model is a known 5-cyl (RS3, TT RS) → IGNORE NHTSA, use VAG truth table.
- If NHTSA says "1.98L" for an RS3 → that's WRONG. RS3 = 2.5L 5-cyl EA855.
- If NHTSA model is null/empty but VIN suggests RS3/RS5/S4/S5 etc. → use chassis code + plant + year to deduce.
- Always cross-reference NHTSA data with your VAG knowledge. NHTSA is a hint, not gospel.
- If NHTSA contradicts a known VAG fact, EXPLICITLY note: "⚠ NHTSA reports [X] but [model] uses [Y]".

ABSOLUTE RULES:
1. NEVER invent specs. Uncertain = "⚠ VERIFY: [what] against ElsaPro/VIN"
2. NEVER cite percentages or stats. Use: very common / common / occasional / rare.
3. Engine codes (DEAU, CREC, etc.) are ENGINE codes, not allocations.
4. Start with ### Vehicle Confirmed (using VIN data BUT cross-checked with VAG truth)
5. End with ### CONFIDENCE: HIGH/MEDIUM/LOW
6. Use ### headers. Be direct.`;

    let usr = '';
    if (vinData && vinData.make) {
      usr = `=== NHTSA VIN DECODE (HINT ONLY — verify against VAG truth) ===
VIN: ${vin}
NHTSA says: ${vinData.year || '?'} ${vinData.make || '?'} ${vinData.model || 'MODEL UNKNOWN'} ${vinData.trim || ''}
NHTSA engine: ${vinData.displacement || '?'}L ${vinData.cylinders || '?'}-cyl ${vinData.fuelType || ''}
NHTSA transmission: ${vinData.transmission || 'N/A'}
NHTSA drive: ${vinData.drive || 'N/A'}
NHTSA plant: ${vinData.plant || 'N/A'}

⚠ NHTSA is often wrong for VAG specifics. Cross-check with VIN chassis position 7-8 and known VAG truth.

`;
    } else if (vehicle) {
      usr = `Vehicle (user-provided): ${vehicle}\n\n`;
    }

    usr += `Query type: ${queryType}
Question: ${query}
Sources: ${(sources || []).slice(0, 3).join(', ')}

Respond with:
### Vehicle Confirmed
(Decode VIN chassis code from positions 7-8 if NHTSA model is null. Cross-check with VAG truth. Flag NHTSA conflicts.)

### Engine Verification
(Identify VAG engine family — EA837/839/855/888/etc. Override NHTSA if it conflicts.)

### Root Cause Analysis
### VCDS Procedure
### Most Likely Fixes (very common / common / occasional / rare)
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
    return { statusCode: 200, headers: h, body: JSON.stringify({ result: text, vinData, tokens: d.usage }) };

  } catch (e) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
