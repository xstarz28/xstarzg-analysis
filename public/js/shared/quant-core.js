export function computeSMA(values, period) {
  const out = new Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length < period || period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += Number(values[i] || 0);
    if (i >= period) sum -= Number(values[i - period] || 0);
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
export function computeEMA(values, period) {
  const out = new Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += Number(values[i] || 0);
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const v = Number(values[i] || 0);
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
export function computeRSI(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (!Array.isArray(closes) || closes.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
export function computeATR(bars, period = 14) {
  const n = Array.isArray(bars) ? bars.length : 0;
  const out = new Array(n).fill(null);
  if (n <= period) return out;
  const tr = new Array(n).fill(0);
  tr[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < n; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}
export function computeMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const n = closes.length;
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  const macdLine = new Array(n).fill(null);
  const validMacd = [];
  const validIdx = [];
  for (let i = 0; i < n; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      const val = emaFast[i] - emaSlow[i];
      macdLine[i] = val;
      validMacd.push(val);
      validIdx.push(i);
    }
  }
  const sigCompact = computeEMA(validMacd, signalPeriod);
  const signalLine = new Array(n).fill(null);
  const histogram = new Array(n).fill(null);
  for (let j = 0; j < validIdx.length; j++) {
    const idx = validIdx[j];
    if (sigCompact[j] !== null) {
      signalLine[idx] = sigCompact[j];
      histogram[idx] = macdLine[idx] - sigCompact[j];
    }
  }
  return { macdLine, signalLine, histogram };
}
export function computeBollingerBands(closes, period = 20, mult = 2) {
  const n = closes.length;
  const middle = computeSMA(closes, period);
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  const widthPct = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    const mean = middle[i];
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - mean;
      varianceSum += d * d;
    }
    const std = Math.sqrt(varianceSum / period);
    upper[i] = mean + mult * std;
    lower[i] = mean - mult * std;
    widthPct[i] = mean > 0 ? ((upper[i] - lower[i]) / mean) * 100 : 0;
  }
  return { upper, middle, lower, widthPct };
}
export function computeStochRSI(closes, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  const n = closes.length;
  const rsi = computeRSI(closes, rsiPeriod);
  const rawK = new Array(n).fill(null);
  for (let i = rsiPeriod + stochPeriod - 1; i < n; i++) {
    let minR = Infinity;
    let maxR = -Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      const v = rsi[j];
      if (v !== null) {
        if (v < minR) minR = v;
        if (v > maxR) maxR = v;
      }
    }
    if (Number.isFinite(minR) && Number.isFinite(maxR)) {
      rawK[i] = maxR === minR ? 50 : ((rsi[i] - minR) / (maxR - minR)) * 100;
    }
  }
  const kCompact = [];
  const kIdx = [];
  for (let i = 0; i < n; i++) {
    if (rawK[i] !== null) {
      kCompact.push(rawK[i]);
      kIdx.push(i);
    }
  }
  const kSmoothedCompact = computeSMA(kCompact, kSmooth);
  const dCompact = computeSMA(kSmoothedCompact.map((v) => v ?? 50), dSmooth);
  const k = new Array(n).fill(null);
  const d = new Array(n).fill(null);
  for (let j = 0; j < kIdx.length; j++) {
    const idx = kIdx[j];
    k[idx] = kSmoothedCompact[j];
    d[idx] = dCompact[j];
  }
  return { k, d };
}
export function computeADX(bars, period = 14) {
  const n = bars.length;
  const adx = new Array(n).fill(null);
  const plusDI = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  if (n <= period * 2) return { adx, plusDI, minusDI };
  const tr = new Array(n).fill(0);
  const pDM = new Array(n).fill(0);
  const mDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    pDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    mDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
  }
  let sTR = 0;
  let sPDM = 0;
  let sMDM = 0;
  for (let i = 1; i <= period; i++) {
    sTR += tr[i];
    sPDM += pDM[i];
    sMDM += mDM[i];
  }
  const dxList = new Array(n).fill(0);
  for (let i = period; i < n; i++) {
    if (i > period) {
      sTR = sTR - sTR / period + tr[i];
      sPDM = sPDM - sPDM / period + pDM[i];
      sMDM = sMDM - sMDM / period + mDM[i];
    }
    const pdi = sTR === 0 ? 0 : (sPDM / sTR) * 100;
    const mdi = sTR === 0 ? 0 : (sMDM / sTR) * 100;
    plusDI[i] = pdi;
    minusDI[i] = mdi;
    const sumDI = pdi + mdi;
    dxList[i] = sumDI === 0 ? 0 : (Math.abs(pdi - mdi) / sumDI) * 100;
  }
  let dxSum = 0;
  for (let i = period; i < period * 2; i++) dxSum += dxList[i];
  let prevAdx = dxSum / period;
  adx[period * 2 - 1] = prevAdx;
  for (let i = period * 2; i < n; i++) {
    prevAdx = (prevAdx * (period - 1) + dxList[i]) / period;
    adx[i] = prevAdx;
  }
  return { adx, plusDI, minusDI };
}
export function computeSessionVWAP(bars) {
  const n = bars.length;
  const vwap = new Array(n).fill(null);
  let cumPV = 0;
  let cumV = 0;
  let currentDay = null;
  for (let i = 0; i < n; i++) {
    const tSec = Number(bars[i].time || 0);
    const dayKey = Math.floor(tSec / 86400);
    if (dayKey !== currentDay) {
      currentDay = dayKey;
      cumPV = 0;
      cumV = 0;
    }
    const typical = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const vol = Math.max(Number(bars[i].volume || 0), 1e-8);
    cumPV += typical * vol;
    cumV += vol;
    vwap[i] = cumPV / cumV;
  }
  return vwap;
}
export function computeVolumeDeltaAndCVD(bars) {
  const n = bars.length;
  const delta = new Array(n).fill(0);
  const cvd = new Array(n).fill(0);
  let running = 0;
  for (let i = 0; i < n; i++) {
    const range = bars[i].high - bars[i].low;
    const vol = Number(bars[i].volume || 0);
    let buyRatio = 0.5;
    if (range > 0) {
      buyRatio = (bars[i].close - bars[i].low) / range;
    } else if (bars[i].close > bars[i].open) {
      buyRatio = 0.75;
    } else if (bars[i].close < bars[i].open) {
      buyRatio = 0.25;
    }
    const barDelta = vol * (2 * buyRatio - 1);
    delta[i] = barDelta;
    running += barDelta;
    cvd[i] = running;
  }
  return { delta, cvd };
}
export function computeConfirmedSwingsAndSMC(bars, upToIndex = null, leftRight = 3) {
  const maxIdx = upToIndex === null ? bars.length - 1 : Math.min(upToIndex, bars.length - 1);
  const swingHighs = [];
  const swingLows = [];
  for (let i = leftRight; i <= maxIdx - leftRight; i++) {
    const confirmedAtIndex = i + leftRight;
    if (confirmedAtIndex > maxIdx) break;
    const candidateHigh = bars[i].high;
    const candidateLow = bars[i].low;
    let isHigh = true;
    let isLow = true;
    for (let k = i - leftRight; k <= i + leftRight; k++) {
      if (k === i) continue;
      if (bars[k].high >= candidateHigh) isHigh = false;
      if (bars[k].low <= candidateLow) isLow = false;
    }
    if (isHigh) {
      swingHighs.push({ index: i, confirmedAtIndex, time: bars[i].time, price: candidateHigh });
    }
    if (isLow) {
      swingLows.push({ index: i, confirmedAtIndex, time: bars[i].time, price: candidateLow });
    }
  }
  let lastStructure = 'NEUTRAL';
  const lastHigh = swingHighs.length ? swingHighs[swingHighs.length - 1] : null;
  const prevHigh = swingHighs.length > 1 ? swingHighs[swingHighs.length - 2] : null;
  const lastLow = swingLows.length ? swingLows[swingLows.length - 1] : null;
  const prevLow = swingLows.length > 1 ? swingLows[swingLows.length - 2] : null;
  const currentClose = maxIdx >= 0 ? bars[maxIdx].close : 0;
  if (lastHigh && currentClose > lastHigh.price) {
    lastStructure = prevLow && lastLow && lastLow.price < prevLow.price ? 'BULLISH_CHOCH' : 'BULLISH_BOS';
  } else if (lastLow && currentClose < lastLow.price) {
    lastStructure = prevHigh && lastHigh && lastHigh.price > prevHigh.price ? 'BEARISH_CHOCH' : 'BEARISH_BOS';
  }
  let bullishOB = null;
  let bearishOB = null;
  if (lastLow) {
    const b = bars[lastLow.index];
    bullishOB = { top: Math.max(b.open, b.close), bottom: b.low, index: lastLow.index, time: b.time };
  }
  if (lastHigh) {
    const b = bars[lastHigh.index];
    bearishOB = { top: b.high, bottom: Math.min(b.open, b.close), index: lastHigh.index, time: b.time };
  }
  return { swingHighs, swingLows, lastStructure, bullishOB, bearishOB };
}
export function computeVPVR24(bars, lookback = 160, numBins = 24) {
  const slice = bars.slice(Math.max(0, bars.length - lookback));
  if (!slice.length) return { bins: [], poc: 0, vah: 0, val: 0 };
  let minP = Infinity;
  let maxP = -Infinity;
  for (const b of slice) {
    if (b.low < minP) minP = b.low;
    if (b.high > maxP) maxP = b.high;
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP) || maxP <= minP) {
    const p = slice[slice.length - 1].close;
    return { bins: [], poc: p, vah: p * 1.01, val: p * 0.99 };
  }
  const step = (maxP - minP) / numBins;
  const bins = Array.from({ length: numBins }, (_, idx) => ({
    binIndex: idx,
    low: minP + idx * step,
    high: minP + (idx + 1) * step,
    mid: minP + (idx + 0.5) * step,
    volume: 0,
    buyVolume: 0,
    sellVolume: 0
  }));
  let totalVol = 0;
  for (const b of slice) {
    const typical = (b.high + b.low + b.close) / 3;
    let idx = Math.floor((typical - minP) / step);
    if (idx < 0) idx = 0;
    if (idx >= numBins) idx = numBins - 1;
    const v = Math.max(Number(b.volume || 0), 1);
    const isBull = b.close >= b.open;
    bins[idx].volume += v;
    if (isBull) bins[idx].buyVolume += v;
    else bins[idx].sellVolume += v;
    totalVol += v;
  }
  let pocIdx = 0;
  for (let i = 1; i < numBins; i++) {
    if (bins[i].volume > bins[pocIdx].volume) pocIdx = i;
  }
  const targetVol = totalVol * 0.7;
  let accVol = bins[pocIdx].volume;
  let lowIdx = pocIdx;
  let highIdx = pocIdx;
  while (accVol < targetVol && (lowIdx > 0 || highIdx < numBins - 1)) {
    const nextLowVol = lowIdx > 0 ? bins[lowIdx - 1].volume : -1;
    const nextHighVol = highIdx < numBins - 1 ? bins[highIdx + 1].volume : -1;
    if (nextHighVol >= nextLowVol && highIdx < numBins - 1) {
      highIdx++;
      accVol += bins[highIdx].volume;
    } else if (lowIdx > 0) {
      lowIdx--;
      accVol += bins[lowIdx].volume;
    } else {
      break;
    }
  }
  const maxBinVol = bins[pocIdx].volume || 1;
  for (const bin of bins) {
    bin.pctOfMax = (bin.volume / maxBinVol) * 100;
  }
  return {
    bins,
    poc: bins[pocIdx].mid,
    vah: bins[highIdx].high,
    val: bins[lowIdx].low
  };
}
export function computeAllIndicators(bars) {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { series: {}, summary: {}, smc: {}, vpvr: {} };
  }
  const closes = bars.map((b) => Number(b.close));
  const ema20 = computeEMA(closes, 20);
  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(bars, 14);
  const macd = computeMACD(closes, 12, 26, 9);
  const bb = computeBollingerBands(closes, 20, 2);
  const stoch = computeStochRSI(closes, 14, 14, 3, 3);
  const adxObj = computeADX(bars, 14);
  const vwap = computeSessionVWAP(bars);
  const flow = computeVolumeDeltaAndCVD(bars);
  const smc = computeConfirmedSwingsAndSMC(bars, bars.length - 1, 3);
  const vpvr = computeVPVR24(bars, 160, 24);
  const last = bars.length - 1;
  const lastClose = closes[last];
  const lastAtr = atr14[last] ?? lastClose * 0.012;
  const lastAdx = adxObj.adx[last] ?? 18;
  const bbWidth = bb.widthPct[last] ?? 3.5;
  let regime = 'RANGING';
  if (lastAdx >= 25) regime = 'STRONG_TREND';
  else if (bbWidth < 2.2) regime = 'VOLATILITY_SQUEEZE';
  else if (lastAdx >= 20) regime = 'MODERATE_TREND';
  return {
    series: {
      ema20,
      ema50,
      ema200,
      rsi14,
      atr14,
      macdLine: macd.macdLine,
      macdSignal: macd.signalLine,
      macdHist: macd.histogram,
      bbUpper: bb.upper,
      bbMiddle: bb.middle,
      bbLower: bb.lower,
      bbWidthPct: bb.widthPct,
      stochK: stoch.k,
      stochD: stoch.d,
      adx14: adxObj.adx,
      plusDI: adxObj.plusDI,
      minusDI: adxObj.minusDI,
      vwap,
      delta: flow.delta,
      cvd: flow.cvd
    },
    summary: {
      close: lastClose,
      ema20: ema20[last] ?? lastClose,
      ema50: ema50[last] ?? lastClose,
      ema200: ema200[last] ?? lastClose,
      rsi14: rsi14[last] ?? 50,
      atr14: lastAtr,
      macdLine: macd.macdLine[last] ?? 0,
      macdSignal: macd.signalLine[last] ?? 0,
      macdHist: macd.histogram[last] ?? 0,
      bbUpper: bb.upper[last] ?? lastClose * 1.02,
      bbMiddle: bb.middle[last] ?? lastClose,
      bbLower: bb.lower[last] ?? lastClose * 0.98,
      bbWidthPct: bbWidth,
      bbSqueeze: bbWidth < 2.2,
      stochK: stoch.k[last] ?? 50,
      stochD: stoch.d[last] ?? 50,
      adx14: lastAdx,
      plusDI: adxObj.plusDI[last] ?? 20,
      minusDI: adxObj.minusDI[last] ?? 20,
      vwap: vwap[last] ?? lastClose,
      delta: flow.delta[last] ?? 0,
      cvd: flow.cvd[last] ?? 0,
      regime
    },
    smc,
    vpvr
  };
}