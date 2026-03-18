/**
 * Fetch USDA Export Sales data from FAS API
 * Outputs: data/usda-exports.json
 * No API key required for FAS
 */
const fs = require('fs');

async function fetchExports() {
  const year = new Date().getFullYear();
  let exports = [];

  // Try multiple FAS API endpoints and years
  const urls = [
    `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/0100/allCountries/marketYear/${year}`,
    `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/0100/allCountries/marketYear/${year - 1}`,
    `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/0200/allCountries/marketYear/${year}`,
    `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/0200/allCountries/marketYear/${year - 1}`,
  ];

  for (const url of urls) {
    console.log(`Trying: ${url}`);
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'CattleSignal/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      console.log(`  Status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          exports = data;
          console.log(`  Got ${data.length} records`);
          break;
        } else if (data && typeof data === 'object') {
          console.log(`  Response type: ${typeof data}, keys: ${Object.keys(data).slice(0,5).join(',')}`);
        }
      } else {
        const text = await res.text();
        console.log(`  Error: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn(`  ${err.message}`);
    }
  }

  // Also try the ESR data release dates
  let lastRelease = null;
  try {
    const dRes = await fetch('https://apps.fas.usda.gov/OpenData/api/esr/dataReleaseDates', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (dRes.ok) {
      const dates = await dRes.json();
      if (Array.isArray(dates) && dates.length > 0) {
        lastRelease = dates[dates.length - 1];
        console.log(`Last ESR release: ${JSON.stringify(lastRelease)}`);
      }
    }
  } catch (err) { console.warn(`Release dates: ${err.message}`); }

  // Aggregate
  const byCountry = {};
  for (const row of exports) {
    const country = row.countryDescription || row.countryName || row.countryCode || 'Unknown';
    if (!byCountry[country]) byCountry[country] = { netSales: 0, exports: 0, outstanding: 0 };
    byCountry[country].netSales += row.netSales || 0;
    byCountry[country].exports += row.currentExports || row.exports || row.weeklyExports || 0;
    byCountry[country].outstanding += row.outstandingSales || row.accumulatedExports || 0;
  }

  const topDestinations = Object.entries(byCountry)
    .map(([country, d]) => ({ country, ...d }))
    .sort((a, b) => b.exports - a.exports)
    .slice(0, 10);

  const totalExports = topDestinations.reduce((s, d) => s + d.exports, 0);
  const totalNetSales = topDestinations.reduce((s, d) => s + d.netSales, 0);

  let snippet = '═══ USDA BEEF EXPORT SALES ═══\n';
  if (totalExports > 0) {
    snippet += `Total Beef Exports: ${(totalExports / 1000).toFixed(0)}K MT\n`;
    snippet += `Net Sales: ${(totalNetSales / 1000).toFixed(0)}K MT\n`;
    snippet += `Top: ${topDestinations.slice(0, 5).map(d => `${d.country} (${(d.exports/1000).toFixed(0)}K)`).join(', ')}\n`;
  } else {
    snippet += 'Export data unavailable from FAS API.\n';
  }

  fs.writeFileSync('data/usda-exports.json', JSON.stringify({
    fetchedAt: new Date().toISOString(), source: 'USDA FAS ESR',
    reportType: 'Beef Export Sales', marketingYear: year,
    totalExports, totalNetSales, topDestinations,
    rawRecords: exports.length, lastRelease, promptSnippet: snippet,
  }, null, 2));
  console.log('Wrote data/usda-exports.json\n' + snippet);
}

fetchExports().catch(err => { console.error('Export failed:', err.message); process.exit(1); });
