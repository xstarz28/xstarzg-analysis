import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequestGet } from '../functions/api/dex/analysis.js';

const TOKEN = '0x1111111111111111111111111111111111111111';
const PAIR = '0x2222222222222222222222222222222222222222';
const legacyChart = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function request(params) {
  return new Request('https://example.test/api/dex/analysis?' + new URLSearchParams(params));
}

function pairPayload() {
  return {
    chainId: 'base',
    pairAddress: PAIR,
    dexId: 'test-dex',
    baseToken: { address: TOKEN, symbol: 'TEST', name: 'Test Token' },
    quoteToken: { address: '0x3333333333333333333333333333333333333333', symbol: 'USDC' },
    priceUsd: '1.25',
    liquidity: { usd: 150000 },
    volume: { h24: 75000 },
    priceChange: { h24: 2.4 },
    fdv: 1000000
  };
}

async function withMockFetch(t, handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => { globalThis.fetch = originalFetch; });
}

test('DEX manual analysis uses provider search and returns real market, OHLCV, and security provenance', async t => {
  const requested = [];
  const pair = pairPayload();
  await withMockFetch(t, async url => {
    const target = String(url);
    requested.push(target);
    if (target.includes('/latest/dex/tokens/')) return Response.json({ pairs: [pair] });
    if (target.includes('/latest/dex/pairs/base/' + TOKEN)) return Response.json({ pairs: [] });
    if (target.includes('/latest/dex/pairs/base/' + PAIR)) return Response.json({ pairs: [pair] });
    if (target.includes('geckoterminal.com')) {
      const start = Math.floor(Date.now() / 300000) * 300 - 24 * 300;
      const rows = Array.from({ length: 25 }, (_, i) => {
        const time = start + i * 300;
        return [time, 1.2, 1.3, 1.1, 1.25, 1000];
      }).reverse();
      return Response.json({ data: { attributes: { ohlcv_list: rows } } });
    }
    if (target.includes('gopluslabs.io')) {
      return Response.json({
        result: {
          [TOKEN]: {
            holder_count: '250',
            holders: [{ percent: 0.1 }, { percent: 0.05 }],
            is_honeypot: '0',
            is_mintable: '0',
            total_supply: '1000000'
          }
        }
      });
    }
    throw new Error('Unexpected provider URL: ' + target);
  });

  const search = await onRequestGet({ request: request({ action: 'search', chain: 'base', address: TOKEN }) });
  const searchData = await search.json();
  assert.equal(search.status, 200);
  assert.equal(searchData.pairs.length, 1);
  assert.equal(searchData.pairs[0].pairAddress, PAIR);

  const analyzed = await onRequestGet({ request: request({ action: 'analyze', chain: 'base', pairAddress: PAIR, tf: 'M5' }) });
  const data = await analyzed.json();
  assert.equal(data.ok, true);
  assert.equal(data.marketSource, 'DexScreener');
  assert.equal(data.ohlcvSource, 'GeckoTerminal');
  assert.equal(data.security.source, 'GoPlus');
  assert.equal(data.security.status, 'verified');
  assert.equal(data.marketValidity, 'verified');
  assert.equal(data.validity, 'verified');
  assert.equal(data.candles.length, 25);
  assert.ok(data.candles[0].time < data.candles.at(-1).time);
  assert.ok(requested.some(url => url.includes('geckoterminal.com')));
});

test('DEX endpoint marks missing OHLCV/security unverified without fabricating data', async t => {
  await withMockFetch(t, async url => {
    const target = String(url);
    if (target.includes('/latest/dex/pairs/base/' + PAIR)) return Response.json({ pairs: [pairPayload()] });
    if (target.includes('geckoterminal.com')) return new Response('provider unavailable', { status: 503 });
    if (target.includes('gopluslabs.io')) throw new Error('security provider unavailable');
    throw new Error('Unexpected provider URL: ' + target);
  });

  const response = await onRequestGet({ request: request({ action: 'analyze', chain: 'base', pairAddress: PAIR, tf: 'M5' }) });
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.candles, []);
  assert.equal(data.ohlcvSource, 'Unavailable');
  assert.equal(data.marketValidity, 'unverified');
  assert.equal(data.validity, 'unverified');
  assert.equal(data.security.status, 'unverified');
  assert.match(data.error, /OHLCV unavailable/);
});

test('DEX endpoint rejects malformed provider candles instead of charting them', async t => {
  await withMockFetch(t, async url => {
    const target = String(url);
    if (target.includes('/latest/dex/pairs/base/' + PAIR)) return Response.json({ pairs: [pairPayload()] });
    if (target.includes('geckoterminal.com')) {
      const start = Math.floor(Date.now() / 300000) * 300 - 24 * 300;
      const rows = Array.from({ length: 25 }, (_, i) => [start + i * 300, 1.2, 1.1, 1.15, 1.25, 1000]);
      return Response.json({ data: { attributes: { ohlcv_list: rows } } });
    }
    if (target.includes('gopluslabs.io')) return Response.json({ result: { [TOKEN]: { is_honeypot: '0' } } });
    throw new Error('Unexpected provider URL: ' + target);
  });

  const response = await onRequestGet({ request: request({ action: 'analyze', chain: 'base', pairAddress: PAIR, tf: 'M5' }) });
  const data = await response.json();
  assert.equal(data.candles.length, 0);
  assert.equal(data.marketValidity, 'unverified');
  assert.equal(data.freshness, 'unavailable');
});

test('DEX endpoint rejects unsupported chains, methods, and malformed addresses', async () => {
  const badChain = await onRequestGet({ request: request({ action: 'search', chain: 'unknown', address: TOKEN }) });
  const badAddress = await onRequestGet({ request: request({ action: 'search', chain: 'base', address: 'not-an-address' }) });
  assert.equal(badChain.status, 400);
  assert.equal(badAddress.status, 400);
});

test('DEX charts use provider candles and contain no random ticker or synthetic candle path', () => {
  const dexStart = app.indexOf('function renderDexTechnical(candles)');
  const dexEnd = app.indexOf('\nfunction formatCompactNum', dexStart);
  assert.ok(dexStart >= 0 && dexEnd > dexStart);
  assert.doesNotMatch(legacyChart, /Math\.random\(\)|Universal Real-Time Micro-Tick Engine/);
  assert.doesNotMatch(app.slice(dexStart, dexEnd), /generateSeedCandles|Math\.random|synthetic/i);
});
