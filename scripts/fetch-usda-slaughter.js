/**
 * Fetch USDA Livestock Slaughter from NASS QuickStats API
 * Outputs: data/usda-slaughter.json
 * 
 * NASS does NOT have a single "total cattle" slaughter record.
 * It has subcategories: BULLS, CALVES, COWS, STEERS, HEIFERS.
 * We must sum HEAD counts across all classes per time period.
 */
const NASS_KEY = process.env.NASS_API_KEY;
const BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const fs = require('fs');

async function fetchSlaughter() {
  if (!NASS_KEY) throw new Error('NASS_API_KEY not set');
  const yr = new Date().getFullYear();

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
  console.log(`Total raw records: ${rows.length}`);

  // Only keep HEAD counts (not LB/HEAD weight records)
  const headRows = rows.filter(r => {
    const u = (r.unit_desc || '').toUpperCase();
    const s = (r.short_desc || '').toUpperCase();
    return (u === 'HEAD' || s.endsWith('MEASURED IN HEAD')) && !u.includes('LB');
  });
  console.log(`HEAD-only records: ${headRows.length}`);

  // Log what classes we found
  const classes = [...new Set(headRows.map(r => {
    const m = r.short_desc.match(/CATTLE, (\w+),/);
    return m ? m[1] : 'UNKNOWN';
  }))];
  console.log(`Classes found: ${classes.join(', ')}`);

  // Sum across all classes per period
  const weeklySum = {};
  const monthlySum = {};

  for (const r of headRows) {
    const val = parseInt(r.Value.replace(/,/g, ''));
    const freq = r.freq_desc;
    const key = `${r.year}-${r.reference_period_desc}`;

    if (freq === 'WEEKLY') {
      if (!weeklySum[key]) weeklySum[key] = { year: parseInt(r.year), period: r.reference_period_desc, value: 0, classes: [] };
      weeklySum[key].value += val;
      weeklySum[key].classes.push(r.short_desc.match(/CATTLE, (\w+),/)?.[1] || '?');
    } else {
      if (!monthlySum[key]) monthlySum[key] = { year: parseInt(r.year), period: r.reference_period_desc, value: 0, classes: [] };
      monthlySum[key].value += val;
      monthlySum[key].classes.push(r.short_desc.match(/CATTLE, (\w+),/)?.[1] || '?');
    }
  }

  const weekly = Object.values(weeklySum)
    .sort((a, b) => b.year - a.year || wkN(b.period) - wkN(a.period))
    .slice(0, 52);
  const monthly = Object.values(monthlySum)
    .sort((a, b) => b.year - a.year || mN(b.period) - mN(a.period))
    .slice(0, 24);

  console.log(`Weekly summed periods: ${weekly.length}`);
  if (weekly[0]) console.log(`  Latest: ${weekly[0].period} ${weekly[0].year} = ${weekly[0].value.toLocaleString()} (${weekly[0].classes.length} classes: ${[...new Set(weekly[0].classes)].join('+')})`);
  console.log(`Monthly summed periods: ${monthly.length}`);
  if (monthly[0]) console.log(`  Latest: ${monthly[0].period} ${monthly[0].year} = ${monthly[0].value.toLocaleString()} (${monthly[0].classes.length} classes: ${[...new Set(monthly[0].classes)].join('+')})`);

  let sn = '═══ USDA LIVESTOCK SLAUGHTER ═══\n';
  if (weekly[0]) {
    const wow = weekly[1] ? ` (WoW: ${((weekly[0].value/weekly[1].value-1)*100).toFixed(1)}%)` : '';
    sn += `Weekly FI Slaughter (total): ${(weekly[0].value/1000).toFixed(0)}K head, ${weekly[0].period} ${weekly[0].year}${wow}\n`;
  }
  if (monthly[0]) {
    const prevMo = monthly.find(r => r.year === monthly[0].year - 1 && r.period === monthly[0].period);
    const yoy = prevMo ? ` (YoY: ${((monthly[0].value/prevMo.value-1)*100).toFixed(1)}%)` : '';
    sn += `Monthly Slaughter (total): ${(monthly[0].value/1000).toFixed(0)}K head, ${monthly[0].period} ${monthly[0].year}${yoy}\n`;
  }
  if (!weekly[0] && !monthly[0]) sn += 'No slaughter data found.\n';

  fs.writeFileSync('data/usda-slaughter.json', JSON.stringify({
    fetchedAt: new Date().toISOString(), source: 'USDA NASS (summed across classes)',
    reportType: 'Livestock Slaughter',
    latestWeek: weekly[0] || null, prevWeek: weekly[1] || null,
    latestMonth: monthly[0] || null, weekly, monthly,
    rawCount: rows.length, headCount: headRows.length,
    classesFound: classes, promptSnippet: sn,
  }, null, 2));
  console.log('\nWrote data/usda-slaughter.json\n' + sn);
}

function mN(m) {
  if (!m) return 0;
  const s = m.toUpperCase();
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for (let i = 0; i < mo.length; i++) if (s.includes(mo[i])) return i + 1;
  return 0;
}
function wkN(m) { return parseInt((m||'').replace(/\D/g, '')) || 0; }

fetchSlaughter().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
