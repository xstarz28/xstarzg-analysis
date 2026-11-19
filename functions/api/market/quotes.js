/* ================================================================================
   XSTARZG — BATCH REAL-TIME QUOTES ENDPOINT (/api/market/quotes)
   Satu request POST mengembalikan kuotasi live UNTUK BANYAK instrumen sekaligus
   (seperti watchlist TradingView):
   - Crypto pair USDT  -> Binance 24hr ticker (1 panggilan untuk semua pair).
   - Forex/Metals/IDX/US/Global Stocks/Komoditas/Indeks -> TradingView scanner
     batch (scanner.tradingview.com/global/scan) via ticker broker: OANDA,
     FOREXCOM, FX_IDC, IDX, NASDAQ, NYSE, AMEX, TVC, COMEX, NYMEX, CBOT, ICEUS,
     MYX, EURONEXT, SGX, HKEX, TSE, KRX, TADAWUL.
   - XAU/IDR -> komposit OANDA:XAUUSD x FX_IDC:USDIDR per gram (31.1034768).
   Body: { "symbols": ["BTC/USDT","XAU/USD","BBCA.JK", ...] } (maks 120)
   ================================================================================ */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
};

const US_EXCHANGE_MAP = {
  'SPY': 'AMEX:SPY', 'QQQ': 'NASDAQ:QQQ', 'DIA': 'AMEX:DIA', 'IWM': 'AMEX:IWM',
  'NVDA': 'NASDAQ:NVDA', 'AAPL': 'NASDAQ:AAPL', 'MSFT': 'NASDAQ:MSFT', 'AMZN': 'NASDAQ:AMZN',
  'META': 'NASDAQ:META', 'GOOGL': 'NASDAQ:GOOGL', 'TSLA': 'NASDAQ:TSLA', 'AMD': 'NASDAQ:AMD',
  'NFLX': 'NASDAQ:NFLX', 'AVGO': 'NASDAQ:AVGO', 'COIN': 'NASDAQ:COIN', 'MSTR': 'NASDAQ:MSTR',
  'PLTR': 'NASDAQ:PLTR', 'INTC': 'NASDAQ:INTC', 'ASML': 'NASDAQ:ASML',
  'JPM': 'NYSE:JPM', 'V': 'NYSE:V', 'MA': 'NYSE:MA', 'WMT': 'NYSE:WMT', 'DIS': 'NYSE:DIS',
  'XOM': 'NYSE:XOM', 'LLY': 'NYSE:LLY', 'BRK.B': 'NYSE:BRK.B', 'BRK-B': 'NYSE:BRK.B',
  'BABA': 'NYSE:BABA', 'TSM': 'NYSE:TSM', 'NVO': 'NYSE:NVO', 'SE': 'NYSE:SE'
};
const SPECIAL_TV_TICKERS = {
  'XAU/USD': ['OANDA:XAUUSD', 'FOREXCOM:XAUUSD', 'FX_IDC:XAUUSD'],
  'XAG/USD': ['OANDA:XAGUSD', 'FOREXCOM:XAGUSD', 'FX_IDC:XAGUSD'],
  'XPT/USD': ['OANDA:XPTUSD', 'FOREXCOM:XPTUSD'],
  'XPD/USD': ['OANDA:XPDUSD', 'FOREXCOM:XPDUSD'],
  'XCU/USD': ['OANDA:XCUUSD', 'COMEX:HG1!'],
  'HG/USD': ['COMEX:HG1!', 'OANDA:XCUUSD'],
  'NI/USD': ['TVC:NICKEL'],
  'SN/USD': ['TVC:TIN'],
  'AL/USD': ['TVC:ALUMINIUM'],
  'LI/USD': ['TVC:LITHIUM'],
  'WTI': ['TVC:USOIL', 'OANDA:WTICOUSD', 'NYMEX:CL1!'],
  'WTI/USD': ['TVC:USOIL', 'OANDA:WTICOUSD', 'NYMEX:CL1!'],
  'BRENT': ['TVC:UKOIL', 'OANDA:BCOUSD', 'NYMEX:BZ1!'],
  'BRENT/USD': ['TVC:UKOIL', 'OANDA:BCOUSD', 'NYMEX:BZ1!'],
  'NATGAS': ['NYMEX:NG1!', 'OANDA:NATGASUSD'],
  'NATGAS/USD': ['NYMEX:NG1!', 'OANDA:NATGASUSD'],
  'HEATOIL': ['NYMEX:HO1!'],
  'GASOLINE': ['NYMEX:RB1!'],
  'WHEAT': ['CBOT:ZW1!', 'OANDA:WHEATUSD'],
  'WHEAT/USD': ['OANDA:WHEATUSD', 'CBOT:ZW1!'],
  'CORN': ['CBOT:ZC1!', 'OANDA:CORNUSD'],
  'CORN/USD': ['OANDA:CORNUSD', 'CBOT:ZC1!'],
  'SOYBEAN': ['CBOT:ZS1!', 'OANDA:SOYBNUSD'],
  'SOYBEAN/USD': ['OANDA:SOYBNUSD', 'CBOT:ZS1!'],
  'COFFEE': ['ICEUS:KC1!'],
  'COCOA': ['ICEUS:CC1!'],
  'SUGAR': ['ICEUS:SB1!'],
  'COTTON': ['ICEUS:CT1!'],
  'CATTLE': ['CME:LE1!'],
  'LUMBER': ['CME:LBR1!'],
  'CPO': ['MYX:FCPO1!'],
  'COAL': ['TVC:COAL'],
  'IHSG': ['IDX:COMPOSITE'],
  'JP225': ['TVC:NI225'],
  'HK50': ['TVC:HSI'],
  'DE40': ['TVC:DAX'],
  'UK100': ['TVC:UKX'],
  '7203.T': ['TSE:7203'], '6758.T': ['TSE:6758'], '9984.T': ['TSE:9984'],
  '0700.HK': ['HKEX:700'], '1211.HK': ['HKEX:1211'],
  '005930.KS': ['KRX:005930'], 'MC.PA': ['EURONEXT:MC'],
  'D05.SI': ['SGX:D05'], '2222.SR': ['TADAWUL:2222']
};

