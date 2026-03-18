/**
 * CattleSignal Market Data Service v2.1
 * Railway: fetches 15-min delayed futures quotes from Yahoo Finance
 * Serves latest prices as JSON for the Netlify Function to consume
 *
 * Markets: GF (Feeder Cattle), LE (Live Cattle), HE (Lean Hogs),
 *          ZC (Corn), ZS (Soybeans), CL (Crude Oil), ZM (Soybean Meal), ZW (Wheat)
 *
 * Yahoo Finance: no API key, ~15-min delayed, unofficial endpoint
 * Disclaimer required on frontend: "Prices delayed, for informational purposes only"
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Yahoo Finance futures symbols (front-month continuous)
const SYMBOLS = {
  'GF=F': { name: 'Feeder Cattle', code: 'GF', unit: '¢/lb', multiplier: 500 },
  'LE=F': { name: 'Live Cattle',   code: 'LE', unit: '¢/lb', multiplier: 400 },
  'HE=F': { name: 'Lean Hogs',     code: 'HE', unit: '¢/lb', multiplier: 400 },
  'ZC=F': { name: 'Corn',          code: 'ZC', unit: '¢/bu', multiplier: 50 },
  'ZS=F': { name: 'Soybeans',      code: 'ZS', unit: '¢/bu', multiplier: 50 },
  'CL=F': { name: 'Crude Oil',     code: 'CL', unit: '$/bbl', multiplier: 1000 },
  'ZM=F': { name: 'Soybean Meal',  code: 'ZM', unit: '$/ton', multiplier: 100 },
  'ZW=F': { name: 'Wheat',         code: 'ZW', unit: '¢/bu', multiplier: 50 },
};

let priceCache = {
  lastUpdated: null,
  lastAttempt: null,
  prices: {},
  errors: [],
  source: 'yahoo',
};

/**
 * Fetch quote from Yahoo Finance v8 chart API
 */
async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Yahoo returned ${res.status} for ${symbol}`);
  }

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${symbol}`);

  const meta = result.meta;
  const quote = result.indicators?.quote?.[0];
  const closes = quote?.close?.filter(v => v !== null) || [];
  const highs = quote?.high?.filter(v => v !== null) || [];
  const lows = quote?.low?.filter(v => v !== null) || [];
  const opens = quote?.open?.filter(v => v !== null) || [];
  const volumes = quote?.volume?.filter(v => v !== null) || [];

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose;

  return {
    price,
    previousClose: prevClose,
    open: opens.length > 0 ? opens[0] : null,
    high: highs.length > 0 ? Math.max(...highs) : null,
    low: lows.length > 0 ? Math.min(...lows) : null,
    volume: volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) : null,
    change: price - prevClose,
    changePct: (((price - prevClose) / prevClose) * 100).toFixed(2),
    marketState: meta.currentTradingPeriod?.regular ? 'regular' : 'closed',
  };
}

/**
 * Refresh all market prices
 */
async function refreshPrices() {
  console.log(`[${new Date().toISOString()}] Refreshing prices via Yahoo Finance...`);
  const errors = [];
  const prices = {};

  for (const [symbol, info] of Object.entries(SYMBOLS)) {
    try {
      const quote = await fetchYahooQuote(symbol);
      prices[info.code] = {
        ...info,
        ...quote,
        symbol,
        fetchedAt: new Date().toISOString(),
      };
      console.log(`  ✅ ${info.code} (${info.name}): ${quote.price} (${quote.changePct}%)`);
    } catch (err) {
      errors.push({ symbol, code: info.code, error: err.message });
      console.error(`  ❌ ${info.code}: ${err.message}`);
      if (priceCache.prices[info.code]) {
        prices[info.code] = { ...priceCache.prices[info.code], stale: true };
      }
    }
    // 500ms between requests to avoid throttling
    await new Promise(r => setTimeout(r, 500));
  }

  priceCache = {
    lastUpdated: new Date().toISOString(),
    lastAttempt: new Date().toISOString(),
    prices,
    errors,
    marketsCount: Object.keys(prices).length,
    errorsCount: errors.length,
    source: 'yahoo',
  };

  console.log(`[${new Date().toISOString()}] Done: ${Object.keys(prices).length} markets, ${errors.length} errors`);
  return priceCache;
}

/**
 * System prompt snippet for Claude AI injection
 */
