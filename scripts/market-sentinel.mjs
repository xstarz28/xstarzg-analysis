#!/usr/bin/env node
// ========================================================================
// XSTARZG 24/7 BACKGROUND SENTINEL ENGINE (GITHUB ACTIONS / SERVER CRON)
// ========================================================================
// Menjalankan analisis kuantitatif 28-Pilar mandiri di cloud (GitHub Actions),
// memindai setup skor besar (ELITE/PRO >= 75%) dan pemantauan level SL+ (0-Risk),
// lalu mengirimkan notifikasi instan langsung ke Telegram trader.
// 100% BEBAS BROWSER — Berjalan di latar belakang tanpa perlu buka laptop/HP.
// 0 KUOTA CLOUDFLARE — Mengambil data pasar langsung dari public exchange feed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFullAnalysis } from '../public/js/shared/signal-engine.js';
import { calcEMA, calcSMA } from '../public/js/shared/quant-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '../.sentinel-cache.json');

// Ambil token & chatId dari environment variable (GitHub Secrets)
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN || '').trim().replace(/^bot/i, '');
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || process.env.TG_CHAT_ID || process.env.CHAT_ID || '').trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '');
const MIN_SCORE = parseInt(process.env.SENTINEL_MIN_SCORE || '78', 10) || 78;

console.log('⚡ [XSTARZG SENTINEL] Memulai pemindaian pasar 24/7...');
console.log(`📌 Konfigurasi: Min Score: ${MIN_SCORE}% | Bot Token Terpasang: ${BOT_TOKEN ? 'YA' : 'TIDAK'} | Chat ID: ${CHAT_ID ? 'YA' : 'TIDAK'}`);

// Load / save sentinel cache to prevent duplicate alerts
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { notified: {}, slPlusLocks: {} };
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {}
}

export async function syncJournalToCloud(payload) {
  const apiHosts = [
    process.env.XSTARZG_API_HOST,
    'https://xstarzganalysis.pages.dev',
    'https://xstarzg-analysis.pages.dev'
  ].filter(Boolean);
  const secret = process.env.SENTINEL_SECRET || 'xstarzg-2026-quant-secret';

  for (const host of apiHosts) {
    try {
      if (typeof fetch !== 'function') break;
      const res = await fetch(`${host}/api/market/journal-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentinel-Key': secret,
          'User-Agent': 'XStarZG-Sentinel/1.0'
        },
        body: JSON.stringify(payload)
      });
      if (res && res.ok) return await res.json();
    } catch (e) {}
  }
  return null;
}

export async function syncActiveLocksFromCloud(cache) {
  if (!cache || typeof cache !== 'object') return;
  cache.slPlusLocks = cache.slPlusLocks || {};
  const apiHosts = [
    process.env.XSTARZG_API_HOST,
    'https://xstarzganalysis.pages.dev',
    'https://xstarzg-analysis.pages.dev'
  ].filter(Boolean);

  for (const host of apiHosts) {
    try {
      if (typeof fetch !== 'function') break;
      const res = await fetch(`${host}/api/market/journal-sync`);
      if (res && res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.activeLocks)) {
          for (const l of data.activeLocks) {
            if (l && l.symbol && !cache.slPlusLocks[l.symbol]) {
              cache.slPlusLocks[l.symbol] = l;
            }
          }
        }
        break;
      }
    } catch (e) {}
  }
}

let RESOLVED_BOT_TOKEN = '';

async function getActiveSubscribers() {
  const recipients = new Map();
  const defaultLang = process.env.TELEGRAM_LANG || 'id';
  if (CHAT_ID) recipients.set(CHAT_ID, { chatId: CHAT_ID, lang: defaultLang });

  const apiHosts = [
    process.env.XSTARZG_API_HOST,
    'https://xstarzganalysis.pages.dev',
    'https://xstarzg-analysis.pages.dev'
  ].filter(Boolean);
  const secret = process.env.SENTINEL_SECRET || 'xstarzg-2026-quant-secret';

  for (const apiHost of apiHosts) {
    try {
      const res = await fetch(`${apiHost}/api/notify/telegram-subscribers?key=${encodeURIComponent(secret)}`, {
        headers: {
          'X-Sentinel-Key': secret,
          'X-Bot-Token': (BOT_TOKEN || ''),
          'User-Agent': 'XStarZG-Sentinel/1.0'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.botToken && !RESOLVED_BOT_TOKEN) {
          RESOLVED_BOT_TOKEN = String(data.botToken).trim().replace(/^bot/i, '');
        }
        if (data && Array.isArray(data.subscribers)) {
          for (const sub of data.subscribers) {
            if (sub && sub.chat_id) {
              const cid = String(sub.chat_id);
              let lang = sub.lang;
              if (!lang) {
                const em = String(sub.email || '').toLowerCase();
                if (sub.is_owner === 1 || em.includes('.id') || em.includes('sevenfoldarmy')) {
                  lang = 'id';
                } else {
                  lang = 'en';
                }
              }
              recipients.set(cid, { chatId: cid, lang, email: sub.email });
            }
          }
          if (recipients.size > 0) break;
        }
      }
    } catch (e) {}
  }

  return Array.from(recipients.values());
}

async function sendTelegramMessage(text, payload = {}) {
  const activeBotToken = BOT_TOKEN || RESOLVED_BOT_TOKEN;
  const recipients = await getActiveSubscribers();

  if (!recipients.length) {
    console.log('⚠️ [Telegram] Tidak ada penerima aktif terdaftar (Owner / VIP). Pesan dicetak ke console:');
    console.log(text.replace(/<[^>]+>/g, ''));
    return false;
  }

  if (activeBotToken) {
    console.log(`📤 Mengirim notifikasi ke ${recipients.length} penerima VIP/Owner...`);
    let successCount = 0;

    for (const rec of recipients) {
      const cid = typeof rec === 'object' ? rec.chatId : rec;
      const lang = typeof rec === 'object' ? (rec.lang || 'id') : 'id';
      const msgText = (lang === 'id' || lang === 'ms') ? (payload.id || text) : (payload.en || text);

      try {
        const url = `https://api.telegram.org/bot${activeBotToken}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cid,
            text: msgText,
            parse_mode: 'HTML'
          })
        });
        const json = await res.json();
        if (json && json.ok) {
          successCount++;
        } else {
          console.error(`  ❌ [Telegram Error CID ${cid}]:`, json && json.description);
        }
      } catch (err) {
        console.error(`  ❌ [Telegram Network Error CID ${cid}]:`, err.message);
      }
      // Jeda 40ms antar pesan untuk menjaga kepatuhan rate-limit Telegram
      await new Promise(r => setTimeout(r, 40));
    }

    console.log(`✅ [Telegram] Notifikasi sukses terkirim ke ${successCount}/${recipients.length} penerima.`);
    return successCount > 0;
  }

  // Fallback jika token bot belum ada di env GitHub: kirim via endpoint Cloudflare
  const apiHosts = [
    process.env.XSTARZG_API_HOST,
    'https://xstarzganalysis.pages.dev',
    'https://xstarzg-analysis.pages.dev'
  ].filter(Boolean);

  let successCount = 0;
  for (const rec of recipients) {
    const cid = typeof rec === 'object' ? rec.chatId : rec;
    const lang = typeof rec === 'object' ? (rec.lang || 'id') : 'id';
    const msgText = (lang === 'id' || lang === 'ms') ? (payload.id || text) : (payload.en || text);
    let sentThisRec = false;

    for (const host of apiHosts) {
      if (sentThisRec) break;
      // 1. Coba endpoint relay /api/notify/telegram
      try {
        const res = await fetch(`${host}/api/notify/telegram`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Sentinel-Key': secret
          },
          body: JSON.stringify({ chatId: cid, text: msgText })
        });
        const json = await res.json();
        if (json && json.ok) {
          sentThisRec = true;
          successCount++;
          break;
        }
      } catch (e) {}

      // 2. Coba endpoint /api/notify/telegram-link dengan X-Sentinel-Key
      try {
        const res = await fetch(`${host}/api/notify/telegram-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Sentinel-Key': secret
          },
          body: JSON.stringify({ action: 'send_alert', chatId: cid, text: msgText })
        });
        const json = await res.json();
        if (json && json.ok) {
          sentThisRec = true;
          successCount++;
          break;
        }
      } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 40));
  }

  if (successCount > 0) {
    console.log(`✅ [Telegram Relay] Notifikasi sukses terkirim ke ${successCount}/${recipients.length} penerima via Cloudflare.`);
    return true;
  }
  return false;

  console.log('⚠️ [Telegram] Token belum disetel di GitHub Secrets. Pesan hanya dicetak ke console:');
  console.log(text.replace(/<[^>]+>/g, ''));
  return false;
}

// Fetch crypto candles from Binance public API
async function fetchBinanceCandles(pair, interval = '1h', limit = 150) {
  const sym = pair.replace('/', '').toUpperCase();
  const hosts = ['https://data-api.binance.vision', 'https://api.binance.com'];
  for (const host of hosts) {
    try {
      const url = `${host}/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'XStarZG-Sentinel/1.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) continue;
      return data.map(d => ({
        time: Math.floor(Number(d[0]) / 1000),
        open: Number(d[1]),
        high: Number(d[2]),
        low: Number(d[3]),
        close: Number(d[4]),
        volume: Number(d[5])
      }));
    } catch (e) {}
  }
  return [];
}

