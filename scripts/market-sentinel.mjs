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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '../.sentinel-cache.json');

// Ambil token & chatId dari environment variable (GitHub Secrets)
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN || '').trim().replace(/^bot/i, '');
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || process.env.TG_CHAT_ID || '').trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '');
const MIN_SCORE = parseInt(process.env.SENTINEL_MIN_SCORE || '62', 10) || 62;

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

async function getActiveSubscribers() {
  const recipients = new Set();
  if (CHAT_ID) recipients.add(CHAT_ID);

  const apiHosts = [
    process.env.XSTARZG_API_HOST,
    'https://xstarzganalysis.pages.dev',
    'https://xstarzg-analysis.pages.dev'
  ].filter(Boolean);
  const secret = process.env.SENTINEL_SECRET || 'xstarzg-2026-quant-secret';

  for (const apiHost of apiHosts) {
    try {
      const res = await fetch(`${apiHost}/api/notify/telegram-subscribers?key=${encodeURIComponent(secret)}`, {
        headers: { 'X-Sentinel-Key': secret, 'User-Agent': 'XStarZG-Sentinel/1.0' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.subscribers)) {
          for (const sub of data.subscribers) {
            if (sub && sub.chat_id) recipients.add(String(sub.chat_id));
          }
          if (recipients.size > 0) break;
        }
      }
    } catch (e) {}
  }

  return Array.from(recipients);
}

async function sendTelegramMessage(text) {
  if (!BOT_TOKEN) {
    console.log('⚠️ [Telegram] Token belum disetel di GitHub Secrets. Pesan hanya dicetak ke console:');
    console.log(text.replace(/<[^>]+>/g, ''));
    return false;
  }

  const recipients = await getActiveSubscribers();
  if (!recipients.length) {
    console.log('⚠️ [Telegram] Tidak ada penerima aktif terdaftar (Owner / VIP). Pesan dicetak ke console:');
    console.log(text.replace(/<[^>]+>/g, ''));
    return false;
  }

  console.log(`📤 Mengirim notifikasi ke ${recipients.length} penerima VIP/Owner...`);
  let successCount = 0;

  for (const cid of recipients) {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cid,
          text: text,
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

// Fetch crypto candles from Binance public API
async function fetchBinanceCandles(pair, interval = '1h', limit = 150) {
  const sym = pair.replace('/', '').toUpperCase();
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'XStarZG-Sentinel/1.0' } });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map(d => ({
    time: Math.floor(Number(d[0]) / 1000),
    open: Number(d[1]),
    high: Number(d[2]),
    low: Number(d[3]),
    close: Number(d[4]),
    volume: Number(d[5])
  }));
}

// Fetch forex / commodities candles from Yahoo Finance
const YAHOO_SYMBOLS = {
  'XAU/USD': 'GC=F',
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'USDJPY=X',
  'WTI/OIL': 'CL=F',
  'SILVER': 'SI=F'
};

async function fetchYahooCandles(symbol, tf = 'H1') {
  const ySym = YAHOO_SYMBOLS[symbol] || (symbol.includes('/') ? symbol.replace('/', '') + '=X' : symbol);
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
  if (s.includes('/USDT') || s.includes('BTC') || s.includes('ETH') || s.includes('SOL')) return true;

  const now = new Date();
  const dayUtc = now.getUTCDay(); // 0 = Sun, 6 = Sat
  const hourUtc = now.getUTCHours();

  if (dayUtc === 6) return false;
  if (dayUtc === 0 && hourUtc < 21) return false;
  if (dayUtc === 5 && hourUtc >= 22) return false;

  return true;
}

