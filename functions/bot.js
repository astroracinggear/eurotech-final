// VAG Tool Validation Bot — runs 2 tests per call to fit Netlify 10s limit
// Call multiple times to cover all tests, or use ?test=1 to run specific test

const TEST_FLEET = [
  {
    id: 'V01',
    vin: 'WAUB4AF45MA000000',
    expected: { make: 'AUDI', model: 'S4', year: '2021' },
    diagnostic: { query: 'P0299 underboost above 3000 rpm', mustContain: ['EA839'], mustNot: ['EA888', '4-cyl'] }
  },
  {
    id: 'V02',
    vin: 'WVWZZZ5GZJW000000',
    expected: { make: 'VOLKSWAGEN' },
    diagnostic: { query: 'P0016 cam correlation', mustContain: ['EA888'], mustNot: ['V6', 'biturbo'] }
  },
  {
    id: 'V03',
    vin: 'WAUZZZ8K0CA000000',
    expected: { make: 'AUDI', model: 'S4' },
    diagnostic: { query: 'Supercharger whine at idle', mustContain: ['EA837', 'supercharged'], mustNot: ['biturbo'] }
  },
  {
    id: 'V04',
    vin: 'WUAUFCFC0DN000000',
    expected: { make: 'AUDI' },
    diagnostic: { query: 'P0301 misfire cylinder 1', mustContain: ['EA855', '5-cyl'], mustNot: ['4-cyl'] }
  },
  {
    id: 'V05',
    vin: 'WA1VAAF73JD000000',
    expected: { make: 'AUDI' },
    diagnostic: { query: 'DSG service interval', mustContain: ['DQ'], mustNot: [] }
  }
];

async function decodeVIN(vin) {
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
    if (!r.ok) return null;
    const data = await r.json();
    const get = key => {
      const item = (data.Results || []).find(x => x.Variable === key);
      return item && item.Value && item.Value !== 'Not Applicable' ? item.Value : null;
    };
    return {
      make: get('Make'),
      model: get('Model'),
      year: get('Model Year'),
      cyl: get('Engine Number of Cylinders'),
      displacement: get('Displacement (L)')
    };
  } catch { return null; }
}

async function testDiagnostic(test) {
  try {
    const r = await fetch('https://eurotech-academy.ca/.netlify/functions/vag-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vin: test.vin,
        queryType: 'dtc',
        query: test.diagnostic.query,
        sources: ['AudiWorld']
      })
    });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const data = await r.json();
    return { response: data.result || '' };
  } catch (e) { return { error: e.message }; }
}

function scoreVIN(decoded, expected) {
  if (!decoded) return { passed: false, issues: ['NHTSA returned null'] };
  const issues = [];
  if (expected.make && decoded.make !== expected.make) issues.push(`Make: got "${decoded.make}", expected "${expected.make}"`);
  return { passed: issues.length === 0, issues, decoded };
}

function scoreDiagnostic(response, test) {
  if (!response) return { passed: false, issues: ['No response'] };
  const text = response.toLowerCase();
  const issues = [];
  test.diagnostic.mustContain.forEach(t => { if (!text.includes(t.toLowerCase())) issues.push(`MISSING: "${t}"`); });
  test.diagnostic.mustNot.forEach(t => { if (text.includes(t.toLowerCase())) issues.push(`HALLUCINATION: "${t}"`); });
  return { passed: issues.length === 0, issues };
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  // Parse query string for batch number
  const params = event.queryStringParameters || {};
  const batch = parseInt(params.batch || '1');
  const batchSize = 2;
  const startIdx = (batch - 1) * batchSize;
  const endIdx = Math.min(startIdx + batchSize, TEST_FLEET.length);
  const testsToRun = TEST_FLEET.slice(startIdx, endIdx);

  if (testsToRun.length === 0) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'No more tests',
        totalBatches: Math.ceil(TEST_FLEET.length / batchSize),
        usage: 'Add ?batch=1, 2, 3 to URL'
      })
    };
  }

  const results = [];
  for (const test of testsToRun) {
    const decoded = await decodeVIN(test.vin);
    const vinScore = scoreVIN(decoded, test.expected);
    const diagResult = await testDiagnostic(test);
    const diagScore = scoreDiagnostic(diagResult.response, test);
    results.push({
      id: test.id,
      vin: test.vin,
      vinPassed: vinScore.passed,
      vinIssues: vinScore.issues,
      decoded: vinScore.decoded,
      diagPassed: diagScore.passed,
      diagIssues: diagScore.issues,
      preview: (diagResult.response || diagResult.error || '').substring(0, 200)
    });
  }

  // Send email if we ran the LAST batch
  const isLastBatch = endIdx >= TEST_FLEET.length;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      batch,
      totalBatches: Math.ceil(TEST_FLEET.length / batchSize),
      tested: testsToRun.length,
      passed: results.filter(r => r.vinPassed && r.diagPassed).length,
      results,
      nextUrl: isLastBatch ? null : `/.netlify/functions/bot?batch=${batch + 1}`
    }, null, 2)
  };
};
