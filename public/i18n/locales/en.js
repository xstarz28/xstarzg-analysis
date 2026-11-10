export default {
  meta: {
    title: 'XSTARZG Analysis — Institutional Multi-Asset Quantitative Terminal'
  },
  nav: {
    brandName: 'XSTARZG',
    brandTag: 'ANALYSIS TERMINAL v2.0',
    systemOnline: 'QUANT ENGINE ONLINE',
    modeTrader: 'Trader Mode (2-Way)',
    modeInvestor: 'Spot Investor (Long-Only)',
    languageLabel: 'Language',
    loginGoogle: 'Google Login / Quota'
  },
  workspace: {
    assetCrypto: 'CRYPTO (10)',
    assetForex: 'FOREX (6)',
    assetMetals: 'METALS (2)',
    assetCommodities: 'COMMODITIES (4)',
    assetStocks: 'US STOCKS (8)',
    instrumentLabel: 'INSTRUMENT:',
    scalpingLockedNotice: '🔒 M1/M5/M15 Locked (Requires Real-Time Tick Feed)',
    fundingRate: 'Funding Rate (8h)',
    openInterest: 'Open Interest',
    overlaysLabel: 'OVERLAYS:',
    oscillatorLabel: 'OSCILLATOR:',
    telTrend: 'TREND & REGIME (ADX/EMA)',
    telMomentum: 'MOMENTUM (RSI/MACD/STOCH)',
    telVolatility: 'VOLATILITY (ATR / BB SQUEEZE)',
    telVwap: 'ANCHORED SESSION VWAP',
    telSmc: 'SMC STRUCTURE & VPVR POC',
    telDelta: 'ORDERFLOW DELTA & CVD'
  },
  signal: {
    panelTitle: 'QUANT DECISION & BACKTEST',
    runAnalysisBtn: '⚡ Full Analysis',
    idleTitle: 'Quantitative Decision Engine Ready',
    idleDesc: 'Click "Full Analysis" or select an instrument to evaluate the 5-Pillar Confluence and zero-lookahead Walk-Forward Backtest.',
    actionRecommendation: 'QUANTITATIVE DECISION',
    regimeLabel: 'MARKET REGIME',
    confluenceScoreLabel: 'CURRENT CONFLUENCE SCORE',
    confluenceNote: '5-Pillar factor alignment (Not win probability)',
    backtestWinRateLabel: 'HISTORICAL BACKTEST WIN RATE',
    executionLevels: 'EXECUTION & RISK LEVELS (ATR)',
    sendToCalc: 'Send to Calculator →',
    pillarsHeading: '5-PILLAR CONFLUENCE BREAKDOWN',
    backtestHeading: 'WALK-FORWARD BACKTEST AUDIT (NET OF FEES & SLIPPAGE)'
  },
  calc: {
    panelTitle: 'POSITION SIZING & RISK CALCULATOR',
    accountBalance: 'Account Capital (USD)',
    riskPerTrade: 'Risk per Trade (%)',
    entryPrice: 'Entry Price',
    stopLossPrice: 'Stop Loss Price',
    useAtrStop: 'Use 2x ATR',
    leverageLabel: 'Account Leverage (1x = Pure Spot)',
    posSizeUnits: 'Position Size (Units)',
    posNotional: 'Position Notional Value',
    maxLossUsd: 'Max Loss Risk (1R)',
    reqMargin: 'Required Margin',
    effectiveLev: 'Effective Leverage',
    estLiqPrice: 'Est. Liquidation Price'
  },
  fundamental: {
    panelTitle: 'FUNDAMENTAL, MACRO & SEC EDGAR INTELLIGENCE',
    panelSubtitle: 'Cross-Asset Valuation, SEC GAAP Balance Sheet, Interest Rate Policy & Institutional Positioning',
    refreshBtn: 'Refresh Data'
  },
  scanner: {
    panelTitle: 'MULTI-ASSET CONFLUENCE SCANNER & TOP RANKED SETUPS'
  },
  disclaimer: {
    footerPersistent: 'RISK WARNING & DISCLAIMER (NOT FINANCIAL ADVICE): All quantitative signals, confluence scores, and walk-forward backtest statistics on XSTARZG Analysis are provided strictly for algorithmic research and educational purposes. Past performance does not guarantee future results.',
    modalTitle: '⚠️ QUANTITATIVE RISK DISCLOSURE & NOT FINANCIAL ADVICE',
    modalBody1: 'Welcome to the <strong>XSTARZG Analysis</strong> Multi-Asset Quantitative Terminal. Before proceeding, please acknowledge the following:',
    modalPoint1: '<strong>Not Financial Advice:</strong> All mathematical outputs, Entry/SL/TP levels, and backtest simulations are for educational and research purposes only.',
    modalPoint2: '<strong>Confluence Score vs. Win Rate Separation:</strong> Confluence Score (0-100) measures current indicator alignment and is NOT win probability. Historical win rate is evaluated separately via Walk-Forward Backtesting net of transaction fees and slippage.',
    modalPoint3: '<strong>Data Source Transparency:</strong> Crypto instruments stream real-time exchange data, while Non-Crypto instruments use honestly labeled EOD/Delayed/ETF Proxy feeds.',
    modalAcceptBtn: 'I Understand the Risks & Agree to Proceed',
    signalCardNote: '⚠️ Not Financial Advice: Entry/SL/TP levels are algorithmically derived from ATR(14) volatility and historical structure.'
  },
  footer: {
    copyright: '© 2026 XSTARZG Analysis. All rights reserved.',
    architecture: 'Zero-Lookahead Quantitative Engine v2.0'
  }
};