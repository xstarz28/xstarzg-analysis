import { fetchMarketCandles } from '../../lib/quant-core.js';
import { evaluateFullAnalysis } from '../../lib/signal-engine.js';
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get('symbol') || 'BTC/USDT';
  const tf = url.searchParams.get('tf') || 'H1';
  const mode = url.searchParams.get('mode') || 'TRADER';
  const market = await fetchMarketCandles(symbol, tf, 260);
  const analysis = evaluateFullAnalysis(market.instrument.symbol, tf, market.candles, mode);
  return Response.json({ ok: true, source: market.source, candles: market.candles, analysis });
}