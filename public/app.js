// === XSTARZG_SAFE_REALTIME_TICKER_V2026_27 ===
(function () {
  let rtBusy = false;
  setInterval(async function () {
    if (rtBusy) return;
    try {
      if (typeof state === 'undefined' || !state || !state.symbol) return;
      const workEl = document.getElementById('appWorkspaceWrapper');
      if (workEl && workEl.classList.contains('hidden')) return;
      rtBusy = true;
      const sym = state.symbol;
      const tf = state.tf || state.timeframe || 'H1';
      const res = await fetch('/api/market/analyze?quote=1&symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(tf) + '&_t=' + Date.now(), {
        cache: 'no-store'
      });
      if (res.ok) {
        const d = await res.json();
        const q = d && d.quote ? d.quote : null;
        if (q && Number(q.price) > 0 && state.symbol === sym) {
          const liveP = Number(q.price);
          const prevP = Number(state.livePrice) || liveP;
          state.livePrice = liveP;
          if (Array.isArray(state.candles) && state.candles.length > 0) {
            const lastIdx = state.candles.length - 1;
            const lastBar = Object.assign({}, state.candles[lastIdx]);
            lastBar.close = liveP;
            if (liveP > lastBar.high) lastBar.high = liveP;
            if (liveP < lastBar.low) lastBar.low = liveP;
            state.candles[lastIdx] = lastBar;
            if (typeof candleSeries !== 'undefined' && candleSeries && typeof candleSeries.update === 'function') {
              try { candleSeries.update(lastBar); } catch (e) {}
            }
          }
          const fmt = typeof formatPrice === 'function' ? formatPrice(liveP, sym) : liveP.toLocaleString('en-US', { maximumFractionDigits: 2 });
          ['hdrLivePrice', 'livePriceDisplay', 'valCurrentPrice'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) {
              el.textContent = fmt;
              if (liveP !== prevP) {
                el.style.color = liveP > prevP ? '#10b981' : '#f43f5e';
              }
            }
          });
          if (Number.isFinite(Number(q.changePct))) {
            const chg = Number(q.changePct);
            ['hdrLiveChange', 'liveChangeDisplay'].forEach(function (id) {
              const el = document.getElementById(id);
              if (el) {
                el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
                el.style.color = chg >= 0 ? '#10b981' : '#f43f5e';
              }
            });
          }
        }
      }
    } catch (e) {}
    rtBusy = false;
  }, 1500);
})();

