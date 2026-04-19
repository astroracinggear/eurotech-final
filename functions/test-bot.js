// ═══════════════════════════════════════════════════════════════
// VAG TOOL TEST BOT PRO v2.0
// 40 tests/day + Opus judge + critical alerts + trend tracking
// Netlify Scheduled Function — runs daily at 08:00 EST
// ═══════════════════════════════════════════════════════════════

const { schedule } = require('@netlify/functions');

// ═══ 40 TEST CASES ═══
const TEST_CASES = [
  // ── DTC TESTS (10) ──
  { id: 'DTC01', cat: 'dtc', vehicle: 'Audi S4 B9', year: '2021', engine: 'DEAU', query: 'P0299 underboost above 3000 rpm', expects: { must: ['EA839'], mustNot: ['EA888', '4-cyl'], confHigh: true } },
  { id: 'DTC02', cat: 'dtc', vehicle: 'VW Golf GTI MK8', year: '2022', engine: 'DNPB', query: 'P0016 camshaft correlation bank 1', expects: { must: ['EA888', 'cam'], mustNot: ['biturbo'] } },
  { id: 'DTC03', cat: 'dtc', vehicle: 'Audi Q7', year: '2016', engine: '', query: 'P0299 underboost', expects: { must: ['⚠', 'VERIFY'], reason: 'Q7 2016 ambiguous' } },
  { id: 'DTC04', cat: 'dtc', vehicle: 'VW Golf TDI', year: '2015', engine: 'CKRA', query: 'P2002 DPF efficiency', expects: { must: ['EA189', 'DPF'], mustNot: ['gasoline', 'EA888'] } },
  { id: 'DTC05', cat: 'dtc', vehicle: 'Audi A4 B8', year: '2011', engine: 'CAEB', query: 'P0171 system too lean bank 1', expects: { must: ['EA888'] } },
  { id: 'DTC06', cat: 'dtc', vehicle: 'Audi RS3 8V', year: '2017', engine: 'CZGB', query: 'P0301 misfire cylinder 1', expects: { must: ['EA855', '5-cyl'], mustNot: ['4-cyl', 'V6'] } },
  { id: 'DTC07', cat: 'dtc', vehicle: 'VW Jetta GLI', year: '2020', engine: 'DKZA', query: 'P0420 catalyst efficiency below threshold', expects: { must: ['EA888', 'catalyst'] } },
  { id: 'DTC08', cat: 'dtc', vehicle: 'Audi S5 B9', year: '2019', engine: 'CWGD', query: 'P0087 fuel rail pressure too low', expects: { must: ['EA839', 'V6'], mustNot: ['4-cyl'] } },
  { id: 'DTC09', cat: 'dtc', vehicle: 'VW Tiguan MK2', year: '2020', engine: 'DGUA', query: 'P2196 O2 sensor signal stuck rich', expects: { must: ['EA888'] } },
  { id: 'DTC10', cat: 'dtc', vehicle: 'Audi S4 B8', year: '2012', engine: 'CREC', query: 'P0234 turbo/super overboost', expects: { must: ['EA837', 'supercharged'], mustNot: ['biturbo', 'EA839'] } },

  // ── MAINTENANCE (10) ──
  { id: 'MNT01', cat: 'maintenance', vehicle: 'VW Golf R MK8', year: '2023', engine: 'DNPF', query: 'DQ381 DSG fluid change interval and spec', expects: { must: ['G 052 529 A2', 'DQ381'], confHigh: true } },
  { id: 'MNT02', cat: 'maintenance', vehicle: 'VW Golf R MK7', year: '2017', engine: 'DJHA', query: 'Haldex AWD fluid procedure', expects: { must: ['G 052 175 A2', '0.6L'], confHigh: true } },
  { id: 'MNT03', cat: 'maintenance', vehicle: 'Audi S4 B9', year: '2020', engine: 'DEAU', query: 'Engine oil spec 0W-20 Canada', expects: { must: ['VW 508 00'], canada: true } },
  { id: 'MNT04', cat: 'maintenance', vehicle: 'VW Jetta', year: '2019', engine: 'DGAA', query: 'Spark plug change interval and gap', expects: { must: ['plug', 'interval'] } },
  { id: 'MNT05', cat: 'maintenance', vehicle: 'Audi A6 C8', year: '2021', engine: 'DLZA', query: 'Brake fluid change interval', expects: { must: ['DOT 4', '2 year'] } },
  { id: 'MNT06', cat: 'maintenance', vehicle: 'VW Atlas', year: '2020', engine: 'CUWA', query: 'ZF 8HP transmission fluid service', expects: { must: ['ZF LGF8', 'NOT DSG'] } },
  { id: 'MNT07', cat: 'maintenance', vehicle: 'Audi Q5 B9', year: '2019', engine: 'DAXA', query: 'DQ500 fluid service interval', expects: { must: ['DQ500'] } },
  { id: 'MNT08', cat: 'maintenance', vehicle: 'VW GTI MK7', year: '2018', engine: 'DKTA', query: 'Intake valve carbon cleaning interval Canada', expects: { must: ['70,000 km'], canada: true } },
  { id: 'MNT09', cat: 'maintenance', vehicle: 'Audi RS5 B9', year: '2021', engine: 'DECA', query: 'Engine air filter and cabin filter interval', expects: { must: ['interval'] } },
  { id: 'MNT10', cat: 'maintenance', vehicle: 'VW Arteon', year: '2022', engine: 'DNHA', query: 'Coolant G13 spec and refresh interval', expects: { must: ['G13'] } },

  // ── PERFORMANCE (6) ──
  { id: 'PRF01', cat: 'tuning', vehicle: 'Audi S4 B9', year: '2021', engine: 'DEAU', query: 'Stage 1 tune 91 octane Canada expected gains', expects: { must: ['91 octane', 'EA839'], canada: true } },
  { id: 'PRF02', cat: 'tuning', vehicle: 'VW Golf R MK8', year: '2023', engine: 'DNPF', query: 'DQ381 TCU tune reliability concerns', expects: { must: ['DQ381'] } },
  { id: 'PRF03', cat: 'tuning', vehicle: 'Audi RS3 8V', year: '2017', engine: 'CZGB', query: 'Stage 2 APR vs Integrated Engineering', expects: { must: ['EA855'] } },
  { id: 'PRF04', cat: 'tuning', vehicle: 'VW GTI MK7.5', year: '2019', engine: 'CHHB', query: 'Downpipe install E85 compatibility', expects: { must: ['EA888'] } },
  { id: 'PRF05', cat: 'tuning', vehicle: 'Audi S3 8V', year: '2018', engine: 'CJXE', query: 'Stock turbo limit EA888 Gen3', expects: { must: ['EA888'] } },
  { id: 'PRF06', cat: 'tuning', vehicle: 'VW Golf R MK7', year: '2017', engine: 'DJHA', query: 'Stage 1 91 octane vs 93 octane difference', expects: { must: ['octane'] } },

  // ── SYMPTOMS (8) ──
  { id: 'SYM01', cat: 'symptom', vehicle: 'Audi A4 B9', year: '2020', engine: 'CVKA', query: 'Rough cold start -25C clears after 5 min', expects: { must: ['cold'], canada: true } },
  { id: 'SYM02', cat: 'symptom', vehicle: 'VW Tiguan', year: '2019', engine: 'DGUA', query: 'Shudder at 1500-2000 rpm light throttle', expects: { must: ['EA888'] } },
  { id: 'SYM03', cat: 'symptom', vehicle: 'Audi S4 B8', year: '2013', engine: 'CREC', query: 'Supercharger whine loud at idle', expects: { must: ['EA837', 'supercharged'], mustNot: ['biturbo'] } },
  { id: 'SYM04', cat: 'symptom', vehicle: 'VW Golf TDI', year: '2014', engine: 'CJAA', query: 'White smoke on cold start disappears warm', expects: { must: ['TDI'] } },
  { id: 'SYM05', cat: 'symptom', vehicle: 'Audi Q7', year: '2018', engine: '', query: 'Air suspension sagging overnight passenger rear', expects: { must: ['⚠'] } },
  { id: 'SYM06', cat: 'symptom', vehicle: 'VW Passat', year: '2016', engine: 'CZCA', query: 'DSG hard shifts 1-2 at low speed', expects: { must: ['DQ'] } },
  { id: 'SYM07', cat: 'symptom', vehicle: 'Audi A6 C7', year: '2015', engine: 'CREE', query: 'Power loss accompanied by rattle cold start', expects: { must: ['EA837'] } },
  { id: 'SYM08', cat: 'symptom', vehicle: 'VW ID.4', year: '2022', engine: '', query: 'Range dropped 40% since last winter', expects: { must: ['HV', 'MEB'], canada: true } },

  // ── EDGE CASES (6) ──
  { id: 'EDG01', cat: 'symptom', vehicle: '', year: '', engine: '', query: 'My car makes noise', expects: { must: ['⚠', 'VERIFY'], reason: 'Too vague — must refuse' } },
  { id: 'EDG02', cat: 'dtc', vehicle: 'Audi S4', year: '2020', engine: '', query: 'XXX9999 invalid code', expects: { must: ['⚠'] } },
  { id: 'EDG03', cat: 'symptom', vehicle: 'Ford F150', year: '2020', engine: '', query: 'Engine light on', expects: { must: ['⚠'], reason: 'Non-VAG vehicle' } },
  { id: 'EDG04', cat: 'maintenance', vehicle: 'VW Golf R', year: '2099', engine: '', query: 'Future car maintenance', expects: { must: ['⚠'], reason: 'Invalid year' } },
  { id: 'EDG05', cat: 'dtc', vehicle: 'Audi Q3', year: '2020', engine: 'DKTA', query: 'Translate P0299 to French', expects: { must: ['underboost', 'sous-alim', 'pression'] } },
  { id: 'EDG06', cat: 'tuning', vehicle: 'VW Passat', year: '2010', engine: 'CBFA', query: 'Stage 3 K04 turbo upgrade 50k km daily', expects: { must: ['EA888'] } }
];

