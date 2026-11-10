import { fetchMarketCandles } from '../../lib/quant-core.js';
import { evaluateFullAnalysis } from '../../lib/signal-engine.js';
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const horizon = (url.searchParams.get('horizon') || 'INTRADAY').toUpperCase();
  const mode = (url.searchParams.get('mode') || 'TRADER').toUpperCase();
  if (mode === 'SPOT_INVESTOR') {
    const investorPools = {
      VALUE:    ['BBRI.JK', 'TLKM.JK', 'ASII.JK', 'ADRO.JK', 'XAG/USD', 'LINK/USDT'],
      BLUECHIP: ['XAU/USD', 'BBCA.JK', 'BMRI.JK', 'BTC/USDT', 'AAPL', 'MSFT'],
      GROWTH:   ['NVDA', 'SOL/USDT', 'AMMN.JK', 'ANTM.JK', 'ETH/USDT', 'META']
    };
    const pool = investorPools[horizon] || investorPools.BLUECHIP;
    const results = await Promise.all(pool.map(async (sym) => {
      const { candles } = await fetchMarketCandles(sym, 'D1', 200);
      const sig = evaluateFullAnalysis(sym, 'D1', candles, 'SPOT_INVESTOR');
      return {
        symbol: sig.symbol, name: sig.name, assetClass: sig.assetClass,
        timeframe: 'D1 (SPOT)', horizon, mode: 'SPOT_INVESTOR',
        direction: 'ACCUMULATE SPOT', confidence: sig.confidence,
        lastPrice: sig.lastPrice,
        entryPrice: sig.spotPlan.dcaZones[0].price,
        stopLoss: sig.spotPlan.dcaZones[1].price,
        tp1: sig.spotPlan.cycleTargets[0].price,
        tp2: sig.spotPlan.cycleTargets[1].price,
        fairValue: sig.spotPlan.fairValue,
        marginOfSafetyPct: sig.spotPlan.marginOfSafetyPct,
        winRate: sig.backtest.winRate, profitFactor: sig.backtest.profitFactor
      };
    }));
    results.sort((a, b) => b.confidence - a.confidence);
    return Response.json({ ok: true, horizon, mode, signals: results });
  }
  const tfMap = { SCALPING: 'M5', INTRADAY: 'M30', SWING: 'H4', INVESTOR: 'D1' };
  const tf = tfMap[horizon] || 'H1';
  const watchPool = ['BTC/USDT', 'XAU/USD', 'EUR/USD', 'SOL/USDT', 'GBP/USD', 'BBCA.JK', 'NVDA', 'WTI'];
  const results = await Promise.all(watchPool.map(async (sym) => {
    const { candles } = await fetchMarketCandles(sym, tf, 200);
    const sig = evaluateFullAnalysis(sym, tf, candles, 'TRADER');
    return {
      symbol: sig.symbol, name: sig.name, assetClass: sig.assetClass,
      timeframe: tf, horizon, mode: 'TRADER',
      direction: sig.traderPlan.direction, confidence: sig.confidence,
      lastPrice: sig.lastPrice, entryPrice: sig.traderPlan.entryPrice,
      stopLoss: sig.traderPlan.stopLoss, tp1: sig.traderPlan.tp1, tp2: sig.traderPlan.tp2,
      winRate: sig.backtest.winRate, profitFactor: sig.backtest.profitFactor
    };
  }));
  results.sort((a, b) => b.confidence - a.confidence);
  return Response.json({ ok: true, horizon, mode: 'TRADER', signals: results.slice(0, 6) });
}
