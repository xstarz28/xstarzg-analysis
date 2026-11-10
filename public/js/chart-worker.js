import { computeAllIndicators } from './shared/quant-core.js';
import { evaluateQuantSignal } from './shared/signal-engine.js';
self.onmessage = function (e) {
  const msg = e.data || {};
  const { type, reqId, payload } = msg;
  try {
    const t0 = performance.now();
    if (type === 'COMPUTE_INDICATORS') {
      const bars = payload?.bars || [];
      const indicators = computeAllIndicators(bars);
      const computeMs = Number((performance.now() - t0).toFixed(2));
      self.postMessage({ ok: true, reqId, type, computeMs, indicators });
    } else if (type === 'EVALUATE_SIGNAL') {
      const result = evaluateQuantSignal(payload || {});
      self.postMessage({ ok: true, reqId, type, computeMs: result.computeMs, result });
    }
  } catch (err) {
    self.postMessage({ ok: false, reqId, type, error: err?.message || 'Worker computation error' });
  }
};