// ═══ KEYWORD SCORING ═══
function scoreResponse(text, expected) {
  const issues = [];
  const t = (text || '').toLowerCase();

  if (expected.must) expected.must.forEach(term => { if (!t.includes(term.toLowerCase())) issues.push(`MISSING: "${term}"`); });
  if (expected.mustNot) expected.mustNot.forEach(term => { if (t.includes(term.toLowerCase())) issues.push(`HALLUCINATION: "${term}"`); });
  if (expected.confHigh && !t.includes('confidence: high')) issues.push('LOW_CONFIDENCE: Expected HIGH confidence');
  if (expected.canada && !t.match(/canad|91 octan|-\d+.*c|salt/i)) issues.push('MISSING: Canadian context');
  if (!t.includes('confidence:')) issues.push('MISSING: No CONFIDENCE self-assessment');
  if (!t.includes('engine verification')) issues.push('MISSING: No Engine Verification section');
  if ((text || '').length < 300) issues.push('TOO_SHORT: Under 300 chars');
  if ((text || '').length > 4500) issues.push('TOO_LONG: Over 4500 chars (cost waste)');

  return { passed: issues.length === 0, issues, length: (text || '').length };
}

// ═══ OPUS JUDGE — expensive but critical 2x/week ═══
async function opusJudge(testCase, haiku_response) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const judgeSystemPrompt = `You are a senior VAG Group technical expert reviewing AI-generated diagnostic responses for accuracy. Your job is to catch hallucinations, factual errors, and misleading advice that could harm technicians or customers.

For each response, assess:
1. ENGINE CODE ACCURACY — Is the engine code correctly identified?
2. TECHNICAL SPEC ACCURACY — Are part numbers, fluid specs, VCDS addresses plausible?
3. DIAGNOSTIC LOGIC — Does the reasoning follow sound VAG workshop methodology?
4. SAFETY — Would following this advice cause damage or injury?
5. UNCERTAINTY HANDLING — Did the AI appropriately flag uncertainties?

Output ONLY valid JSON:
{
  "verdict": "PASS" | "FAIL" | "WARN",
  "errors": ["specific errors found"],
  "suggestions": ["specific prompt improvements to prevent these errors"],
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "summary": "one-sentence verdict"
}`;

  const userMsg = `Test query: ${testCase.query}
Vehicle: ${testCase.vehicle} ${testCase.year} ${testCase.engine}
Expected engine family: ${testCase.expects.must ? testCase.expects.must.join(', ') : 'any'}

AI Response to review:
"""
${haiku_response}
"""

Judge this response. Respond with JSON only.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 800,
        system: judgeSystemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    if (!r.ok) return null;
    const d = await r.json();
    const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    try { return JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { return { verdict: 'WARN', summary: 'Judge returned invalid JSON' }; }
  } catch {
    return null;
  }
}

// ═══ RUN SINGLE TEST ═══
async function runTest(tc, useJudge = false) {
  const start = Date.now();
  try {
    const vehicle = [tc.year, tc.vehicle, tc.engine ? `(${tc.engine})` : ''].filter(Boolean).join(' ');
    const r = await fetch('https://eurotech-academy.ca/.netlify/functions/vag-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle, queryType: tc.cat, query: tc.query, sources: ['AudiWorld', 'VWVortex', 'Ross-Tech'] })
    });
    const elapsed = Date.now() - start;
    if (!r.ok) return { id: tc.id, status: 'ERROR', elapsed, error: `HTTP ${r.status}`, score: { passed: false, issues: [`HTTP ${r.status}`] } };

    const data = await r.json();
    const text = data.result || '';
    const score = scoreResponse(text, tc.expects);
    const judge = useJudge ? await opusJudge(tc, text) : null;

    return {
      id: tc.id,
      category: tc.cat,
      query: tc.query,
      vehicle: vehicle || 'unspecified',
      status: score.passed && (!judge || judge.verdict !== 'FAIL') ? 'PASS' : 'FAIL',
      elapsed,
      score,
      judge,
      responsePreview: text.substring(0, 400)
    };
  } catch (err) {
    return { id: tc.id, status: 'ERROR', error: err.message, score: { passed: false, issues: [err.message] } };
  }
}

// ═══ BUILD DAILY REPORT ═══
function buildReport(results, useJudge) {
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  const avgTime = Math.round(results.reduce((s, r) => s + (r.elapsed || 0), 0) / total);
  const passRate = Math.round((passed / total) * 100);

  const allIssues = results.flatMap(r => (r.score?.issues || []).map(i => ({ test: r.id, issue: i })));
  const categories = {};
  allIssues.forEach(({ issue }) => {
    const c = issue.split(':')[0];
    categories[c] = (categories[c] || 0) + 1;
  });

  const judgeErrors = results.filter(r => r.judge?.verdict === 'FAIL').length;
  const judgeSuggestions = results.filter(r => r.judge?.suggestions).flatMap(r => r.judge.suggestions);

  const criticalIssues = results.filter(r => r.judge?.severity === 'CRITICAL').length;

  return {
    date: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    mode: useJudge ? 'PRO_WITH_JUDGE' : 'FAST',
    summary: { total, passed, failed, errors, passRate, avgResponseTime: avgTime, judgeErrors, criticalIssues },
    categories,
    judgeSuggestions: [...new Set(judgeSuggestions)].slice(0, 10),
    failures: results.filter(r => r.status !== 'PASS').map(r => ({
      id: r.id,
      category: r.category,
      query: r.query,
      vehicle: r.vehicle,
      issues: r.score?.issues || [],
      judge: r.judge,
      preview: r.responsePreview
    })),
    recommendations: generateRecs(results, categories, judgeSuggestions)
  };
}

function generateRecs(results, cats, judgeSuggestions) {
  const recs = [];
  const total = results.length;
  const passRate = (results.filter(r => r.status === 'PASS').length / total) * 100;

  if (cats['HALLUCINATION']) recs.push({ severity: 'CRITICAL', area: 'Hallucinations', action: `${cats['HALLUCINATION']} hallucinations detected. Strengthen engine code truth table, add explicit "NEVER say X about Y" rules to system prompt.` });
  if (cats['MISSING'] > 5) recs.push({ severity: 'HIGH', area: 'Structure', action: `${cats['MISSING']} missing elements. Response format not enforced strongly enough.` });
  if (cats['TOO_LONG']) recs.push({ severity: 'MEDIUM', area: 'Cost', action: `${cats['TOO_LONG']} overlong responses. Cost impact. Tighten prompt or reduce max_tokens.` });
  if (cats['LOW_CONFIDENCE']) recs.push({ severity: 'MEDIUM', area: 'Confidence', action: 'Some HIGH-confidence tests got lower. Review those queries — may need specific examples in prompt.' });
  if (passRate < 75) recs.push({ severity: 'CRITICAL', area: 'Overall Quality', action: `Pass rate ${passRate.toFixed(0)}% — below 75% threshold. Consider model upgrade or major prompt revision.` });
  if (judgeSuggestions.length > 0) recs.push({ severity: 'HIGH', area: 'Opus Judge Insights', action: 'Top suggestions: ' + judgeSuggestions.slice(0, 3).join(' | ') });
  if (recs.length === 0) recs.push({ severity: 'INFO', area: 'Healthy', action: 'All systems nominal. No changes required.' });
  return recs;
}

// ═══ SEND EMAIL ═══
async function sendEmail(report) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  const html = `
  <div style="font-family:system-ui;max-width:720px;">
    <h1 style="color:#C8001A;">🧪 VAG Test Bot — ${report.date}</h1>
    <div style="background:#f5f5f5;padding:20px;margin:20px 0;">
      <h2 style="margin-top:0;">${report.summary.passRate}% Pass Rate</h2>
      <table style="width:100%;">
        <tr><td>Passed:</td><td><b>${report.summary.passed}/${report.summary.total}</b></td></tr>
        <tr><td>Failed:</td><td>${report.summary.failed}</td></tr>
        <tr><td>Errors:</td><td>${report.summary.errors}</td></tr>
        <tr><td>Avg time:</td><td>${report.summary.avgResponseTime}ms</td></tr>
        <tr><td>Critical issues:</td><td>${report.summary.criticalIssues}</td></tr>
      </table>
    </div>

    <h3>📊 Issue Categories</h3>
    <ul>${Object.entries(report.categories).map(([k, v]) => `<li>${k}: ${v}</li>`).join('')}</ul>

    <h3>🎯 Recommendations</h3>
    ${report.recommendations.map(r => `
      <div style="border-left:4px solid ${r.severity === 'CRITICAL' ? '#c8001a' : r.severity === 'HIGH' ? '#ff8800' : '#888'};padding:10px 15px;background:#fafafa;margin:10px 0;">
        <strong>[${r.severity}] ${r.area}</strong><br>${r.action}
      </div>
    `).join('')}

    ${report.judgeSuggestions.length > 0 ? `
      <h3>🎓 Opus Judge Suggestions</h3>
      <ol>${report.judgeSuggestions.map(s => `<li>${s}</li>`).join('')}</ol>
    ` : ''}

    <h3>❌ Failures (${report.failures.length})</h3>
    ${report.failures.slice(0, 10).map(f => `
      <details style="margin:10px 0;padding:10px;background:#fff5f5;border:1px solid #fcc;">
        <summary><b>${f.id}</b> — ${f.vehicle} — ${f.query.substring(0, 60)}...</summary>
        <p><b>Issues:</b></p><ul>${f.issues.map(i => `<li>${i}</li>`).join('')}</ul>
        ${f.judge ? `<p><b>Opus verdict:</b> ${f.judge.verdict} — ${f.judge.summary}</p>` : ''}
        <pre style="background:#eee;padding:10px;font-size:11px;overflow:auto;">${f.preview}</pre>
      </details>
    `).join('')}

    <p style="color:#888;font-size:12px;margin-top:40px;">Eurotech Academy Test Bot · Mode: ${report.mode}</p>
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'VAG Bot <bot@eurotech-academy.ca>',
      to: 'astroracinggear@gmail.com',
      subject: `🧪 ${report.date} — ${report.summary.passRate}% pass · ${report.summary.criticalIssues} critical`,
      html
    })
  });
  return r.ok ? { sent: true } : { sent: false, status: r.status };
}

