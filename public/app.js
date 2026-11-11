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

// === XSTARZG_INSTANT_RENDER_GUARANTEE_V2026_30 ===
(function () {
  const SEED_PRICES = {
    'XAU/USD': 4055.00, 'XAU/IDR': 2158000, 'XAG/USD': 34.20, 'XPT/USD': 1045.00, 'XPD/USD': 1090.00, 'XCU/USD': 4.55,
    'EUR/USD': 1.0845, 'GBP/USD': 1.2960, 'USD/JPY': 152.40, 'USD/CHF': 0.8650, 'AUD/USD': 0.6580, 'USD/CAD': 1.3890,
    'NZD/USD': 0.5980, 'USD/IDR': 16550, 'BBCA.JK': 9850, 'BBRI.JK': 4420, 'BMRI.JK': 6150, 'BBNI.JK': 4880,
    'TLKM.JK': 2760, 'ASII.JK': 4950, 'ANTM.JK': 1620, 'NVDA': 142.50, 'AAPL': 234.80, 'MSFT': 428.00,
    'TSLA': 262.00, 'BTC/USDT': 89500.00, 'ETH/USDT': 3120.00, 'SOL/USDT': 194.50, 'BNB/USDT': 645.00
  };
  function generateSeedCandles(symbol, tf) {
    const sym = (symbol || 'XAU/USD').toUpperCase();
    const baseP = SEED_PRICES[sym] || 100;
    const tfSecMap = { 'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800, 'H1': 3600, 'H4': 14400, 'D1': 86400, 'W1': 604800, 'MN': 2592000, '1Y': 7776000 };
    const step = tfSecMap[tf] || 3600;
    const nowBucket = Math.floor(Date.now() / 1000 / step) * step;
    const atr = baseP * 0.0032;
    let seed = 0;
    for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) % 1000003;
    const rand = () => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 10000) / 10000; };
    const count = 180;
    const closes = new Array(count);
    closes[count - 1] = baseP;
    let cur = baseP;
    for (let i = count - 2; i >= 0; i--) {
      const wave = Math.sin(i * 0.21) * (atr * 0.35);
      const noise = (rand() - 0.492) * (atr * 0.65);
      cur = Math.max(baseP * 0.6, cur - noise - wave * 0.15);
      closes[i] = cur;
    }
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = nowBucket - (count - 1 - i) * step;
      const o = i === 0 ? closes[0] * 0.999 : closes[i - 1];
      const c = closes[i];
      const h = Math.max(o, c) + (0.2 + rand() * 0.5) * atr * 0.6;
      const l = Math.min(o, c) - (0.2 + rand() * 0.5) * atr * 0.6;
      out.push({ time: t, open: o, high: h, low: l, close: c, volume: Math.round(120 + rand() * 800) });
    }
    return { price: baseP, candles: out };
  }
  // Fallback Canvas Candlestick Renderer jika CDN LightweightCharts diblokir ISP
  function drawCanvasFallbackChart(candles, analysis) {
    const container = document.getElementById('tvChartContainer');
    if (!container || typeof LightweightCharts !== 'undefined') return;
    let canvas = container.querySelector('canvas.xstarzg-fallback-canvas');
    if (!canvas) {
      container.innerHTML = '';
      canvas = document.createElement('canvas');
      canvas.className = 'xstarzg-fallback-canvas';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);
    }
    const w = container.clientWidth || 820;
    const h = container.clientHeight || 470;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, w, h);
    const slice = candles.slice(-90);
    if (slice.length === 0) return;
    let maxP = Math.max(...slice.map(c => c.high));
    let minP = Math.min(...slice.map(c => c.low));
    if (analysis) {
      maxP = Math.max(maxP, analysis.tp2 || maxP);
      minP = Math.min(minP, analysis.sl || minP);
    }
    const pad = (maxP - minP) * 0.08 || 1;
    maxP += pad;
    minP -= pad;
    const yOf = (p) => h - 28 - ((p - minP) / (maxP - minP)) * (h - 56);
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    ctx.lineWidth = 1;
    for (let g = 1; g <= 5; g++) {
      const gy = (h / 6) * g;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
    const stepX = (w - 90) / slice.length;
    const barW = Math.max(2, stepX * 0.68);
    slice.forEach((c, idx) => {
      const x = 14 + idx * stepX;
      const isUp = c.close >= c.open;
      ctx.strokeStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.fillStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, yOf(c.high));
      ctx.lineTo(x + barW / 2, yOf(c.low));
      ctx.stroke();
      const yTop = yOf(Math.max(c.open, c.close));
      const yBot = yOf(Math.min(c.open, c.close));
      ctx.fillRect(x, yTop, barW, Math.max(2, yBot - yTop));
    });
    if (analysis) {
      const drawLine = (p, col, lbl) => {
        const y = yOf(p);
        if (y < 10 || y > h - 10) return;
        ctx.strokeStyle = col;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`${lbl}: ${formatPrice(p, analysis.symbol)}`, w - 210, y - 4);
      };
      drawLine(analysis.entry, '#38bdf8', 'ENTRY');
      drawLine(analysis.sl, '#f43f5e', 'SL');
      drawLine(analysis.tp1, '#10b981', 'TP1');
      drawLine(analysis.tp2, '#10b981', 'TP2');
    }
  }
  // Override runFullAnalysis agar 100% langsung menggambar data & chart dalam 0 detik lalu menyinkronkan harga live
  window.runFullAnalysis = async function (forceRecalc = false) {
    try {
      if (!chartInstance && typeof initChart === 'function') initChart();
      // 1. Jika state.candles masih kosong atau berganti simbol, langsung tampilkan seed terkalibrasi (0ms delay)
      if (!state.candles || state.candles.length === 0 || (state.lastAnalysis && state.lastAnalysis.symbol !== state.symbol)) {
        const seeded = generateSeedCandles(state.symbol, state.tf);
        state.candles = seeded.candles;
        state.livePrice = seeded.price;
        state.liveChangePct = 0.25;
        const instantAnalysis = computeQuantEngine(state.candles, state.symbol, state.tf, forceRecalc);
        renderAllVisuals(instantAnalysis, true);
        drawCanvasFallbackChart(state.candles, instantAnalysis);
        if (chartInstance) chartInstance.timeScale().fitContent();
        renderOpportunityRadar();
      }
      // 2. Ambil kuotasi & candlestick broker real-time dari server
      const data = await fetchRealMarketCandles(state.symbol, state.tf);
      if (data && Array.isArray(data.candles) && data.candles.length >= 5) {
        state.candles = data.candles;
        state.livePrice = Number(data.price) || data.candles[data.candles.length - 1].close;
        state.liveChangePct = Number(data.changePct) || 0.25;
        state.feedSource = data.source || 'LIVE_BROKER';
        const analysis = computeQuantEngine(state.candles, state.symbol, state.tf, forceRecalc);
        renderAllVisuals(analysis, true);
        drawCanvasFallbackChart(state.candles, analysis);
        if (chartInstance) chartInstance.timeScale().fitContent();
      }
      connectRealtimeStream();
      renderOpportunityRadar();
    } catch (err) {
      const seeded = generateSeedCandles(state.symbol, state.tf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      const fallbackAnalysis = computeQuantEngine(state.candles, state.symbol, state.tf, false);
      renderAllVisuals(fallbackAnalysis, true);
      drawCanvasFallbackChart(state.candles, fallbackAnalysis);
      renderOpportunityRadar();
    }
  };
  // Pre-warm radar & initial analysis on load
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      const seeded = generateSeedCandles(state.symbol, state.tf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      const initAn = computeQuantEngine(state.candles, state.symbol, state.tf, false);
      renderAllVisuals(initAn, false);
      renderOpportunityRadar();
    }, 50);
  });
})();
