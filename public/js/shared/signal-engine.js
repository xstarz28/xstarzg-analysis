import { computeAllIndicators, computeConfirmedSwingsAndSMC } from './quant-core.js';
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function scoreBarAtIndex(bars, ind, idx, derivatives = {}) {
  const close = bars[idx].close;
  const ema20 = ind.series.ema20[idx] ?? close;
  const ema50 = ind.series.ema50[idx] ?? close;
  const ema200 = ind.series.ema200[idx] ?? close;
  const adx = ind.series.adx14[idx] ?? 18;
  const rsi = ind.series.rsi14[idx] ?? 50;
  const macdHist = ind.series.macdHist[idx] ?? 0;
  const stochK = ind.series.stochK[idx] ?? 50;
  const vwap = ind.series.vwap[idx] ?? close;
  const delta = ind.series.delta[idx] ?? 0;
  let trendScore = 50;
  if (close > ema20 && ema20 > ema50) trendScore += 20;
  if (close > ema200) trendScore += 15;
  if (close < ema20 && ema20 < ema50) trendScore -= 20;
  if (close < ema200) trendScore -= 15;
  if (adx >= 25) trendScore += close >= ema50 ? 10 : -10;
  trendScore = clamp(trendScore, 5, 95);
  let momentumScore = 50;
  if (rsi > 54 && rsi < 72) momentumScore += 15;
  else if (rsi >= 75) momentumScore -= 8;
  else if (rsi < 46 && rsi > 28) momentumScore -= 15;
  else if (rsi <= 25) momentumScore += 8;
  if (macdHist > 0) momentumScore += 15;
  else if (macdHist < 0) momentumScore -= 15;
  if (stochK > 55 && stochK < 85) momentumScore += 8;
  else if (stochK < 45 && stochK > 15) momentumScore -= 8;
  momentumScore = clamp(momentumScore, 5, 95);
  const smcAtBar = computeConfirmedSwingsAndSMC(bars, idx, 3);
  let structureScore = 50;
  if (smcAtBar.lastStructure.startsWith('BULLISH')) structureScore += 22;
  if (smcAtBar.lastStructure.startsWith('BEARISH')) structureScore -= 22;
  if (ind.vpvr && ind.vpvr.poc) {
    if (close >= ind.vpvr.poc) structureScore += 10;
    else structureScore -= 10;
  }
  structureScore = clamp(structureScore, 5, 95);
  let flowScore = 50;
  if (close >= vwap) flowScore += 16;
  else flowScore -= 16;
  if (delta > 0) flowScore += 14;
  else if (delta < 0) flowScore -= 14;
  flowScore = clamp(flowScore, 5, 95);
  let contextScore = 50;
  const funding = Number(derivatives?.fundingRatePct || 0);
  if (funding > 0.08) contextScore -= 12;
  else if (funding < -0.05) contextScore += 12;
  else contextScore += close >= ema50 ? 8 : -8;
  contextScore = clamp(contextScore, 10, 90);
  const composite =
    trendScore * 0.25 +
    structureScore * 0.25 +
    momentumScore * 0.20 +
    flowScore * 0.15 +
    contextScore * 0.15;
  return {
    composite: Number(composite.toFixed(1)),
    pillars: {
      trend: Math.round(trendScore),
      structure: Math.round(structureScore),
      momentum: Math.round(momentumScore),
      orderflow: Math.round(flowScore),
      context: Math.round(contextScore)
    },
    smcAtBar
  };
}
export function runWalkForwardBacktest({
  bars,
  indicators,
  assetClass = 'crypto',
  timeframe = 'H1',
  mode = 'trader',
  cpuStartMs = null
}) {
  const tfUpper = String(timeframe || 'H1').toUpperCase();
  if (tfUpper === 'MN' || tfUpper === '1Y') {
    return {
      disabled: true,
      reason: 'INSUFFICIENT_MACRO_BARS',
      weakEvidence: true,
      sampleSize: 0,
      winRatePct: 0,
      expectancyR: 0,
      profitFactor: 0,
      maxDrawdownR: 0,
      avgFeePenaltyR: 0,
      trades: []
    };
  }
  const n = Array.isArray(bars) ? bars.length : 0;
  if (n < 70) {
    return {
      disabled: false,
      reason: 'LOW_BAR_COUNT',
      weakEvidence: true,
      sampleSize: 0,
      winRatePct: 0,
      expectancyR: 0,
      profitFactor: 0,
      maxDrawdownR: 0,
      avgFeePenaltyR: 0,
      trades: []
    };
  }
  const t0 = cpuStartMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let startIdx = Math.max(50, n - 240);
  const elapsedInitial = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  if (elapsedInitial > 5.8) {
    startIdx = Math.max(50, n - 180);
  }
  const trades = [];
  let i = startIdx;
  while (i < n - 6) {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (elapsed > 7.6) break;
    const evalAtI = scoreBarAtIndex(bars, indicators, i);
    const score = evalAtI.composite;
    const atr = indicators.series.atr14[i] ?? bars[i].close * 0.012;
    let dir = null;
    if (score >= 60) dir = 'LONG';
    else if (score <= 40 && mode !== 'investor') dir = 'SHORT';
    if (!dir || !Number.isFinite(atr) || atr <= 0) {
      i += 2;
      continue;
    }
    const entryPrice = bars[i].close;
    const riskDistance = Math.max(atr * 1.5, entryPrice * 0.0025);
    const stopPrice = dir === 'LONG' ? entryPrice - riskDistance : entryPrice + riskDistance;
    const tpPrice = dir === 'LONG' ? entryPrice + riskDistance * 2.0 : entryPrice - riskDistance * 2.0;
    const feeR =
      assetClass === 'crypto'
        ? (entryPrice * 0.0013) / riskDistance
        : (0.08 * atr) / riskDistance;
    let outcomeR = null;
    let exitIdx = i + 1;
    const maxHold = Math.min(n - 1, i + 18);
    for (let k = i + 1; k <= maxHold; k++) {
      exitIdx = k;
      const candle = bars[k];
      const hitSL = dir === 'LONG' ? candle.low <= stopPrice : candle.high >= stopPrice;
      const hitTP = dir === 'LONG' ? candle.high >= tpPrice : candle.low <= tpPrice;
      if (hitSL && hitTP) {
        outcomeR = -1.0 - feeR;
        break;
      } else if (hitSL) {
        outcomeR = -1.0 - feeR;
        break;
      } else if (hitTP) {
        outcomeR = 2.0 - feeR;
        break;
      }
    }
    if (outcomeR === null) {
      const lastC = bars[exitIdx].close;
      const rawR =
        dir === 'LONG'
          ? (lastC - entryPrice) / riskDistance
          : (entryPrice - lastC) / riskDistance;
      outcomeR = rawR - feeR;
    }
    trades.push({
      entryIndex: i,
      exitIndex: exitIdx,
      entryTime: bars[i].time,
      exitTime: bars[exitIdx].time,
      direction: dir,
      netR: Number(outcomeR.toFixed(3)),
      feeR: Number(feeR.toFixed(3))
    });
    i = Math.max(i + 2, exitIdx + 1);
  }
  const sampleSize = trades.length;
  if (sampleSize === 0) {
    return {
      disabled: false,
      weakEvidence: true,
      sampleSize: 0,
      winRatePct: 0,
      expectancyR: 0,
      profitFactor: 0,
      maxDrawdownR: 0,
      avgFeePenaltyR: 0,
      trades: []
    };
  }
  let wins = 0;
  let grossWinR = 0;
  let grossLossR = 0;
  let sumR = 0;
  let sumFeeR = 0;
  let equityR = 0;
  let peakR = 0;
  let maxDdR = 0;
  for (const t of trades) {
    sumR += t.netR;
    sumFeeR += t.feeR;
    if (t.netR > 0) {
      wins++;
      grossWinR += t.netR;
    } else {
      grossLossR += Math.abs(t.netR);
    }
    equityR += t.netR;
    if (equityR > peakR) peakR = equityR;
    const dd = peakR - equityR;
    if (dd > maxDdR) maxDdR = dd;
  }
  const winRatePct = Number(((wins / sampleSize) * 100).toFixed(1));
  const expectancyR = Number((sumR / sampleSize).toFixed(2));
  const profitFactor = Number((grossLossR === 0 ? grossWinR : grossWinR / grossLossR).toFixed(2));
  const weakEvidence = sampleSize < 30 || expectancyR <= 0;
  return {
    disabled: false,
    weakEvidence,
    sampleSize,
    winRatePct,
    expectancyR,
    profitFactor,
    maxDrawdownR: Number(maxDdR.toFixed(2)),
    avgFeePenaltyR: Number((sumFeeR / sampleSize).toFixed(3)),
    trades: trades.slice(-25)
  };
}
export function evaluateQuantSignal({
  bars,
  symbol = 'BTC/USDT',
  assetClass = 'crypto',
  timeframe = 'H1',
  mode = 'trader',
  derivatives = {}
}) {
  const cpuStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const indicators = computeAllIndicators(bars);
  const lastIdx = bars.length - 1;
  const barEval = scoreBarAtIndex(bars, indicators, lastIdx, derivatives);
  let rawDirection = 'NEUTRAL';
  if (barEval.composite >= 60) rawDirection = 'LONG';
  else if (barEval.composite <= 40) rawDirection = 'SHORT';
  let direction = rawDirection;
  let spotLongOnlyNotice = false;
  if (mode === 'investor' && rawDirection === 'SHORT') {
    direction = 'NEUTRAL';
    spotLongOnlyNotice = true;
  }
  const price = indicators.summary.close || 0;
  const atr = indicators.summary.atr14 || price * 0.015;
  const stopDist = Math.max(atr * 1.5, price * 0.003);
  const isShort = direction === 'SHORT';
  const entry = price;
  const stopLoss = isShort ? entry + stopDist : entry - stopDist;
  const tp1 = isShort ? entry - stopDist * 1.5 : entry + stopDist * 1.5;
  const tp2 = isShort ? entry - stopDist * 2.5 : entry + stopDist * 2.5;
  const tp3 = isShort ? entry - stopDist * 4.0 : entry + stopDist * 4.0;
  const backtest = runWalkForwardBacktest({
    bars,
    indicators,
    assetClass,
    timeframe,
    mode,
    cpuStartMs: cpuStart
  });
  const computeMs = Number(
    ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - cpuStart).toFixed(2)
  );
  const s = indicators.summary;
  const pillarsList = [
    {
      id: 'trend',
      name: 'Trend & Regime',
      weight: 25,
      score: barEval.pillars.trend,
      summary: `EMA20/50/200 • ADX ${Number(s.adx14 || 0).toFixed(1)} (${s.regime})`
    },
    {
      id: 'structure',
      name: 'SMC Structure & VPVR',
      weight: 25,
      score: barEval.pillars.structure,
      summary: `${indicators.smc?.lastStructure || 'NEUTRAL'} • POC ${Number(indicators.vpvr?.poc || price).toFixed(2)}`
    },
    {
      id: 'momentum',
      name: 'Multi-Momentum',
      weight: 20,
      score: barEval.pillars.momentum,
      summary: `RSI ${Number(s.rsi14 || 50).toFixed(1)} • StochRSI ${Number(s.stochK || 50).toFixed(1)}`
    },
    {
      id: 'orderflow',
      name: 'VWAP & Orderflow Delta',
      weight: 15,
      score: barEval.pillars.orderflow,
      summary: `Harga ${price >= s.vwap ? 'di atas' : 'di bawah'} Session VWAP`
    },
    {
      id: 'context',
      name: 'Derivatives & Macro Context',
      weight: 15,
      score: barEval.pillars.context,
      summary:
        assetClass === 'crypto'
          ? `Funding ${Number(derivatives?.fundingRatePct || 0).toFixed(4)}%`
          : `Volatilitas ATR ${Number(atr).toFixed(4)}`
    }
  ];
  return {
    symbol,
    assetClass,
    timeframe,
    mode,
    computeMs,
    signal: {
      direction,
      rawDirection,
      spotLongOnlyNotice,
      confluenceScore: barEval.composite,
      regime: s.regime,
      weakEvidence: backtest.weakEvidence,
      levels: {
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        atr,
        stopDistance: stopDist,
        riskRewardTp1: 1.5,
        riskRewardTp2: 2.5,
        riskRewardTp3: 4.0
      },
      pillars: pillarsList,
      backtest
    },
    backtest,
    indicators: {
      summary: indicators.summary,
      smc: indicators.smc,
      vpvr: indicators.vpvr
    }
  };
}
export const runFullSignalAnalysis = evaluateQuantSignal;