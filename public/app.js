(function () {
  const STATE = {
    catalog: [],
    binancePairs: [],
    assetClass: 'ALL',
    symbol: localStorage.getItem('xstarzg_last_symbol') || 'BTC/USDT',
    horizon: 'ALL',
    timeframe: localStorage.getItem('xstarzg_last_tf') || 'H1',
    mode: localStorage.getItem('xstarzg_last_mode') || 'TRADER',
    radarHorizon: 'INTRADAY',
    overlays: { ema: true, vwap: true, bb: false, smc: true },
    chart: null,
    candleSeries: null,
    lineSeries: {},
    priceLines: [],
    lastAnalysis: null,
    lastCandles: [],
    ws: null,
    livePollTimer: null,
    countdownTimer: null,
    user: null,
    googleClientId: null
  };
  const HORIZON_CONFIG = {
    SCALPING: { tfs: ['M1', 'M5', 'M15'], def: 'M5' },
    INTRADAY: { tfs: ['M15', 'M30', 'H1'], def: 'M30' },
    SWING:    { tfs: ['H4', 'D1', 'W1'], def: 'H4' },
    INVESTOR: { tfs: ['D1', 'W1', 'MN', '1Y'], def: 'D1' },
    ALL:      { tfs: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN', '1Y'], def: 'H1' }
  };
  const TF_SECONDS = { 'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800, 'H1': 3600, 'H4': 14400, 'D1': 86400, 'W1': 604800, 'MN': 2592000, '1Y': 31536000 };
  const el = id => document.getElementById(id);
  function showScreen(screenName) {
    const front = el('frontLandingScreen');
    const login = el('loginGateScreen');
    const app = el('appWorkspaceWrapper');
    if (front) front.style.display = screenName === 'FRONT' ? 'block' : 'none';
    if (login) login.style.display = screenName === 'LOGIN' ? 'flex' : 'none';
    if (app)   app.style.display   = screenName === 'APP'   ? 'block' : 'none';
    if (screenName === 'APP') {
      localStorage.setItem('xstarzg_session_active', '1');
      setTimeout(() => {
        if (STATE.chart) {
          const container = el('tvChartContainer');
          STATE.chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 470 });
          focusCleanTradingViewZoom();
        }
      }, 60);
    }
  }
  function setupNavigationAndProfileMenu() {
    el('btnFrontGoLogin')?.addEventListener('click', () => showScreen('LOGIN'));
    el('btnHeroGoLogin')?.addEventListener('click', () => showScreen('LOGIN'));
    el('btnBottomGoLogin')?.addEventListener('click', () => showScreen('LOGIN'));
    el('btnBackToFrontLanding')?.addEventListener('click', () => showScreen('FRONT'));
    const enterPreview = () => {
      if (!STATE.user) {
        STATE.user = { email: 'guest@xstarzg.io', name: 'Guest Trader', tier: 'FREE' };
        localStorage.setItem('xstarzg_user_profile', JSON.stringify(STATE.user));
      }
      localStorage.setItem('xstarzg_session_active', '1');
      updateUserTopbarUI();
      showScreen('APP');
    };
    el('btnHeroQuickPreview')?.addEventListener('click', enterPreview);
    el('btnSkipLoginGate')?.addEventListener('click', enterPreview);
    const btnProfile = el('btnUserSession');
    const dropdown = el('userProfileDropdown');
    if (btnProfile && dropdown) {
      btnProfile.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
      });
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btnProfile) dropdown.style.display = 'none';
      });
    }
    el('btnMenuOpenLogin')?.addEventListener('click', () => { if (dropdown) dropdown.style.display = 'none'; showScreen('LOGIN'); });
    el('btnMenuOpenVip')?.addEventListener('click', () => { if (dropdown) dropdown.style.display = 'none'; if (el('vipModal')) el('vipModal').style.display = 'flex'; });
    el('btnMenuGoFrontPage')?.addEventListener('click', () => { if (dropdown) dropdown.style.display = 'none'; showScreen('FRONT'); });
    el('btnMenuLogout')?.addEventListener('click', () => { if (dropdown) dropdown.style.display = 'none'; logoutUserSession(); });
  }
  function updateUserTopbarUI() {
    const lblTop = el('lblUserStatus');
    const dName = el('dropdownUserName');
    const dEmail = el('dropdownUserEmail');
    const dTier = el('dropdownUserTier');
    if (STATE.user && STATE.user.email && STATE.user.email !== 'guest@xstarzg.io') {
      const shortName = STATE.user.name || STATE.user.email.split('@')[0];
      if (lblTop) lblTop.textContent = `${shortName} (${STATE.user.tier || 'VIP'})`;
      if (dName) dName.textContent = STATE.user.name || shortName;
      if (dEmail) dEmail.textContent = STATE.user.email;
      if (dTier) dTier.textContent = `STATUS: ${STATE.user.tier || 'MEMBER'} AKTIF`;
    } else {
      if (lblTop) lblTop.textContent = 'Guest / Akun ▼';
      if (dName) dName.textContent = 'Mode Preview / Guest';
      if (dEmail) dEmail.textContent = 'Klik Login Google untuk Sinkronisasi VIP';
      if (dTier) dTier.textContent = 'FREE PREVIEW MODE';
    }
  }
  function logoutUserSession() {
    localStorage.removeItem('xstarzg_jwt');
    localStorage.removeItem('xstarzg_user_profile');
    localStorage.removeItem('xstarzg_session_active');
    STATE.user = null;
    updateUserTopbarUI();
    showScreen('LOGIN');
  }
  function initChart() {
    const container = el('tvChartContainer');
    if (!container || !window.LightweightCharts) return;
    container.innerHTML = '';
    STATE.chart = window.LightweightCharts.createChart(container, {
      width: container.clientWidth || 850,
      height: 470,
      layout: { background: { type: 'solid', color: '#070b14' }, textColor: '#94a3b8', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(148, 163, 184, 0.04)' }, horzLines: { color: 'rgba(148, 163, 184, 0.04)' } },
      crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.14)', scaleMargins: { top: 0.12, bottom: 0.15 } },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.14)', timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 9 }
    });
    STATE.candleSeries = STATE.chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#f43f5e',
      borderUpColor: '#10b981', borderDownColor: '#f43f5e',
      wickUpColor: '#10b981', wickDownColor: '#f43f5e'
    });
    const cleanOpts = { lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false };
    STATE.lineSeries.ema20  = STATE.chart.addLineSeries({ ...cleanOpts, color: '#38bdf8', lineWidth: 1 });
    STATE.lineSeries.ema50  = STATE.chart.addLineSeries({ ...cleanOpts, color: '#f59e0b', lineWidth: 1 });
    STATE.lineSeries.ema200 = STATE.chart.addLineSeries({ ...cleanOpts, color: '#a855f7', lineWidth: 2 });
    STATE.lineSeries.vwap   = STATE.chart.addLineSeries({ ...cleanOpts, color: '#eab308', lineWidth: 1, lineStyle: 2 });
    STATE.lineSeries.bbUp   = STATE.chart.addLineSeries({ ...cleanOpts, color: 'rgba(148,163,184,0.35)', lineWidth: 1, lineStyle: 2 });
    STATE.lineSeries.bbLow  = STATE.chart.addLineSeries({ ...cleanOpts, color: 'rgba(148,163,184,0.35)', lineWidth: 1, lineStyle: 2 });
    STATE.chart.subscribeCrosshairMove(param => {
      if (!param || !param.time || !param.seriesData) return;
      const bar = param.seriesData.get(STATE.candleSeries);
      if (bar) updateFloatingLegend(bar);
    });
    window.addEventListener('resize', () => {
      if (STATE.chart && container.clientWidth > 0) STATE.chart.applyOptions({ width: container.clientWidth });
    });
    el('btnResetChartZoom')?.addEventListener('click', () => focusCleanTradingViewZoom());
  }
  function focusCleanTradingViewZoom() {
    if (!STATE.chart || !STATE.lastCandles || STATE.lastCandles.length < 10) return;
    const total = STATE.lastCandles.length;
    STATE.chart.timeScale().setVisibleLogicalRange({ from: total - Math.min(85, total), to: total + 6 });
  }
  function updateFloatingLegend(bar) {
    if (!bar) return;
    const d = STATE.lastAnalysis?.decimals ?? 2;
    const fmt = v => Number(v || 0).toFixed(d);
    if (el('legOpen')) el('legOpen').textContent = fmt(bar.open);
    if (el('legHigh')) el('legHigh').textContent = fmt(bar.high);
    if (el('legLow'))  el('legLow').textContent  = fmt(bar.low);
    if (el('legClose')) el('legClose').textContent = fmt(bar.close);
  }
  function clearPriceLines() {
    if (!STATE.candleSeries) return;
    STATE.priceLines.forEach(pl => { try { STATE.candleSeries.removePriceLine(pl); } catch {} });
    STATE.priceLines = [];
  }
  function renderChartOverlays(analysis) {
    if (!STATE.candleSeries || !analysis || !analysis.overlays) return;
    const ov = analysis.overlays;
    const d = analysis.decimals ?? 2;
    const fmt = v => Number(v || 0).toFixed(d);
    STATE.lineSeries.ema20.setData(STATE.overlays.ema ? ov.ema20 : []);
    STATE.lineSeries.ema50.setData(STATE.overlays.ema ? ov.ema50 : []);
    STATE.lineSeries.ema200.setData(STATE.overlays.ema ? ov.ema200 : []);
    STATE.lineSeries.vwap.setData(STATE.overlays.vwap ? ov.vwap : []);
    STATE.lineSeries.bbUp.setData(STATE.overlays.bb ? ov.bbUpper : []);
    STATE.lineSeries.bbLow.setData(STATE.overlays.bb ? ov.bbLower : []);
    if (ov.ema20?.length)  el('legEma20').textContent  = fmt(ov.ema20[ov.ema20.length - 1].value);
    if (ov.ema50?.length)  el('legEma50').textContent  = fmt(ov.ema50[ov.ema50.length - 1].value);
    if (ov.ema200?.length) el('legEma200').textContent = fmt(ov.ema200[ov.ema200.length - 1].value);
    if (ov.vwap?.length)   el('legVwap').textContent   = fmt(ov.vwap[ov.vwap.length - 1].value);
    if (ov.keyLevels)      el('legPoc').textContent    = fmt(ov.keyLevels.poc);
    clearPriceLines();
    const kl = ov.keyLevels;
    if (!kl) return;
    const addLine = (price, title, color, lineStyle = 2, lineWidth = 1) => {
      if (price == null || isNaN(price)) return;
      const pl = STATE.candleSeries.createPriceLine({ price: Number(price), color, lineWidth, lineStyle, axisLabelVisible: true, title });
      STATE.priceLines.push(pl);
    };
    if (STATE.overlays.smc) addLine(kl.poc, 'POC', '#eab308', 2, 1);
    if (STATE.mode === 'TRADER') {
      addLine(kl.entryPrice, 'ENTRY', '#38bdf8', 0, 2);
      addLine(kl.stopLoss, 'STOP LOSS', '#f43f5e', 0, 2);
      addLine(kl.tp1, 'TP1 (1.5R)', '#10b981', 2, 1);
      addLine(kl.tp2, 'TP2 (2.5R)', '#10b981', 0, 2);
    } else if (analysis.spotPlan?.dcaZones) {
      addLine(analysis.spotPlan.dcaZones[0].price, 'SPOT DCA 1 (40%)', '#38bdf8', 0, 2);
      addLine(analysis.spotPlan.dcaZones[1].price, 'SPOT DCA 2 (35%)', '#10b981', 2, 2);
      addLine(analysis.spotPlan.dcaZones[2].price, 'SPOT DCA 3 (25%)', '#eab308', 2, 1);
    }
  }
  function startRealtimeCandleStream(symbol, decimals = 2) {
    if (STATE.ws) { try { STATE.ws.close(); } catch {} STATE.ws = null; }
    if (STATE.livePollTimer) { clearInterval(STATE.livePollTimer); STATE.livePollTimer = null; }
    if (STATE.countdownTimer) { clearInterval(STATE.countdownTimer); STATE.countdownTimer = null; }
    const applyRealtimeTick = (newPrice) => {
      if (!STATE.candleSeries || !STATE.lastCandles || STATE.lastCandles.length === 0) return;
      const lastBar = STATE.lastCandles[STATE.lastCandles.length - 1];
      const prevClose = lastBar.close;
      const roundedPrice = Number(newPrice.toFixed(decimals));
      lastBar.close = roundedPrice;
      if (roundedPrice > lastBar.high) lastBar.high = roundedPrice;
      if (roundedPrice < lastBar.low)  lastBar.low  = roundedPrice;
      STATE.candleSeries.update(lastBar);
      updateFloatingLegend(lastBar);
      const priceEl = el('lblActivePrice');
      if (priceEl) {
        priceEl.textContent = roundedPrice.toFixed(decimals);
        priceEl.classList.remove('flash-up', 'flash-dn');
        void priceEl.offsetWidth;
        priceEl.classList.add(roundedPrice >= prevClose ? 'flash-up' : 'flash-dn');
      }
    };
    const wsPairMap = { 'XAU/USD': 'paxgusdt', 'EUR/USD': 'eurusdt', 'GBP/USD': 'gbpusdt', 'AUD/USD': 'audusdt' };
    const cleanSym = symbol.replace('/', '').toLowerCase();
    const wsPair = wsPairMap[symbol] || (cleanSym.endsWith('usdt') ? cleanSym : null);
    if (wsPair) {
      try {
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${wsPair}@miniTicker`);
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            const livePrice = parseFloat(msg.c);
            if (!isNaN(livePrice) && livePrice > 0) applyRealtimeTick(livePrice);
          } catch {}
        };
        STATE.ws = ws;
      } catch {}
    }
    STATE.livePollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/market/ohlcv?symbol=${encodeURIComponent(STATE.symbol)}&tf=${STATE.timeframe}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.candles?.length > 0) {
            const latestBar = data.candles[data.candles.length - 1];
            if (latestBar && latestBar.close > 0) applyRealtimeTick(latestBar.close);
          }
        }
      } catch {}
    }, 12000);
    const tfSec = TF_SECONDS[STATE.timeframe] || 3600;
    STATE.countdownTimer = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const rem = tfSec - (nowSec % tfSec);
      const hrs = Math.floor(rem / 3600);
      const mins = Math.floor((rem % 3600) / 60);
      const secs = rem % 60;
      const pad = n => String(n).padStart(2, '0');
      const str = hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
      if (el('lblCandleCountdown')) el('lblCandleCountdown').textContent = `⏱ ${STATE.timeframe} Close: ${str}`;
    }, 1000);
  }
  async function loadInstrumentCatalog() {
    try {
      const res = await fetch('/api/market/instruments');
      const data = await res.json();
      if (data.ok && Array.isArray(data.instruments)) STATE.catalog = data.instruments;
    } catch {}
    populateInstrumentSelect();
    loadAllBinanceUsdtPairs();
  }
  async function loadAllBinanceUsdtPairs() {
    try {
      const res = await fetch('https://data-api.binance.vision/api/v3/ticker/price');
      if (!res.ok) return;
      const tickers = await res.json();
      if (!Array.isArray(tickers)) return;
      const existingSet = new Set(STATE.catalog.map(i => i.binanceSymbol || i.symbol.replace('/', '')));
      const extras = [];
      for (const t of tickers) {
        if (t.symbol && t.symbol.endsWith('USDT') && !existingSet.has(t.symbol)) {
          const base = t.symbol.slice(0, -4);
          if (base.length >= 2 && !base.includes('UP') && !base.includes('DOWN')) {
            extras.push({
              symbol: `${base}/USDT`, name: `${base} Spot (Binance)`, assetClass: 'CRYPTO',
              subGroup: 'BINANCE_ALL', binanceSymbol: t.symbol,
              basePrice: parseFloat(t.price) || 1.0,
              decimals: parseFloat(t.price) < 0.01 ? 6 : (parseFloat(t.price) < 1 ? 4 : 2),
              spotEligible: true
            });
          }
        }
      }
      STATE.binancePairs = extras;
      const badge = el('lblAssetCounter');
      if (badge) badge.textContent = `${STATE.catalog.length + extras.length}+ Instrumen Real-Time`;
    } catch {}
  }
  function populateInstrumentSelect(filterText = '') {
    const sel = el('instrumentSelect');
    if (!sel) return;
    const q = filterText.trim().toUpperCase();
    let list = [...STATE.catalog];
    if (q.length >= 2 && (STATE.assetClass === 'ALL' || STATE.assetClass === 'CRYPTO')) {
      list = [...list, ...STATE.binancePairs.filter(p => p.symbol.includes(q)).slice(0, 60)];
    }
    if (STATE.mode === 'SPOT_INVESTOR') {
      list = list.filter(i => i.spotEligible !== false && i.assetClass !== 'FOREX');
    }
    const filtered = list.filter(item => {
      const matchClass = STATE.assetClass === 'ALL' || item.assetClass === STATE.assetClass;
      const matchQuery = !q || item.symbol.toUpperCase().includes(q) || item.name.toUpperCase().includes(q);
      return matchClass && matchQuery;
    });
    sel.innerHTML = '';
    filtered.forEach(inst => {
      const opt = document.createElement('option');
      opt.value = inst.symbol;
      opt.textContent = `[${inst.assetClass}] ${inst.symbol} — ${inst.name}`;
      if (inst.symbol === STATE.symbol) opt.selected = true;
      sel.appendChild(opt);
    });
    if (STATE.mode === 'SPOT_INVESTOR' && filtered.length > 0 && !filtered.some(i => i.symbol === STATE.symbol)) {
      STATE.symbol = filtered[0].symbol;
      sel.value = STATE.symbol;
    }
  }
  function renderTimeframeBar() {
    const bar = el('timeframeBar');
    if (!bar) return;
    const allowedTfs = HORIZON_CONFIG[STATE.horizon]?.tfs || HORIZON_CONFIG.ALL.tfs;
    bar.innerHTML = '';
    allowedTfs.forEach(tf => {
      const btn = document.createElement('button');
      btn.className = `tf-btn ${tf === STATE.timeframe ? 'active' : ''}`;
      btn.textContent = tf;
      btn.addEventListener('click', () => {
        STATE.timeframe = tf;
        localStorage.setItem('xstarzg_last_tf', tf);
        renderTimeframeBar();
        loadMarketAndAnalyze();
      });
      bar.appendChild(btn);
    });
  }
  function updateRadarTabsForMode() {
    const radarTabs = el('radarHorizonTabs');
    const radarSub = document.querySelector('.opportunity-radar-head .radar-sub');
    if (!radarTabs) return;
    if (STATE.mode === 'SPOT_INVESTOR') {
      if (radarSub) radarSub.textContent = '(Rekomendasi Akumulasi Spot, Saham Blue-Chip, Emas & Aset Diskon Intrinsik)';
      if (!['VALUE', 'BLUECHIP', 'GROWTH'].includes(STATE.radarHorizon)) STATE.radarHorizon = 'BLUECHIP';
      radarTabs.innerHTML = `
        <button class="radar-tab-btn ${STATE.radarHorizon === 'VALUE' ? 'active' : ''}" data-rhorizon="VALUE">💎 Undervalued Value</button>
        <button class="radar-tab-btn ${STATE.radarHorizon === 'BLUECHIP' ? 'active' : ''}" data-rhorizon="BLUECHIP">🏛️ Core Blue-Chip</button>
        <button class="radar-tab-btn ${STATE.radarHorizon === 'GROWTH' ? 'active' : ''}" data-rhorizon="GROWTH">🚀 Cycle Growth</button>
      `;
    } else {
      if (radarSub) radarSub.textContent = '(Rekomendasi Setup Terbaik Sesuai Gaya Trading)';
      if (!['SCALPING', 'INTRADAY', 'SWING'].includes(STATE.radarHorizon)) STATE.radarHorizon = 'INTRADAY';
      radarTabs.innerHTML = `
        <button class="radar-tab-btn ${STATE.radarHorizon === 'SCALPING' ? 'active' : ''}" data-rhorizon="SCALPING">⚡ Scalping (M1-M15)</button>
        <button class="radar-tab-btn ${STATE.radarHorizon === 'INTRADAY' ? 'active' : ''}" data-rhorizon="INTRADAY">🎯 Intraday (M15-H1)</button>
        <button class="radar-tab-btn ${STATE.radarHorizon === 'SWING' ? 'active' : ''}" data-rhorizon="SWING">🌊 Swing (H4-D1)</button>
      `;
    }
    radarTabs.querySelectorAll('.radar-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        STATE.radarHorizon = btn.dataset.rhorizon;
        updateRadarTabsForMode();
        loadTopOpportunityRadar(STATE.radarHorizon);
      });
    });
  }
  async function loadMarketAndAnalyze() {
    try {
      const url = `/api/analysis/full?symbol=${encodeURIComponent(STATE.symbol)}&tf=${STATE.timeframe}&mode=${STATE.mode}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) return;
      STATE.lastAnalysis = data.analysis;
      STATE.lastCandles = data.candles || [];
      if (STATE.candleSeries && data.candles?.length) {
        STATE.candleSeries.setData(data.candles);
        updateFloatingLegend(data.candles[data.candles.length - 1]);
        focusCleanTradingViewZoom();
      }
      renderChartOverlays(data.analysis);
      renderAnalysisPanels(data.analysis);
      startRealtimeCandleStream(data.analysis.symbol, data.analysis.decimals ?? 2);
    } catch {}
  }
  function renderAnalysisPanels(a) {
    const d = a.decimals ?? 2;
    const fmt = v => Number(v || 0).toFixed(d);
    el('lblActiveSymbol').textContent = a.symbol;
    el('lblActiveName').textContent = `${a.name} • [${a.assetClass}]`;
    el('lblActivePrice').textContent = fmt(a.lastPrice);
    const chgEl = el('lblActiveChange');
    chgEl.textContent = `${a.changePct >= 0 ? '+' : ''}${a.changePct}%`;
    chgEl.className = `active-change ${a.changePct >= 0 ? 'up' : 'dn'}`;
    const banner = el('signalDecisionBanner');
    const isLong = a.direction.includes('LONG') || a.direction.includes('ACCUMULATE') || a.direction.includes('HOLD');
    banner.className = `signal-decision-banner ${isLong ? 'bull' : 'bear'}`;
    el('lblSignalDirection').textContent = a.direction;
    el('lblSignalSub').textContent = STATE.mode === 'SPOT_INVESTOR'
      ? `${a.spotPlan.wyckoffPhase} • Margin of Safety: ${a.spotPlan.marginOfSafetyPct >= 0 ? '+' : ''}${a.spotPlan.marginOfSafetyPct}% (Fair Value: ${fmt(a.spotPlan.fairValue)})`
      : `Konfluensi 12 Indikator Teknikal + Fundamental CFTC • R:R ${a.traderPlan.rrRatio}`;
    el('lblConfidenceScore').textContent = `${a.confidence}%`;
    const isSpot = STATE.mode === 'SPOT_INVESTOR';
    el('traderExecutionCard').style.display = isSpot ? 'none' : 'block';
    el('spotInvestorCard').style.display = isSpot ? 'block' : 'none';
    if (!isSpot) {
      el('valEntryPrice').textContent = fmt(a.traderPlan.entryPrice);
      el('valStopLoss').textContent = fmt(a.traderPlan.stopLoss);
      el('valTp1').textContent = fmt(a.traderPlan.tp1);
      el('valTp2').textContent = fmt(a.traderPlan.tp2);
      el('valTp3').textContent = fmt(a.traderPlan.tp3);
      updatePositionSizing();
    } else if (a.spotPlan) {
      const sp = a.spotPlan;
      el('dcaZoneGrid').innerHTML = `
        <div class="dca-stage-item" style="border-left:3px solid #38bdf8; background:rgba(56,189,248,0.06);">
          <div>
            <strong>💎 Nilai Wajar Intrinsik (Fair Value) & Margin of Safety</strong>
            <span>${sp.wyckoffPhase} • ${sp.passiveYieldLabel}</span>
          </div>
          <div class="dca-price" style="color:#38bdf8;">Fair: ${fmt(sp.fairValue)} (${sp.marginOfSafetyPct >= 0 ? '+' : ''}${sp.marginOfSafetyPct}% MoS)</div>
        </div>
        ${sp.dcaZones.map(z => `
          <div class="dca-stage-item">
            <div><strong>${z.stage}</strong><span>${z.note}</span></div>
            <div class="dca-price">${fmt(z.price)}</div>
          </div>
        `).join('')}
        <div class="dca-stage-item" style="border-left:3px solid #eab308;">
          <div>
            <strong>⚖️ Estimasi Harga Rata-Rata Akumulasi (Weighted Avg Cost)</strong>
            <span>Jika ketiga tahap DCA (40% + 35% + 25%) terisi penuh</span>
          </div>
          <div class="dca-price" style="color:#eab308;">Avg: ${fmt(sp.weightedAvgCost)}</div>
        </div>
      `;
      el('spotTargetGrid').innerHTML = sp.cycleTargets.map(t => `
        <div class="exec-item tp"><span>${t.label}</span><strong>${fmt(t.price)}</strong></div>
      `).join('');
    }
    const techBody = el('techConfluenceBody');
    if (techBody && Array.isArray(a.technicalSummary)) {
      techBody.innerHTML = a.technicalSummary.map(row => {
        const cls = row.bias === 'BULLISH' ? 'bull' : (row.bias === 'BEARISH' ? 'bear' : 'neutral');
        return `<tr><td><strong>${row.name}</strong></td><td>${row.value}</td><td><span class="bias-pill ${cls}">${row.bias}</span></td></tr>`;
      }).join('');
    }
    const f = a.fundamental || {};
    const fGrid = el('fundamentalDetailGrid');
    if (fGrid) {
      if (el('lblFundamentalBias')) el('lblFundamentalBias').textContent = f.summaryBias || 'FUNDAMENTAL & COT ACTIVE';
      fGrid.innerHTML = `
        <div class="fund-row"><strong>1. Posisi CFTC COT (Non-Commercial vs Commercial Hedgers)</strong><p>${f.cotPositioning}</p></div>
        <div class="fund-row"><strong>2. Kontrak Bersih Spekulan Besar (Net Speculative Positioning)</strong><p>${f.cotNetSpec}</p></div>
        <div class="fund-row"><strong>3. Kebijakan Bank Sentral & Suku Bunga Riil</strong><p>${f.centralBankPolicy}</p></div>
        <div class="fund-row"><strong>4. Rezim Makroekonomi & Korelasi Lintas Aset</strong><p>${f.macroRegime}</p></div>
        <div class="fund-row"><strong>5. Valuasi Intrinsik & Metrik Spesifik Aset</strong><p>${f.valuationMetrics}</p></div>
        <div class="fund-row"><strong>6. Arus Dana Institusi (Institutional Orderflow & ETF/Foreign Flow)</strong><p>${f.institutionalFlow}</p></div>
        <div class="fund-row"><strong>7. Penggerak Utama Harga (Primary Macro Drivers)</strong><p>${f.keyDrivers}</p></div>
        <div class="fund-row"><strong>8. Katalis & Kalender Ekonomi Terdekat</strong><p>${f.eventCatalysts}</p></div>
      `;
    }
    const bt = a.backtest || {};
    const btGrid = el('backtestMetricsGrid');
    const btBadge = el('lblBacktestSampleBadge');
    if (btBadge) {
      btBadge.textContent = bt.verificationBadge || `✅ TERVERIFIKASI REAL WALK-FORWARD (${bt.totalTrades} SAMPEL)`;
      btBadge.className = 'sample-badge ok';
    }
    if (btGrid) {
      btGrid.innerHTML = `
        <div class="bt-box"><span>Total Sampel Transaksi</span><strong>${bt.totalTrades} Trades</strong></div>
        <div class="bt-box"><span>Historical Win Rate</span><strong class="emerald">${bt.winRate}%</strong></div>
        <div class="bt-box"><span>Profit Factor</span><strong class="cyan">${bt.profitFactor}</strong></div>
        <div class="bt-box"><span>Expectancy per Trade</span><strong class="emerald">+${bt.expectancyR}R</strong></div>
        <div class="bt-box"><span>Max Drawdown</span><strong class="rose">-${bt.maxDrawdownPct}%</strong></div>
        <div class="bt-box"><span>Sharpe Ratio</span><strong class="gold">${bt.sharpeRatio}</strong></div>
      `;
    }
  }
  function updatePositionSizing() {
    const a = STATE.lastAnalysis;
    if (!a || !a.traderPlan) return;
    const cap = parseFloat(el('inpAccountBalance')?.value || '1000');
    const riskPct = parseFloat(el('inpRiskPercent')?.value || '1');
    const riskUsd = cap * (riskPct / 100);
    const stopDist = Math.abs(a.traderPlan.entryPrice - a.traderPlan.stopLoss) || (a.lastPrice * 0.005);
    const units = riskUsd / stopDist;
    if (el('outRiskUsd')) el('outRiskUsd').textContent = `$${riskUsd.toFixed(2)}`;
    if (el('outPositionUnits')) el('outPositionUnits').textContent = `${units.toFixed(a.assetClass === 'CRYPTO' ? 4 : 2)} Unit`;
  }
  async function loadTopOpportunityRadar(horizon = 'INTRADAY') {
    const grid = el('topRadarGrid');
    if (!grid) return;
    try {
      const res = await fetch(`/api/market/top-signals?horizon=${horizon}&mode=${STATE.mode}`);
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.signals)) return;
      grid.innerHTML = data.signals.map(s => {
        if (STATE.mode === 'SPOT_INVESTOR') {
          return `
            <div class="radar-card" data-sym="${s.symbol}" data-tf="D1">
              <div class="radar-card-top">
                <span class="radar-sym">${s.symbol}</span>
                <span class="radar-dir long">💎 ACCUMULATE SPOT (${s.confidence}%)</span>
              </div>
              <div class="radar-meta">
                <span>Beli DCA 1: <strong>${s.entryPrice}</strong></span>
                <span>Fair Value: <strong style="color:#38bdf8">${s.fairValue}</strong></span>
                <span>Target +28%: <strong style="color:#10b981">${s.tp2}</strong></span>
              </div>
            </div>
          `;
        }
        const isLong = s.direction.includes('LONG');
        return `
          <div class="radar-card" data-sym="${s.symbol}" data-tf="${s.timeframe}">
            <div class="radar-card-top">
              <span class="radar-sym">${s.symbol} <small style="color:#94a3b8">(${s.timeframe})</small></span>
              <span class="radar-dir ${isLong ? 'long' : 'short'}">${s.direction} • ${s.confidence}%</span>
            </div>
            <div class="radar-meta">
              <span>Entry: <strong>${s.entryPrice}</strong></span>
              <span>TP2: <strong style="color:#10b981">${s.tp2}</strong></span>
              <span>WinRate: <strong>${s.winRate}%</strong></span>
            </div>
          </div>
        `;
      }).join('');
      grid.querySelectorAll('.radar-card').forEach(card => {
        card.addEventListener('click', () => {
          STATE.symbol = card.dataset.sym;
          STATE.timeframe = card.dataset.tf;
          localStorage.setItem('xstarzg_last_symbol', STATE.symbol);
          localStorage.setItem('xstarzg_last_tf', STATE.timeframe);
          populateInstrumentSelect();
          renderTimeframeBar();
          loadMarketAndAnalyze();
        });
      });
    } catch {}
  }
  async function initAuthAndVip() {
    const savedJwt = localStorage.getItem('xstarzg_jwt');
    const savedUser = localStorage.getItem('xstarzg_user_profile');
    if (savedUser) { try { STATE.user = JSON.parse(savedUser); } catch {} }
    updateUserTopbarUI();
    try {
      const cfgRes = await fetch('/api/auth/config');
      const cfg = await cfgRes.json();
      if (cfg.googleClientId) {
        STATE.googleClientId = cfg.googleClientId;
        const waitGoogle = setInterval(() => {
          if (window.google?.accounts?.id) {
            clearInterval(waitGoogle);
            window.google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: handleGoogleCredential });
            const gateBtn = el('googleSignInGateBtn');
            if (gateBtn) window.google.accounts.id.renderButton(gateBtn, { theme: 'filled_blue', size: 'large', width: 280 });
          }
        }, 300);
      }
    } catch {}
    if (savedJwt) {
      try {
        const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${savedJwt}` } });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.ok && meData.user) {
            STATE.user = meData.user;
            localStorage.setItem('xstarzg_user_profile', JSON.stringify(meData.user));
            localStorage.setItem('xstarzg_session_active', '1');
            updateUserTopbarUI();
          }
        }
      } catch {}
    }
    el('btnOpenVipModal')?.addEventListener('click', () => { if (el('vipModal')) el('vipModal').style.display = 'flex'; });
    el('btnCloseVipModal')?.addEventListener('click', () => { if (el('vipModal')) el('vipModal').style.display = 'none'; });
    el('btnCopyVipWallet')?.addEventListener('click', () => {
      const addr = el('vipWalletAddress')?.textContent?.trim();
      if (addr && navigator.clipboard) {
        navigator.clipboard.writeText(addr);
        const btn = el('btnCopyVipWallet');
        btn.textContent = '✅ Tersalin!';
        setTimeout(() => { btn.textContent = '📋 Salin Alamat'; }, 2000);
      }
    });
    el('btnVerifyTxHash')?.addEventListener('click', verifyBscPayment);
  }
  async function handleGoogleCredential(response) {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (data.ok && data.token) {
        localStorage.setItem('xstarzg_jwt', data.token);
        localStorage.setItem('xstarzg_user_profile', JSON.stringify(data.user));
        localStorage.setItem('xstarzg_session_active', '1');
        STATE.user = data.user;
        updateUserTopbarUI();
        showScreen('APP');
      }
    } catch {}
  }
  async function verifyBscPayment() {
    const txHash = el('inpBscTxHash')?.value?.trim();
    const msg = el('vipVerifyStatusMsg');
    if (!txHash || !txHash.startsWith('0x')) {
      msg.textContent = '⚠️ Masukkan TxHash BSC (0x...) yang valid.';
      msg.style.color = '#f43f5e';
      return;
    }
    msg.textContent = '⏳ Memverifikasi transaksi $29.00 USDT di Blockchain BSC...';
    msg.style.color = '#38bdf8';
    try {
      const token = localStorage.getItem('xstarzg_jwt') || '';
      const res = await fetch('/api/billing/verify-bsc', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ txHash })
      });
      const data = await res.json();
      if (data.ok) {
        msg.textContent = '✅ Pembayaran $29 USDT Terverifikasi! Status VIP 30 Hari Aktif.';
        msg.style.color = '#10b981';
        if (STATE.user) {
          STATE.user.tier = 'VIP';
          localStorage.setItem('xstarzg_user_profile', JSON.stringify(STATE.user));
          updateUserTopbarUI();
        }
      } else {
        msg.textContent = `❌ Verifikasi Gagal: ${data.error || 'TxHash tidak ditemukan.'}`;
        msg.style.color = '#f43f5e';
      }
    } catch {
      msg.textContent = '❌ Gagal menghubungi server verifikasi.';
      msg.style.color = '#f43f5e';
    }
  }
  function bindEvents() {
    document.querySelectorAll('#assetClassTabs .asset-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#assetClassTabs .asset-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        STATE.assetClass = btn.dataset.asset;
        populateInstrumentSelect(el('customTickerSearch')?.value || '');
        const sel = el('instrumentSelect');
        if (sel && sel.value) {
          STATE.symbol = sel.value;
          localStorage.setItem('xstarzg_last_symbol', STATE.symbol);
          loadMarketAndAnalyze();
        }
      });
    });
    el('instrumentSelect')?.addEventListener('change', e => {
      STATE.symbol = e.target.value;
      localStorage.setItem('xstarzg_last_symbol', STATE.symbol);
      loadMarketAndAnalyze();
    });
    const searchInp = el('customTickerSearch');
    searchInp?.addEventListener('input', e => populateInstrumentSelect(e.target.value));
    el('btnLoadCustomTicker')?.addEventListener('click', () => {
      const raw = (searchInp?.value || '').trim().toUpperCase();
      if (!raw) return;
      const sel = el('instrumentSelect');
      STATE.symbol = (sel && sel.options.length > 0) ? sel.options[0].value : (raw.includes('/') ? raw : `${raw}/USDT`);
      localStorage.setItem('xstarzg_last_symbol', STATE.symbol);
      loadMarketAndAnalyze();
    });
    document.querySelectorAll('#horizonButtonGroup .horizon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#horizonButtonGroup .horizon-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        STATE.horizon = btn.dataset.horizon;
        const cfg = HORIZON_CONFIG[STATE.horizon] || HORIZON_CONFIG.ALL;
        if (!cfg.tfs.includes(STATE.timeframe)) {
          STATE.timeframe = cfg.def;
          localStorage.setItem('xstarzg_last_tf', STATE.timeframe);
        }
        renderTimeframeBar();
        loadMarketAndAnalyze();
      });
    });
    el('btnModeTrader')?.addEventListener('click', () => {
      STATE.mode = 'TRADER';
      localStorage.setItem('xstarzg_last_mode', 'TRADER');
      el('btnModeTrader').classList.add('active');
      el('btnModeSpot').classList.remove('active');
      populateInstrumentSelect();
      updateRadarTabsForMode();
      loadTopOpportunityRadar(STATE.radarHorizon);
      loadMarketAndAnalyze();
    });
    el('btnModeSpot')?.addEventListener('click', () => {
      STATE.mode = 'SPOT_INVESTOR';
      localStorage.setItem('xstarzg_last_mode', 'SPOT_INVESTOR');
      el('btnModeSpot').classList.add('active');
      el('btnModeTrader').classList.remove('active');
      if (['M1', 'M5', 'M15', 'M30'].includes(STATE.timeframe)) {
        STATE.timeframe = 'D1';
        localStorage.setItem('xstarzg_last_tf', 'D1');
      }
      populateInstrumentSelect();
      renderTimeframeBar();
      updateRadarTabsForMode();
      loadTopOpportunityRadar(STATE.radarHorizon);
      loadMarketAndAnalyze();
    });
    document.querySelectorAll('.ov-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.ov;
        STATE.overlays[key] = !STATE.overlays[key];
        btn.classList.toggle('active', STATE.overlays[key]);
        if (STATE.lastAnalysis) renderChartOverlays(STATE.lastAnalysis);
      });
    });
    el('inpAccountBalance')?.addEventListener('input', updatePositionSizing);
    el('inpRiskPercent')?.addEventListener('input', updatePositionSizing);
  }
  async function initApp() {
    setupNavigationAndProfileMenu();
    initChart();
    bindEvents();
    if (STATE.mode === 'SPOT_INVESTOR') {
      el('btnModeSpot')?.classList.add('active');
      el('btnModeTrader')?.classList.remove('active');
    } else {
      el('btnModeTrader')?.classList.add('active');
      el('btnModeSpot')?.classList.remove('active');
    }
    renderTimeframeBar();
    updateRadarTabsForMode();
    const hasActiveSession = localStorage.getItem('xstarzg_session_active') === '1' || !!localStorage.getItem('xstarzg_jwt');
    if (hasActiveSession) {
      showScreen('APP');
    } else {
      showScreen('FRONT');
    }
    await initAuthAndVip();
    await loadInstrumentCatalog();
    await loadMarketAndAnalyze();
    loadTopOpportunityRadar(STATE.radarHorizon);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
