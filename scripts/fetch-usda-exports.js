/**
 * Fetch USDA Export Sales data from FAS API
 * Runs weekly (data released Thursdays)
 * Outputs: data/usda-exports.json
 * 
 * FAS Export Sales Reporting (ESR) API - no API key required
 * Beef commodity codes: 0100 (beef fresh/chilled/frozen)
 */

const fs = require('fs');
const FAS_BASE = 'https://apps.fas.usda.gov/OpenData/api/esr';

async function fetchExports() {
  // Get current marketing year
  const now = new Date();
  const year = now.getFullYear();

  // Beef exports - commodity code 0100
  console.log('Fetching beef export sales...');

  let exports = [];
  try {
    // Try the ESR exports endpoint
    const res = await fetch(
      `${FAS_BASE}/exports/commodityCode/0100/allCountries/marketYear/${year}`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (res.ok) {
      exports = await res.json();
      console.log(`  ${exports.length} export records for MY ${year}`);
    } else {
      console.warn(`  FAS API returned ${res.status}, trying previous year...`);
      // Try previous marketing year
      const res2 = await fetch(
        `${FAS_BASE}/exports/commodityCode/0100/allCountries/marketYear/${year - 1}`,
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000),
        }
      );
      if (res2.ok) {
        exports = await res2.json();
        console.log(`  ${exports.length} export records for MY ${year - 1}`);
      } else {
        console.warn(`  FAS API ${res2.status} for both years`);
      }
    }
  } catch (err) {
    console.warn(`  FAS API error: ${err.message}`);
    // Fallback: try the dataReleaseDates endpoint to at least get report dates
    try {
      const datesRes = await fetch(`${FAS_BASE}/dataReleaseDates`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (datesRes.ok) {
        const dates = await datesRes.json();
        console.log(`  Got ${dates.length} release dates as fallback`);
      }
    } catch (e2) {
      console.warn(`  Fallback also failed: ${e2.message}`);
    }
  }

  // Aggregate by country for top destinations
  const byCountry = {};
  for (const row of exports) {
    const country = row.countryDescription || row.countryCode || 'Unknown';
    if (!byCountry[country]) {
      byCountry[country] = { netSales: 0, exports: 0, outstanding: 0 };
    }
    byCountry[country].netSales += row.netSales || 0;
    byCountry[country].exports += row.currentExports || row.exports || 0;
    byCountry[country].outstanding += row.outstandingSales || 0;
  }

  // Sort by export volume
  const topDestinations = Object.entries(byCountry)
    .map(([country, data]) => ({ country, ...data }))
    .sort((a, b) => b.exports - a.exports)
    .slice(0, 10);

  // Calculate totals
  const totalExports = topDestinations.reduce((s, d) => s + d.exports, 0);
  const totalNetSales = topDestinations.reduce((s, d) => s + d.netSales, 0);
  const totalOutstanding = topDestinations.reduce((s, d) => s + d.outstanding, 0);

  // Build prompt snippet
  let snippet = '═══ USDA BEEF EXPORT SALES ═══\n';
  if (totalExports > 0) {
    snippet += `Total Beef Exports (MY ${year}): ${(totalExports / 1000).toFixed(0)}K MT\n`;
    snippet += `Net Sales: ${(totalNetSales / 1000).toFixed(0)}K MT | Outstanding: ${(totalOutstanding / 1000).toFixed(0)}K MT\n`;
    snippet += `Top destinations: ${topDestinations.slice(0, 5).map(d => `${d.country} (${(d.exports / 1000).toFixed(0)}K)`).join(', ')}\n`;
  } else {
    snippet += 'Export data unavailable or not yet released for current marketing year.\n';
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'USDA FAS Export Sales Reporting',
    reportType: 'Beef Export Sales',
    marketingYear: year,
    totalExports,
    totalNetSales,
    totalOutstanding,
    topDestinations,
    rawRecords: exports.length,
    promptSnippet: snippet,
  };

  fs.writeFileSync('data/usda-exports.json', JSON.stringify(output, null, 2));
  console.log('Wrote data/usda-exports.json');
  console.log(snippet);
}

fetchExports().catch(err => {
  console.error('Export fetch failed:', err.message);
  process.exit(1);
});
