import { api, DEFAULT_INSTRUMENTS } from './api.js';
import { ChartEngine } from './chart-engine.js';
import { PositionCalculator } from './calculator.js';
import { SignalCard } from './components/signal-card.js';
import { FundamentalPanel } from './components/fundamental-panel.js';
import { ScannerPanel } from './components/scanner-panel.js';
import { AuthBillingModal } from './components/auth-billing-modal.js';
import { evaluateQuantSignal } from './shared/signal-engine.js';
import {
  SUPPORTED_LANGUAGES,
  detectInitialLanguage,
  setLanguage,
  applyTranslationsToDOM,
  formatNumber
} from '../i18n/index.js';
class XstarzgApp {
  constructor() {
    this.assetClass = 'crypto';
    this.symbol = 'BTC/USDT';
    this.timeframe = 'H1';
    this.mode = 'trader';
    this.bars = [];
    this.indicators = null;
    this.derivatives = { fundingRatePct: 0.01, openInterestUsd: null };
  }
  async init() {
    this.initRiskDisclaimerModal();
    await this.initLanguageEngine();
    this.calculator = new PositionCalculator();
    this.calculator.init();
    this.signalCard = new SignalCard({
      containerId: 'signalCardBody',
      statusPillId: 'signalStatusPill',
      onApplyLevels: (levels) => this.calculator.setLevelsFromSignal(levels)
    });
    this.signalCard.renderIdle();
    this.fundamentalPanel = new FundamentalPanel({
      containerId: 'fundamentalMount',
      refreshBtnId: 'btnRefreshFundamentals',
      onRefresh: () => this.loadFundamentals()
    });
    this.scannerPanel = new ScannerPanel({
      containerId: 'scannerMount',
      onSelectSymbol: ({ symbol, assetClass }) => {
        if (assetClass && assetClass !== this.assetClass) {
          this.switchAssetClass(assetClass, symbol);
        } else if (symbol) {
          this.switchSymbol(symbol);
        }
      }
    });
    this.authModal = new AuthBillingModal({
      triggerBtnId: 'btnGoogleLogin',
      onSessionUpdated: () => {}
    });
    this.authModal.init();
    this.chartEngine = new ChartEngine({
      mainContainerId: 'mainChartContainer',
      oscContainerId: 'oscChartContainer',
      vpvrContainerId: 'vpvrOverlay',
      onRealtimeTick: (bar) => this.handleRealtimeTick(bar),
      onStatusChange: (st) => this.updateFeedBadges(st.status, 0, st.exchange)
    });
    this.chartEngine.init();
    this.bindWorkspaceControls();
    this.populateSymbolDropdown('crypto', 'BTC/USDT');
    await this.loadMarketWorkspace({ autoRunAnalysis: true });
    this.loadScanner('all');
  }
  initRiskDisclaimerModal() {
    const key = 'xstarzg_risk_accepted_v2';
    const backdrop = document.getElementById('riskModalBackdrop');
    const btnAccept = document.getElementById('btnAcceptRiskModal');
    if (!backdrop) return;
    if (!localStorage.getItem(key)) {
      backdrop.classList.remove('hidden');
    }
    if (btnAccept) {
      btnAccept.addEventListener('click', () => {
        localStorage.setItem(key, '1');
        backdrop.classList.add('hidden');
      });
    }
  }
  async initLanguageEngine() {
    const sel = document.getElementById('languageSelect');
    const initialLang = detectInitialLanguage();
    if (sel) {
      sel.innerHTML = SUPPORTED_LANGUAGES.map(
        (l) => `<option value="${l.code}">${l.flag} ${l.nativeName}</option>`
      ).join('');
      sel.value = initialLang;
      sel.addEventListener('change', async (e) => {
        await setLanguage(e.target.value);
        applyTranslationsToDOM();
        if (this.signalCard.lastPayload) {
          this.signalCard.renderAnalysis(this.signalCard.lastPayload);
        }
      });
    }
    await setLanguage(initialLang);
    applyTranslationsToDOM();
  }
  bindWorkspaceControls() {
    // Mode Switch (Trader vs Spot Investor Long-Only)
    const btnTrader = document.getElementById('modeTraderBtn');
    const btnInvestor = document.getElementById('modeInvestorBtn');
    if (btnTrader && btnInvestor) {
      btnTrader.addEventListener('click', () => {
        this.mode = 'trader';
        btnTrader.classList.add('active');
        btnInvestor.classList.remove('active');
        this.executeQuantEvaluation();
        this.loadScanner(this.scannerPanel.activeFilter);
      });
      btnInvestor.addEventListener('click', () => {
        this.mode = 'investor';
        btnInvestor.classList.add('active');
        btnTrader.classList.remove('active');
        this.executeQuantEvaluation();
        this.loadScanner(this.scannerPanel.activeFilter);
      });
    }
    // Asset Class Tabs
    document.querySelectorAll('#assetClassTabs .asset-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const nextAsset = tab.getAttribute('data-asset');
        this.switchAssetClass(nextAsset);
      });
    });
    // Symbol Select
    const symSel = document.getElementById('symbolSelect');
    if (symSel) {
      symSel.addEventListener('change', (e) => {
        this.switchSymbol(e.target.value);
      });
    }
    // Timeframe Buttons
    document.querySelectorAll('#timeframeBar .tf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        document.querySelectorAll('#timeframeBar .tf-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.timeframe = btn.getAttribute('data-tf');
        this.loadMarketWorkspace({ autoRunAnalysis: true });
      });
    });
    // Overlay Toggles
    document.querySelectorAll('.overlay-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const key = btn.getAttribute('data-overlay');
        this.chartEngine.setOverlayVisibility(key, btn.classList.contains('active'));
      });
    });
    // Oscillator Tabs
    document.querySelectorAll('.osc-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.osc-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.chartEngine.setActiveOscillator(btn.getAttribute('data-osc'));
      });
    });
    // Full Analysis Button
    const btnRun = document.getElementById('btnRunFullAnalysis');
    if (btnRun) {
      btnRun.addEventListener('click', () => this.runServerFullAnalysis());
    }
  }
  populateSymbolDropdown(assetClass, selectedSymbol = null) {
    const list = DEFAULT_INSTRUMENTS[assetClass] || DEFAULT_INSTRUMENTS.crypto;
    const sel = document.getElementById('symbolSelect');
    if (!sel) return;
    sel.innerHTML = list
      .map((item) => `<option value="${item.symbol}">${item.symbol} — ${item.name}</option>`)
      .join('');
    this.symbol = selectedSymbol || list[0].symbol;
    sel.value = this.symbol;
  }
  switchAssetClass(nextAsset, targetSymbol = null) {
    this.assetClass = nextAsset;
    document.querySelectorAll('#assetClassTabs .asset-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-asset') === nextAsset);
    });
    this.populateSymbolDropdown(nextAsset, targetSymbol);
    const isRealtimeCapable = nextAsset === 'crypto';
    this.enforceScalpingTimeframeLock(isRealtimeCapable);
    this.loadMarketWorkspace({ autoRunAnalysis: true });
  }
  switchSymbol(nextSymbol) {
    this.symbol = nextSymbol;
    const sel = document.getElementById('symbolSelect');
    if (sel && sel.value !== nextSymbol) sel.value = nextSymbol;
    this.loadMarketWorkspace({ autoRunAnalysis: true });
  }
  enforceScalpingTimeframeLock(isRealtimeFeed) {
    const lockNotice = document.getElementById('scalpingLockNotice');
    const scalpBtns = document.querySelectorAll('#timeframeBar .tf-btn[data-scalp="1"]');
    scalpBtns.forEach((btn) => {
      btn.disabled = !isRealtimeFeed;
      btn.classList.toggle('tf-locked', !isRealtimeFeed);
    });
    if (lockNotice) {
      lockNotice.classList.toggle('hidden', isRealtimeFeed);
    }
    if (!isRealtimeFeed && ['M1', 'M5', 'M15'].includes(this.timeframe)) {
      this.timeframe = 'H1';
      document.querySelectorAll('#timeframeBar .tf-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-tf') === 'H1');
      });
    }
  }
  async loadMarketWorkspace({ autoRunAnalysis = true } = {}) {
    const titleEl = document.getElementById('activeSymbolTitle');
    if (titleEl) titleEl.textContent = this.symbol;
    this.chartEngine.disconnectRealtime();
    try {
      const data = await api.fetchMarketOhlcv({
        symbol: this.symbol,
        assetClass: this.assetClass,
        timeframe: this.timeframe,
        limit: 300
      });
      if (data && Array.isArray(data.bars) && data.bars.length > 0) {
        this.bars = data.bars;
        this.indicators = this.chartEngine.setCandles(this.bars);
        const lastBar = this.bars[this.bars.length - 1];
        const prevBar = this.bars[Math.max(0, this.bars.length - 2)];
        this.updatePriceHeader(lastBar.close, prevBar.close);
        const isRealtime = data.feedStatus === 'REALTIME WS' || this.assetClass === 'crypto';
        this.enforceScalpingTimeframeLock(isRealtime);
        this.updateFeedBadges(
          data.feedStatus || (isRealtime ? 'REALTIME WS' : 'DELAYED 15M'),
          data.cacheAgeMinutes || 0,
          data.sourceExchange || 'PUBLIC FEED',
          data.honestLabel || null
        );
        this.updateTelemetryMatrix();
        const latestAtr = this.indicators?.summary?.atr14 || 0;
        this.calculator.updateMarketContext({
          price: lastBar.close,
          atr: latestAtr,
          symbol: this.symbol,
          mode: this.mode
        });
        if (this.assetClass === 'crypto') {
          this.chartEngine.connectCryptoRealtime(this.symbol, this.timeframe);
          this.loadCryptoDerivatives();
        } else {
          const derivBar = document.getElementById('derivativesBar');
          if (derivBar) derivBar.classList.add('hidden');
        }
        if (autoRunAnalysis) {
          this.executeQuantEvaluation();
        }
      }
    } catch (err) {
      this.signalCard.renderError(err.message || 'Gagal memuat data pasar.');
    }
    this.loadFundamentals();
  }
  async loadCryptoDerivatives() {
    const derivBar = document.getElementById('derivativesBar');
    if (derivBar) derivBar.classList.remove('hidden');
    const d = await api.fetchCryptoDerivativesDirect(this.symbol);
    this.derivatives = d;
    const elFund = document.getElementById('valFundingRate');
    const elOi = document.getElementById('valOpenInterest');
    if (elFund) {
      const f = Number(d.fundingRatePct || 0);
      elFund.textContent = `${f >= 0 ? '+' : ''}${formatNumber(f, 4)}%`;
      elFund.className = `mh-stat-val ${f >= 0 ? 'text-bull' : 'text-bear'}`;
    }
    if (elOi) {
      elOi.textContent = d.openInterestUsd
        ? `$${formatNumber(d.openInterestUsd / 1e6, 2)}M`
        : 'LIVE PERP';
    }
  }
  handleRealtimeTick(bar) {
    if (!bar || !this.bars.length) return;
    const prevBar = this.bars[Math.max(0, this.bars.length - 2)];
    this.updatePriceHeader(bar.close, prevBar?.close || bar.open);
  }
  updatePriceHeader(price, refPrice) {
    const elPrice = document.getElementById('activePrice');
    const elChange = document.getElementById('activePriceChange');
    if (elPrice && Number.isFinite(price)) {
      const decimals = price >= 100 ? 2 : price >= 1 ? 4 : 6;
      elPrice.textContent = formatNumber(price, decimals);
    }
    if (elChange && Number.isFinite(price) && Number.isFinite(refPrice) && refPrice > 0) {
      const pct = ((price - refPrice) / refPrice) * 100;
      elChange.textContent = `${pct >= 0 ? '▲ +' : '▼ '}${formatNumber(pct, 2)}%`;
      elChange.className = `mh-change ${pct >= 0 ? 'bull' : 'bear'}`;
    }
  }
  updateFeedBadges(feedStatus, cacheAgeMin, sourceExchange, honestLabel = null) {
    const elFeed = document.getElementById('feedStatusBadge');
    const elCache = document.getElementById('cacheAgeBadge');
    const elExch = document.getElementById('valSourceExchange');
    const elBanner = document.getElementById('honestSourceBanner');
    if (elFeed) {
      elFeed.textContent = feedStatus;
      elFeed.className = `feed-badge ${feedStatus.includes('REALTIME') ? 'feed-realtime' : 'feed-delayed'}`;
    }
    if (elCache) {
      elCache.textContent = `Cache ${cacheAgeMin || 0}m`;
    }
    if (elExch) {
      elExch.textContent = sourceExchange;
    }
    if (elBanner) {
      if (honestLabel) {
        elBanner.textContent = `ℹ️ TRANSPARANSI SUMBER DATA: ${honestLabel}`;
        elBanner.classList.remove('hidden');
      } else {
        elBanner.classList.add('hidden');
      }
    }
  }
  updateTelemetryMatrix() {
    if (!this.indicators || !this.indicators.summary) return;
    const s = this.indicators.summary;
    const smc = this.indicators.smc || {};
    const vpvr = this.indicators.vpvr || {};
    const setCell = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setCell('valTrendMain', `${s.regime || 'BALANCED'} • ADX ${formatNumber(s.adx14 || 0, 1)}`);
    setCell('valMomentumMain', `RSI ${formatNumber(s.rsi14 || 50, 1)} • StochK ${formatNumber(s.stochK || 50, 1)}`);
    setCell('valVolatilityMain', `ATR ${formatNumber(s.atr14 || 0, 4)} ${s.bbSqueeze ? '• SQUEEZE' : ''}`);
    setCell('valVwapMain', `VWAP ${formatNumber(s.vwap || 0, 2)}`);
    setCell('valSmcMain', `${smc.lastStructure || 'NEUTRAL'} • POC ${formatNumber(vpvr.poc || 0, 2)}`);
    setCell('valDeltaMain', `CVD ${formatNumber(s.cvd || 0, 0)}`);
  }
  executeQuantEvaluation() {
    if (!this.bars || this.bars.length < 30) return;
    const t0 = performance.now();
    const evaluation = evaluateQuantSignal({
      bars: this.bars,
      symbol: this.symbol,
      assetClass: this.assetClass,
      timeframe: this.timeframe,
      mode: this.mode,
      derivatives: this.derivatives
    });
    const computeMs = performance.now() - t0;
    this.signalCard.renderAnalysis({
      ...evaluation,
      timeframe: this.timeframe,
      computeMs
    });
  }
  async runServerFullAnalysis() {
    this.signalCard.renderLoading(this.symbol, this.timeframe);
    try {
      const res = await api.runFullAnalysis({
        symbol: this.symbol,
        assetClass: this.assetClass,
        timeframe: this.timeframe,
        mode: this.mode,
        bars: this.assetClass === 'crypto' ? this.bars.slice(-260) : undefined,
        derivatives: this.derivatives
      });
      if (res && res.ok) {
        this.signalCard.renderAnalysis(res);
        this.authModal.refreshSession();
      } else {
        this.executeQuantEvaluation();
      }
    } catch (_) {
      this.executeQuantEvaluation();
    }
  }
  async loadFundamentals() {
    this.fundamentalPanel.renderLoading(this.symbol);
    try {
      const [fundData, secData] = await Promise.all([
        api.fetchFundamentals(this.symbol, this.assetClass),
        this.assetClass === 'stocks' ? api.fetchSecEdgar(this.symbol) : Promise.resolve(null)
      ]);
      this.fundamentalPanel.render(fundData, secData);
    } catch (err) {
      this.fundamentalPanel.renderError(err.message || 'Gagal memuat data.');
    }
  }
  async loadScanner(assetFilter = 'all') {
    this.scannerPanel.renderLoading();
    try {
      const data = await api.fetchScannerRecommendations({
        mode: this.mode,
        timeframe: this.timeframe,
        assetClass: assetFilter
      });
      this.scannerPanel.render(data, this.mode, (nextFilter) => this.loadScanner(nextFilter));
    } catch (err) {
      this.scannerPanel.renderError(err.message || 'Gagal memuat scanner.');
    }
  }
}
window.addEventListener('DOMContentLoaded', () => {
  const app = new XstarzgApp();
  app.init();
});