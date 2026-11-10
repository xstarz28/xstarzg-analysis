import { api, DEFAULT_INSTRUMENTS, getAllInstrumentsFlat } from './api.js';
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
    this.assetFilter = 'all';
    this.assetClass = 'crypto';
    this.symbol = 'BTC/USDT';
    this.timeframe = 'H1';
    this.mode = 'trader';
    this.bars = [];
    this.indicators = null;
    this.derivatives = { fundingRatePct: 0.01, openInterestUsd: null };
  }
  async init() {
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
        this.selectInstrument(symbol, assetClass);
      }
    });
    this.authModal = new AuthBillingModal({
      triggerBtnId: 'btnGoogleLogin',
      onSessionUpdated: (session) => {
        if (session?.authenticated) {
          this.enterWorkspace();
        }
      }
    });
    this.authModal.init();
    this.chartEngine = new ChartEngine({
      mainContainerId: 'mainChartContainer',
      oscContainerId: 'oscChartContainer',
      vpvrContainerId: 'vpvrOverlay',
      onRealtimeTick: (bar) => this.handleRealtimeTick(bar),
      onStatusChange: (st) => this.updateFeedBadges(st.status, 0, st.exchange)
    });
    this.bindWorkspaceControls();
    this.populateSymbolDropdown('all', 'BTC/USDT');
    this.renderQuickTickerRibbon();
    // Cek sesi login terlebih dahulu untuk menentukan Login Gate vs Dashboard
    const session = await this.authModal.refreshSession();
    this.initLoginGate(session);
  }
  initLoginGate(session) {
    const gate = document.getElementById('loginGateScreen');
    const btnGuest = document.getElementById('btnEnterGuestTerminal');
    const cidBox = document.getElementById('gateClientIdSetupBox');
    const btnSaveCid = document.getElementById('btnSaveManualClientId');
    if (session?.authenticated) {
      this.enterWorkspace();
      return;
    }
    // Tampilkan Login Gate
    if (gate) gate.classList.remove('hidden');
    const clientId = this.authModal.getEffectiveClientId();
    if (clientId) {
      if (cidBox) cidBox.classList.add('hidden');
      this.authModal.renderGoogleButtonInto('gateGoogleButtonMount');
    } else if (cidBox) {
      cidBox.classList.remove('hidden');
    }
    if (btnSaveCid) {
      btnSaveCid.addEventListener('click', () => {
        const val = document.getElementById('inpManualGoogleClientId')?.value?.trim();
        if (val) {
          localStorage.setItem('xstarzg_google_client_id', val);
          if (cidBox) cidBox.classList.add('hidden');
          this.authModal.renderGoogleButtonInto('gateGoogleButtonMount');
        }
      });
    }
    if (btnGuest) {
      btnGuest.addEventListener('click', () => {
        this.enterWorkspace();
      });
    }
  }
  async enterWorkspace() {
    const gate = document.getElementById('loginGateScreen');
    const ws = document.getElementById('appWorkspaceWrapper');
    if (gate) gate.classList.add('hidden');
    if (ws) ws.classList.remove('hidden');
    if (!this.chartEngine.mainChart) {
      this.chartEngine.init();
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
    if (!this.bars.length) {
      await this.loadMarketWorkspace({ autoRunAnalysis: true });
      this.loadScanner('all');
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
  renderQuickTickerRibbon() {
    const ribbon = document.getElementById('quickTickerRibbon');
    if (!ribbon) return;
    const featured = [
      { symbol: 'BTC/USDT', assetClass: 'crypto', tag: 'CRYPTO' },
      { symbol: 'ETH/USDT', assetClass: 'crypto', tag: 'CRYPTO' },
      { symbol: 'SOL/USDT', assetClass: 'crypto', tag: 'CRYPTO' },
      { symbol: 'XAU/USD', assetClass: 'metals', tag: 'GOLD' },
      { symbol: 'XAG/USD', assetClass: 'metals', tag: 'SILVER' },
      { symbol: 'EUR/USD', assetClass: 'forex', tag: 'FOREX' },
      { symbol: 'USD/JPY', assetClass: 'forex', tag: 'FOREX' },
      { symbol: 'GBP/USD', assetClass: 'forex', tag: 'FOREX' },
      { symbol: 'WTI', assetClass: 'commodities', tag: 'OIL' },
      { symbol: 'BRENT', assetClass: 'commodities', tag: 'OIL' },
      { symbol: 'NATGAS', assetClass: 'commodities', tag: 'GAS' },
      { symbol: 'NVDA', assetClass: 'stocks', tag: 'STOCK' },
      { symbol: 'SPY', assetClass: 'stocks', tag: 'S&P500' },
      { symbol: 'QQQ', assetClass: 'stocks', tag: 'NASDAQ' },
      { symbol: 'AAPL', assetClass: 'stocks', tag: 'STOCK' },
      { symbol: 'TSLA', assetClass: 'stocks', tag: 'STOCK' }
    ];
    ribbon.innerHTML = featured
      .map(
        (f) => `
        <button type="button" class="ticker-pill ${f.symbol === this.symbol ? 'active' : ''}" data-symbol="${f.symbol}" data-asset="${f.assetClass}">
          <strong>${f.symbol}</strong>
          <span class="ticker-pill-tag">${f.tag}</span>
        </button>
      `
      )
      .join('');
    ribbon.querySelectorAll('.ticker-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sym = btn.getAttribute('data-symbol');
        const cls = btn.getAttribute('data-asset');
        this.selectInstrument(sym, cls);
      });
    });
  }
  bindWorkspaceControls() {
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
    document.querySelectorAll('#assetClassTabs .asset-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const nextFilter = tab.getAttribute('data-asset');
        document.querySelectorAll('#assetClassTabs .asset-tab').forEach((t) => {
          t.classList.toggle('active', t.getAttribute('data-asset') === nextFilter);
        });
        this.populateSymbolDropdown(nextFilter);
        const sel = document.getElementById('symbolSelect');
        if (sel && sel.value) {
          const found = getAllInstrumentsFlat().find((x) => x.symbol === sel.value);
          if (found) this.selectInstrument(found.symbol, found.assetClass, false);
        }
      });
    });
    const symSel = document.getElementById('symbolSelect');
    if (symSel) {
      symSel.addEventListener('change', (e) => {
        const val = e.target.value;
        const found = getAllInstrumentsFlat().find((x) => x.symbol === val);
        if (found) {
          this.selectInstrument(found.symbol, found.assetClass, false);
        }
      });
    }
    document.querySelectorAll('#timeframeBar .tf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        document.querySelectorAll('#timeframeBar .tf-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.timeframe = btn.getAttribute('data-tf');
        this.loadMarketWorkspace({ autoRunAnalysis: true });
      });
    });
    document.querySelectorAll('.overlay-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const key = btn.getAttribute('data-overlay');
        this.chartEngine.setOverlayVisibility(key, btn.classList.contains('active'));
      });
    });
    document.querySelectorAll('.osc-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.osc-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.chartEngine.setActiveOscillator(btn.getAttribute('data-osc'));
      });
    });
    const btnRun = document.getElementById('btnRunFullAnalysis');
    if (btnRun) {
      btnRun.addEventListener('click', () => this.runServerFullAnalysis());
    }
  }
  populateSymbolDropdown(filterClass = 'all', selectedSymbol = null) {
    this.assetFilter = filterClass;
    const sel = document.getElementById('symbolSelect');
    if (!sel) return;
    const groups =
      filterClass === 'all'
        ? [
            { label: 'CRYPTO (16 Instrumen)', items: DEFAULT_INSTRUMENTS.crypto },
            { label: 'FOREX (10 Pasangan Utama)', items: DEFAULT_INSTRUMENTS.forex },
            { label: 'METALS / LOGAM MULIA (4 Instrumen)', items: DEFAULT_INSTRUMENTS.metals },
            { label: 'COMMODITIES / ENERGI & PANGAN (6 Instrumen)', items: DEFAULT_INSTRUMENTS.commodities },
            { label: 'US STOCKS & INDICES (14 Emiten)', items: DEFAULT_INSTRUMENTS.stocks }
          ]
        : [
            {
              label: filterClass.toUpperCase(),
              items: DEFAULT_INSTRUMENTS[filterClass] || DEFAULT_INSTRUMENTS.crypto
            }
          ];
    sel.innerHTML = groups
      .map(
        (g) =>
          `<optgroup label="${g.label}">` +
          g.items.map((item) => `<option value="${item.symbol}">${item.symbol} — ${item.name}</option>`).join('') +
          `</optgroup>`
      )
      .join('');
    const firstSym = groups[0]?.items?.[0]?.symbol || 'BTC/USDT';
    this.symbol = selectedSymbol || firstSym;
    sel.value = this.symbol;
  }
  selectInstrument(symbol, assetClass, updateDropdown = true) {
    this.symbol = symbol;
    this.assetClass = assetClass || 'crypto';
    if (updateDropdown) {
      const sel = document.getElementById('symbolSelect');
      if (sel) {
        if (![...sel.options].some((o) => o.value === symbol)) {
          this.populateSymbolDropdown('all', symbol);
        } else {
          sel.value = symbol;
        }
      }
    }
    document.querySelectorAll('#quickTickerRibbon .ticker-pill').forEach((p) => {
      p.classList.toggle('active', p.getAttribute('data-symbol') === symbol);
    });
    const isRealtimeCapable = this.assetClass === 'crypto';
    this.enforceScalpingTimeframeLock(isRealtimeCapable);
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
        limit: 260
      });
      if (data && Array.isArray(data.bars) && data.bars.length > 0) {
        this.bars = data.bars;
        this.indicators = this.chartEngine.setCandles(this.bars);
        const lastBar = this.bars[this.bars.length - 1];
        const prevBar = this.bars[Math.max(0, this.bars.length - 2)];
        this.updatePriceHeader(lastBar.close, prevBar.close);
        const isRealtime = this.assetClass === 'crypto';
        this.enforceScalpingTimeframeLock(isRealtime);
        this.updateFeedBadges(
          data.feedStatus || (isRealtime ? 'REALTIME EDGE' : 'DELAYED 15M'),
          data.cacheAgeMinutes || 0,
          data.sourceExchange || 'INSTITUTIONAL FEED',
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
          document.getElementById('derivativesBar')?.classList.add('hidden');
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
    document.getElementById('derivativesBar')?.classList.remove('hidden');
    const d = await api.fetchCryptoDerivativesDirect(this.symbol);
    this.derivatives = d;
    const elFund = document.getElementById('valFundingRate');
    const elOi = document.getElementById('valOpenInterest');
    if (elFund) {
      const f = Number(d.fundingRatePct || 0.01);
      elFund.textContent = `${f >= 0 ? '+' : ''}${formatNumber(f, 4)}%`;
      elFund.className = `mh-stat-val ${f >= 0 ? 'text-bull' : 'text-bear'}`;
    }
    if (elOi) {
      elOi.textContent = d.openInterestUsd
        ? `$${formatNumber(d.openInterestUsd / 1e6, 2)}M`
        : 'PERP ACTIVE';
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
    if (elCache) elCache.textContent = `Cache ${cacheAgeMin || 0}m`;
    if (elExch) elExch.textContent = sourceExchange;
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
        bars: this.bars.slice(-260),
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