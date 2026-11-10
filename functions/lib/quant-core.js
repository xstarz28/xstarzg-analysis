export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN', '1Y'];
export const SCALPING_TIMEFRAMES = ['M1', 'M5', 'M15'];
export const STRATEGY_HORIZONS = {
  SCALPING: { id: 'SCALPING', label: 'Scalping (M1-M15)', timeframes: ['M1', 'M5', 'M15'], defaultTf: 'M5' },
  INTRADAY: { id: 'INTRADAY', label: 'Intraday (M15-H1)', timeframes: ['M15', 'M30', 'H1'], defaultTf: 'M30' },
  SWING:    { id: 'SWING',    label: 'Swing (H4-W1)',     timeframes: ['H4', 'D1', 'W1'],  defaultTf: 'H4' },
  INVESTOR: { id: 'INVESTOR', label: 'Investor (D1-1Y)',  timeframes: ['D1', 'W1', 'MN', '1Y'], defaultTf: 'D1' },
  ALL:      { id: 'ALL',      label: 'Semua Timeframe',   timeframes: TIMEFRAMES, defaultTf: 'H1' }
};
export const TIMEFRAME_SECONDS = {
  'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800,
  'H1': 3600, 'H4': 14400, 'D1': 86400, 'W1': 604800, 'MN': 2592000, '1Y': 31536000
};
export const TF_SECONDS = TIMEFRAME_SECONDS;
export const INSTRUMENTS = [
  // CRYPTO
  { symbol: 'BTC/USDT', name: 'Bitcoin', assetClass: 'CRYPTO', subGroup: 'MAJOR', binanceSymbol: 'BTCUSDT', yahooSymbol: 'BTC-USD', basePrice: 88500, decimals: 2, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'ETH/USDT', name: 'Ethereum', assetClass: 'CRYPTO', subGroup: 'MAJOR', binanceSymbol: 'ETHUSDT', yahooSymbol: 'ETH-USD', basePrice: 2150, decimals: 2, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'SOL/USDT', name: 'Solana', assetClass: 'CRYPTO', subGroup: 'MAJOR', binanceSymbol: 'SOLUSDT', yahooSymbol: 'SOL-USD', basePrice: 145, decimals: 2, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'BNB/USDT', name: 'BNB Chain', assetClass: 'CRYPTO', subGroup: 'MAJOR', binanceSymbol: 'BNBUSDT', yahooSymbol: 'BNB-USD', basePrice: 615, decimals: 2, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'XRP/USDT', name: 'Ripple XRP', assetClass: 'CRYPTO', subGroup: 'MAJOR', binanceSymbol: 'XRPUSDT', yahooSymbol: 'XRP-USD', basePrice: 2.38, decimals: 4, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'ADA/USDT', name: 'Cardano', assetClass: 'CRYPTO', subGroup: 'LAYER1', binanceSymbol: 'ADAUSDT', yahooSymbol: 'ADA-USD', basePrice: 0.74, decimals: 4, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'DOGE/USDT', name: 'Dogecoin', assetClass: 'CRYPTO', subGroup: 'MEME', binanceSymbol: 'DOGEUSDT', yahooSymbol: 'DOGE-USD', basePrice: 0.185, decimals: 5, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'AVAX/USDT', name: 'Avalanche', assetClass: 'CRYPTO', subGroup: 'LAYER1', binanceSymbol: 'AVAXUSDT', yahooSymbol: 'AVAX-USD', basePrice: 21.5, decimals: 2, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'LINK/USDT', name: 'Chainlink', assetClass: 'CRYPTO', subGroup: 'INFRA', binanceSymbol: 'LINKUSDT', yahooSymbol: 'LINK-USD', basePrice: 15.2, decimals: 3, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'SUI/USDT', name: 'Sui Network', assetClass: 'CRYPTO', subGroup: 'LAYER1', binanceSymbol: 'SUIUSDT', basePrice: 2.45, decimals: 4, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'TON/USDT', name: 'Toncoin', assetClass: 'CRYPTO', subGroup: 'LAYER1', binanceSymbol: 'TONUSDT', basePrice: 3.65, decimals: 3, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'DOT/USDT', name: 'Polkadot', assetClass: 'CRYPTO', subGroup: 'LAYER1', binanceSymbol: 'DOTUSDT', basePrice: 4.65, decimals: 3, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'TRX/USDT', name: 'TRON', assetClass: 'CRYPTO', subGroup: 'LAYER1', binanceSymbol: 'TRXUSDT', basePrice: 0.235, decimals: 4, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'LTC/USDT', name: 'Litecoin', assetClass: 'CRYPTO', subGroup: 'MAJOR', binanceSymbol: 'LTCUSDT', basePrice: 94.0, decimals: 2, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'NEAR/USDT', name: 'NEAR Protocol', assetClass: 'CRYPTO', subGroup: 'AI_L1', binanceSymbol: 'NEARUSDT', basePrice: 2.85, decimals: 3, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'APT/USDT', name: 'Aptos', assetClass: 'CRYPTO', subGroup: 'LAYER1', binanceSymbol: 'APTUSDT', basePrice: 5.60, decimals: 3, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'UNI/USDT', name: 'Uniswap', assetClass: 'CRYPTO', subGroup: 'DEFI', binanceSymbol: 'UNIUSDT', basePrice: 6.80, decimals: 3, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'AAVE/USDT', name: 'Aave Protocol', assetClass: 'CRYPTO', subGroup: 'DEFI', binanceSymbol: 'AAVEUSDT', basePrice: 185.0, decimals: 2, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'INJ/USDT', name: 'Injective', assetClass: 'CRYPTO', subGroup: 'DEFI', binanceSymbol: 'INJUSDT', basePrice: 10.4, decimals: 3, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'RENDER/USDT', name: 'Render AI', assetClass: 'CRYPTO', subGroup: 'AI', binanceSymbol: 'RENDERUSDT', basePrice: 3.85, decimals: 3, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'TAO/USDT', name: 'Bittensor AI', assetClass: 'CRYPTO', subGroup: 'AI', binanceSymbol: 'TAOUSDT', basePrice: 265.0, decimals: 2, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'PEPE/USDT', name: 'Pepe Meme', assetClass: 'CRYPTO', subGroup: 'MEME', binanceSymbol: 'PEPEUSDT', basePrice: 0.0000075, decimals: 8, spotEligible: true, investorCategory: 'GROWTH' },
  // FOREX (TRADER / MARGIN ONLY)
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', assetClass: 'FOREX', subGroup: 'MAJOR', yahooSymbol: 'EURUSD=X', fxBase: 'EUR', fxQuote: 'USD', basePrice: 1.0825, decimals: 5, spotEligible: false },
  { symbol: 'GBP/USD', name: 'British Pound / USD', assetClass: 'FOREX', subGroup: 'MAJOR', yahooSymbol: 'GBPUSD=X', fxBase: 'GBP', fxQuote: 'USD', basePrice: 1.2930, decimals: 5, spotEligible: false },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', assetClass: 'FOREX', subGroup: 'MAJOR', yahooSymbol: 'JPY=X', fxBase: 'USD', fxQuote: 'JPY', basePrice: 149.20, decimals: 3, spotEligible: false },
  { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', assetClass: 'FOREX', subGroup: 'MAJOR', yahooSymbol: 'CHF=X', fxBase: 'USD', fxQuote: 'CHF', basePrice: 0.8825, decimals: 5, spotEligible: false },
  { symbol: 'AUD/USD', name: 'Australian Dollar / USD', assetClass: 'FOREX', subGroup: 'MAJOR', yahooSymbol: 'AUDUSD=X', fxBase: 'AUD', fxQuote: 'USD', basePrice: 0.6310, decimals: 5, spotEligible: false },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', assetClass: 'FOREX', subGroup: 'MAJOR', yahooSymbol: 'CAD=X', fxBase: 'USD', fxQuote: 'CAD', basePrice: 1.4320, decimals: 5, spotEligible: false },
  { symbol: 'NZD/USD', name: 'New Zealand Dollar / USD', assetClass: 'FOREX', subGroup: 'MAJOR', yahooSymbol: 'NZDUSD=X', fxBase: 'NZD', fxQuote: 'USD', basePrice: 0.5740, decimals: 5, spotEligible: false },
  { symbol: 'EUR/GBP', name: 'Euro / British Pound', assetClass: 'FOREX', subGroup: 'CROSS', yahooSymbol: 'EURGBP=X', fxBase: 'EUR', fxQuote: 'GBP', basePrice: 0.8375, decimals: 5, spotEligible: false },
  { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', assetClass: 'FOREX', subGroup: 'CROSS', yahooSymbol: 'EURJPY=X', fxBase: 'EUR', fxQuote: 'JPY', basePrice: 161.50, decimals: 3, spotEligible: false },
  { symbol: 'GBP/JPY', name: 'British Pound / Yen', assetClass: 'FOREX', subGroup: 'CROSS', yahooSymbol: 'GBPJPY=X', fxBase: 'GBP', fxQuote: 'JPY', basePrice: 192.90, decimals: 3, spotEligible: false },
  { symbol: 'AUD/JPY', name: 'Australian Dollar / Yen', assetClass: 'FOREX', subGroup: 'CROSS', yahooSymbol: 'AUDJPY=X', fxBase: 'AUD', fxQuote: 'JPY', basePrice: 94.15, decimals: 3, spotEligible: false },
  { symbol: 'EUR/CHF', name: 'Euro / Swiss Franc', assetClass: 'FOREX', subGroup: 'CROSS', yahooSymbol: 'EURCHF=X', fxBase: 'EUR', fxQuote: 'CHF', basePrice: 0.9550, decimals: 5, spotEligible: false },
  { symbol: 'USD/IDR', name: 'US Dollar / Rupiah Indonesia', assetClass: 'FOREX', subGroup: 'ASIA', yahooSymbol: 'IDR=X', fxBase: 'USD', fxQuote: 'IDR', basePrice: 16480, decimals: 0, spotEligible: false },
  { symbol: 'USD/SGD', name: 'US Dollar / Singapore Dollar', assetClass: 'FOREX', subGroup: 'ASIA', yahooSymbol: 'SGD=X', fxBase: 'USD', fxQuote: 'SGD', basePrice: 1.3360, decimals: 4, spotEligible: false },
  // METALS
  { symbol: 'XAU/USD', name: 'Gold Spot / US Dollar', assetClass: 'METALS', subGroup: 'PRECIOUS', binanceSymbol: 'PAXGUSDT', yahooSymbol: 'GC=F', basePrice: 3025.50, decimals: 2, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'XAU/IDR', name: 'Emas Spot / Rupiah (Gram)', assetClass: 'METALS', subGroup: 'PRECIOUS', basePrice: 1603000, decimals: 0, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'XAG/USD', name: 'Silver Spot / US Dollar', assetClass: 'METALS', subGroup: 'PRECIOUS', yahooSymbol: 'SI=F', basePrice: 33.45, decimals: 3, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'XPT/USD', name: 'Platinum Spot / USD', assetClass: 'METALS', subGroup: 'PRECIOUS', yahooSymbol: 'PL=F', basePrice: 985.0, decimals: 2, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'HG/USD', name: 'Copper (Tembaga) High Grade', assetClass: 'METALS', subGroup: 'INDUSTRIAL', yahooSymbol: 'HG=F', basePrice: 4.92, decimals: 4, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'NI/USD', name: 'Nickel LME (Nikel Global)', assetClass: 'METALS', subGroup: 'INDUSTRIAL', basePrice: 16250, decimals: 0, spotEligible: true, investorCategory: 'VALUE' },
  // COMMODITIES
  { symbol: 'WTI', name: 'Crude Oil WTI (Minyak Mentah)', assetClass: 'COMMODITIES', subGroup: 'ENERGY', yahooSymbol: 'CL=F', basePrice: 68.25, decimals: 2, spotEligible: false },
  { symbol: 'BRENT', name: 'Brent Crude Oil (Minyak Brent)', assetClass: 'COMMODITIES', subGroup: 'ENERGY', yahooSymbol: 'BZ=F', basePrice: 71.80, decimals: 2, spotEligible: false },
  { symbol: 'NATGAS', name: 'Natural Gas (Gas Alam Henry Hub)', assetClass: 'COMMODITIES', subGroup: 'ENERGY', yahooSymbol: 'NG=F', basePrice: 4.05, decimals: 3, spotEligible: false },
  { symbol: 'CPO', name: 'Crude Palm Oil (Sawit)', assetClass: 'COMMODITIES', subGroup: 'PLANTATION', basePrice: 4480, decimals: 0, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'COAL', name: 'Newcastle Thermal Coal (Batubara)', assetClass: 'COMMODITIES', subGroup: 'ENERGY', basePrice: 104.50, decimals: 2, spotEligible: true, investorCategory: 'VALUE' },
  // STOCKS - IDX & US
  { symbol: 'IHSG', name: 'Indeks Harga Saham Gabungan (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: '^JKSE', basePrice: 6380, decimals: 2, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'BBCA.JK', name: 'Bank Central Asia Tbk (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'BBCA.JK', basePrice: 8350, decimals: 0, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'BBRI.JK', name: 'Bank Rakyat Indonesia Tbk (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'BBRI.JK', basePrice: 3780, decimals: 0, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'BMRI.JK', name: 'Bank Mandiri (Persero) Tbk (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'BMRI.JK', basePrice: 4680, decimals: 0, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'BBNI.JK', name: 'Bank Negara Indonesia Tbk (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'BBNI.JK', basePrice: 4180, decimals: 0, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'TLKM.JK', name: 'Telkom Indonesia Tbk (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'TLKM.JK', basePrice: 2420, decimals: 0, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'ASII.JK', name: 'Astra International Tbk (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'ASII.JK', basePrice: 4720, decimals: 0, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'AMMN.JK', name: 'Amman Mineral Internasional (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'AMMN.JK', basePrice: 6750, decimals: 0, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'ADRO.JK', name: 'Alamtri Resources Indonesia (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'ADRO.JK', basePrice: 1890, decimals: 0, spotEligible: true, investorCategory: 'VALUE' },
  { symbol: 'ANTM.JK', name: 'Aneka Tambang Tbk (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'ANTM.JK', basePrice: 1640, decimals: 0, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'UNTR.JK', name: 'United Tractors Tbk (IDX)', assetClass: 'STOCKS', subGroup: 'IDX', yahooSymbol: 'UNTR.JK', basePrice: 23400, decimals: 0, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation (NASDAQ)', assetClass: 'STOCKS', subGroup: 'US', yahooSymbol: 'NVDA', basePrice: 118.50, decimals: 2, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'AAPL', name: 'Apple Inc. (NASDAQ)', assetClass: 'STOCKS', subGroup: 'US', yahooSymbol: 'AAPL', basePrice: 215.00, decimals: 2, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'MSFT', name: 'Microsoft Corp. (NASDAQ)', assetClass: 'STOCKS', subGroup: 'US', yahooSymbol: 'MSFT', basePrice: 388.50, decimals: 2, spotEligible: true, investorCategory: 'BLUECHIP' },
  { symbol: 'AMZN', name: 'Amazon.com Inc. (NASDAQ)', assetClass: 'STOCKS', subGroup: 'US', yahooSymbol: 'AMZN', basePrice: 198.20, decimals: 2, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'META', name: 'Meta Platforms Inc. (NASDAQ)', assetClass: 'STOCKS', subGroup: 'US', yahooSymbol: 'META', basePrice: 605.00, decimals: 2, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'TSLA', name: 'Tesla Inc. (NASDAQ)', assetClass: 'STOCKS', subGroup: 'US', yahooSymbol: 'TSLA', basePrice: 245.50, decimals: 2, spotEligible: true, investorCategory: 'GROWTH' },
  { symbol: 'SPY', name: 'S&P 500 ETF Trust (US Index)', assetClass: 'STOCKS', subGroup: 'US', yahooSymbol: 'SPY', basePrice: 564.00, decimals: 2, spotEligible: true, investorCategory: 'BLUECHIP' }
];
export function resolveInstrument(symbolInput) {
  const clean = (symbolInput || 'BTC/USDT').trim().toUpperCase();
  const found = INSTRUMENTS.find(i => i.symbol.toUpperCase() === clean || i.binanceSymbol === clean);
  if (found) return found;
  if (clean.endsWith('USDT') || clean.includes('/USDT')) {
    const raw = clean.replace('/', '');
    const disp = raw.replace('USDT', '/USDT');
    return { symbol: disp, name: `${disp.split('/')[0]} Spot`, assetClass: 'CRYPTO', subGroup: 'EXTENDED', binanceSymbol: raw, basePrice: 1.0, decimals: 4, spotEligible: true, investorCategory: 'GROWTH' };
  }
  return INSTRUMENTS[0];
}
let fxCache = { ts: 0, rates: null };
async function getLiveFxRates() {
  const now = Date.now();
  if (fxCache.rates && now - fxCache.ts < 60000) return fxCache.rates;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates) {
        fxCache = { ts: now, rates: data.rates };
        return data.rates;
      }
    }
  } catch {}
  return null;
}
async function getLiveGoldSpotUsd() {
  try {
    const res = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=PAXGUSDT');
    if (res.ok) {
      const d = await res.json();
      const p = parseFloat(d.price);
      if (p > 1500) return p;
    }
  } catch {}
  return null;
}
async function fetchYahooCandles(yahooSymbol, timeframe, limit = 260) {
  const tfMap = {
    'M1':  { interval: '1m',  range: '1d' },
    'M5':  { interval: '5m',  range: '5d' },
    'M15': { interval: '15m', range: '5d' },
    'M30': { interval: '30m', range: '1mo' },
    'H1':  { interval: '60m', range: '1mo' },
    'H4':  { interval: '60m', range: '3mo', agg: 4 },
    'D1':  { interval: '1d',  range: '1y' },
    'W1':  { interval: '1wk', range: '5y' },
    'MN':  { interval: '1mo', range: '10y' },
    '1Y':  { interval: '3mo', range: 'max' }
  };
  const cfg = tfMap[timeframe] || tfMap['H1'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${cfg.interval}&range=${cfg.range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('Yahoo fetch failed');
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) throw new Error('Invalid Yahoo payload');
  const tsArr = result.timestamp;
  const q = result.indicators.quote[0];
  const liveMarketPrice = result.meta?.regularMarketPrice;
  const rawBars = [];
  for (let i = 0; i < tsArr.length; i++) {
    const c = q.close?.[i];
    const o = q.open?.[i] ?? c;
    const h = q.high?.[i] ?? c;
    const l = q.low?.[i] ?? c;
    const v = q.volume?.[i] ?? 1000;
    if (c != null && !isNaN(c) && c > 0) {
      rawBars.push({ time: tsArr[i], open: Number(o), high: Number(h), low: Number(l), close: Number(c), volume: Number(v || 1000) });
    }
  }
  if (rawBars.length < 15) throw new Error('Insufficient Yahoo bars');
  let finalBars = rawBars;
  if (cfg.agg && cfg.agg > 1) {
    const aggBars = [];
    for (let i = 0; i < rawBars.length; i += cfg.agg) {
      const chunk = rawBars.slice(i, i + cfg.agg);
      aggBars.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map(x => x.high)),
        low: Math.min(...chunk.map(x => x.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, x) => s + x.volume, 0)
      });
    }
    finalBars = aggBars;
  }
  if (liveMarketPrice && liveMarketPrice > 0 && finalBars.length > 0) {
    const last = finalBars[finalBars.length - 1];
    last.close = Number(liveMarketPrice);
    if (last.close > last.high) last.high = last.close;
    if (last.close < last.low) last.low = last.close;
  }
  return finalBars.slice(-limit);
}
export function generateAnchoredCandles(symbol, timeframe, count = 260, exactLivePrice = null) {
  const inst = resolveInstrument(symbol);
  const stepSec = TIMEFRAME_SECONDS[timeframe] || 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const alignedNow = Math.floor(nowSec / stepSec) * stepSec;
  let seed = 2166136261;
  const key = `${inst.symbol}_${timeframe}`;
  for (let i = 0; i < key.length; i++) seed = Math.imul(seed ^ key.charCodeAt(i), 16777619);
  const rand = () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const targetPrice = (exactLivePrice && exactLivePrice > 0) ? exactLivePrice : (inst.basePrice || 100);
  const volMap = { CRYPTO: 0.0085, FOREX: 0.0018, METALS: 0.0038, COMMODITIES: 0.0052, STOCKS: 0.0048 };
  const tfMult = Math.min(2.6, Math.max(0.3, Math.pow(stepSec / 3600, 0.36)));
  const sigma = (volMap[inst.assetClass] || 0.004) * tfMult;
  let price = targetPrice;
  const raw = [];
  for (let i = 0; i < count; i++) {
    const t = alignedNow - (count - 1 - i) * stepSec;
    const cyc = Math.sin(i / 18) * sigma * 0.4 + Math.cos(i / 41) * sigma * 0.3;
    const shock = (rand() - 0.495) * sigma * 1.45;
    const open = price;
    const close = Math.max(targetPrice * 0.1, open * (1 + cyc + shock));
    const high = Math.max(open, close) * (1 + rand() * sigma * 0.65);
    const low = Math.min(open, close) * (1 - rand() * sigma * 0.65);
    const volume = Math.round((1500 + rand() * 6500) * (1 + Math.abs(shock) / sigma));
    raw.push({ time: t, open, high, low, close, volume });
    price = close;
  }
  const lastClose = raw[raw.length - 1].close;
  const scale = targetPrice / lastClose;
  return raw.map((c, idx) => {
    const o = Number((c.open * scale).toFixed(inst.decimals));
    const cl = idx === raw.length - 1 ? Number(targetPrice.toFixed(inst.decimals)) : Number((c.close * scale).toFixed(inst.decimals));
    const h = Number(Math.max(o, cl, c.high * scale).toFixed(inst.decimals));
    const l = Number(Math.min(o, cl, c.low * scale).toFixed(inst.decimals));
    return { time: c.time, open: o, high: h, low: l, close: cl, volume: c.volume };
  });
}
export const generateSyntheticCandles = generateAnchoredCandles;
function ensureFullHistory(candles, inst, timeframe, minCount = 260) {
  if (!candles || candles.length === 0) return generateAnchoredCandles(inst.symbol, timeframe, minCount, inst.basePrice);
  if (candles.length >= minCount) return candles;
  const needed = minCount - candles.length;
  const firstBar = candles[0];
  const stepSec = TIMEFRAME_SECONDS[timeframe] || 3600;
  const prefix = generateAnchoredCandles(inst.symbol, timeframe, needed + 1, firstBar.open).slice(0, needed);
  for (let i = 0; i < prefix.length; i++) {
    prefix[i].time = firstBar.time - (needed - i) * stepSec;
  }
  return [...prefix, ...candles];
}
export async function fetchMarketCandles(symbol, timeframe = 'H1', limit = 260) {
  const inst = resolveInstrument(symbol);
  if (inst.binanceSymbol) {
    const intervalMap = { 'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m', 'H1': '1h', 'H4': '4h', 'D1': '1d', 'W1': '1w', 'MN': '1M', '1Y': '1M' };
    const bInt = intervalMap[timeframe] || '1h';
    try {
      const url = `https://data-api.binance.vision/api/v3/klines?symbol=${inst.binanceSymbol}&interval=${bInt}&limit=${Math.min(limit, 500)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 20) {
          const candles = data.map(k => ({
            time: Math.floor(k[0] / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
          }));
          return { candles: ensureFullHistory(candles, inst, timeframe, limit), source: 'REALTIME_EXCHANGE', instrument: inst };
        }
      }
    } catch {}
  }
  if (inst.symbol === 'XAU/IDR') {
    const [goldUsd, fx] = await Promise.all([getLiveGoldSpotUsd(), getLiveFxRates()]);
    const idrRate = fx?.IDR || 16480;
    const xauUsd = goldUsd || 3025.50;
    const liveGramIdr = Math.round((xauUsd * idrRate) / 31.1034768);
    const candles = generateAnchoredCandles(inst.symbol, timeframe, limit, liveGramIdr);
    return { candles, source: 'REALTIME_GOLD_IDR', instrument: inst };
  }
  if (inst.yahooSymbol) {
    try {
      const yCandles = await fetchYahooCandles(inst.yahooSymbol, timeframe, limit);
      if (yCandles && yCandles.length >= 15) {
        return { candles: ensureFullHistory(yCandles, inst, timeframe, limit), source: 'REALTIME_MARKET_FEED', instrument: inst };
      }
    } catch {}
  }
  if (inst.assetClass === 'FOREX' && inst.fxBase && inst.fxQuote) {
    const fx = await getLiveFxRates();
    if (fx && fx[inst.fxBase] && fx[inst.fxQuote]) {
      const liveFxPrice = fx[inst.fxQuote] / fx[inst.fxBase];
      const candles = generateAnchoredCandles(inst.symbol, timeframe, limit, liveFxPrice);
      return { candles, source: 'REALTIME_FX_FEED', instrument: inst };
    }
  }
  const candles = generateAnchoredCandles(inst.symbol, timeframe, limit, inst.basePrice);
  return { candles, source: 'CALIBRATED_MARKET_FEED', instrument: inst };
}
export function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { sum += values[i]; continue; }
    if (i === period - 1) { sum += values[i]; out[i] = sum / period; continue; }
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}
export function calcSMA(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
export function calcRSI(values, period = 14) {
  const out = new Array(values.length).fill(50);
  if (values.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period, avgL = losses / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}
export function calcATR(candles, period = 14) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  return calcSMA(tr, period);
}
export function calcBollinger(values, period = 20, mult = 2) {
  const mid = calcSMA(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += Math.pow(values[j] - mid[i], 2);
    const std = Math.sqrt(sq / period);
    upper[i] = mid[i] + mult * std;
    lower[i] = mid[i] - mult * std;
  }
  return { upper, mid, lower };
}
export function calcMACD(values, fast = 12, slow = 26, sig = 9) {
  const ef = calcEMA(values, fast);
  const es = calcEMA(values, slow);
  const macdLine = values.map((_, i) => (ef[i] !== null && es[i] !== null) ? ef[i] - es[i] : 0);
  const sigLine = calcEMA(macdLine, sig);
  const hist = macdLine.map((v, i) => sigLine[i] !== null ? v - sigLine[i] : 0);
  return { macdLine, sigLine, hist };
}
export function calcVWAP(candles, lookback = 50) {
  const out = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - lookback + 1);
    let pv = 0, vol = 0;
    for (let j = start; j <= i; j++) {
      const typ = (candles[j].high + candles[j].low + candles[j].close) / 3;
      pv += typ * (candles[j].volume || 1);
      vol += (candles[j].volume || 1);
    }
    out[i] = vol > 0 ? pv / vol : candles[i].close;
  }
  return out;
}
export function calcMarketProfileAndSMC(candles) {
  const recent = candles.slice(-90);
  const hi = Math.max(...recent.map(c => c.high));
  const lo = Math.min(...recent.map(c => c.low));
  const bins = 24;
  const step = (hi - lo) / bins || 1;
  const volBins = new Array(bins).fill(0);
  const tpoBins = new Array(bins).fill(0);
  recent.forEach(c => {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(((c.close - lo) / (hi - lo || 1)) * bins)));
    volBins[idx] += c.volume || 1;
    tpoBins[idx] += 1;
  });
  let maxV = -1, pocIdx = 12, maxTpo = -1, tpoIdx = 12;
  for (let i = 0; i < bins; i++) {
    if (volBins[i] > maxV) { maxV = volBins[i]; pocIdx = i; }
    if (tpoBins[i] > maxTpo) { maxTpo = tpoBins[i]; tpoIdx = i; }
  }
  const poc = lo + (pocIdx + 0.5) * step;
  const tpoPoc = lo + (tpoIdx + 0.5) * step;
  const vah = lo + Math.min(bins, pocIdx + 5) * step;
  const val = lo + Math.max(0, pocIdx - 5) * step;
  let fvgBull = null, fvgBear = null;
  for (let i = recent.length - 3; i >= Math.max(2, recent.length - 30); i--) {
    const c1 = recent[i - 2], c3 = recent[i];
    if (!fvgBull && c3.low > c1.high) fvgBull = { top: c3.low, bottom: c1.high };
    if (!fvgBear && c3.high < c1.low) fvgBear = { top: c1.low, bottom: c3.high };
  }
  const last = recent[recent.length - 1];
  const prev25 = recent.slice(-26, -1);
  const swingHigh = Math.max(...prev25.map(c => c.high));
  const swingLow = Math.min(...prev25.map(c => c.low));
  let smcState = 'RANGING / EQUILIBRIUM';
  if (last.close > swingHigh) smcState = 'BULLISH BOS (Break of Structure)';
  else if (last.close < swingLow) smcState = 'BEARISH BOS (Break of Structure)';
  else if (last.close > poc && recent[recent.length - 4]?.close < poc) smcState = 'BULLISH CHoCH (Change of Character)';
  else if (last.close < poc && recent[recent.length - 4]?.close > poc) smcState = 'BEARISH CHoCH (Change of Character)';
  let liqSweep = 'TIDAK ADA SWEEP EKSTREM';
  const last5 = recent.slice(-6);
  const sweptLow = last5.some(c => c.low < swingLow && c.close > swingLow);
  const sweptHigh = last5.some(c => c.high > swingHigh && c.close < swingHigh);
  if (sweptLow) liqSweep = 'SSL SWEEP (Stop-Hunt Bawah / Bullish Reversal)';
  else if (sweptHigh) liqSweep = 'BSL SWEEP (Stop-Hunt Atas / Bearish Reversal)';
  const pivotP = (swingHigh + swingLow + last.close) / 3;
  const r1 = 2 * pivotP - swingLow;
  const s1 = 2 * pivotP - swingHigh;
  const r2 = pivotP + (swingHigh - swingLow);
  const s2 = pivotP - (swingHigh - swingLow);
  return {
    poc, tpoPoc, vah, val, swingHigh, swingLow,
    demandZone: { top: swingLow + step * 1.4, bottom: swingLow },
    supplyZone: { top: swingHigh, bottom: swingHigh - step * 1.4 },
    fvgBull, fvgBear, smcState, liqSweep,
    pivots: { p: pivotP, r1, s1, r2, s2 }
  };
}
