import { getInstrumentMeta, generateInstitutionalSeries } from '../../lib/quant-core.js';
import { runFullAnalysis } from '../../lib/signal-engine.js';
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const mode = url.searchParams.get('mode') || 'trader';
  const horizon = url.searchParams.get('horizon') || 'intraday';
  const sampleList = horizon === 'scalping'
    ? [
        { sym: 'BTC/USDT', tf: 'M5' }, { sym: 'SOL/USDT', tf: 'M5' }, { sym: 'XAU/USD', tf: 'M15' },
        { sym: 'EUR/USD', tf: 'M5' }, { sym: 'PEPE/USDT', tf: 'M5' }, { sym: 'WTI', tf: 'M15' }
      ]
    : horizon === 'swing'
    ? [
        { sym: 'BTC/USDT', tf: 'H4' }, { sym: 'XAU/IDR', tf: 'D1' }, { sym: 'BBRI.JK', tf: 'D1' },
        { sym: 'CPO', tf: 'H4' }, { sym: 'COAL', tf: 'D1' }, { sym: 'SPY', tf: 'D1' }
      ]
    : [
        { sym: 'ETH/USDT', tf: 'M30' }, { sym: 'XAU/USD', tf: 'H1' }, { sym: 'BBCA.JK', tf: 'H1' },
        { sym: 'BMRI.JK', tf: 'H1' }, { sym: 'USD/IDR', tf: 'H1' }, { sym: 'NVDA', tf: 'H1' }
      ];
  const signals = [];
  for (const item of sampleList) {
    const meta = getInstrumentMeta(item.sym);
    const candles = generateInstitutionalSeries(meta, item.tf, 260);
    const res = runFullAnalysis({ symbol: meta.symbol, timeframe: item.tf, mode, horizon, candles });
    if (res && !res.error) {
      delete res.series;
      signals.push(res);
    }
  }
  signals.sort((a, b) => b.confluenceScore - a.confluenceScore);
  return Response.json({ horizon, mode, count: signals.length, signals });
}