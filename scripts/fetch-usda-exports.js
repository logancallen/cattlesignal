/**
 * Fetch USDA Export Sales from FAS API
 * Outputs: data/usda-exports.json
 */
const fs = require('fs');

async function fetchExports() {
  const yr = new Date().getFullYear();
  let exports = [];
  let source = '';

  // FAS ESR API endpoints to try
  // Beef/veal commodity codes: 0100, 0200 (variety meats)
  // Also try the cumulative exports endpoint
  const attempts = [
    { url: `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/0100/allCountries/marketYear/${yr}`, label: 'beef MY current' },
    { url: `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/0100/allCountries/marketYear/${yr-1}`, label: 'beef MY prev' },
    { url: `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/0100`, label: 'beef latest' },
    { url: `https://apps.fas.usda.gov/OpenData/api/esr/exports/allCommodities/allCountries/marketYear/${yr}`, label: 'all commodities' },
  ];

  for (const a of attempts) {
    console.log(`Trying ${a.label}: ${a.url}`);
    try {
      const res = await fetch(a.url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { console.log(`  ${res.status}`); continue; }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) { console.log(`  Not JSON: ${ct}`); continue; }
      const d = await res.json();
      if (Array.isArray(d) && d.length > 0) {
        // Filter for beef if we got all commodities
        const beef = a.label.includes('all') ? d.filter(r => (r.commodityCode || '') === '0100') : d;
        if (beef.length > 0) {
          exports = beef;
          source = a.label;
          console.log(`  Got ${beef.length} records`);
          break;
        }
      }
      console.log(`  Empty or wrong format`);
    } catch (err) { console.log(`  ${err.message}`); }
  }

  // Aggregate by country
  const byC = {};
  for (const r of exports) {
    const c = r.countryDescription || r.countryName || 'Unknown';
    if (!byC[c]) byC[c] = { netSales: 0, exports: 0 };
    byC[c].netSales += r.netSales || r.currentNetSales || 0;
    byC[c].exports += r.currentExports || r.weeklyExports || r.accumulatedExports || 0;
  }

  const top = Object.entries(byC).map(([c, d]) => ({ country: c, ...d }))
    .sort((a, b) => b.exports - a.exports).slice(0, 10);
  const totalExp = top.reduce((s, d) => s + d.exports, 0);
  const totalSales = top.reduce((s, d) => s + d.netSales, 0);

  let sn = '═══ USDA BEEF EXPORT SALES ═══\n';
  if (totalExp > 0) {
    sn += `Total Exports: ${(totalExp/1000).toFixed(0)}K MT | Net Sales: ${(totalSales/1000).toFixed(0)}K MT\n`;
    sn += `Top: ${top.slice(0,5).map(d=>`${d.country} (${(d.exports/1000).toFixed(0)}K)`).join(', ')}\n`;
  } else {
    sn += 'Export data unavailable from FAS API.\n';
  }

  fs.writeFileSync('data/usda-exports.json', JSON.stringify({
    fetchedAt: new Date().toISOString(), source: `USDA FAS ESR (${source || 'none'})`,
    reportType: 'Beef Export Sales', totalExports: totalExp,
    totalNetSales: totalSales, topDestinations: top,
    rawRecords: exports.length, promptSnippet: sn,
  }, null, 2));
  console.log('Wrote data/usda-exports.json\n' + sn);
}

fetchExports().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
