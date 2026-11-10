import { DEFAULT_INSTRUMENTS, TIMEFRAMES, HORIZON_GROUPS } from '../../lib/quant-core.js';
export async function onRequestGet() {
  return Response.json({
    count: DEFAULT_INSTRUMENTS.length,
    timeframes: TIMEFRAMES,
    horizons: HORIZON_GROUPS,
    instruments: DEFAULT_INSTRUMENTS
  });
}