let CACHED_BTC_TREND = null;

export async function resolveBtcMacroTrend() {
  if (CACHED_BTC_TREND) return CACHED_BTC_TREND;
  try {
    const btcCandles = await fetchBinanceCandles('BTC/USDT', '1h', 100);
    if (btcCandles && btcCandles.length >= 35) {
      const closes = btcCandles.map(c => c.close);
      const last = closes[closes.length - 1];
      const ema20 = calcEMA(closes, 20).pop() || last;
      const ema50 = calcEMA(closes, 50).pop() || last;
      const sma100 = calcSMA(closes, 100).pop() || ema50;
      if (last > ema50 && ema20 > ema50 && last >= sma100) {
        CACHED_BTC_TREND = 'BULLISH';
      } else if (last < ema50 && ema20 < ema50 && last <= sma100) {
        CACHED_BTC_TREND = 'BEARISH';
      } else {
        CACHED_BTC_TREND = 'NEUTRAL';
      }
    } else {
      CACHED_BTC_TREND = 'NEUTRAL';
    }
  } catch (e) {
    CACHED_BTC_TREND = 'NEUTRAL';
  }
  return CACHED_BTC_TREND;
}

// Fetch forex / commodities candles from Yahoo Finance
const YAHOO_SYMBOLS = {
  // Metals
  'XAU/USD': 'GC=F',
  'GOLD': 'GC=F',
  'XAG/USD': 'SI=F',
  'SILVER': 'SI=F',
  'XPT/USD': 'PL=F',
  'PLATINUM': 'PL=F',
  'XPD/USD': 'PA=F',
  'PALLADIUM': 'PA=F',
  'HG/USD': 'HG=F',
  'COPPER': 'HG=F',
  // Commodities
  'WTI/OIL': 'CL=F',
  'WTI': 'CL=F',
  'BRENT': 'BZ=F',
  'NATGAS': 'NG=F',
  'CPO': 'FCPO=F',
  'COAL': 'NCF=F',
  // Forex Majors & Crosses
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'USDJPY=X',
  'AUD/USD': 'AUDUSD=X',
  'USD/CAD': 'USDCAD=X',
  'USD/CHF': 'USDCHF=X',
  'NZD/USD': 'NZDUSD=X',
  'USD/IDR': 'USDIDR=X',
  'EUR/JPY': 'EURJPY=X',
  'GBP/JPY': 'GBPJPY=X',
  'AUD/JPY': 'AUDJPY=X',
  'CAD/JPY': 'CADJPY=X',
  'CHF/JPY': 'CHFJPY=X',
  'NZD/JPY': 'NZDJPY=X',
  'EUR/GBP': 'EURGBP=X',
  'EUR/AUD': 'EURAUD=X',
  'GBP/AUD': 'GBPAUD=X',
  'EUR/CAD': 'EURCAD=X',
  'GBP/CAD': 'GBPCAD=X',
  'AUD/CAD': 'AUDCAD=X',
  'AUD/NZD': 'AUDNZD=X',
  // Index & Equities
  'IHSG': '^JKSE',
  'SPY': 'SPY',
  'QQQ': 'QQQ',
  'NVDA': 'NVDA',
  'AAPL': 'AAPL',
  'MSFT': 'MSFT',
  'TSLA': 'TSLA',
  'AMD': 'AMD',
  'AMZN': 'AMZN',
  'META': 'META',
  'GOOGL': 'GOOGL'
};

