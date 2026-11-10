import {
  DEFAULT_INSTRUMENTS, TIMEFRAMES, HORIZON_GROUPS, getInstrumentMeta, registerDynamicInstrument
} from './shared/quant-core.js';
import { runFullAnalysis } from './shared/signal-engine.js';
import { fetchMarketCandles, loadAllBinanceUsdtPairs } from './api.js';
const state = {
  authenticated: false,
  user: null,
  assetFilter: 'all',
  symbol: 'BTC/USDT',
  horizon: 'intraday',      // scalping | intraday | swing | macro | all
  timeframe: 'H1',
  mode: 'trader',           // trader | investor
  radarHorizon: 'scalping', // scalping | intraday | swing
  lastAnalysis: null,
  chart: null,
  candleSeries: null,
  ema20Series: null,
  ema50Series: null,
  ema200Series: null,
  rsiChart: null,
  rsiSeries: null,
  priceLines: []
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
// ==================== LOGIN GATE & AUTH ====================
async function initAuthGate() {
  const gate = document.getElementById('loginGateScreen');
  const workspace = document.getElementById('appWorkspaceWrapper');
  const btnGuest = document.getElementById('btnEnterGuestTerminal');
  const btnFallbackGoogle = document.getElementById('btnFallbackGoogleClick');
  const setupBox = document.getElementById('gateClientIdSetupBox');
  const inpClientId = document.getElementById('inputGateGoogleClientId');
  const btnSaveClientId = document.getElementById('btnSaveGateClientId');
  const enterWorkspace = (userObj) => {
    state.authenticated = true;
    state.user = userObj || { name: 'Guest Quant', email: 'guest@xstarzg.io', role: 'guest' };
    gate.classList.add('hidden');
    workspace.classList.remove('hidden');
    const btnUser = document.getElementById('btnUserSession');
    if (btnUser) btnUser.textContent = `👤 ${state.user.name}`;
    setTimeout(() => {
      initChartsIfNeeded();
      window.dispatchEvent(new Event('resize'));
      refreshActiveAnalysis();
      renderMultiAssetRadar();
    }, 60);
  };
  btnGuest.addEventListener('click', () => enterWorkspace({ name: 'Mode Preview', role: 'guest' }));
  let googleClientId = localStorage.getItem('xstarzg_google_client_id') || '';
  try {
    const r = await fetch('/api/auth/session');
    if (r.ok) {
      const s = await r.json();
      if (s.googleClientId) googleClientId = s.googleClientId;
      if (s.authenticated && s.user) {
        enterWorkspace(s.user);
        return;
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
              enterWorkspace(data.user);
              return;
            }
          } catch (_) {}
          enterWorkspace({ name: 'Google Verified User', role: 'member' });
        }
      });
      const mountEl = document.getElementById('gateGoogleButtonMount');
      mountEl.innerHTML = '';
      window.google.accounts.id.renderButton(mountEl, { theme: 'filled_black', size: 'large', width: 320 });
      return true;
    } catch (_) { return false; }
  };
  setTimeout(() => { if (googleClientId) mountGoogleGsi(googleClientId); }, 600);
  btnFallbackGoogle.addEventListener('click', () => {
    if (googleClientId && window.google && window.google.accounts) {
      mountGoogleGsi(googleClientId);
      window.google.accounts.id.prompt();
    } else {
      setupBox.classList.toggle('hidden');
      if (inpClientId) inpClientId.value = googleClientId;
    }
  });
  btnSaveClientId.addEventListener('click', () => {
    const cid = (inpClientId.value || '').trim();
    if (cid.includes('.apps.googleusercontent.com')) {
      localStorage.setItem('xstarzg_google_client_id', cid);
      googleClientId = cid;
      setupBox.classList.add('hidden');
      mountGoogleGsi(cid);
    }
  });
}
// ==================== INSTRUMENT CATALOG & LIVE 1500+ CRYPTO SEARCH ====================
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
// ==================== HORIZON (SCALPING/INTRADAY/SWING/MACRO) -> TIMEFRAME BUTTONS ====================
function renderTimeframeButtons() {
  const container = document.getElementById('timeframeButtonGroup');
  const hintLabel = document.getElementById('tfGroupHintLabel');
  if (!container) return;
  container.innerHTML = '';
  const groupObj = HORIZON_GROUPS[state.horizon] || HORIZON_GROUPS.all;
  if (hintLabel) hintLabel.textContent = `TIMEFRAME (${groupObj.label}):`;
  // Ensure current timeframe belongs to selected horizon group
  if (!groupObj.tfs.includes(state.timeframe)) {
    state.timeframe = groupObj.defaultTf;
  }
  for (const tfId of groupObj.tfs) {
    const tfMeta = TIMEFRAMES.find(t => t.id === tfId);
    if (!tfMeta) continue;
    const btn = document.createElement('button');
    btn.className = `tf-btn ${state.timeframe === tfId ? 'active' : ''}`;
    btn.textContent = tfId;
    btn.title = `Timeframe ${tfId} (${groupObj.desc})`;
    btn.addEventListener('click', () => {
      state.timeframe = tfId;
      renderTimeframeButtons();
      refreshActiveAnalysis();
    });
    container.appendChild(btn);
  }
}
// ==================== LIGHTWEIGHT CHARTS INITIALIZATION ====================
function initChartsIfNeeded() {
  const mainEl = document.getElementById('mainChartContainer');
  const rsiEl = document.getElementById('rsiChartContainer');
  if (!mainEl || !rsiEl || !window.LightweightCharts) return;
  if (state.chart) return;
  state.chart = window.LightweightCharts.createChart(mainEl, {
    width: mainEl.clientWidth || 760,
    height: 420,
    layout: { background: { color: '#11161f' }, textColor: '#94a3b8' },
    grid: { vertLines: { color: '#1e2633' }, horzLines: { color: '#1e2633' } },
    crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#2e3a4d' },
    timeScale: { borderColor: '#2e3a4d', timeVisible: true, secondsVisible: false }
  });
  state.candleSeries = state.chart.addCandlestickSeries({
    upColor: '#4db6a3', downColor: '#e0675f',
    borderUpColor: '#4db6a3', borderDownColor: '#e0675f',
    wickUpColor: '#4db6a3', wickDownColor: '#e0675f'
  });
  state.ema20Series = state.chart.addLineSeries({ color: '#38bdf8', lineWidth: 1.5, title: 'EMA 20' });
  state.ema50Series = state.chart.addLineSeries({ color: '#eab308', lineWidth: 1.5, title: 'EMA 50' });
  state.ema200Series = state.chart.addLineSeries({ color: '#a855f7', lineWidth: 2, title: 'EMA 200' });
  state.rsiChart = window.LightweightCharts.createChart(rsiEl, {
    width: rsiEl.clientWidth || 760,
    height: 115,
    layout: { background: { color: '#11161f' }, textColor: '#94a3b8' },
    grid: { vertLines: { color: '#1e2633' }, horzLines: { color: '#1e2633' } },
    rightPriceScale: { borderColor: '#2e3a4d' },
    timeScale: { borderColor: '#2e3a4d', timeVisible: true }
  });
  state.rsiSeries = state.rsiChart.addLineSeries({ color: '#60a5fa', lineWidth: 1.5, title: 'RSI 14' });
  window.addEventListener('resize', () => {
    if (state.chart && mainEl.clientWidth > 0) state.chart.applyOptions({ width: mainEl.clientWidth });
    if (state.rsiChart && rsiEl.clientWidth > 0) state.rsiChart.applyOptions({ width: rsiEl.clientWidth });
  });
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
  const showLevels = document.getElementById('chkShowLevels')?.checked ?? true;
  const showVp = document.getElementById('chkShowVp')?.checked ?? true;
  if (showEma && analysis.series) {
    state.ema20Series.setData(analysis.series.ema20);
    state.ema50Series.setData(analysis.series.ema50);
    state.ema200Series.setData(analysis.series.ema200);
  } else {
    state.ema20Series.setData([]);
    state.ema50Series.setData([]);
    state.ema200Series.setData([]);
  }
  const addLine = (price, color, title, style = 2) => {
    if (!price || isNaN(price)) return;
    const line = state.candleSeries.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
    state.priceLines.push(line);
  };
  if (showVp && analysis.levels?.poc) {
    addLine(analysis.levels.poc, '#eab308', 'POC Vol', 1);
  }
  if (showLevels && analysis.levels) {
    if (state.mode === 'investor') {
      addLine(analysis.levels.dcaZone1, '#34d399', 'DCA 1 (40%)', 2);
      addLine(analysis.levels.dcaZone2, '#10b981', 'DCA 2 (35%)', 2);
      addLine(analysis.levels.dcaZone3, '#059669', 'DCA 3 (25%)', 2);
      addLine(analysis.levels.invTarget1, '#38bdf8', 'Valuasi TP1', 0);
      addLine(analysis.levels.invTarget2, '#60a5fa', 'Valuasi TP2', 0);
    } else {
      addLine(analysis.levels.entry, '#38bdf8', 'ENTRY', 0);
      addLine(analysis.levels.sl, '#e0675f', 'STOP LOSS', 2);
      addLine(analysis.levels.tp1, '#4db6a3', 'TP1 (1.5R)', 2);
      addLine(analysis.levels.tp2, '#34d399', 'TP2 (2.5R)', 2);
    }
  }
}
// ==================== CORE ANALYSIS EXECUTION & UI RENDERING ====================
async function refreshActiveAnalysis() {
  initChartsIfNeeded();
  const feedData = await fetchMarketCandles(state.symbol, state.timeframe);
  const candles = feedData.candles || [];
  if (state.candleSeries && candles.length) {
    state.candleSeries.setData(candles);
    state.chart.timeScale().fitContent();
  }
  const analysis = runFullAnalysis({
    symbol: state.symbol,
    timeframe: state.timeframe,
    mode: state.mode,
    horizon: state.horizon,
    candles
  });
  state.lastAnalysis = analysis;
  if (state.rsiSeries && analysis.series?.rsi) {
    state.rsiSeries.setData(analysis.series.rsi);
    state.rsiChart.timeScale().fitContent();
  }
  drawChartOverlays(analysis);
  renderTelemetryAndBlueprint(analysis, feedData.source);
  renderDeepTechnicalAndFundamentalCot(analysis);
}
function renderTelemetryAndBlueprint(a, sourceName) {
  if (!a || a.error) return;
  document.getElementById('lblActiveSymbol').textContent = a.symbol;
  document.getElementById('lblActiveName').textContent = a.name;
  document.getElementById('activeFeedSourceLabel').textContent = `FEED: ${sourceName || 'REALTIME EDGE'} • ${a.timeframe} (${a.horizon.toUpperCase()})`;
  const feedBadge = document.getElementById('lblFeedBadge');
  if (feedBadge) {
    feedBadge.textContent = `● REALTIME ${a.timeframe} AKTIF`;
    feedBadge.className = 'badge-feed badge-realtime';
  }
  document.getElementById('lblLastPrice').textContent = fmtPrice(a.lastPrice);
  const chgEl = document.getElementById('lblChangePct');
  const sign = a.changePct >= 0 ? '▲ +' : '▼ ';
  chgEl.textContent = `${sign}${a.changePct.toFixed(2)}%`;
  chgEl.className = `m-val ${a.changePct >= 0 ? 'bull-text' : 'bear-text'}`;
  document.getElementById('lblRegime').textContent = a.regime;
  document.getElementById('lblStructureTag').textContent = a.structureTag;
  document.getElementById('lblAtrPct').textContent = `${a.indicators.atrPct.toFixed(2)}%`;
  // Execution Blueprint Mode Switch (Trader vs Spot Investor)
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
  // Sub-scores
  const sbContainer = document.getElementById('subscoreBarsContainer');
  const subs = [
    { label: 'Trend Stack (EMA)', val: a.subScores.trend },
    { label: 'Market Structure', val: a.subScores.structure },
    { label: 'Momentum (RSI/MACD)', val: a.subScores.momentum },
    { label: 'CFTC COT Institutional', val: a.subScores.cotBias }
  ];
  sbContainer.innerHTML = subs.map(s => `
    <div class="sb-item">
      <div class="sb-top"><span>${s.label}</span><span>${s.val}/100</span></div>
      <div class="sb-track"><div class="sb-fill" style="width:${s.val}%"></div></div>
    </div>
  `).join('');
  // Toggle Trader vs Investor Levels Panel
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
  // Reasons
  const rList = document.getElementById('signalReasonsList');
  rList.innerHTML = a.reasons.map(r => `<li>${r}</li>`).join('');
  // Backtest
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
function renderDeepTechnicalAndFundamentalCot(a) {
  if (!a || !a.indicators) return;
  const ind = a.indicators;
  const lv = a.levels;
  const techEl = document.getElementById('techMatrixContent');
  techEl.innerHTML = `
    <div class="tech-box"><span>EMA 20 / 50 / 200</span><strong>${fmtPrice(ind.ema20)} / ${fmtPrice(ind.ema50)}</strong></div>
    <div class="tech-box"><span>Volume Profile POC</span><strong>${fmtPrice(lv.poc)} (VAH: ${fmtPrice(lv.vah)})</strong></div>
    <div class="tech-box"><span>RSI (14) & MACD Hist</span><strong>${ind.rsi.toFixed(1)} | ${ind.macdHist >= 0 ? '+' : ''}${ind.macdHist.toPrecision(3)}</strong></div>
    <div class="tech-box"><span>Swing High / Swing Low</span><strong>${fmtPrice(lv.swingHigh)} / ${fmtPrice(lv.swingLow)}</strong></div>
    <div class="tech-box"><span>Bollinger Width %</span><strong>${ind.bbWidth.toFixed(2)}% (${a.regime})</strong></div>
    <div class="tech-box"><span>ATR (14) Volatilitas</span><strong>${fmtPrice(ind.atr)} (${ind.atrPct.toFixed(2)}%)</strong></div>
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
    <div class="fund-note-item"><strong>Penggerak Fundamental Makro:</strong> ${fc.macroDriver}</div>
    <div class="fund-note-item"><strong>Valuasi & Siklus Likuiditas:</strong> ${fc.valuationNote}</div>
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
// ==================== MULTI-ASSET RECOMMENDATION RADAR BY HORIZON (SCALPING / INTRADAY / SWING) ====================
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
// ==================== EVENT LISTENERS ====================
function bindWorkspaceEvents() {
  // Asset Class Tabs
  document.querySelectorAll('#assetClassTabs .asset-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#assetClassTabs .asset-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.assetFilter = btn.dataset.asset;
      if (state.assetFilter === 'crypto') {
        await loadAllBinanceUsdtPairs();
      }
      renderInstrumentSelect();
      refreshActiveAnalysis();
    });
  });
  // Instrument Select Dropdown
  document.getElementById('instrumentSelect')?.addEventListener('change', (e) => {
    state.symbol = e.target.value;
    renderQuickRibbon();
    refreshActiveAnalysis();
  });
  // Custom Ticker Search (Supports any Binance coin or IDX/Global stock)
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
  // Strategy Horizon Selector (Scalping, Intraday, Swing, Macro, All)
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
  // Mode Toggle (Trader vs Spot Investor)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      if (state.mode === 'investor' && (state.horizon === 'scalping')) {
        state.horizon = 'macro';
        state.timeframe = 'D1';
        document.querySelectorAll('#horizonButtonGroup .horizon-btn').forEach(b => b.classList.toggle('active', b.dataset.horizon === 'macro'));
        renderTimeframeButtons();
      }
      refreshActiveAnalysis();
      renderMultiAssetRadar();
    });
  });
  // Radar Horizon Tabs
  document.querySelectorAll('#radarHorizonTabs .radar-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#radarHorizonTabs .radar-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.radarHorizon = btn.dataset.rhorizon;
      renderMultiAssetRadar();
    });
  });
  document.getElementById('btnRefreshRadar')?.addEventListener('click', () => renderMultiAssetRadar());
  // Chart Overlay Checkboxes
  ['chkShowEma', 'chkShowLevels', 'chkShowVp'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => drawChartOverlays(state.lastAnalysis));
  });
  // Risk Calculator Inputs
  ['inpAccountBalance', 'inpRiskPct'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateRiskSizingCalc);
  });
  // VIP Modal
  const vipModal = document.getElementById('vipModal');
  document.getElementById('btnOpenVipModal')?.addEventListener('click', () => vipModal?.classList.remove('hidden'));
  document.getElementById('btnCloseVipModal')?.addEventListener('click', () => vipModal?.classList.add('hidden'));
}
// ==================== BOOTSTRAP ====================
window.addEventListener('DOMContentLoaded', () => {
  renderInstrumentSelect();
  renderQuickRibbon();
  renderTimeframeButtons();
  bindWorkspaceEvents();
  initAuthGate();
  // Preload 1,500+ Binance pairs in background
  setTimeout(() => { loadAllBinanceUsdtPairs().then(ok => { if (ok) renderInstrumentSelect(); }); }, 2000);
});