function tickersForSymbol(symbol) {
  const s = (symbol || '').toUpperCase().trim();
  if (SPECIAL_TV_TICKERS[s]) return SPECIAL_TV_TICKERS[s];
  if (s.endsWith('.JK')) return ['IDX:' + s.replace('.JK', '')];
  if (US_EXCHANGE_MAP[s]) return [US_EXCHANGE_MAP[s]];
  if (s.includes('/USDT')) return ['BINANCE:' + s.replace('/', '')];
  if (s.includes('/')) {
    const clean = s.replace('/', '');
    return ['OANDA:' + clean, 'FOREXCOM:' + clean, 'FX_IDC:' + clean];
  }
  return ['NASDAQ:' + s, 'NYSE:' + s];
}

// Sumber real cadangan: Yahoo Finance (free, tanpa API key)
const YAHOO_SYMBOLS = {
  'XAU/USD': ['XAUUSD=X', 'GC=F'], 'XAG/USD': ['XAGUSD=X', 'SI=F'],
  'XPT/USD': ['XPTUSD=X', 'PL=F'], 'XPD/USD': ['PA=F'], 'XCU/USD': ['HG=F'], 'HG/USD': ['HG=F'],
  'IHSG': ['^JKSE'], 'JP225': ['^N225'], 'HK50': ['^HSI'], 'DE40': ['^GDAXI'], 'UK100': ['^FTSE'],
  'WTI': ['CL=F'], 'WTI/USD': ['CL=F'], 'BRENT': ['BZ=F'], 'BRENT/USD': ['BZ=F'],
  'NATGAS': ['NG=F'], 'NATGAS/USD': ['NG=F'], 'HEATOIL': ['HO=F'], 'GASOLINE': ['RB=F'],
  'WHEAT': ['ZW=F'], 'CORN': ['ZC=F'], 'SOYBEAN': ['ZS=F'], 'COFFEE': ['KC=F'],
  'COCOA': ['CC=F'], 'SUGAR': ['SB=F'], 'COTTON': ['CT=F'], 'CATTLE': ['LE=F'],
  'USD/IDR': ['USDIDR=X', 'IDR=X']
};
function yahooSymbolsFor(s) {
  if (YAHOO_SYMBOLS[s]) return YAHOO_SYMBOLS[s];
  if (s.endsWith('/USDT')) return [s.replace('/USDT', '-USD')];
  if (/\.(JK|T|HK|KS|PA|SI|SR)$/.test(s)) return [s];
  if (s.includes('/')) return [s.replace('/', '') + '=X'];
  return [s];
}
async function fetchYahooQuote(symbol) {
  for (const y of yahooSymbolsFor(symbol)) {
    try {
      const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(y) + '?interval=1m&range=1d', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (!res.ok) continue;
      const j = await res.json();
      const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      const price = meta ? Number(meta.regularMarketPrice) : 0;
      if (price > 0) {
        const prev = Number(meta.chartPreviousClose) || Number(meta.previousClose) || price;
        return { price, changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0, source: 'YAHOO:' + y };
      }
    } catch (e) {}
  }
  return null;
}

