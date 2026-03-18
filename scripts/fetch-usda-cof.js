/**
 * Fetch USDA Cattle on Feed data from NASS QuickStats API
 * Outputs: data/usda-cof.json
 */
const NASS_KEY = process.env.NASS_API_KEY;
const BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const fs = require('fs');

async function fetchCOF() {
  if (!NASS_KEY) throw new Error('NASS_API_KEY not set');
  const currentYear = new Date().getFullYear();

  const dataItems = [
    { label: 'inventory', short_desc: 'CATTLE, ON FEED - INVENTORY, MEASURED IN HEAD' },
    { label: 'placements', short_desc: 'CATTLE, ON FEED - PLACEMENTS, MEASURED IN HEAD' },
    { label: 'marketings', short_desc: 'CATTLE, ON FEED - MARKETINGS, MEASURED IN HEAD' },
  ];

  const results = { inventory: [], placements: [], marketings: [] };

  for (const item of dataItems) {
    // Try exact short_desc first
    let params = new URLSearchParams({
      key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
      short_desc: item.short_desc, agg_level_desc: 'NATIONAL',
      year__GE: String(currentYear - 2), format: 'JSON',
    });

    console.log(`Fetching ${item.label}...`);
    let data = null;
    try {
      let res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) { data = await res.json(); }

      // If exact match fails, try LIKE query
      if (!data?.data?.length) {
        console.log(`  Exact match empty, trying LIKE...`);
        params = new URLSearchParams({
          key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
          short_desc__LIKE: `%ON FEED%${item.label === 'inventory' ? 'INVENTORY' : item.label.toUpperCase()}%`,
          agg_level_desc: 'NATIONAL', year__GE: String(currentYear - 2), format: 'JSON',
        });
        res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(15000) });
        if (res.ok) data = await res.json();
      }

      // If still empty, try broadest query
      if (!data?.data?.length) {
        console.log(`  LIKE empty, trying broad group query...`);
        params = new URLSearchParams({
          key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
          group_desc: 'ANIMAL TOTALS',
          statisticcat_desc: item.label === 'inventory' ? 'INVENTORY' : item.label.toUpperCase(),
          agg_level_desc: 'NATIONAL', year__GE: String(currentYear - 1), format: 'JSON',
        });
        res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(15000) });
        if (res.ok) data = await res.json();
      }

      if (data?.error) {
        console.warn(`  API error: ${JSON.stringify(data.error).slice(0, 200)}`);
        continue;
      }

      const rows = (data?.data || [])
        .filter(r => r.Value && r.Value !== '(D)' && r.Value !== '(NA)')
        .filter(r => (r.short_desc || '').toUpperCase().includes('ON FEED'))
        .map(r => ({
          year: parseInt(r.year), period: r.reference_period_desc,
          value: parseInt(r.Value.replace(/,/g, '')),
          unit: r.unit_desc, desc: r.short_desc, freq: r.freq_desc,
        }))
        .sort((a, b) => b.year - a.year || monthNum(b.period) - monthNum(a.period));

      results[item.label] = rows.slice(0, 24);
      console.log(`  ${item.label}: ${rows.length} records`);
      if (rows[0]) console.log(`  Latest: ${rows[0].period} ${rows[0].year} = ${rows[0].value.toLocaleString()}`);
    } catch (err) { console.warn(`  ${item.label} error: ${err.message}`); }
  }

  // Build snippet
  const latest = {}, prevYear = {};
  for (const k of ['inventory','placements','marketings']) {
    if (results[k][0]) latest[k] = results[k][0];
    if (latest[k]) {
      const m = results[k].find(r => r.year === latest[k].year - 1 && r.period === latest[k].period);
      if (m) prevYear[k] = m;
    }
  }

  let snippet = '═══ USDA CATTLE ON FEED (Monthly Report) ═══\n';
  for (const [k, lbl] of [['inventory','On Feed Inventory'],['placements','Placements'],['marketings','Marketings']]) {
    if (latest[k]) {
      const yoy = prevYear[k] ? ` (YoY: ${((latest[k].value/prevYear[k].value-1)*100).toFixed(1)}%)` : '';
      snippet += `${lbl}: ${(latest[k].value/1000).toFixed(0)}K head, ${latest[k].period} ${latest[k].year}${yoy}\n`;
    }
  }
  if (!latest.inventory) snippet += 'No data returned.\n';

  fs.writeFileSync('data/usda-cof.json', JSON.stringify({
    fetchedAt: new Date().toISOString(), source: 'USDA NASS QuickStats',
    reportType: 'Cattle on Feed', latest, prevYear, history: results, promptSnippet: snippet,
  }, null, 2));
  console.log('Wrote data/usda-cof.json\n' + snippet);
}

function monthNum(m) {
  if (!m) return 0;
  const s = m.toUpperCase();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for (let i = 0; i < months.length; i++) if (s.includes(months[i])) return i + 1;
  return 0;
}

fetchCOF().catch(err => { console.error('COF failed:', err.message); process.exit(1); });
