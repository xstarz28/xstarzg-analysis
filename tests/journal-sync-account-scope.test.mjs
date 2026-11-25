import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/market/journal-sync.js';
import { signJwt } from '../functions/lib/auth.js';

const endpoint = 'https://example.test/api/market/journal-sync';
const env = { SENTINEL_SECRET: 'sentinel-test-secret' };
const ownerA = 'sevenfoldarmy2822@gmail.com';
const ownerB = 'gilfanputra@gmail.com';

function request(headers = {}) {
  return new Request(endpoint, { headers });
}

async function post(body, headers) {
  return onRequestPost({
    request: new Request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    }),
    env
  });
}

async function get(headers) {
  return onRequestGet({ request: request(headers), env });
}

function validManualLock(symbol) {
  return {
    symbol,
    tf: 'H1',
    direction: 'LONG',
    entry: 100,
    sl: 95,
    tp1: 110,
    tp2: 115,
    score: 88,
    issuedAt: Date.now(),
    analysis: {
      confluenceScore: 88,
      direction: 'LONG',
      htfLtfAligned: true,
      topDown: { alignmentStatus: 'ALIGNED_BULLISH' },
      signalEligible: true,
      manualSelection: true,
      action: 'BUY',
      feedSource: 'BINANCE'
    }
  };
}

test('journal reset is account-scoped and Sentinel updates only authorized manual positions', async () => {
  const tokenA = await signJwt({ email: ownerA, role: 'owner', tier: 'OWNER_VIP' });
  const tokenB = await signJwt({ email: ownerB, role: 'owner', tier: 'OWNER_VIP' });
  const authA = { Authorization: `Bearer ${tokenA}` };
  const authB = { Authorization: `Bearer ${tokenB}` };
  const sentinelAuth = { 'X-Sentinel-Key': env.SENTINEL_SECRET };
  const symbolA = 'TEST-A/USDT';
  const symbolB = 'TEST-B/USDT';

  assert.equal((await post({ action: 'save_lock', lock: validManualLock(symbolA) }, authA)).status, 200);
  assert.equal((await post({ action: 'save_lock', lock: validManualLock(symbolB) }, authB)).status, 200);

  const ownerAData = await (await get(authA)).json();
  const ownerBData = await (await get(authB)).json();
  const lockA = ownerAData.activeLocks.find(lock => lock.symbol === symbolA);
  assert.ok(lockA && lockA.id);
  assert.equal(ownerAData.activeLocks.some(lock => lock.symbol === symbolB), false);
  assert.equal(ownerBData.activeLocks.some(lock => lock.symbol === symbolA), false);
  assert.equal(ownerBData.activeLocks.some(lock => lock.symbol === symbolB), true);

  const sentinelData = await (await get(sentinelAuth)).json();
  const monitored = sentinelData.activeLocks.find(lock => lock.id === lockA.id);
  assert.ok(monitored, 'authorized Sentinel can read the manual owner lock');
  assert.equal(monitored.ownerEmail, ownerA);
  const publicKeyData = await (await get({ 'X-Sentinel-Key': 'xstarzg-2026-quant-secret' })).json();
  assert.equal(publicKeyData.activeLocks.some(lock => lock.id === lockA.id), false);
  const noSecretEnv = await onRequestGet({
    request: request({ 'X-Sentinel-Key': env.SENTINEL_SECRET }),
    env: {}
  });
  assert.equal((await noSecretEnv.json()).activeLocks.some(lock => lock.id === lockA.id), false);

  const updatedLock = { ...monitored, filled: true, status: 'FILLED', bePlusActive: true, slPlus: 101 };
  assert.equal((await post({ action: 'save_lock', lock: updatedLock }, sentinelAuth)).status, 200);
  const afterTracking = await (await get(authA)).json();
  const trackedLock = afterTracking.activeLocks.find(lock => lock.id === lockA.id);
  assert.equal(trackedLock.filled, true);
  assert.equal(trackedLock.bePlusActive, true);
  assert.equal(trackedLock.slPlus, 101);
  assert.equal(trackedLock.status, 'ACTIVE');

  assert.equal((await post({
    action: 'record_outcome',
    outcome: { id: lockA.id, symbol: symbolA, tf: 'H1', status: 'TP_HIT', reason: 'TP1', at: Date.now() }
  }, sentinelAuth)).status, 200);
  const afterOutcome = await (await get(authA)).json();
  assert.equal(afterOutcome.activeLocks.some(lock => lock.id === lockA.id), false);
  assert.ok(afterOutcome.recentOutcomes.some(item => item.id === lockA.id && item.status === 'TP_HIT'));

  const reset = await post({ action: 'clear_user_journal' }, authA);
  assert.equal(reset.status, 200);
  const afterResetA = await (await get(authA)).json();
  const afterResetB = await (await get(authB)).json();
  assert.equal(afterResetA.activeLocks.length, 0);
  assert.equal(afterResetA.recentOutcomes.length, 0);
  assert.equal(afterResetB.activeLocks.some(lock => lock.symbol === symbolB), true);

  const staleLock = validManualLock('TEST-STALE/USDT');
  staleLock.issuedAt = Date.now() - 60_000;
  assert.equal((await post({ action: 'save_lock', lock: staleLock }, authA)).status, 409);

  assert.equal((await post({ action: 'clear_all' }, authB)).status, 400);
});
