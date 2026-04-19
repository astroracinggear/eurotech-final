// ═══════════════════════════════════════════════════════════════
// VAG BOT — WEEKLY STRATEGIC REVIEW
// Runs every Sunday 20:00 EST — analyzes 7 days of data + suggests
// a new improved system prompt for vag-api.js
// ═══════════════════════════════════════════════════════════════

const { schedule } = require('@netlify/functions');

const handler = async () => {
  // Load last 7 days of reports from Blobs
  let reports = [];
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('vag-bot-history');
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `report-${d.toISOString().split('T')[0]}`;
      const raw = await store.get(key);
      if (raw) reports.push(JSON.parse(raw));
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to load history: ' + e.message }) };
  }

  if (reports.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ note: 'No historical data yet — run daily bot first' }) };
  }

  // Aggregate metrics
  const totalTests = reports.reduce((s, r) => s + r.summary.total, 0);
  const totalPassed = reports.reduce((s, r) => s + r.summary.passed, 0);
  const weekPassRate = Math.round((totalPassed / totalTests) * 100);

  const allCategories = {};
  reports.forEach(r => {
    Object.entries(r.categories || {}).forEach(([k, v]) => {
      allCategories[k] = (allCategories[k] || 0) + v;
    });
  });

  const topIssues = Object.entries(allCategories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const persistentFailures = {};
  reports.forEach(r => {
    (r.failures || []).forEach(f => {
      persistentFailures[f.id] = (persistentFailures[f.id] || 0) + 1;
    });
  });
  const chronicFailures = Object.entries(persistentFailures).filter(([_, n]) => n >= 3).sort((a, b) => b[1] - a[1]);

  // Use Opus to draft a new improved prompt
  let promptSuggestion = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const analyzerSystem = `You are an expert prompt engineer optimizing a VAG diagnostic AI tool. Based on 7 days of test data, suggest concrete improvements to the system prompt.

Respond in JSON:
{
  "keyFindings": ["top 3 insights"],
  "promptAdditions": ["specific lines to ADD to system prompt"],
  "promptRemovals": ["specific lines to REMOVE"],
  "newRules": ["new NEVER/ALWAYS rules to enforce"],
  "estimatedImprovement": "% pass rate expected after changes"
}`;

      const userMsg = `7-day test data:
Total tests: ${totalTests}
Pass rate: ${weekPassRate}%
Top issue categories: ${topIssues.map(([k, v]) => `${k} (${v}x)`).join(', ')}
Chronic failures (failed 3+ days): ${chronicFailures.map(([id, n]) => `${id} (${n}x)`).join(', ')}

Sample failure details:
${reports.slice(0, 2).flatMap(r => r.failures || []).slice(0, 5).map(f => `- ${f.id}: ${f.issues.join('; ')}`).join('\n')}

Suggest improvements to the VAG diagnostic tool system prompt to fix these issues. Respond JSON only.`;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 1500, system: analyzerSystem, messages: [{ role: 'user', content: userMsg }] })
      });
      if (r.ok) {
        const d = await r.json();
        const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        try { promptSuggestion = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch {}
      }
    } catch {}
  }

  // Email
  if (process.env.RESEND_API_KEY) {
    const html = `
    <div style="font-family:system-ui;max-width:720px;">
      <h1 style="color:#C8001A;">📈 Weekly Strategic Review — ${new Date().toISOString().split('T')[0]}</h1>
      <div style="background:#f5f5f5;padding:20px;margin:20px 0;">
        <h2>${weekPassRate}% week pass rate</h2>
        <p>${totalTests} tests over ${reports.length} days</p>
      </div>
      <h3>🔍 Top Issue Patterns</h3>
      <ol>${topIssues.map(([k, v]) => `<li><b>${k}</b> — ${v} occurrences</li>`).join('')}</ol>

      ${chronicFailures.length > 0 ? `
      <h3>⚠️ Chronic Failures (failed 3+ days)</h3>
      <ul>${chronicFailures.map(([id, n]) => `<li><b>${id}</b> — failed ${n} times this week</li>`).join('')}</ul>
      ` : ''}

      ${promptSuggestion ? `
      <h3>🎓 Opus Strategic Analysis</h3>
      <h4>Key Findings</h4>
      <ul>${(promptSuggestion.keyFindings || []).map(f => `<li>${f}</li>`).join('')}</ul>

      <h4>Suggested Prompt Additions</h4>
      <pre style="background:#e8f5e8;padding:15px;overflow:auto;">${(promptSuggestion.promptAdditions || []).join('\n\n')}</pre>

      <h4>Suggested Removals</h4>
      <pre style="background:#f5e8e8;padding:15px;overflow:auto;">${(promptSuggestion.promptRemovals || []).join('\n\n')}</pre>

      <h4>New Rules to Add</h4>
      <ol>${(promptSuggestion.newRules || []).map(r => `<li>${r}</li>`).join('')}</ol>

      <p style="background:#fff8dc;padding:15px;"><b>Expected improvement:</b> ${promptSuggestion.estimatedImprovement || 'N/A'}</p>
      ` : '<p>(Opus analysis unavailable this week)</p>'}

      <p style="color:#888;font-size:12px;">Use these insights to update <code>functions/vag-api.js</code> on GitHub.</p>
    </div>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VAG Bot <bot@eurotech-academy.ca>',
        to: 'astroracinggear@gmail.com',
        subject: `📈 Weekly Review — ${weekPassRate}% week · ${chronicFailures.length} chronic issues`,
        html
      })
    });
  }

  return { statusCode: 200, body: JSON.stringify({ weekPassRate, totalTests, topIssues, chronicFailures, promptSuggestion }, null, 2) };
};

// Sunday 20:00 EST = Monday 01:00 UTC
exports.handler = schedule('0 1 * * 1', handler);
