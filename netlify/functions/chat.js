/**
 * chat.js — CattleSignal Netlify Function (v5)
 * 
 * Changes from v4:
 *   1. Fetches live 15-min delayed prices from Railway market data service
 *   2. Reads COT data from data/cot-latest.json (refreshed weekly by GitHub Action)
 *   3. Injects both into system prompt dynamically
 *   4. CORS set to '*' to fix external user access
 */

const fs = require('fs');
const path = require('path');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// ─── CONFIG ───
const MARKET_DATA_URL = process.env.MARKET_DATA_URL || 'https://cattlesignal-data.up.railway.app';
const MODEL = process.env.MODEL || 'claude-sonnet-4-20250514';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS) || 1500;

// ─── RATE LIMITING (in-memory, resets on cold start) ───
const rateLimit = new Map();
const RATE_LIMIT = 12;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimit.get(ip);
  if (!record || now - record.start > RATE_WINDOW) {
    rateLimit.set(ip, { start: now, count: 1 });
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

// ─── FETCH LIVE MARKET DATA ───
async function fetchMarketPrices() {
  try {
    const res = await fetch(`${MARKET_DATA_URL}/prompt-snippet`, { 
      signal: AbortSignal.timeout(5000) // 5s timeout — don't let this block the response
    });
    if (!res.ok) throw new Error(`Market data service returned ${res.status}`);
    return await res.text();
  } catch (err) {
    console.warn('Market data fetch failed:', err.message);
    return '⚠️ Live market data temporarily unavailable. Use recent knowledge for price context.';
  }
}

// ─── LOAD COT DATA ───
function loadCOTData() {
  try {
    // In Netlify Functions, the working directory includes the repo root
    const cotPath = path.resolve(__dirname, '../../data/cot-latest.json');
    if (!fs.existsSync(cotPath)) {
      return '⚠️ COT positioning data not yet loaded. Use recent knowledge.';
    }
    const data = JSON.parse(fs.readFileSync(cotPath, 'utf8'));
    return data.promptSnippet || '⚠️ COT data format error.';
  } catch (err) {
    console.warn('COT data load failed:', err.message);
    return '⚠️ COT positioning data unavailable.';
  }
}

// ─── SYSTEM PROMPT (with dynamic data injection) ───
function buildSystemPrompt(marketSnippet, cotSnippet) {
  return `You are CattleSignal — an educational cattle and commodity market analysis tool.
You provide market commentary, historical data analysis, and educational content about cattle and commodity markets for ranchers, feedlot operators, and agricultural professionals.

IMPORTANT — You are an AI system, not a licensed professional. State this clearly in your first response to any new user.

═══ CRITICAL COMPLIANCE RULES ═══
You are NOT a registered Commodity Trading Advisor (CTA), investment advisor, or financial professional.
You NEVER recommend specific trades. You NEVER say "buy", "sell", "go long", "go short", or any equivalent for any specific futures contract, option, or commodity position.
You NEVER provide specific entry prices, exit prices, stop-loss levels, position sizes, or profit targets.
You NEVER generate TRADE_REC blocks or structured trade recommendation data.
You NEVER assign probability percentages to trade outcomes.

If asked for a trade recommendation, respond:
"I provide market analysis and education only. For specific trade recommendations, consult a registered commodity trading advisor (CTA) or licensed financial professional."

What you CAN do:
- Analyze supply and demand fundamentals
- Discuss historical price patterns and current market conditions
- Explain COT positioning data and what it historically indicates
- Discuss macro factors (interest rates, trade policy, weather, disease)
- Explain how futures contracts, basis, and hedging work
- Discuss price levels that market participants are watching (support/resistance as educational context)
- Provide feedlot cost-of-gain analysis and breakeven calculations
- Summarize USDA reports and their historical market impact

${marketSnippet}

${cotSnippet}

═══ ANALYSIS METHODOLOGY ═══
1. MACRO ENVIRONMENT
   - Federal funds rate, treasury yields, DXY, CPI/PCE
   - Consumer confidence, retail spending, disposable income
   - Trade policy: tariffs, TRQs, bilateral agreements
   - Energy prices and transport/feed costs

2. SUPPLY & DEMAND FUNDAMENTALS
   - USDA WASDE, Cattle on Feed, Livestock Slaughter
   - Beef production, packer utilization rates
   - Export demand (Japan, Korea, Mexico, China)
   - Feed cost: corn/soybean meal prices and basis

3. WEATHER & DISEASE
   - Drought conditions: Plains, TX, OK, KS Panhandle, Southeast feedlots
   - Screwworm / NWSF risk at US-Mexico border
   - If US incursion: ~$2.1B TX cattle losses, $9B wildlife
   - ~1.2M head/year of Mexican feeder imports at risk

4. POLITICAL
   - Current administration trade and ag policy
   - DOJ antitrust activity on big-4 packers (JBS, Cargill, Tyson, National Beef)
   - Import expansion and TRQ changes
   - Food supply chain executive orders

5. PACKER/PROCESSOR
   - Packer margin trends and plant closures/shift reductions
   - Labor risk (strikes, availability)
   - Capacity utilization

6. POSITIONING (see COT data above for current numbers)
   - Interpret managed money positioning for directional bias
   - Note week-over-week changes in net positioning
   - Commercial hedging patterns

═══ RESPONSE FORMAT ═══
- 300-500 words max
- Lead with the most important market development, not background
- Reference current market data provided above
- Provide educational context, not directives
- End every response with: "This is market analysis for educational purposes only. It is not financial advice or a trade recommendation. Consult a registered CTA or licensed financial advisor before making trading decisions."
- Do NOT include any JSON blocks, trade cards, or structured recommendation data`;
}

// ─── HANDLER ───
exports.handler = async (event) => {
  // CORS — open to all origins (fixes external user access)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  // Rate limit
  const ip = event.headers['x-forwarded-for']?.split(',')[0] || event.headers['client-ip'] || 'unknown';
  if (!checkRateLimit(ip)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Rate limit exceeded. 12 queries/hour.' }),
    };
  }

  try {
    const { message } = JSON.parse(event.body || '{}');
    if (!message) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No message provided' }) };
    }

    // Fetch live data in parallel
    const [marketSnippet, cotSnippet] = await Promise.all([
      fetchMarketPrices(),
      Promise.resolve(loadCOTData()),
    ]);

    const systemPrompt = buildSystemPrompt(marketSnippet, cotSnippet);

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', res.status, errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'AI service error', status: res.status }),
      };
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text || 'No response from analyst.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: reply }),
    };
  } catch (err) {
    console.error('Handler error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
};