function generateSystemPromptSnippet() {
  if (!priceCache.lastUpdated) {
    return '⚠️ No market data available. Use recent knowledge for price context.';
  }

  const lines = ['═══ MARKET DATA (delayed ~15 min) ═══'];
  lines.push(`Last updated: ${priceCache.lastUpdated}`);
  lines.push('');

  for (const [code, data] of Object.entries(priceCache.prices)) {
    if (!data.price) continue;
    const dir = data.change >= 0 ? '▲' : '▼';
    const staleTag = data.stale ? ' [STALE]' : '';
    lines.push(`${data.name} (${code}): ${data.price.toFixed(2)} ${data.unit} ${dir} ${Math.abs(data.change).toFixed(2)} (${data.changePct}%)${staleTag}`);
    if (data.high && data.low) {
      lines.push(`  Range: ${data.low.toFixed(2)}-${data.high.toFixed(2)} | Vol: ${(data.volume || 0).toLocaleString()}`);
    }
  }

  lines.push('');
  lines.push('Use these prices as context for market analysis. Prices are delayed ~15 min.');
  return lines.join('\n');
}

// ─── ROUTES ───

app.get('/', (req, res) => {
  res.json({
    service: 'CattleSignal Market Data',
    version: '3.0.0',
    source: 'yahoo',
    status: priceCache.lastUpdated ? 'ok' : 'no_data',
    lastUpdated: priceCache.lastUpdated,
    marketsLoaded: Object.keys(priceCache.prices).length,
    errors: priceCache.errorsCount || 0,
    scoring: {
      enabled: !!ANTHROPIC_API_KEY,
      lastScored: scoreCache.lastUpdated,
      cacheAge: scoreCache.lastUpdated ? Math.round((Date.now() - new Date(scoreCache.lastUpdated).getTime()) / 1000) : null,
    },
  });
});

app.get('/prices', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.json(priceCache);
});

app.get('/prompt-snippet', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'text/plain');
  res.send(generateSystemPromptSnippet());
});

app.get('/prices/:code', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const code = req.params.code.toUpperCase();
  const market = priceCache.prices[code];
  if (!market) {
    return res.status(404).json({ error: `Market ${code} not found`, available: Object.keys(priceCache.prices) });
  }
  res.json(market);
});

