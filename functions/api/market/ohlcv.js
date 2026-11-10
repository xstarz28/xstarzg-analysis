import { fetchMarketCandles } from '../../lib/quant-core.js';
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get('symbol') || 'BTC/USDT';
  const tf = url.searchParams.get('tf') || 'H1';
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '260', 10));
  const data = await fetchMarketCandles(symbol, tf, limit);
  return Response.json({ ok: true, symbol: data.instrument.symbol, timeframe: tf, source: data.source, instrument: data.instrument, candles: data.candles });
}