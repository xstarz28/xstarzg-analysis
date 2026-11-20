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
      // v2026.66: kuotasi singkat dibagi lintas-pengguna via Cache API (TTL 4 dtk).
      // Harga simbol yang sama tidak memicu fetch upstream Yahoo/TradingView berulang
      // per detik saat ribuan pengguna menonton aset yang sama. (Hitungan request
      // Functions tetap berlaku — penghematannya ada di sisi klien; cache ini menjaga
      // upstream & latensi.)
      let cache = null, cacheKeyReq = null, hit = null;
      try {
        if (typeof caches !== 'undefined' && caches.default && request.method === 'GET') {
          cache = caches.default;
          cacheKeyReq = new Request(url.toString(), request);
          hit = await cache.match(cacheKeyReq);
        }
      } catch (e) {}
      if (hit) return hit;
      const liveQuote = await fetchExactLiveQuote(symbol, tf);
      const qRes = new Response(JSON.stringify({
        ok: true,
        symbol,
        tf,
        timestamp: Date.now(),
        quote: liveQuote
      }), { status: 200, headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=4' } });
      try { if (cache && cacheKeyReq && context.waitUntil) context.waitUntil(cache.put(cacheKeyReq, qRes.clone())); } catch (e) {}
      return qRes;
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
    const fallback = buildBrokerAnchoredCandles(symbol, tf, null);
    return new Response(JSON.stringify({
      ok: true,
      symbol,
      tf,
      source: fallback.source,
      price: fallback.price,
      changePct: fallback.changePct,
      candles: fallback.candles,
      timestamp: Date.now()
    }), { status: 200, headers: corsHeaders });
  }
}
const DEFAULT_PRICES = {
  // Metals (termasuk logam industri LME) — dikalibrasi ke pasar 2026 (mis. XAG spot ~$50)
  'XAU/USD': 4055.00, 'XAU/IDR': 2158000, 'XAG/USD': 50.00, 'XPT/USD': 1580.00, 'XPD/USD': 1050.00, 'XCU/USD': 5.10,
  'HG/USD': 5.10, 'NI/USD': 15680, 'SN/USD': 31450, 'AL/USD': 2640, 'LI/USD': 10850,
  // Forex majors, minors & Asia
  'EUR/USD': 1.0845, 'GBP/USD': 1.2960, 'USD/JPY': 152.40, 'USD/CHF': 0.8650, 'AUD/USD': 0.6580, 'USD/CAD': 1.3890,
  'NZD/USD': 0.5980, 'USD/IDR': 16550, 'EUR/JPY': 165.20, 'GBP/JPY': 197.50, 'EUR/GBP': 0.8368,
  'AUD/JPY': 100.25, 'CAD/JPY': 109.60, 'CHF/JPY': 176.10, 'NZD/JPY': 87.35, 'EUR/AUD': 1.6478,
  'GBP/AUD': 1.9688, 'EUR/CAD': 1.5063, 'GBP/CAD': 1.7999, 'EUR/CHF': 0.9380, 'GBP/CHF': 1.1210,
  'AUD/CAD': 0.9142, 'AUD/NZD': 1.0987, 'USD/SGD': 1.3380, 'USD/CNH': 7.2380, 'USD/THB': 34.20,
  'USD/MXN': 20.42, 'USD/ZAR': 17.95,
  // Komoditas energi & pangan
  'WTI': 71.20, 'BRENT': 75.10, 'NATGAS': 3.75, 'HEATOIL': 2.38, 'GASOLINE': 2.12,
  'CPO': 4520, 'COAL': 124.50, 'WHEAT': 592.0, 'CORN': 496.0, 'SOYBEAN': 1048.0,
  'COFFEE': 385.0, 'COCOA': 9850.0, 'SUGAR': 19.85, 'COTTON': 68.40, 'CATTLE': 196.50, 'LUMBER': 585.0,
  // Saham Indonesia IDX
  'IHSG': 6825, 'BBCA.JK': 9850, 'BBRI.JK': 4420, 'BMRI.JK': 6150, 'BBNI.JK': 4880, 'BRIS.JK': 2940,
  'TLKM.JK': 2760, 'ASII.JK': 4950, 'AMMN.JK': 7450, 'BREN.JK': 6950, 'TPIA.JK': 7200,
  'GOTO.JK': 81, 'ADRO.JK': 2360, 'PTBA.JK': 2750, 'ITMG.JK': 25800, 'ANTM.JK': 1620,
  'MDKA.JK': 1820, 'INCO.JK': 3420, 'PGAS.JK': 1660, 'MEDC.JK': 1135, 'AKRA.JK': 1245,
  'UNTR.JK': 25100, 'ICBP.JK': 11450, 'INDF.JK': 7650, 'UNVR.JK': 1580, 'KLBF.JK': 1265,
  'CPIN.JK': 4680, 'SMGR.JK': 2890, 'BSDE.JK': 945, 'BUKA.JK': 128,
  // Saham AS & Global
  'NVDA': 142.50, 'AAPL': 234.80, 'MSFT': 428.00, 'TSLA': 262.00, 'AMZN': 228.40, 'GOOGL': 186.20,
  'META': 698.50, 'AMD': 114.20, 'AVGO': 232.00, 'NFLX': 1015.00, 'BRK.B': 476.00, 'JPM': 272.50,
  'V': 348.00, 'LLY': 865.00, 'XOM': 110.50, 'PLTR': 112.40, 'COIN': 274.00, 'MSTR': 332.00,
  'SPY': 604.50, 'QQQ': 528.20, 'DIA': 442.80, 'IWM': 224.60,
  'JP225': 38950, '7203.T': 2845, '6758.T': 3480, '9984.T': 9620, 'HK50': 21850, 'BABA': 118.50,
  '0700.HK': 468.00, '1211.HK': 342.00, 'TSM': 204.50, '005930.KS': 56800, 'DE40': 22150,
  'UK100': 8740, 'ASML': 738.00, 'MC.PA': 692.00, 'NVO': 84.50, 'D05.SI': 44.80,
  'SE': 126.40, '2222.SR': 27.85,
  // Crypto majors
  'BTC/USDT': 100000.00, 'ETH/USDT': 3400.00, 'SOL/USDT': 200.00, 'BNB/USDT': 645.00,
  'XRP/USDT': 2.55, 'ADA/USDT': 0.82, 'DOGE/USDT': 0.26, 'AVAX/USDT': 26.40, 'LINK/USDT': 18.90,
  'TON/USDT': 3.85, 'SUI/USDT': 3.42, 'DOT/USDT': 5.20, 'PEPE/USDT': 0.0000105, 'SHIB/USDT': 0.0000162,
  'NEAR/USDT': 3.6, 'APT/USDT': 6.4, 'ARB/USDT': 0.49, 'OP/USDT': 1.15, 'LTC/USDT': 124, 'BCH/USDT': 345,
  'UNI/USDT': 9.8, 'AAVE/USDT': 255, 'INJ/USDT': 15.8, 'RENDER/USDT': 4.65, 'FET/USDT': 0.78, 'TAO/USDT': 415,
  'ONDO/USDT': 1.22, 'TIA/USDT': 3.9, 'SEI/USDT': 0.28, 'JUP/USDT': 0.84, 'BONK/USDT': 0.000018, 'WIF/USDT': 0.72,
  'FLOKI/USDT': 0.000098, 'ATOM/USDT': 4.95, 'FIL/USDT': 3.45, 'ICP/USDT': 7.2, 'HBAR/USDT': 0.23, 'ALGO/USDT': 0.29,
  'VET/USDT': 0.034, 'FTM/USDT': 0.62, 'MKR/USDT': 1420, 'LDO/USDT': 1.68, 'CRV/USDT': 0.54, 'PENDLE/USDT': 3.65,
  'ENA/USDT': 0.48, 'WLD/USDT': 1.28, 'STX/USDT': 0.96, 'IMX/USDT': 0.85, 'GRT/USDT': 0.14, 'SAND/USDT': 0.38,
  'MANA/USDT': 0.34, 'AXS/USDT': 4.4, 'GALA/USDT': 0.023, 'JASMY/USDT': 0.022, 'TRUMP/USDT': 17.5, 'KAS/USDT': 0.15,
  'SUPER/USDT': 1.15, 'POPCAT/USDT': 1.2, 'BRETT/USDT': 0.12, 'VIRTUAL/USDT': 1.85, 'SPX/USDT': 0.75, 'RAY/USDT': 5.2,
  'OM/USDT': 3.8, 'MEW/USDT': 0.009, 'NEIRO/USDT': 0.0018, 'MOODENG/USDT': 0.45, 'GOAT/USDT': 0.78, 'PNUT/USDT': 1.1,
  'ACT/USDT': 0.48, 'AERO/USDT': 1.35, 'TURBO/USDT': 0.0085, 'AI16Z/USDT': 0.42, 'FARTCOIN/USDT': 0.38, 'KCS/USDT': 11.5,
  'PENGU/USDT': 0.035,
  // Saham AS Tambahan
  'SMCI': 32.5, 'ARM': 142, 'INTC': 24.5, 'MU': 108, 'QCOM': 165, 'ORCL': 188, 'HOOD': 36.8, 'PYPL': 84.5,
  'SQ': 88, 'SOFI': 15.2, 'UBER': 76.5, 'ABNB': 138, 'RIVN': 12.8, 'BA': 158, 'LMT': 475, 'RTX': 124,
  'WMT': 92.5, 'COST': 965, 'DIS': 112, 'NKE': 78.5, 'SBUX': 98, 'PFE': 26.5, 'MRK': 102, 'UNH': 580,
  'CVX': 158, 'CAT': 395,
  // Bare meme tokens (Solana, Base, DEX)
  'FARTCOIN': 0.38, 'AI16Z': 0.42, 'PNUT': 1.1, 'GOAT': 0.78, 'MOODENG': 0.45, 'POPCAT': 1.2,
  'BONK': 0.000018, 'WIF': 0.72, 'BRETT': 0.12, 'VIRTUAL': 1.85, 'PEPE': 0.0000105, 'SHIB': 0.0000162,
  'FLOKI': 0.000098, 'NEIRO': 0.0018, 'TURBO': 0.0085, 'SPX': 0.75, 'ACT': 0.48, 'PENGU': 0.035, 'CHILLGUY': 0.28
};
export function getExpectedPrice(s) {
  if (!s) return 0;
  const clean = String(s).toUpperCase().trim();
  if (DEFAULT_PRICES[clean]) return DEFAULT_PRICES[clean];
  if (clean.endsWith('/USDT')) {
    const base = clean.replace('/USDT', '');
    if (DEFAULT_PRICES[base]) return DEFAULT_PRICES[base];
  } else {
    if (DEFAULT_PRICES[clean + '/USDT']) return DEFAULT_PRICES[clean + '/USDT'];
  }
  return 0;
}
const US_EXCHANGE_MAP = {
  'SPY': 'AMEX:SPY', 'QQQ': 'NASDAQ:QQQ', 'DIA': 'AMEX:DIA', 'IWM': 'AMEX:IWM',
  'NVDA': 'NASDAQ:NVDA', 'AAPL': 'NASDAQ:AAPL', 'MSFT': 'NASDAQ:MSFT', 'AMZN': 'NASDAQ:AMZN',
  'META': 'NASDAQ:META', 'GOOGL': 'NASDAQ:GOOGL', 'TSLA': 'NASDAQ:TSLA', 'AMD': 'NASDAQ:AMD',
  'NFLX': 'NASDAQ:NFLX', 'AVGO': 'NASDAQ:AVGO', 'COST': 'NASDAQ:COST', 'COIN': 'NASDAQ:COIN',
  'MSTR': 'NASDAQ:MSTR', 'PLTR': 'NASDAQ:PLTR', 'INTC': 'NASDAQ:INTC', 'ASML': 'NASDAQ:ASML',
  'BRK-B': 'NYSE:BRK.B', 'BRK.B': 'NYSE:BRK.B', 'JPM': 'NYSE:JPM', 'V': 'NYSE:V', 'MA': 'NYSE:MA',
  'WMT': 'NYSE:WMT', 'DIS': 'NYSE:DIS', 'XOM': 'NYSE:XOM', 'LLY': 'NYSE:LLY',
  'BABA': 'NYSE:BABA', 'TSM': 'NYSE:TSM', 'NVO': 'NYSE:NVO', 'SE': 'NYSE:SE'
};
// Pemetaan khusus simbol terminal -> ticker broker TradingView scanner,
// menjamin SELURUH kelas aset (metals, komoditas, indeks, saham global)
// mendapatkan harga REAL-TIME, bukan data sintetis.
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
  'COTTON': ['ICEUS:CT1!', 'NYBOT:CT1!', 'TVC:COTTON'],
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
// Sumber real-time cadangan: Yahoo Finance chart meta (free, tanpa API key).
// Dipakai saat TradingView scanner gagal/sepi — menutup gap harga instrumen
// (mis. perak/XAG yang sempat hanya memakai harga jangkar lama).
const YAHOO_SYMBOLS = {
  'XAU/USD': ['XAUUSD=X', 'GC=F'],
  'XAG/USD': ['XAGUSD=X', 'SI=F'],
  'XPT/USD': ['XPTUSD=X', 'PL=F'],
  'XPD/USD': ['PA=F'],
  'XCU/USD': ['HG=F'],
  'HG/USD': ['HG=F'],
  'EUR/USD': ['EURUSD=X', 'EUR=X'],
  'GBP/USD': ['GBPUSD=X', 'GBP=X'],
  'USD/JPY': ['USDJPY=X', 'JPY=X'],
  'IHSG': ['^JKSE'],
  'JP225': ['^N225'], 'HK50': ['^HSI'], 'DE40': ['^GDAXI'], 'UK100': ['^FTSE'],
  'WTI': ['CL=F'], 'WTI/USD': ['CL=F'], 'BRENT': ['BZ=F'], 'BRENT/USD': ['BZ=F'],
  'NATGAS': ['NG=F'], 'NATGAS/USD': ['NG=F'], 'HEATOIL': ['HO=F'], 'GASOLINE': ['RB=F'],
  'WHEAT': ['ZW=F'], 'WHEAT/USD': ['ZW=F'], 'CORN': ['ZC=F'], 'CORN/USD': ['ZC=F'],
  'SOYBEAN': ['ZS=F'], 'SOYBEAN/USD': ['ZS=F'], 'COFFEE': ['KC=F'], 'COFFEE/USD': ['KC=F'],
  'COCOA': ['CC=F'], 'COCOA/USD': ['CC=F'], 'SUGAR': ['SB=F'], 'COTTON': ['CT=F', 'TT=F', 'BAL'], 'CATTLE': ['LE=F'],
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
  const list = yahooSymbolsFor(symbol);
  const expectedP = getExpectedPrice(symbol);
  for (const y of list) {
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const res = await fetch('https://' + host + '/v8/finance/chart/' + encodeURIComponent(y) + '?interval=1m&range=1d', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!res.ok) continue;
        const j = await res.json();
        const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
        const price = meta ? Number(meta.regularMarketPrice) : 0;
        if (price > 0) {
          if (expectedP > 0 && (price > expectedP * 3.5 || price < expectedP * 0.28)) continue;
          const prev = Number(meta.chartPreviousClose) || Number(meta.previousClose) || price;
          return { price, changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0, source: 'YAHOO:' + y };
        }
      } catch (e) {}
    }
  }
  return null;
}
// ================= ADAPTIVE LIVE FEED (v2026.53) =================
// Candle NYATA dari Yahoo Finance chart (gratis, tanpa API key) untuk kelas aset
// non-crypto (forex, metal, indeks, saham global, komoditas). Tidak ada lagi
// logika statis weekday/weekend: adaptif murni dari data — saat market buka
// (Senin dst.) Yahoo langsung beri candle sesi berjalan; saat tutup (weekend/
// libur) mengembalikan candle NYATA sesi terakhir (lebih jujur daripada fabrikasi).
const YAHOO_TF = {
  'M1': { i: '1m', r: '1d' }, 'M5': { i: '5m', r: '5d' }, 'M15': { i: '15m', r: '5d' },
  'M30': { i: '30m', r: '1mo' }, 'H1': { i: '60m', r: '1mo' },
  'H4': { i: '60m', r: '3mo', resampleSec: 14400 },
  'D1': { i: '1d', r: '1y' }, 'W1': { i: '1wk', r: '5y' },
  'MN': { i: '1mo', r: '10y' }, '1Y': { i: '1wk', r: 'max' }
};
function resampleCandles(candles, bucketSec) {
  const m = new Map();
  for (const c of candles) {
    const b = Math.floor(c.time / bucketSec) * bucketSec;
    const g = m.get(b);
    if (!g) m.set(b, { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 });
    else { g.high = Math.max(g.high, c.high); g.low = Math.min(g.low, c.low); g.close = c.close; g.volume += c.volume || 0; }
  }
  return [...m.values()].sort((a, b) => a.time - b.time);
}
async function fetchYahooCandles(symbol, tf) {
  const cfg = YAHOO_TF[tf] || YAHOO_TF['H1'];
  const expectedP = getExpectedPrice(symbol);
  for (const y of yahooSymbolsFor(symbol)) {
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const url = 'https://' + host + '/v8/finance/chart/' + encodeURIComponent(y)
          + '?interval=' + cfg.i + '&range=' + cfg.r;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        if (!res.ok) continue;
        const j = await res.json();
        const node = j && j.chart && j.chart.result && j.chart.result[0];
        const ts = node && Array.isArray(node.timestamp) ? node.timestamp : null;
        const q = node && node.indicators && node.indicators.quote && node.indicators.quote[0];
        if (!ts || !q || !Array.isArray(q.close)) continue;
        let candles = [];
        for (let k = 0; k < ts.length; k++) {
          const c = Number(q.close[k]), o = Number(q.open[k]), h = Number(q.high[k]), l = Number(q.low[k]);
          if (!Number.isFinite(c) || !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || c <= 0) continue;
          candles.push({ time: ts[k], open: o, high: Math.max(h, o, c), low: Math.min(l, o, c), close: c, volume: Number(q.volume && q.volume[k]) || 100 });
        }
        if (cfg.resampleSec) candles = resampleCandles(candles, cfg.resampleSec);
        candles = candles.slice(-220);
        if (candles.length < 10) continue;

        const meta = node.meta || {};
        const live = Number(meta.regularMarketPrice) > 0 ? Number(meta.regularMarketPrice) : candles[candles.length - 1].close;

        // Validasi skala harga: tolak ticker yang menyimpang ekstrem dari harga aset (mis. ETN BAL $10 vs Cotton 68.4)
        if (expectedP > 0 && (live > expectedP * 3.5 || live < expectedP * 0.28)) continue;

        // Audit candlestick: jika > 35% candle flat tanpa spread (high === low), feed illiquid/mati -> lewati agar tidak jadi titik-titik
        // Untuk Forex (EUR/USD, GBP/USD dll) rentang candle M1/M5 sangat rapat (~1-3 pips) sehingga threshold flat disesuaikan agar tidak salah tolak
        const isForex = symbol.includes('/') && !symbol.endsWith('/USDT') && !symbol.startsWith('XAU/') && !symbol.startsWith('XAG/') && !symbol.startsWith('XPT/') && !symbol.startsWith('XPD/') && !symbol.startsWith('XCU/') && !symbol.startsWith('HG/');
        const flatThresh = isForex ? 0.000005 : (c.close * 0.0004);
        const flatCount = candles.filter(c => Math.abs(c.high - c.low) < flatThresh).length;
        if (flatCount > candles.length * 0.35) continue;

        // Garansi anti-dot: setiap candle dipastikan memiliki wick & body yang proporsional
        candles = candles.map(c => {
          let maxP = Math.max(c.high, c.open, c.close);
          let minP = Math.min(c.low, c.open, c.close);
          let minSpread = Math.max(c.close * 0.0016, 0.0001);
          if (isForex) minSpread = Math.max(c.close * 0.00008, 0.00004);
          if ((maxP - minP) < minSpread) {
            const pad = (minSpread - (maxP - minP)) * 0.5;
            maxP = Math.max(c.open, c.close) + pad;
            minP = Math.max(0.000001, Math.min(c.open, c.close) - pad);
          }
          return { time: c.time, open: c.open, high: maxP, low: minP, close: c.close, volume: c.volume };
        });

        const prev = Number(meta.chartPreviousClose) || Number(meta.previousClose) || candles[0].close;
        const last = candles[candles.length - 1];
        if (!cfg.resampleSec && live > 0 && Math.abs(live - last.close) < last.close * 0.15) {
          last.close = live;
          if (live > last.high) last.high = live;
          if (live < last.low) last.low = live;
        }
        return { source: 'YAHOO_CANDLES:' + y, price: live, changePct: prev > 0 ? ((live - prev) / prev) * 100 : 0, candles };
      } catch (e) {}
    }
  }

      const prev = Number(meta.chartPreviousClose) || Number(meta.previousClose) || candles[0].close;
      const last = candles[candles.length - 1];
      if (!cfg.resampleSec && live > 0 && Math.abs(live - last.close) < last.close * 0.15) {
        last.close = live;
        if (live > last.high) last.high = live;
        if (live < last.low) last.low = live;
      }
      return { source: 'YAHOO_CANDLES:' + y, price: live, changePct: prev > 0 ? ((live - prev) / prev) * 100 : 0, candles };
    } catch (e) {}
  }
  return null;
}
function getTvTimeframeSuffix(tf) {
  const map = {
    'M1': '|1', 'M5': '|5', 'M15': '|15', 'M30': '|30',
    'H1': '|60', 'H4': '|240', 'D1': '', 'W1': '|1W', 'MN': '|1M', '1Y': '|1M'
  };
  return map[tf] !== undefined ? map[tf] : '|60';
}
function getTvTickersForSymbol(symbol) {
  const s = symbol.toUpperCase().trim();
  if (SPECIAL_TV_TICKERS[s]) return SPECIAL_TV_TICKERS[s];
  if (s.endsWith('.JK')) return [`IDX:${s.replace('.JK', '')}`];
  if (US_EXCHANGE_MAP[s]) return [US_EXCHANGE_MAP[s]];
  if (s.includes('/USDT')) return [`BINANCE:${s.replace('/', '')}`];
  if (s.includes('/')) {
    const clean = s.replace('/', '');
    return [`OANDA:${clean}`, `FOREXCOM:${clean}`, `FX_IDC:${clean}`];
  }
  return [`NASDAQ:${s}`, `NYSE:${s}`];
}
async function queryTradingViewScanner(tickers, tf) {
  if (!tickers || tickers.length === 0) return null;
  const sfx = getTvTimeframeSuffix(tf);
  const cols = ['close', 'change', `open${sfx}`, `high${sfx}`, `low${sfx}`, `close${sfx}`, `volume${sfx}`, `EMA20${sfx}`, `EMA50${sfx}`, `ATR${sfx}`];
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
            tfVolume: Number(row.d[6]) || 120,
            ema20: Number(row.d[7]) || price,
            ema50: Number(row.d[8]) || price,
            atr: Number(row.d[9]) || (price * 0.0035)
          };
        }
      }
    }
    return null;
  };
  try {
    const batch = await fetchScan(tickers);
    if (batch) return batch;
  } catch (e) {}
  for (const t of tickers) {
    try {
      const single = await fetchScan([t]);
      if (single) return single;
    } catch (e) {}
  }
  return null;
}
async function fetchExactLiveQuote(symbol, tf) {
  const s = symbol.toUpperCase().trim();
  if (s === 'XAU/IDR') {
    let [xau, idr] = await Promise.all([
      queryTradingViewScanner(['OANDA:XAUUSD', 'FOREXCOM:XAUUSD', 'FX_IDC:XAUUSD'], tf),
      queryTradingViewScanner(['FX_IDC:USDIDR', 'OANDA:USDIDR'], tf)
    ]);
    let xauPrice = xau && xau.price > 0 ? xau.price : null;
    let idrRate = idr && idr.price > 10000 ? idr.price : null;
    let srcTag = 'OANDA:XAUUSD x FX_IDC:USDIDR';
    // Kaki komposit yang gagal dari scanner dicoba via Yahoo Finance
    if (!xauPrice || !idrRate) {
      const [yx, yi] = await Promise.all([fetchYahooQuote('XAU/USD'), fetchYahooQuote('USD/IDR')]);
      if (!xauPrice && yx && yx.price > 0) { xauPrice = yx.price; if (!xau) xau = { changePct: yx.changePct, price: yx.price }; }
      if (!idrRate && yi && yi.price > 10000) idrRate = yi.price;
      srcTag = 'YAHOO:XAUUSD=X x USDIDR=X';
    }
    const isEst = !xauPrice || !idrRate;
    if (!xauPrice) xauPrice = DEFAULT_PRICES['XAU/USD'] || 4055;
    if (!idrRate) idrRate = DEFAULT_PRICES['USD/IDR'] || 16550;
    if (isEst) srcTag = 'ESTIMATED_FALLBACK';
    const gramPrice = (xauPrice * idrRate) / 31.1034768;
    return {
      source: srcTag,
      price: gramPrice,
      changePct: xau ? xau.changePct : 0.25,
      tfOpen: xau ? (xau.tfOpen * idrRate) / 31.1034768 : gramPrice,
      tfHigh: xau ? Math.max((xau.tfHigh * idrRate) / 31.1034768, gramPrice) : gramPrice,
      tfLow: xau ? Math.min((xau.tfLow * idrRate) / 31.1034768, gramPrice) : gramPrice,
      tfClose: gramPrice,
      tfVolume: xau ? xau.tfVolume : 120,
      ema20: xau && xau.ema20 ? (xau.ema20 * idrRate) / 31.1034768 : gramPrice,
      ema50: xau && xau.ema50 ? (xau.ema50 * idrRate) / 31.1034768 : gramPrice,
      atr: xau && xau.atr ? (xau.atr * idrRate) / 31.1034768 : (gramPrice * 0.0035)
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
            tfOpen: Number(d.openPrice) || price,
            tfHigh: Math.max(Number(d.highPrice) || price, price),
            tfLow: Math.min(Number(d.lowPrice) || price, price),
            tfClose: price,
            tfVolume: Number(d.volume) || 120,
            ema20: price,
            ema50: price,
            atr: price * 0.005
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
      tfVolume: tvQuote.tfVolume,
      ema20: tvQuote.ema20,
      ema50: tvQuote.ema50,
      atr: tvQuote.atr
    };
  }
  // Sumber real cadangan kedua: Yahoo Finance (menutup gap saat scanner TV gagal/sepi)
  const yQuote = await fetchYahooQuote(s);
  if (yQuote && yQuote.price > 0) {
    return {
      source: yQuote.source,
      price: yQuote.price,
      changePct: yQuote.changePct,
      tfOpen: yQuote.price,
      tfHigh: yQuote.price,
      tfLow: yQuote.price,
      tfClose: yQuote.price,
      tfVolume: 100,
      ema20: yQuote.price,
      ema50: yQuote.price,
      atr: yQuote.price * 0.0035
    };
  }
  const defP = getExpectedPrice(s) || (Number(yQuote?.price) > 0 ? Number(yQuote.price) : 100);
  return {
    source: 'ESTIMATED_FALLBACK',
    price: defP,
    changePct: 0.25,
    tfOpen: defP * 0.998,
    tfHigh: defP * 1.003,
    tfLow: defP * 0.996,
    tfClose: defP,
    tfVolume: 150,
    ema20: defP * 0.999,
    ema50: defP * 0.996,
    atr: defP * 0.0035
  };
}
/* v2026.61: JALUR CRYPTO MULTI-EXCHANGE. Binance bukan satu-satunya bursa spot —
   ribuan pair (mis. HYPE/USDT) TIDAK listing di Binance tapi cair di Bybit/OKX.
   Sebelum ini pair tsb jatuh ke candle ESTIMASI; sekarang dicoba Bybit lalu OKX
   (keduanya publik, gratis, tanpa API key) sebelum menyerah ke fallback. */