// Watchlist instrumen institusional utama
export const WATCHLIST = [
  { sym: 'XAU/USD', tf: 'H1', type: 'commodity', hz: 'intraday' },
  { sym: 'XAU/USD', tf: 'M15', type: 'commodity', hz: 'scalping' },
  { sym: 'EUR/USD', tf: 'H1', type: 'forex', hz: 'intraday' },
  { sym: 'EUR/USD', tf: 'M15', type: 'forex', hz: 'scalping' },
  { sym: 'GBP/USD', tf: 'H1', type: 'forex', hz: 'intraday' },
  { sym: 'USD/JPY', tf: 'H1', type: 'forex', hz: 'intraday' },
  { sym: 'BTC/USDT', tf: 'H1', type: 'crypto', hz: 'intraday' },
  { sym: 'BTC/USDT', tf: 'M15', type: 'crypto', hz: 'scalping' },
  { sym: 'BTC/USDT', tf: 'M5', type: 'crypto', hz: 'scalping' },
  { sym: 'ETH/USDT', tf: 'H1', type: 'crypto', hz: 'intraday' },
  { sym: 'ETH/USDT', tf: 'M15', type: 'crypto', hz: 'scalping' },
  { sym: 'ETH/USDT', tf: 'M5', type: 'crypto', hz: 'scalping' },
  { sym: 'SOL/USDT', tf: 'H1', type: 'crypto', hz: 'intraday' },
  { sym: 'SOL/USDT', tf: 'M15', type: 'crypto', hz: 'scalping' },
  { sym: 'SOL/USDT', tf: 'M5', type: 'crypto', hz: 'scalping' },
  { sym: 'WTI/OIL', tf: 'H1', type: 'commodity', hz: 'intraday' }
];

