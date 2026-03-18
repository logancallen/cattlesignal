/**
 * Fetch USDA Livestock Slaughter from NASS QuickStats API
 * Outputs: data/usda-slaughter.json
 */
const NASS_KEY = process.env.NASS_API_KEY;
const BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const fs = require('fs');

async function fetchSlaughter() {
  if (!NASS_KEY) throw new Error('NASS_API_KEY not set');
  const yr = new Date().getFullYear();

  // Broad query - get all cattle slaughter data, filter client-side
  const params = new URLSearchParams({
    key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
    statisticcat_desc: 'SLAUGHTER', agg_level_desc: 'NATIONAL',
    year__GE: String(yr - 1), format: 'JSON',
  });

  console.log('Fetching all cattle slaughter records...');
  const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`NASS ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));

  const rows = (data.data || []).filter(r => r.Value && r.Value !== '(D)' && r.Value !== '(NA)');
  console.log(`  Total records: ${rows.length}`);

  // Log unique short_desc to find the right total
  const descs = [...new Set(rows.map(r => r.short_desc))];
  console.log('  Unique short_desc values:');
  descs.forEach(d => {
    const sample = rows.find(r => r.short_desc === d);
    console.log(`    ${d} | ${sample?.freq_desc} | ${sample?.Value}`);
  });

  // We want TOTAL cattle slaughter in HEAD - not subcategories like BULLS, CALVES, STEERS
  // The total record typically does NOT have a class breakdown in the short_desc
  // Look for records that are just "CATTLE, SLAUGHTER..." without BULLS/CALVES/STEERS/HEIFERS/COWS
  const subclasses = ['BULLS', 'CALVES', 'COWS', 'STEERS', 'HEIFERS', 'DAIRY'];

  const totalRows = rows.filter(r => {
    const s = (r.short_desc || '').toUpperCase();
    // Must be measured in HEAD
    if (!s.includes('HEAD') && !(r.unit_desc || '').includes('HEAD')) return false;
    // Must not be a subclass
    for (const sub of subclasses) {
      if (s.includes(sub)) return false;
    }
    return true;
  });

  console.log(`  Total cattle (no subclass) HEAD records: ${totalRows.length}`);
  if (totalRows[0]) console.log(`  Sample: ${totalRows[0].short_desc} | ${totalRows[0].Value}`);

  // If no total records found, use ALL records but sum by period to get totals
  let weekly = [], monthly = [];

  if (totalRows.length > 0) {
    const parsed = totalRows.map(r => ({
      year: parseInt(r.year), period: r.reference_period_desc, freq: r.freq_desc,
      value: parseInt(r.Value.replace(/,/g, '')), desc: r.short_desc, weekEnding: r.week_ending,
    }));
    weekly = parsed.filter(r => r.freq === 'WEEKLY').sort((a, b) => b.year - a.year || wkN(b.period) - wkN(a.period)).slice(0, 52);
    monthly = parsed.filter(r => r.freq !== 'WEEKLY').sort((a, b) => b.year - a.year || mN(b.period) - mN(a.period)).slice(0, 24);
  } else {
    // Fallback: use the broadest individual class (usually steers are biggest)
    console.log('  No total records, falling back to all HEAD records...');
    const headRows = rows.filter(r => {
      const s = (r.short_desc || '' + ' ' + r.unit_desc || '').toUpperCase();
      return s.includes('HEAD');
    });

    // Group by period and sum
    const byPeriod = {};
    for (const r of headRows) {
      const key = `${r.year}-${r.reference_period_desc}-${r.freq_desc}`;
      if (!byPeriod[key]) byPeriod[key] = { year: parseInt(r.year), period: r.reference_period_desc, freq: r.freq_desc, value: 0 };
      byPeriod[key].value += parseInt(r.Value.replace(/,/g, ''));
    }
    const summed = Object.values(byPeriod);
    weekly = summed.filter(r => r.freq === 'WEEKLY').sort((a, b) => b.year - a.year || wkN(b.period) - wkN(a.period)).slice(0, 52);
    monthly = summed.filter(r => r.freq !== 'WEEKLY').sort((a, b) => b.year - a.year || mN(b.period) - mN(a.period)).slice(0, 24);
    console.log(`  Summed: ${weekly.length} weekly, ${monthly.length} monthly`);
  }

  console.log(`  Weekly: ${weekly.length} records`);
  if (weekly[0]) console.log(`  Latest weekly: ${weekly[0].period} ${weekly[0].year} = ${weekly[0].value.toLocaleString()}`);
  console.log(`  Monthly: ${monthly.length} records`);
  if (monthly[0]) console.log(`  Latest monthly: ${monthly[0].period} ${monthly[0].year} = ${monthly[0].value.toLocaleString()}`);

  let sn = '═══ USDA LIVESTOCK SLAUGHTER ═══\n';
  if (weekly[0]) {
    const wow = weekly[1] ? ` (WoW: ${((weekly[0].value/weekly[1].value-1)*100).toFixed(1)}%)` : '';
    sn += `Weekly FI Slaughter: ${(weekly[0].value/1000).toFixed(0)}K head, ${weekly[0].period} ${weekly[0].year}${wow}\n`;
  }
  if (monthly[0]) {
    sn += `Monthly Slaughter: ${(monthly[0].value/1000).toFixed(0)}K head, ${monthly[0].period} ${monthly[0].year}\n`;
  }
  if (!weekly[0] && !monthly[0]) sn += 'No total slaughter data found.\n';

  fs.writeFileSync('data/usda-slaughter.json', JSON.stringify({
    fetchedAt: new Date().toISOString(), source: 'USDA NASS',
    reportType: 'Livestock Slaughter',
    latestWeek: weekly[0] || null, prevWeek: weekly[1] || null,
    latestMonth: monthly[0] || null, weekly, monthly,
    rawCount: rows.length, promptSnippet: sn,
  }, null, 2));
  console.log('Wrote data/usda-slaughter.json\n' + sn);
}

function mN(m) {
  if (!m) return 0;
  const s = m.toUpperCase();
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for (let i = 0; i < mo.length; i++) if (s.includes(mo[i])) return i + 1;
  return 0;
}
function wkN(m) {
  if (!m) return 0;
  const n = parseInt(m.replace(/\D/g, ''));
  return n || 0;
}

fetchSlaughter().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
