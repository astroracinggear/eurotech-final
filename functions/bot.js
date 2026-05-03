// VAG Tool Validation Bot — 1 test per batch (avoids 10s timeout)

const TEST_FLEET = [
  {
    id: 'V01',
    vin: 'WAUZZZF49MN066275',
    description: 'Audi A4 B9 2021',
    expected: { make: 'AUDI' },
    diagnostic: { query: 'Oil specification 0W-20', mustContain: ['VW 508', 'oil'], mustNot: [] }
  },
  {
    id: 'V02',
    vin: 'WVWAH7AJ7DW123456',
    description: 'VW Golf GTI MK6 2013',
    expected: { make: 'VOLKSWAGEN' },
    diagnostic: { query: 'DSG mechatronic shudder', mustContain: ['DQ', 'mechatronic'], mustNot: [] }
  },
  {
    id: 'V03',
    vin: 'WAUZZZ8K0CA000000',
    description: 'Audi S4 B8 (CREC EA837)',
    expected: { make: 'AUDI' },
    diagnostic: { query: 'Supercharger whine and water pump issue', mustContain: ['EA837', 'supercharged'], mustNot: ['biturbo'] }
  },
  {
    id: 'V04',
    vin: 'WUAUFCFC0DN000000',
    description: 'Audi RS3 8V (5-cyl EA855)',
    expected: { make: 'AUDI' },
    diagnostic: { query: 'P0301 misfire cylinder 1 RS3', mustContain: ['EA855'], mustNot: ['4-cyl'] }
  },
  {
    id: 'V05',
    vin: 'WAUZZZ4G8DN123456',
    description: 'Audi A6 C7 2013',
    expected: { make: 'AUDI' },
    diagnostic: { query: 'Air suspension sagging passenger rear', mustContain: ['suspension'], mustNot: [] }
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
  const params = event.queryStringParameters || {};
  const batch = parseInt(params.batch || '1');
  const idx = batch - 1;

  if (idx < 0 || idx >= TEST_FLEET.length) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: batch > TEST_FLEET.length ? 'No more tests' : 'Invalid batch',
        totalBatches: TEST_FLEET.length,
        usage: 'Use ?batch=1 to ?batch=' + TEST_FLEET.length
      })
    };
  }

  const test = TEST_FLEET[idx];
  const decoded = await decodeVIN(test.vin);
  const vinScore = scoreVIN(decoded, test.expected);
  const diagResult = await testDiagnostic(test);
  const diagScore = scoreDiagnostic(diagResult.response, test);

  const result = {
    id: test.id,
    description: test.description,
    vin: test.vin,
    query: test.diagnostic.query,
    vinPassed: vinScore.passed,
    vinIssues: vinScore.issues,
    decoded: vinScore.decoded,
    diagPassed: diagScore.passed,
    diagIssues: diagScore.issues,
    overallPass: vinScore.passed && diagScore.passed,
    preview: (diagResult.response || diagResult.error || '').substring(0, 350)
  };

  const isLast = batch >= TEST_FLEET.length;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      batch,
      totalBatches: TEST_FLEET.length,
      result,
      nextUrl: isLast ? null : `/.netlify/functions/bot?batch=${batch + 1}`
    }, null, 2)
  };
};
