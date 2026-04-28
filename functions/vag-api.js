// VAG Diagnostic Engine v6 — Haiku 4.5 + NHTSA VIN decoder
// Auto-decodes VIN → confirms vehicle → sends verified info to AI

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

    // ═══ NHTSA VIN DECODE (free, no API key) ═══
    let vinData = null;
    if (vin && vin.length === 17) {
      try {
        const nhtsaR = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
        if (nhtsaR.ok) {
          const data = await nhtsaR.json();
          const results = data.Results || [];
          const get = (key) => {
            const r = results.find(r => r.Variable === key);
            return r && r.Value && r.Value !== 'Not Applicable' ? r.Value : null;
          };
          vinData = {
            make: get('Make'),
            model: get('Model'),
            year: get('Model Year'),
            trim: get('Trim') || get('Series'),
            engineModel: get('Engine Model'),
            engineConfig: get('Engine Configuration'),
            displacement: get('Displacement (L)'),
            cylinders: get('Engine Number of Cylinders'),
            fuelType: get('Fuel Type - Primary'),
            transmission: get('Transmission Style'),
            drive: get('Drive Type'),
            plant: get('Plant Country'),
            bodyClass: get('Body Class'),
            bodyType: get('Body Type'),
            doors: get('Doors'),
            errorCode: get('Error Code'),
            errorText: get('Error Text')
          };
        }
      } catch (e) {
        // VIN decode failure not fatal
      }
    }

    // Build vehicle string from VIN data or user input
    let vehicleStr = vehicle || '';
    if (vinData && vinData.make) {
      const parts = [vinData.year, vinData.make, vinData.model, vinData.trim].filter(Boolean);
      vehicleStr = parts.join(' ');
      if (vinData.displacement) vehicleStr += ` (${vinData.displacement}L`;
      if (vinData.cylinders) vehicleStr += ` ${vinData.cylinders}-cyl`;
      if (vinData.displacement) vehicleStr += ')';
    }

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

ABSOLUTE RULES:
1. NEVER invent specs, codes, part numbers. Uncertain = "⚠ VERIFY: [what] against ElsaPro/VIN"
2. NEVER cite percentages or stats. Use: very common / common / occasional / rare.
3. Engine codes (DEAU, CREC, etc.) are ENGINE codes, not regional allocations.
4. Start with ### Vehicle Confirmed (using VIN data if provided)
5. End with ### CONFIDENCE: HIGH/MEDIUM/LOW
6. Canadian context (91 octane, -30°C, salt) is factual.
7. Use ### headers. Be direct.`;

    let usr = '';
    if (vinData && vinData.make) {
      usr = `=== VIN-DECODED VEHICLE (verified data from NHTSA) ===
VIN: ${vin}
Make: ${vinData.make}
Model: ${vinData.model}
Year: ${vinData.year}
Trim: ${vinData.trim || 'N/A'}
Engine: ${vinData.displacement || '?'}L ${vinData.cylinders || '?'}-cyl ${vinData.engineConfig || ''}
Fuel: ${vinData.fuelType || 'N/A'}
Transmission: ${vinData.transmission || 'N/A'}
Drive: ${vinData.drive || 'N/A'}
Plant: ${vinData.plant || 'N/A'}
Body: ${vinData.bodyClass || 'N/A'}

`;
    } else if (vehicleStr) {
      usr = `Vehicle (user-provided, NOT VIN-verified): ${vehicleStr}\n\n`;
    }

    usr += `Query type: ${queryType}
Question: ${query}
Sources: ${(sources || []).slice(0, 3).join(', ')}

Respond with:
### Vehicle Confirmed
(Match VIN data to VAG engine family; flag any mismatch with ⚠)

### Engine Verification
(Identify VAG engine code - EA837, EA839, EA888, etc.)

### Root Cause Analysis
### VCDS Procedure
### Most Likely Fixes (very common / common / occasional / rare — NO percentages)
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
    return {
      statusCode: 200,
      headers: h,
      body: JSON.stringify({
        result: text,
        vinData: vinData,
        tokens: d.usage
      })
    };

  } catch (e) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
