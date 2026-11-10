export default {
  meta: {
    title: 'XSTARZG Analysis — Terminal Kuantitatif Multi-Aset Institusional'
  },
  nav: {
    brandName: 'XSTARZG',
    brandTag: 'ANALYSIS TERMINAL v2.0',
    systemOnline: 'QUANT ENGINE ONLINE',
    modeTrader: 'Mode Trader (2-Arah)',
    modeInvestor: 'Spot Investor (Long-Only)',
    languageLabel: 'Bahasa',
    loginGoogle: 'Login Google / Kuota'
  },
  workspace: {
    assetCrypto: 'CRYPTO (10)',
    assetForex: 'FOREX (6)',
    assetMetals: 'METALS (2)',
    assetCommodities: 'COMMODITIES (4)',
    assetStocks: 'US STOCKS (8)',
    instrumentLabel: 'INSTRUMEN:',
    scalpingLockedNotice: '🔒 M1/M5/M15 Dikunci (Khusus Feed Real-Time Tick)',
    fundingRate: 'Funding Rate (8j)',
    openInterest: 'Open Interest',
    overlaysLabel: 'OVERLAY:',
    oscillatorLabel: 'OSILATOR:',
    telTrend: 'TREND & REGIME (ADX/EMA)',
    telMomentum: 'MOMENTUM (RSI/MACD/STOCH)',
    telVolatility: 'VOLATILITAS (ATR / BB SQUEEZE)',
    telVwap: 'ANCHORED SESSION VWAP',
    telSmc: 'STRUKTUR SMC & VPVR POC',
    telDelta: 'ORDERFLOW DELTA & CVD'
  },
  signal: {
    panelTitle: 'KEPUTUSAN QUANT & BACKTEST',
    runAnalysisBtn: '⚡ Analisis Penuh',
    idleTitle: 'Mesin Keputusan Kuantitatif Siap',
    idleDesc: 'Klik tombol "Analisis Penuh" atau pilih instrumen untuk menjalankan evaluasi 5-Pilar Konfluensi beserta simulasi Walk-Forward Backtest tanpa Look-Ahead Bias.',
    actionRecommendation: 'KEPUTUSAN KUANTITATIF',
    regimeLabel: 'MARKET REGIME',
    confluenceScoreLabel: 'SKOR KONFLUENSI SAAT INI',
    confluenceNote: 'Keselarasan 5-Pilar saat ini (Bukan probabilitas menang)',
    backtestWinRateLabel: 'WIN RATE BACKTEST HISTORIS',
    executionLevels: 'LEVEL EKSEKUSI & MANAJEMEN RISIKO (ATR)',
    sendToCalc: 'Salin ke Kalkulator →',
    pillarsHeading: 'RINCIAN SKOR 5-PILAR KONFLUENSI',
    backtestHeading: 'AUDIT WALK-FORWARD BACKTEST (NET OF FEES & SLIPPAGE)'
  },
  calc: {
    panelTitle: 'KALKULATOR UKURAN POSISI & RISIKO',
    accountBalance: 'Modal Akun (USD)',
    riskPerTrade: 'Risiko per Trade (%)',
    entryPrice: 'Harga Entry',
    stopLossPrice: 'Harga Stop Loss',
    useAtrStop: 'Gunakan 2x ATR',
    leverageLabel: 'Leverage Akun (1x = Spot Murni)',
    posSizeUnits: 'Ukuran Posisi (Unit)',
    posNotional: 'Nilai Nosional Posisi',
    maxLossUsd: 'Risiko Kerugian Maks (1R)',
    reqMargin: 'Margin Dibutuhkan',
    effectiveLev: 'Leverage Efektif',
    estLiqPrice: 'Est. Harga Likuidasi'
  },
  fundamental: {
    panelTitle: 'INTELIJEN FUNDAMENTAL, MAKRO & SEC EDGAR',
    panelSubtitle: 'Valuasi Lintas-Aset, Neraca Keuangan GAAP SEC, Kebijakan Suku Bunga & Posisioning Institusional',
    refreshBtn: 'Muat Ulang Data'
  },
  scanner: {
    panelTitle: 'PEMINDAI KONFLUENSI MULTI-ASET & PERINGKAT SETUP TERBAIK'
  },
  disclaimer: {
    footerPersistent: 'PERINGATAN RISIKO & PENOLAKAN TANGGUNG JAWAB (BUKAN SARAN KEUANGAN): Seluruh sinyal kuantitatif, skor konfluensi, dan statistik backtest walk-forward di XSTARZG Analysis disediakan murni untuk tujuan riset algoritmik dan edukasi. Kinerja masa lalu tidak menjamin hasil di masa depan.',
    modalTitle: '⚠️ PERNYATAAN RISIKO KUANTITATIF & BUKAN SARAN KEUANGAN',
    modalBody1: 'Selamat datang di Terminal Kuantitatif Multi-Aset <strong>XSTARZG Analysis</strong>. Sebelum menggunakan sistem ini, Anda wajib memahami dan menyetujui ketentuan berikut:',
    modalPoint1: '<strong>Bukan Penasihat Keuangan:</strong> Seluruh output matematis, level Entry/SL/TP, dan simulasi backtest bukanlah ajakan membeli atau menjual instrumen keuangan apa pun.',
    modalPoint2: '<strong>Pemisahan Skor Konfluensi & Win Rate:</strong> Skor Konfluensi (0-100) mengukur keselarasan indikator saat ini dan BUKAN probabilitas kemenangan. Probabilitas historis diukur secara terpisah melalui Walk-Forward Backtest setelah dikurangi estimasi biaya transaksi & slippage.',
    modalPoint3: '<strong>Transparansi Sumber Data:</strong> Instrumen Kripto terhubung secara Real-Time ke bursa publik, sedangkan instrumen Non-Kripto menggunakan kuota EOD/Delayed/ETF Proxy yang dilabeli secara jujur pada layar.',
    modalAcceptBtn: 'Saya Memahami Risiko & Setuju Melanjutkan',
    signalCardNote: '⚠️ Bukan Saran Keuangan: Level Entry/SL/TP dihitung secara algoritmik dari volatilitas ATR(14) dan struktur historis.'
  },
  footer: {
    copyright: '© 2026 XSTARZG Analysis. Seluruh hak cipta dilindungi.',
    architecture: 'Zero-Lookahead Quantitative Engine v2.0'
  }
};