app.post('/refresh', async (req, res) => {
  try {
    const result = await refreshPrices();
    res.json({ status: 'refreshed', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MARKET SCORECARD (AI-powered, cached, on-demand) ───

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SCORE_MODEL = 'claude-haiku-4-5-20251001';
const SCORE_MAX_AGE = 15 * 60 * 1000; // 15 min cache

let scoreCache = {
  lastUpdated: null,
  scores: null,
  refreshing: false,
  lastError: null,
};

let scoreHistory = []; // Keep last 48 entries (~12 hours at 15-min intervals)

// Try to load COT data from the prompt-snippet (which includes COT if available)
async function fetchCOTContext() {
  try {
    const res = await fetch('https://cattlesignal-data-service-production.up.railway.app/prompt-snippet', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Check if COT data is present in the snippet
    if (text.includes('COT') || text.includes('Managed Money')) return text;
    return null;
  } catch { return null; }
}

function buildScoringPrompt(prices, cotData) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
  const month = today.toLocaleString('en-US', { month: 'long', timeZone: 'America/Chicago' });

  const priceLines = Object.entries(prices).map(([code, d]) => {
    if (!d.price) return null;
    const dir = d.change >= 0 ? '+' : '';
    return `${d.name} (${code}): ${d.price.toFixed(2)} ${d.unit} ${dir}${d.change.toFixed(2)} (${d.changePct}%) | Range: ${(d.low||0).toFixed(2)}-${(d.high||0).toFixed(2)} | Vol: ${(d.volume||0).toLocaleString()}`;
  }).filter(Boolean).join('\n');

  const cotSection = cotData
    ? `\nCOT POSITIONING DATA (from CFTC weekly report):\n${cotData}\nCOT_AVAILABLE: true`
    : `\nCOT POSITIONING DATA: NOT AVAILABLE. You do not have current COT data. Score the positioning factor as 50 (neutral) and set positioning confidence to LOW.\nCOT_AVAILABLE: false`;

  const dataSources = [
    'Price data: YES (15-min delayed Yahoo Finance)',
    `COT data: ${cotData ? 'YES' : 'NO — unavailable, do not guess'}`,
    'USDA reports: NO — not available in this request, do not guess specific numbers',
    'Slaughter data: NO — not available, do not guess',
    'Export data: NO — not available, do not guess',
  ].join('\n');

  return `You are a cattle and commodity market scoring engine. Today is ${dateStr}. The current month is ${month}. It is ${month.includes('Mar') || month.includes('Apr') || month.includes('May') ? 'SPRING' : month.includes('Jun') || month.includes('Jul') || month.includes('Aug') ? 'SUMMER' : month.includes('Sep') || month.includes('Oct') || month.includes('Nov') ? 'FALL' : 'WINTER'} in the Northern Hemisphere.

AVAILABLE DATA SOURCES:
${dataSources}

CURRENT MARKET DATA (15-min delayed):
${priceLines}
${cotSection}

CRITICAL RULES:
1. Only cite data you actually have above. Do NOT fabricate USDA numbers, slaughter rates, export figures, or COT positions.
2. If you lack data for a factor, score it 50 (neutral) and note "Data unavailable" in the note field.
3. Seasonal patterns must reflect the ACTUAL current month (${month}), not a hallucinated season.
4. Confidence score must reflect data completeness honestly:
   - All 5 data sources available: 80-95
   - Price + COT only: 55-70
   - Price only (current state): 35-50
   - Missing or stale prices: 15-30
5. Factor notes must be under 15 words and must NOT cite specific numbers you don't have.

For each of these 8 markets, produce a composite outlook score from 0-100:
0-15 = Strongly Bearish, 16-30 = Bearish, 31-45 = Slightly Bearish, 46-55 = Neutral, 56-70 = Slightly Bullish, 71-85 = Bullish, 86-100 = Strongly Bullish

Score each market on 5 factors (each 0-100):
1. supply: Supply fundamentals based on known conditions
2. demand: Demand strength based on known conditions
3. positioning: COT/managed money (use 50 if COT unavailable)
4. macro: Macro environment (interest rates, energy costs, trade policy)
5. seasonal: Seasonal pattern for ${month} specifically

Composite = supply 25% + demand 20% + positioning 15% + macro 15% + seasonal 15% + 10% discretionary.

CRITICAL: Respond with ONLY valid JSON, no markdown, no backticks, no preamble. Exact structure:

{"scores":[{"code":"GF","name":"Feeder Cattle","price":0,"change":0,"changePct":0,"composite":0,"confidence":0,"signal":"Bullish","summary":"One sentence.","factors":{"supply":{"score":0,"note":"brief"},"demand":{"score":0,"note":"brief"},"positioning":{"score":0,"note":"brief"},"macro":{"score":0,"note":"brief"},"seasonal":{"score":0,"note":"brief"}}}],"generatedAt":"ISO timestamp","marketStatus":"open or closed","dataSources":{"prices":true,"cot":${cotData ? 'true' : 'false'},"usda":false,"slaughter":false,"exports":false}}`;
}

async function generateScores() {
  if (!ANTHROPIC_API_KEY) {
    console.warn('No ANTHROPIC_API_KEY — cannot generate scores');
    scoreCache.lastError = 'No API key configured';
    return null;
  }
  if (Object.keys(priceCache.prices).length === 0) {
    console.warn('No price data — cannot generate scores');
    scoreCache.lastError = 'No price data available';
    return null;
  }

  console.log(`[${new Date().toISOString()}] Generating market scores...`);

  try {
    // Try to get COT data
    const cotData = await fetchCOTContext();
    console.log(`  COT data: ${cotData ? 'available' : 'unavailable'}`);

    const prompt = buildScoringPrompt(priceCache.prices, cotData);

    // Try Haiku first, fall back to Sonnet if Haiku fails
    let model = SCORE_MODEL;
    let res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    // Fallback to Sonnet if Haiku fails
    if (!res.ok && model !== 'claude-sonnet-4-20250514') {
      console.warn(`  Haiku failed (${res.status}), falling back to Sonnet`);
      model = 'claude-sonnet-4-20250514';
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(30000),
      });
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Inject current prices into scores
    parsed.scores = parsed.scores.map(s => {
      const priceData = priceCache.prices[s.code];
      if (priceData) {
        s.price = priceData.price;
        s.change = priceData.change;
        s.changePct = Number(priceData.changePct);
        s.unit = priceData.unit;
      }
      // Clamp scores
      s.composite = Math.max(0, Math.min(100, Math.round(s.composite)));
      s.confidence = Math.max(0, Math.min(100, Math.round(s.confidence)));
      Object.values(s.factors || {}).forEach(f => {
        f.score = Math.max(0, Math.min(100, Math.round(f.score)));
      });
      // Derive signal label from composite
      if (s.composite <= 15) s.signal = 'Strongly Bearish';
      else if (s.composite <= 30) s.signal = 'Bearish';
      else if (s.composite <= 45) s.signal = 'Slightly Bearish';
      else if (s.composite <= 55) s.signal = 'Neutral';
      else if (s.composite <= 70) s.signal = 'Slightly Bullish';
      else if (s.composite <= 85) s.signal = 'Bullish';
      else s.signal = 'Strongly Bullish';
      return s;
    });

    parsed.generatedAt = new Date().toISOString();
    parsed.pricesAsOf = priceCache.lastUpdated;

    // Apply smoothing: score can't move more than 15 points from previous
    if (scoreCache.scores?.scores) {
      const prev = {};
      scoreCache.scores.scores.forEach(s => prev[s.code] = s.composite);
      parsed.scores.forEach(s => {
        if (prev[s.code] !== undefined) {
          const diff = s.composite - prev[s.code];
          if (Math.abs(diff) > 15) {
            s.composite = prev[s.code] + (diff > 0 ? 15 : -15);
            s.smoothed = true;
          }
        }
      });
    }

    // Store in history
    scoreHistory.push({
      timestamp: parsed.generatedAt,
      scores: parsed.scores.map(s => ({ code: s.code, composite: s.composite })),
    });
    if (scoreHistory.length > 48) scoreHistory.shift();

    console.log(`[${new Date().toISOString()}] Scores generated: ${parsed.scores.map(s => `${s.code}:${s.composite}`).join(', ')}`);
    return parsed;

  } catch (err) {
    console.error('Score generation failed:', err.message);
    scoreCache.lastError = err.message;
    return null;
  }
}

app.get('/scores', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  // If cache is fresh, serve it
  if (scoreCache.scores && scoreCache.lastUpdated) {
    const age = Date.now() - new Date(scoreCache.lastUpdated).getTime();
    if (age < SCORE_MAX_AGE) {
      return res.json({
        ...scoreCache.scores,
        cached: true,
        cacheAge: Math.round(age / 1000),
        history: scoreHistory.slice(-12), // Last 3 hours
      });
    }
  }

  // If already refreshing, serve stale or empty
  if (scoreCache.refreshing) {
    if (scoreCache.scores) {
      return res.json({
        ...scoreCache.scores,
        cached: true,
        stale: true,
        refreshing: true,
        history: scoreHistory.slice(-12),
      });
    }
    return res.json({ scores: null, refreshing: true, message: 'Generating scores...' });
  }

  // Generate fresh scores
  scoreCache.refreshing = true;
  try {
    const scores = await generateScores();
    if (scores) {
      scoreCache.scores = scores;
      scoreCache.lastUpdated = new Date().toISOString();
      scoreCache.lastError = null;
    }
    scoreCache.refreshing = false;
    return res.json({
      ...(scoreCache.scores || { scores: null }),
      cached: false,
      history: scoreHistory.slice(-12),
      lastError: scoreCache.lastError || null,
    });
  } catch (err) {
    scoreCache.refreshing = false;
    scoreCache.lastError = err.message;
    return res.status(500).json({ error: err.message });
  }
});

// ─── CRON SCHEDULE ───
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function isMarketHours() {
  const now = new Date();
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const day = ct.getDay();
  const hour = ct.getHours();
  if (day === 6) return false;
  if (day === 0 && hour < 17) return false;
  if (day === 5 && hour >= 16) return false;
  if (hour === 16) return false;
  return true;
}

setInterval(async () => {
  if (isMarketHours()) {
    try { await refreshPrices(); }
    catch (err) { console.error('Auto-refresh failed:', err.message); }
  } else {
    console.log(`[${new Date().toISOString()}] Market closed — skipping`);
  }
}, FIFTEEN_MINUTES);

// Initial fetch on startup (always, even if market closed — shows last known prices)
refreshPrices().catch(err => console.error('Initial fetch failed:', err.message));

app.listen(PORT, () => {
  console.log(`CattleSignal Market Data v2.1 on port ${PORT}`);
  console.log(`Source: Yahoo Finance (no API key required)`);
});
