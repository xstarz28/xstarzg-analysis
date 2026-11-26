import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupAnalysis } from '../public/js/shared/group-analysis.js';

function analysisFixture(overrides = {}) {
  return {
    symbol: 'XAU/USD',
    timeframe: 'H1',
    assetClass: 'metals',
    direction: 'LONG',
    lastPrice: 2650,
    confluenceScore: 78,
    indicators: {
      ema20: 2640, ema50: 2630, ma200: 2600, vwap: 2645,
      rsi: 55, macdHist: 0.8, bbWidth: 1.2, atrPct: 0.6,
      smcStatus: 'BULLISH BOS', fvgNote: 'Bullish FVG', liquiditySweep: '▲ Sweep BSL'
    },
    levels: { poc: 2700, vwap: 2645, dcaZone1: 2648, dcaZone2: 2620, dcaZone3: 2600, invTarget1: 2900, invTarget2: 3000 },
    topDown: { macroBias: 'BULLISH', structBias: 'BULLISH', execBias: 'BULLISH', isAligned: true, alignmentStatus: 'ALIGNED_BULLISH' },
    fundamentalCot: { institutionalBias: 'BULLISH', specLongPct: 62, macroRegime: 'RISK-ON', centralBankStance: 'Dovish', dxyCorrelation: 'Negative', valuationMetrics: 'Fair', upcomingCatalyst: 'NFP' },
    macroQuant: { posCyclePct: 40, drawdownPct: 8, upClosesPct: 58, atrPercentile: 50, sessionQuality: 'London', htfAligned: true },
    brainMetrics: { brain: 'SNIPER', brainAdj: 2 },
    masterProfile: { riskPct: 0.5, mode: 'NORMAL' },
    gateReasons: [],
    ...overrides
  };
}

function candlesFixture(trend = 1) {
  const now = Math.floor(Date.now() / 1000 / 300) * 300;
  let price = 1;
  const rows = [];
  for (let i = 119; i >= 0; i--) {
    const open = price;
    const close = open * (1 + trend * 0.004);
    rows.push({
      time: now - i * 300, open, close,
      high: Math.max(open, close) * 1.002, low: Math.min(open, close) * 0.998,
      volume: 1000 + i * 10
    });
    price = close;
  }
  return rows;
}

const dexFixture = (securityOverrides = {}) => ({
  pair: { baseToken: { symbol: 'TEST' }, quoteToken: { symbol: 'SOL' }, priceUsd: 0.0012, liquidityUsd: 250000, volume24h: 900000, fdv: 4000000, change24h: 18 },
  candles: candlesFixture(1),
  security: { status: 'verified', source: 'GoPlus', riskSummary: 'no listed flags', holderDistribution: '12% top 10', tokenomics: 'supply 1B', ...securityOverrides }
});

test('trader group exposes psychology, technical and fundamental lists with a sniper ladder', () => {
  const g = buildGroupAnalysis({ group: 'trader', analysis: analysisFixture(), lang: 'id' });
  assert.equal(g.group, 'trader');
  assert.deepEqual(g.ladder.rows.map(r => r.tier), ['HTF', 'MTF', 'LTF']);
  assert.equal(g.ladder.rows[0].tfs, 'D1 – H4');
  assert.ok(g.psychology.length >= 3);
  assert.ok(g.technical.length >= 6);
  assert.ok(g.fundamental.length >= 4);
  assert.ok(/Sniper/i.test(g.title));
});

test('trader score only counts aligned confluences and never sums every indicator', () => {
  const aligned = buildGroupAnalysis({ group: 'trader', analysis: analysisFixture(), lang: 'id' });
  assert.equal(aligned.score, 100);
  assert.equal(aligned.band, 'ELITE');

  const contextOnly = buildGroupAnalysis({
    group: 'trader',
    analysis: analysisFixture({
      direction: 'SHORT',
      topDown: { macroBias: 'BULLISH', structBias: 'NEUTRAL', execBias: 'NEUTRAL', isAligned: false }
    }),
    lang: 'id'
  });
  assert.equal(contextOnly.score, 0, 'arah berlawanan tidak boleh menghasilkan skor tinggi');
  assert.equal(contextOnly.band, 'NO-TRADE');

  const awaiting = buildGroupAnalysis({
    group: 'trader',
    analysis: analysisFixture({ direction: 'NEUTRAL', softBias: 'LONG' }),
    lang: 'id'
  });
  assert.equal(awaiting.band, 'WATCH', 'tanpa sinyal resmi skor tidak boleh berlabel ELITE/PRO');
  assert.ok(/WATCH/.test(awaiting.scoreNote));

  const partial = buildGroupAnalysis({
    group: 'trader',
    analysis: analysisFixture({ topDown: { macroBias: 'BULLISH', structBias: 'BULLISH', execBias: 'NEUTRAL', isAligned: false } }),
    lang: 'id'
  });
  assert.ok(partial.score > 0 && partial.score < 100, 'skor harus proporsional pada konfluensi yang benar-benar searah');
  assert.ok(partial.technical.some(item => item.counted === false), 'indikator konteks tetap ditampilkan tanpa dihitung');
});

test('investor group applies valuation, cycle and macro filters', () => {
  const discount = buildGroupAnalysis({ group: 'investor', analysis: analysisFixture({ lastPrice: 2500 }), lang: 'id' });
  assert.equal(discount.group, 'investor');
  assert.ok(discount.score >= 75);
  assert.ok(discount.fundamental.some(item => /siklus/i.test(item.label)));
  const euphoria = buildGroupAnalysis({
    group: 'investor',
    analysis: analysisFixture({ lastPrice: 3000, macroQuant: { posCyclePct: 96, drawdownPct: 2, upClosesPct: 70, atrPercentile: 80 } }),
    lang: 'id'
  });
  assert.ok(euphoria.score < discount.score, 'euforia siklus harus menurunkan skor investor');
});

test('dex group builds its own lists and requires verified security plus liquidity', () => {
  const verified = buildGroupAnalysis({ group: 'dex', dex: dexFixture(), lang: 'id' });
  assert.equal(verified.group, 'dex');
  assert.ok(verified.technical.length >= 4);
  assert.ok(verified.fundamental.length >= 4);
  assert.ok(verified.score >= 50);
  assert.ok(verified.fundamental.some(item => /audit/i.test(item.label) && item.counted));

  const risky = buildGroupAnalysis({ group: 'dex', dex: dexFixture({ status: 'unverified', riskSummary: 'honeypot flag' }), lang: 'id' });
  assert.ok(risky.score < verified.score, 'audit gagal harus mengurangi skor DEX');
  assert.equal(buildGroupAnalysis({ group: 'dex', dex: { pair: null, candles: [], security: {} }, lang: 'id' }).empty, true);
});

test('group analysis renders an explicit empty state before an instrument is chosen', () => {
  const empty = buildGroupAnalysis({ group: 'trader', analysis: null, lang: 'id' });
  assert.equal(empty.empty, true);
  assert.ok(empty.scoreNote.length > 0);
});