// ═══ STORE HISTORY ═══
async function storeHistory(report) {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('vag-bot-history');
    await store.set(`report-${report.date}`, JSON.stringify(report));
    return { stored: true };
  } catch (e) {
    return { stored: false, error: e.message };
  }
}

// ═══ MAIN ═══
const handler = async () => {
  // Use Opus judge on Mondays & Thursdays only (budget-friendly)
  const day = new Date().getDay();
  const useJudge = day === 1 || day === 4;

  console.log(`[BOT] Starting ${useJudge ? 'FULL (with Opus judge)' : 'FAST'} run — ${TEST_CASES.length} tests`);
  const results = [];

  for (const tc of TEST_CASES) {
    const result = await runTest(tc, useJudge);
    results.push(result);
    console.log(`[${result.id}] ${result.status} ${result.elapsed}ms${result.judge ? ` (judge:${result.judge.verdict})` : ''}`);
    await new Promise(r => setTimeout(r, 800));
  }

  const report = buildReport(results, useJudge);
  await storeHistory(report);
  const emailStatus = await sendEmail(report);

  console.log(`[BOT] Done. Pass ${report.summary.passRate}% · Critical ${report.summary.criticalIssues}`);
  return { statusCode: 200, body: JSON.stringify({ report, emailStatus }, null, 2) };
};

// Schedule: daily 13:00 UTC = 08:00 EST / 09:00 EDT
exports.handler = schedule('0 13 * * *', handler);
