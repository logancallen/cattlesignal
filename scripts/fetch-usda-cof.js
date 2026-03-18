/**
 * Fetch USDA Cattle on Feed data from NASS QuickStats API
 * Runs monthly (after 3rd Friday release)
 * Outputs: data/usda-cof.json
 */

const NASS_KEY = process.env.NASS_API_KEY;
const BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const fs = require('fs');

async function fetchCOF() {
  if (!NASS_KEY) throw new Error('NASS_API_KEY not set');

  const currentYear = new Date().getFullYear();
  const queries = [
    // Total cattle on feed (1000+ capacity feedlots)
    {
      key: NASS_KEY,
      commodity_desc: 'CATTLE',
      statisticcat_desc: 'INVENTORY',
      short_desc__LIKE: '%ON FEED%',
      domain_desc: 'TOTAL',
      agg_level_desc: 'NATIONAL',
      freq_desc: 'MONTHLY',
      year__GE: currentYear - 2,
      format: 'JSON',
    },
    // Placements
    {
      key: NASS_KEY,
      commodity_desc: 'CATTLE',
      statisticcat_desc: 'PLACEMENTS',
      domain_desc: 'TOTAL',
      agg_level_desc: 'NATIONAL',
      freq_desc: 'MONTHLY',
      year__GE: currentYear - 2,
      format: 'JSON',
    },
    // Marketings
    {
      key: NASS_KEY,
      commodity_desc: 'CATTLE',
      statisticcat_desc: 'MARKETINGS',
      domain_desc: 'TOTAL',
      agg_level_desc: 'NATIONAL',
      freq_desc: 'MONTHLY',
      year__GE: currentYear - 2,
      format: 'JSON',
    },
  ];

  const results = { inventory: [], placements: [], marketings: [] };
  const labels = ['inventory', 'placements', 'marketings'];

  for (let i = 0; i < queries.length; i++) {
    const params = new URLSearchParams(queries[i]);
    const url = `${BASE}?${params}`;
    console.log(`Fetching ${labels[i]}...`);

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`  ${labels[i]} failed: ${res.status} - ${text.slice(0, 200)}`);
      continue;
    }

    const data = await res.json();
    if (data.error) {
      console.warn(`  ${labels[i]} API error: ${JSON.stringify(data.error).slice(0, 200)}`);
      continue;
    }

    const rows = (data.data || [])
      .filter(r => r.Value && r.Value !== '(D)' && r.Value !== '(NA)')
      .map(r => ({
        year: parseInt(r.year),
        month: r.reference_period_desc,
        value: parseInt(r.Value.replace(/,/g, '')),
        unit: r.unit_desc,
        desc: r.short_desc,
      }))
      .sort((a, b) => b.year - a.year || monthOrder(b.month) - monthOrder(a.month));

    results[labels[i]] = rows.slice(0, 24); // Last 2 years
    console.log(`  ${labels[i]}: ${rows.length} records`);
  }

  // Build prompt snippet
  const latest = {};
  for (const key of labels) {
    if (results[key].length > 0) {
      latest[key] = results[key][0];
    }
  }

  const prevYear = {};
  for (const key of labels) {
    const l = latest[key];
    if (l) {
      const match = results[key].find(r => r.year === l.year - 1 && r.month === l.month);
      if (match) prevYear[key] = match;
    }
  }

  let snippet = '═══ USDA CATTLE ON FEED (Monthly Report) ═══\n';
  if (latest.inventory) {
    const yoy = prevYear.inventory
      ? ` (YoY: ${((latest.inventory.value / prevYear.inventory.value - 1) * 100).toFixed(1)}%)`
      : '';
    snippet += `On Feed Inventory: ${(latest.inventory.value / 1000).toFixed(0)}K head as of ${latest.inventory.month} ${latest.inventory.year}${yoy}\n`;
  }
  if (latest.placements) {
    const yoy = prevYear.placements
      ? ` (YoY: ${((latest.placements.value / prevYear.placements.value - 1) * 100).toFixed(1)}%)`
      : '';
    snippet += `Placements: ${(latest.placements.value / 1000).toFixed(0)}K head ${latest.placements.month} ${latest.placements.year}${yoy}\n`;
  }
  if (latest.marketings) {
    const yoy = prevYear.marketings
      ? ` (YoY: ${((latest.marketings.value / prevYear.marketings.value - 1) * 100).toFixed(1)}%)`
      : '';
    snippet += `Marketings: ${(latest.marketings.value / 1000).toFixed(0)}K head ${latest.marketings.month} ${latest.marketings.year}${yoy}\n`;
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'USDA NASS QuickStats',
    reportType: 'Cattle on Feed',
    latest,
    prevYear,
    history: results,
    promptSnippet: snippet,
  };

  fs.writeFileSync('data/usda-cof.json', JSON.stringify(output, null, 2));
  console.log('Wrote data/usda-cof.json');
  console.log(snippet);
}

function monthOrder(m) {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return months.indexOf(m?.toUpperCase?.()?.slice(0, 3)) || 0;
}

fetchCOF().catch(err => {
  console.error('COF fetch failed:', err.message);
  process.exit(1);
});
