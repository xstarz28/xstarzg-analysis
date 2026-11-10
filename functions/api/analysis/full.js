import { evaluateQuantSignal } from '../../lib/signal-engine.js';
export async function onRequestPost(context) {
  const t0 = performance.now();
  try {
    const body = await context.request.json().catch(() => ({}));
    const symbol = String(body.symbol || 'BTC/USDT').toUpperCase();
    const assetClass = String(body.assetClass || 'crypto').toLowerCase();
    const timeframe = String(body.timeframe || 'H1').toUpperCase();
    const mode = body.mode === 'investor' ? 'investor' : 'trader';
    const derivatives = body.derivatives || {};
    let bars = Array.isArray(body.bars) ? body.bars : [];
    if (bars.length < 40) {
      const origin = new URL(context.request.url).origin;
      const qs = new URLSearchParams({ symbol, assetClass, timeframe, limit: '260' });
      const mRes = await fetch(`${origin}/api/market/ohlcv?${qs.toString()}`);
      const mJson = await mRes.json().catch(() => ({}));
      if (Array.isArray(mJson.bars)) bars = mJson.bars;
    }
    const evaluation = evaluateQuantSignal({
      bars,
      symbol,
      assetClass,
      timeframe,
      mode,
      derivatives
    });
    const computeMs = Number((performance.now() - t0).toFixed(2));
    return new Response(
      JSON.stringify({
        ok: true,
        ...evaluation,
        computeMs
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Compute-Time-Ms': String(computeMs)
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'Gagal menjalankan analisis penuh.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}