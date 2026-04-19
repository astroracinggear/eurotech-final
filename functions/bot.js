// VAG Bot — simple and working
// Visit: eurotech-academy.ca/.netlify/functions/bot

exports.handler = async () => {
  const tests = [
    { q: 'P0299 underboost', v: '2021 Audi S4 B9 (DEAU)', ok: 'EA839', bad: 'EA888' },
    { q: 'DQ381 fluid', v: '2023 VW Golf R', ok: 'G 052 529', bad: '' },
    { q: 'Haldex fluid', v: '2017 Golf R MK7', ok: 'G 052 175', bad: '' },
    { q: 'Supercharger whine', v: '2013 Audi S4 B8 (CREC)', ok: 'EA837', bad: 'biturbo' },
    { q: 'Car makes noise', v: '', ok: '⚠', bad: '' }
  ];

  const results = [];
  for (const t of tests) {
    try {
      const r = await fetch('https://eurotech-academy.ca/.netlify/functions/vag-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle: t.v, queryType: 'dtc', query: t.q, sources: ['AudiWorld'] })
      });
      const d = await r.json();
      const txt = (d.result || '').toLowerCase();
      const pass = txt.includes(t.ok.toLowerCase()) && (!t.bad || !txt.includes(t.bad.toLowerCase()));
      results.push({ query: t.q, pass, preview: (d.result || '').substring(0, 150) });
    } catch (e) {
      results.push({ query: t.q, pass: false, error: e.message });
    }
  }

  const passed = results.filter(r => r.pass).length;
  const passRate = Math.round((passed / results.length) * 100);

  // Try to send email if Resend is configured
  let emailSent = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const html = `<h2>VAG Bot Report — ${today}</h2>
        <h3>Pass rate: ${passRate}% (${passed}/${results.length})</h3>
        <ul>${results.map(r => `<li>${r.pass ? '✅' : '❌'} <b>${r.query}</b></li>`).join('')}</ul>
        ${results.filter(r => !r.pass).map(r => `<details><summary>${r.query}</summary><pre>${r.preview || r.error}</pre></details>`).join('')}`;

      const er = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'VAG Bot <bot@send.eurotech-academy.ca>',
          to: 'astroracinggear@gmail.com',
          subject: `VAG Bot — ${passRate}% pass`,
          html
        })
      });
      emailSent = er.ok;
    } catch {}
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passRate: passRate + '%', passed, total: results.length, emailSent, results }, null, 2)
  };
};
