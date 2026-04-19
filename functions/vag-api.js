// ═══════════════════════════════════════════════════════════════
// VAG DIAGNOSTIC ENGINE v3 — Anti-Hallucination Edition
// Eurotech Academy — eurotech-academy.ca
// Model: claude-haiku-4-5-20251001
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event) => {

  // ─── CORS ──────────────────────────────────────────────
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'No API key configured' }) };
  }

  try {
    const { vehicle, queryType, query, sources } = JSON.parse(event.body || '{}');
    if (!query) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Query required' }) };

    // ─── SYSTEM PROMPT — Strict Anti-Hallucination ───────
    const sys = `You are a senior VAG technician. ACCURACY OVER COMPLETENESS. Workshop pros follow your advice — wrong specs cost thousands in parts and labor.

ENGINE CODE TRUTH TABLE (memorize, use ONLY these confirmed facts):
EA111 = early 1.4-1.6 gas 4-cyl
EA113 = 1.8T/2.0T older 4-cyl (pre-2008)
EA189 = 2.0 TDI Dieselgate-era
EA211 = 1.2/1.4/1.5 TSI 4-cyl modern
EA288 = 2.0 TDI modern
EA837 = V6 3.0 TFSI SUPERCHARGED (2008-2016, S4 B8, S5, Q7 4L, A6/A7 C7)
EA839 = V6 3.0/2.9 TFSI BITURBO (S4 B9, RS4, RS5, SQ5, Panamera shared)
EA888 Gen1/2/3/Evo4 = 2.0 TFSI 4-cyl turbo
EA896 = V6 3.0 TDI
EA897 = V6 3.0 TDI newer

CONFIRMED FLUID G-NUMBERS (use only these with confidence):
G 052 175 A2 = Haldex oil (0.6L)
G 052 529 A2 = DQ381 DSG fluid
G 055 005 A2 = DQ250 wet DSG fluid
G 052 182 A2 = DQ200 dry DSG fluid

RULES — NEVER VIOLATE:
1. If engine code uncertain → "⚠ VERIFY ENGINE: [explain]. Diagnosis generic until VIN-confirmed."
2. Start EVERY response with ### Engine Verification section
3. TSB numbers ONLY if certain; else "⚠ CHECK TSB PORTAL: Search VW/Audi Canada with VIN"
4. Part numbers ONLY if valid VAG format; else "⚠ VERIFY PART #: Consult ETKA with VIN"
5. Fluids other than confirmed list above → "⚠ VERIFY FLUID: Per ElsaPro by VIN"
6. VCDS addresses — only confirmed ones; else "⚠ VERIFY ADDRESS"
7. NEVER invent specs to sound authoritative. Admission of uncertainty = professionalism.
8. Canadian context (91 octane, -30C, salt) is factual — state freely.
9. End response with CONFIDENCE: HIGH/MEDIUM/LOW self-assessment.

FORMAT: Use ### headers. Be concise. Flag uncertainty with ⚠.`;

    // ─── USER MESSAGE ────────────────────────────────────
    const usr = `${vehicle ? `Vehicle provided: ${vehicle}\n` : 'No vehicle specified\n'}Query type: ${queryType}
Question: ${query}
Community sources context: ${(sources || []).slice(0, 3).join(', ')}

Respond with this exact structure:

### Engine Verification
(Confirm engine code match OR flag with ⚠ VERIFY ENGINE)

### Root Cause Analysis
(Brief, factual, flag speculation)

### Most Likely Fixes
(Numbered, ranked by probability, flag uncertain specs)

### VCDS Procedure
(Numbered steps; confirmed addresses only, else ⚠)

### Parts & Fluids
(OEM #s only if confident; else ⚠ VERIFY)

### TSBs & Recalls
(Only if certain; else direct to dealer VIN lookup)

### Canadian Context
(91 octane / -30°C / salt — factual)

### CONFIDENCE: HIGH/MEDIUM/LOW
(One-line self-assessment of response reliability)`;

    // ─── API CALL ────────────────────────────────────────
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1400,
        system: sys,
        messages: [{ role: 'user', content: usr }]
      })
    });

    if (!r.ok) {
      const e = await r.text();
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'API error ' + r.status, detail: e }) };
    }

    const d = await r.json();
    const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

    return { statusCode: 200, headers: h, body: JSON.stringify({ result: text }) };

  } catch (e) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
