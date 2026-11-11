export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get('symbol') || 'BTC/USDT').trim().toUpperCase();
  const tf = (url.searchParams.get('timeframe') || 'H1').trim().toUpperCase();
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, max-age=0'
  };
  try {
    // 1. Check if symbol is XAU/IDR (computed live from Spot Gold XAU/USD * USD/IDR / 31.1034768)
    if (symbol === 'XAU/IDR') {
      const [goldBars, idrRate] = await Promise.all([
        fetchYahooCandles('GC=F', tf),
        fetchUsdIdrRate()
      ]);
      if (goldBars && goldBars.length > 10) {
        const gramFactor = idrRate / 31.1034768;
        const idrBars = goldBars.map(b => ({
          time: b.time,
          open: Math.round(b.open * gramFactor),
          high: Math.round(b.high * gramFactor),
          low: Math.round(b.low * gramFactor),
          close: Math.round(b.close * gramFactor),
          volume: b.volume
        }));
        return new Response(JSON.stringify({
          symbol, timeframe: tf, source: 'LIVE_GLOBAL_GOLD_IDR',
          price: idrBars[idrBars.length - 1].close,
          candles: idrBars
        }), { status: 200, headers });
      }
    }
    // 2. Map non-crypto & multi-asset symbols to exact Yahoo Finance global tickers
    const yahooTicker = mapSymbolToYahooTicker(symbol);
    if (yahooTicker) {
      const yBars = await fetchYahooCandles(yahooTicker, tf);
      if (yBars && yBars.length > 10) {
        return new Response(JSON.stringify({
          symbol, timeframe: tf, ticker: yahooTicker, source: 'LIVE_GLOBAL_EXCHANGE',
          price: yBars[yBars.length - 1].close,
          candles: yBars
        }), { status: 200, headers });
      }
    }
    // 3. Crypto Spot pairs via Binance Vision REST API
    const binanceSym = symbol.replace('/', '').replace('-USD', 'USDT');
    const bBars = await fetchBinanceCandles(binanceSym, tf);
    if (bBars && bBars.length > 10) {
      return new Response(JSON.stringify({
        symbol, timeframe: tf, ticker: binanceSym, source: 'LIVE_BINANCE_SPOT',
        price: bBars[bBars.length - 1].close,
        candles: bBars
      }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: 'Feed unavailable for ' + symbol }), { status: 404, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err && err.message || err) }), { status: 500, headers });
  }
}
function mapSymbolToYahooTicker(sym) {
  const map = {
    'XAU/USD': 'GC=F',
    'XAG/USD': 'SI=F',
    'XPT/USD': 'PL=F',
    'XPD/USD': 'PA=F',
    'COPPER/USD': 'HG=F',
    'WTI/USD': 'CL=F',
    'BRENT/USD': 'BZ=F',
    'NATGAS/USD': 'NG=F',
    'WHEAT/USD': 'ZW=F',
    'CORN/USD': 'ZC=F',
    'SOYBEAN/USD': 'ZS=F',
    'COFFEE/USD': 'KC=F',
    'COCOA/USD': 'CC=F',
    'USD/IDR': 'IDR=X',
    'USD/JPY': 'JPY=X',
    'USD/CHF': 'CHF=X',
    'USD/CAD': 'CAD=X',
    'USD/SGD': 'SGD=X',
    'USD/MYR': 'MYR=X',
    'USD/THB': 'THB=X',
    'USD/CNH': 'CNH=X',
    'USD/KRW': 'KRW=X'
  };
  if (map[sym]) return map[sym];
  if (sym.endsWith('.JK')) return sym;
  if (!sym.includes('/') && !sym.endsWith('USDT')) return sym; // US Stocks (NVDA, AAPL, MSFT, etc.)
  if (sym.includes('/') && !sym.endsWith('/USDT')) {
    return sym.replace('/', '') + '=X'; // EURUSD=X, GBPJPY=X, etc.
  }
  return null;
}
async function fetchUsdIdrRate() {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    if (r.ok) {
      const d = await r.json();
      if (d && d.rates && d.rates.IDR) return Number(d.rates.IDR);
    }
  } catch (_) {}
  return 16485;
}
async function fetchYahooCandles(ticker, tf) {
  const tfCfg = {
    'M1':  { interval: '1m',  range: '1d',  agg: 1 },
    'M5':  { interval: '5m',  range: '5d',  agg: 1 },
    'M15': { interval: '15m', range: '5d',  agg: 1 },
    'M30': { interval: '30m', range: '1mo', agg: 1 },
    'H1':  { interval: '60m', range: '1mo', agg: 1 },
    'H4':  { interval: '60m', range: '3mo', agg: 4 },
    'D1':  { interval: '1d',  range: '1y',  agg: 1 },
    'W1':  { interval: '1wk', range: '5y',  agg: 1 },
    'MN':  { interval: '1mo', range: '10y', agg: 1 },
    '1Y':  { interval: '3mo', range: '10y', agg: 4 }
  }[tf] || { interval: '60m', range: '1mo', agg: 1 };
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${tfCfg.interval}&range=${tfCfg.range}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${tfCfg.interval}&range=${tfCfg.range}`
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data && data.chart && data.chart.result && data.chart.result[0];
      if (!result || !Array.isArray(result.timestamp)) continue;
      const ts = result.timestamp;
      const q = result.indicators && result.indicators.quote && result.indicators.quote[0];
      if (!q) continue;
      const raw = [];
      for (let i = 0; i < ts.length; i++) {
        const o = Number(q.open[i]);
        const h = Number(q.high[i]);
        const l = Number(q.low[i]);
        const c = Number(q.close[i]);
        const v = Number(q.volume[i] || 1000);
        if (Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c) && c > 0) {
          raw.push({ time: Number(ts[i]), open: o, high: h, low: l, close: c, volume: v });
        }
      }
      // Inject exact regularMarketPrice into the latest candle close so it matches TradingView/Yahoo live quote
      const liveMetaPrice = Number(result.meta && result.meta.regularMarketPrice);
      if (raw.length > 0 && Number.isFinite(liveMetaPrice) && liveMetaPrice > 0) {
        const last = raw[raw.length - 1];
        last.close = liveMetaPrice;
        if (liveMetaPrice > last.high) last.high = liveMetaPrice;
        if (liveMetaPrice < last.low) last.low = liveMetaPrice;
      }
      if (tfCfg.agg > 1 && raw.length >= tfCfg.agg) {
        const aggregated = [];
        for (let i = 0; i < raw.length; i += tfCfg.agg) {
          const chunk = raw.slice(i, i + tfCfg.agg);
          aggregated.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map(x => x.high)),
            low: Math.min(...chunk.map(x => x.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((acc, x) => acc + x.volume, 0)
          });
        }
        return aggregated.slice(-200);
      }
      return raw.slice(-200);
    } catch (_) {}
  }
  return null;
}
async function fetchBinanceCandles(binanceSym, tf) {
  const intervalMap = {
    'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
    'H1': '1h', 'H4': '4h', 'D1': '1d', 'W1': '1w', 'MN': '1M', '1Y': '1M'
  };
  const interval = intervalMap[tf] || '1h';
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(binanceSym)}&interval=${interval}&limit=200`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows)) return null;
  return rows.map(r => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5])
  }));
}