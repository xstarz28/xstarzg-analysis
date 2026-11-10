import { getInstrumentMeta, generateInstitutionalSeries } from '../../lib/quant-core.js';
import { runFullAnalysis } from '../../lib/signal-engine.js';
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get('symbol') || 'BTC/USDT';
  const timeframe = (url.searchParams.get('tf') || 'H1').toUpperCase();
  const mode = url.searchParams.get('mode') || 'trader';
  const horizon = url.searchParams.get('horizon') || 'intraday';
  const meta = getInstrumentMeta(symbol);
  const candles = generateInstitutionalSeries(meta, timeframe, 300);
  const result = runFullAnalysis({ symbol: meta.symbol, timeframe, mode, horizon, candles });
  return Response.json(result);
}
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const symbol = body.symbol || 'BTC/USDT';
    const timeframe = (body.timeframe || 'H1').toUpperCase();
    const mode = body.mode || 'trader';
    const horizon = body.horizon || 'intraday';
    const meta = getInstrumentMeta(symbol);
    const candles = Array.isArray(body.candles) && body.candles.length >= 30
      ? body.candles
      : generateInstitutionalSeries(meta, timeframe, 300);
    const result = runFullAnalysis({ symbol: meta.symbol, timeframe, mode, horizon, candles });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message || 'ANALYSIS_ERROR' }, { status: 400 });
  }
}