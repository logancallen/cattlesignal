/**
 * fetch-cot.js — Pull CFTC Disaggregated COT data for CattleSignal markets
 * 
 * Data source: CFTC Public Reporting Environment (Socrata SODA API)
 * Disaggregated Futures Only: https://publicreporting.cftc.gov/resource/72hh-3qpy.json
 * No API key required.
 * 
 * Markets pulled:
 *   - LIVE CATTLE (CFTC code: 057642)
 *   - FEEDER CATTLE (CFTC code: 061641)
 *   - LEAN HOGS (CFTC code: 054642)
 *   - CORN (CFTC code: 002602)
 *   - SOYBEANS (CFTC code: 005602)
 *   - SOYBEAN MEAL (CFTC code: 026603)
 *   - WHEAT-SRW (CFTC code: 001602)
 *   - CRUDE OIL (CFTC code: 067651)
 */

const fs = require('fs');
const path = require('path');

const CFTC_API = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json';

// CFTC contract codes for our markets
const MARKET_CODES = {
  '057642': { name: 'Live Cattle', code: 'LE' },
  '061641': { name: 'Feeder Cattle', code: 'GF' },
  '054642': { name: 'Lean Hogs', code: 'HE' },
  '002602': { name: 'Corn', code: 'ZC' },
  '005602': { name: 'Soybeans', code: 'ZS' },
  '026603': { name: 'Soybean Meal', code: 'ZM' },
  '001602': { name: 'Wheat (SRW)', code: 'ZW' },
  '067651': { name: 'Crude Oil', code: 'CL' },
};

async function fetchCOTData() {
  const cftcCodes = Object.keys(MARKET_CODES);
  
  // Build SoQL query: get last 4 weeks for each market
  // $where clause filters by contract codes, $order sorts by date desc
  const whereClause = cftcCodes.map(c => `cftc_contract_market_code='${c}'`).join(' OR ');
  const url = `${CFTC_API}?$where=${encodeURIComponent(whereClause)}&$order=report_date_as_yyyy_mm_dd DESC&$limit=200`;

  console.log('Fetching CFTC COT data...');
  console.log(`URL: ${url}`);

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`CFTC API returned ${res.status}: ${await res.text()}`);
  }

  const raw = await res.json();
  console.log(`Received ${raw.length} records from CFTC`);

  // Group by market code, take most recent report for each
  const byMarket = {};

  for (const row of raw) {
    const code = row.cftc_contract_market_code;
    if (!MARKET_CODES[code]) continue;

    const marketKey = MARKET_CODES[code].code;
    if (!byMarket[marketKey]) {
      byMarket[marketKey] = [];
    }

    byMarket[marketKey].push({
      reportDate: row.report_date_as_yyyy_mm_dd,
      marketName: row.contract_market_name,
      openInterest: parseInt(row.open_interest_all) || 0,
      // Managed Money (the key metric for CattleSignal)
      managedMoney: {
        long: parseInt(row.m_money_positions_long_all) || 0,
        short: parseInt(row.m_money_positions_short_all) || 0,
        spreading: parseInt(row.m_money_positions_spread_all) || 0,
        netLong: (parseInt(row.m_money_positions_long_all) || 0) - (parseInt(row.m_money_positions_short_all) || 0),
        changeLong: parseInt(row.change_in_m_money_long_all) || 0,
        changeShort: parseInt(row.change_in_m_money_short_all) || 0,
      },
      // Producer/Merchant/Processor (commercials)
      commercial: {
        long: parseInt(row.prod_merc_positions_long_all) || 0,
        short: parseInt(row.prod_merc_positions_short_all) || 0,
        netLong: (parseInt(row.prod_merc_positions_long_all) || 0) - (parseInt(row.prod_merc_positions_short_all) || 0),
      },
      // Swap Dealers
      swapDealer: {
        long: parseInt(row.swap_positions_long_all) || 0,
        short: parseInt(row.swap__positions_short_all) || 0,
        spreading: parseInt(row.swap__positions_spread_all) || 0,
        netLong: (parseInt(row.swap_positions_long_all) || 0) - (parseInt(row.swap__positions_short_all) || 0),
      },
      // Other Reportables
      otherReportable: {
        long: parseInt(row.other_rept_positions_long_all) || 0,
        short: parseInt(row.other_rept_positions_short_all) || 0,
        netLong: (parseInt(row.other_rept_positions_long_all) || 0) - (parseInt(row.other_rept_positions_short_all) || 0),
      },
    });
  }

  // Sort each market's data by date (newest first) and keep top 4 weeks
  const output = {};
  for (const [code, records] of Object.entries(byMarket)) {
    records.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    output[code] = {
      market: MARKET_CODES[Object.keys(MARKET_CODES).find(k => MARKET_CODES[k].code === code)]?.name,
      latest: records[0] || null,
      history: records.slice(0, 4), // Last 4 weeks for trend
      weekOverWeek: records.length >= 2 ? {
        managedMoneyNetChange: records[0].managedMoney.netLong - records[1].managedMoney.netLong,
        openInterestChange: records[0].openInterest - records[1].openInterest,
      } : null,
    };
  }

  // Generate the system prompt snippet
  const promptSnippet = generateCOTPromptSnippet(output);

  const result = {
    fetchedAt: new Date().toISOString(),
    reportDate: Object.values(output)[0]?.latest?.reportDate || 'unknown',
    markets: output,
    promptSnippet,
  };

  return result;
}

function generateCOTPromptSnippet(markets) {
  const lines = ['═══ CFTC COT POSITIONING (Disaggregated, Futures Only) ═══'];

  for (const [code, data] of Object.entries(markets)) {
    if (!data.latest) continue;
    const mm = data.latest.managedMoney;
    const wow = data.weekOverWeek;
    const dir = mm.netLong >= 0 ? 'NET LONG' : 'NET SHORT';
    const wowStr = wow ? ` (WoW: ${wow.managedMoneyNetChange >= 0 ? '+' : ''}${wow.managedMoneyNetChange.toLocaleString()})` : '';

    lines.push(`${data.market} (${code}): Managed Money ${dir} ${Math.abs(mm.netLong).toLocaleString()} contracts${wowStr}`);
    lines.push(`  OI: ${data.latest.openInterest.toLocaleString()} | MM Long: ${mm.long.toLocaleString()} | MM Short: ${mm.short.toLocaleString()}`);
  }

  lines.push(`\nReport date: ${Object.values(markets)[0]?.latest?.reportDate || 'N/A'}`);
  return lines.join('\n');
}

// ─── MAIN ───

async function main() {
  try {
    const data = await fetchCOTData();

    // Ensure output directory exists
    const outDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outPath = path.join(outDir, 'cot-latest.json');
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`\n✅ COT data written to ${outPath}`);
    console.log(`Report date: ${data.reportDate}`);
    console.log(`Markets: ${Object.keys(data.markets).join(', ')}`);
    console.log('\n--- System Prompt Snippet ---');
    console.log(data.promptSnippet);
  } catch (err) {
    console.error('❌ COT fetch failed:', err.message);
    process.exit(1);
  }
}

main();