export async function processInstrumentAnalysis({ inst, candles, a, cache, sendFn = sendTelegramMessage, minScore = MIN_SCORE }) {
  const { sym, tf, hz } = inst;
  if (!candles || candles.length < 35 || !a || a.error) return;

  const score = Number(a.confluenceScore || a.confidence || 0);
  const dir = a.direction;
  const lastBar = candles[candles.length - 1];
  const livePrice = lastBar.close;

  console.log(`  [${sym} ${tf}] Harga: ${formatP(livePrice, sym)} | Setup: ${dir || 'NEUTRAL'} | Skor: ${score}% | Tier: ${a.signalTier || '—'}`);

  // 1. Cek Sinyal Skor Tinggi Baru (>= MIN_SCORE)
  if (a.signalEligible && (dir === 'LONG' || dir === 'SHORT') && score >= minScore) {
    const L = a.levels || {};
    const anchorTime = a.anchorClosedTime || lastBar.time;
    const setupKey = `${sym}|${tf}|${dir}|${anchorTime}`;

    if (!cache.notified[setupKey]) {
      cache.notified[setupKey] = Date.now();

      const hzLabel = hz === 'scalping' ? '⚡ SCALPING' : (hz === 'swing' ? '🌊 SWING' : '🎯 INTRADAY');
      const dirEmoji = dir === 'LONG' ? '🟢 BUY / LONG' : '🔴 SELL / SHORT';
      const tierTxt = a.signalTier === 'ELITE' ? 'ELITE ★' : 'PRO';
      const entryPrice = L.entry || livePrice;
      const atr = a.atr || (livePrice * 0.005);
      const entryDiff = entryPrice - livePrice;

      const isCrypto = (sym || '').includes('/USDT') || (sym || '').includes('BTC') || (sym || '').includes('ETH') || (sym || '').includes('SOL');
      const isStock = (sym || '').includes('.JK') || ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'SPY', 'QQQ'].includes(sym);
      const platformName = isCrypto ? 'exchange kripto pilihan Anda (Binance/Bybit/Tokocrypto/OKX)' : isStock ? 'aplikasi sekuritas/broker saham Anda' : 'broker/aplikasi trading Anda';

      let orderType = '';
      let orderInstruction = '';
      if (dir === 'LONG') {
        if (entryDiff < -0.05 * atr) {
          orderType = 'BUY LIMIT';
          orderInstruction = `Pasang <b>BUY LIMIT</b> di <code>${formatP(entryPrice, sym)}</code> (antri beli di harga diskon/pullback).`;
        } else if (entryDiff > 0.05 * atr) {
          orderType = 'BUY STOP';
          orderInstruction = `Pasang <b>BUY STOP</b> di <code>${formatP(entryPrice, sym)}</code> (eksekusi saat breakout ke atas).`;
        } else {
          orderType = 'BUY (Market / Instan)';
          orderInstruction = `Eksekusi <b>BUY SEKARANG</b> di harga pasar (~${formatP(livePrice, sym)}).`;
        }
      } else {
        if (entryDiff > 0.05 * atr) {
          orderType = 'SELL LIMIT';
          orderInstruction = `Pasang <b>SELL LIMIT</b> di <code>${formatP(entryPrice, sym)}</code> (antri jual di harga premium/pullback).`;
        } else if (entryDiff < -0.05 * atr) {
          orderType = 'SELL STOP';
          orderInstruction = `Pasang <b>SELL STOP</b> di <code>${formatP(entryPrice, sym)}</code> (eksekusi saat breakout ke bawah).`;
        } else {
          orderType = 'SELL (Market / Instan)';
          orderInstruction = `Eksekusi <b>SELL SEKARANG</b> di harga pasar (~${formatP(livePrice, sym)}).`;
        }
      }

      const alertMsg =
        `🚀 <b>[XSTARZG 24/7 CLOUD — PELUANG SKOR BESAR]</b>\n\n` +
        `Aset: <b>${sym}</b> (${tf} • ${hzLabel})\n` +
        `Setup: <b>${dirEmoji} (${tierTxt} SETUP)</b>\n` +
        `Confidence Score: <b>${score}%</b>\n` +
        `Regime: <i>${a.regime || 'Institutional Flow'}</i>\n\n` +
        `📌 <b>Tipe Order:</b> <code>${orderType}</code>\n` +
        `🎯 <b>Titik Entry:</b> <code>${formatP(entryPrice, sym)}</code>\n` +
        `🛡️ <b>Stop Loss:</b> <code>${formatP(L.sl, sym)}</code>\n` +
        `✅ <b>Take Profit 1:</b> <code>${formatP(L.tp1, sym)}</code>\n` +
        (L.tp2 ? `✅ <b>Take Profit 2:</b> <code>${formatP(L.tp2, sym)}</code>\n` : '') +
        (L.tp3 ? `🚀 <b>Target TP3:</b> <code>${formatP(L.tp3, sym)}</code>\n` : '') +
        `\n📱 <i>${orderInstruction} Buka ${platformName}. Bot memantau posisi dan akan mengirim peringatan SL+ (0-Risk) setelah order terisi dan meluncur menuju profit!</i>`;

      await sendFn(alertMsg);

      // Daftarkan ke pengawasan order
      // PENTING: flag `justCreated = true` MENJAMIN step 2 tidak mengevaluasi SL+ pada cycle yang sama!
      cache.slPlusLocks[sym] = {
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
        status: orderType.includes('Market') ? 'FILLED' : 'PENDING_FILL',
        filled: orderType.includes('Market'),
        filledAt: orderType.includes('Market') ? Date.now() : null,
        notifiedSlPlus: false,
        notifiedTp1: false,
        created: Date.now(),
        justCreated: true
      };
    }
  }

  // 2. Pemantauan Posisi & SL+ (0-Risk Break-Even Plus Trigger)
  const activeLock = cache.slPlusLocks[sym];
  if (!activeLock) return;

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
    if (isLong) {
      if (lastBar.low <= entry || livePrice <= entry) gotFilled = true;
    } else {
      if (lastBar.high >= entry || livePrice >= entry) gotFilled = true;
    }

    if (gotFilled) {
      activeLock.filled = true;
      activeLock.status = 'FILLED';
      activeLock.filledAt = Date.now();
      console.log(`  [${sym} ${tf}] 🔔 Limit Order TERJEMPUT pada ${formatP(entry, sym)}! Posisi aktif dipantau.`);
    } else {
      // Cek apakah target sudah tercapai sebelum order sempat dijemput (MISSED)
      const missed = isLong ? (lastBar.high >= tp1 || livePrice >= tp1) : (lastBar.low <= tp1 || livePrice <= tp1);
      if (missed) {
        console.log(`  [${sym} ${tf}] ↗️ Order terlewat (MISSED) — target tercapai sebelum terjemput.`);
        delete cache.slPlusLocks[sym];
        return;
      }
      // Batalkan order jika kedaluwarsa (>12 jam) atau jika data kunci cacat / tidak bertanggal
      const ageMs = activeLock.created ? (Date.now() - activeLock.created) : Infinity;
      if (ageMs > 12 * 3600 * 1000) {
        console.log(`  [${sym} ${tf}] ⏳ Limit order kedaluwarsa (>12 jam belum terjemput).`);
        delete cache.slPlusLocks[sym];
        return;
      }

      // Batalkan jika harga pasar saat ini sudah terlalu jauh (> 3x ATR) dari titik antri entry
      const entryDist = Math.abs(livePrice - entry);
      const maxPendingAtr = 3.0 * (activeLock.atr || (entry * 0.015));
      if (entryDist > maxPendingAtr) {
        console.log(`  [${sym} ${tf}] ↗️ Harga pasar (${formatP(livePrice, sym)}) sudah terlalu jauh dari entry (${formatP(entry, sym)}). Order dibatalkan.`);
        delete cache.slPlusLocks[sym];
        return;
      }
      // Order belum terisi -> JANGAN PERNAH mengevaluasi SL+!
      return;
    }
  }

  // 2c. Posisi SUDAH TERISI: Cek eksekusi Stop Loss atau TP1
  const slHit = isLong ? (lastBar.low <= sl || livePrice <= sl) : (lastBar.high >= sl || livePrice >= sl);
  if (slHit) {
    console.log(`  [${sym} ${tf}] ❌ Posisi menyentuh Stop Loss (${formatP(sl, sym)}). Pengawasan selesai.`);
    delete cache.slPlusLocks[sym];
    return;
  }

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
    await sendFn(tpMsg);
    delete cache.slPlusLocks[sym];
    return;
  }

  // 2d. Pemantauan SL+ (0-Risk BE+ Trigger)
  // Syarat mutlak: Posisi terisi & telah bergerak minimal 38% menuju target TP1 (bukan 15% noise)
  if (!activeLock.notifiedSlPlus && targetDist > 0) {
    const triggerRatio = 0.38;
    const beTriggerPrice = isLong ? (entry + triggerRatio * targetDist) : (entry - triggerRatio * targetDist);
    const slPlusHit = isLong
      ? (lastBar.high >= beTriggerPrice || livePrice >= beTriggerPrice)
      : (lastBar.low <= beTriggerPrice || livePrice <= beTriggerPrice);

    if (slPlusHit) {
      activeLock.notifiedSlPlus = true;
      const beBuffer = Math.max(0.08 * targetDist, 0.15 * (activeLock.atr || 1));
      const slPlusPrice = isLong ? (entry + beBuffer) : (entry - beBuffer);
      const slPriceTxt = formatP(slPlusPrice, sym);

      const isCryptoSym = (sym || '').includes('/USDT') || (sym || '').includes('BTC') || (sym || '').includes('ETH') || (sym || '').includes('SOL');
      const isStockSym = (sym || '').includes('.JK') || ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'SPY', 'QQQ'].includes(sym);
      const platTarget = isCryptoSym ? 'exchange kripto Anda' : isStockSym ? 'aplikasi sekuritas/saham Anda' : 'broker/aplikasi trading Anda';

      const slMsg =
        `🛡️ <b>[XSTARZG 24/7 CLOUD — SL+ TERPICU (0-RISK)]</b>\n\n` +
        `Aset: <b>${sym}</b> (${activeLock.tf})\n` +
        `Arah: <b>${isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT'}</b>\n` +
        `Status: <b>TEREKSEKUSI & PROFIT BERJALAN (+${Math.round(triggerRatio * 100)}%)</b>\n` +
        `Entry Awal: <b>${formatP(entry, sym)}</b>\n` +
        `Harga Saat Ini: <b>${formatP(livePrice, sym)}</b>\n` +
        `Target Geser SL: <b>${slPriceTxt} (0-Risk BE+)</b>\n\n` +
        `⚠️ <i>Harga telah mencapai zona aman 0-Risk! Buka ${platTarget} sekarang dan geser Stop Loss ke level BE+ di atas agar modal terlindungi 100%!</i>`;

      await sendFn(slMsg);
    }
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
      const interval = tf === 'M15' ? '15m' : (tf === 'H4' ? '4h' : '1h');
      candles = await fetchBinanceCandles(sym, interval);
    } else {
      candles = await fetchYahooCandles(sym, tf);
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
  for (const inst of WATCHLIST) {
    await scanInstrument(inst, cache);
  }
  saveCache(cache);
  console.log('🏁 [XSTARZG SENTINEL] Pemindaian selesai.');
}

runSentinel();
