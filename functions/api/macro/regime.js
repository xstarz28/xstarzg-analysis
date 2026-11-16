/* ==================== GLOBAL MACRO REGIME MAP (v2026.58) ====================
   Peta "Strategi Global Macro" yang dihitung NYATA dari harga pasar lintas-aset
   (Yahoo Finance gratis): Growth, Inflation, US-Dollar bias, Risk Appetite,
   lalu dipilah jadi regime (Goldilocks/Reflasi/Stagflasi/Desinflasi) dan
   peringkat RELATIVE VALUE antar kawasan/aset (Capital Flow). Tanpa API key.
   Konsumen: workspace INVESTOR (peta kekuatan relatif + pacing DCA) dan badge
   konteks makro di panel trader. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=1800'
};
let cache = { ts: 0, data: null };
const TTL = 30 * 60 * 1000;

const PROXIES = [
  { id: 'US',    label: 'AS (S&P 500)',      ticker: '^GSPC', cls: 'equity' },
  { id: 'EU',    label: 'Eropa (DAX)',       ticker: '^GDAXI', cls: 'equity' },
  { id: 'UK',    label: 'Inggris (FTSE)',    ticker: '^FTSE', cls: 'equity' },
  { id: 'JP',    label: 'Jepang (Nikkei)',   ticker: '^N225', cls: 'equity' },
  { id: 'ID',    label: 'Indonesia (IHSG)',  ticker: '^JKSE', cls: 'equity' },
  { id: 'XAU',   label: 'Emas',              ticker: 'XAUUSD=X', cls: 'metal' },
  { id: 'OIL',   label: 'Minyak (WTI)',      ticker: 'CL=F', cls: 'commodity' },
  { id: 'BTC',   label: 'Bitcoin (kripto)',  ticker: 'BTC-USD', cls: 'crypto' },
  { id: 'EURUSD', label: 'EUR/USD',          ticker: 'EURUSD=X', cls: 'fx' },
  { id: 'USDJPY', label: 'USD/JPY',          ticker: 'USDJPY=X', cls: 'fx' },
  { id: 'USDIDR', label: 'USD/IDR',          ticker: 'USDIDR=X', cls: 'fx' }
];

function clampScore(x) { return Math.max(0, Math.min(100, Math.round(x))); }

function classifyRegime(growth, inflation) {
  if (growth >= 55 && inflation < 55) return 'GOLDILOCKS';
  if (growth >= 55 && inflation >= 55) return 'REFLASI';
  if (growth < 45 && inflation >= 55) return 'STAGFLASI';
  if (growth < 45 && inflation < 45) return 'DESINFLASI_DEFENSIF';
  return 'CAMPURAN';
}

async function fetchCloses(ticker) {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1d&range=6mo';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!res.ok) return null;
    const j = await res.json();
    const node = j && j.chart && j.chart.result && j.chart.result[0];
    const q = node && node.indicators && node.indicators.quote && node.indicators.quote[0];
    const closes = q && Array.isArray(q.close) ? q.close.filter(Number.isFinite) : null;
    return closes && closes.length >= 40 ? closes : null;
  } catch (e) { return null; }
}

function mom(closes, n) {
  const a = closes[closes.length - 1];
  const b = closes[Math.max(0, closes.length - 1 - n)];
  return b > 0 ? ((a - b) / b) * 100 : 0;
}

async function computeMacro() {
  const data = await Promise.all(PROXIES.map(p => fetchCloses(p.ticker)));
  const S = {};
  PROXIES.forEach((p, i) => {
    const c = data[i];
    S[p.id] = c ? { mom63: mom(c, 63), mom21: mom(c, 21), last: c[c.length - 1] } : null;
  });
  const eq = ['US', 'EU', 'UK', 'JP', 'ID'].map(k => S[k]).filter(Boolean);
  if (eq.length < 3 || !S.XAU || !S.OIL) return null;
  const eqMom = eq.reduce((a, b) => a + b.mom63, 0) / eq.length;
  const growth = clampScore(50 + (eqMom * 3 + (S.OIL ? S.OIL.mom63 * 1.0 : 0)) / 2);
  const inflation = clampScore(50 + ((S.XAU.mom63 + S.OIL.mom63) / 2) * 3);
  const usdClues = [];
  if (S.EURUSD) usdClues.push(-S.EURUSD.mom63);
  if (S.USDJPY) usdClues.push(S.USDJPY.mom63);
  if (S.USDIDR) usdClues.push(S.USDIDR.mom63);
  const usdBias = clampScore(50 + (usdClues.reduce((a, b) => a + b, 0) / Math.max(1, usdClues.length)) * 3);
  const riskAppetite = S.BTC ? clampScore(50 + (S.BTC.mom63 - S.XAU.mom63) * 2) : 50;
  const regime = classifyRegime(growth, inflation);
  // Capital Flow / Relative Value ranking antar kawasan & aset
  const flow = PROXIES.filter(p => p.cls !== 'fx').map(p => {
    const d = S[p.id];
    return { label: p.label, cls: p.cls, score: d ? clampScore(50 + d.mom63 * 3) : 50, mom63: d ? Number(d.mom63.toFixed(2)) : 0 };
  }).sort((a, b) => b.score - a.score);
  // Cross-asset impact (aturan regime -> instrumen catalog)
  const usdUp = usdBias >= 58, usdDn = usdBias <= 42;
  const impacts = [];
  if (usdUp) {
    impacts.push({ sym: 'XAU/USD', dir: -1, note: 'USD kuat menekan logam mulia' });
    impacts.push({ sym: 'EUR/USD', dir: -1, note: 'kaki USD mendominasi' });
    impacts.push({ sym: 'BTC/USDT', dir: -1, note: 'risk-off likuiditas mengetat' });
  } else if (usdDn) {
    impacts.push({ sym: 'XAU/USD', dir: 1, note: 'USD lemah mengangkat logam mulia' });
    impacts.push({ sym: 'EUR/USD', dir: 1, note: 'kaki USD melemah' });
    impacts.push({ sym: 'BTC/USDT', dir: 1, note: 'risk-on' });
  }
  if (regime === 'REFLASI') { impacts.push({ sym: 'WTI', dir: 1, note: 'permintaan siklis naik' }); }
  if (regime === 'STAGFLASI') { impacts.push({ sym: 'XAU/USD', dir: 1, note: 'lindung inflasi saat ekonomi melambat' }); }
  if (riskAppetite >= 62) impacts.push({ sym: 'ETH/USDT', dir: 1, note: 'risk appetite tinggi' });
  if (riskAppetite <= 38) impacts.push({ sym: 'ETH/USDT', dir: -1, note: 'risk appetite rendah — hindari beta tinggi' });
  const weights = regime === 'GOLDILOCKS' ? [50, 30, 20]
    : regime === 'REFLASI' ? [40, 35, 25]
      : regime === 'STAGFLASI' ? [25, 35, 40] : [30, 35, 35];
  return { ok: true, regime, growth, inflation, usdBias, riskAppetite, flow, impacts, dcaWeights: weights, ts: Date.now() };
}

export const __macro = { classifyRegime, clampScore };

export async function onRequestGet(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const now = Date.now();
  if (cache.data && now - cache.ts < TTL) return new Response(JSON.stringify(cache.data), { status: 200, headers: CORS });
  const data = await computeMacro().catch(() => null);
  const payload = data || { ok: false, error: 'MACRO_UNAVAILABLE', ts: now };
  if (data) cache = { ts: now, data: payload };
  return new Response(JSON.stringify(payload), { status: 200, headers: CORS });
}
