/**
 * Fetch USDA Livestock Slaughter data from NASS QuickStats API
 * Outputs: data/usda-slaughter.json
 */
const NASS_KEY = process.env.NASS_API_KEY;
const BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const fs = require('fs');

async function fetchSlaughter() {
  if (!NASS_KEY) throw new Error('NASS_API_KEY not set');
  const currentYear = new Date().getFullYear();

  // Try multiple query strategies
  const strategies = [
    { label: 'exact', params: {
      key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
      short_desc: 'CATTLE, SLAUGHTER, FI - SLAUGHTER, MEASURED IN HEAD',
      agg_level_desc: 'NATIONAL', year__GE: String(currentYear - 1), format: 'JSON',
    }},
    { label: 'like', params: {
      key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
      short_desc__LIKE: '%SLAUGHTER%FI%HEAD%',
      agg_level_desc: 'NATIONAL', year__GE: String(currentYear - 1), format: 'JSON',
    }},
    { label: 'broad_weekly', params: {
      key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
      statisticcat_desc: 'SLAUGHTER', freq_desc: 'WEEKLY',
      agg_level_desc: 'NATIONAL', year__GE: String(currentYear - 1), format: 'JSON',
    }},
    { label: 'broad_monthly', params: {
      key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
      statisticcat_desc: 'SLAUGHTER', freq_desc: 'MONTHLY',
      agg_level_desc: 'NATIONAL', year__GE: String(currentYear - 1), format: 'JSON',
    }},
    { label: 'broadest', params: {
      key: NASS_KEY, source_desc: 'SURVEY', commodity_desc: 'CATTLE',
      statisticcat_desc: 'SLAUGHTER', agg_level_desc: 'NATIONAL',
      year__GE: String(currentYear), format: 'JSON',
    }},
  ];

  let allRows = [];
  for (const s of strategies) {
    console.log(`Trying ${s.label} strategy...`);
    try {
      const res = await fetch(`${BASE}?${new URLSearchParams(s.params)}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) { console.warn(`  HTTP ${res.status}`); continue; }
      const data = await res.json();
      if (data.error) { console.warn(`  Error: ${JSON.stringify(data.error).slice(0, 150)}`); continue; }
      const rows = (data.data || []).filter(r => r.Value && r.Value !== '(D)' && r.Value !== '(NA)');
      console.log(`  Found ${rows.length} records`);
      if (rows.length > 0) {
        allRows = rows;
        console.log(`  Sample: ${rows[0].short_desc} | ${rows[0].freq_desc} | ${rows[0].reference_period_desc} ${rows[0].year} = ${rows[0].Value}`);
        break;
      }
    } catch (err) { console.warn(`  ${err.message}`); }
  }

  const parsed = allRows
    .map(r => ({
      year: parseInt(r.year), period: r.reference_period_desc, freq: r.freq_desc,
      value: parseInt(r.Value.replace(/,/g, '')), unit: r.unit_desc, desc: r.short_desc,
      weekEnding: r.week_ending,
    }))
    .sort((a, b) => b.year - a.year || monthNum(b.period) - monthNum(a.period));

  const weekly = parsed.filter(r => r.freq === 'WEEKLY').slice(0, 52);
  const monthly = parsed.filter(r => r.freq === 'MONTHLY' || r.freq === 'POINT IN TIME').slice(0, 24);

  let snippet = '═══ USDA LIVESTOCK SLAUGHTER ═══\n';
  if (weekly[0]) {
    const wow = weekly[1] ? ` (WoW: ${((weekly[0].value/weekly[1].value-1)*100).toFixed(1)}%)` : '';
    snippet += `Weekly FI Slaughter: ${(weekly[0].value/1000).toFixed(0)}K head, ${weekly[0].period} ${weekly[0].year}${wow}\n`;
  }
  if (monthly[0]) {
    snippet += `Monthly Slaughter: ${(monthly[0].value/1000).toFixed(0)}K head, ${monthly[0].period} ${monthly[0].year}\n`;
  }
  if (!weekly[0] && !monthly[0]) snippet += `No slaughter data returned. ${allRows.length} raw records found.\n`;

  fs.writeFileSync('data/usda-slaughter.json', JSON.stringify({
    fetchedAt: new Date().toISOString(), source: 'USDA NASS QuickStats',
    reportType: 'Livestock Slaughter',
    latestWeek: weekly[0] || null, prevWeek: weekly[1] || null,
    latestMonth: monthly[0] || null, weekly: weekly, monthly: monthly,
    rawCount: allRows.length, promptSnippet: snippet,
  }, null, 2));
  console.log('Wrote data/usda-slaughter.json\n' + snippet);
}

function monthNum(m) {
  if (!m) return 0;
  const s = m.toUpperCase();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for (let i = 0; i < months.length; i++) if (s.includes(months[i])) return i + 1;
  // Handle week numbers
  const wk = parseInt(s.replace(/\D/g, ''));
  return wk || 0;
}

fetchSlaughter().catch(err => { console.error('Slaughter failed:', err.message); process.exit(1); });
