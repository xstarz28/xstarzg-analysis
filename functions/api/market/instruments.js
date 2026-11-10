import { INSTRUMENTS, TIMEFRAMES, STRATEGY_HORIZONS } from '../../lib/quant-core.js';
export async function onRequestGet() {
  return Response.json({
    ok: true,
    count: INSTRUMENTS.length,
    timeframes: TIMEFRAMES,
    horizons: STRATEGY_HORIZONS,
    instruments: INSTRUMENTS
  });
}
