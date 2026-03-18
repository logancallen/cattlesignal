/**
 * Fetch USDA Livestock Slaughter data from NASS QuickStats API
 * Runs weekly (data released Wednesdays)
 * Outputs: data/usda-slaughter.json
 */

const NASS_KEY = process.env.NASS_API_KEY;
const BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const fs = require('fs');

async function fetchSlaughter() {
  if (!NASS_KEY) throw new Error('NASS_API_KEY not set');

  const currentYear = new Date().getFullYear();

  // Fetch weekly federally inspected cattle slaughter
  const params = new URLSearchParams({
    key: NASS_KEY,
    commodity_desc: 'CATTLE',
    statisticcat_desc: 'SLAUGHTER',
    short_desc__LIKE: '%SLAUGHTER%FI%',
    agg_level_desc: 'NATIONAL',
    freq_desc: 'WEEKLY',
    year__GE: currentYear - 1,
    format: 'JSON',
  });

  console.log('Fetching weekly slaughter data...');
  const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NASS API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`API error: ${JSON.stringify(data.error)}`);

  const rows = (data.data || [])
    .filter(r => r.Value && r.Value !== '(D)' && r.Value !== '(NA)')
    .map(r => ({
      year: parseInt(r.year),
      week: r.begin_code || r.reference_period_desc,
      weekEnding: r.week_ending || r.end_code,
      value: parseInt(r.Value.replace(/,/g, '')),
      unit: r.unit_desc,
      desc: r.short_desc,
    }))
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return (parseInt(b.week) || 0) - (parseInt(a.week) || 0);
    });

  console.log(`  ${rows.length} weekly slaughter records`);

  // Also get monthly for trend analysis
  const monthlyParams = new URLSearchParams({
    key: NASS_KEY,
    commodity_desc: 'CATTLE',
    statisticcat_desc: 'SLAUGHTER',
    short_desc__LIKE: '%SLAUGHTER%FI%HEAD%',
    agg_level_desc: 'NATIONAL',
    freq_desc: 'MONTHLY',
    year__GE: currentYear - 2,
    format: 'JSON',
  });

  console.log('Fetching monthly slaughter data...');
  const monthlyRes = await fetch(`${BASE}?${monthlyParams}`, { signal: AbortSignal.timeout(15000) });
  let monthly = [];
  if (monthlyRes.ok) {
    const md = await monthlyRes.json();
    monthly = (md.data || [])
      .filter(r => r.Value && r.Value !== '(D)' && r.Value !== '(NA)')
      .map(r => ({
        year: parseInt(r.year),
        month: r.reference_period_desc,
        value: parseInt(r.Value.replace(/,/g, '')),
        unit: r.unit_desc,
        desc: r.short_desc,
      }))
      .sort((a, b) => b.year - a.year || monthOrder(b.month) - monthOrder(a.month))
      .slice(0, 24);
    console.log(`  ${monthly.length} monthly slaughter records`);
  }

  // Build prompt snippet
  const latestWeek = rows[0];
  const prevWeek = rows[1];
  const latestMonth = monthly[0];
  const prevYearMonth = latestMonth ? monthly.find(r => r.year === latestMonth.year - 1 && r.month === latestMonth.month) : null;

  let snippet = '═══ USDA LIVESTOCK SLAUGHTER ═══\n';
  if (latestWeek) {
    const wow = prevWeek
      ? ` (WoW: ${((latestWeek.value / prevWeek.value - 1) * 100).toFixed(1)}%)`
      : '';
    snippet += `Weekly FI Slaughter: ${(latestWeek.value / 1000).toFixed(0)}K head, week ${latestWeek.week} ${latestWeek.year}${wow}\n`;
  }
  if (latestMonth) {
    const yoy = prevYearMonth
      ? ` (YoY: ${((latestMonth.value / prevYearMonth.value - 1) * 100).toFixed(1)}%)`
      : '';
    snippet += `Monthly FI Slaughter: ${(latestMonth.value / 1000).toFixed(0)}K head, ${latestMonth.month} ${latestMonth.year}${yoy}\n`;
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'USDA NASS QuickStats',
    reportType: 'Livestock Slaughter',
    latestWeek,
    prevWeek,
    latestMonth,
    weekly: rows.slice(0, 52),
    monthly,
    promptSnippet: snippet,
  };

  fs.writeFileSync('data/usda-slaughter.json', JSON.stringify(output, null, 2));
  console.log('Wrote data/usda-slaughter.json');
  console.log(snippet);
}

function monthOrder(m) {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return months.indexOf(m?.toUpperCase?.()?.slice(0, 3)) || 0;
}

fetchSlaughter().catch(err => {
  console.error('Slaughter fetch failed:', err.message);
  process.exit(1);
});
