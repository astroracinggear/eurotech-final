// ═══════════════════════════════════════════════════════════════
// VAG TOOL VALIDATION BOT
// Tests VIN decoder + diagnostic tool 3x daily
// Sends email report with what works and what fails
// ═══════════════════════════════════════════════════════════════

// Real VAG VINs with KNOWN-CORRECT decoded data
// These are real VIN patterns — bot checks if NHTSA + Haiku get them right
const TEST_FLEET = [
  {
    id: 'V01',
    vin: 'WAUB4AF45MA000000',  // Audi S4 B9 2021 example pattern
    expected: { make: 'AUDI', model: 'S4', year: '2021', engineCode: 'EA839', cyl: '6' },
    diagnostic: { query: 'P0299 underboost above 3000 rpm', mustContain: ['EA839'], mustNot: ['EA888', '4-cyl'] }
  },
  {
    id: 'V02',
    vin: 'WVWZZZ5GZJW000000',  // VW Golf MK7
    expected: { make: 'VOLKSWAGEN', model: 'GOLF', year: '2018' },
    diagnostic: { query: 'P0016 cam correlation', mustContain: ['EA888'], mustNot: ['V6', 'biturbo'] }
  },
  {
    id: 'V03',
    vin: 'WA1VAAF73JD000000',  // Audi Q5 example
    expected: { make: 'AUDI', model: 'Q5', year: '2018' },
    diagnostic: { query: 'DSG service interval', mustContain: ['DQ'], mustNot: [] }
  },
  {
    id: 'V04',
    vin: 'WUAUFCFC0DN000000',  // Audi RS3 example pattern
    expected: { make: 'AUDI', engineCode: 'EA855', cyl: '5' },
    diagnostic: { query: 'P0301 misfire cylinder 1', mustContain: ['EA855', '5-cyl'], mustNot: ['4-cyl'] }
  },
  {
    id: 'V05',
    vin: 'WAUZZZ8K0CA000000',  // Audi S4 B8 (CREC)
    expected: { make: 'AUDI', model: 'S4', engineCode: 'EA837' },
    diagnostic: { query: 'Supercharger whine at idle', mustContain: ['EA837', 'supercharged'], mustNot: ['biturbo', 'EA839'] }
  }
];

// ═══ NHTSA DECODE ═══
async function decodeVIN(vin) {
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
    if (!r.ok) return null;
    const data = await r.json();
    const results = data.Results || [];
    const get = key => {
      const item = results.find(x => x.Variable === key);
      return item && item.Value && item.Value !== 'Not Applicable' ? item.Value : null;
    };
    return {
      make: get('Make'),
      model: get('Model'),
      year: get('Model Year'),
      cyl: get('Engine Number of Cylinders'),
      displacement: get('Displacement (L)'),
      errorCode: get('Error Code')
    };
  } catch {
    return null;
  }
}

// ═══ TOOL DIAGNOSTIC TEST ═══
async function testDiagnostic(test) {
  try {
    const r = await fetch('https://eurotech-academy.ca/.netlify/functions/vag-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vin: test.vin,
        queryType: 'dtc',
        query: test.diagnostic.query,
        sources: ['AudiWorld', 'VWVortex']
      })
    });
    if (!r.ok) return { error: `HTTP ${r.status}`, response: null };
    const data = await r.json();
    return { response: data.result || '', vinData: data.vinData };
  } catch (e) {
    return { error: e.message, response: null };
  }
}

// ═══ SCORING ═══
function scoreVIN(decoded, expected) {
  if (!decoded) return { passed: false, issues: ['NHTSA returned null'] };
  const issues = [];
  if (expected.make && decoded.make !== expected.make) issues.push(`Make: got "${decoded.make}", expected "${expected.make}"`);
  if (expected.year && decoded.year !== expected.year) issues.push(`Year: got "${decoded.year}", expected "${expected.year}"`);
  if (expected.cyl && decoded.cyl !== expected.cyl) issues.push(`Cylinders: got "${decoded.cyl}", expected "${expected.cyl}"`);
  return { passed: issues.length === 0, issues, decoded };
}

function scoreDiagnostic(response, test) {
  if (!response) return { passed: false, issues: ['No response received'] };
  const text = response.toLowerCase();
  const issues = [];
  test.diagnostic.mustContain.forEach(t => { if (!text.includes(t.toLowerCase())) issues.push(`MISSING: "${t}"`); });
  test.diagnostic.mustNot.forEach(t => { if (text.includes(t.toLowerCase())) issues.push(`HALLUCINATION: "${t}"`); });
  if (!text.includes('confidence:')) issues.push('No CONFIDENCE self-assessment');
  return { passed: issues.length === 0, issues };
}

