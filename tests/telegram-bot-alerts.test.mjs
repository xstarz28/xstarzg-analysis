// tests/telegram-bot-alerts.test.mjs
// Verifikasi integrasi bot Telegram: notifikasi jurnal manual skor tinggi,
// TP bertahap, dan alarm lonceng yang dipantau cloud 24/7.

import {
  announceJournalEntry,
  inferInstrument,
  syncActiveAlarmsFromCloud
} from '../scripts/market-sentinel.mjs';
import { onRequestGet, onRequestPost } from '../functions/api/market/price-alarms.js';

let passed = 0;
let failed = 0;

function chk(name, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    failed++;
  }
}

async function asyncChk(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}\n`, err);
    failed++;
  }
}

console.log('=== RUNNING TELEGRAM BOT ALERT INTEGRATION TESTS ===\n');

// 1. Instrumen jurnal manual dikenali lintas kelas aset
chk('USD/CAD H1 dikenali sebagai forex',
  inferInstrument('USD/CAD', 'H1').type === 'forex');
chk('BTC/USDT H1 dikenali sebagai kripto (buka 24/7)',
  inferInstrument('BTC/USDT', 'H1').type === 'crypto');
chk('BBCA.JK dikenali sebagai saham IDX',
  inferInstrument('BBCA.JK', 'H1').type === 'stock_id');
chk('XAU/USD dikenali sebagai komoditas',
  inferInstrument('XAU/USD', 'M15').type === 'commodity');
chk('Simbol di luar WATCHLIST tetap dihitung sebagai instrumen valid',
  !!inferInstrument('USDSGD', 'H1') && inferInstrument('USDSGD', 'H1').sym === 'USDSGD');

// 2. Pesan peluang skor besar dari entri jurnal manual
await asyncChk('announceJournalEntry mengirim pesan NEW HIGH-SCORE dari data jurnal', async () => {
  const lock = {
    symbol: 'USD/CAD',
    tf: 'H1',
    direction: 'SHORT',
    entry: 1.4292,
    sl: 1.4376,
    tp1: 1.4192,
    tp2: 1.4082,
    tp3: 1.3972,
    score: 87,
    orderType: 'SELL LIMIT',
    analysis: {
      regime: 'INSTITUTIONAL TREND FLOW',
      topDown: { macroBias: 'BEARISH', structBias: 'BEARISH', isAligned: true },
      sessionInfo: { bestSession: 'New York', isOptimal: false }
    }
  };
  let captured = null;
  const sent = await announceJournalEntry(lock, async (text, payload) => {
    captured = { text, payload };
    return true;
  });

  chk('Pengiriman pesan jurnal dianggap sukses', sent === true && !!captured);
  chk('Pesan Inggris memakai judul NEW HIGH-SCORE OPPORTUNITY', captured.payload.en.includes('NEW HIGH-SCORE OPPORTUNITY (PRO)'));
  chk('Pesan memuat aset & skor jurnal', captured.payload.en.includes('USD/CAD') && captured.payload.en.includes('87%'));
  chk('Pesan memuat setup SELL / SHORT', captured.payload.en.includes('SELL / SHORT'));
  chk('Pesan memuat entry, SL, TP1, TP2, TP3', ['1.4292', '1.4376', '1.4192', '1.4082', '1.3972'].every(v => captured.payload.en.includes(v)));
  chk('Pesan memuat keselarasan top-down', captured.payload.en.includes('1D–4H Macro') && captured.payload.en.includes('BEARISH'));
  chk('Pesan memuat sesi optimal dari analisis', captured.payload.en.includes('New York'));
  chk('Versi Indonesia juga tersedia', captured.payload.id.includes('PELUANG BARU SKOR BESAR') && captured.payload.id.includes('Titik Entry'));
});

await asyncChk('announceJournalEntry menolak lock tanpa arah yang sah', async () => {
  let calls = 0;
  const sent = await announceJournalEntry(
    { symbol: 'EUR/USD', tf: 'H1', direction: 'NEUTRAL', score: 90 },
    async () => { calls++; return true; }
  );
  chk('Lock NEUTRAL tidak diumumkan', sent === false && calls === 0);
});

// 3. Sinkronisasi alarm lonceng dari cloud
await asyncChk('syncActiveAlarmsFromCloud memuat alarm aktif milik owner', async () => {
  const prevSecret = process.env.SENTINEL_SECRET;
  const origFetch = globalThis.fetch;
  process.env.SENTINEL_SECRET = 'test-sentinel-secret';
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      alarms: [
        { id: 'alarm:owner@xstarzg.id:EUR/USD|H1', symbol: 'EUR/USD', tf: 'H1', kind: 'signal', created: Date.now() },
        { id: 'alarm:owner@xstarzg.id:BTC/USDT|M15', symbol: 'BTC/USDT', tf: 'M15', kind: 'touch', entry: 60000, created: Date.now() }
      ]
    })
  });
  try {
    const cache = { alarms: {} };
    const ok = await syncActiveAlarmsFromCloud(cache);
    chk('Sinkronisasi alarm cloud berhasil', ok === true);
    chk('Kedua alarm tersimpan di cache', Object.keys(cache.alarms).length === 2);
    chk('Alarm entry touch mempertahankan level entry', cache.alarms['alarm:owner@xstarzg.id:BTC/USDT|M15'].entry === 60000);
  } finally {
    globalThis.fetch = origFetch;
    if (prevSecret === undefined) delete process.env.SENTINEL_SECRET;
    else process.env.SENTINEL_SECRET = prevSecret;
  }
});

// 4. Endpoint alarm cloud menolak permintaan tanpa kredensial
await asyncChk('Endpoint price-alarms menolak akses tanpa kredensial', async () => {
  const getRes = await onRequestGet({ request: new Request('https://xstarzg.example/api/market/price-alarms'), env: {} });
  chk('GET tanpa kredensial → 401', getRes.status === 401);
  const postRes = await onRequestPost({
    request: new Request('https://xstarzg.example/api/market/price-alarms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', alarm: { symbol: 'EUR/USD', tf: 'H1' } })
    }),
    env: {}
  });
  chk('POST tanpa kredensial → 401', postRes.status === 401);
  const fireRes = await onRequestPost({
    request: new Request('https://xstarzg.example/api/market/price-alarms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fire', alarm: { id: 'alarm:x' } })
    }),
    env: { SENTINEL_SECRET: 'secret' }
  });
  chk('Aksi fire dari pihak tanpa kredensial ditolak', fireRes.status === 401);
});

await asyncChk('Sentinel berizin dapat membaca daftar alarm', async () => {
  const res = await onRequestGet({
    request: new Request('https://xstarzg.example/api/market/price-alarms', {
      headers: { 'X-Sentinel-Key': 'secret' }
    }),
    env: { SENTINEL_SECRET: 'secret' }
  });
  const data = await res.json();
  chk('GET sentinel → 200 ok', res.status === 200 && data.ok === true);
  chk('Respons sentinel selalu berisi array alarm', Array.isArray(data.alarms));
});

console.log(`\nTELEGRAM BOT ALERT SUITE: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
