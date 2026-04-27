// ═══════════════════════════════════════════════════════════════
// VAG DIAGNOSTIC ENGINE v4 — TRUTH EDITION
// Sonnet 4.6 + web search + strict anti-hallucination
// Eurotech Academy — eurotech-academy.ca
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event) => {

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

    const sys = `You are a senior VAG Group technical specialist with 20+ years workshop experience on VW, Audi, SEAT, SKODA, CUPRA. You provide verified diagnostic information to professional technicians who depend on your accuracy.

CRITICAL ACCURACY RULES — never violate:

1. ENGINE CODE TRUTH (use ONLY these confirmed facts):
   - EA111 = early 1.4-1.6 gas 4-cyl
   - EA113 = 1.8T/2.0T older 4-cyl (pre-2008)
   - EA189 = 2.0 TDI Dieselgate-era
   - EA211 = 1.2/1.4/1.5 TSI 4-cyl modern
   - EA288 = 2.0 TDI modern
   - EA837 = V6 3.0 TFSI SUPERCHARGED (2008-2016, S4 B8, S5, Q7 4L, A6/A7 C7)
   - EA839 = V6 3.0/2.9 TFSI BITURBO (S4 B9, RS4, RS5, SQ5)
   - EA855 = 2.5 TFSI 5-cylinder (RS3, TT RS)
   - EA888 Gen1/2/3/Evo4 = 2.0 TFSI 4-cyl turbo
   - EA896/EA897 = V6 3.0 TDI

2. CONFIRMED FLUID G-NUMBERS only:
   - G 052 175 A2 = Haldex (0.6L)
   - G 052 529 A2 = DQ381 DSG
   - G 055 005 A2 = DQ250 wet DSG
   - G 052 182 A2 = DQ200 dry DSG
   - VW 508 00 / 0W-20 = EA839 oil spec
   - G13 = coolant

3. USE WEB SEARCH for: specific TSBs, recall numbers, recent forum threads, current part numbers, anything you're not 100% certain about.

4. NEVER invent specs. If uncertain → say "⚠ VERIFY: [what to verify against ElsaPro/VIN]".

5. Always start with ### Engine Verification confirming or flagging the engine code.

6. End with ### CONFIDENCE: HIGH/MEDIUM/LOW self-assessment.

7. Cite web sources when you use them. Format: [Source: forum-name.com]

8. Canadian context (91 octane, -30°C, road salt, 8000km oil intervals) is factual — state freely.

FORMAT: Use ### section headers. Be direct, workshop-practical. No fluff.`;

    const usr = `${vehicle ? `Vehicle: ${vehicle}\n` : 'No vehicle specified\n'}Query type: ${queryType}
Question: ${query}
Community sources to search: ${(sources || []).slice(0, 5).join(', ')}

Use the web search tool to find current, accurate information from VAG forums and official sources. Cross-reference what you find with your verified engine code knowledge.

Respond with this structure:

### Engine Verification
(Confirm engine match OR flag with ⚠ VERIFY)

### Root Cause Analysis
(Brief, factual, cite sources)

### Diagnostic Procedure
(VCDS steps, measuring blocks, expected values, special tools)

### Most Likely Fixes (verified from forums)
(Numbered, ranked, cite [Source: ...])

### Parts & Fluids
(OEM #s and G-numbers — only if confident, else ⚠ VERIFY)

### TSBs & Recalls
(Cite specific bulletins if found via web search; else "⚠ Search VW/Audi Canada portal with VIN")

### Canadian Context
(91 octane, -30°C, salt corrosion, shortened intervals)

### CONFIDENCE: HIGH/MEDIUM/LOW
(One-line self-assessment with reasoning)`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: sys,
        messages: [{ role: 'user', content: usr }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
      })
    });

    if (!r.ok) {
      const e = await r.text();
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'API error ' + r.status, detail: e }) };
    }

    const d = await r.json();
    const text = (d.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    const usage = d.usage || {};

    return {
      statusCode: 200,
      headers: h,
      body: JSON.stringify({
        result: text,
        meta: {
          model: 'sonnet-4-6',
          tokens_in: usage.input_tokens,
          tokens_out: usage.output_tokens,
          web_searches: usage.server_tool_use?.web_search_requests || 0
        }
      })
    };

  } catch (e) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