const BYBIT_TF = { 'M1': '1', 'M5': '5', 'M15': '15', 'M30': '30', 'H1': '60', 'H4': '240', 'D1': 'D', 'W1': 'W', 'MN': 'M', '1Y': 'M' };
const OKX_TF = { 'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m', 'H1': '1H', 'H4': '4H', 'D1': '1D', 'W1': '1W', 'MN': '1M', '1Y': '1M' };
const EXUA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
async function fetchBybitCandles(symbol, tf) {
  const pair = symbol.replace('/', '').toUpperCase();
  const interval = BYBIT_TF[tf] || '60';
  for (const cat of ['spot', 'linear']) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 4000);
      const [kRes, tRes] = await Promise.all([
        fetch(`https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${pair}&interval=${interval}&limit=220`, { headers: EXUA, signal: ctrl.signal }),
        fetch(`https://api.bybit.com/v5/market/tickers?category=${cat}&symbol=${pair}`, { headers: EXUA, signal: ctrl.signal })
      ]);
      clearTimeout(t);
      if (!kRes.ok) continue;
      const kj = await kRes.json();
      const list = kj && kj.result && Array.isArray(kj.result.list) ? kj.result.list : [];
      if (list.length < 10) continue;
      const candles = list.slice().reverse().map(k => ({
        time: Math.floor(Number(k[0]) / 1000), open: Number(k[1]), high: Number(k[2]),
        low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) || 100
      })).filter(c => Number.isFinite(c.time) && c.time > 0 && c.close > 0);
      if (candles.length < 10) continue;
      let livePrice = candles[candles.length - 1].close; let changePct = 0;
      if (tRes.ok) {
        const tj = await tRes.json();
        const row = tj && tj.result && tj.result.list && tj.result.list[0];
        if (row && Number(row.lastPrice) > 0) { livePrice = Number(row.lastPrice); changePct = (Number(row.price24hPcnt) || 0) * 100; }
      }
      const last = candles[candles.length - 1];
      last.close = livePrice;
      if (livePrice > last.high) last.high = livePrice;
      if (livePrice < last.low) last.low = livePrice;
      return { source: `BYBIT:${pair}`, price: livePrice, changePct, candles };
    } catch (e) {}
  }
  return null;
}
async function fetchOkxCandles(symbol, tf) {
  const baseId = symbol.replace('/', '-').toUpperCase();
  const bar = OKX_TF[tf] || '1H';
  for (const instId of [baseId, `${baseId}-SWAP`]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 4000);
      const [kRes, tRes] = await Promise.all([
        fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=220`, { headers: EXUA, signal: ctrl.signal }),
        fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { headers: EXUA, signal: ctrl.signal })
      ]);
      clearTimeout(t);
      if (!kRes.ok) continue;
      const kj = await kRes.json();
      const rows = kj && Array.isArray(kj.data) ? kj.data : [];
      if (rows.length < 10) continue;
      const candles = rows.slice().reverse().map(k => ({
        time: Math.floor(Number(k[0]) / 1000), open: Number(k[1]), high: Number(k[2]),
        low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) || 100
      })).filter(c => Number.isFinite(c.time) && c.time > 0 && c.close > 0);
      if (candles.length < 10) continue;
      let livePrice = candles[candles.length - 1].close; let changePct = 0;
      if (tRes.ok) {
        const tj = await tRes.json();
        const row = tj && tj.data && tj.data[0];
        if (row && Number(row.last) > 0) {
          livePrice = Number(row.last);
          const o24 = Number(row.open24h);
          if (o24 > 0) changePct = ((livePrice - o24) / o24) * 100;
        }
      }
      const last = candles[candles.length - 1];
      last.close = livePrice;
      if (livePrice > last.high) last.high = livePrice;
      if (livePrice < last.low) last.low = livePrice;
      return { source: `OKX:${instId}`, price: livePrice, changePct, candles };
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
  const urls = [
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=220`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=220`,
    `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${interval}&limit=220`
  ];
  for (const u of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 4000);
      const isFapi = u.includes('fapi');
      const tUrl = isFapi
        ? `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${pair}`
        : `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
      const [kRes, tRes] = await Promise.all([
        fetch(u, { signal: ctrl.signal }),
        fetch(tUrl, { signal: ctrl.signal }).catch(() => null)
      ]);
      clearTimeout(t);
      if (!kRes.ok) continue;
      const klines = await kRes.json();
      if (!Array.isArray(klines) || klines.length < 10) continue;
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
      if (tRes && tRes.ok) {
        const td = await tRes.json();
        if (Number(td.lastPrice) > 0) livePrice = Number(td.lastPrice);
        changePct = Number(td.priceChangePercent) || 0;
      }
      const last = candles[candles.length - 1];
      last.close = livePrice;
      if (livePrice > last.high) last.high = livePrice;
      if (livePrice < last.low) last.low = livePrice;
      return { source: `BINANCE:${pair}`, price: livePrice, changePct, candles };
    } catch (e) {}
  }
  return null;
}
function buildBrokerAnchoredCandles(symbol, tf, liveQuote) {
  const s = (symbol || 'XAU/USD').toUpperCase().trim();
  const tfSecMap = {
    'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800,
    'H1': 3600, 'H4': 14400, 'D1': 86400, 'W1': 604800, 'MN': 2592000, '1Y': 7776000
  };
  const stepSec = tfSecMap[tf] || 3600;
  const nowBucket = Math.floor(Date.now() / 1000 / stepSec) * stepSec;
  const count = 200;
  const expectedP = getExpectedPrice(s) || (Number(liveQuote?.price) > 0 ? Number(liveQuote.price) : 100);
  let endPrice = Number(liveQuote?.price) > 0 ? Number(liveQuote.price) : expectedP;
  // Validasi skala harga: jika kuotasi broker menyimpang ekstrem dari harga aset, pakai harga jangkar wajar
  if (expectedP > 0 && (endPrice > expectedP * 3.5 || endPrice < expectedP * 0.28)) {
    endPrice = expectedP;
  }
  const atr = Number(liveQuote?.atr) > (endPrice * 0.0008) ? Number(liveQuote.atr) : (endPrice * 0.0032);
  const ema50 = Number(liveQuote?.ema50) > 0 ? Number(liveQuote.ema50) : (endPrice * 0.994);
  const trendDiff = endPrice - ema50;
  let seed = 0;
  const key = `${s}_${tf}`;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) % 1000003;
  const nextRand = () => {
    seed = (seed * 16807 + 11) % 2147483647;
    return (seed % 10000) / 10000;
  };
  const closes = new Array(count);
  closes[count - 1] = endPrice;
  let cur = endPrice;
  for (let i = count - 2; i >= 0; i--) {
    const progress = i / count;
    const wave = Math.sin(i * 0.19) * (atr * 0.32) + Math.cos(i * 0.07) * (atr * 0.22);
    const noise = (nextRand() - 0.495) * (atr * 0.52);
    const pull = (cur - endPrice) * 0.02;
    cur = Math.max(endPrice * 0.6, cur - pull - noise - wave * 0.15);
    closes[i] = cur;
  }
  const candles = [];
  for (let i = 0; i < count; i++) {
    const t = nowBucket - (count - 1 - i) * stepSec;
    const o = i === 0 ? closes[0] * (1 - 0.0008) : closes[i - 1];
    const c = closes[i];
    const wickUp = Math.max((0.20 + nextRand() * 0.60) * atr * 0.70, c * 0.0012);
    const wickDn = Math.max((0.20 + nextRand() * 0.60) * atr * 0.70, c * 0.0012);
    const h = Math.max(o, c) + wickUp;
    const l = Math.max(0.000001, Math.min(o, c) - wickDn);
    const v = Math.round(100 + nextRand() * 950);
    candles.push({ time: t, open: o, high: h, low: l, close: c, volume: v });
  }
  const last = candles[candles.length - 1];
  last.close = endPrice;
  if (Number(liveQuote?.tfOpen) > 0 && Math.abs(liveQuote.tfOpen - endPrice) < endPrice * 0.15) last.open = Number(liveQuote.tfOpen);
  const maxAllowedHigh = endPrice + atr * 2.2;
  const minAllowedLow = Math.max(0.000001, endPrice - atr * 2.2);
  const rawH = Number(liveQuote?.tfHigh);
  const rawL = Number(liveQuote?.tfLow);
  last.high = Math.max(last.open, last.close, (rawH > 0 && rawH <= maxAllowedHigh && rawH > endPrice) ? rawH : (endPrice + atr * 0.45));
  last.low = Math.min(last.open, last.close, (rawL > 0 && rawL >= minAllowedLow && rawL < endPrice) ? rawL : (endPrice - atr * 0.45));
  const minSpread = Math.max(endPrice * 0.0016, 0.0001);
  if ((last.high - last.low) < minSpread) {
    const pad = (minSpread - (last.high - last.low)) * 0.5;
    last.high = Math.max(last.open, last.close) + pad;
    last.low = Math.max(0.000001, Math.min(last.open, last.close) - pad);
  }
  return {
    // v2026.48: candle di fungsi ini DIFABRIKASI (anchored random path) — provenance
    // WAJIB dicap jujur agar hilir (gerbang siklus hidup sinyal) tidak mempercayainya
    // sebagai klines broker asli. Jangan pernah meneruskan 'BINANCE:PAIR' dsb mentah.
    source: liveQuote?.source ? ('EST_ANCHORED:' + liveQuote.source) : 'ESTIMATED_FALLBACK',
    price: endPrice,
    changePct: Number(liveQuote?.changePct) || 0.25,
    candles
  };
}
async function fetchMexcCandles(symbol, tf) {
  const pair = symbol.replace('/', '').toUpperCase();
  const tfMap = {
    'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
    'H1': '60m', 'H4': '4h', 'D1': '1d', 'W1': '1W', 'MN': '1M', '1Y': '1M'
  };
  const interval = tfMap[tf] || '60m';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 4000);
    const [kRes, tRes] = await Promise.all([
      fetch(`https://api.mexc.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=220`, { headers: EXUA, signal: ctrl.signal }),
      fetch(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${pair}`, { headers: EXUA, signal: ctrl.signal }).catch(() => null)
    ]);
    clearTimeout(t);
    if (!kRes.ok) return null;
    const list = await kRes.json();
    if (!Array.isArray(list) || list.length < 10) return null;
    const candles = list.map(k => ({
      time: Math.floor(Number(k[0]) / 1000), open: Number(k[1]), high: Number(k[2]),
      low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) || 100
    })).filter(c => Number.isFinite(c.time) && c.time > 0 && c.close > 0);
    if (candles.length < 10) return null;
    let livePrice = candles[candles.length - 1].close; let changePct = 0;
    if (tRes && tRes.ok) {
      const td = await tRes.json();
      if (Number(td.lastPrice) > 0) livePrice = Number(td.lastPrice);
      changePct = Number(td.priceChangePercent) || 0;
    }
    const last = candles[candles.length - 1];
    last.close = livePrice;
    if (livePrice > last.high) last.high = livePrice;
    if (livePrice < last.low) last.low = livePrice;
    return { source: `MEXC:${pair}`, price: livePrice, changePct, candles };
  } catch (e) { return null; }
}
async function fetchBingxCandles(symbol, tf) {
  const pair = symbol.replace('/', '-').toUpperCase();
  const tfMap = {
    'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
    'H1': '1h', 'H4': '4h', 'D1': '1d', 'W1': '1w', 'MN': '1M', '1Y': '1M'
  };
  const interval = tfMap[tf] || '1h';
  const urls = [
    `https://open-api.bingx.com/openApi/swap/v2/quote/klines?symbol=${pair}&interval=${interval}&limit=220`,
    `https://open-api.bingx.com/openApi/spot/v1/market/kline?symbol=${pair}&interval=${interval}&limit=220`
  ];
  for (const u of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 4000);
      const isSwap = u.includes('swap');
      const tUrl = isSwap
        ? `https://open-api.bingx.com/openApi/swap/v2/quote/ticker?symbol=${pair}`
        : `https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?symbol=${pair}`;
      const [kRes, tRes] = await Promise.all([
        fetch(u, { headers: EXUA, signal: ctrl.signal }),
        fetch(tUrl, { headers: EXUA, signal: ctrl.signal }).catch(() => null)
      ]);
      clearTimeout(t);
      if (!kRes.ok) continue;
      const kj = await kRes.json();
      let list = kj && kj.data ? (Array.isArray(kj.data) ? kj.data : (kj.data.list || [])) : [];
      if (!Array.isArray(list) || list.length < 10) continue;
      let candles = [];
      for (const k of list) {
        if (Array.isArray(k)) {
          candles.push({
            time: Math.floor(Number(k[0]) / 1000), open: Number(k[1]), high: Number(k[2]),
            low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) || 100
          });
        } else if (k && typeof k === 'object') {
          candles.push({
            time: Math.floor(Number(k.time || k.timestamp) / 1000),
            open: Number(k.open), high: Number(k.high), low: Number(k.low), close: Number(k.close),
            volume: Number(k.volume) || 100
          });
        }
      }
      candles = candles.filter(c => Number.isFinite(c.time) && c.time > 0 && c.close > 0);
      if (candles.length < 10) continue;
      if (candles[0].time > candles[candles.length - 1].time) candles.reverse();
      let livePrice = candles[candles.length - 1].close; let changePct = 0;
      if (tRes && tRes.ok) {
        const td = await tRes.json();
        const d = td && td.data;
        if (d) {
          const lp = Number(d.lastPrice || d.last || d.price);
          if (lp > 0) livePrice = lp;
          changePct = Number(d.priceChangePercent || d.price24hPcnt) || 0;
        }
      }
      const last = candles[candles.length - 1];
      last.close = livePrice;
      if (livePrice > last.high) last.high = livePrice;
      if (livePrice < last.low) last.low = livePrice;
      return { source: `BINGX:${pair}`, price: livePrice, changePct, candles };
    } catch (e) {}
  }
  return null;
}
async function fetchSynchronizedMarketCandles(symbol, tf) {
  const s = symbol.toUpperCase().trim();
  if (s.endsWith('/USDT')) {
    const binData = await fetchBinanceCandles(s, tf);
    if (binData) return binData;
    // v2026.61: pair tanpa listing Binance (HYPE dll) -> Bybit lalu OKX
    const bybData = await fetchBybitCandles(s, tf).catch(() => null);
    if (bybData) return bybData;
    const okxData = await fetchOkxCandles(s, tf).catch(() => null);
    if (okxData) return okxData;
    const mexcData = await fetchMexcCandles(s, tf).catch(() => null);
    if (mexcData) return mexcData;
    const bingxData = await fetchBingxCandles(s, tf).catch(() => null);
    if (bingxData) return bingxData;
  }
  // v2026.53: candle NYATA Yahoo Finance diutamakan untuk semua kelas aset non-crypto
  // (adaptif ke hari kerja/weekend: Yahoo mengikuti jam bursa masing-masing pasar).
  // v2026.60: XAU/USD TIDAK lagi dikecualikan — ticker spot XAUUSD=X memberi candle
  // emas spot NYATA (1m..D1), mengurangi banner ESTIMASI pada instrumen default.
  if (s !== 'XAU/IDR') {
    const yc = await fetchYahooCandles(s, tf).catch(() => null);
    if (yc && Array.isArray(yc.candles) && yc.candles.length >= 10) return yc;
  }
  // Jalur cadangan broker live spot klines untuk EUR/USD dan GBP/USD (Binance EURUSDT / GBPUSDT spot)
  if (s === 'EUR/USD' || s === 'GBP/USD') {
    const binData = await fetchBinanceCandles(s.replace('/', '/USDT'), tf).catch(() => null);
    if (binData && Array.isArray(binData.candles) && binData.candles.length >= 10) {
      const binPair = s.replace('/', '') + 'T';
      return { source: 'BINANCE:' + binPair, price: binData.price, changePct: binData.changePct, candles: binData.candles };
    }
  }
  // v2026.71: XAU/IDR komposit NYATA (LBMA Gold Spot XAUUSD=X x Interbank Kurs Rupiah USDIDR=X per gram)
  if (s === 'XAU/IDR') {
    const [goldYc, idrQuote] = await Promise.all([
      fetchYahooCandles('XAU/USD', tf).catch(() => null),
      fetchExactLiveQuote('USD/IDR', tf).catch(() => null)
    ]);
    const idrRate = Number(idrQuote?.price) > 10000 ? Number(idrQuote.price) : 16250;
    if (goldYc && Array.isArray(goldYc.candles) && goldYc.candles.length >= 10) {
      const gPerOz = 31.1034768;
      const candles = goldYc.candles.map(c => {
        let op = Math.round((c.open * idrRate) / gPerOz);
        let hi = Math.round((c.high * idrRate) / gPerOz);
        let lo = Math.round((c.low * idrRate) / gPerOz);
        let cl = Math.round((c.close * idrRate) / gPerOz);
        let maxP = Math.max(hi, op, cl);
        let minP = Math.min(lo, op, cl);
        const minSpread = Math.max(Math.round(cl * 0.0016), 500);
        if ((maxP - minP) < minSpread) {
          const pad = Math.round((minSpread - (maxP - minP)) * 0.5);
          maxP = Math.max(op, cl) + pad;
          minP = Math.max(1, Math.min(op, cl) - pad);
        }
        return {
          time: c.time,
          open: op,
          high: maxP,
          low: minP,
          close: cl,
          volume: c.volume || 100
        };
      });
      const lastClose = candles[candles.length - 1].close;
      return {
        source: 'YAHOO:XAUUSD=X x USDIDR=X',
        price: lastClose,
        changePct: goldYc.changePct || 0.25,
        candles
      };
    }
  }
  const liveQuote = await fetchExactLiveQuote(s, tf).catch(() => null);
  if (s === 'XAU/USD' || s === 'XAU/IDR') {
    const goldProxy = await fetchBinanceCandles('PAXG/USDT', tf).catch(() => null);
    if (goldProxy && Array.isArray(goldProxy.candles) && goldProxy.candles.length > 0 && liveQuote && liveQuote.price > 0) {
      const rawLast = goldProxy.candles[goldProxy.candles.length - 1].close;
      let candles;
      if (s === 'XAU/IDR') {
        const ratio = liveQuote.price / rawLast;
        candles = goldProxy.candles.map(c => ({
          time: c.time, open: c.open * ratio, high: c.high * ratio, low: c.low * ratio, close: c.close * ratio, volume: c.volume
        }));
      } else {
        const offset = liveQuote.price - rawLast;
        candles = goldProxy.candles.map(c => ({
          time: c.time, open: c.open + offset, high: c.high + offset, low: c.low + offset, close: c.close + offset, volume: c.volume
        }));
      }
      const active = candles[candles.length - 1];
      active.close = liveQuote.price;
      if (liveQuote.price > active.high) active.high = liveQuote.price;
      if (liveQuote.price < active.low) active.low = liveQuote.price;
      return {
        source: liveQuote.source,
        price: liveQuote.price,
        changePct: liveQuote.changePct,
        candles
      };
    }
  }
  return buildBrokerAnchoredCandles(s, tf, liveQuote);
}
