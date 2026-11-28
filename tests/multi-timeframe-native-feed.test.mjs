// Regresi alignment multi-TF: TF besar WAJIB dibaca dari candle native bila
// feed per-timeframe tersedia (D1/H4/H1/M15/M5 sekali jalan), bukan hanya
// di-resample dari TF yang sedang dibuka.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTimeframeStack, detectTopDownAlignment } from '../public/js/shared/signal-engine.js';

function makeSeries(n, stepSec, base = 100, drift = 0.4) {
  const now = 1_700_000_000;
  const out = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    const open = price;
    price = price + drift + (i % 3 === 0 ? -0.15 : 0.2);
    const close = price;
    out.push({
      time: now - (n - i) * stepSec,
      open,
      high: Math.max(open, close) + 0.3,
      low: Math.min(open, close) - 0.3,
      close,
      volume: 1000 + i
    });
  }
  return out;
}

test('MULTI-TF: candle native per timeframe dipakai tanpa mengganti TF satu per satu', () => {
  const m5 = makeSeries(300, 300);
  const feeds = {
    D1: makeSeries(120, 86400),
    H4: makeSeries(120, 14400),
    H1: makeSeries(120, 3600),
    M15: makeSeries(120, 900),
    M5: m5
  };
  const withFeeds = buildTimeframeStack(m5, 'M5', feeds);
  for (const id of ['D1', 'H4', 'H1', 'M15', 'M5']) {
    const row = withFeeds.rows.find(r => r.id === id);
    assert.equal(row.source, 'native-feed', `${id} harus memakai feed native`);
    assert.equal(row.available, true, `${id} harus terbaca dari feed native`);
  }
  assert.deepEqual(withFeeds.nativeFeeds.sort(), ['D1', 'H1', 'H4', 'M15', 'M5']);

  // Tanpa feed native, TF yang lebih tinggi diturunkan (resample) dari M5.
  const noFeeds = buildTimeframeStack(m5, 'M5', null);
  assert.equal(noFeeds.rows.find(r => r.id === 'D1').source, 'resampled');
  assert.equal(noFeeds.nativeFeeds.length, 0);
});

test('MULTI-TF: top-down memakai H4 native untuk bias makro', () => {
  const m5 = makeSeries(400, 300);
  const h4 = makeSeries(160, 14400);
  const feeds = { H4: h4, D1: makeSeries(160, 86400), H1: makeSeries(160, 3600), M15: makeSeries(160, 900) };
  const withFeeds = detectTopDownAlignment(m5, 'BTC/USDT', 'M5', null, feeds);
  const withoutFeeds = detectTopDownAlignment(m5, 'BTC/USDT', 'M5', null, null);
  assert.ok(withFeeds && withFeeds.timeframes, 'top-down harus menghasilkan laporan timeframes');
  assert.ok(withFeeds.timeframes.rows.find(r => r.id === 'H4').source === 'native-feed');
  assert.notEqual(withFeeds.macroBias, undefined);
  assert.ok(withoutFeeds, 'tanpa feed tambahan tetap menghasilkan analisis (resample)');
});
