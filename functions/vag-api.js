// ============================================================================
// vag-api.js — Netlify Function
// POST /.netlify/functions/vag-api
// Proxies Anthropic Claude Haiku 4.5 for workshop-grade VAG diagnostics.
// Canada-focused. Copyright-safe (REFERENCES OEM docs, never reproduces them).
// Pure Node fetch. No dependencies. Single-file exports.handler.
// ============================================================================

// ----------------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------------
const MODEL          = "claude-haiku-4-5-20251001";
const MAX_TOKENS     = 1600;
const ANTHROPIC_URL  = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VER  = "2023-06-01";

// ----------------------------------------------------------------------------
// CORS (open to *)
// ----------------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type":                 "application/json"
};

// ----------------------------------------------------------------------------
// SYSTEM PROMPT (~445 tokens — under the 450 budget)
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT = `Senior VAG (VW/Audi/Porsche/Škoda/SEAT) workshop tech. ErWin/ElsaPro/ODIS experience. Independent Canadian shops.

COPYRIGHT (absolute):
- NEVER reproduce ElsaPro/ErWin text, diagrams, or wiring schematics.
- REFERENCE sources by doc #, chapter, or guided-function name only.
- Describe part locations in your own words.
- NEVER invent TSB/recall #s. If unknown: "No specific TSB identified — verify at VW/Audi Canada dealer portal with VIN."
- Part #s, TSB #s, recall codes are public — cite confidently when known.

Output these EXACT markdown sections in this order:

### Root Cause Analysis
≤4 sentences, technical.

### Official Source References
ErWin chapter/section, ElsaPro doc #, ODIS guided-function name, SSP #, SAGA claim code. Reference only.

### TSBs, Recalls & Service Campaigns
Bullets with: TSB # (XX-XX-XX or YYXXYYYY), title, year+VIN range, fix, Canadian warranty status, recall codes (NHTSA + Transport Canada), 24X goodwill, emissions warranty (federal 8yr/130,000 km), extended coverage (EA888 Gen3 water pump, chain tensioner, etc.). Flag pre-out-of-warranty fixes. If none: dealer-lookup fallback.

### Step-by-Step VCDS Procedure
Numbered: (1) prep — battery V, coolant temp, fuel level; (2) Address > Function > path; (3) measuring blocks w/ expected values + tolerances; (4) inspection w/ torque (Nm) + VAG T-tool #s; (5) misdiagnosis traps; (6) post-repair verification.

### Parts Location Description
Bay side, landmarks, access steps, OEM # (XXX-XXX-XXX-X), superseded #, aftermarket that works vs fails. No diagrams.

### Community Research Sources
Subforum URLs (AudiWorld, VWVortex, Audi-Sport.net, Motor-Talk.de, MeinGolfForum), verified YouTube (Humble Mechanic, Deutsche Auto Parts, FCP Euro, Car Wizard), FB groups by engine code, VAG subreddits, specialist blogs (034Motorsport, APR, IE).

### Canadian Context
91 octane, -30 °C cold start, road-salt corrosion, shortened intervals, CA parts vs US/EU.

### Estimated Shop Time
SAGA-style labor hours, difficulty 1–5, VAG T-tools, VAS scan-tool needs.

### Warranty & Goodwill Strategy
Only if warranty-eligible: dealer approach, goodwill triggers, docs to bring, escalation (dealer → zone rep → VW Canada customer care).

### Legal Disclaimer
Exactly: "Always cross-reference with current ElsaPro/ErWin documentation for your specific VIN before performing any repair."`;

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------
function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

function buildUserMessage({ vehicle, queryType, query, sources }) {
  const lines = [
    `Vehicle: ${vehicle || "unspecified"}`,
    `Query type: ${queryType || "general diagnostic"}`,
    `Technician question: ${query}`
  ];
  if (sources && String(sources).trim().length) {
    lines.push(`Additional context from technician: ${sources}`);
  }
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// HANDLER
// ----------------------------------------------------------------------------
exports.handler = async (event) => {
  // --- CORS preflight ---
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  // --- Method gate ---
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  // --- API key check ---
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Server misconfiguration: ANTHROPIC_API_KEY not set." });
  }

  // --- Parse body ---
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const { vehicle = "", queryType = "", query = "", sources = "" } = payload;

  // --- Input validation ---
  if (typeof query !== "string" || query.trim().length < 3) {
    return json(400, { error: "Missing or too-short 'query' field (min 3 chars)." });
  }
  if (query.length > 4000) {
    return json(400, { error: "Query too long (max 4000 chars)." });
  }

  const userMessage = buildUserMessage({ vehicle, queryType, query, sources });

  // --- Call Anthropic ---
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": ANTHROPIC_VER,
        "Content-Type":      "application/json"
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: userMessage }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return json(response.status, {
        error:  "Anthropic API error",
        status: response.status,
        detail: errText.slice(0, 500)
      });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

    if (!text) {
      return json(502, { error: "Empty response from model.", raw: data });
    }

    // --- Success ---
    return json(200, {
      answer: text,
      model:  MODEL,
      usage:  data.usage || null,
      meta: {
        vehicle:   vehicle || null,
        queryType: queryType || null
      }
    });

  } catch (err) {
    return json(502, {
      error:  "Upstream fetch failed",
      detail: String(err && err.message ? err.message : err).slice(0, 500)
    });
  }
};
