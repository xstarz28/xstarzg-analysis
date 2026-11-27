import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePerformance } from '../functions/api/market/performance.js';

test('aggregatePerformance menghitung win rate, R, profit factor, dan drawdown secara jujur', () => {
  const rows = [
    { status: 'TP_HIT', at: 3 },
    { status: 'SL_HIT', at: 2 },
    { status: 'TP_HIT', at: 1 },
    { status: 'BE_SAVED', at: 4 },
    { status: 'STRUCTURE_INVALID', at: 5 },
    { status: 'EXPIRED', at: 6 }
  ];
  const s = aggregatePerformance(rows);
  assert.equal(s.total, 6);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 2); // SL + invalidasi struktur
  assert.equal(s.be, 1);
  assert.equal(s.decided, 4);
  assert.equal(s.winRate, 50);
  // Urut kronologis: TP(+2) -> SL(-1) -> TP(+2) -> BE(0) -> invalid(-0.5) -> expired(0)
  assert.equal(s.totalR, 2.5);
  assert.equal(s.avgR, 0.42);
  assert.equal(s.profitFactor, 2.67); // grossWin 4 / (1 + 0.5)
  assert.deepEqual(s.curve, [
    { i: 0, r: 0 },
    { i: 1, r: 2 },
    { i: 2, r: 1 },
    { i: 3, r: 3 },
    { i: 4, r: 3 },
    { i: 5, r: 2.5 },
    { i: 6, r: 2.5 }
  ]);
  assert.equal(s.maxDD, 1); // puncak 3 -> 2
});

test('aggregatePerformance menampilkan kerugian murni tanpa menyembunyikannya', () => {
  const s = aggregatePerformance([
    { status: 'SL_HIT', at: 1 },
    { status: 'SL_HIT', at: 2 }
  ]);
  assert.equal(s.winRate, 0);
  assert.equal(s.totalR, -2);
  assert.equal(s.profitFactor, 0);
  assert.equal(s.maxDD, 2);
});

test('aggregatePerformance menangani riwayat kosong tanpa NaN', () => {
  const s = aggregatePerformance([]);
  assert.equal(s.total, 0);
  assert.equal(s.winRate, 0);
  assert.equal(s.avgR, 0);
  assert.equal(s.totalR, 0);
  assert.deepEqual(s.curve, [{ i: 0, r: 0 }]);
});
