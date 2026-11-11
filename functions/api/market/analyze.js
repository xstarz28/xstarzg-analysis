export async function onRequest(context) {
  const { request } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') || 'XAU/USD').trim().toUpperCase();
  const tf = (url.searchParams.get('tf') || 'H1').trim().toUpperCase();
  const quoteOnly = url.searchParams.get('quote') === '1';
  try {
    if (quoteOnly) {
      const liveQuote = await fetchExactLiveQuote(symbol, tf);
      return new Response(JSON.stringify({
        ok: true,
        symbol,
        tf,
        timestamp: Date.now(),
        quote: liveQuote
      }), { status: 200, headers: corsHeaders });
    }
    const marketData = await fetchSynchronizedMarketCandles(symbol, tf);
    return new Response(JSON.stringify({
      ok: true,
      symbol,
      tf,
      source: marketData.source,
      price: marketData.price,
      changePct: marketData.changePct,
      candles: marketData.candles,
      timestamp: Date.now()
    }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      symbol,
      tf,
      error: err.message || 'Market feed error'
    }), { status: 200, headers: corsHeaders });
  }
}
const US_EXCHANGE_MAP = {
  'NVDA': 'NASDAQ:NVDA', 'AAPL': 'NASDAQ:AAPL', 'MSFT': 'NASDAQ:MSFT', 'AMZN': 'NASDAQ:AMZN',
  'META': 'NASDAQ:META', 'GOOGL': 'NASDAQ:GOOGL', 'TSLA': 'NASDAQ:TSLA', 'AMD': 'NASDAQ:AMD',
  'NFLX': 'NASDAQ:NFLX', 'AVGO': 'NASDAQ:AVGO', 'COST': 'NASDAQ:COST', 'COIN': 'NASDAQ:COIN',
  'MSTR': 'NASDAQ:MSTR', 'PLTR': 'NASDAQ:PLTR', 'INTC': 'NASDAQ:INTC',
  'BRK-B': 'NYSE:BRK.B', 'JPM': 'NYSE:JPM', 'V': 'NYSE:V', 'MA': 'NYSE:MA',
  'WMT': 'NYSE:WMT', 'DIS': 'NYSE:DIS', 'XOM': 'NYSE:XOM', 'LLY': 'NYSE:LLY'
};
function getTvTimeframeSuffix(tf) {
  const map = {
    'M1': '|1', 'M5': '|5', 'M15': '|15', 'M30': '|30',
    'H1': '|60', 'H4': '|240', 'D1': '', 'W1': '|1W', 'MN': '|1M', '1Y': '|12M'
  };
  return map[tf] !== undefined ? map[tf] : '|60';
}
function getTvTickersForSymbol(symbol) {
  const s = symbol.toUpperCase().trim();
  if (s === 'XAU/USD') return ['OANDA:XAUUSD', 'FOREXCOM:XAUUSD', 'FX_IDC:XAUUSD'];
  if (s === 'XAG/USD') return ['OANDA:XAGUSD', 'FOREXCOM:XAGUSD', 'FX_IDC:XAGUSD'];
  if (s === 'XPT/USD') return ['OANDA:XPTUSD', 'FOREXCOM:XPTUSD'];
  if (s === 'XPD/USD') return ['OANDA:XPDUSD', 'FOREXCOM:XPDUSD'];
  if (s === 'XCU/USD') return ['OANDA:XCUUSD', 'FOREXCOM:XCUUSD'];
  if (s === 'WTI/USD') return ['TVC:USOIL', 'OANDA:WTICOUSD'];
  if (s === 'BRENT/USD') return ['TVC:UKOIL', 'OANDA:BCOUSD'];
  if (s === 'NATGAS/USD') return ['OANDA:NATGASUSD', 'TVC:NG1!'];
  if (s === 'WHEAT/USD') return ['OANDA:WHEATUSD'];
  if (s === 'CORN/USD') return ['OANDA:CORNUSD'];
  if (s === 'SOYBEAN/USD') return ['OANDA:SOYBNUSD'];
  if (s === 'COFFEE/USD') return ['ICEUS:KC1!'];
  if (s === 'COCOA/USD') return ['ICEUS:CC1!'];
  if (s.endsWith('.JK')) {
    const code = s.replace('.JK', '');
    return [`IDX:${code}`];
  }
  if (US_EXCHANGE_MAP[s]) {
    return [US_EXCHANGE_MAP[s]];
  }
  if (s.includes('/USDT')) {
    const clean = s.replace('/', '');
    return [`BINANCE:${clean}`];
  }
  if (s.includes('/')) {
    const clean = s.replace('/', '');
    return [`OANDA:${clean}`, `FOREXCOM:${clean}`, `FX_IDC:${clean}`];
  }
  return [`NASDAQ:${s}`, `NYSE:${s}`];
}
async function queryTradingViewScanner(tickers, tf) {
  if (!tickers || tickers.length === 0) return null;
  const sfx = getTvTimeframeSuffix(tf);
  const cols = [
    'close',
    'change',
    `open${sfx}`,
    `high${sfx}`,
    `low${sfx}`,
    `close${sfx}`,
    `volume${sfx}`
  ];
  const fetchScan = async (tickerList) => {
    const res = await fetch('https://scanner.tradingview.com/global/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        symbols: { tickers: tickerList, query: { types: [] } },
        columns: cols
      })
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !Array.isArray(json.data) || json.data.length === 0) return null;
    for (const row of json.data) {
      if (row && Array.isArray(row.d)) {
        const spotClose = Number(row.d[0]);
        const tfClose = Number(row.d[5]);
        const price = Number.isFinite(spotClose) && spotClose > 0 ? spotClose : tfClose;
        if (Number.isFinite(price) && price > 0) {
          return {
            ticker: row.s,
            price,
            changePct: Number(row.d[1]) || 0,
            tfOpen: Number(row.d[2]) || price,
            tfHigh: Math.max(Number(row.d[3]) || price, price),
            tfLow: Math.min(Number(row.d[4]) || price, price),
            tfClose: price,
            tfVolume: Number(row.d[6]) || 0
          };
        }
      }
    }
    return null;
  };
  try {
    const batchResult = await fetchScan(tickers);
    if (batchResult) return batchResult;
  } catch (e) {}
  for (const singleTicker of tickers) {
    try {
      const singleResult = await fetchScan([singleTicker]);
      if (singleResult) return singleResult;
    } catch (e) {}
  }
  return null;
}
async function fetchExactLiveQuote(symbol, tf) {
  const s = symbol.toUpperCase().trim();
  if (s === 'XAU/IDR') {
    const [xau, idr] = await Promise.all([
      queryTradingViewScanner(['OANDA:XAUUSD', 'FOREXCOM:XAUUSD', 'FX_IDC:XAUUSD'], tf),
      queryTradingViewScanner(['FX_IDC:USDIDR', 'OANDA:USDIDR'], tf)
    ]);
    const xauPrice = xau && xau.price > 0 ? xau.price : 4055;
    const idrRate = idr && idr.price > 10000 ? idr.price : 16550;
    const gramPrice = (xauPrice * idrRate) / 31.1034768;
    const tfHigh = xau ? (xau.tfHigh * idrRate) / 31.1034768 : gramPrice;
    const tfLow = xau ? (xau.tfLow * idrRate) / 31.1034768 : gramPrice;
    const tfOpen = xau ? (xau.tfOpen * idrRate) / 31.1034768 : gramPrice;
    return {
      source: 'OANDA:XAUUSD x FX_IDC:USDIDR (Gram)',
      price: gramPrice,
      changePct: xau ? xau.changePct : 0,
      tfOpen,
      tfHigh: Math.max(tfHigh, gramPrice),
      tfLow: Math.min(tfLow, gramPrice),
      tfClose: gramPrice,
      tfVolume: xau ? xau.tfVolume : 100
    };
  }
  if (s.endsWith('/USDT')) {
    const pair = s.replace('/', '');
    try {
      const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${pair}`);
      if (res.ok) {
        const d = await res.json();
        const price = Number(d.lastPrice);
        if (price > 0) {
          return {
            source: `BINANCE:${pair}`,
            price,
            changePct: Number(d.priceChangePercent) || 0,
            tfOpen: price,
            tfHigh: price,
            tfLow: price,
            tfClose: price,
            tfVolume: Number(d.volume) || 0
          };
        }
      }
    } catch (e) {}
  }
  const tickers = getTvTickersForSymbol(s);
  const tvQuote = await queryTradingViewScanner(tickers, tf);
  if (tvQuote && tvQuote.price > 0) {
    return {
      source: tvQuote.ticker,
      price: tvQuote.price,
      changePct: tvQuote.changePct,
      tfOpen: tvQuote.tfOpen,
      tfHigh: tvQuote.tfHigh,
      tfLow: tvQuote.tfLow,
      tfClose: tvQuote.price,
      tfVolume: tvQuote.tfVolume
    };
  }
  const yh = await fetchYahooChartCandles(s, tf);
  if (yh && yh.candles && yh.candles.length > 0) {
    const last = yh.candles[yh.candles.length - 1];
    const prev = yh.candles.length > 1 ? yh.candles[yh.candles.length - 2].close : last.open;
    const chg = prev > 0 ? ((last.close - prev) / prev) * 100 : 0;
    return {
      source: yh.source,
      price: last.close,
      changePct: chg,
      tfOpen: last.open,
      tfHigh: last.high,
      tfLow: last.low,
      tfClose: last.close,
      tfVolume: last.volume
    };
  }
  throw new Error(`Tidak dapat mengambil kuotasi untuk ${s}`);
}
function getYahooParams(symbol, tf) {
  const s = symbol.toUpperCase().trim();
  let yhSym = s;
  const map = {
    'XAU/USD': 'GC=F',
    'XAU/IDR': 'GC=F',
    'XAG/USD': 'SI=F',
    'XPT/USD': 'PL=F',
    'XPD/USD': 'PA=F',
    'XCU/USD': 'HG=F',
    'WTI/USD': 'CL=F',
    'BRENT/USD': 'BZ=F',
    'NATGAS/USD': 'NG=F',
    'WHEAT/USD': 'ZW=F',
    'CORN/USD': 'ZC=F',
    'SOYBEAN/USD': 'ZS=F',
    'COFFEE/USD': 'KC=F',
    'COCOA/USD': 'CC=F'
  };
  if (map[s]) {
    yhSym = map[s];
  } else if (s.endsWith('/USDT')) {
    yhSym = s.replace('/USDT', '-USD');
  } else if (s.includes('/')) {
    yhSym = s.replace('/', '') + '=X';
  }
  const tfMap = {
    'M1':  { interval: '1m',  range: '2d' },
    'M5':  { interval: '5m',  range: '5d' },
    'M15': { interval: '15m', range: '10d' },
    'M30': { interval: '30m', range: '1mo' },
    'H1':  { interval: '60m', range: '1mo' },
    'H4':  { interval: '60m', range: '3mo', aggregate4H: true },
    'D1':  { interval: '1d',  range: '1y' },
    'W1':  { interval: '1wk', range: '5y' },
    'MN':  { interval: '1mo', range: '10y' },
    '1Y':  { interval: '3mo', range: 'max' }
  };
  const cfg = tfMap[tf] || tfMap['H1'];
  return { yhSym, ...cfg };
}
async function fetchYahooChartCandles(symbol, tf) {
  const { yhSym, interval, range, aggregate4H } = getYahooParams(symbol, tf);
  const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const endpoint = `${host}/v8/finance/chart/${encodeURIComponent(yhSym)}?interval=${interval}&range=${range}&includePrePost=true`;
      const res = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result || !Array.isArray(result.timestamp)) continue;
      const ts = result.timestamp;
      const q = result.indicators?.quote?.[0] || {};
      const raw = [];
      for (let i = 0; i < ts.length; i++) {
        const t = Number(ts[i]);
        const o = Number(q.open?.[i]);
        const h = Number(q.high?.[i]);
        const l = Number(q.low?.[i]);
        const c = Number(q.close?.[i]);
        const v = Number(q.volume?.[i]) || 100;
        if (Number.isFinite(t) && Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c) && c > 0) {
          raw.push({ time: t, open: o, high: h, low: l, close: c, volume: v });
        }
      }
      if (raw.length < 5) continue;
      let candles = raw;
      if (aggregate4H) {
        const agg = [];
        for (let i = 0; i < raw.length; i += 4) {
          const chunk = raw.slice(i, i + 4);
          if (chunk.length === 0) continue;
          agg.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map(x => x.high)),
            low: Math.min(...chunk.map(x => x.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((a, b) => a + b.volume, 0)
          });
        }
        candles = agg;
      }
      const metaPrice = Number(result.meta?.regularMarketPrice) || candles[candles.length - 1].close;
      return { source: `BROKER_FEED:${yhSym}`, candles: candles.slice(-260), metaPrice };
    } catch (e) {}
  }
  return null;
}
async function fetchBinanceCandles(symbol, tf) {
  const pair = symbol.replace('/', '').toUpperCase();
  const tfMap = {
    'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
    'H1': '1h', 'H4': '4h', 'D1': '1d', 'W1': '1w', 'MN': '1M', '1Y': '1M'
  };
  const interval = tfMap[tf] || '1h';
  try {
    const [kRes, tRes] = await Promise.all([
      fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=240`),
      fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${pair}`)
    ]);
    if (!kRes.ok) return null;
    const klines = await kRes.json();
    if (!Array.isArray(klines) || klines.length < 5) return null;
    const candles = klines.map(k => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]) || 100
    }));
    let livePrice = candles[candles.length - 1].close;
    let changePct = 0;
    if (tRes.ok) {
      const td = await tRes.json();
      if (Number(td.lastPrice) > 0) livePrice = Number(td.lastPrice);
      changePct = Number(td.priceChangePercent) || 0;
    }
    const last = candles[candles.length - 1];
    last.close = livePrice;
    if (livePrice > last.high) last.high = livePrice;
    if (livePrice < last.low) last.low = livePrice;
    return {
      source: `BINANCE:${pair}`,
      price: livePrice,
      changePct,
      candles
    };
  } catch (e) {
    return null;
  }
}
async function fetchSynchronizedMarketCandles(symbol, tf) {
  const s = symbol.toUpperCase().trim();
  if (s.endsWith('/USDT')) {
    const binData = await fetchBinanceCandles(s, tf);
    if (binData) return binData;
  }
  const [liveQuote, yhData] = await Promise.all([
    fetchExactLiveQuote(s, tf).catch(() => null),
    fetchYahooChartCandles(s, tf).catch(() => null)
  ]);
  if (yhData && Array.isArray(yhData.candles) && yhData.candles.length > 0) {
    let candles = yhData.candles.map(c => ({ ...c }));
    const lastIdx = candles.length - 1;
    const rawLastClose = candles[lastIdx].close;
    if (liveQuote && Number.isFinite(liveQuote.price) && liveQuote.price > 0 && rawLastClose > 0) {
      if (s === 'XAU/IDR') {
        const ratio = liveQuote.price / rawLastClose;
        candles = candles.map(c => ({
          time: c.time,
          open: c.open * ratio,
          high: c.high * ratio,
          low: c.low * ratio,
          close: c.close * ratio,
          volume: c.volume
        }));
      } else {
        const basisOffset = liveQuote.price - rawLastClose;
        if (Math.abs(basisOffset) / liveQuote.price < 0.12) {
          candles = candles.map(c => ({
            time: c.time,
            open: Math.max(0.0000001, c.open + basisOffset),
            high: Math.max(0.0000001, c.high + basisOffset),
            low: Math.max(0.0000001, c.low + basisOffset),
            close: Math.max(0.0000001, c.close + basisOffset),
            volume: c.volume
          }));
        } else {
          const ratio = liveQuote.price / rawLastClose;
          candles = candles.map(c => ({
            time: c.time,
            open: c.open * ratio,
            high: c.high * ratio,
            low: c.low * ratio,
            close: c.close * ratio,
            volume: c.volume
          }));
        }
      }
      const active = candles[candles.length - 1];
      active.close = liveQuote.price;
      if (liveQuote.price > active.high) active.high = liveQuote.price;
      if (liveQuote.price < active.low) active.low = liveQuote.price;
    }
    const finalPrice = liveQuote && liveQuote.price > 0 ? liveQuote.price : candles[candles.length - 1].close;
    const prevClose = candles.length > 1 ? candles[candles.length - 2].close : candles[0].open;
    const changePct = liveQuote && Number.isFinite(liveQuote.changePct) && liveQuote.changePct !== 0
      ? liveQuote.changePct
      : (prevClose > 0 ? ((finalPrice - prevClose) / prevClose) * 100 : 0);
    return {
      source: liveQuote && liveQuote.source ? liveQuote.source : yhData.source,
      price: finalPrice,
      changePct,
      candles
    };
  }
  throw new Error(`Data candlestick real-time untuk ${s} sedang disinkronkan.`);
}
