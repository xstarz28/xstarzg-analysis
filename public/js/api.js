export const DEFAULT_INSTRUMENTS = {
  crypto: [
    { symbol: 'BTC/USDT', name: 'Bitcoin / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'ETH/USDT', name: 'Ethereum / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'SOL/USDT', name: 'Solana / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'BNB/USDT', name: 'BNB / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'XRP/USDT', name: 'XRP / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'ADA/USDT', name: 'Cardano / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'DOGE/USDT', name: 'Dogecoin / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'AVAX/USDT', name: 'Avalanche / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'LINK/USDT', name: 'Chainlink / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'TON/USDT', name: 'Toncoin / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'SUI/USDT', name: 'Sui Network / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'DOT/USDT', name: 'Polkadot / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'NEAR/USDT', name: 'NEAR Protocol / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'APT/USDT', name: 'Aptos / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'ARB/USDT', name: 'Arbitrum / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'PEPE/USDT', name: 'Pepe / Tether US', assetClass: 'crypto', realtime: true }
  ],
  forex: [
    { symbol: 'EUR/USD', name: 'Euro / US Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'GBP/USD', name: 'British Pound / US Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', assetClass: 'forex', realtime: false },
    { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', assetClass: 'forex', realtime: false },
    { symbol: 'NZD/USD', name: 'New Zealand Dollar / US Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', assetClass: 'forex', realtime: false },
    { symbol: 'GBP/JPY', name: 'British Pound / Japanese Yen', assetClass: 'forex', realtime: false },
    { symbol: 'EUR/GBP', name: 'Euro / British Pound', assetClass: 'forex', realtime: false }
  ],
  metals: [
    { symbol: 'XAU/USD', name: 'Spot Gold (Emas Murni / USD)', assetClass: 'metals', realtime: false },
    { symbol: 'XAG/USD', name: 'Spot Silver (Perak / USD)', assetClass: 'metals', realtime: false },
    { symbol: 'XPT/USD', name: 'Spot Platinum (Platinum / USD)', assetClass: 'metals', realtime: false },
    { symbol: 'XPD/USD', name: 'Spot Palladium (Paladium / USD)', assetClass: 'metals', realtime: false }
  ],
  commodities: [
    { symbol: 'WTI', name: 'WTI Crude Oil (Minyak Mentah AS)', assetClass: 'commodities', realtime: false },
    { symbol: 'BRENT', name: 'Brent Crude Oil (Minyak Laut Utara)', assetClass: 'commodities', realtime: false },
    { symbol: 'NATGAS', name: 'Henry Hub Natural Gas (Gas Alam)', assetClass: 'commodities', realtime: false },
    { symbol: 'COPPER', name: 'Global Copper (Tembaga Industri)', assetClass: 'commodities', realtime: false },
    { symbol: 'WHEAT', name: 'Global Wheat (Gandum Berjangka)', assetClass: 'commodities', realtime: false },
    { symbol: 'CORN', name: 'Global Corn (Jagung Berjangka)', assetClass: 'commodities', realtime: false }
  ],
  stocks: [
    { symbol: 'SPY', name: 'S&P 500 Index ETF (SPY)', assetClass: 'stocks', realtime: false },
    { symbol: 'QQQ', name: 'Nasdaq-100 Index ETF (QQQ)', assetClass: 'stocks', realtime: false },
    { symbol: 'DIA', name: 'Dow Jones Industrial ETF (DIA)', assetClass: 'stocks', realtime: false },
    { symbol: 'IWM', name: 'Russell 2000 Small-Cap ETF (IWM)', assetClass: 'stocks', realtime: false },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', assetClass: 'stocks', realtime: false },
    { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'MSFT', name: 'Microsoft Corporation', assetClass: 'stocks', realtime: false },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'GOOGL', name: 'Alphabet Inc. (Google)', assetClass: 'stocks', realtime: false },
    { symbol: 'META', name: 'Meta Platforms Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'TSLA', name: 'Tesla Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'NFLX', name: 'Netflix Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', assetClass: 'stocks', realtime: false }
  ]
};
export function getAllInstrumentsFlat() {
  return [
    ...DEFAULT_INSTRUMENTS.crypto,
    ...DEFAULT_INSTRUMENTS.forex,
    ...DEFAULT_INSTRUMENTS.metals,
    ...DEFAULT_INSTRUMENTS.commodities,
    ...DEFAULT_INSTRUMENTS.stocks
  ];
}
const BINANCE_INTERVALS = {
  M1: '1m', M5: '5m', M15: '15m', M30: '30m', H1: '1h', H4: '4h', D1: '1d', W1: '1w', MN: '1M', '1Y': '1M'
};
const TOKEN_STORAGE_KEY = 'xstarzg_session_token';
function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 2400) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}
export const api = {
  getSessionToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  },
  setSessionToken(token) {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  },
  async fetchMarketOhlcv({ symbol, assetClass, timeframe, limit = 260 }) {
    // 1. Jika Crypto, coba direct cepat (2.2 detik). Jika diblokir ISP Indonesia, otomatis lewat Server Edge Cloudflare (/api/market/ohlcv)!
    if (assetClass === 'crypto') {
      const rawSym = String(symbol).replace('/', '').toUpperCase();
      const interval = BINANCE_INTERVALS[timeframe] || '1h';
      try {
        const bUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${rawSym}&interval=${interval}&limit=${limit}`;
        const res = await fetchWithTimeout(bUrl, {}, 2200);
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 20) {
            const bars = rows.map((r) => ({
              time: Math.floor(Number(r[0]) / 1000),
              open: Number(r[1]),
              high: Number(r[2]),
              low: Number(r[3]),
              close: Number(r[4]),
              volume: Number(r[5])
            }));
            return {
              ok: true,
              symbol,
              assetClass: 'crypto',
              timeframe,
              sourceExchange: 'BINANCE DIRECT STREAM',
              feedStatus: 'REALTIME WS',
              cacheAgeMinutes: 0,
              honestLabel: null,
              bars
            };
          }
        }
      } catch (_) {
        // Otomatis lanjut ke Server Edge Cloudflare di bawah (Anti-Blokir ISP Indonesia)
      }
    }
    const qs = new URLSearchParams({ symbol, assetClass, timeframe, limit: String(limit) });
    const res = await fetch(`/api/market/ohlcv?${qs.toString()}`, { headers: getAuthHeaders() });
    return res.json();
  },
  async fetchCryptoDerivativesDirect(symbol) {
    const rawSym = String(symbol).replace('/', '').toUpperCase();
    try {
      const [fRes, oiRes] = await Promise.all([
        fetchWithTimeout(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${rawSym}`, {}, 2000),
        fetchWithTimeout(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${rawSym}`, {}, 2000)
      ]);
      const fJson = fRes.ok ? await fRes.json() : null;
      const oiJson = oiRes.ok ? await oiRes.json() : null;
      const markPrice = Number(fJson?.markPrice || 0);
      const oiCoins = Number(oiJson?.openInterest || 0);
      return {
        fundingRatePct: fJson?.lastFundingRate ? Number(fJson.lastFundingRate) * 100 : 0.0125,
        openInterestUsd: markPrice > 0 && oiCoins > 0 ? markPrice * oiCoins : null
      };
    } catch (_) {
      return { fundingRatePct: 0.0125, openInterestUsd: null };
    }
  },
  async runFullAnalysis(payload) {
    const res = await fetch('/api/analysis/full', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    return res.json();
  },
  async fetchFundamentals(symbol, assetClass) {
    const qs = new URLSearchParams({ symbol, assetClass });
    const res = await fetch(`/api/fundamentals/overview?${qs.toString()}`, { headers: getAuthHeaders() });
    return res.json();
  },
  async fetchSecEdgar(symbol) {
    const qs = new URLSearchParams({ symbol });
    const res = await fetch(`/api/fundamentals/sec-edgar?${qs.toString()}`, { headers: getAuthHeaders() });
    return res.json();
  },
  async fetchScannerRecommendations({ mode = 'trader', timeframe = 'H1', assetClass = 'all' } = {}) {
    const qs = new URLSearchParams({ mode, timeframe, assetClass });
    const res = await fetch(`/api/scanner/recommendations?${qs.toString()}`, { headers: getAuthHeaders() });
    return res.json();
  },
  async fetchSession() {
    const res = await fetch('/api/auth/session', { headers: getAuthHeaders() });
    return res.json();
  },
  async loginWithGoogle(credential) {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ credential })
    });
    const data = await res.json();
    if (data.ok && data.sessionToken) {
      this.setSessionToken(data.sessionToken);
    }
    return data;
  },
  async logout() {
    await fetch('/api/auth/session', { method: 'DELETE', headers: getAuthHeaders() });
    this.setSessionToken(null);
  },
  async createBillingInvoice(planCode = 'VIP_MONTHLY') {
    const res = await fetch('/api/billing/invoice', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ planCode })
    });
    return res.json();
  },
  async verifyBscPayment({ invoiceId, txHash }) {
    const res = await fetch('/api/billing/verify-bsc', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ invoiceId, txHash })
    });
    return res.json();
  },
  async fetchAdminOverview() {
    const res = await fetch('/api/admin/overview', { headers: getAuthHeaders() });
    return res.json();
  }
};