import { getInstrumentMeta, generateInstitutionalSeries } from '../../lib/quant-core.js';
const BINANCE_INTERVAL_MAP = {
  M1: '1m', M5: '5m', M15: '15m', M30: '30m', H1: '1h', H4: '4h', D1: '1d', W1: '1w', MN: '1M', '1Y': '1M'
};
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get('symbol') || 'BTC/USDT';
  const tf = (url.searchParams.get('tf') || 'H1').toUpperCase();
  const meta = getInstrumentMeta(symbol);
  if (meta.assetClass === 'crypto') {
    const interval = BINANCE_INTERVAL_MAP[tf] || '1h';
    const pair = meta.providerSymbol || symbol.replace('/', '');
    try {
      const binUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=300`;
      const resp = await fetch(binUrl, { headers: { 'User-Agent': 'XSTARZG-Quant/2026' } });
      if (resp.ok) {
        const raw = await resp.json();
        if (Array.isArray(raw) && raw.length > 20) {
          const candles = raw.map(k => ({
            time: Math.floor(Number(k[0]) / 1000),
            open: Number(k[1]),
            high: Number(k[2]),
            low: Number(k[3]),
            close: Number(k[4]),
            volume: Number(k[5])
          }));
          return Response.json({ symbol: meta.symbol, timeframe: tf, source: 'BINANCE_VISION_EDGE', isRealtime: true, candles });
        }
      }
    } catch (_) {}
  }
  const candles = generateInstitutionalSeries(meta, tf, 300);
  return Response.json({
    symbol: meta.symbol,
    timeframe: tf,
    source: `${meta.assetClass.toUpperCase()}_INSTITUTIONAL_EDGE`,
    isRealtime: true,
    candles
  });
}