async function fetchYahooCandles(symbol, tf = 'H1') {
  let ySym = YAHOO_SYMBOLS[symbol];
  if (!ySym) {
    if (symbol.includes('/')) {
      ySym = symbol.replace('/', '') + '=X';
    } else {
      ySym = symbol;
    }
  }
  const tfMap = { 'M15': { i: '15m', r: '5d' }, 'H1': { i: '60m', r: '1mo' }, 'H4': { i: '60m', r: '3mo', resample: 4 }, 'D1': { i: '1d', r: '1y' } };
  const cfg = tfMap[tf] || tfMap['H1'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=${cfg.i}&range=${cfg.r}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const node = json && json.chart && json.chart.result && json.chart.result[0];
  const ts = node && Array.isArray(node.timestamp) ? node.timestamp : [];
  const q = node && node.indicators && node.indicators.quote && node.indicators.quote[0];
  if (!ts.length || !q || !Array.isArray(q.close)) return [];

  let candles = [];
  for (let k = 0; k < ts.length; k++) {
    const c = Number(q.close[k]), o = Number(q.open[k]), h = Number(q.high[k]), l = Number(q.low[k]);
    if (!Number.isFinite(c) || !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || c <= 0) continue;
    candles.push({ time: ts[k], open: o, high: Math.max(h, o, c), low: Math.min(l, o, c), close: c, volume: Number(q.volume && q.volume[k]) || 100 });
  }

  if (cfg.resample && cfg.resample > 1) {
    const bucketSec = cfg.resample * 3600;
    const m = new Map();
    for (const c of candles) {
      const b = Math.floor(c.time / bucketSec) * bucketSec;
      const g = m.get(b);
      if (!g) m.set(b, { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
      else { g.high = Math.max(g.high, c.high); g.low = Math.min(g.low, c.low); g.close = c.close; g.volume += c.volume; }
    }
    candles = [...m.values()].sort((a, b) => a.time - b.time);
  }
  return candles.slice(-200);
}

export async function fetchFromXstarzgApi(symbol, tf = 'H1') {
  const apiHosts = [
    process.env.XSTARZG_API_HOST,
    'https://xstarzganalysis.pages.dev',
    'https://xstarzg-analysis.pages.dev'
  ].filter(Boolean);

  for (const host of apiHosts) {
    try {
      const url = `${host}/api/market/analyze?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&_t=${Date.now()}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'XStarZG-Sentinel/1.0' },
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && Array.isArray(json.candles) && json.candles.length >= 35) {
        return json.candles;
      }
    } catch (e) {}
  }
  return [];
}

// Format price helper
export function formatP(val, sym) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '-';
  if ((sym || '').includes('JPY')) return n.toFixed(3);
  if ((sym || '').includes('XAU') || (sym || '').includes('BTC') || n > 500) return n.toFixed(2);
  if (n < 1) return n.toFixed(5);
  return n.toFixed(4);
}

export function isAssetMarketOpen(symbol) {
  const s = String(symbol || '').toUpperCase().trim();
  // 1. Kripto selalu buka 24/7/365 nonstop
  if (s.includes('/USDT') || s.includes('BTC') || s.includes('ETH') || s.includes('SOL') || s.includes('/USDC') || s.includes('/BNB')) return true;

  const now = new Date();
  const dayUtc = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const hourUtc = now.getUTCHours();
  const minuteUtc = now.getUTCMinutes();
  const timeUtc = hourUtc + minuteUtc / 60;

  // 2. Akhir Pekan Global (Sabtu & Minggu sebelum sesi Asia buka jam 21:00 UTC)
  if (dayUtc === 6) return false;
  if (dayUtc === 0 && hourUtc < 21) return false;
  if (dayUtc === 5 && hourUtc >= 22) return false;

  // 3. Saham Indonesia (IDX / .JK / IHSG):
  // Jam bursa: Senin - Jumat, 09:00 - 16:00 WIB (02:00 - 09:00 UTC)
  const isIdx = s.endsWith('.JK') || s === 'IHSG';
  if (isIdx) {
    if (dayUtc === 0 || dayUtc === 6) return false;
    if (timeUtc < 2.0 || timeUtc >= 9.0) return false;
    return true;
  }

  // 4. Saham Wall Street US (NVDA, AAPL, MSFT, TSLA, SPY, QQQ, dll.):
  // Jam bursa reguler: Senin - Jumat, 09:30 - 16:00 EST (14:30 - 21:00 UTC)
  const isUsStock = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD', 'AMZN', 'META', 'GOOGL', 'SPY', 'QQQ', 'COIN', 'MSTR'].includes(s);
  if (isUsStock) {
    if (dayUtc === 0 || dayUtc === 6) return false;
    if (timeUtc < 14.5 || timeUtc >= 21.0) return false;
    return true;
  }

  // 5. Forex & Komoditas/Metals (XAU/USD, EUR/USD, WTI, dll.):
  // Buka 24 jam nonstop dari Minggu 21:00 UTC s/d Jumat 22:00 UTC
  return true;
}

// 75 Koin Kripto Likuiditas Teratas (M5 scalping, M15 scalping, H1 intraday)
const TOP_CRYPTO_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT',
  'LINK/USDT', 'TON/USDT', 'SUI/USDT', 'DOT/USDT', 'NEAR/USDT', 'APT/USDT', 'ARB/USDT', 'OP/USDT',
  'MATIC/USDT', 'POL/USDT', 'LDO/USDT', 'TIA/USDT', 'SEI/USDT', 'INJ/USDT', 'SATS/USDT', 'ORDI/USDT',
  'RUNE/USDT', 'ICP/USDT', 'HBAR/USDT', 'STX/USDT', 'FIL/USDT', 'KAS/USDT', 'RENDER/USDT', 'FET/USDT',
  'TAO/USDT', 'GRT/USDT', 'WIF/USDT', 'PEPE/USDT', 'BONK/USDT', 'FLOKI/USDT', 'SHIB/USDT', 'BCH/USDT',
  'LTC/USDT', 'ETC/USDT', 'UNI/USDT', 'AAVE/USDT', 'MKR/USDT', 'CRV/USDT', 'PENDLE/USDT', 'ENA/USDT',
  'JUP/USDT', 'PYTH/USDT', 'WLD/USDT', 'STRK/USDT', 'BLUR/USDT', 'DYDX/USDT', 'GALA/USDT', 'SAND/USDT',
  'MANA/USDT', 'AXS/USDT', 'ALGO/USDT', 'ATOM/USDT', 'FTM/USDT', 'KCS/USDT', 'AR/USDT', 'CHZ/USDT',
  'ENJ/USDT', 'ZIL/USDT', 'THETA/USDT', 'FLOW/USDT', 'SNX/USDT', 'COMP/USDT', 'AGIX/USDT', 'MEME/USDT',
  'JTO/USDT', 'ONDO/USDT', '1INCH/USDT', 'ENS/USDT', 'SUSHI/USDT'
];

// Logam Mulia & Komoditas Energi (M15 scalping & H1 intraday)
const COMMODITY_WATCHLIST = [
  'XAU/USD', 'XAG/USD', 'WTI/OIL', 'BRENT', 'NATGAS', 'HG/USD', 'XPT/USD'
];

// Pasangan Forex Major & Crosses Lengkap (M15 scalping & H1 intraday)
const FOREX_WATCHLIST = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD',
  'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'CAD/JPY', 'CHF/JPY', 'NZD/JPY', 'EUR/GBP',
  'EUR/AUD', 'GBP/AUD', 'EUR/CAD', 'GBP/CAD', 'AUD/CAD', 'AUD/NZD', 'USD/IDR'
];

// Saham Bluechip Unggulan IHSG Indonesia (H1 intraday)
const IDX_STOCKS_WATCHLIST = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'ANTM.JK',
  'BRIS.JK', 'ICBP.JK', 'INDF.JK', 'KLBF.JK', 'UNVR.JK', 'PGAS.JK', 'ADRO.JK',
  'PTBA.JK', 'MDKA.JK', 'CPIN.JK', 'AMRT.JK', 'GOTO.JK', 'IHSG'
];

// Saham Raksasa Wall Street & Indeks AS (H1 intraday & M15 scalping)
const US_STOCKS_WATCHLIST = [
  'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD', 'AMZN', 'META', 'GOOGL', 'SPY', 'QQQ'
];

// Watchlist instrumen institusional utama adaptif lintas kelas aset
export const WATCHLIST = [
  // Logam Mulia & Komoditas (H1 & M15)
  ...COMMODITY_WATCHLIST.flatMap(sym => [
    { sym, tf: 'H1', type: 'commodity', hz: 'intraday' },
    { sym, tf: 'M15', type: 'commodity', hz: 'scalping' }
  ]),
  // Forex Majors & Crosses (H1 & M15)
  ...FOREX_WATCHLIST.flatMap(sym => [
    { sym, tf: 'H1', type: 'forex', hz: 'intraday' },
    { sym, tf: 'M15', type: 'forex', hz: 'scalping' }
  ]),
  // Saham Bluechip IDX Indonesia (H1 Intraday saat jam bursa BEI)
  ...IDX_STOCKS_WATCHLIST.flatMap(sym => [
    { sym, tf: 'H1', type: 'stock_id', hz: 'intraday' }
  ]),
  // Saham Wall Street US & ETF Indeks (H1 & M15 saat sesi US)
  ...US_STOCKS_WATCHLIST.flatMap(sym => [
    { sym, tf: 'H1', type: 'stock_us', hz: 'intraday' },
    { sym, tf: 'M15', type: 'stock_us', hz: 'scalping' }
  ]),
  // Seluruh Koin Kripto Likuiditas Teratas (24/7/365: H1, M15, M5)
  ...TOP_CRYPTO_SYMBOLS.flatMap(sym => [
    { sym, tf: 'H1', type: 'crypto', hz: 'intraday' },
    { sym, tf: 'M15', type: 'crypto', hz: 'scalping' },
    { sym, tf: 'M5', type: 'crypto', hz: 'scalping' }
  ])
];

export async function processInstrumentAnalysis({ inst, candles, a, cache, sendFn = sendTelegramMessage, minScore = MIN_SCORE }) {
  const { sym, tf, hz } = inst;
  if (!candles || candles.length < 35 || !a || a.error) return;

  const score = Number(a.confluenceScore || a.confidence || 0);
  const dir = a.direction;
  const lastBar = candles[candles.length - 1];
  const livePrice = lastBar.close;

  console.log(`  [${sym} ${tf}] Harga: ${formatP(livePrice, sym)} | Setup: ${dir || 'NEUTRAL'} | Skor: ${score}% | Tier: ${a.signalTier || '—'}`);

  // 1. Cek Sinyal Skor Tinggi Baru (>= MIN_SCORE) dengan verifikasi Top-Down Alignment
  const isTopDownAligned = !a.topDown || a.topDown.isAligned;
  if (!isTopDownAligned && a.topDown && a.topDown.alignmentStatus === 'WAITING_ALIGNMENT') {
    console.log(`  [${sym} ${tf}] 🟡 Menunggu keselarasan pasar Top-Down (1D/4H vs 1H/15m) — anti counter-trend noise.`);
  }

  // Anti-Countertrend Crypto Beta Guard:
  // DILARANG membuka SHORT pada altcoin jika BTC makro sedang BULLISH kuat
  // DILARANG membuka LONG pada altcoin jika BTC makro sedang BEARISH kuat
  const btcTrend = inst.btcTrend || null;
  const isAltcoin = inst.type === 'crypto' && sym !== 'BTC/USDT';
  if (isAltcoin && btcTrend) {
    if (btcTrend === 'BULLISH' && dir === 'SHORT') {
      console.log(`  [${sym} ${tf}] 🛡️ [CRYPTO BETA GUARD] SHORT dibatalkan: BTC makro sedang BULLISH kuat. Dilarang melawan arus utama kripto!`);
      return;
    }
    if (btcTrend === 'BEARISH' && dir === 'LONG') {
      console.log(`  [${sym} ${tf}] 🛡️ [CRYPTO BETA GUARD] LONG dibatalkan: BTC makro sedang BEARISH kuat. Dilarang menangkap pisau jatuh!`);
      return;
    }
  }

  // Filter Khusus Emas (XAU/USD) untuk Keakuratan Kompetisi
  const isGold = sym === 'XAU/USD';
  if (isGold) {
    if (a.sessionInfo && !a.sessionInfo.isOptimal && score < 82) {
      console.log(`  [XAU/USD ${tf}] 🟡 Emas di luar sesi likuiditas puncak London/NY — hanya sinyal Tier ELITE (skor ≥ 82%) yang diizinkan.`);
      return;
    }
  }

  if (a.signalEligible && (dir === 'LONG' || dir === 'SHORT') && score >= minScore && isTopDownAligned) {
    const L = a.levels || {};
    const anchorTime = a.anchorClosedTime || lastBar.time;
    const setupKey = `${sym}|${tf}|${dir}|${anchorTime}`;

    if (!cache.notified[setupKey]) {
      if ((cache.newAlertsThisRun || 0) >= 2) {
        console.log(`  [${sym} ${tf}] 🛡️ [ANTI-SPAM] Sinyal skor tinggi (${score}%) ditahan karena batas 2 sinyal terbaik per siklus telah terpenuhi.`);
        return;
      }
      cache.notified[setupKey] = Date.now();
      cache.newAlertsThisRun = (cache.newAlertsThisRun || 0) + 1;

      const hzLabel = hz === 'scalping' ? '⚡ SCALPING' : (hz === 'swing' ? '🌊 SWING' : '🎯 INTRADAY');
      const dirEmoji = dir === 'LONG' ? '🟢 BUY / LONG' : '🔴 SELL / SHORT';
      const tierTxt = a.signalTier === 'ELITE' ? 'ELITE ★' : 'PRO';
      const atr = a.atr || (livePrice * 0.005);

      const isCrypto = (sym || '').includes('/USDT') || (sym || '').includes('BTC') || (sym || '').includes('ETH') || (sym || '').includes('SOL');
      const isStock = (sym || '').includes('.JK') || ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'SPY', 'QQQ'].includes(sym);
      const platformName = isCrypto ? 'exchange kripto pilihan Anda (Binance/Bybit/Tokocrypto/OKX)' : isStock ? 'aplikasi sekuritas/broker saham Anda' : 'broker/aplikasi trading Anda';
      const platformNameEn = isCrypto ? 'your preferred crypto exchange' : isStock ? 'your stock brokerage app' : 'your trading platform / broker';

      // Sniper Entry: Wajib Limit Order di zona mitigasi diskon/premium
      // Dilarang mengejar harga pasar di pucuk atau lembah!
      const isLong = dir === 'LONG';
      const entryPrice = L.entry || (isLong ? livePrice - 0.20 * atr : livePrice + 0.20 * atr);
      const orderType = isLong ? 'BUY LIMIT' : 'SELL LIMIT';
      const orderInstruction = isLong
        ? `Pasang antrian <b>BUY LIMIT</b> di <code>${formatP(entryPrice, sym)}</code> pada zona diskon Order Block / FVG mitigasi (jangan kejar harga di pucuk!).`
        : `Pasang antrian <b>SELL LIMIT</b> di <code>${formatP(entryPrice, sym)}</code> pada zona premium Order Block / FVG mitigasi (jangan kejar harga di lembah!).`;
      const orderInstructionEn = isLong
        ? `Place a <b>BUY LIMIT</b> order at <code>${formatP(entryPrice, sym)}</code> in the discount Order Block / FVG mitigation zone (never chase market price at peaks!).`
        : `Place a <b>SELL LIMIT</b> order at <code>${formatP(entryPrice, sym)}</code> in the premium Order Block / FVG mitigation zone (never chase market price at lows!).`;

      let topDownBlock = '';
      if (a.topDown) {
        const td = a.topDown;
        topDownBlock =
          `📊 <b>KESELARASAN PASAR (TOP-DOWN ALIGNED):</b>\n` +
          `• 1D–4H Makro: <b>${td.macroBias}</b> (Arah & Likuiditas)\n` +
          `• 1H–15m Struktur: <b>${td.structBias}</b> (Order Block & FVG)\n` +
          `• 5m–1m Eksekusi: <b>${dir}</b> (Konfirmasi Entry)\n` +
          (td.sessionFlow && td.sessionFlow.story ? `⚡ Order Flow: <i>${td.sessionFlow.story}</i>\n` : '');
      }

      let sessionBlock = '';
      if (a.sessionInfo) {
        const sess = a.sessionInfo;
        sessionBlock = `🏛️ <b>Sesi Optimal:</b> <code>${sess.bestSession}</code> (${sess.isOptimal ? 'Puncak Likuiditas 🔥' : 'Sesi Reguler'})\n`;
      }

      const alertMsg =
        `🚀 <b>[XSTARZG 24/7 CLOUD — PELUANG SKOR BESAR (${tierTxt})]</b>\n\n` +
        `Aset: <b>${sym}</b> (${tf} • ${hzLabel})\n` +
        `Setup: <b>${dirEmoji} (${tierTxt} SETUP)</b>\n` +
        `Confidence Score: <b>${score}%</b>\n` +
        `Regime: <i>${a.regime || 'Institutional Flow'}</i>\n` +
        (sessionBlock ? `${sessionBlock}` : '') +
        (topDownBlock ? `\n${topDownBlock}\n` : '\n') +
        `📌 <b>Tipe Order:</b> <code>${orderType}</code>\n` +
        `🎯 <b>Titik Entry:</b> <code>${formatP(entryPrice, sym)}</code>\n` +
        `🛡️ <b>Stop Loss:</b> <code>${formatP(L.sl, sym)}</code>\n` +
        `✅ <b>Take Profit 1:</b> <code>${formatP(L.tp1, sym)}</code>\n` +
        (L.tp2 ? `✅ <b>Take Profit 2:</b> <code>${formatP(L.tp2, sym)}</code>\n` : '') +
        (L.tp3 ? `🚀 <b>Target TP3:</b> <code>${formatP(L.tp3, sym)}</code>\n` : '') +
        `\n📱 <i>${orderInstruction} Buka ${platformName}. Bot memantau posisi dan akan mengirim peringatan SL+ (0-Risk) setelah order terisi dan meluncur menuju profit!</i>`;

      const hzLabelEn = hz === 'scalping' ? '⚡ SCALPING' : (hz === 'swing' ? '🌊 SWING' : '🎯 INTRADAY');

      let topDownBlockEn = '';
      if (a.topDown) {
        const td = a.topDown;
        topDownBlockEn =
          `📊 <b>MARKET ALIGNMENT (TOP-DOWN ALIGNED):</b>\n` +
          `• 1D–4H Macro: <b>${td.macroBias}</b> (Direction & Liquidity)\n` +
          `• 1H–15m Structure: <b>${td.structBias}</b> (OB & FVG)\n` +
          `• 5m–1m Execution: <b>${dir}</b> (Entry Confirmation)\n` +
          (td.sessionFlow && td.sessionFlow.story ? `⚡ Order Flow: <i>${td.sessionFlow.story}</i>\n` : '');
      }

      let sessionBlockEn = '';
      if (a.sessionInfo) {
        const sess = a.sessionInfo;
        sessionBlockEn = `🏛️ <b>Optimal Session:</b> <code>${sess.bestSession}</code> (${sess.isOptimal ? 'Peak Liquidity 🔥' : 'Regular Hours'})\n`;
      }

      const alertMsgEn =
        `🚀 <b>[XSTARZG 24/7 CLOUD — NEW HIGH-SCORE OPPORTUNITY (${tierTxt})]</b>\n\n` +
        `Asset: <b>${sym}</b> (${tf} • ${hzLabelEn})\n` +
        `Setup: <b>${dirEmoji} (${tierTxt} SETUP)</b>\n` +
        `Confidence Score: <b>${score}%</b>\n` +
        `Market Regime: <i>${a.regime || 'Institutional Flow'}</i>\n` +
        (sessionBlockEn ? `${sessionBlockEn}` : '') +
        (topDownBlockEn ? `\n${topDownBlockEn}\n` : '\n') +
        `📌 <b>Order Type:</b> <code>${orderType}</code>\n` +
        `🎯 <b>Entry Level:</b> <code>${formatP(entryPrice, sym)}</code>\n` +
        `🛡️ <b>Stop Loss:</b> <code>${formatP(L.sl, sym)}</code>\n` +
        `✅ <b>Take Profit 1:</b> <code>${formatP(L.tp1, sym)}</code>\n` +
        (L.tp2 ? `✅ <b>Take Profit 2:</b> <code>${formatP(L.tp2, sym)}</code>\n` : '') +
        (L.tp3 ? `🚀 <b>Target TP3:</b> <code>${formatP(L.tp3, sym)}</code>\n` : '') +
        `\n📱 <i>${orderInstructionEn} Open ${platformNameEn}. Cloud bot monitors this position 24/7 and will send an SL+ (0-Risk) alert once filled and moving into profit!</i>`;

      await sendFn(alertMsg, { id: alertMsg, en: alertMsgEn });

      // Daftarkan ke pengawasan order
      // PENTING: flag `justCreated = true` MENJAMIN step 2 tidak mengevaluasi SL+ pada cycle yang sama!
      const anchorClosedTime = lastBar ? lastBar.time : (a.anchorClosedTime || Date.now());
      const lockObj = {
        symbol: sym,
        tf: tf,
        direction: dir,
        orderType: orderType,
        entry: entryPrice,
        sl: L.sl,
        tp1: L.tp1,
        tp2: L.tp2,
        tp3: L.tp3,
        atr: atr,
        status: 'PENDING_FILL',
        filled: false,
        filledAt: null,
        notifiedSlPlus: false,
        notifiedTp1: false,
        created: Date.now(),
        issuedAt: Date.now(),
        anchorClosedTime: anchorClosedTime,
        justCreated: true
      };
      cache.slPlusLocks[sym] = lockObj;
      await syncJournalToCloud({ action: 'save_lock', lock: lockObj });
    }
  }

  // 2. Pemantauan Posisi & SL+ (0-Risk Break-Even Plus Trigger)
  const activeLock = cache.slPlusLocks[sym];
  if (!activeLock) return;
  if (activeLock.tf && activeLock.tf !== tf) return;

  // 2a. Guard anti double-ping: jika order baru saja diterbitkan di tick ini, lewati
  if (activeLock.justCreated) {
    delete activeLock.justCreated;
    return;
  }

  const isLong = activeLock.direction === 'LONG';
  const entry = Number(activeLock.entry);
  const sl = Number(activeLock.sl);
  const tp1 = Number(activeLock.tp1);
  const targetDist = Math.abs(tp1 - entry);

  // 2b. Verifikasi Keterisian Limit Order (hanya jika belum terisi)
  if (!activeLock.filled) {
    let gotFilled = false;
    // PENTING: Limit order hanya boleh terisi jika:
    // 1. livePrice saat ini benar-benar menyentuh level antrian entry (livePrice <= entry untuk LONG, livePrice >= entry untuk SHORT)
    // 2. ATAU candle BARU yang terbentuk setelah sinyal terbit (lastBar.time > activeLock.anchorClosedTime) menjemput entry.
    // DILARANG memakai lastBar.low/high dari candle yang sama saat sinyal terbit, karena terjadi di masa lalu sebelum order limit dipasang!
    const isNewBar = lastBar && activeLock.anchorClosedTime && (lastBar.time > activeLock.anchorClosedTime);
    if (isLong) {
      if (livePrice <= entry || (isNewBar && lastBar.low <= entry)) gotFilled = true;
    } else {
      if (livePrice >= entry || (isNewBar && lastBar.high >= entry)) gotFilled = true;
    }

    if (gotFilled) {
      activeLock.filled = true;
      activeLock.status = 'FILLED';
      activeLock.filledAt = Date.now();
      activeLock.fillBarTime = lastBar ? lastBar.time : Date.now();
      console.log(`  [${sym} ${tf}] 🔔 Limit Order TERJEMPUT pada ${formatP(entry, sym)}! Posisi aktif dipantau.`);
      await syncJournalToCloud({ action: 'save_lock', lock: activeLock });
    } else {
      // Cek apakah target sudah tercapai sebelum order sempat dijemput (MISSED)
      const missed = isLong ? (livePrice >= tp1 || (isNewBar && lastBar.high >= tp1)) : (livePrice <= tp1 || (isNewBar && lastBar.low <= tp1));
      if (missed) {
        console.log(`  [${sym} ${tf}] ↗️ Order terlewat (MISSED) — target tercapai sebelum terjemput.`);
        const cancelMsg =
          `⌛ <b>[XSTARZG 24/7 CLOUD — ORDER TERLEWAT / BATALKAN]</b>\n\n` +
          `Aset: <b>${sym}</b> (${activeLock.tf})\n` +
          `Setup: <b>${isLong ? '🟢 BUY' : '🔴 SELL'} LIMIT @ ${formatP(entry, sym)}</b>\n` +
          `Status: <b>TARGET TERCAPAI SEBELUM TERISI (MISSED)</b>\n\n` +
          `⚠️ <b>AKSI WAJIB:</b>\n` +
          `<i>Segera batalkan (cancel) antrian limit order Anda pada exchange/broker sekarang! Target sudah tersentuh duluan tanpa menjemput antrian. Jangan biarkan order menggantung!</i>`;
        const cancelMsgEn =
          `⌛ <b>[XSTARZG 24/7 CLOUD — ORDER MISSED / CANCEL PENDING]</b>\n\n` +
          `Asset: <b>${sym}</b> (${activeLock.tf})\n` +
          `Setup: <b>${isLong ? '🟢 BUY' : '🔴 SELL'} LIMIT @ ${formatP(entry, sym)}</b>\n` +
          `Status: <b>TARGET REACHED BEFORE FILL (MISSED)</b>\n\n` +
          `⚠️ <b>REQUIRED ACTION:</b>\n` +
          `<i>Cancel your pending limit order on your broker/exchange now! Target was reached before tagging entry. Do not leave unfilled orders hanging!</i>`;
        await sendFn(cancelMsg, { id: cancelMsg, en: cancelMsgEn });
        await syncJournalToCloud({
          action: 'record_outcome',
          outcome: {
            symbol: sym,
            tf: activeLock.tf,
            status: 'MISSED',
            reason: 'Target tercapai sebelum limit order terisi',
            at: Date.now()
          }
        });
        delete cache.slPlusLocks[sym];
        return;
      }
      // Batalkan order jika kedaluwarsa (>12 bar / >60 menit untuk M5/M15, >12 jam untuk H1)
      const ageMs = activeLock.created ? (Date.now() - activeLock.created) : Infinity;
      const maxPendingMs = (activeLock.tf === 'M5' || activeLock.tf === 'M15') ? (60 * 60 * 1000) : (12 * 3600 * 1000);
      if (ageMs > maxPendingMs) {
        console.log(`  [${sym} ${tf}] ⏳ Limit order kedaluwarsa (>12 bar belum terjemput).`);
        const expMsg =
          `⌛ <b>[XSTARZG 24/7 CLOUD — ORDER KADALUWARSA / BATALKAN]</b>\n\n` +
          `Aset: <b>${sym}</b> (${activeLock.tf})\n` +
          `Setup: <b>${isLong ? '🟢 BUY' : '🔴 SELL'} LIMIT @ ${formatP(entry, sym)}</b>\n` +
          `Status: <b>EXPIRED (Waktu Tunggu Setup Habis)</b>\n\n` +
          `⚠️ <b>AKSI WAJIB BAGI TRADER:</b>\n` +
          `<i>Batalkan (cancel) antrian limit order ini sekarang! Durasi setup telah berakhir tanpa terisi (unfilled). Jangan lakukan entry karena momentum dan struktur pasar sudah berubah!</i>`;
        const expMsgEn =
          `⌛ <b>[XSTARZG 24/7 CLOUD — ORDER EXPIRED / CANCEL]</b>\n\n` +
          `Asset: <b>${sym}</b> (${activeLock.tf})\n` +
          `Setup: <b>${isLong ? '🟢 BUY' : '🔴 SELL'} LIMIT @ ${formatP(entry, sym)}</b>\n` +
          `Status: <b>EXPIRED (Pending Setup Timeout)</b>\n\n` +
          `⚠️ <b>REQUIRED ACTION:</b>\n` +
          `<i>Cancel this pending limit order now! Setup validity duration has expired without fill. Market structure has shifted!</i>`;
        await sendFn(expMsg, { id: expMsg, en: expMsgEn });
        await syncJournalToCloud({
          action: 'record_outcome',
          outcome: {
            symbol: sym,
            tf: activeLock.tf,
            status: 'EXPIRED',
            reason: 'Waktu tunggu limit order habis tanpa terisi',
            at: Date.now()
          }
        });
        delete cache.slPlusLocks[sym];
        return;
      }

      // Batalkan jika harga pasar saat ini sudah terlalu jauh (> 3x ATR) dari titik antri entry
      const entryDist = Math.abs(livePrice - entry);
      const maxPendingAtr = 3.0 * (activeLock.atr || (entry * 0.015));
      if (entryDist > maxPendingAtr) {
        console.log(`  [${sym} ${tf}] ↗️ Harga pasar (${formatP(livePrice, sym)}) sudah terlalu jauh dari entry (${formatP(entry, sym)}). Order dibatalkan.`);
        const cancelMsg =
          `🚫 <b>[XSTARZG 24/7 CLOUD — HARGA MENJAUH / BATALKAN ORDER]</b>\n\n` +
          `Aset: <b>${sym}</b> (${activeLock.tf})\n` +
          `Setup: <b>${isLong ? '🟢 BUY' : '🔴 SELL'} LIMIT @ ${formatP(entry, sym)}</b>\n` +
          `Status: <b>DIBATALKAN (Harga Lari > 3x ATR dari Entry)</b>\n\n` +
          `⚠️ <b>AKSI WAJIB:</b>\n` +
          `<i>Batalkan (cancel) antrian limit order ini sekarang! Harga pasar sudah melaju terlalu jauh tanpa menjemput antrian. Jangan mengejar harga (anti-chasing)!</i>`;
        const cancelMsgEn =
          `🚫 <b>[XSTARZG 24/7 CLOUD — PRICE MOVED AWAY / CANCEL ORDER]</b>\n\n` +
          `Asset: <b>${sym}</b> (${activeLock.tf})\n` +
          `Setup: <b>${isLong ? '🟢 BUY' : '🔴 SELL'} LIMIT @ ${formatP(entry, sym)}</b>\n` +
          `Status: <b>CANCELLED (Price ran > 3x ATR away without fill)</b>\n\n` +
          `⚠️ <b>REQUIRED ACTION:</b>\n` +
          `<i>Cancel your pending limit order on your broker/exchange now! Price has moved too far away without tagging entry. Avoid chasing price!</i>`;
        await sendFn(cancelMsg, { id: cancelMsg, en: cancelMsgEn });
        await syncJournalToCloud({
          action: 'record_outcome',
          outcome: {
            symbol: sym,
            tf: activeLock.tf,
            status: 'CANCELLED',
            reason: 'Harga pasar melaju terlalu jauh tanpa menjemput antrian limit order',
            at: Date.now()
          }
        });
        delete cache.slPlusLocks[sym];
        return;
      }
      // Order belum terisi -> JANGAN PERNAH mengevaluasi SL+!
      return;
    }
  }

  // 2c. Pemantauan SL+ (0-Risk BE+ Trigger)
  // PENTING: Evaluasi SL+ dijalankan TERLEBIH DAHULU agar trader PASTI menerima peringatan pasang SL+
  // sebelum posisi pernah dinyatakan keluar atau terselamatkan oleh SL+!
  if (!activeLock.notifiedSlPlus && targetDist > 0) {
    const isGold = (sym || '').includes('XAU');
    const triggerRatio = isGold ? 0.35 : 0.38;
    const beTriggerPrice = isLong ? (entry + triggerRatio * targetDist) : (entry - triggerRatio * targetDist);
    // Evaluasi SL+ hanya berdasarkan pergerakan nyata setelah terisi:
    // Pada bar pengisian (same bar as fill), gunakan livePrice agar tidak tertipu high/low sebelum penjemputan!
    const isPostFillBar = lastBar && activeLock.fillBarTime && (lastBar.time > activeLock.fillBarTime);
    const slPlusHit = isLong
      ? (livePrice >= beTriggerPrice || (isPostFillBar && lastBar.high >= beTriggerPrice))
      : (livePrice <= beTriggerPrice || (isPostFillBar && lastBar.low <= beTriggerPrice));

    if (slPlusHit) {
      activeLock.notifiedSlPlus = true;
      activeLock.slPlusAlerted = true;
      activeLock.bePlusActive = true;
      activeLock.slPlusBarTime = lastBar.time;
      const beBuffer = Math.max(0.08 * targetDist, 0.15 * (activeLock.atr || 1));
      const slPlusPrice = isLong ? (entry + beBuffer) : (entry - beBuffer);
      activeLock.slPlus = slPlusPrice;
      const slPriceTxt = formatP(slPlusPrice, sym);

      const isCryptoSym = (sym || '').includes('/USDT') || (sym || '').includes('BTC') || (sym || '').includes('ETH') || (sym || '').includes('SOL');
      const isStockSym = (sym || '').includes('.JK') || ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'SPY', 'QQQ'].includes(sym);
      const platTarget = isCryptoSym ? 'exchange kripto Anda' : isStockSym ? 'aplikasi sekuritas/saham Anda' : 'broker/aplikasi trading Anda';
      const platTargetEn = isCryptoSym ? 'your crypto exchange' : isStockSym ? 'your stock brokerage app' : 'your trading platform / broker';

      const slMsg =
        `🛡️ <b>[XSTARZG 24/7 CLOUD — SL+ TERPICU (0-RISK)]</b>\n\n` +
        `Aset: <b>${sym}</b> (${activeLock.tf})\n` +
        `Arah: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
        `Status: <b>TEREKSEKUSI & PROFIT BERJALAN (+${Math.round(triggerRatio * 100)}%)</b>\n` +
        `Entry Awal: <b>${formatP(entry, sym)}</b>\n` +
        `Harga Saat Ini: <b>${formatP(livePrice, sym)}</b>\n` +
        (isLong ?
          `Target Geser SL: <b>${slPriceTxt} (0-Risk BE+)</b>\n<i>(Pasang DI ATAS harga entry ${formatP(entry, sym)} untuk mengunci profit / posisi bebas risiko)</i>\n\n` +
          `⚠️ <i>Harga telah mencapai zona aman 0-Risk! Buka ${platTarget} sekarang dan naikkan Stop Loss ke ${slPriceTxt} agar modal terlindungi 100%!</i>` :
          `Target Geser SL: <b>${slPriceTxt} (0-Risk BE+)</b>\n<i>(Pasang DI BAWAH harga entry ${formatP(entry, sym)} untuk mengunci profit / posisi bebas risiko)</i>\n\n` +
          `⚠️ <i>Harga telah mencapai zona aman 0-Risk! Buka ${platTarget} sekarang dan turunkan Stop Loss ke ${slPriceTxt} agar modal terlindungi 100%!</i>`
        );

      const slMsgEn =
        `🛡️ <b>[XSTARZG 24/7 CLOUD — SL+ TRIGGERED (0-RISK)]</b>\n\n` +
        `Asset: <b>${sym}</b> (${activeLock.tf})\n` +
        `Direction: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
        `Status: <b>FILLED & PROFIT RUNNING (+${Math.round(triggerRatio * 100)}%)</b>\n` +
        `Initial Entry: <b>${formatP(entry, sym)}</b>\n` +
        `Current Price: <b>${formatP(livePrice, sym)}</b>\n` +
        (isLong ?
          `Move Stop Loss to: <b>${slPriceTxt} (0-Risk BE+)</b>\n<i>(Placed ABOVE entry price ${formatP(entry, sym)} to lock in profit / risk-free trade)</i>\n\n` +
          `⚠️ <i>Price reached the 0-Risk safety threshold! Open ${platTargetEn} now and adjust Stop Loss up to ${slPriceTxt} to secure 100% of your capital!</i>` :
          `Move Stop Loss to: <b>${slPriceTxt} (0-Risk BE+)</b>\n<i>(Placed BELOW entry price ${formatP(entry, sym)} to lock in profit / risk-free trade)</i>\n\n` +
          `⚠️ <i>Price reached the 0-Risk safety threshold! Open ${platTargetEn} now and adjust Stop Loss down to ${slPriceTxt} to secure 100% of your capital!</i>`
        );

      await sendFn(slMsg, { id: slMsg, en: slMsgEn });
      await syncJournalToCloud({ action: 'save_lock', lock: activeLock });
      return;
    }
  }

  // 2d. Cek eksekusi Take Profit 1
  const tpHit = isLong ? (lastBar.high >= tp1 || livePrice >= tp1) : (lastBar.low <= tp1 || livePrice <= tp1);
  if (tpHit && !activeLock.notifiedTp1) {
    activeLock.notifiedTp1 = true;
    const tpMsg =
      `🎉 <b>[XSTARZG 24/7 CLOUD — TAKE PROFIT 1 TERCAPAI!]</b>\n\n` +
      `Aset: <b>${sym}</b> (${activeLock.tf})\n` +
      `Arah: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
      `Titik Entry: <b>${formatP(entry, sym)}</b>\n` +
      `Target TP1: <b>${formatP(tp1, sym)} TERPENUHI!</b>\n\n` +
      `💰 <i>Tutup 50% lot untuk mengunci profit! Geser Stop Loss ke BE+ untuk sisa posisi yang mengincar TP2/TP3.</i>`;
    const tpMsgEn =
      `🎉 <b>[XSTARZG 24/7 CLOUD — TAKE PROFIT 1 REACHED!]</b>\n\n` +
      `Asset: <b>${sym}</b> (${activeLock.tf})\n` +
      `Direction: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
      `Entry Level: <b>${formatP(entry, sym)}</b>\n` +
      `Target TP1: <b>${formatP(tp1, sym)} HIT!</b>\n\n` +
      `💰 <i>Close 50% position to lock in profit! Move Stop Loss to BE+ for the remainder targeting TP2/TP3.</i>`;
    await sendFn(tpMsg, { id: tpMsg, en: tpMsgEn });
    await syncJournalToCloud({
      action: 'record_outcome',
      outcome: {
        symbol: sym,
        tf: activeLock.tf,
        status: 'TP_HIT',
        reason: 'Target Take Profit 1 tercapai',
        at: Date.now()
      }
    });
    delete cache.slPlusLocks[sym];
    return;
  }

  // 2e. Cek eksekusi Stop Loss atau BE+ Exit
  // HANYA dianggap BE_SAVED jika trader MEMANG TELAH DIBERI TAHU untuk memasang SL+ sebelumnya!
  const wasAlertedSlPlus = !!(activeLock.notifiedSlPlus || activeLock.slPlusAlerted);
  const effectiveSl = (wasAlertedSlPlus && activeLock.slPlus) ? Number(activeLock.slPlus) : sl;
  const sameBarAsSlPlus = wasAlertedSlPlus && activeLock.slPlusBarTime === lastBar.time;
  const slHit = isLong
    ? (livePrice <= effectiveSl || (!sameBarAsSlPlus && lastBar.low <= effectiveSl))
    : (livePrice >= effectiveSl || (!sameBarAsSlPlus && lastBar.high >= effectiveSl));
  if (slHit) {
    const isBeExit = wasAlertedSlPlus;
    console.log(`  [${sym} ${tf}] ${isBeExit ? '🛡️ Posisi terselamatkan SL+ BE+ (0-Risk)' : '❌ Posisi menyentuh Stop Loss'} (${formatP(effectiveSl, sym)}). Pengawasan selesai.`);
    const slMsg = isBeExit ?
      `🛡️ <b>[XSTARZG 24/7 CLOUD — TERSELAMATKAN SL+ (0-RISK)]</b>\n\n` +
      `Aset: <b>${sym}</b> (${activeLock.tf})\n` +
      `Arah: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
      `Level Keluar: <b>${formatP(effectiveSl, sym)} (BE+ EXIT)</b>\n\n` +
      `🛡️ <i>Posisi keluar pada proteksi SL+ 0-Risk! Modal trading Anda terlindungi 100% tanpa kerugian.</i>`
      :
      `🛡️ <b>[XSTARZG 24/7 CLOUD — STOP LOSS TERSENTUH]</b>\n\n` +
      `Aset: <b>${sym}</b> (${activeLock.tf})\n` +
      `Arah: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
      `Level SL: <b>${formatP(sl, sym)} TERSENTUH</b>\n\n` +
      `🛡️ <i>Disiplin cut loss menjaga modal trading Anda terlindungi sesuai kaidah Money Management. Posisi ditutup.</i>`;
    const slMsgEn = isBeExit ?
      `🛡️ <b>[XSTARZG 24/7 CLOUD — SAVED BY SL+ (0-RISK)]</b>\n\n` +
      `Asset: <b>${sym}</b> (${activeLock.tf})\n` +
      `Direction: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
      `Exit Level: <b>${formatP(effectiveSl, sym)} (BE+ EXIT)</b>\n\n` +
      `🛡️ <i>Position closed at SL+ 0-Risk safety lock! 100% of your trading capital preserved with zero loss.</i>`
      :
      `🛡️ <b>[XSTARZG 24/7 CLOUD — STOP LOSS HIT]</b>\n\n` +
      `Asset: <b>${sym}</b> (${activeLock.tf})\n` +
      `Direction: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
      `Stop Loss Level: <b>${formatP(sl, sym)} HIT</b>\n\n` +
      `🛡️ <i>Disciplined cut loss protects your trading capital according to Money Management rules. Position closed.</i>`;
    await sendFn(slMsg, { id: slMsg, en: slMsgEn });
    await syncJournalToCloud({
      action: 'record_outcome',
      outcome: {
        symbol: sym,
        tf: activeLock.tf,
        status: isBeExit ? 'BE_SAVED' : 'SL_HIT',
        reason: isBeExit ? 'Proteksi SL+ mengamankan modal (0-Risk)' : 'Stop Loss tersentuh pasar',
        at: Date.now()
      }
    });
    delete cache.slPlusLocks[sym];
    return;
  }
}

async function scanInstrument(inst, cache) {
  const { sym, tf, type } = inst;
  if (!isAssetMarketOpen(sym)) {
    console.log(`  [${sym} ${tf}] Sesi bursa tutup (akhir pekan). Pemindaian dilewati.`);
    return;
  }
  try {
    let candles = [];
    if (type === 'crypto') {
      const interval = tf === 'M5' ? '5m' : (tf === 'M15' ? '15m' : (tf === 'M30' ? '30m' : (tf === 'H4' ? '4h' : '1h')));
      candles = await fetchBinanceCandles(sym, interval);
    } else {
      try {
        candles = await fetchYahooCandles(sym, tf);
      } catch (yErr) {
        candles = [];
      }
      if (!candles || candles.length < 35) {
        candles = await fetchFromXstarzgApi(sym, tf);
      }
    }

    if (!candles || candles.length < 35) {
      console.log(`  [${sym} ${tf}] Data candle tidak cukup (${candles ? candles.length : 0} bar).`);
      return;
    }

    const a = runFullAnalysis({ symbol: sym, timeframe: tf, candles });
    await processInstrumentAnalysis({ inst, candles, a, cache });
  } catch (err) {
    console.log(`  [${sym} ${tf}] Fetch/analisis dilewati: ${err.message}`);
  }
}

async function runSentinel() {
  const isTest = process.argv.includes('--test');
  if (isTest) {
    console.log('🧪 Mengirim pesan uji coba koneksi Telegram...');
    const testMsg =
      `✈️ <b>[XSTARZG 24/7 CLOUD SENTINEL — TERHUBUNG!]</b>\n\n` +
      `Halo Trader! Mesin pemantau 24/7 di cloud (GitHub Actions) telah aktif.\n` +
      `Peluang Skor Besar (≥ ${MIN_SCORE}%) dan peringatan darurat <b>Live SL+ (0-Risk)</b> akan otomatis dikirimkan ke HP Anda tanpa perlu membuka web atau laptop lagi!\n\n` +
      `<i>Waktu Server: ${new Date().toUTCString()}</i>`;
    await sendTelegramMessage(testMsg);
    return;
  }

  const cache = loadCache();
  await syncActiveLocksFromCloud(cache);
  cache.newAlertsThisRun = 0;

  const btcTrend = await resolveBtcMacroTrend();
  console.log(`🪙 [Makro Kripto] Tren Utama Bitcoin: ${btcTrend}`);

  const concurrency = 6;
  for (let i = 0; i < WATCHLIST.length; i += concurrency) {
    const chunk = WATCHLIST.slice(i, i + concurrency);
    await Promise.all(chunk.map(inst => scanInstrument({ ...inst, btcTrend }, cache)));
  }
  saveCache(cache);
  console.log('🏁 [XSTARZG SENTINEL] Pemindaian selesai.');
}

runSentinel();
