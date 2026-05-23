// VAG Diagnostic Engine v9 — member code auth + daily limit (3/day per code)
const { getStore } = require('@netlify/blobs');

// ═══════════════════════════════════════════════
// CODES MEMBRES VALIDES — éditer ici pour ajouter/retirer
// ═══════════════════════════════════════════════
const VALID_CODES = [
  "ETA-27HA", "ETA-2CNA", "ETA-2DMQ", "ETA-2QHP", "ETA-33PU",
  "ETA-36GN", "ETA-3UPY", "ETA-47FE", "ETA-4AJR", "ETA-69PN",
  "ETA-6P2V", "ETA-84AW", "ETA-8ELV", "ETA-8GT9", "ETA-8LX6",
  "ETA-92JK", "ETA-9WK4", "ETA-ATS7", "ETA-BKST", "ETA-BKYN",
  "ETA-CCYD", "ETA-DHTN", "ETA-EAR8", "ETA-ETWM", "ETA-G2YD",
  "ETA-GE8F", "ETA-K53M", "ETA-K6VQ", "ETA-K9R2", "ETA-LY3H",
  "ETA-MEBA", "ETA-NCPN", "ETA-PC92", "ETA-R6NE", "ETA-RDWA",
  "ETA-RR6X", "ETA-RVXT", "ETA-S92F", "ETA-S9N8", "ETA-S9TN",
  "ETA-TLTN", "ETA-UG3P", "ETA-UXPA", "ETA-VYWC", "ETA-W8YC",
  "ETA-WWF3", "ETA-Y227", "ETA-Y3MZ", "ETA-YGBY", "ETA-Z3CR"
];

const DAILY_LIMIT = 3; // recherches par jour par code

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
    const { vin, vehicle, queryType, query, sources, code } = JSON.parse(event.body || '{}');

    // 1. VALIDATION DU CODE MEMBRE
    if (!code) {
      return { statusCode: 401, headers: h, body: JSON.stringify({ error: 'NO_CODE', message: 'Code membre requis. Entrez votre code Eurotech.' }) };
    }
    const cleanCode = String(code).trim().toUpperCase();
    if (!VALID_CODES.includes(cleanCode)) {
      return { statusCode: 403, headers: h, body: JSON.stringify({ error: 'INVALID_CODE', message: 'Code invalide. Verifiez votre code membre Eurotech.' }) };
    }

    if (!query) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Query required' }) };

    // 2. LIMITE QUOTIDIENNE (3/jour par code)
    const today = new Date().toISOString().slice(0, 10);
    const usageKey = `${cleanCode}_${today}`;
    let usageCount = 0;

    try {
      const store = getStore('vag-usage');
      const existing = await store.get(usageKey);
      usageCount = existing ? parseInt(existing, 10) : 0;

      if (usageCount >= DAILY_LIMIT) {
        return {
          statusCode: 429,
          headers: h,
          body: JSON.stringify({
            error: 'DAILY_LIMIT',
            message: `Limite quotidienne atteinte (${DAILY_LIMIT} recherches/jour). Revenez demain.`,
            used: usageCount,
            limit: DAILY_LIMIT
          })
        };
      }
    } catch (blobErr) {
      console.error('Blobs read error:', blobErr.message);
    }

    // 3. NHTSA VIN DECODE
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

    // 4. PROMPT
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

    // 5. INCRÉMENTER LE COMPTEUR (après succès)
    try {
      const store = getStore('vag-usage');
      await store.set(usageKey, String(usageCount + 1));
    } catch (blobErr) {
      console.error('Blobs write error:', blobErr.message);
    }

    return {
      statusCode: 200,
      headers: h,
      body: JSON.stringify({
        result: text,
        tokens: d.usage,
        usage: { used: usageCount + 1, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - usageCount - 1 }
      })
    };

  } catch (e) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
