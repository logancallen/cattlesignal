/**
 * Fetch USDA Cattle on Feed from NASS QuickStats API
 * Outputs: data/usda-cof.json
 */
const NASS_KEY = process.env.NASS_API_KEY;
const BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const fs = require('fs');

async function fetchCOF() {
  if (!NASS_KEY) throw new Error('NASS_API_KEY not set');
  const yr = new Date().getFullYear();

  // Fetch all cattle on-feed related data in one broad query, then filter client-side
  const params = new URLSearchParams({
    key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
    short_desc__LIKE: '%ON FEED%', agg_level_desc: 'NATIONAL',
    year__GE: String(yr - 2), format: 'JSON',
  });

  console.log('Fetching all on-feed records...');
  const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`NASS ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));

  const rows = (data.data || []).filter(r => r.Value && r.Value !== '(D)' && r.Value !== '(NA)');
  console.log(`  Total records: ${rows.length}`);

  // Log unique short_desc values to debug
  const descs = [...new Set(rows.map(r => r.short_desc))];
  console.log('  Unique short_desc values:');
  descs.forEach(d => console.log(`    ${d}`));

  // Filter by category - match on short_desc content
  const classify = (r) => {
    const s = (r.short_desc || '').toUpperCase();
    // Marketings must come before inventory check since both contain "ON FEED"
    if (s.includes('MARKETING')) return 'marketings';
    if (s.includes('PLACEMENT')) return 'placements';
    if (s.includes('INVENTORY')) return 'inventory';
    return null;
  };

  const results = { inventory: [], placements: [], marketings: [] };
  for (const r of rows) {
    const cat = classify(r);
    if (!cat) continue;
    // Only HEAD counts, not weight
    if (r.unit_desc && !r.unit_desc.includes('HEAD')) continue;
    results[cat].push({
      year: parseInt(r.year), period: r.reference_period_desc,
      value: parseInt(r.Value.replace(/,/g, '')),
      unit: r.unit_desc, desc: r.short_desc,
    });
  }

  // Sort each category
  for (const k of Object.keys(results)) {
    results[k].sort((a, b) => b.year - a.year || mN(b.period) - mN(a.period));
    results[k] = results[k].slice(0, 24);
    console.log(`  ${k}: ${results[k].length} records`);
    if (results[k][0]) console.log(`    Latest: ${results[k][0].period} ${results[k][0].year} = ${results[k][0].value.toLocaleString()}`);
  }

  // Build snippet
  const latest = {}, prev = {};
  for (const k of ['inventory','placements','marketings']) {
    if (results[k][0]) latest[k] = results[k][0];
    if (latest[k]) {
      const m = results[k].find(r => r.year === latest[k].year - 1 && r.period === latest[k].period);
      if (m) prev[k] = m;
    }
  }

  let sn = '═══ USDA CATTLE ON FEED (Monthly Report) ═══\n';
  for (const [k, lbl] of [['inventory','On Feed Inventory'],['placements','Placements'],['marketings','Marketings']]) {
    if (latest[k]) {
      const yoy = prev[k] ? ` (YoY: ${((latest[k].value/prev[k].value-1)*100).toFixed(1)}%)` : '';
      sn += `${lbl}: ${(latest[k].value/1000).toFixed(0)}K head, ${latest[k].period} ${latest[k].year}${yoy}\n`;
    }
  }
  if (!latest.inventory) sn += 'No data returned.\n';

  fs.writeFileSync('data/usda-cof.json', JSON.stringify({
    fetchedAt: new Date().toISOString(), source: 'USDA NASS',
    reportType: 'Cattle on Feed', latest, prevYear: prev, history: results, promptSnippet: sn,
  }, null, 2));
  console.log('Wrote data/usda-cof.json\n' + sn);
}

function mN(m) {
  if (!m) return 0;
  const s = m.toUpperCase();
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for (let i = 0; i < mo.length; i++) if (s.includes(mo[i])) return i + 1;
  return 0;
}

fetchCOF().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