// ═══ MAIN HANDLER ═══
exports.handler = async () => {
  const results = [];

  for (const test of TEST_FLEET) {
    const startTotal = Date.now();

    // Step 1: VIN decode
    const decoded = await decodeVIN(test.vin);
    const vinScore = scoreVIN(decoded, test.expected);

    // Step 2: Tool diagnostic test
    const diagResult = await testDiagnostic(test);
    const diagScore = scoreDiagnostic(diagResult.response, test);

    results.push({
      id: test.id,
      vin: test.vin,
      query: test.diagnostic.query,
      vinDecode: { passed: vinScore.passed, issues: vinScore.issues, decoded: vinScore.decoded },
      diagnostic: { passed: diagScore.passed, issues: diagScore.issues, preview: (diagResult.response || diagResult.error || '').substring(0, 250) },
      elapsed: Date.now() - startTotal,
      overallPass: vinScore.passed && diagScore.passed
    });

    await new Promise(r => setTimeout(r, 500));
  }

  // ═══ Build report ═══
  const total = results.length;
  const overallPassed = results.filter(r => r.overallPass).length;
  const vinPassed = results.filter(r => r.vinDecode.passed).length;
  const diagPassed = results.filter(r => r.diagnostic.passed).length;

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      overallPassRate: Math.round((overallPassed / total) * 100),
      vinDecodeRate: Math.round((vinPassed / total) * 100),
      diagnosticRate: Math.round((diagPassed / total) * 100),
      total
    },
    results
  };

  // ═══ Send email if Resend configured ═══
  if (process.env.RESEND_API_KEY) {
    const html = `
<div style="font-family:system-ui;max-width:720px;color:#222;">
  <h1 style="color:#C8001A;border-bottom:2px solid #C8001A;padding-bottom:8px;">VAG Bot Report — ${new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })}</h1>

  <div style="background:#f5f5f5;padding:20px;margin:20px 0;border-radius:4px;">
    <h2 style="margin-top:0;">Overall: ${report.summary.overallPassRate}%</h2>
    <table style="width:100%;font-size:14px;">
      <tr><td><b>VIN Decoder:</b></td><td>${vinPassed}/${total} (${report.summary.vinDecodeRate}%)</td></tr>
      <tr><td><b>Diagnostic Tool:</b></td><td>${diagPassed}/${total} (${report.summary.diagnosticRate}%)</td></tr>
    </table>
  </div>

  <h3>📋 Test Details</h3>
  ${results.map(r => `
    <div style="border:1px solid #ddd;border-left:4px solid ${r.overallPass ? '#00a85e' : '#c8001a'};padding:12px;margin:10px 0;background:white;">
      <h4 style="margin:0 0 8px;">${r.id}: ${r.vin}</h4>
      <p style="margin:4px 0;font-size:13px;color:#666;">Query: ${r.query}</p>

      <details style="margin:8px 0;">
        <summary><b>VIN Decode:</b> ${r.vinDecode.passed ? '✅' : '❌'}</summary>
        ${r.vinDecode.decoded ? `<pre style="background:#fafafa;padding:8px;font-size:11px;">${JSON.stringify(r.vinDecode.decoded, null, 2)}</pre>` : ''}
        ${r.vinDecode.issues.length ? `<ul>${r.vinDecode.issues.map(i => `<li style="color:#c8001a;">${i}</li>`).join('')}</ul>` : ''}
      </details>

      <details style="margin:8px 0;">
        <summary><b>Diagnostic:</b> ${r.diagnostic.passed ? '✅' : '❌'}</summary>
        ${r.diagnostic.issues.length ? `<ul>${r.diagnostic.issues.map(i => `<li style="color:#c8001a;">${i}</li>`).join('')}</ul>` : ''}
        <pre style="background:#fafafa;padding:8px;font-size:11px;white-space:pre-wrap;">${r.diagnostic.preview}</pre>
      </details>
    </div>
  `).join('')}

  <h3>🎯 Action Items</h3>
  <ul>
    ${results.filter(r => !r.vinDecode.passed).length > 0 ? '<li><b>VIN Decoder failures</b> — NHTSA may have wrong data for these VINs. Consider switching API or adding manual override.</li>' : ''}
    ${results.filter(r => r.diagnostic.issues.some(i => i.includes('HALLUCINATION'))).length > 0 ? '<li><b>Hallucinations detected</b> — strengthen system prompt anti-hallucination rules.</li>' : ''}
    ${results.filter(r => r.diagnostic.issues.some(i => i.includes('MISSING'))).length > 0 ? '<li><b>Missing key info</b> — adjust prompt to require specific terms.</li>' : ''}
    ${overallPassed === total ? '<li>✅ All tests passing! No action needed.</li>' : ''}
  </ul>

  <p style="color:#888;font-size:11px;margin-top:30px;">VAG Bot v1 · Tests run: VIN decoder (NHTSA) + Diagnostic tool (Haiku 4.5)</p>
</div>`;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'VAG Bot <bot@send.eurotech-academy.ca>',
          to: 'astroracinggear@gmail.com',
          subject: `VAG Bot — ${report.summary.overallPassRate}% pass · VIN ${report.summary.vinDecodeRate}% · Diag ${report.summary.diagnosticRate}%`,
          html
        })
      });
    } catch {}
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(report, null, 2)
  };
};
