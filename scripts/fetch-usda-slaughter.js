/**
 * Fetch USDA Livestock Slaughter from NASS QuickStats API
 * Sums HEAD counts across all cattle classes (BULLS, CALVES, COWS, STEERS, HEIFERS)
 * Outputs: data/usda-slaughter.json
 */
const NASS_KEY = process.env.NASS_API_KEY;
const BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const fs = require('fs');

async function fetchSlaughter() {
  if (!NASS_KEY) {
    console.warn('NASS_API_KEY not set, writing empty file');
    writeEmpty('No API key');
    return;
  }

  const yr = new Date().getFullYear();
  let rows = [];

  try {
    const params = new URLSearchParams({
      key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
      statisticcat_desc: 'SLAUGHTER', agg_level_desc: 'NATIONAL',
      year__GE: String(yr - 1), format: 'JSON',
    });

    console.log('Fetching cattle slaughter...');
    const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(20000) });
    
    if (!res.ok) {
      console.warn(`NASS returned ${res.status}`);
      const text = await res.text().catch(() => '');
      console.warn(text.slice(0, 200));
      writeEmpty(`NASS HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    
    if (data.error) {
      console.warn('NASS error:', JSON.stringify(data.error).slice(0, 200));
      writeEmpty(`NASS error: ${JSON.stringify(data.error).slice(0, 100)}`);
      return;
    }

    rows = (data.data || []).filter(r => r.Value && r.Value !== '(D)' && r.Value !== '(NA)');
    console.log(`Total raw records: ${rows.length}`);
  } catch (err) {
    console.warn('Fetch error:', err.message);
    writeEmpty(err.message);
    return;
  }

  // Filter to HEAD counts only
  const headRows = rows.filter(r => {
    const s = ((r.short_desc || '') + ' ' + (r.unit_desc || '')).toUpperCase();
    return s.includes('HEAD') && !s.includes('LB');
  });
  console.log(`HEAD records: ${headRows.length}`);

  if (headRows.length === 0) {
    console.warn('No HEAD records found');
    writeEmpty('No HEAD records in NASS response');
    return;
  }

  // Log classes found
  const classes = [...new Set(headRows.map(r => {
    const m = (r.short_desc || '').match(/CATTLE, (\w+),/);
    return m ? m[1] : 'OTHER';
  }))];
  console.log(`Classes: ${classes.join(', ')}`);

  // Sum by period
  const weeklyMap = {}, monthlyMap = {};
  for (const r of headRows) {
    try {
      const val = parseInt((r.Value || '0').replace(/,/g, ''));
      if (isNaN(val) || val <= 0) continue;
      const key = `${r.year}-${r.reference_period_desc}`;
      const freq = (r.freq_desc || '').toUpperCase();
      const cls = (r.short_desc || '').match(/CATTLE, (\w+),/)?.[1] || '?';

      if (freq === 'WEEKLY') {
        if (!weeklyMap[key]) weeklyMap[key] = { year: parseInt(r.year), period: r.reference_period_desc, value: 0, cls: new Set() };
        weeklyMap[key].value += val;
        weeklyMap[key].cls.add(cls);
      } else {
        if (!monthlyMap[key]) monthlyMap[key] = { year: parseInt(r.year), period: r.reference_period_desc, value: 0, cls: new Set() };
        monthlyMap[key].value += val;
        monthlyMap[key].cls.add(cls);
      }
    } catch (e) { /* skip bad row */ }
  }

  // Convert Sets to arrays for JSON
  const weekly = Object.values(weeklyMap).map(r => ({ ...r, cls: [...r.cls] }))
    .sort((a, b) => b.year - a.year || wkN(b.period) - wkN(a.period)).slice(0, 52);
  const monthly = Object.values(monthlyMap).map(r => ({ ...r, cls: [...r.cls] }))
    .sort((a, b) => b.year - a.year || mN(b.period) - mN(a.period)).slice(0, 24);

  console.log(`Weekly periods: ${weekly.length}`);
  if (weekly[0]) console.log(`  Latest: ${weekly[0].period} ${weekly[0].year} = ${weekly[0].value.toLocaleString()} (${weekly[0].cls.join('+')})`);
  console.log(`Monthly periods: ${monthly.length}`);
  if (monthly[0]) console.log(`  Latest: ${monthly[0].period} ${monthly[0].year} = ${monthly[0].value.toLocaleString()} (${monthly[0].cls.join('+')})`);

  let sn = '═══ USDA LIVESTOCK SLAUGHTER ═══\n';
  if (weekly[0]) {
    const wow = weekly[1] ? ` (WoW: ${((weekly[0].value / weekly[1].value - 1) * 100).toFixed(1)}%)` : '';
    sn += `Weekly FI Slaughter (total): ${(weekly[0].value / 1000).toFixed(0)}K head, ${weekly[0].period} ${weekly[0].year}${wow}\n`;
  }
  if (monthly[0]) {
    const prev = monthly.find(r => r.year === monthly[0].year - 1 && r.period === monthly[0].period);
    const yoy = prev ? ` (YoY: ${((monthly[0].value / prev.value - 1) * 100).toFixed(1)}%)` : '';
    sn += `Monthly Slaughter (total): ${(monthly[0].value / 1000).toFixed(0)}K head, ${monthly[0].period} ${monthly[0].year}${yoy}\n`;
  }
  if (!weekly[0] && !monthly[0]) sn += 'Could not compute total slaughter.\n';

  const output = {
    fetchedAt: new Date().toISOString(), source: 'USDA NASS (summed across classes)',
    reportType: 'Livestock Slaughter',
    latestWeek: weekly[0] || null, prevWeek: weekly[1] || null,
    latestMonth: monthly[0] || null, weekly, monthly,
    rawCount: rows.length, headCount: headRows.length,
    classesFound: classes, promptSnippet: sn,
  };

  fs.writeFileSync('data/usda-slaughter.json', JSON.stringify(output, null, 2));
  console.log('\nWrote data/usda-slaughter.json\n' + sn);
}

function writeEmpty(reason) {
  fs.writeFileSync('data/usda-slaughter.json', JSON.stringify({
    fetchedAt: new Date().toISOString(), source: 'USDA NASS',
    reportType: 'Livestock Slaughter', error: reason,
    latestWeek: null, latestMonth: null, weekly: [], monthly: [],
    promptSnippet: `═══ USDA LIVESTOCK SLAUGHTER ═══\nData unavailable: ${reason}\n`,
  }, null, 2));
  console.log('Wrote empty data/usda-slaughter.json');
}

function mN(m) {
  if (!m) return 0;
  const s = m.toUpperCase();
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for (let i = 0; i < mo.length; i++) if (s.includes(mo[i])) return i + 1;
  return 0;
}
function wkN(m) { return parseInt((m || '').replace(/\D/g, '')) || 0; }

fetchSlaughter().catch(e => { console.error('FAIL:', e.message); writeEmpty(e.message); });