async function fetchBinanceAllTickers() {
  try {
    const res = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr');
    if (!res.ok) return null;
    const list = await res.json();
    if (!Array.isArray(list)) return null;
    const map = {};
    for (const it of list) {
      if (!it || !it.symbol) continue;
      map[it.symbol] = { price: Number(it.lastPrice) || 0, changePct: Number(it.priceChangePercent) || 0 };
    }
    return map;
  } catch (e) {
    return null;
  }
}

async function scanTradingView(tickers) {
  try {
    const res = await fetch('https://scanner.tradingview.com/global/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        symbols: { tickers: tickers, query: { types: [] } },
        columns: ['close', 'change']
      })
    });
    if (!res.ok) return {};
    const json = await res.json();
    const out = {};
    if (json && Array.isArray(json.data)) {
      for (const row of json.data) {
        if (row && row.s && Array.isArray(row.d)) {
          const price = Number(row.d[0]);
          if (Number.isFinite(price) && price > 0) {
            out[row.s] = { price, changePct: Number(row.d[1]) || 0 };
          }
        }
      }
    }
    return out;
  } catch (e) {
    return {};
  }
}

async function handleQuotes(symbols) {
  const uniq = [];
  const seen = {};
  for (const raw of symbols) {
    const s = String(raw || '').toUpperCase().trim();
    if (s && !seen[s] && uniq.length < 120) { seen[s] = true; uniq.push(s); }
  }
  const quotes = {};
  const jobs = [];
  // ---- 1. CRYPTO SPOT via Binance (1 panggilan untuk semua pair) ----
  const cryptoSyms = uniq.filter(s => s.endsWith('/USDT'));
  if (cryptoSyms.length) {
    jobs.push(fetchBinanceAllTickers().then(async map => {
      if (map) {
        for (const s of cryptoSyms) {
          const pair = s.replace('/', '');
          const hit = map[pair];
          if (hit && hit.price > 0) quotes[s] = { price: hit.price, changePct: hit.changePct, source: 'BINANCE:' + pair };
        }
      }
      // v2026.61: pair yang tidak listing di Binance (HYPE dll) -> tickers Bybit lalu OKX
      // (publik, tanpa API key), baru terakhir Yahoo — jauh lebih stabil untuk crypto.
      const missing = cryptoSyms.filter(s => !quotes[s]);
      await Promise.allSettled(missing.map(async (s) => {
        const pair = s.replace('/', '');
        try {
          const br = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=' + pair, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (br.ok) {
            const bj = await br.json();
            const row = bj && bj.result && bj.result.list && bj.result.list[0];
            if (row && Number(row.lastPrice) > 0) {
              quotes[s] = { price: Number(row.lastPrice), changePct: (Number(row.price24hPcnt) || 0) * 100, source: 'BYBIT:' + pair };
              return;
            }
          }
        } catch (e) {}
        try {
          const instId = s.replace('/', '-');
          const or = await fetch('https://www.okx.com/api/v5/market/ticker?instId=' + instId, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (or.ok) {
            const oj = await or.json();
            const row = oj && oj.data && oj.data[0];
            if (row && Number(row.last) > 0) {
              const o24 = Number(row.open24h);
              quotes[s] = { price: Number(row.last), changePct: o24 > 0 ? ((Number(row.last) - o24) / o24) * 100 : 0, source: 'OKX:' + instId };
              return;
            }
          }
        } catch (e) {}
        try {
          const bxSymbol = s.replace('/', '-');
          const bx = await fetch('https://open-api.bingx.com/openApi/swap/v2/quote/ticker?symbol=' + bxSymbol, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (bx.ok) {
            const bxj = await bx.json();
            const d = bxj && bxj.data;
            const lp = Number(d && (d.lastPrice || d.price));
            if (lp > 0) {
              const chg = Number(d.priceChangePercent) || 0;
              quotes[s] = { price: lp, changePct: chg, source: 'BINGX:' + bxSymbol };
              return;
            }
          }
        } catch (e) {}
        const y = await fetchYahooQuote(s);
        if (y && y.price > 0) quotes[s] = { price: y.price, changePct: y.changePct, source: y.source };
      }));
    }));
  }
  // ---- 2. SEMUA ASET LAIN via TradingView Scanner (batch) ----
  const otherSyms = uniq.filter(s => !s.endsWith('/USDT'));
  if (otherSyms.length) {
    const tickerList = [];
    const ownedExtra = ['OANDA:XAUUSD', 'FX_IDC:USDIDR']; // untuk komposit XAU/IDR
    for (const s of otherSyms) for (const t of tickersForSymbol(s)) tickerList.push(t);
    for (const t of ownedExtra) tickerList.push(t);
    const dedupTickers = Array.from(new Set(tickerList)).slice(0, 300);
    jobs.push((async () => {
      const chunks = [];
      for (let i = 0; i < dedupTickers.length; i += 120) chunks.push(dedupTickers.slice(i, i + 120));
      const merged = {};
      for (const ch of chunks) Object.assign(merged, await scanTradingView(ch));
      for (const s of otherSyms) {
        if (s === 'XAU/IDR') {
          const xau = merged['OANDA:XAUUSD'] || merged['FOREXCOM:XAUUSD'] || merged['FX_IDC:XAUUSD'];
          const idr = merged['FX_IDC:USDIDR'] || merged['OANDA:USDIDR'];
          if (xau && xau.price > 0 && idr && idr.price > 10000) {
            quotes[s] = {
              price: (xau.price * idr.price) / 31.1034768,
              changePct: xau.changePct,
              source: 'OANDA:XAUUSD x FX_IDC:USDIDR'
            };
          }
          continue;
        }
        for (const t of tickersForSymbol(s)) {
          const row = merged[t];
          if (row && row.price > 0) { quotes[s] = { price: row.price, changePct: row.changePct, source: t }; break; }
        }
      }
      // Simbol yang tidak ketemu di scanner -> coba Yahoo Finance (real, tanpa API key)
      const missing = otherSyms.filter(s => !quotes[s]);
      await Promise.allSettled(missing.map(async (s) => {
        if (s === 'XAU/IDR') {
          const [yx, yi] = await Promise.all([fetchYahooQuote('XAU/USD'), fetchYahooQuote('USD/IDR')]);
          if (yx && yx.price > 0 && yi && yi.price > 10000) {
            quotes[s] = { price: (yx.price * yi.price) / 31.1034768, changePct: yx.changePct, source: 'YAHOO:XAUUSD=X x USDIDR=X' };
          }
          return;
        }
        const y = await fetchYahooQuote(s);
        if (y && y.price > 0) quotes[s] = { price: y.price, changePct: y.changePct, source: y.source };
      }));
    })());
  }
  await Promise.allSettled(jobs);
  return quotes;
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const symbols = Array.isArray(body && body.symbols) ? body.symbols : [];
    if (!symbols.length) {
      return new Response(JSON.stringify({ ok: false, error: 'symbols[] kosong' }), { status: 400, headers: CORS_HEADERS });
    }
    const quotes = await handleQuotes(symbols);
    return new Response(JSON.stringify({ ok: true, count: Object.keys(quotes).length, timestamp: Date.now(), quotes }), { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message || 'Quotes error' }), { status: 500, headers: CORS_HEADERS });
  }
}
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const raw = url.searchParams.get('symbols') || 'XAU/USD,BTC/USDT';
  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean);
  try {
    const quotes = await handleQuotes(symbols);
    return new Response(JSON.stringify({ ok: true, count: Object.keys(quotes).length, timestamp: Date.now(), quotes }), { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message || 'Quotes error' }), { status: 500, headers: CORS_HEADERS });
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
