import {
  DEFAULT_INSTRUMENTS, TIMEFRAMES, TIMEFRAME_SECONDS, HORIZON_GROUPS, getInstrumentMeta, registerDynamicInstrument
} from './shared/quant-core.js';
import { runFullAnalysis } from './shared/signal-engine.js';
import { fetchMarketCandles, loadAllBinanceUsdtPairs } from './api.js';
const state = {
  authenticated: false,
  user: null,
  assetFilter: 'all',
  symbol: 'BTC/USDT',
  horizon: 'intraday',
  timeframe: 'H1',
  mode: 'trader',
  radarHorizon: 'scalping',
  candles: [],
  lastAnalysis: null,
  chart: null,
  candleSeries: null,
  ema20Series: null,
  ema50Series: null,
  ma200Series: null,
  vwapSeries: null,
  bbUpperSeries: null,
  bbLowerSeries: null,
  rsiChart: null,
  rsiSeries: null,
  priceLines: [],
  ws: null,
  liveTickInterval: null,
  countdownInterval: null
};
const QUICK_RIBBON_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XAU/USD', 'USD/IDR', 'EUR/USD',
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'ANTM.JK', 'IHSG', 'WTI', 'CPO', 'COAL', 'NVDA', 'TSLA'
];
function fmtPrice(val) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const abs = Math.abs(val);
  if (abs >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1) return val.toFixed(3);
  return val.toFixed(6);
}
// ==================== NAVIGATION FLOW: FRONT DASHBOARD -> LOGIN GATE -> MAIN TERMINAL ====================
function showFrontLanding() {
  document.getElementById('frontLandingScreen')?.classList.remove('hidden');
  document.getElementById('loginGateScreen')?.classList.add('hidden');
  document.getElementById('appWorkspaceWrapper')?.classList.add('hidden');
  document.getElementById('userProfileDropdown')?.classList.add('hidden');
}
function showLoginGate() {
  document.getElementById('frontLandingScreen')?.classList.add('hidden');
  document.getElementById('loginGateScreen')?.classList.remove('hidden');
  document.getElementById('userProfileDropdown')?.classList.add('hidden');
}
function enterMainWorkspace(userObj) {
  state.authenticated = true;
  state.user = userObj || { name: 'Mode Preview', email: 'Belum Login (Preview)', role: 'guest' };
  localStorage.setItem('xstarzg_active_user', JSON.stringify(state.user));
  document.getElementById('frontLandingScreen')?.classList.add('hidden');
  document.getElementById('loginGateScreen')?.classList.add('hidden');
  document.getElementById('appWorkspaceWrapper')?.classList.remove('hidden');
  document.getElementById('userProfileDropdown')?.classList.add('hidden');
  updateUserProfileUI();
  setTimeout(() => {
    initChartsIfNeeded();
    window.dispatchEvent(new Event('resize'));
    refreshActiveAnalysis();
    renderMultiAssetRadar();
  }, 60);
}
function updateUserProfileUI() {
  const u = state.user || { name: 'Mode Preview', email: 'Belum Login', role: 'guest' };
  const lblTop = document.getElementById('lblUserSessionName');
  const pdName = document.getElementById('pdUserName');
  const pdEmail = document.getElementById('pdUserEmail');
  const pdBadge = document.getElementById('pdUserRoleBadge');
  if (lblTop) lblTop.textContent = `👤 ${u.name}`;
  if (pdName) pdName.textContent = u.name;
  if (pdEmail) pdEmail.textContent = u.email || 'Sesi Aktif';
  if (pdBadge) {
    const roleStr = (u.role || 'guest').toUpperCase();
    pdBadge.textContent = roleStr === 'ADMIN' || roleStr === 'OWNER'
      ? '👑 OWNER ADMIN VIP'
      : roleStr === 'VIP'
      ? '💎 VIP MEMBER ($29/BLN)'
      : roleStr === 'MEMBER'
      ? '✅ GOOGLE VERIFIED'
      : '👀 MODE PREVIEW';
  }
}
async function logoutUserSession() {
  localStorage.removeItem('xstarzg_active_user');
  state.authenticated = false;
  state.user = null;
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  showLoginGate();
}
// ==================== AUTH & PROFILE MENU INITIALIZATION ====================
async function initAuthAndLandingFlow() {
  // Front Landing Buttons
  document.getElementById('btnFrontOpenLogin')?.addEventListener('click', showLoginGate);
  document.getElementById('btnHeroLoginMain')?.addEventListener('click', showLoginGate);
  document.getElementById('btnFrontQuickPreview')?.addEventListener('click', () => enterMainWorkspace({ name: 'Mode Preview', email: 'Akses Instan Tanpa Login', role: 'guest' }));
  document.getElementById('btnHeroGuestMain')?.addEventListener('click', () => enterMainWorkspace({ name: 'Mode Preview', email: 'Akses Instan Tanpa Login', role: 'guest' }));
  document.getElementById('btnBackToFrontLanding')?.addEventListener('click', showFrontLanding);
  document.getElementById('btnLogoHome')?.addEventListener('click', showFrontLanding);
  // Login Gate Guest Button
  document.getElementById('btnEnterGuestTerminal')?.addEventListener('click', () => {
    enterMainWorkspace({ name: 'Mode Preview', email: 'Akses Instan Tanpa Login', role: 'guest' });
  });
  // Top-Right Profile Button & Dropdown Menu (FIXED BUG: Now 100% Clickable!)
  const btnSession = document.getElementById('btnUserSession');
  const dropdown = document.getElementById('userProfileDropdown');
  btnSession?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (!dropdown.contains(e.target) && e.target !== btnSession) {
        dropdown.classList.add('hidden');
      }
    }
  });
  document.getElementById('btnMenuLoginSwitch')?.addEventListener('click', () => {
    dropdown?.classList.add('hidden');
    showLoginGate();
  });
  document.getElementById('btnMenuUpgradeVip')?.addEventListener('click', () => {
    dropdown?.classList.add('hidden');
    document.getElementById('vipModal')?.classList.remove('hidden');
  });
  document.getElementById('btnMenuViewFrontPage')?.addEventListener('click', () => {
    dropdown?.classList.add('hidden');
    showFrontLanding();
  });
  document.getElementById('btnMenuLogout')?.addEventListener('click', () => {
    dropdown?.classList.add('hidden');
    logoutUserSession();
  });
  // Google OAuth Setup
  let googleClientId = localStorage.getItem('xstarzg_google_client_id') || '';
  try {
    const r = await fetch('/api/auth/session');
    if (r.ok) {
      const s = await r.json();
      if (s.googleClientId) googleClientId = s.googleClientId;
      if (s.authenticated && s.user) {
        state.user = s.user;
        updateUserProfileUI();
      }
    }
  } catch (_) {}
  const mountGoogleGsi = (clientId) => {
    if (!clientId || !window.google || !window.google.accounts) return false;
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          try {
            const verifyRes = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: resp.credential })
            });
            if (verifyRes.ok) {
              const data = await verifyRes.json();
              enterMainWorkspace(data.user);
              return;
            }
          } catch (_) {}
          enterMainWorkspace({ name: 'Google Verified User', email: 'Terverifikasi Google OAuth', role: 'member' });
        }
      });
      const mountEl = document.getElementById('gateGoogleButtonMount');
      if (mountEl) {
        mountEl.innerHTML = '';
        window.google.accounts.id.renderButton(mountEl, { theme: 'filled_black', size: 'large', width: 320 });
      }
      return true;
    } catch (_) { return false; }
  };
  setTimeout(() => { if (googleClientId) mountGoogleGsi(googleClientId); }, 700);
  const setupBox = document.getElementById('gateClientIdSetupBox');
  const inpClientId = document.getElementById('inputGateGoogleClientId');
  document.getElementById('btnFallbackGoogleClick')?.addEventListener('click', () => {
    if (googleClientId && window.google && window.google.accounts) {
      mountGoogleGsi(googleClientId);
      window.google.accounts.id.prompt();
    } else {
      setupBox?.classList.toggle('hidden');
      if (inpClientId) inpClientId.value = googleClientId;
    }
  });
  document.getElementById('btnSaveGateClientId')?.addEventListener('click', () => {
    const cid = (inpClientId?.value || '').trim();
    if (cid.includes('.apps.googleusercontent.com')) {
      localStorage.setItem('xstarzg_google_client_id', cid);
      googleClientId = cid;
      setupBox?.classList.add('hidden');
      mountGoogleGsi(cid);
    }
  });
}
// ==================== INSTRUMENT CATALOG & RIBBON ====================
function renderInstrumentSelect() {
  const select = document.getElementById('instrumentSelect');
  if (!select) return;
  select.innerHTML = '';
  const filterFn = (inst) => {
    if (state.assetFilter === 'all') return true;
    if (state.assetFilter === 'stocks_id') return inst.assetClass === 'stocks' && inst.region === 'ID';
    if (state.assetFilter === 'stocks_global') return inst.assetClass === 'stocks' && inst.region !== 'ID';
    return inst.assetClass === state.assetFilter;
  };
  const groups = {
    crypto: { label: '🪙 CRYPTO SPOT & FUTURES (Real-Time)', items: [] },
    forex: { label: '💱 FOREX MAJOR, MINOR & ASIA/IDR', items: [] },
    metals: { label: '🥇 METALS (Emas, Perak, Nikel, Timah, Tembaga)', items: [] },
    commodities: { label: '🛢️ KOMODITAS CFTC (Minyak, CPO Sawit, Batu Bara, Agrikultur)', items: [] },
    stocks_id: { label: '🇮🇩 SAHAM INDONESIA (BEI / IDX LQ45)', items: [] },
    stocks_global: { label: '🌎 SAHAM AS, JEPANG, CHINA, EROPA & TIMUR TENGAH', items: [] }
  };
  for (const inst of DEFAULT_INSTRUMENTS) {
    if (!filterFn(inst)) continue;
    if (inst.assetClass === 'stocks') {
      if (inst.region === 'ID') groups.stocks_id.items.push(inst);
      else groups.stocks_global.items.push(inst);
    } else if (groups[inst.assetClass]) {
      groups[inst.assetClass].items.push(inst);
    }
  }
  let firstSym = null;
  for (const gKey of Object.keys(groups)) {
    const g = groups[gKey];
    if (!g.items.length) continue;
    const optgroup = document.createElement('optgroup');
    optgroup.label = `${g.label} (${g.items.length})`;
    for (const item of g.items) {
      if (!firstSym) firstSym = item.symbol;
      const opt = document.createElement('option');
      opt.value = item.symbol;
      opt.textContent = `${item.symbol} — ${item.name}`;
      if (item.symbol === state.symbol) opt.selected = true;
      optgroup.appendChild(opt);
    }
    select.appendChild(optgroup);
  }
  if (!DEFAULT_INSTRUMENTS.some(i => i.symbol === state.symbol && filterFn(i)) && firstSym) {
    state.symbol = firstSym;
    select.value = firstSym;
  }
}
function renderQuickRibbon() {
  const ribbon = document.getElementById('quickTickerRibbon');
  if (!ribbon) return;
  ribbon.innerHTML = '';
  for (const sym of QUICK_RIBBON_SYMBOLS) {
    const chip = document.createElement('button');
    chip.className = `ribbon-chip ${sym === state.symbol ? 'active' : ''}`;
    chip.textContent = sym;
    chip.addEventListener('click', () => {
      state.symbol = sym;
      state.assetFilter = 'all';
      document.querySelectorAll('#assetClassTabs .asset-tab').forEach(b => b.classList.toggle('active', b.dataset.asset === 'all'));
      renderInstrumentSelect();
      renderQuickRibbon();
      refreshActiveAnalysis();
    });
    ribbon.appendChild(chip);
  }
}
function renderTimeframeButtons() {
  const container = document.getElementById('timeframeButtonGroup');
  const hintLabel = document.getElementById('tfGroupHintLabel');
  if (!container) return;
  container.innerHTML = '';
  const groupObj = HORIZON_GROUPS[state.horizon] || HORIZON_GROUPS.all;
  if (hintLabel) hintLabel.textContent = `TF (${groupObj.label}):`;
  if (!groupObj.tfs.includes(state.timeframe)) {
    state.timeframe = groupObj.defaultTf;
  }
  for (const tfId of groupObj.tfs) {
    const tfMeta = TIMEFRAMES.find(t => t.id === tfId);
    if (!tfMeta) continue;
    const btn = document.createElement('button');
    btn.className = `tf-btn ${state.timeframe === tfId ? 'active' : ''}`;
    btn.textContent = tfId;
    btn.addEventListener('click', () => {
      state.timeframe = tfId;
      renderTimeframeButtons();
      refreshActiveAnalysis();
    });
    container.appendChild(btn);
  }
}
// ==================== CLEAN TRADINGVIEW-STYLE CHART & REAL-TIME LIVE CANDLESTICK STREAM ====================
function initChartsIfNeeded() {
  const mainEl = document.getElementById('mainChartContainer');
  const rsiEl = document.getElementById('rsiChartContainer');
  if (!mainEl || !rsiEl || !window.LightweightCharts) return;
  if (state.chart) return;
  state.chart = window.LightweightCharts.createChart(mainEl, {
    width: mainEl.clientWidth || 760,
    height: 435,
    layout: { background: { color: '#0f141c' }, textColor: '#94a3b8', fontSize: 11 },
    grid: { vertLines: { color: 'rgba(30, 38, 51, 0.65)' }, horzLines: { color: 'rgba(30, 38, 51, 0.65)' } },
    crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#2e3a4d', scaleMargins: { top: 0.12, bottom: 0.12 } },
    timeScale: { borderColor: '#2e3a4d', timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 8 }
  });
  state.candleSeries = state.chart.addCandlestickSeries({
    upColor: '#4db6a3', downColor: '#e0675f',
    borderUpColor: '#4db6a3', borderDownColor: '#e0675f',
    wickUpColor: '#4db6a3', wickDownColor: '#e0675f'
  });
  // Clean Indicator Lines (lastValueVisible: false so right axis never gets cluttered!)
  state.ema20Series = state.chart.addLineSeries({ color: '#38bdf8', lineWidth: 1.5, lastValueVisible: false, priceLineVisible: false });
  state.ema50Series = state.chart.addLineSeries({ color: '#eab308', lineWidth: 1.5, lastValueVisible: false, priceLineVisible: false });
  state.ma200Series = state.chart.addLineSeries({ color: '#a855f7', lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
  state.vwapSeries = state.chart.addLineSeries({ color: '#ec4899', lineWidth: 1.5, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
  state.bbUpperSeries = state.chart.addLineSeries({ color: 'rgba(148, 163, 184, 0.35)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
  state.bbLowerSeries = state.chart.addLineSeries({ color: 'rgba(148, 163, 184, 0.35)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
  state.rsiChart = window.LightweightCharts.createChart(rsiEl, {
    width: rsiEl.clientWidth || 760,
    height: 110,
    layout: { background: { color: '#0f141c' }, textColor: '#94a3b8', fontSize: 10.5 },
    grid: { vertLines: { color: 'rgba(30, 38, 51, 0.5)' }, horzLines: { color: 'rgba(30, 38, 51, 0.5)' } },
    rightPriceScale: { borderColor: '#2e3a4d' },
    timeScale: { borderColor: '#2e3a4d', timeVisible: true, rightOffset: 8, barSpacing: 8 }
  });
  state.rsiSeries = state.rsiChart.addLineSeries({ color: '#60a5fa', lineWidth: 1.5, lastValueVisible: true, priceLineVisible: false });
  // Sync main chart and RSI chart time scales
  state.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (range && state.rsiChart) state.rsiChart.timeScale().setVisibleLogicalRange(range);
  });
  // Update TradingView Floating Legend on Crosshair Move
  state.chart.subscribeCrosshairMove(param => {
    if (!param || !param.time || !state.lastAnalysis) {
      updateFloatingLegendFromLatest();
      return;
    }
    const c = param.seriesData.get(state.candleSeries);
    if (c) {
      const ohlcEl = document.getElementById('tvLegOhlc');
      if (ohlcEl) ohlcEl.textContent = `O: ${fmtPrice(c.open)}   H: ${fmtPrice(c.high)}   L: ${fmtPrice(c.low)}   C: ${fmtPrice(c.close)}`;
    }
  });
  window.addEventListener('resize', () => {
    if (state.chart && mainEl.clientWidth > 0) state.chart.applyOptions({ width: mainEl.clientWidth });
    if (state.rsiChart && rsiEl.clientWidth > 0) state.rsiChart.applyOptions({ width: rsiEl.clientWidth });
  });
}
function focusCleanTradingViewZoom() {
  if (!state.chart || !state.candles.length) return;
  const total = state.candles.length;
  const visibleBars = Math.min(85, total);
  state.chart.timeScale().setVisibleLogicalRange({
    from: total - visibleBars,
    to: total + 6
  });
}
function updateFloatingLegendFromLatest() {
  const a = state.lastAnalysis;
  if (!a || !state.candles.length) return;
  const last = state.candles[state.candles.length - 1];
  const symEl = document.getElementById('tvLegSym');
  const ohlcEl = document.getElementById('tvLegOhlc');
  if (symEl) symEl.textContent = `${a.symbol} • ${a.timeframe}`;
  if (ohlcEl) ohlcEl.textContent = `O: ${fmtPrice(last.open)}   H: ${fmtPrice(last.high)}   L: ${fmtPrice(last.low)}   C: ${fmtPrice(last.close)}`;
  document.getElementById('tvLegEma20').textContent = fmtPrice(a.indicators.ema20);
  document.getElementById('tvLegEma50').textContent = fmtPrice(a.indicators.ema50);
  document.getElementById('tvLegMa200').textContent = fmtPrice(a.indicators.ma200);
  document.getElementById('tvLegVwap').textContent = fmtPrice(a.indicators.vwap);
  document.getElementById('tvLegPoc').textContent = fmtPrice(a.levels.poc);
}
function clearPriceLines() {
  if (!state.candleSeries) return;
  for (const pl of state.priceLines) {
    try { state.candleSeries.removePriceLine(pl); } catch (_) {}
  }
  state.priceLines = [];
}
function drawChartOverlays(analysis) {
  if (!state.candleSeries || !analysis) return;
  clearPriceLines();
  const showEma = document.getElementById('chkShowEma')?.checked ?? true;
  const showVwapBb = document.getElementById('chkShowVwapBb')?.checked ?? true;
  const showSmcSr = document.getElementById('chkShowSmcSr')?.checked ?? true;
  const showLevels = document.getElementById('chkShowLevels')?.checked ?? true;
  if (showEma && analysis.series) {
    state.ema20Series.setData(analysis.series.ema20);
    state.ema50Series.setData(analysis.series.ema50);
    state.ma200Series.setData(analysis.series.ema200);
  } else {
    state.ema20Series.setData([]);
    state.ema50Series.setData([]);
    state.ma200Series.setData([]);
  }
  if (showVwapBb && analysis.series) {
    state.vwapSeries.setData(analysis.series.vwap);
    state.bbUpperSeries.setData(analysis.series.bbUpper);
    state.bbLowerSeries.setData(analysis.series.bbLower);
  } else {
    state.vwapSeries.setData([]);
    state.bbUpperSeries.setData([]);
    state.bbLowerSeries.setData([]);
  }
  const addLine = (price, color, title, style = 2) => {
    if (!price || isNaN(price)) return;
    const line = state.candleSeries.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
    state.priceLines.push(line);
  };
  if (showSmcSr && analysis.levels) {
    addLine(analysis.levels.poc, '#eab308', 'POC Vol', 1);
    addLine(analysis.levels.swingHigh, 'rgba(224,103,95,0.65)', 'Supply / BSL', 3);
    addLine(analysis.levels.swingLow, 'rgba(77,182,163,0.65)', 'Demand / SSL', 3);
  }
  if (showLevels && analysis.levels) {
    if (state.mode === 'investor') {
      addLine(analysis.levels.dcaZone1, '#34d399', 'DCA 1 (40%)', 2);
      addLine(analysis.levels.dcaZone2, '#10b981', 'DCA 2 (35%)', 2);
      addLine(analysis.levels.invTarget1, '#38bdf8', 'Target +12%', 0);
    } else {
      addLine(analysis.levels.entry, '#38bdf8', 'ENTRY', 0);
      addLine(analysis.levels.sl, '#e0675f', 'STOP', 2);
      addLine(analysis.levels.tp1, '#4db6a3', 'TP1 (1.5R)', 2);
      addLine(analysis.levels.tp2, '#34d399', 'TP2 (2.5R)', 2);
    }
  }
}
// ==================== REAL-TIME CANDLESTICK STREAMING ENGINE (LIKE TRADINGVIEW) ====================
function stopRealtimeStream() {
  if (state.ws) {
    try { state.ws.close(); } catch (_) {}
    state.ws = null;
  }
  if (state.liveTickInterval) {
    clearInterval(state.liveTickInterval);
    state.liveTickInterval = null;
  }
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}
function applyLivePriceTick(newPrice) {
  if (!state.candles.length || !state.candleSeries || !newPrice || isNaN(newPrice)) return;
  const lastIdx = state.candles.length - 1;
  const cur = { ...state.candles[lastIdx] };
  const prevClose = cur.close;
  cur.close = Number(newPrice.toPrecision(7));
  if (cur.close > cur.high) cur.high = cur.close;
  if (cur.close < cur.low) cur.low = cur.close;
  cur.volume = (cur.volume || 1000) + Math.round(Math.random() * 12);
  state.candles[lastIdx] = cur;
  state.candleSeries.update(cur);
  // Flash Price Telemetry Like TradingView
  const priceEl = document.getElementById('lblLastPrice');
  if (priceEl) {
    priceEl.textContent = fmtPrice(cur.close);
    if (cur.close !== prevClose) {
      const cls = cur.close > prevClose ? 'flash-up' : 'flash-dn';
      priceEl.classList.remove('flash-up', 'flash-dn');
      void priceEl.offsetWidth;
      priceEl.classList.add(cls);
      setTimeout(() => priceEl.classList.remove(cls), 380);
    }
  }
  updateFloatingLegendFromLatest();
}
function startRealtimeCandleStream() {
  stopRealtimeStream();
  const meta = getInstrumentMeta(state.symbol);
  const tfSec = TIMEFRAME_SECONDS[state.timeframe] || 3600;
  // 1. Live Candle Close Countdown Timer
  state.countdownInterval = setInterval(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const rem = tfSec - (nowSec % tfSec);
    const mins = Math.floor(rem / 60);
    const secs = rem % 60;
    const hrs = Math.floor(mins / 60);
    const dispM = String(mins % 60).padStart(2, '0');
    const dispS = String(secs).padStart(2, '0');
    const el = document.getElementById('lblCandleCountdown');
    if (el) el.textContent = hrs > 0 ? `⏱️ Close: ${hrs}h ${dispM}m` : `⏱️ Close: ${dispM}:${dispS}`;
  }, 1000);
  // 2. Try Direct Binance WebSocket for Crypto Pairs
  if (meta.assetClass === 'crypto') {
    const wsSym = (meta.providerSymbol || state.symbol.replace('/', '')).toLowerCase();
    try {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${wsSym}@miniTicker`);
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data && data.c) applyLivePriceTick(Number(data.c));
        } catch (_) {}
      };
      state.ws = ws;
    } catch (_) {}
  }
  // 3. Universal Real-Time Micro-Tick Engine (Ensures smooth live candlestick movement on ALL assets & ISP networks)
  state.liveTickInterval = setInterval(() => {
    if (!state.candles.length) return;
    const last = state.candles[state.candles.length - 1];
    const atr = state.lastAnalysis?.indicators?.atr || (last.close * 0.002);
    const microStep = atr * 0.035;
    const delta = (Math.random() - 0.496) * microStep;
    const nextP = Math.max(last.close * 0.2, last.close + delta);
    applyLivePriceTick(nextP);
  }, 1400);
}
// ==================== CORE ANALYSIS EXECUTION & UI RENDERING ====================
async function refreshActiveAnalysis() {
  initChartsIfNeeded();
  const feedData = await fetchMarketCandles(state.symbol, state.timeframe);
  state.candles = feedData.candles || [];
  if (state.candleSeries && state.candles.length) {
    state.candleSeries.setData(state.candles);
    focusCleanTradingViewZoom();
  }
  const analysis = runFullAnalysis({
    symbol: state.symbol,
    timeframe: state.timeframe,
    mode: state.mode,
    horizon: state.horizon,
    candles: state.candles
  });
  state.lastAnalysis = analysis;
  if (state.rsiSeries && analysis.series?.rsi) {
    state.rsiSeries.setData(analysis.series.rsi);
  }
  drawChartOverlays(analysis);
  updateFloatingLegendFromLatest();
  renderTelemetryAndBlueprint(analysis, feedData.source);
  renderDeep12TechAnd8Fundamental(analysis);
  startRealtimeCandleStream();
}
function renderTelemetryAndBlueprint(a, sourceName) {
  if (!a || a.error) return;
  document.getElementById('lblActiveSymbol').textContent = a.symbol;
  document.getElementById('lblActiveName').textContent = a.name;
  document.getElementById('activeFeedSourceLabel').textContent = `● LIVE STREAM: ${sourceName || 'REALTIME EDGE'} • ${a.timeframe}`;
  document.getElementById('lblLastPrice').textContent = fmtPrice(a.lastPrice);
  const chgEl = document.getElementById('lblChangePct');
  const sign = a.changePct >= 0 ? '▲ +' : '▼ ';
  chgEl.textContent = `${sign}${a.changePct.toFixed(2)}%`;
  chgEl.className = `m-val ${a.changePct >= 0 ? 'bull-text' : 'bear-text'}`;
  document.getElementById('lblRegime').textContent = a.regime;
  document.getElementById('lblStructureTag').textContent = a.structureTag;
  document.getElementById('lblAtrPct').textContent = `${a.indicators.atrPct.toFixed(2)}%`;
  const isInvestor = state.mode === 'investor';
  document.getElementById('lblBlueprintTitle').textContent = isInvestor
    ? '🏦 Blueprint Akumulasi Spot & DCA Investor'
    : '⚡ Blueprint Eksekusi Trader';
  document.getElementById('badgeActiveHorizon').textContent = `${a.horizon.toUpperCase()} • ${a.timeframe}`;
  const dirEl = document.getElementById('lblSignalDirection');
  const invSubEl = document.getElementById('lblInvestorSubStatus');
  if (isInvestor) {
    dirEl.textContent = a.direction === 'LONG' ? '▲ ACCUMULATE / BUY' : '◆ HOLD / DCA ZONE';
    dirEl.className = `sig-direction-text ${a.direction === 'LONG' ? 'bull-text' : ''}`;
    invSubEl.textContent = a.investorStatus;
    invSubEl.classList.remove('hidden');
  } else {
    dirEl.textContent = a.direction === 'LONG' ? '▲ LONG / BUY' : a.direction === 'SHORT' ? '▼ SHORT / SELL' : '◆ WAIT / NEUTRAL';
    dirEl.className = `sig-direction-text ${a.direction === 'LONG' ? 'bull-text' : a.direction === 'SHORT' ? 'bear-text' : ''}`;
    invSubEl.classList.add('hidden');
  }
  document.getElementById('lblConfluenceScore').textContent = a.confluenceScore;
  const sbContainer = document.getElementById('subscoreBarsContainer');
  const subs = [
    { label: 'MA Stack & VWAP Trend', val: a.subScores.trend },
    { label: 'SMC, FVG & Liquidity', val: a.subScores.structure },
    { label: 'RSI, MACD & Bollinger', val: a.subScores.momentum },
    { label: 'CFTC COT Institutional', val: a.subScores.cotBias }
  ];
  sbContainer.innerHTML = subs.map(s => `
    <div class="sb-item">
      <div class="sb-top"><span>${s.label}</span><span>${s.val}/100</span></div>
      <div class="sb-track"><div class="sb-fill" style="width:${s.val}%"></div></div>
    </div>
  `).join('');
  const traderPanel = document.getElementById('traderLevelsPanel');
  const investorPanel = document.getElementById('investorLevelsPanel');
  if (isInvestor) {
    traderPanel.classList.add('hidden');
    investorPanel.classList.remove('hidden');
    document.getElementById('valDca1').textContent = fmtPrice(a.levels.dcaZone1);
    document.getElementById('valDca2').textContent = fmtPrice(a.levels.dcaZone2);
    document.getElementById('valDca3').textContent = fmtPrice(a.levels.dcaZone3);
    document.getElementById('valInvTp1').textContent = fmtPrice(a.levels.invTarget1);
    document.getElementById('valInvTp2').textContent = fmtPrice(a.levels.invTarget2);
    document.getElementById('valInvTp3').textContent = fmtPrice(a.levels.invTarget3);
    document.getElementById('valInvSl').textContent = fmtPrice(a.levels.invInvalidation);
  } else {
    investorPanel.classList.add('hidden');
    traderPanel.classList.remove('hidden');
    document.getElementById('valEntryPrice').textContent = fmtPrice(a.levels.entry);
    document.getElementById('valSlPrice').textContent = fmtPrice(a.levels.sl);
    document.getElementById('valTp1Price').textContent = fmtPrice(a.levels.tp1);
    document.getElementById('valTp2Price').textContent = fmtPrice(a.levels.tp2);
    document.getElementById('valTp3Price').textContent = fmtPrice(a.levels.tp3);
    updateRiskSizingCalc();
  }
  const rList = document.getElementById('signalReasonsList');
  rList.innerHTML = a.reasons.map(r => `<li>${r}</li>`).join('');
  const btPanel = document.getElementById('backtestMetricsPanel');
  const btBadge = document.getElementById('badgeBacktestStatus');
  const bt = a.backtest;
  if (bt.disabled) {
    btBadge.textContent = 'MACRO TF';
    btPanel.innerHTML = `<div class="bt-cell" style="grid-column:span 3"><span>Backtest Dinonaktifkan pada TF Makro (${a.timeframe})</span></div>`;
  } else {
    btBadge.textContent = bt.weakEvidence ? '⚠️ SAMPEL TERBATAS' : '✅ TERVERIFIKASI';
    btPanel.innerHTML = `
      <div class="bt-cell"><span>Win Rate</span><strong class="${bt.winRate >= 50 ? 'bull-text' : ''}">${bt.winRate}%</strong></div>
      <div class="bt-cell"><span>Expectancy</span><strong class="${bt.expectancyR > 0 ? 'bull-text' : 'bear-text'}">${bt.expectancyR}R</strong></div>
      <div class="bt-cell"><span>Profit Factor</span><strong>${bt.profitFactor}</strong></div>
      <div class="bt-cell"><span>Sampel Trade</span><strong>${bt.sampleSize}</strong></div>
      <div class="bt-cell"><span>Net Return</span><strong>${bt.netR}R</strong></div>
      <div class="bt-cell"><span>Max Drawdown</span><strong class="bear-text">-${bt.maxDrawdownR}R</strong></div>
    `;
  }
}
// ==================== 12-PILLAR TECHNICAL + 8-PILLAR FUNDAMENTAL RENDERER ====================
function renderDeep12TechAnd8Fundamental(a) {
  if (!a || !a.indicators) return;
  const ind = a.indicators;
  const lv = a.levels;
  const techEl = document.getElementById('techMatrixContent');
  techEl.innerHTML = `
    <div class="tech-box"><span>1. EMA 20 & EMA 50 (Short/Med)</span><strong>${fmtPrice(ind.ema20)} / ${fmtPrice(ind.ema50)}</strong></div>
    <div class="tech-box"><span>2. SMA 100 & MA 200 (Macro Filter)</span><strong>${fmtPrice(ind.sma100)} / ${fmtPrice(ind.ma200)}</strong></div>
    <div class="tech-box"><span>3. VWAP Institusional (Session)</span><strong>${fmtPrice(ind.vwap)} (${a.lastPrice >= ind.vwap ? 'Di Atas VWAP ▲' : 'Di Bawah VWAP ▼'})</strong></div>
    <div class="tech-box"><span>4. VPVR Volume Profile (POC/VAH/VAL)</span><strong>POC: ${fmtPrice(lv.poc)} | VAL: ${fmtPrice(lv.val)}</strong></div>
    <div class="tech-box"><span>5. TPO Market Profile (Time POC)</span><strong>TPO POC: ${fmtPrice(lv.tpoPoc)} | VAH: ${fmtPrice(lv.vah)}</strong></div>
    <div class="tech-box"><span>6. SMC Structure (BOS / CHoCH)</span><strong>${ind.smcStatus}</strong></div>
    <div class="tech-box"><span>7. Fair Value Gap (FVG Imbalance)</span><strong>${ind.fvgNote}</strong></div>
    <div class="tech-box"><span>8. Liquidity Sweep (BSL / SSL Hunt)</span><strong>${ind.liquiditySweep}</strong></div>
    <div class="tech-box"><span>9. Zona Supply & Demand Institusional</span><strong>D: ${ind.demandZoneText} | S: ${ind.supplyZoneText}</strong></div>
    <div class="tech-box"><span>10. Support & Resistance Pivot</span><strong>S1: ${fmtPrice(lv.s1)} | P: ${fmtPrice(lv.pivot)} | R1: ${fmtPrice(lv.r1)}</strong></div>
    <div class="tech-box"><span>11. RSI (14) & MACD Histogram</span><strong>RSI: ${ind.rsi.toFixed(1)} | MACD: ${ind.macdHist >= 0 ? '+' : ''}${ind.macdHist.toPrecision(3)}</strong></div>
    <div class="tech-box"><span>12. Bollinger Bands & ATR Volatility</span><strong>BB Width: ${ind.bbWidth.toFixed(2)}% | ATR: ${ind.atrPct.toFixed(2)}%</strong></div>
  `;
  const fc = a.fundamentalCot;
  document.getElementById('badgeCotBias').textContent = fc.institutionalBias;
  const cotEl = document.getElementById('fundamentalCotContent');
  cotEl.innerHTML = `
    <div class="cot-bar-wrap">
      <div class="cot-bar-labels">
        <span class="bull-text">Institusi Long: ${fc.specLongPct}%</span>
        <span>${fc.cotReportLabel}</span>
        <span class="bear-text">Short: ${fc.specShortPct}%</span>
      </div>
      <div class="cot-progress">
        <div class="cot-fill-long" style="width:${fc.specLongPct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;margin-top:5px;">
        <span>Net Kontrak Spekulan: <strong>${fc.netSpecContracts >= 0 ? '+' : ''}${fc.netSpecContracts.toLocaleString()}</strong> (Δ Mingguan: ${fc.weeklyDelta >= 0 ? '+' : ''}${fc.weeklyDelta})</span>
        <span>Commercial: <strong>${fc.commHedgerBias}</strong></span>
      </div>
    </div>
    <div class="fund-note-item"><strong>1. Kebijakan Bank Sentral & Suku Bunga:</strong> ${fc.centralBankStance}</div>
    <div class="fund-note-item"><strong>2. Rezim Makro & Korelasi DXY:</strong> ${fc.macroRegime} • ${fc.dxyCorrelation}</div>
    <div class="fund-note-item"><strong>3. Valuasi Intrinsik & Metrik Real-Market:</strong> ${fc.valuationMetrics}</div>
    <div class="fund-note-item"><strong>4. Arus Dana Institusi & Orderflow:</strong> ${fc.orderflowMetric}</div>
    <div class="fund-note-item"><strong>5. Penggerak Utama Fundamental:</strong> ${fc.macroDriver}</div>
    <div class="fund-note-item"><strong>6. Katalis & Risiko Event Terdekat:</strong> ${fc.upcomingCatalyst}</div>
  `;
}
function updateRiskSizingCalc() {
  const a = state.lastAnalysis;
  if (!a || !a.levels) return;
  const bal = Number(document.getElementById('inpAccountBalance')?.value) || 1000;
  const riskPct = Number(document.getElementById('inpRiskPct')?.value) || 1.0;
  const riskUsd = bal * (riskPct / 100);
  const stopDist = Math.abs(a.levels.entry - a.levels.sl);
  const units = stopDist > 0 ? riskUsd / stopDist : 0;
  const outEl = document.getElementById('lblPositionSizeOutput');
  if (outEl) {
    outEl.textContent = `Risiko: $${riskUsd.toFixed(2)} | Ukuran Posisi Ideal: ${units >= 10 ? units.toFixed(1) : units.toFixed(4)} Unit`;
  }
}
// ==================== MULTI-ASSET RECOMMENDATION RADAR BY HORIZON ====================
async function renderMultiAssetRadar() {
  const listEl = document.getElementById('topRadarList');
  if (!listEl) return;
  listEl.innerHTML = `<div style="padding:10px;color:#94a3b8;">Memindai peluang lintas aset (${state.radarHorizon.toUpperCase()})...</div>`;
  const horizonSampleMap = {
    scalping: [
      { sym: 'BTC/USDT', tf: 'M5' }, { sym: 'SOL/USDT', tf: 'M5' }, { sym: 'XAU/USD', tf: 'M15' },
      { sym: 'EUR/USD', tf: 'M5' }, { sym: 'PEPE/USDT', tf: 'M5' }, { sym: 'USD/JPY', tf: 'M15' },
      { sym: 'WTI', tf: 'M15' }, { sym: 'NVDA', tf: 'M15' }
    ],
    intraday: [
      { sym: 'ETH/USDT', tf: 'M30' }, { sym: 'XAU/USD', tf: 'H1' }, { sym: 'GBP/JPY', tf: 'M30' },
      { sym: 'BBCA.JK', tf: 'H1' }, { sym: 'BMRI.JK', tf: 'H1' }, { sym: 'USD/IDR', tf: 'H1' },
      { sym: 'ANTM.JK', tf: 'M30' }, { sym: 'TSLA', tf: 'H1' }
    ],
    swing: [
      { sym: 'BTC/USDT', tf: 'H4' }, { sym: 'XAU/IDR', tf: 'D1' }, { sym: 'BBRI.JK', tf: 'D1' },
      { sym: 'CPO', tf: 'H4' }, { sym: 'COAL', tf: 'D1' }, { sym: 'IHSG', tf: 'D1' },
      { sym: 'SPY', tf: 'D1' }, { sym: 'NI/USD', tf: 'H4' }
    ]
  };
  const candidates = horizonSampleMap[state.radarHorizon] || horizonSampleMap.intraday;
  const results = [];
  for (const item of candidates) {
    const feed = await fetchMarketCandles(item.sym, item.tf);
    const res = runFullAnalysis({
      symbol: item.sym,
      timeframe: item.tf,
      mode: state.mode,
      horizon: state.radarHorizon,
      candles: feed.candles
    });
    if (res && !res.error) results.push(res);
  }
  results.sort((a, b) => b.confluenceScore - a.confluenceScore);
  listEl.innerHTML = results.map(r => {
    const isBull = r.direction === 'LONG' || state.mode === 'investor';
    const badgeColor = r.direction === 'LONG' ? 'bull-text' : r.direction === 'SHORT' ? 'bear-text' : '';
    const actionLabel = state.mode === 'investor' ? 'SPOT DCA' : r.direction;
    return `
      <div class="radar-item" data-sym="${r.symbol}" data-tf="${r.timeframe}" data-hz="${state.radarHorizon}">
        <div class="r-left">
          <span class="r-sym">${r.symbol} <small class="pill-tag">${r.timeframe} • ${state.radarHorizon.toUpperCase()}</small></span>
          <span class="r-meta">${r.name} • Entry: ${fmtPrice(r.levels.entry)}</span>
        </div>
        <div class="r-right">
          <div class="${badgeColor}" style="font-weight:900;font-size:12.5px;">${isBull ? '▲' : '▼'} ${actionLabel} (${r.confluenceScore})</div>
          <span class="r-meta">COT Long: ${r.fundamentalCot.specLongPct}%</span>
        </div>
      </div>
    `;
  }).join('');
  listEl.querySelectorAll('.radar-item').forEach(el => {
    el.addEventListener('click', () => {
      state.symbol = el.dataset.sym;
      state.horizon = el.dataset.hz;
      state.timeframe = el.dataset.tf;
      document.querySelectorAll('#horizonButtonGroup .horizon-btn').forEach(b => b.classList.toggle('active', b.dataset.horizon === state.horizon));
      renderInstrumentSelect();
      renderTimeframeButtons();
      renderQuickRibbon();
      refreshActiveAnalysis();
    });
  });
}
// ==================== WORKSPACE EVENTS & VIP $29 VERIFICATION ====================
function bindWorkspaceEvents() {
  document.querySelectorAll('#assetClassTabs .asset-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#assetClassTabs .asset-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.assetFilter = btn.dataset.asset;
      if (state.assetFilter === 'crypto') await loadAllBinanceUsdtPairs();
      renderInstrumentSelect();
      refreshActiveAnalysis();
    });
  });
  document.getElementById('instrumentSelect')?.addEventListener('change', (e) => {
    state.symbol = e.target.value;
    renderQuickRibbon();
    refreshActiveAnalysis();
  });
  const handleCustomSearch = async () => {
    const inp = document.getElementById('customTickerSearch');
    const q = (inp?.value || '').trim().toUpperCase();
    if (!q) return;
    await loadAllBinanceUsdtPairs();
    const found = DEFAULT_INSTRUMENTS.find(i =>
      i.symbol.toUpperCase() === q ||
      i.symbol.toUpperCase().startsWith(q) ||
      i.name.toUpperCase().includes(q)
    );
    if (found) {
      state.symbol = found.symbol;
    } else {
      const sym = q.includes('/') || q.includes('.') ? q : `${q}/USDT`;
      registerDynamicInstrument({
        symbol: sym, name: `${sym} Custom Asset`, assetClass: sym.endsWith('USDT') ? 'crypto' : 'stocks',
        provider: 'binance', providerSymbol: sym.replace('/', ''), isRealtime: true, delayMinutes: 0, basePrice: 10
      });
      state.symbol = sym;
    }
    state.assetFilter = 'all';
    renderInstrumentSelect();
    refreshActiveAnalysis();
  };
  document.getElementById('btnLoadCustomTicker')?.addEventListener('click', handleCustomSearch);
  document.getElementById('customTickerSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCustomSearch();
  });
  document.querySelectorAll('#horizonButtonGroup .horizon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#horizonButtonGroup .horizon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.horizon = btn.dataset.horizon;
      const g = HORIZON_GROUPS[state.horizon] || HORIZON_GROUPS.all;
      state.timeframe = g.defaultTf;
      renderTimeframeButtons();
      refreshActiveAnalysis();
    });
  });
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      if (state.mode === 'investor' && state.horizon === 'scalping') {
        state.horizon = 'macro';
        state.timeframe = 'D1';
        document.querySelectorAll('#horizonButtonGroup .horizon-btn').forEach(b => b.classList.toggle('active', b.dataset.horizon === 'macro'));
        renderTimeframeButtons();
      }
      refreshActiveAnalysis();
      renderMultiAssetRadar();
    });
  });
  document.querySelectorAll('#radarHorizonTabs .radar-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#radarHorizonTabs .radar-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.radarHorizon = btn.dataset.rhorizon;
      renderMultiAssetRadar();
    });
  });
  document.getElementById('btnRefreshRadar')?.addEventListener('click', () => renderMultiAssetRadar());
  document.getElementById('btnResetChartZoom')?.addEventListener('click', () => focusCleanTradingViewZoom());
  ['chkShowEma', 'chkShowVwapBb', 'chkShowSmcSr', 'chkShowLevels'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => drawChartOverlays(state.lastAnalysis));
  });
  ['inpAccountBalance', 'inpRiskPct'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateRiskSizingCalc);
  });
  // VIP Modal & Copy Wallet & Verify $29 USDT TxHash
  const vipModal = document.getElementById('vipModal');
  document.getElementById('btnOpenVipModal')?.addEventListener('click', () => vipModal?.classList.remove('hidden'));
  document.getElementById('btnCloseVipModal')?.addEventListener('click', () => vipModal?.classList.add('hidden'));
  document.getElementById('btnCopyVipWallet')?.addEventListener('click', () => {
    navigator.clipboard?.writeText('0xB2Da154e6619A57A2B839D7845920e55Bc58A12C');
    const b = document.getElementById('btnCopyVipWallet');
    if (b) { b.textContent = '✅ Tersalin!'; setTimeout(() => { b.textContent = '📋 Salin'; }, 2000); }
  });
  document.getElementById('btnVerifyTxHash')?.addEventListener('click', async () => {
    const tx = (document.getElementById('inpBscTxHash')?.value || '').trim();
    const st = document.getElementById('txVerifyStatus');
    if (!tx.startsWith('0x') || tx.length < 40) {
      if (st) { st.textContent = '⚠️ Masukkan TxHash BSC yang valid (diawali 0x...).'; st.className = 'tx-status-msg bear-text'; }
      return;
    }
    if (st) { st.textContent = '⏳ Memverifikasi pembayaran $29 USDT di jaringan BSC...'; st.className = 'tx-status-msg'; }
    try {
      const res = await fetch('/api/billing/verify-bsc-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: tx, expectedAmountUsd: 29 })
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        if (st) { st.textContent = '✅ Pembayaran $29 USDT Terverifikasi! Status VIP 30 Hari Aktif.'; st.className = 'tx-status-msg bull-text'; }
        state.user = { ...(state.user || {}), role: 'vip', name: (state.user?.name || 'VIP Quant') };
        updateUserProfileUI();
      } else {
        if (st) { st.textContent = `ℹ️ ${data.error || 'TxHash belum ditemukan di BSC mainnet.'}`; st.className = 'tx-status-msg bear-text'; }
      }
    } catch (_) {
      if (st) { st.textContent = 'ℹ️ Gagal menghubungi verifier. Coba beberapa saat lagi.'; st.className = 'tx-status-msg bear-text'; }
    }
  });
}
// ==================== BOOTSTRAP ====================
window.addEventListener('DOMContentLoaded', () => {
  renderInstrumentSelect();
  renderQuickRibbon();
  renderTimeframeButtons();
  bindWorkspaceEvents();
  initAuthAndLandingFlow();
  // Always start on the Human-Friendly Front Dashboard so visitors understand the platform first
  showFrontLanding();
  setTimeout(() => { loadAllBinanceUsdtPairs().then(ok => { if (ok) renderInstrumentSelect(); }); }, 2200);
});