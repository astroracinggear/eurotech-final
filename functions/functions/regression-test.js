// ═══════════════════════════════════════════════════════════════
// REGRESSION TEST — runs after every Netlify deploy
// Netlify webhook calls this, it runs 5 critical smoke tests
// and emails if any fail (early warning)
// ═══════════════════════════════════════════════════════════════

// 5 smoke tests — the absolute minimum that must pass
const SMOKE_TESTS = [
  { id: 'S01', query: 'P0299 underboost', vehicle: '2021 Audi S4 B9 (DEAU)', mustContain: ['EA839'], mustNot: ['EA888'] },
  { id: 'S02', query: 'DQ381 fluid spec', vehicle: '2023 VW Golf R MK8', mustContain: ['G 052 529 A2'], mustNot: [] },
  { id: 'S03', query: 'My car makes noise', vehicle: '', mustContain: ['⚠'], mustNot: [] },
  { id: 'S04', query: 'P0016 camshaft correlation', vehicle: '2022 VW GTI MK8', mustContain: ['EA888'], mustNot: ['V6', 'biturbo'] },
  { id: 'S05', query: 'Haldex fluid procedure', vehicle: '2018 VW Golf R MK7', mustContain: ['G 052 175 A2'], mustNot: [] }
];

exports.handler = async (event) => {
  // Can be triggered by Netlify deploy webhook OR manually
  const results = [];
  for (const t of SMOKE_TESTS) {
    try {
      const r = await fetch('https://eurotech-academy.ca/.netlify/functions/vag-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle: t.vehicle, queryType: 'dtc', query: t.query, sources: ['AudiWorld'] })
      });
      const data = await r.json();
      const text = (data.result || '').toLowerCase();
      const missing = t.mustContain.filter(m => !text.includes(m.toLowerCase()));
      const hallucinated = t.mustNot.filter(m => text.includes(m.toLowerCase()));
      results.push({
        id: t.id,
        pass: missing.length === 0 && hallucinated.length === 0,
        missing,
        hallucinated
      });
    } catch (err) {
      results.push({ id: t.id, pass: false, error: err.message });
    }
  }

  const failed = results.filter(r => !r.pass);

  // Send alert email if ANY smoke test fails
  if (failed.length > 0 && process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VAG Bot Alert <bot@eurotech-academy.ca>',
        to: 'astroracinggear@gmail.com',
        subject: `🚨 REGRESSION ALERT — ${failed.length}/5 smoke tests FAILED`,
        html: `<h2 style="color:red;">🚨 Post-deploy regression detected</h2>
          <p>After the latest deploy, these smoke tests failed:</p>
          <ul>${failed.map(f => `<li><b>${f.id}</b> — missing: ${(f.missing||[]).join(',')} · hallucinated: ${(f.hallucinated||[]).join(',')} ${f.error ? '· error: ' + f.error : ''}</li>`).join('')}</ul>
          <p>Review latest GitHub commit and consider rollback.</p>`
      })
    });
  }

  return {
    statusCode: failed.length > 0 ? 500 : 200,
    body: JSON.stringify({ passed: results.length - failed.length, failed: failed.length, details: results }, null, 2)
  };
};
