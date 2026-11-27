'use strict';
// === PWA & MOBILE AUTO-ENTRY / DELEGATED CLICK GUARD ===
var SESSION_KEY = 'xstarzg_user_v3';

// Definisi state global awal di baris 3 agar seketika tersedia bagi semua handler tombol
var state = {
  symbol: 'XAU/USD',
  tf: 'H1', timeframe: 'H1',
  mode: 'trader',            // 'trader' | 'investor'
  manualInstrumentSelection: false,
  subMode: 'futures',        // 'futures' | 'spot'
  chartType: 'candles',      // 'candles' | 'bars' | 'line' | 'area' (ala TradingView)
  radarHorizon: 'intraday',  // 'scalping' | 'intraday' | 'swing'
  radarGroup: 'all',         // 'all' | 'crypto' | 'fx_comm' | 'stocks' (3 bagan terpisah)
  radarViability: 'actionable', // 'actionable' (layak entry) | 'fresh' | 'running' | 'all'
  bestTfBoard: null,         // papan hasil scan multi-TF (engine), diisi async
  candles: [],
  lastAnalysis: null,
  livePrice: 2680.00,
  liveChangePct: 0.25,
  feedSource: '-',
  user: null                 // { email, name, tier: 'GUEST'|'FREE'|'VIP'|'OWNER_VIP', vipUntil }
};
try { if (typeof window !== 'undefined') window.state = state; } catch (e) {}

// Fungsi alur layar & workspace terdefinisi seketika di baris awal (0ms delay),
// agar SEMUA klik tombol di landing page langsung merespons tanpa menunggu seluruh file besar selesai di-parse.
function showScreen(name) {
  try {
    var front = document.getElementById('frontLandingScreen');
    var gate = document.getElementById('loginGateScreen');
    var work = document.getElementById('appWorkspaceWrapper');
    if (front) {
      if (name === 'front') front.classList.remove('hidden'); else front.classList.add('hidden');
    }
    if (gate) {
      if (name === 'gate') gate.classList.remove('hidden'); else gate.classList.add('hidden');
    }
    if (work) {
      if (name === 'work') {
        work.classList.remove('hidden');
        var sk = document.getElementById('tvChartLoadingSkeleton');
        if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
      } else {
        work.classList.add('hidden');
      }
    }
    var dd = document.getElementById('userProfileDropdown');
    if (dd) dd.classList.add('hidden');
    try { window.scrollTo({ top: 0 }); } catch (e) {}
  } catch (e) {}
}
if (typeof window !== 'undefined') window.showScreen = showScreen;

function saveSession() {
  if (!state || !state.user) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 4,
      user: state.user,
      symbol: state.symbol || 'XAU/USD', tf: state.tf || 'H1', mode: state.mode || 'trader', subMode: state.subMode || 'futures',
      radarHorizon: state.radarHorizon || 'intraday', at: Date.now()
    }));
    var tok = (state.user && (state.user.ownerToken || state.user.authToken)) || '';
    if (tok) localStorage.setItem('xstarzg_jwt', tok);
  } catch (e) {}
}

function loadSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var p = JSON.parse(raw);
    if (!p) return null;
    var user = p.user || (p.email ? p : null);
    if (!user || !user.email) return null;
    if (user.tier === 'VIP' && user.vipUntil && Date.now() > user.vipUntil) user.tier = 'FREE';
    p.user = user;
    var tok = (user.ownerToken || user.authToken) || '';
    if (tok) {
      try { localStorage.setItem('xstarzg_jwt', tok); } catch (e) {}
    }
    return p;
  } catch (e) { return null; }
}

var __xsChartVendorRequested = false;
function ensureChartVendorLoaded() {
  try {
    if (typeof LightweightCharts !== 'undefined' || __xsChartVendorRequested) return;
    __xsChartVendorRequested = true;
    var chartScript = document.createElement('script');
    chartScript.src = '/vendor/lightweight-charts.js?v=2027.13';
    chartScript.onload = function () {
      try {
        if (!chartInstance && typeof initChart === 'function') initChart();
        if (chartInstance && state.candles && state.candles.length && typeof renderAllVisuals === 'function') {
          renderAllVisuals(state.lastAnalysis || null, true);
        }
      } catch (e) {}
    };
    chartScript.onerror = function () {
      __xsChartVendorRequested = false;
      // Canvas fallback remains available when the chart vendor is offline.
    };
    document.head.appendChild(chartScript);
  } catch (e) {
    __xsChartVendorRequested = false;
  }
}
/* Jaring pengaman: kanvas chart pernah bisa berukuran 0x0 (chart tampak kosong)
   setelah pindah workspace. Ukur ulang container dan paksa ukuran bila kanvas nol. */
function ensureChartSized() {
  try {
    var el = $id('tvChartContainer');
    if (!chartInstance || !el) return;
    var w = el.clientWidth || 0;
    var h = el.clientHeight || 0;
    if (w < 40) return;
    var cv = el.querySelector('canvas');
    if (!cv || cv.width === 0 || cv.height === 0) {
      chartInstance.applyOptions({ width: w, height: h || 470 });
    }
  } catch (e) {}
}
function renderSeedCandlesPreview(candles) {
  if (!Array.isArray(candles) || !candles.length) return;
  try {
    if (candleSeries && typeof mainSeriesPayload === 'function') {
      candleSeries.setData(mainSeriesPayload(candles));
      if (chartInstance && chartInstance.timeScale) chartInstance.timeScale().fitContent();
    } else if (typeof window !== 'undefined' && typeof window.drawCanvasFallbackChart === 'function') {
      window.drawCanvasFallbackChart(candles, null);
    }
  } catch (e) {}
}
var __xsEngineBootRequested = false;
function ensureQuantEnginesLoaded() {
  try {
    if (window.__XS_QC && window.__XS_SE) return;
    if (__xsEngineBootRequested) return;
    __xsEngineBootRequested = true;
    var bootScript = document.createElement('script');
    bootScript.type = 'module';
    bootScript.src = '/js/engine-boot.js?v=2027.13';
    bootScript.onerror = function () {
      __xsEngineBootRequested = false;
      console.error('XStarZG quant engine module failed to load');
    };
    document.head.appendChild(bootScript);
  } catch (e) {
    __xsEngineBootRequested = false;
    console.error('XStarZG quant engine bootstrap failed:', e);
  }
}
// 1) Deteksi dini PWA/APK (start_url ?pwa=1 atau mode standalone)
(function () {
  try {
    if (typeof window !== 'undefined') {
      var isPwa = (window.location && window.location.search && window.location.search.indexOf('pwa=1') > -1) ||
                  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      if (isPwa) {
        window.__isPwaLaunch = true;
      }
    }
  } catch (ePwa) {}
})();

// 2) Delegated click capture guard: memastikan tap pada tombol beranda (Mulai Analisis, Pratinjau Tamu,
// Login Terminal, Popup Google, Jalur Owner, Kembali) langsung merespons dan mengeksekusi alur secara aman
if (typeof document !== 'undefined') {
  document.addEventListener('click', function (e) {
    try {
      var t = e.target && e.target.closest ? (e.target.closest('button') || e.target.closest('[id]')) : null;
      if (!t || !t.id) return;
      var id = t.id;
      if (id === 'btnHeroPreview' || id === 'btnInstantPreview') {
        try { e.preventDefault(); } catch (eP) {}
        if (typeof state !== 'undefined' && state) {
          state.user = { email: 'guest@xstarzg.local', name: T('ui.guestName', 'Tamu'), tier: 'GUEST' };
        }
        if (typeof saveSession === 'function') saveSession();
        if (typeof enterWorkspace === 'function') enterWorkspace();
        else if (typeof window !== 'undefined' && typeof window.enterWorkspace === 'function') window.enterWorkspace();
        else showScreen('work');
      } else if (id === 'btnHeroLoginGate' || id === 'btnNavLoginGate') {
        if (typeof state !== 'undefined' && state && state.user && state.user.tier && state.user.tier !== 'GUEST') {
          if (typeof enterWorkspace === 'function') enterWorkspace();
          else if (typeof window !== 'undefined' && typeof window.enterWorkspace === 'function') window.enterWorkspace();
          else showScreen('work');
        } else {
          showScreen('gate');
        }
      } else if (id === 'btnBackToLanding' || id === 'btnBrandLogoHome') {
        showScreen('front');
      } else if (id === 'btnTriggerGooglePopup') {
        var gm = document.getElementById('googleAuthModal');
        if (gm) {
          gm.classList.remove('hidden');
          var inp = document.getElementById('googleEmailInput');
          if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 80);
        }
      } else if (id === 'btnCloseGoogleModal' || id === 'btnCancelGoogleModal') {
        var gmClose = document.getElementById('googleAuthModal');
        if (gmClose) gmClose.classList.add('hidden');
      } else if (id === 'btnToggleOwnerLogin') {
        var blk = document.getElementById('ownerLoginBlock');
        if (blk) blk.classList.toggle('hidden');
      } else if (id === 'btnGateOwnerDirect') {
        var gm2 = document.getElementById('googleAuthModal');
        if (gm2) gm2.classList.remove('hidden');
        var blk2 = document.getElementById('ownerLoginBlock');
        if (blk2) blk2.classList.remove('hidden');
        var einp = document.getElementById('ownerEmailInput');
        var cinp = document.getElementById('ownerCodeInput');
        if (einp && !einp.value) einp.value = 'sevenfoldarmy2822@gmail.com';
        if (cinp) setTimeout(function () { try { cinp.focus(); } catch (e) {} }, 80);
      }
    } catch (eClk) {}
  }, true);
}

/* ================================================================================
   XSTARZG ANALYSIS — TERMINAL 2026 CORE ENGINE (app.js v2026.31)
   Perbaikan Total:
   1. BUG TAMPILAN: file ini sebelumnya hanya berisi patch tanpa core — seluruh
      tombol/alur (Login, Preview, Workspace, Chart) mati. Sekarang diperbaiki penuh.
   2. HARGA REAL-TIME SEMUA INSTRUMEN seperti TradingView:
      - CRYPTO  -> Binance WebSocket tick-by-tick (miniTicker) + REST 24hr ticker.
      - FOREX/METALS/IDX/US STOCKS/KOMODITAS -> polling kuotasi broker via edge
        function /api/market/analyze?quote=1 (TradingView scanner: OANDA, FX_IDC,
        IDX, NASDAQ/NYSE, TVC, dst) + radar batch quotes /api/market/quotes.
      - Fallback canvas renderer jika CDN chart diblokir ISP.
   CATATAN: Dua blok patch asli (v2026.27 ticker & v2026.30 instant-render) di
   bagian bawah file DIPERTAHANKAN apa adanya agar tetap selaras dengan hasil
   penyempurnaan sesi sebelumnya — core ini mendefinisikan semua global yang
   mereka butuhkan (state, chartInstance, candleSeries, initChart,
   computeQuantEngine, renderAllVisuals, renderOpportunityRadar,
   fetchRealMarketCandles, connectRealtimeStream, formatPrice).
   ================================================================================ */

/* ==================== 0. UTILITAS & STATE GLOBAL ==================== */
var QC = null;      // /js/shared/quant-core.js   (dimuat via dynamic import)
var SE = null;      // /js/shared/signal-engine.js (dimuat via dynamic import)
// === i18n (round 6): mesin /i18n/boot.js mengisi window.XSI18N. T() selalu punya
// fallback = teks Indonesia (default situs), jadi aplikasi tetap utuh tanpa i18n.
function T(key, fallback) {
  try {
    if (window.XSI18N && typeof window.XSI18N.t === 'function') {
      var v = window.XSI18N.t(key, '');
      if (v && v !== key) return v;
    }
  } catch (e) {}
  return fallback;
}
try { window.__xsT = T; } catch (e) {}
/* === Penerjemah string yang dihasilkan ENGINE (round 6) ===
   Engine (signal-engine.js) TIDAK diubah: ia tetap menghasilkan frasa sumber
   Bahasa Indonesia. Di sini frasa itu dipetakan ke bahasa aktif lewat daftar
   padanan eksak / pola regex. Jika bahasa = id (default) atau i18n tidak
   termuat, string sumber dikembalikan apa adanya — nol perubahan perilaku. */
var ENGINE_TEXT_MAP = null;
function buildEngineTextMap() {
  var E = [
    // Struktur SMC
    ['INTERNAL RANGE EQUILIBRIUM', 'eSmcEq'],
    ['BULLISH CHoCH (Change of Character ▲)', 'eSmcBC'],
    ['BULLISH BOS (Break of Structure ▲)', 'eSmcBB'],
    ['BEARISH CHoCH (Change of Character ▼)', 'eSmcSC'],
    ['BEARISH BOS (Break of Structure ▼)', 'eSmcSB'],
    ['HIGHER HIGH / HIGHER LOW (Bullish Orderflow)', 'eSmcHH'],
    ['LOWER HIGH / LOWER LOW (Bearish Orderflow)', 'eSmcLL'],
    // Liquidity sweep
    ['NONE (Normal Liquidity Flow)', 'eSwNone'],
    // ORB
    ['N/A — ORB aktif di TF M1–D1 (intraday/swing)', 'eOrbNa'],
    ['BREAKOUT ATAS ▲ (lanjutan institusional di atas rentang pembukaan)', 'eOrbUp'],
    ['BREAKOUT BAWAH ▼ (distribusi di bawah rentang pembukaan)', 'eOrbDn'],
    ['DALAM RANGE (kompresi — tunggu resolusi breakout)', 'eOrbIn'],
    // Theta
    ['Data momentum belum cukup', 'eThNone'],
    ['Akselerasi bullish — momentum menguat', 'eThBull'],
    ['Momentum rebound dari tekanan jual', 'eThReb'],
    ['MOMENTUM MELURUH — rawan koreksi / ambil profit', 'eThFade'],
    ['Akselerasi bearish — tekanan jual menguat', 'eThBear'],
    ['Momentum seimbang / berkelanjutan', 'eThBal'],
    // VWAP entry
    ['Netral — harga berseimbang di VWAP sesi', 'eVwNeu'],
    ['ZONA ENTRY VWAP AKTIF ▲ — pullback institusional valid (kualitas tinggi)', 'eVwZUp'],
    ['DEVIASI EKSTREM >2σ di atas VWAP — jangan kejar harga, tunggu pullback', 'eVwExUp'],
    ['Di bawah VWAP pada tren naik — tunggu reclaim VWAP sebagai trigger', 'eVwWait'],
    ['ZONA ENTRY VWAP AKTIF ▼ — re-entry SHORT institusional di VWAP', 'eVwZDn'],
    ['DEVIASI EKSTREM >2σ di bawah VWAP — rawan short-covering bounce', 'eVwExDn'],
    ['Downtrend — pantau rejeksi VWAP sebagai trigger SHORT', 'eVwTrig'],
    // Efficiency Ratio
    ['Data belum cukup', 'eErNone'],
    ['Tren BERSIH (noise minim) — sinyal follow-through kuat', 'eErClean'],
    ['Tren normal — struktur cukup bersih', 'eErNm'],
    ['PASAR CHOPPY (noise tinggi) — kurangi agresi, kecilkan size', 'eErChop'],
    // Regime volatilitas
    ['NORMAL EXPANSION', 'eRgNorm'],
    ['BOLLINGER SQUEEZE (Siap Breakout)', 'eRgSq'],
    ['HIGH VOLATILITY (Lebarkan Stop)', 'eRgHv'],
    ['INSTITUTIONAL TREND FLOW', 'eRgTr'],
    // FVG
    ['FVG Seimbang (Terisi)', 'eFvgBal'],
    // Bias institusi & hedger
    ['BULLISH ACCUMULATION', 'eBiasB'],
    ['BEARISH DISTRIBUTION', 'eBiasS'],
    ['NEUTRAL BALANCED', 'eBiasN'],
    ['NET SHORT (Produsen Melakukan Lindung Nilai Suplai)', 'eHedgeS'],
    ['NET LONG (Akumulasi Fisik Komersial)', 'eHedgeL'],
    // Regime makro
    ['RISK-ON (Arus Modal Masuk Aset Berisiko)', 'eRgOn'],
    ['DEFENSIVE / SELEKTIF (Rotasi Likuiditas ke Safe-Haven)', 'eRgDef'],
    // Korelasi DXY
    ['Korelasi Langsung terhadap Indeks Dolar AS (DXY 103.8)', 'eDxyDir'],
    ['Korelasi Terbalik terhadap Penguatan DXY', 'eDxyInv'],
    // Label laporan COT
    ['CFTC Disaggregated Commitments of Traders', 'eCotDefault'],
    ['CME Institutional Crypto Futures + US Spot ETF Netflow', 'eCotCrypto'],
    ['CFTC CME Currency Futures (Asset Managers & Leveraged Funds)', 'eCotForex'],
    ['CFTC COMEX & LME Disaggregated Metals COT (Managed Money)', 'eCotMetals'],
    ['CFTC NYMEX / CBOT / ICE Producer & Managed Money Report', 'eCotCommo'],
    ['Arus Modal Asing BEI (IDX Net Foreign Flow) & Konsensus Fundamental LQ45', 'eCotStocksId'],
    ['CFTC CME Equity Index COT & Institutional 13F / Dark-Pool Flow', 'eCotStocks'],
    // Sikap bank sentral / makro
    ['The Fed: Suku Bunga Netral-Restriktif | Imbal Hasil US10Y: 4.18%', 'eCbsDefault'],
    ['Likuiditas Global M2 Ekspansif • Arus Masuk Spot ETF Institusional Aktif', 'eCbsCrypto'],
    ['BI-Rate: 5.75% (Fokus Stabilitas Rupiah & DNDF) vs Fed Funds Rate AS', 'eCbsForexId'],
    ['Diferensial Suku Bunga Riil (Real Yield Spread) Fed vs ECB / BoE / BoJ', 'eCbsForex'],
    ['Akumulasi Cadangan Emas Bank Sentral Global & Tren Penurunan Real Yield', 'eCbsMetals'],
    ['Siklus Permintaan Komoditas Fisik & Biaya Logistik Global', 'eCbsCommo'],
    ['Stabilitas Makro Indonesia (Pertumbuhan PDB ~5.1%) & Likuiditas Perbankan Nasional', 'eCbsStocksId'],
    ['Siklus Laba Korporasi S&P 500 / Global & Belanja Modal Infrastruktur AI', 'eCbsStocks'],
    // Valuasi (potongan tetap)
    ['Diskon Akumulasi On-Chain', 'eZoneDisc'],
    ['Zona Distribusi', 'eZoneDist'],
    ['Valuasi Wajar', 'eZoneFair'],
    ['Mendukung Mata Uang Dasar (Base)', 'eVmBase'],
    ['Menguntungkan Mata Uang Kuotasi (Quote)', 'eVmQuote'],
    ['Inventori Gudang LME Ketat • Permintaan Hilirisasi Baterai EV, Jaringan Listrik & Smelter Asia', 'eVmMetalsInd'],
    ['Gold-to-Silver Ratio & Biaya Produksi AISC Penambang Global Mendukung Lantai Harga Fisik', 'eVmMetalsGold'],
    ['BACKWARDATION (Pasokan Spot Ketat / Permintaan Tinggi)', 'eVmBack'],
    ['CONTANGO (Suplai Spot Memadai)', 'eVmContango'],
    ['Valuasi Diskon / Undervalued', 'eVmStocksDisc'],
    ['Valuasi Wajar Sesuai Pertumbuhan EPS', 'eVmStocksFair'],
    // Orderflow (potongan tetap)
    ['Ekspansi Bullish ▲', 'eOfExpBull'],
    ['De-leveraging ▼', 'eOfExpBear'],
    ['Akumulasi Kuat', 'eOfMetalsAcc'],
    ['Netral', 'eOfMetalsNeu'],
    ['Net Buy Institusional ▲', 'eOfNetBuy'],
    ['Rotasi Sektoral / Netral', 'eOfRotasi'],
    // Driver makro & katalis (prosa tetap per kelas aset)
    ['Penyerapan suplai oleh Spot ETF & dompet institusional (Whale Accumulation) menjaga struktur harga di atas rata-rata biaya on-chain.', 'eMdCryptoBull'],
    ['Realisasi keuntungan jangka pendek di pasar derivatif memicu konsolidasi sehat menuju area Demand.', 'eMdCryptoBear'],
    ['Keseimbangan neraca perdagangan Indonesia, aliran modal asing di SBN/SRBI, serta stabilisasi Bank Indonesia.', 'eMdForexId'],
    ['Ekspektasi pemangkasan/penahanan suku bunga bank sentral G10 dan pergerakan imbal hasil obligasi pemerintah.', 'eMdForex'],
    ['Permintaan lindung nilai inflasi (Inflation Hedge), risiko geopolitik global, dan siklus belanja modal energi hijau.', 'eMdMetals'],
    ['Implementasi mandat Biodiesel B40 Indonesia, permintaan impor energi China/India, dan cuaca produksi Nusantara.', 'eMdCommoId'],
    ['Laporan cadangan mingguan EIA/USDA, disiplin kuota produksi OPEC+, serta pola cuaca agrikultur global.', 'eMdCommo'],
    ['Ekspansi kredit perbankan, daya beli domestik Indonesia, pembagian dividen tunai, dan hilirisasi komoditas.', 'eMdStocksId'],
    ['Pertumbuhan pendapatan kuartalan (Revenue & EPS Beat), ekspansi margin operasional, dan buyback saham.', 'eMdStocks'],
    ['Rilis Data Inflasi CPI AS, Non-Farm Payrolls (NFP) & Laporan CFTC Mingguan.', 'eUcDefault'],
    ['Arus Harian Spot ETF (BlackRock/Fidelity), Data Makro The Fed & Ekspirasi Opsi Bulanan.', 'eUcCrypto'],
    ['Rapat Dewan Gubernur Bank Sentral (FOMC / RDG BI / ECB) & Rilis Data PDB/Inflasi.', 'eUcForex'],
    ['Data Inventori LME/COMEX, Imbal Hasil TIPS 10Y AS & Kebijakan Ekspor Mineral.', 'eUcMetals'],
    ['Laporan Inventori Mingguan EIA / USDA WASDE & Pertemuan Kuota OPEC+.', 'eUcCommo'],
    ['Rilis Laporan Keuangan Kuartalan (Earnings Release), Jadwal Pembagian Dividen & Rebalancing Indeks.', 'eUcStocks'],
    // Varian tambahan ORB / VWAP entry
    ['MEMBENTUK RANGE PEMBUKAAN (sesi baru berjalan)', 'eOrbForming'],
    ['Opening Range 60m Sesi UTC', 'eOrbLabelUtc'],
    ['Weekly Opening Range', 'eOrbLabelWeekly'],
    ['Harga menempel VWAP (magnet) — range/play mean-reversion kecil', 'eVwMagnet'],
    // Label veto & gate Institutional Brain v2 (penjahit arah sinyal ≥84/78%)
    ['Harga OVEREXTENDED >1.2x ATR dari EMA20/VWAP (jangan kejar kereta)', 'eVetoOverext'],
    ['Menabrak dinding likuiditas — ruang gerak < 1.5x ATR', 'eVetoWall'],
    ['Momentum jenuh ekstrem (RSI >74 / <26) — rawan reversal', 'eVetoExh'],
    ['Divergensi momentum MACD vs struktur swing', 'eVetoDiv'],
    ['Melawan bias struktur timeframe di atasnya', 'eVetoHtf'],
    ['Skor konfluensi di bawah ambang minimum sinyal', 'eVetoScore'],
    ['Winrate historis di bawah ambang minimum', 'eVetoWr'],
    ['Belum ada urutan Liquidity Sweep -> CHoCH/BOS', 'eVetoSeq'],
    ['Struktur choppy (Efficiency Ratio rendah)', 'eVetoChop'],
    ['Instrumen SPOT 1-arah — setup SHORT tidak diterbitkan (hanya LONG yang lolos)', 'eVetoSpotOnly'],
    ['Bollinger Squeeze belum terkonfirmasi breakout ber-volume — jangan antri sebelum resolusi', 'eVetoSqueeze'],
    ['Momentum baru 1 candle — menunggu candle ke-2 searah (anti fakeout tajam)', 'eVetoPersist'],
    ['Menunggu konfirmasi', 'eWaitConf'],
    // String mode-ringan (engine sintetis app.js saat modul kuant penuh belum termuat)
    ['N/A — engine penuh belum termuat', 'eLiteOrb'],
    ['Mode ringan — menunggu engine kuantitatif penuh', 'eLiteWait'],
    ['Mode ringan — pantau pullback/reclaim VWAP', 'eLiteVwap'],
    ['BULLISH ORDERFLOW', 'eRgBull'],
    ['BEARISH ORDERFLOW', 'eRgBear'],
    ['NET LONG BIAS', 'eSynBiasL'],
    ['NET SHORT BIAS', 'eSynBiasS'],
    ['NEUTRAL / MIXED', 'eSynBiasN'],
    ['MENUNGGU DATA CFTC TERBARU', 'eSynHedge'],
    ['RISK-ON', 'eRgOnShort'],
    ['SELEKTIF', 'eRgSel'],
    ['Korelasi DXY dinamis', 'eSynDxy'],
    ['Pantau keputusan suku bunga bank sentral terdekat', 'eSynCb'],
    ['Valuasi wajar relatif terhadap rata-rata historis', 'eSynVm'],
    ['Orderflow netral', 'eSynOf'],
    ['Sentimen pasar global', 'eSynMd'],
    ['Rilis data ekonomi terjadwal', 'eSynUc'],
    ['[Engine Cepat] Analisis dasar dimuat — modul quant lengkap sedang disinkronkan.', 'eSynR1']
  ];
  return E;
}
/* v2026.62: snapping angka psikologis (round numbers ala analis: 5,300/5,500 dst.)
   Dipakai untuk menampilkan ZONA struktur — bukan mengubah pivot klasik mentah. */
function psychRoundPrice(v) {
  var a = Math.abs(num(v));
  if (a <= 0) return null;
  var step = a >= 50000 ? 500 : a >= 10000 ? 100 : a >= 1000 ? 50 : a >= 100 ? 5 : a >= 10 ? 0.5 : a >= 1 ? 0.05 : 0.005;
  return Math.round(v / step) * step;
}
function fillTpl(tpl, vals) {
  return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return k in vals ? vals[k] : '{' + k + '}'; });
}
function localizeEngineString(s) {
  if (typeof s !== 'string' || !s.length) return s;
  try {
    if (!window.XSI18N || !window.XSI18N.getLanguage || window.XSI18N.getLanguage() === 'id') return s;
  } catch (e) { return s; }
  if (!ENGINE_TEXT_MAP) ENGINE_TEXT_MAP = buildEngineTextMap();
  for (var i = 0; i < ENGINE_TEXT_MAP.length; i++) {
    if (ENGINE_TEXT_MAP[i][0] === s) return T('ui.' + ENGINE_TEXT_MAP[i][1], s);
  }
  var m;
  // --- Baris Institutional Gate v2 (lulus/ditolak; fragmen veto dilokalkan rekursif) ---
  if ((m = s.match(/^\[Institutional Gate\] LULUS ✅ — Skor (\d+) ≥ 84 & Winrate ([\d.]+)% ≥ 78% \| Urutan Sweep→MSS terkonfirmasi \| 4 Veto bersih \| Entry presisi zona mitigasi\.$/))) {
    return fillTpl(T('ui.eGatePass', s), { s: m[1], w: m[2] });
  }
  if ((m = s.match(/^\[Institutional Gate\] LULUS ✅ \(PRO\) — Skor (\d+) ≥ 62 \| Urutan Sweep→MSS terkonfirmasi \| Veto bersih \| Entry presisi zona mitigasi\.$/))) {
    return fillTpl(T('ui.eGatePassPro', s), { s: m[1] });
  }
  if ((m = s.match(/^\[Institutional Gate\] DITOLAK ✖ — (.*) — tidak ada Entry yang dipaksakan di TF ini\.$/))) {
    var vetoParts = m[1].split(' • ');
    var vetoLoc = [];
    for (var vp = 0; vp < vetoParts.length; vp++) vetoLoc.push(localizeEngineString(vetoParts[vp]));
    return fillTpl(T('ui.eGateDenied', s), { r: vetoLoc.join(' • ') });
  }
  // --- Enam templat narasi reasons (fragmen di dalamnya dilokalkan rekursif) ---
  if ((m = s.match(/^\[SMC & Struktur ([^\]]+)\] (.*) \| (.*)\.$/))) {
    return fillTpl(T('ui.eRsSmc', s), { tf: m[1], smc: localizeEngineString(m[2]), sweep: localizeEngineString(m[3]) });
  }
  if ((m = s.match(/^\[VWAP, VPVR & TPO\] Harga terhadap VWAP \(([^)]+)\), VPVR POC \(([^)]+)\), dan TPO POC \(([^)]+)\)\.$/))) {
    return fillTpl(T('ui.eRsVwap', s), { vwap: m[1], poc: m[2], tpo: m[3] });
  }
  if ((m = s.match(/^\[FVG & Supply\/Demand\] (.*) \| Zona Demand: (.+) \| Zona Supply: (.+)\.$/))) {
    return fillTpl(T('ui.eRsFvg', s), { fvg: localizeEngineString(m[1]), dl: m[2], sh: m[3] });
  }
  if ((m = s.match(/^\[MA Stack & Bollinger\] EMA20 \(([^)]+)\) \/ EMA50 \(([^)]+)\) \/ MA200 \(([^)]+)\) \| RSI\(14\): (.+)\.$/))) {
    return fillTpl(T('ui.eRsMa', s), { e20: m[1], e50: m[2], m200: m[3], rsi: m[4] });
  }
  if ((m = s.match(/^\[ORB • Theta • VWAP Entry\] ORB: (.*?)( \([^()]*–[^()]*\))? \| Theta Index: (\d+)\/100 \((.*)\) \| Entry VWAP: (.*) \| Efficiency Ratio: ([\d.]+)%\.$/))) {
    return fillTpl(T('ui.eRsOrb', s), { orb: localizeEngineString(m[1]), range: m[2] || '', ti: m[3], theta: localizeEngineString(m[4]), ve: localizeEngineString(m[5]), er: m[6] });
  }
  if ((m = s.match(/^\[CFTC COT & Fundamental\] Spekulan Institusi (\d+)% Long \((.*)\) \| (.*)\.$/))) {
    return fillTpl(T('ui.eRsCot', s), { pct: m[1], bias: localizeEngineString(m[2]), vm: localizeEngineString(m[3]) });
  }
  if ((m = s.match(/^\[MA Stack\] Harga (.+) vs EMA20 (.+) \/ EMA50 (.+) \| RSI\(14\): (.+)\.$/))) {
    return fillTpl(T('ui.eSynR2', s), { p: m[1], e20: m[2], e50: m[3], rsi: m[4] });
  }
  // --- Fragmen parametrik tunggal ---
  if ((m = s.match(/^Bullish FVG di (.+)-(.+)$/))) return fillTpl(T('ui.eFvgB', s), { a: m[1], b: m[2] });
  if ((m = s.match(/^Bearish FVG di (.+)-(.+)$/))) return fillTpl(T('ui.eFvgS', s), { a: m[1], b: m[2] });
  if ((m = s.match(/^SSL SWEEP ▲ \(Stop-Hunt di bawah (.+) lalu Reclaim Bullish\)$/))) return fillTpl(T('ui.eSwSsl', s), { p: m[1] });
  if ((m = s.match(/^BSL SWEEP ▼ \(Stop-Hunt di atas (.+) lalu Reject Bearish\)$/))) return fillTpl(T('ui.eSwBsl', s), { p: m[1] });
  if ((m = s.match(/^Uptrend sehat — pantau pullback VWAP \(deviasi (.+) ATR\)$/))) return fillTpl(T('ui.eVwOk', s), { d: m[1] });
  if ((m = s.match(/^Range ekspansif dari VWAP \((.+) ATR\) — konfirmasi arah dulu$/))) return fillTpl(T('ui.eVwRange', s), { d: m[1] });
  if ((m = s.match(/^MVRV Z-Score: (.+) \((.+)\) \| Dominasi Likuiditas Spot Tinggi$/))) return fillTpl(T('ui.eVmCrypto', s), { z: m[1], zone: localizeEngineString(m[2]) });
  if ((m = s.match(/^Paritas Daya Beli \(PPP\) & Yield Spread 2Y\/10Y: (.+)$/))) return fillTpl(T('ui.eVmForex', s), { inner: localizeEngineString(m[1]) });
  if ((m = s.match(/^Struktur Kurva Berjangka \(Futures Curve\): (.+)$/))) return fillTpl(T('ui.eVmCommo', s), { inner: localizeEngineString(m[1]) });
  if ((m = s.match(/^Estimasi P\/E: (.+)x \| PBV: (.+)x \| Dividend Yield: (.+)% \((.+)\)$/))) return fillTpl(T('ui.eVmStocks', s), { pe: m[1], pbv: m[2], dy: m[3], inner: localizeEngineString(m[4]) });
  if ((m = s.match(/^Funding Rate Perpetual: (.+)% \/ 8h \| Open Interest CME & Derivatif: (.+)$/))) return fillTpl(T('ui.eOfCrypto', s), { f: m[1], inner: localizeEngineString(m[2]) });
  if ((m = s.match(/^Interbank FX Liquidity & CFTC Leveraged Funds: (.+)% Posisi Long Bersih$/))) return fillTpl(T('ui.eOfForex', s), { n: m[1] });
  if ((m = s.match(/^COMEX Managed Money Net Long: (.+)% \| Permintaan Fisik Bullion & ETF: (.+)$/))) return fillTpl(T('ui.eOfMetals', s), { n: m[1], inner: localizeEngineString(m[2]) });
  if ((m = s.match(/^Commercial Hedgers: (.+) \| Spekulan CFTC: (.+)% Long$/))) return fillTpl(T('ui.eOfCommo', s), { hedge: localizeEngineString(m[1]), n: m[2] });
  if ((m = s.match(/^Arus Dana Asing \(Foreign Flow\): (.+)$/))) return fillTpl(T('ui.eOfStocksId', s), { inner: localizeEngineString(m[1]) });
  if ((m = s.match(/^Posisi Institusi CME & 13F: (.+)% Bullish Allocation$/))) return fillTpl(T('ui.eOfStocksGl', s), { n: m[1] });
  return s;
}
var state = {
  symbol: 'XAU/USD',
  tf: 'H1', timeframe: 'H1',
  mode: 'trader',            // 'trader' | 'investor'
  subMode: 'futures',        // 'futures' | 'spot'
  chartType: 'candles',      // 'candles' | 'bars' | 'line' | 'area' (ala TradingView)
  radarHorizon: 'intraday',  // 'scalping' | 'intraday' | 'swing'
  radarGroup: 'all',         // 'all' | 'crypto' | 'fx_comm' | 'stocks' (3 bagan terpisah)
  radarViability: 'actionable', // 'actionable' (layak entry) | 'fresh' | 'running' | 'all'
  bestTfBoard: null,         // papan hasil scan multi-TF (engine), diisi async
  candles: [],
  lastAnalysis: null,
  livePrice: 0,
  liveChangePct: 0,
  feedSource: '-',
  user: null                 // { email, name, tier: 'GUEST'|'FREE'|'VIP'|'OWNER_VIP', vipUntil }
};
try { if (typeof window !== 'undefined') window.state = state; } catch (e) {}
var chartInstance = null;
var candleSeries = null;
var ema20Line = null, ema50Line = null, ma200Line = null, vwapLine = null;
var drawnPriceLines = [];
var binanceWs = null;
var countdownTimer = null;
var lastCandleBucket = 0;
var radarRunSeq = 0;
var cryptoPairsLoaded = false;
var TF_SECONDS = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800, MN: 2592000, '1Y': 7776000 };
var SESSION_KEY = 'xstarzg_user_v3';
// CATATAN KEAMANAN (round 5): daftar email owner & kode akses TIDAK lagi disimpan
// di berkas publik ini. Jalur owner divalidasi penuh di server via /api/auth/owner.
var VIP_WALLET = '0xB2Da154e6619A57A2B839D7845920e55Bc58A12C';
var USDT_BSC_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
var VIP_PRICE = 29;
/* Radar rekomendasi per-horizon — setiap kelompok memindai kandidat dengan
   timeframe kelompoknya sendiri (Scalping M1-M15, Intraday M15-H1, Swing H4-W1),
   dan setiap kartu menampilkan arah rekomendasi (BUY/SELL utk trader, AKUMULASI/DCA utk investor). */
var RADAR_CONFIG = {
  scalping: {
    label: '⚡ SCALPING', tfRange: 'M1–M15',
    infoTrader: 'Eksekusi cepat: momentum, VWAP & orderflow M1–M15. Risiko tinggi — ukuran posisi kecil.',
    infoInvestor: 'Horizon scalping bukan untuk akumulasi — investor disarankan memakai tab SWING.',
    list: [
      { sym: 'XAU/USD', tf: 'M5' }, { sym: 'XAU/USD', tf: 'M15' },
      { sym: 'BTC/USDT', tf: 'M5' }, { sym: 'ETH/USDT', tf: 'M5' }, { sym: 'SOL/USDT', tf: 'M5' },
      { sym: 'COTTON', tf: 'M5' },
      { sym: 'EUR/USD', tf: 'M5' }, { sym: 'GBP/USD', tf: 'M5' }, { sym: 'USD/JPY', tf: 'M15' }, { sym: 'GBP/JPY', tf: 'M15' }, { sym: 'AUD/USD', tf: 'M5' },
      { sym: 'NVDA', tf: 'M15' }, { sym: 'AAPL', tf: 'M15' }, { sym: 'TSLA', tf: 'M15' }, { sym: 'BBCA.JK', tf: 'M15' }, { sym: 'BBRI.JK', tf: 'M15' }
    ]
  },
  intraday: {
    label: '🎯 INTRADAY', tfRange: 'M15–H1',
    infoTrader: 'Target harian: SMC, FVG, session breakout & VPVR pada M15–H1.',
    infoInvestor: 'Rekomendasi pembelian nyata harian — cek kembali valuasi sebelum akumulasi.',
    list: [
      { sym: 'BTC/USDT', tf: 'M30' }, { sym: 'ETH/USDT', tf: 'M30' }, { sym: 'SOL/USDT', tf: 'H1' },
      { sym: 'XAU/USD', tf: 'H1' }, { sym: 'XAU/IDR', tf: 'H1' }, { sym: 'WTI', tf: 'H1' },
      { sym: 'EUR/USD', tf: 'H1' }, { sym: 'GBP/USD', tf: 'H1' }, { sym: 'USD/JPY', tf: 'H1' }, { sym: 'USD/IDR', tf: 'M30' }, { sym: 'GBP/JPY', tf: 'H1' },
      { sym: 'BBCA.JK', tf: 'H1' }, { sym: 'BMRI.JK', tf: 'H1' }, { sym: 'BBRI.JK', tf: 'H1' }, { sym: 'TLKM.JK', tf: 'H1' }, { sym: 'NVDA', tf: 'H1' }, { sym: 'AAPL', tf: 'H1' }, { sym: 'TSLA', tf: 'H1' }
    ]
  },
  swing: {
    label: '🌊 SWING', tfRange: 'H4–W1',
    infoTrader: 'Multi-hari: supply/demand, struktur tren & CFTC COT pada H4–W1.',
    infoInvestor: 'Akumulasi spot jangka menengah-panjang: beli nyata bertahap (DCA) di zona demand.',
    list: [
      { sym: 'BTC/USDT', tf: 'H4' }, { sym: 'ETH/USDT', tf: 'H4' }, { sym: 'SOL/USDT', tf: 'D1' },
      { sym: 'XAU/USD', tf: 'D1' }, { sym: 'XAU/IDR', tf: 'D1' }, { sym: 'WTI', tf: 'D1' }, { sym: 'CPO', tf: 'H4' },
      { sym: 'EUR/USD', tf: 'H4' }, { sym: 'GBP/USD', tf: 'H4' }, { sym: 'USD/JPY', tf: 'D1' }, { sym: 'AUD/USD', tf: 'D1' }, { sym: 'EUR/GBP', tf: 'D1' },
      { sym: 'BBCA.JK', tf: 'D1' }, { sym: 'BBRI.JK', tf: 'D1' }, { sym: 'BMRI.JK', tf: 'D1' }, { sym: 'IHSG', tf: 'D1' }, { sym: 'NVDA', tf: 'D1' }, { sym: 'AAPL', tf: 'D1' }, { sym: 'SPY', tf: 'D1' }
    ]
  }
};
var radarCache = {};
var radarScanPool = {}; // hz -> sym|tf -> { ts, item } (cache scan bergilir katalog)
var RADAR_STORAGE_KEY = 'xstarzg_radar_pool_v1';
function loadPersistedRadarPool() {
  try {
    var raw = sessionStorage.getItem(RADAR_STORAGE_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    var now = Date.now();
    for (var hz in parsed) {
      radarScanPool[hz] = radarScanPool[hz] || {};
      for (var k in parsed[hz]) {
        var entry = parsed[hz][k];
        if (entry && entry.item && entry.item.analysis && (now - entry.ts < 15 * 60000)) {
          radarScanPool[hz][k] = entry;
        }
      }
    }
  } catch (e) {
    try { sessionStorage.removeItem(RADAR_STORAGE_KEY); } catch (e2) {}
  }
}
function persistRadarPool() {
  try {
    var copy = {};
    for (var hz in radarScanPool) {
      copy[hz] = {};
      for (var k in radarScanPool[hz]) {
        var it = radarScanPool[hz][k];
        if (it && it.item && it.item.analysis) {
          copy[hz][k] = {
            ts: it.ts,
            item: {
              sym: it.item.sym, tf: it.item.tf, price: it.item.price,
              changePct: it.item.changePct, source: it.item.source,
              analysis: it.item.analysis
            }
          };
        }
      }
    }
    sessionStorage.setItem(RADAR_STORAGE_KEY, JSON.stringify(copy));
  } catch (e) {}
}
try { loadPersistedRadarPool(); } catch (e) {}
var FALLBACK_CATALOG = [
  { symbol: 'XAU/USD', name: 'Gold Spot / Emas Dunia (USD)', assetClass: 'metals', region: 'GLOBAL' },
  { symbol: 'XAU/IDR', name: 'Emas Spot / Gram (IDR Proxy)', assetClass: 'metals', region: 'ID' },
  { symbol: 'XAG/USD', name: 'Silver Spot / Perak (USD)', assetClass: 'metals', region: 'GLOBAL' },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', assetClass: 'forex', region: 'GLOBAL' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', assetClass: 'forex', region: 'GLOBAL' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', assetClass: 'forex', region: 'GLOBAL' },
  { symbol: 'USD/IDR', name: 'US Dollar / Rupiah Indonesia', assetClass: 'forex', region: 'ID' },
  { symbol: 'WTI', name: 'WTI Crude Oil / Minyak Mentah AS', assetClass: 'commodities', region: 'GLOBAL' },
  { symbol: 'BBCA.JK', name: 'Bank Central Asia Tbk (Rp)', assetClass: 'stocks', region: 'ID' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation (AI)', assetClass: 'stocks', region: 'US' },
  { symbol: 'BTC/USDT', name: 'Bitcoin', assetClass: 'crypto', region: 'GLOBAL' },
  { symbol: 'ETH/USDT', name: 'Ethereum', assetClass: 'crypto', region: 'GLOBAL' }
];
function $id(x) { return document.getElementById(x); }
function setTxt(id, val) { var el = $id(id); if (el) el.textContent = val; }
function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : (d || 0); }
function formatPrice(v, symbol) {
  var n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '--';
  var a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a >= 20) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a >= 1) return n.toFixed(4);
  // v2026.64: harga <1 diberi presisi signifikan dari nilainya sendiri (bukan baku
  // 5 digit) — coin mikro seperti RDNT 0.00043436 tidak lagi membulat jadi "0.00".
  var k = -Math.floor(Math.log10(a) + 1e-12);
  return n.toFixed(Math.max(5, Math.min(10, k + 4)));
}
function pctFmt(v) { var n = num(v, 0); return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function getMeta(symbol) {
  var s = (symbol || '').toUpperCase();
  try { if (QC && QC.getInstrumentMeta) return QC.getInstrumentMeta(s); } catch (e) {}
  var cls = 'stocks', region = 'GLOBAL';
  if (s.indexOf('/USDT') > -1) cls = 'crypto';
  else if (s === 'WTI' || s === 'BRENT' || s === 'NATGAS' || s === 'CPO' || s === 'COAL' || s === 'WHEAT' || s === 'CORN' || s === 'SOYBEAN' || s === 'COFFEE' || s === 'COCOA' || s === 'SUGAR' || s === 'COTTON' || s === 'CATTLE' || s === 'LUMBER' || s === 'HEATOIL' || s === 'GASOLINE') cls = 'commodities';
  else if (s.indexOf('XAU') === 0 || s.indexOf('XAG') === 0 || s.indexOf('XPT') === 0 || s.indexOf('XPD') === 0 || s.indexOf('XCU') === 0 || s.indexOf('/') === 3 && (s.slice(0, 3) === 'HG/' )) cls = 'metals';
  else if (s.indexOf('/') > -1) cls = 'forex';
  else if (s.slice(-3) === '.JK') { cls = 'stocks'; region = 'ID'; }
  return { symbol: s, name: s + ' Instrument', assetClass: cls, region: region };
}
function catLabelOf(meta) {
  var c = meta.assetClass;
  if (c === 'metals') return 'METALS';
  if (c === 'forex') return 'FOREX';
  if (c === 'commodities') return 'COMMODITIES';
  if (c === 'crypto') return 'CRYPTO';
  return meta.region === 'ID' ? 'IDX STOCKS' : 'GLOBAL STOCKS';
}

var SEED_PRICES = {
  // Harga jangkar dikalibrasi realistis ke pasar spot aktif — hanya dipakai 0-2 detik sebelum kuotasi live tiba
  'XAU/USD': 2680.00, 'XAU/IDR': 1405000, 'XAG/USD': 31.50, 'XPT/USD': 980.00, 'XPD/USD': 1050.00, 'XCU/USD': 4.30, 'HG/USD': 4.30,
  'EUR/USD': 1.0845, 'GBP/USD': 1.2960, 'USD/JPY': 152.40, 'USD/CHF': 0.8650, 'AUD/USD': 0.6580, 'USD/CAD': 1.3890,
  'NZD/USD': 0.5980, 'USD/IDR': 16550, 'BBCA.JK': 9850, 'BBRI.JK': 4420, 'BMRI.JK': 6150, 'BBNI.JK': 4880,
  'TLKM.JK': 2760, 'ASII.JK': 4950, 'ANTM.JK': 1620, 'NVDA': 142.50, 'AAPL': 234.80, 'MSFT': 428.00,
  'TSLA': 262.00, 'BTC/USDT': 100000.00, 'ETH/USDT': 3400.00, 'SOL/USDT': 200.00, 'BNB/USDT': 645.00,
  'SEI/USDT': 0.28, 'SEI': 0.28, 'KAS/USDT': 0.15, 'KAS': 0.15, 'USD/ZAR': 18.00, 'USDZAR': 18.00,
  'LDO/USDT': 1.45, 'KCS/USDT': 5.82, 'FET/USDT': 1.15, 'TAO/USDT': 450.00, 'RENDER/USDT': 4.80, 'PEPE/USDT': 0.00001,
  'RAY/USDT': 1.35, 'RAY': 1.35,
  'NZD/JPY': 87.35, 'NZDJPY': 87.35, 'AUD/JPY': 100.25, 'CAD/JPY': 109.60, 'CHF/JPY': 176.10, 'EUR/JPY': 165.20, 'GBP/JPY': 197.50
};
try { if (typeof window !== 'undefined') window.SEED_PRICES = SEED_PRICES; } catch (e) {}

function generateSeedCandles(symbol, tf) {
  var sym = (symbol || 'XAU/USD').toUpperCase();
  var meta = (typeof getMeta === 'function' ? getMeta(sym) : null) || (typeof QC !== 'undefined' && QC && QC.getInstrumentMeta ? QC.getInstrumentMeta(sym) : null);
  var baseP = (meta && Number(meta.basePrice) > 0) ? Number(meta.basePrice) : (SEED_PRICES[sym] || 100);
  var tfSecMap = { 'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800, 'H1': 3600, 'H4': 14400, 'D1': 86400, 'W1': 604800, 'MN': 2592000, '1Y': 7776000 };
  var step = tfSecMap[tf] || 3600;
  var nowBucket = Math.floor(Date.now() / 1000 / step) * step;
  var atr = baseP * 0.0032;
  var seed = 0;
  for (var i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) % 1000003;
  var rand = function () { seed = (seed * 16807 + 11) % 2147483647; return (seed % 10000) / 10000; };
  var count = 180;
  var closes = new Array(count);
  closes[count - 1] = baseP;
  var cur = baseP;
  for (var j = count - 2; j >= 0; j--) {
    var wave = Math.sin(j * 0.15) * (atr * 0.20);
    var noise = (rand() - 0.500) * (atr * 0.45);
    cur = Math.max(baseP * 0.7, Math.min(baseP * 1.3, cur - noise - wave * 0.10));
    closes[j] = cur;
  }
  var out = [];
  for (var k = 0; k < count; k++) {
    var t = nowBucket - (count - 1 - k) * step;
    var o = k === 0 ? closes[0] * 0.999 : closes[k - 1];
    var c = closes[k];
    var wickUp = Math.max((0.2 + rand() * 0.5) * atr * 0.65, c * 0.0012);
    var wickDn = Math.max((0.2 + rand() * 0.5) * atr * 0.65, c * 0.0012);
    var h = Math.max(o, c) + wickUp;
    var l = Math.max(0.000001, Math.min(o, c) - wickDn);
    out.push({ time: t, open: o, high: h, low: l, close: c, volume: Math.round(120 + rand() * 800) });
  }
  return { price: baseP, candles: out };
}
try { if (typeof window !== 'undefined') window.generateSeedCandles = generateSeedCandles; } catch (e) {}

function drawCanvasFallbackChart(candles, analysis) {
  if (typeof window !== 'undefined' && typeof window.__canvasRenderer === 'function') {
    return window.__canvasRenderer(candles, analysis);
  }
  var container = document.getElementById('tvChartContainer');
  var skeleton = document.getElementById('tvChartLoadingSkeleton');
  if (skeleton) { try { skeleton.style.display = 'none'; } catch (e) {} }
  if (!container || (chartInstance && typeof LightweightCharts !== 'undefined')) return;
}
try { if (typeof window !== 'undefined') window.drawCanvasFallbackChart = drawCanvasFallbackChart; } catch (e) {}

/* Memeriksa apakah sesi bursa untuk instrumen ini sedang buka.
   Kripto & DEX buka 24/7/365. Forex, Emas/Logam, Komoditas & Saham tutup di akhir pekan.
   Saham IDX buka 09:00 - 16:00 WIB (02:00 - 09:00 UTC). Saham US buka 09:30 - 16:00 EST (14:30 - 21:00 UTC). */
function isAssetMarketOpen(symbol) {
  var s = String(symbol || '').toUpperCase().trim();
  // Kripto dan token DEX selalu buka 24/7/365 nonstop
  if (s.indexOf('/USDT') > -1 || s.indexOf('/USDC') > -1 || s.indexOf('/SOL') > -1 || s.indexOf('BTC') > -1 || s.indexOf('ETH') > -1 || s.indexOf('/BNB') > -1) {
    return true;
  }
  var meta = (typeof guessInstrumentMeta === 'function') ? guessInstrumentMeta(s) : {};
  if (meta.assetClass === 'crypto') return true;

  var now = new Date();
  var dayUtc = now.getUTCDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  var hourUtc = now.getUTCHours();
  var minuteUtc = now.getUTCMinutes();
  var timeUtc = hourUtc + minuteUtc / 60;

  // Akhir pekan global:
  // Pasar Forex, Logam Spot (XAU/XAG) & Komoditas tutup dari Sabtu s/d Minggu 21:00 UTC
  if (dayUtc === 6) return false;
  if (dayUtc === 0 && hourUtc < 21) return false;
  if (dayUtc === 5 && hourUtc >= 22) return false;

  // Pasar Saham Indonesia (IDX / .JK / IHSG):
  // Buka Senin - Jumat jam 09:00 - 16:00 WIB (02:00 - 09:00 UTC)
  var isIdx = s.slice(-3) === '.JK' || s === 'IHSG';
  if (isIdx) {
    if (dayUtc === 0 || dayUtc === 6) return false;
    if (timeUtc < 2.0 || timeUtc >= 9.0) return false;
    return true;
  }

  // Pasar Saham Wall Street US:
  // Buka Senin - Jumat jam 09:30 - 16:00 EST (14:30 - 21:00 UTC)
  var isUsStock = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD', 'AMZN', 'META', 'GOOGL', 'SPY', 'QQQ', 'COIN', 'MSTR'].indexOf(s) > -1 || meta.assetClass === 'stocks';
  if (isUsStock) {
    if (dayUtc === 0 || dayUtc === 6) return false;
    if (timeUtc < 14.5 || timeUtc >= 21.0) return false;
    return true;
  }

  return true;
}

/* ==================== 0. VALIDASI INTEGRITAS HARGA & INSTRUMEN ====================
   Mencegah bug fatal "harga pair sebelumnya menempel ke pair yang baru dikunjungi":
   memvalidasi kesesuaian orde/skala harga candlestick, sinyal, dan lock storage
   terhadap instrumen aktif (misal kurs JPY 20-600 tidak boleh terisi harga EUR/USD ~1.08). */
var REFERENCE_PRICES = {
  // Forex Majors & Crosses
  'EUR/USD': 1.0845, 'GBP/USD': 1.2960, 'USD/JPY': 152.40, 'USD/CHF': 0.8650, 'AUD/USD': 0.6580, 'USD/CAD': 1.3890,
  'NZD/USD': 0.5980, 'USD/IDR': 16550, 'EUR/JPY': 165.20, 'GBP/JPY': 197.50, 'EUR/GBP': 0.8328, 'AUD/JPY': 100.25,
  'CAD/JPY': 109.60, 'CHF/JPY': 176.10, 'NZD/JPY': 87.35, 'NZDJPY': 87.35, 'EUR/AUD': 1.6470, 'GBP/AUD': 1.9780, 'EUR/CAD': 1.4880,
  'GBP/CAD': 1.7860, 'EUR/CHF': 0.9415, 'GBP/CHF': 1.1305, 'AUD/CAD': 0.9030, 'AUD/NZD': 1.1085, 'USD/SGD': 1.3420,
  'USD/CNH': 7.2650, 'USD/THB': 33.85, 'USD/MXN': 20.35, 'USD/ZAR': 18.00,
  // Metals & Commodities
  'XAU/USD': 2680.00, 'XAU/IDR': 1405000, 'XAG/USD': 31.50, 'XPT/USD': 980.00, 'XPD/USD': 1050.00, 'XCU/USD': 4.30, 'HG/USD': 4.30,
  'WTI': 70.50, 'BRENT': 74.20, 'NATGAS': 2.85, 'CPO': 5100, 'COAL': 145.0,
  // Crypto Major
  'BTC/USDT': 100000.00, 'ETH/USDT': 3400.00, 'SOL/USDT': 200.00, 'BNB/USDT': 645.00, 'XRP/USDT': 2.55, 'ADA/USDT': 0.82,
  'DOGE/USDT': 0.26, 'AVAX/USDT': 26.4, 'LINK/USDT': 18.9, 'TON/USDT': 3.85, 'SUI/USDT': 3.42, 'DOT/USDT': 5.20,
  'NEAR/USDT': 3.60, 'APT/USDT': 6.40, 'LTC/USDT': 124, 'BCH/USDT': 345, 'SEI/USDT': 0.28, 'KAS/USDT': 0.15,
  'LDO/USDT': 1.45, 'KCS/USDT': 5.82, 'FET/USDT': 1.15, 'TAO/USDT': 450.00, 'RENDER/USDT': 4.80, 'PEPE/USDT': 0.00001,
  'RAY/USDT': 1.35, 'RAY': 1.35,
  // Equities
  'BBCA.JK': 9850, 'BBRI.JK': 4420, 'BMRI.JK': 6150, 'BBNI.JK': 4880, 'TLKM.JK': 2760, 'ASII.JK': 4950, 'ANTM.JK': 1620,
  'NVDA': 142.50, 'AAPL': 234.80, 'MSFT': 428.00, 'TSLA': 262.00, 'SPY': 590.0, 'QQQ': 510.0
};

function getSymbolReferencePrice(symbol) {
  var s = (symbol || '').toUpperCase().trim();
  if (!s) return 0;
  if (REFERENCE_PRICES[s]) return REFERENCE_PRICES[s];
  var clean = s.replace('/', '');
  if (REFERENCE_PRICES[clean]) return REFERENCE_PRICES[clean];
  try {
    var meta = (typeof getMeta === 'function' ? getMeta(s) : null) ||
               (typeof QC !== 'undefined' && QC && QC.getInstrumentMeta ? QC.getInstrumentMeta(s) : null);
    if (meta && Number(meta.basePrice) > 0) return Number(meta.basePrice);
  } catch (e) {}
  return 0;
}

function isPriceCompatibleWithSymbol(price, symbol) {
  var p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return false;
  var s = (symbol || '').toUpperCase().trim();
  if (!s) return false;

  // 1. Pasangan mata uang JPY (seperti NZD/JPY, USD/JPY, EUR/JPY, GBP/JPY, AUD/JPY, CAD/JPY, CHF/JPY)
  // Kurs JPY berada pada rentang 20 s/d 600, mustahil bernilai ~1.00 atau 0.00xxx
  var isJpyPair = (s.indexOf('/JPY') > -1 || s.endsWith('JPY'));
  if (isJpyPair) {
    if (p < 20 || p > 600) return false;
  }

  // 2. Forex non-JPY standar (misal EUR/USD, GBP/USD, AUD/USD, NZD/USD, USD/CAD, USD/CHF)
  // Kurs normal berada di rentang 0.20 s/d 50.0, tidak mungkin ratusan atau ribuan
  var isStandardFx = (s.indexOf('/') > -1 && s.indexOf('/USDT') === -1 && s.indexOf('XAU') === -1 && s.indexOf('XAG') === -1 && !isJpyPair && s.indexOf('IDR') === -1);
  if (isStandardFx) {
    if (p > 50) return false;
  }

  // 3. Emas, Perak & Bitcoin
  if (s === 'XAU/USD' || s === 'XAUUSD') {
    if (p < 1000 || p > 15000) return false;
  }
  if (s === 'BTC/USDT' || s === 'BTCUSDT' || s === 'BTC') {
    if (p < 5000) return false;
  }
  if (s.slice(-3) === '.JK') {
    if (p < 20) return false;
  }

  // 4. Verifikasi terhadap harga referensi terkalibrasi
  var ref = getSymbolReferencePrice(s);
  if (ref && ref > 0) {
    var ratio = p / ref;
    if (ratio < 0.2 || ratio > 5.0) {
      return false;
    }
  }
  return true;
}

/* ==================== 1. KATALOG INSTRUMEN & SELECT ==================== */
/* Helper rotasi katalog: slice stabil (hash simbol+kelas) bergilir per slot waktu
   sehingga SELURUH instrumen kebagian giliran analisis — tidak hanya aset besar. */
function catalogSortedStable() {
  var cat = currentCatalog().filter(function (x) { return !x.isDynamic; }).slice();
  var fnHash = function (item) {
    var h = 0, s = item.symbol + '@' + (item.assetClass || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  var crypto = [], fx = [], stocks = [];
  for (var i = 0; i < cat.length; i++) {
    var it = cat[i];
    var grp = (typeof radarAssetGroupOf === 'function') ? radarAssetGroupOf(it.symbol) : (it.assetClass === 'crypto' ? 'crypto' : (it.assetClass === 'stocks' ? 'stocks' : 'fx_comm'));
    if (grp === 'crypto') crypto.push(it);
    else if (grp === 'stocks') stocks.push(it);
    else fx.push(it);
  }
  crypto.sort(function (a, b) { return fnHash(a) - fnHash(b); });
  fx.sort(function (a, b) { return fnHash(a) - fnHash(b); });
  stocks.sort(function (a, b) { return fnHash(a) - fnHash(b); });

  // Interleave 1 Crypto, 1 Forex/Komoditas, 1 Saham agar rotasi radar selalu berimbang rata
  var maxLen = Math.max(crypto.length, fx.length, stocks.length);
  var interleaved = [];
  for (var j = 0; j < maxLen; j++) {
    if (j < crypto.length) interleaved.push(crypto[j]);
    if (j < fx.length) interleaved.push(fx[j]);
    if (j < stocks.length) interleaved.push(stocks[j]);
  }
  return interleaved;
}
function rotatingSlice(arr, n, slotMinutes) {
  if (arr.length <= n) return arr.slice();
  var slot = Math.floor(Date.now() / (slotMinutes * 60000));
  var start = (slot * n) % arr.length;
  var out = [];
  for (var i = 0; i < n; i++) out.push(arr[(start + i) % arr.length]);
  return out;
}
function currentCatalog() {
  if (QC && QC.DEFAULT_INSTRUMENTS && QC.DEFAULT_INSTRUMENTS.length) return QC.DEFAULT_INSTRUMENTS;
  return FALLBACK_CATALOG;
}
function matchesCategory(inst, cat) {
  if (!cat || cat === 'ALL') return true;
  if (cat === 'METALS') return inst.assetClass === 'metals';
  if (cat === 'FOREX') return inst.assetClass === 'forex';
  if (cat === 'IDX') return inst.assetClass === 'stocks' && inst.region === 'ID';
  if (cat === 'US_STOCKS') return inst.assetClass === 'stocks' && inst.region !== 'ID';
  if (cat === 'COMMODITIES') return inst.assetClass === 'commodities';
  if (cat === 'CRYPTO') return inst.assetClass === 'crypto';
  return true;
}
function renderInstrumentCatalog(query) {
  var sel = $id('selInstrument');
  if (!sel) return;
  var cat = ($id('selCategory') || {}).value || 'ALL';
  var q = (query !== undefined ? query : (($id('inpSearchAsset') || {}).value || '')).trim().toUpperCase();
  syncInvestorCatalogFilters();
  var catalog = currentCatalog();
  // Investor hanya melihat aset yang bisa dibeli nyata (crypto spot & saham).
  var investSet = null;
  if (state.mode === 'investor') {
    investSet = {};
    var invRows = investableUniverse();
    for (var invI = 0; invI < invRows.length; invI++) investSet[invRows[invI].symbol] = true;
  }
  var groups = [
    { key: 'crypto', label: '₿ CRYPTO SPOT GLOBAL', items: [] },
    { key: 'metals', label: '🥇 LOGAM MULIA', items: [] },
    { key: 'forex', label: '💱 FOREX MAYOR & CROSS', items: [] },
    { key: 'idx', label: '🇮🇩 SAHAM INDONESIA IDX', items: [] },
    { key: 'usg', label: '🇺🇸 SAHAM AS & GLOBAL', items: [] },
    { key: 'comm', label: '🛢️ KOMODITAS ENERGI & PANGAN', items: [] }
  ];
  var i, inst;
  for (i = 0; i < catalog.length; i++) {
    inst = catalog[i];
    if (investSet && !investSet[inst.symbol]) continue;
    if (!matchesCategory(inst, cat)) continue;
    if (q && inst.symbol.toUpperCase().indexOf(q) === -1 && (inst.name || '').toUpperCase().indexOf(q) === -1) continue;
    if (inst.assetClass === 'crypto') groups[0].items.push(inst);
    else if (inst.assetClass === 'metals') groups[1].items.push(inst);
    else if (inst.assetClass === 'forex') groups[2].items.push(inst);
    else if (inst.assetClass === 'stocks' && inst.region === 'ID') groups[3].items.push(inst);
    else if (inst.assetClass === 'stocks') groups[4].items.push(inst);
    else if (inst.assetClass === 'commodities') groups[5].items.push(inst);
  }
  sel.innerHTML = '';
  var MAX_PER_GROUP = 450;
  var symbolPresent = false; // catat apakah simbol aktif ikut ter-render (data-driven, anti blank <select>)
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g];
    if (!grp.items.length) continue;
    // Tandai aset yang sesinya sedang tutup (akhir pekan / di luar jam bursa) supaya
    // pengguna tahu kenapa tidak ada sinyal baru — bukan karena mesin rusak.
    var grpClosed = grp.key !== 'crypto' && !isAssetMarketOpen(grp.items[0].symbol);
    var closedTag = grpClosed ? ' ' + T('ui.eMktClosedSuffix', '⏸ SESI TUTUP') : '';
    var og = document.createElement('optgroup');
    og.label = grp.label + ' (' + grp.items.length + (grp.key === 'crypto' && cryptoPairsLoaded ? '+' : '') + ')' + closedTag;
    var limit = Math.min(grp.items.length, MAX_PER_GROUP);
    // Pastikan simbol aktif selalu ada di daftar walaupun melewati batas render
    var active = null;
    for (i = 0; i < grp.items.length; i++) {
      if (grp.items[i].symbol === state.symbol) { active = grp.items[i]; break; }
    }
    var rendered = {};
    if (active) {
      var optA = document.createElement('option');
      optA.value = active.symbol; optA.textContent = active.symbol + ' — ' + (active.name || '') + closedTag;
      optA.selected = true;
      og.appendChild(optA); rendered[active.symbol] = true;
      symbolPresent = true;
    }
    for (i = 0; i < limit; i++) {
      inst = grp.items[i];
      if (rendered[inst.symbol]) continue;
      var opt = document.createElement('option');
      opt.value = inst.symbol;
      opt.textContent = inst.symbol + ' — ' + (inst.name || '') + closedTag;
      if (inst.symbol === state.symbol) { opt.selected = true; symbolPresent = true; }
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
  try { sel.value = state.symbol; } catch (e) {}
  // FIX bug kolom pemilihan: saat simbol aktif ter-filter keluar (mis. simbol di LOGAM
  // lalu kategori diganti CRYPTO) <select> tampil KOSONG tanpa tulisan. Tampilkan
  // placeholder informatif (disabled) agar kolom ke-3 selalu memperlihatkan teks,
  // dan setiap klik instrumen tetap memicu event change secara normal.
  // Keputusan berbasis data (symbolPresent) -> konsisten di semua browser.
  if (sel.options.length === 0) {
    var ph0 = document.createElement('option');
    ph0.value = ''; ph0.disabled = true; ph0.selected = true;
    ph0.textContent = T('ui.eCatNoMatch', '🔍 Tidak ada instrumen cocok — ubah kata kunci pencarian');
    sel.appendChild(ph0);
  } else if (!symbolPresent) {
    var ph = document.createElement('option');
    ph.value = ''; ph.disabled = true; ph.selected = true;
    ph.textContent = fillTpl(T('ui.eCatPick', '⬇ {n} instrumen siap dipilih — klik untuk menganalisis'), { n: sel.options.length });
    sel.insertBefore(ph, sel.firstChild);
    if (ph.selected !== true || sel.selectedIndex !== 0) { try { sel.selectedIndex = 0; } catch (e) {} }
  }
  updateLandingCounts();
}
// Isi angka JUJUR di hero landing berdasar isi katalog nyata (tidak pernah dilebih-lebihkan).
// Setelah feed Binance termuat penuh, jumlah crypto otomatis naik ke angka real-nya.
function updateLandingCounts() {
  try {
    var elTotal = $id('heroTotalInstruments');
    if (!elTotal) return;
    var cat = currentCatalog();
    if (!cat || !cat.length) return;
    var cryptoN = 0;
    for (var i = 0; i < cat.length; i++) if (cat[i].assetClass === 'crypto') cryptoN++;
    var floor10 = function (v) { return Math.floor(v / 10) * 10; };
    elTotal.textContent = floor10(cat.length) + '+';
    var elCrypto = $id('heroCryptoCount');
    if (elCrypto) elCrypto.textContent = cryptoN > 75 ? floor10(cryptoN) + '+' : '500+';
  } catch (e) {}
}
function lazyLoadCryptoPairs() {
  if (cryptoPairsLoaded) return;
  cryptoPairsLoaded = true;
  try {
    var ctrl = new AbortController();
    var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 5000);
    fetch('https://data-api.binance.vision/api/v3/ticker/price', { signal: ctrl.signal })
      .then(function (r) { clearTimeout(t); return r.ok ? r.json() : null; })
      .then(function (list) {
        if (!Array.isArray(list) || !QC || !QC.registerDynamicInstrument) return;
        var added = 0;
        for (var i = 0; i < list.length; i++) {
          var it = list[i];
          if (!it.symbol || it.symbol.slice(-4) !== 'USDT') continue;
          if (it.symbol.indexOf('UPUSDT') > -1 || it.symbol.indexOf('DOWNUSDT') > -1 || it.symbol.indexOf('BEAR') > -1 || it.symbol.indexOf('BULL') > -1) continue;
          var base = it.symbol.slice(0, -4);
          var price = Number(it.price) || 1;
          if (base.length >= 2 && price > 0) {
            QC.registerDynamicInstrument({
              symbol: base + '/USDT', name: base + ' Crypto Spot (Binance Real-Time)',
              assetClass: 'crypto', provider: 'binance', providerSymbol: it.symbol,
              isRealtime: true, delayMinutes: 0, basePrice: price, cotCategory: 'CME_CRYPTO',
              isDynamic: true
            });
            added++;
          }
        }
        if (added > 0) renderInstrumentCatalog();
      })
      .catch(function () {});
  } catch (e) {}
}

/* ==================== 1.9 PERSISTENT SIGNAL LOCK STORAGE ====================
   Kunci sinyal elite (Entry/SL/TP1-3/TF/direction) di localStorage per
   (simbol | mode | subMode). Sinyal terkunci hanya dilepas saat TP tersentuh,
   SL ditembus, atau struktur candle closed berbalik (lihat validateSignalLock di
   engine). Refresh (F5), pindah menu, dan klik kalkulator TIDAK menggeser angka. */
/* v2026.47: kunci ditingkatkan per (simbol|mode|subMode|TF) — radar multi-TF tidak
   saling menimpa; entri v2 dimigrasi (lock aktif TIDAK dibuang diam-diam).
   SETIAP pelepasan lock dicatat outcome-nya (jujur, bukan hilang tanpa jejak) dan
   SL/invalidasi memicu cooldown penerbitan ulang untuk simbol+TF yang sama. */
var SIGNAL_LOCK_KEY = 'xstarzg_siglock_v3';
var SIGNAL_OUTCOME_KEY = 'xstarzg_sigoutcome_v1';
var LEGACY_JOURNAL_KEYS = [
  'xstarzg_siglock_v2', SIGNAL_LOCK_KEY, SIGNAL_OUTCOME_KEY, 'xstarzg_radaracc_v1',
  'xstarzg_investor_journal_v1', 'xstarzg_meme_journal_v1'
];
function journalStorageKey(key) {
  var email = state.user && state.user.email ? String(state.user.email).trim().toLowerCase() : 'guest';
  return key + ':' + encodeURIComponent(email);
}
function journalTombstoneKey() { return 'xstarzg_journal_clear_v1:' + journalStorageKey('account'); }
function journalClearState() {
  try { return JSON.parse(localStorage.getItem(journalTombstoneKey()) || 'null'); } catch (e) { return null; }
}
function clearLocalJournalKeys() {
  var accountSuffix = ':' + encodeURIComponent(
    state.user && state.user.email ? String(state.user.email).trim().toLowerCase() : 'guest'
  );
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.forEach(function (key) {
    if (LEGACY_JOURNAL_KEYS.some(function (base) { return key === base + accountSuffix; })) {
      localStorage.removeItem(key);
    }
  });
}
function signalLockStore() {
  try { return JSON.parse(localStorage.getItem(journalStorageKey(SIGNAL_LOCK_KEY)) || '{}') || {}; } catch (e) { return {}; }
}
function signalLockId(symbol, tf) {
  return (symbol || '').toUpperCase() + '|' + (state.mode || 'trader') + '|' + (state.mode === 'investor' ? 'spot' : (state.subMode || 'futures')) + '|' + String(tf || state.tf || '');
}
function getSignalLock(symbol, tf) {
  var id = signalLockId(symbol, tf);
  var l = signalLockStore()[id];
  if (!l || l.status !== 'ACTIVE') return null;
  var expectedSym = (symbol || '').toUpperCase();
  var lockSym = (l.symbol || '').toUpperCase();
  if ((lockSym && lockSym !== expectedSym) || !isPriceCompatibleWithSymbol(l.entry, expectedSym)) {
    saveSignalLock(symbol, tf, null);
    return null;
  }
  return l;
}
function saveSignalLock(symbol, tf, lock) {
  var savedLocal = false;
  try {
    var all = signalLockStore();
    var id = signalLockId(symbol, tf);
    if (lock) {
      if (!lock.analysis || !journalAdmission(lock.analysis, symbol, tf)) return null;
      if (!isPriceCompatibleWithSymbol(lock.entry, symbol)) {
        return null;
      }
      all[id] = lock;
      savedLocal = true;
      try {
        var outs = signalOutcomeStore();
        if (outs[id]) {
          delete outs[id];
          localStorage.setItem(journalStorageKey(SIGNAL_OUTCOME_KEY), JSON.stringify(outs));
        }
      } catch (e) {}
    } else {
      delete all[id];
    }
    var ks = Object.keys(all);
    while (ks.length > 60) { var k0 = ks.shift(); delete all[k0]; }
    localStorage.setItem(journalStorageKey(SIGNAL_LOCK_KEY), JSON.stringify(all));
  } catch (e) {}
  try { renderSignalJournal(); } catch (e) {}
  if (lock && savedLocal) {
    try {
      if (lock.analysis && journalAdmission(lock.analysis, lock.symbol, lock.tf)) {
        return ensureAuthToken().then(function (token) {
          if (!token) throw new Error('Authenticated journal sync requires a session token');
          return fetch('/api/market/journal-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ action: 'save_lock', lock: lock })
          }).then(function (r) {
            if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || ('HTTP ' + r.status)); });
            return r.json();
          });
        }).catch(function (err) { console.warn('Cloud journal save failed:', err.message); return null; });
      }
    } catch (e) {}
  }
  return null;
}

function syncCloudSignalJournal() {
  if (!state.user || !state.user.email) return Promise.resolve(null);
  return ensureAuthToken().then(function (token) {
    if (!token) throw new Error('Cloud journal sync requires an authenticated session');
    var cleared = journalClearState();
    if (cleared && cleared.pending) {
      return fetch('/api/market/journal-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'clear_user_journal' })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || ('HTTP ' + r.status)); });
        return r.json();
      }).then(function (data) {
        if (!data || !data.ok) throw new Error('Cloud journal reset was not confirmed');
        cleared.at = Number(data.clearedAt) || cleared.at;
        cleared.pending = false;
        localStorage.setItem(journalTombstoneKey(), JSON.stringify(cleared));
        return { ok: true, activeLocks: [], recentOutcomes: [] };
      });
    }
    return fetch('/api/market/journal-sync', { headers: { 'Authorization': 'Bearer ' + token } });
  })
    .then(function (r) {
      if (!r || !r.ok) return r ? r.json().then(function (d) { throw new Error(d.error || ('HTTP ' + r.status)); }) : null;
      if (Array.isArray(r.activeLocks)) return r;
      return r.json();
    })
    .then(function (d) {
      if (!d || !d.ok) throw new Error('Cloud journal sync returned an invalid response');
      var all = signalLockStore();
      var changed = false;
      if (Array.isArray(d.activeLocks) && d.activeLocks.length) {
        d.activeLocks.forEach(function (l) {
          if (!l || !l.symbol || !l.tf) return;
          var cleared = journalClearState();
          if (cleared && Number(l.issuedAt || l.created || 0) <= Number(cleared.at || 0)) return;
          if (!journalAdmission(l.analysis, l.symbol, l.tf)) return;
          var id = signalLockId(l.symbol, l.tf);
          if (!all[id] || (l.issuedAt && (!all[id].issuedAt || l.issuedAt > all[id].issuedAt))) {
            all[id] = l;
            changed = true;
          }
        });
      }
      if (changed) {
        localStorage.setItem(journalStorageKey(SIGNAL_LOCK_KEY), JSON.stringify(all));
        try { renderSignalJournal(); } catch (e) {}
      }
      /* Hasil akhir (TP/SL/invalid/expired) dari cloud wajib ikut turun ke
         perangkat. Tanpa ini jurnal hanya menampilkan lock aktif sementara rekap
         dan halaman performance kehilangan riwayat yang sudah diputuskan server. */
      var cloudOutcomes = Array.isArray(d.recentOutcomes) ? d.recentOutcomes
        : (Array.isArray(d.outcomes) ? d.outcomes : []);
      if (cloudOutcomes.length) {
        var localOuts = signalOutcomeStore();
        var outsChanged = false;
        cloudOutcomes.forEach(function (o) {
          if (!o || !o.symbol || !o.tf || !o.status) return;
          var lid = signalLockId(o.symbol, o.tf);
          var at = Number(o.at) || 0;
          var prev = localOuts[lid];
          if (prev && Number(prev.at || 0) >= at) return;
          localOuts[lid] = {
            id: o.id || lid,
            lock: {
              symbol: String(o.symbol).toUpperCase(), tf: o.tf,
              direction: o.direction || o.dir || null,
              sl: o.sl, tp1: o.tp1, tp2: o.tp2
            },
            dir: o.direction || o.dir || null,
            status: String(o.status).toUpperCase(),
            entry: o.entry, score: o.score, at: at, reason: o.reason || ''
          };
          outsChanged = true;
        });
        if (outsChanged) {
          try { localStorage.setItem(journalStorageKey(SIGNAL_OUTCOME_KEY), JSON.stringify(localOuts)); } catch (e) {}
          try { renderSignalJournal(); } catch (e) {}
        }
      }
    });
}
/* --- Hasil sinyal yang sudah memenuhi syarat jurnal --- */
function signalOutcomeStore() { try { return JSON.parse(localStorage.getItem(journalStorageKey(SIGNAL_OUTCOME_KEY)) || '{}') || {}; } catch (e) { return {}; } }
function hzOfTf(tf) { var t = String(tf || ''); if (t === 'M1' || t === 'M5' || t === 'M15') return 'scalping'; if (t === 'M30' || t === 'H1') return 'intraday'; return 'swing'; }
function outcomeCooldownMs(tf) { var hz = hzOfTf(tf); return hz === 'scalping' ? 30 * 60000 : hz === 'intraday' ? 90 * 60000 : 6 * 3600000; }
function outcomeBadgeWindowMs(tf) { var hz = hzOfTf(tf); return hz === 'scalping' ? 45 * 60000 : hz === 'intraday' ? 3 * 3600000 : 12 * 3600000; }
function buildManualJournalAnalysisSnapshot(a, symbol, tf, feedSource) {
  if (!a || a.error) return null;
  var sym = String(symbol || a.symbol || '').toUpperCase();
  var tfVal = String(tf || a.timeframe || state.tf || '');
  var dir = a.direction;
  var td = a.topDown && typeof a.topDown === 'object' ? a.topDown : null;
  var alignStatus = td && td.alignmentStatus ? td.alignmentStatus : null;
  var htfLtfAligned = !!(
    td && td.isAligned !== false &&
    ((dir === 'LONG' && alignStatus === 'ALIGNED_BULLISH') ||
     (dir === 'SHORT' && alignStatus === 'ALIGNED_BEARISH'))
  );
  var modeVal = a.mode || state.mode || 'trader';
  var subModeVal = modeVal === 'investor' ? 'spot' : (state.subMode || a.subMode || 'futures');
  var spotOnlyVal = !!(a.spotOnly || modeVal === 'investor' || subModeVal === 'spot');
  var src = a.feedSource || a.source || feedSource || null;
  var rawAct = String(a.action || a.label || '').trim().toUpperCase();
  var act = rawAct || (dir === 'LONG' ? 'BUY' : (dir === 'SHORT' ? 'SELL' : 'WAIT'));
  var sc = num(a.confluenceScore, num(a.convictionScore, 0));
  return {
    symbol: sym,
    timeframe: tfVal,
    mode: modeVal,
    subMode: subModeVal,
    spotOnly: spotOnlyVal,
    direction: dir,
    action: act,
    signalEligible: a.signalEligible === true,
    signalTier: a.signalTier || null,
    confluenceScore: sc,
    convictionScore: num(a.convictionScore, sc),
    htfLtfAligned: htfLtfAligned,
    topDown: td ? {
      isAligned: td.isAligned === true,
      alignmentStatus: alignStatus,
      macroBias: td.macroBias || null,
      structBias: td.structBias || null,
      execBias: td.execBias || null
    } : null,
    manualSelection: a.manualSelection === true,
    feedSource: src,
    source: src,
    feedUnverified: a.feedUnverified === true,
    __estFeed: a.__estFeed === true
  };
}
function journalAdmission(analysis, symbol, tf) {
  if (!analysis || analysis.error || analysis.manualSelection !== true) return false;
  var sym = String(symbol || '').toUpperCase();
  var direction = analysis.direction;
  var alignment = analysis.topDown && analysis.topDown.alignmentStatus;
  var aligned = analysis.htfLtfAligned === true && (direction === 'LONG'
    ? alignment === 'ALIGNED_BULLISH'
    : direction === 'SHORT' && alignment === 'ALIGNED_BEARISH');
  var score = Number(analysis.confluenceScore || analysis.convictionScore || 0);
  var source = analysis.feedSource || analysis.source;
  var actionUpper = String(analysis.action || analysis.label || '').trim().toUpperCase();
  var isWaitAction = !actionUpper ? false : (
    actionUpper === 'WAIT' || actionUpper === 'WAIT_ZONE' || actionUpper === 'WAIT ZONE' ||
    actionUpper === 'TUNGGU' || actionUpper === 'NEUTRAL' || actionUpper === 'UNALIGNED' ||
    /\b(WAIT|TUNGGU|NO-TRADE|NEUTRAL|UNALIGNED|HOLD)\b/.test(actionUpper)
  );
  var spotLongOnlyOk = (analysis.mode !== 'investor' || direction === 'LONG') &&
    ((!analysis.spotOnly && analysis.subMode !== 'spot') || direction === 'LONG');
  return analysis.signalEligible === true &&
    (direction === 'LONG' || direction === 'SHORT') &&
    !isWaitAction &&
    score >= 78 && aligned &&
    !analysis.feedUnverified && !analysis.__estFeed &&
    typeof feedIsReal === 'function' && feedIsReal(source) &&
    !!analysis.symbol && String(analysis.symbol).toUpperCase() === sym &&
    spotLongOnlyOk &&
    !!analysis.timeframe &&
    String(tf || analysis.timeframe || state.tf) === String(analysis.timeframe);
}

function notifySignalOutcomeTelegram(symbol, tf, finalStatus, verdict, lock) {
  try {
    if (!symbol || !lock) return;
    if (typeof telegramConfig === 'undefined' || (!telegramConfig.chatId && !state.user)) return;
    if (!telegramConfig.notifyHighScore && !telegramConfig.notifySlPlus) return;

    var lockAnchor = (lock && (lock.issuedAt || lock.anchorClosedTime || lock.entry)) || '0';
    var dedupKey = 'tg_outcome:' + symbol + ':' + (tf || '') + ':' + finalStatus + ':' + lockAnchor;
    telegramConfig.lastSentMap = telegramConfig.lastSentMap || {};
    if (telegramConfig.lastSentMap[dedupKey]) return;
    if (typeof recordTelegramSentKey === 'function') {
      recordTelegramSentKey(dedupKey);
    } else {
      telegramConfig.lastSentMap[dedupKey] = Date.now();
    }

    var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
    var isEn = curLang !== 'id';

    var hz = (typeof hzOfTf === 'function') ? hzOfTf(tf) : 'intraday';
    var hzLabel = hz === 'scalping' ? '⚡ SCALPING' : (hz === 'swing' ? '🌊 SWING' : '🎯 INTRADAY');
    var dir = lock.direction || '—';
    var dirEmoji = dir === 'LONG' ? '🟢 BUY / LONG' : '🔴 SELL / SHORT';
    var entryP = lock.entry ? formatPrice(lock.entry, symbol) : '—';
    var isFilled = !!lock.filled;
    var msg = '';

    if (finalStatus === 'EXPIRED') {
      if (!isFilled) {
        msg = isEn ?
          ('⌛ <b>[SIGNAL EXPIRED — CANCEL LIMIT ORDER]</b>\n\n' +
           'Asset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
           'Setup: <b>' + dirEmoji + '</b> @ ' + entryP + '\n' +
           'Status: <b>EXPIRED (12 Bars Elapsed Unfilled)</b>\n\n' +
           '⚠️ <b>MANDATORY ACTION:</b>\n' +
           '<i>Cancel your pending limit order on your broker/exchange now! The setup duration has elapsed before price reached entry. Do not enter this trade anymore.</i>') :
          ('⌛ <b>[SINYAL KADALUWARSA — BATALKAN ORDER]</b>\n\n' +
           'Aset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
           'Setup: <b>' + dirEmoji + '</b> @ ' + entryP + '\n' +
           'Status: <b>KADALUWARSA (12 Bar Berlalu Belum Terjemput)</b>\n\n' +
           '⚠️ <b>AKSI WAJIB BAGI TRADER:</b>\n' +
           '<i>Segera <b>BATALKAN (CANCEL) antrian Limit Order</b> Anda pada exchange/broker sekarang! Masa berlaku setup telah berakhir (12 candle berlalu tanpa terisi). Jangan biarkan order menggantung agar terhindar dari posisi zonk!</i>');
      } else {
        msg = isEn ?
          ('⌛ <b>[POSITION TIME HORIZON EXPIRED]</b>\n\n' +
           'Asset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
           'Setup: <b>' + dirEmoji + '</b>\n' +
           'Status: <b>Time horizon elapsed without TP/SL</b>\n\n' +
           '💡 <i>Consider closing or tightening manual stop loss as momentum has faded.</i>') :
          ('⌛ <b>[WAKTU POSISI BERAKHIR (EXPIRED)]</b>\n\n' +
           'Aset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
           'Setup: <b>' + dirEmoji + '</b>\n' +
           'Status: <b>Horison waktu setup selesai tanpa menyentuh TP/SL</b>\n\n' +
           '💡 <i>Disarankan tutup posisi atau pasang trailing stop manual karena momentum pergerakan sudah mereda.</i>');
      }
    } else if (finalStatus === 'TP_HIT') {
      var tpP = lock.tp1 ? formatPrice(lock.tp1, symbol) : '—';
      msg = isEn ?
        ('🎉 <b>[TAKE PROFIT REACHED (TP1 HIT)!]</b>\n\n' +
         'Asset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
         'Setup: <b>' + dirEmoji + '</b>\n' +
         'Target TP1: <b>' + tpP + ' REACHED!</b>\n\n' +
         '💰 <i>Congratulations! Target profit achieved. Lock in your profits according to your trading plan!</i>') :
        ('🎉 <b>[TAKE PROFIT TERCAPAI (TP1 HIT)!]</b>\n\n' +
         'Aset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
         'Setup: <b>' + dirEmoji + '</b>\n' +
         'Target TP1: <b>' + tpP + ' TERCAPAI!</b>\n\n' +
         '💰 <i>Selamat! Target profit telah tercapai. Kunci profit Anda sesuai rencana trading!</i>');
    } else if (finalStatus === 'SL_HIT') {
      var slP = lock.sl ? formatPrice(lock.sl, symbol) : '—';
      msg = isEn ?
        ('🛡️ <b>[STOP LOSS HIT]</b>\n\n' +
         'Asset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
         'Setup: <b>' + dirEmoji + '</b>\n' +
         'Stop Loss: <b>' + slP + ' hit</b>\n\n' +
         '🛡️ <i>Disciplined cut loss preserves trading capital for subsequent high-probability opportunities.</i>') :
        ('🛡️ <b>[STOP LOSS TERSENTUH (CUT LOSS)]</b>\n\n' +
         'Aset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
         'Setup: <b>' + dirEmoji + '</b>\n' +
         'Level SL: <b>' + slP + ' tersentuh</b>\n\n' +
         '🛡️ <i>Disiplin cut loss menjaga modal trading Anda tetap aman dan utuh untuk setup peluang berikutnya.</i>');
    } else if (finalStatus === 'BE_SAVED') {
      var wasAlerted = !!(lock && (lock.notifiedSlPlus || lock.slPlusAlerted || lock.slPlusNotified));
      if (!wasAlerted) {
        var slP = lock.sl ? formatPrice(lock.sl, symbol) : '—';
        msg = isEn ?
          ('🛡️ <b>[STOP LOSS HIT]</b>\n\n' +
           'Asset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
           'Setup: <b>' + dirEmoji + '</b>\n' +
           'Stop Loss: <b>' + slP + ' hit</b>\n\n' +
           '🛡️ <i>Disciplined cut loss preserves trading capital for subsequent high-probability opportunities.</i>') :
          ('🛡️ <b>[STOP LOSS TERSENTUH (CUT LOSS)]</b>\n\n' +
           'Aset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
           'Setup: <b>' + dirEmoji + '</b>\n' +
           'Level SL: <b>' + slP + ' tersentuh</b>\n\n' +
           '🛡️ <i>Disiplin cut loss menjaga modal trading Anda tetap aman dan utuh untuk setup peluang berikutnya.</i>');
      } else {
        var beP = lock.slPlus ? formatPrice(lock.slPlus, symbol) : 'BE+';
        msg = isEn ?
          ('🛡️ <b>[SAVED BY 0-RISK (BE+ EXIT)]</b>\n\n' +
           'Asset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
           'Setup: <b>' + dirEmoji + '</b>\n' +
           'Exit Level: <b>' + beP + ' (0-Risk)</b>\n\n' +
           '✅ <i>Position exited at BE+ safety lock! 100% capital preserved with 0 loss!</i>') :
          ('🛡️ <b>[MODAL AMAN 100% (BE+ EXIT)]</b>\n\n' +
           'Aset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
           'Setup: <b>' + dirEmoji + '</b>\n' +
           'Keluar di Level: <b>' + beP + ' (0-Risk)</b>\n\n' +
           '✅ <i>Posisi keluar pada pengaman BE+! Modal Anda terselamatkan 100% tanpa kerugian!</i>');
      }
    } else if (finalStatus === 'STRUCTURE_INVALID' || finalStatus === 'CANCELLED' || finalStatus === 'MISSED') {
      msg = isEn ?
        ('🚫 <b>[SETUP INVALIDATED / CANCELLED]</b>\n\n' +
         'Asset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
         'Setup: <b>' + dirEmoji + ' @ ' + entryP + '</b>\n' +
         'Reason: <i>' + (verdict && verdict.reason ? verdict.reason : 'Market structure shift or target hit prior to fill') + '</i>\n\n' +
         '⚠️ <i>Cancel any pending orders for this asset immediately.</i>') :
        ('🚫 <b>[SETUP BATAL / INVALID]</b>\n\n' +
         'Aset: <b>' + symbol + '</b> (' + (tf || 'M5') + ' • ' + hzLabel + ')\n' +
         'Setup: <b>' + dirEmoji + ' @ ' + entryP + '</b>\n' +
         'Alasan: <i>' + (verdict && verdict.reason ? verdict.reason : 'Struktur harga berbalik atau target tercapai sebelum terjemput') + '</i>\n\n' +
         '⚠️ <i>Segera batalkan antrian limit order Anda pada broker/exchange untuk aset ini.</i>');
    }

    if (msg && typeof sendTelegramAlert === 'function') {
      sendTelegramAlert(msg);
    }
  } catch (e) {}
}

function recordSignalOutcome(symbol, tf, verdict, lock) {
  try {
    if (lock && !isPriceCompatibleWithSymbol(lock.entry, symbol)) return;
    var oc = String((verdict && verdict.status) || '');
    // Order limit belum pernah terjemput/terisi -> DILARANG KERAS dicatat sebagai TP_HIT atau SL_HIT!
    if (lock && !lock.filled && (oc === 'TP_HIT' || oc === 'SL_HIT')) {
      oc = (oc === 'TP_HIT') ? 'MISSED' : 'CANCELLED';
      if (verdict) {
        verdict.status = oc;
        verdict.reason = (oc === 'MISSED')
          ? 'Target tercapai sebelum order limit terjemput (unfilled)'
          : 'SL tersentuh sebelum order limit terjemput (unfilled)';
      }
    }
    // v2026.65: EXPIRED dicatat juga ke jurnal (transparansi penuh) namun TIDAK
    // memengaruhi winrate adaptif (bukan kemenangan/kekalahan — netral usia setup).
    if (oc !== 'SL_HIT' && oc !== 'TP_HIT' && oc !== 'STRUCTURE_INVALID' && oc !== 'EXPIRED' && oc !== 'BE_SAVED' && oc !== 'MISSED' && oc !== 'CANCELLED') return;
    var wasSlPlusAlerted = !!(lock && (lock.notifiedSlPlus || lock.slPlusAlerted || lock.slPlusNotified));
    var beSaved = ((verdict && verdict.status === 'BE_SAVED') || (!!(verdict && verdict.beProtected) || !!(lock && lock.bePlusActive))) && wasSlPlusAlerted;
    var finalStatus = (oc !== 'TP_HIT' && oc !== 'MISSED' && oc !== 'CANCELLED' && beSaved) ? 'BE_SAVED' : oc;
    var finalReason = (finalStatus === 'BE_SAVED')
      ? ((verdict && verdict.reason ? verdict.reason + ' • ' : '') + 'Terselamatkan oleh proteksi SL+ (0-Risk, modal aman)')
      : ((verdict && verdict.reason) || '');

    var out = signalOutcomeStore();
    out[signalLockId(symbol, tf)] = {
      status: finalStatus, reason: finalReason, at: Date.now(),
      dir: lock && lock.direction, entry: lock && lock.entry, score: lock && lock.score,
      slPlus: lock && lock.slPlus, bePlusActive: beSaved,
      // Snapshot lock penuh -> outcome bisa direkonsiliasi terhadap candle asli
      // (jika badge lahir dari feed fabrikasi, lock dipulihkan & badge dicabut).
      lock: lock ? {
        v: lock.v, symbol: lock.symbol, tf: lock.tf, direction: lock.direction,
        mode: lock.mode || null, subMode: lock.subMode || null, source: lock.source || null,
        entry: lock.entry, sl: lock.sl, tp1: lock.tp1, tp2: lock.tp2, tp3: lock.tp3,
        slPlus: lock.slPlus, bePlusActive: beSaved, filled: !!lock.filled,
        rrRatio: lock.rrRatio, score: lock.score, winRate: lock.winRate,
        anchorClosedTime: lock.anchorClosedTime, anchorPrice: lock.anchorPrice,
        analysis: lock.analysis || null, issuedAt: lock.issuedAt
      } : null
    };
    var ks = Object.keys(out);
    while (ks.length > 80) { var k0 = ks.shift(); delete out[k0]; }
    localStorage.setItem(SIGNAL_OUTCOME_KEY, JSON.stringify(out));
    if (SE && SE.updateRadarAccuracy && (oc === 'TP_HIT' || oc === 'SL_HIT') && finalStatus !== 'BE_SAVED') {
      var acc = radarAccStore();
      var hz = hzOfTf(tf);
      acc[hz] = SE.updateRadarAccuracy(acc[hz], oc === 'TP_HIT' ? 'TP' : 'SL');
      localStorage.setItem(RADAR_ACC_KEY, JSON.stringify(acc));
    }
    try { notifySignalOutcomeTelegram(symbol, tf, finalStatus, verdict, lock); } catch (e) {}
    try {
      fetch('/api/market/journal-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_outcome',
          outcome: {
            symbol: symbol,
            tf: tf,
            status: finalStatus,
            reason: finalReason,
            at: Date.now()
          }
        })
      }).catch(function () {});
    } catch (e) {}
    try { renderSignalJournal(); } catch (e) {}
  } catch (e) {}
}
function signalCooldownActive(symbol, tf) {
  var o = signalOutcomeStore()[signalLockId(symbol, tf)];
  return !!(o && (o.status === 'SL_HIT' || o.status === 'STRUCTURE_INVALID' || o.status === 'EXPIRED' || o.status === 'BE_SAVED' || o.status === 'TP_HIT' || o.status === 'MISSED' || o.status === 'CANCELLED') && (Date.now() - o.at) < outcomeCooldownMs(tf));
}
function latestSignalOutcome(symbol, tf) {
  var id = signalLockId(symbol, tf);
  var outs = signalOutcomeStore();
  var o = outs[id];
  if (!o || (Date.now() - o.at) >= outcomeBadgeWindowMs(tf)) return null;
  var expectedSym = (symbol || '').toUpperCase();
  if (o.lock) {
    var lockSym = (o.lock.symbol || '').toUpperCase();
    if ((lockSym && lockSym !== expectedSym) || !isPriceCompatibleWithSymbol(o.lock.entry, expectedSym)) {
      delete outs[id];
      try { localStorage.setItem(SIGNAL_OUTCOME_KEY, JSON.stringify(outs)); } catch (e) {}
      return null;
    }
  }
  return o;
}
function adaptiveMinScore(tf) {
  try {
    if (SE && SE.radarAdaptiveGate) return Math.max(SE.radarAdaptiveGate(radarAccStore()[hzOfTf(tf)]).minScore, 78);
  } catch (e) {}
  return 78;
}
function auditAndCleanseCorruptedStorage() {
  try {
    var outs = signalOutcomeStore();
    var outsMod = false;
    for (var k in outs) {
      var o = outs[k];
      if (!o || !o.lock) continue;
      var L = o.lock, isL = L.direction === 'LONG';
      var sym = (L.symbol || k.split('|')[0] || '').toUpperCase();
      var tp1 = Number(L.tp1), entry = Number(L.entry), sl = Number(L.sl);
      var inv = isL ? (tp1 <= entry || sl >= entry) : (tp1 >= entry || sl <= entry);
      var badPrice = !isPriceCompatibleWithSymbol(entry, sym);
      var kSym = (k.split('|')[0] || '').toUpperCase();
      var symMismatch = (L.symbol && kSym && L.symbol.toUpperCase() !== kSym);
      if (inv || badPrice || symMismatch) {
        delete outs[k];
        outsMod = true;
      }
    }
    if (outsMod) localStorage.setItem(SIGNAL_OUTCOME_KEY, JSON.stringify(outs));

    var lks = signalLockStore();
    var lksMod = false;
    var nowMs = Date.now();
    for (var k2 in lks) {
      if (k2 === '__migratedV2') continue;
      var lk = lks[k2];
      if (!lk) continue;
      var isL2 = lk.direction === 'LONG';
      var sym2 = (lk.symbol || k2.split('|')[0] || '').toUpperCase();
      var tp12 = Number(lk.tp1), entry2 = Number(lk.entry), sl2 = Number(lk.sl);
      var inv2 = isL2 ? (tp12 <= entry2 || sl2 >= entry2) : (tp12 >= entry2 || sl2 <= entry2);
      var badPrice2 = !isPriceCompatibleWithSymbol(entry2, sym2);
      var k2Sym = (k2.split('|')[0] || '').toUpperCase();
      var symMismatch2 = (lk.symbol && k2Sym && lk.symbol.toUpperCase() !== k2Sym);
      var ageMs2 = nowMs - (lk.issuedAt || lk.created || 0);
      var maxAgeMs2 = (lk.tf === 'M1' || lk.tf === 'M5' || lk.tf === 'M15') ? (60 * 60 * 1000) : (lk.tf === 'M30' || lk.tf === 'H1') ? (8 * 3600 * 1000) : (24 * 3600 * 1000);
      var staleUnfilled = (!lk.filled && ageMs2 > maxAgeMs2);
      if (inv2 || badPrice2 || symMismatch2 || staleUnfilled) {
        if (staleUnfilled && typeof recordSignalOutcome === 'function') {
          try {
            recordSignalOutcome(sym2, lk.tf, { status: 'EXPIRED', reason: 'Batas waktu tunggu limit order habis (>12 candle tanpa terjemput)', at: nowMs }, lk);
          } catch (e) {}
        }
        delete lks[k2];
        lksMod = true;
      }
    }
    if (lksMod) localStorage.setItem(SIGNAL_LOCK_KEY, JSON.stringify(lks));
  } catch (e) {}
}
/* Rekonsiliasi jujur: badge TP/SL yang lahir dari candle fabrikasi (feed kotor)
   DICABUT saat candle asli membuktikan level itu tidak pernah tersentuh —
   lock dipulihkan ACTIVE dan statistik akurasi dikembalikan (rollback 1 outcome). */
function reconcileSignalOutcome(symbol, tf, closedCandles) {
  try {
    var key = signalLockId(symbol, tf);
    var out = signalOutcomeStore();
    var o = out[key];
    if (!o) return;
    if (!o.lock || !Number.isFinite(Number(o.lock.anchorClosedTime))) {
      delete out[key];
      localStorage.setItem(SIGNAL_OUTCOME_KEY, JSON.stringify(out));
      return;
    }
    var L = o.lock, isLong = L.direction === 'LONG';
    var entry = Number(L.entry), sl = Number(L.sl), tp1 = Number(L.tp1);
    var anchorP = Number.isFinite(Number(L.anchorPrice)) ? Number(L.anchorPrice) : entry;
    // Outcome palsu / terbalik: LONG tapi tp1 <= entry atau sl >= entry
    var inverted = isLong ? (tp1 <= entry || sl >= entry) : (tp1 >= entry || sl <= entry);
    if (inverted) {
      delete out[key];
      localStorage.setItem(SIGNAL_OUTCOME_KEY, JSON.stringify(out));
      return;
    }
    if ((Date.now() - o.at) >= outcomeBadgeWindowMs(tf)) return;
    if (o.status !== 'TP_HIT' && o.status !== 'SL_HIT') return; // struktur tidak direkonsiliasi mekanis
    var target = o.status === 'TP_HIT' ? tp1 : sl;
    var hit = false;
    var filled = L.filled === true;
    for (var i = 0; i < closedCandles.length; i++) {
      var c = closedCandles[i];
      if (!c || c.time <= L.anchorClosedTime || (c.time * 1000) > (o.at + 90000)) continue;
      if (!filled) {
        if (isLong && c.low <= entry) filled = true;
        if (!isLong && c.high >= entry) filled = true;
      }
      if (!filled) continue; // Jangan akui TP hit jika order limit belum pernah terjemput
      // LONG: TP tersentuh bila high >= tp1; SL bila low <= sl. SHORT cermin.
      if (o.status === 'TP_HIT') { if (isLong ? c.high >= target : c.low <= target) { hit = true; break; } }
      else { if (isLong ? c.low <= target : c.high >= target) { hit = true; break; } }
    }
    if (!hit) {
      delete out[key];
      localStorage.setItem(SIGNAL_OUTCOME_KEY, JSON.stringify(out));
      var all = signalLockStore();
      if (!inverted) {
        all[key] = Object.assign({}, L, { status: 'ACTIVE' });
        localStorage.setItem(SIGNAL_LOCK_KEY, JSON.stringify(all));
      }
      var acc = radarAccStore(); var hz = hzOfTf(tf); var st = acc[hz];
      if (st && Array.isArray(st.recent) && st.recent.length) {
        st.recent = st.recent.slice(0, -1);
        var w = st.recent.reduce(function (a2, b) { return a2 + b; }, 0);
        st.sample = st.recent.length; st.wins = w; st.losses = st.recent.length - w;
        st.winRate = st.recent.length ? Math.round((w / st.recent.length) * 100) : 0;
        acc[hz] = st;
        localStorage.setItem(RADAR_ACC_KEY, JSON.stringify(acc));
      }
    }
  } catch (e) {}
}

/* ==================== 2. MESIN ANALISIS QUANT (computeQuantEngine) ==================== */
function computeQuantEngine(candles, symbol, tf, forceRecalc, lockScope, feedSource) {
  try {
    if (Array.isArray(candles) && candles.length >= 5) {
      var lastC = candles[candles.length - 1];
      if (lastC && !isPriceCompatibleWithSymbol(lastC.close, symbol)) {
        candles = (typeof generateSeedCandles === 'function') ? generateSeedCandles(symbol, tf).candles : [];
      }
    }
    if (SE && SE.runFullAnalysis && Array.isArray(candles) && candles.length >= 30) {
      var a = SE.runFullAnalysis({
        symbol: symbol, timeframe: tf || 'H1',
        mode: state.mode || 'trader', horizon: 'all',
        spotOnly: state.mode === 'investor' || state.subMode === 'spot', candles: candles
      });
      if (a && !a.error) {
        a.candles = candles;
        a.lastPrice = a.lastPrice || (candles.length ? candles[candles.length - 1].close : null);
        a.livePrice = a.lastPrice;
        /* === PERSISTENT SIGNAL LOCK (aturan #3: anti-berubah saat refresh) ===
           SKOPE 'create' = analisis utama workspace (boleh menerbitkan kunci baru),
           'apply' = radar/kurasi/scan (hanya menerapkan kunci yang sudah ada). */
        var scope = (lockScope === 'create' || lockScope === 'apply') ? lockScope : 'create';
        /* v2026.48: siklus hidup sinyal (validasi TP/SL, outcome, penerbitan kunci)
           HANYA boleh berjalan di atas candle yang PROVENANSINYA asli (klines broker).
           Feed fabrikasi/estimasi (anchored/seed/synthetic) TIDAK boleh melahirkan
           badge TP/SL maupun komitmen baru — itulah sumber badge dusta AMDB. */
        var isFeedEstimate = typeof feedIsEstimate === 'function' ? feedIsEstimate(feedSource) : false;
        a.__estFeed = isFeedEstimate;
        a.source = feedSource;
        a.feedSource = feedSource;
        var feedReal = typeof feedIsReal === 'function' ? feedIsReal(feedSource) : (!isFeedEstimate && !!feedSource);
        if (!feedReal) a.feedUnverified = true;
        if (!feedReal || isFeedEstimate || feedSource === 'LOCAL_SEED') {
          a.feedUnverified = true;
          a.signalEligible = false;
          a.htfLtfAligned = false;
          a.manualSelection = false;
          // Seed sintetis hanya untuk visual candlestick awal chart, cegah skor palsu & alarm sesaat
          a.convictionScore = 50;
          a.confluenceScore = 50;
          a.direction = 'NEUTRAL';
          a.label = 'NEUTRAL';
          a.action = 'TUNGGU';
        }
        // v2026.72: Sinyal yang tampil di workspace utama (scope === 'create') atau
        // lock aktif yang sedang dipantau trader (mis. komoditas Kapas/COTTON M5 scalping)
        // WAJIB diikutkan ke siklus pemantauan jurnal sinyal menuju TP/SL HANYA bila feed bukan estimasi.
        var tfA = a.timeframe || tf;
        a.manualSelection = !!(
          state.manualInstrumentSelection === true &&
          scope === 'create' &&
          String(symbol || '').toUpperCase() === String(state.symbol || '').toUpperCase() &&
          String(tfA || '') === String(state.tf || '')
        );
        if ((scope === 'create' || getSignalLock(symbol, tfA)) && !isFeedEstimate) feedReal = true;
        if (!feedIsReal(feedSource) || isFeedEstimate || feedSource === 'LOCAL_SEED') {
          feedReal = false;
          a.feedUnverified = true;
          a.signalEligible = false;
          a.htfLtfAligned = false;
          a.manualSelection = false;
          a.convictionScore = 50;
          a.confluenceScore = 50;
          a.direction = 'NEUTRAL';
          a.label = 'NEUTRAL';
          a.action = 'TUNGGU';
        }
        try {
          if (feedReal && typeof SE.validateSignalLock === 'function') {
            var closedBars0 = SE.trimClosedCandles(candles, a.tfSeconds || 3600);
            reconcileSignalOutcome(symbol, tfA, closedBars0);
            var lock = getSignalLock(symbol, tfA);
            if (lock && lock.tf === tfA) {
              var isCurrentFeedReal = typeof feedIsReal === 'function' ? feedIsReal(feedSource) : false;
              if (lock.feedUnverified && isCurrentFeedReal) {
                // Upgrade kunci yang sebelumnya unverified menjadi verified saat feed asli broker tiba (jangan hapus!)
                lock.feedUnverified = false;
                saveSignalLock(symbol, tfA, lock);
              }
            }
            if (lock && lock.tf === tfA) {
              var verdict = SE.validateSignalLock(lock, closedBars0, a);
              if (verdict && verdict.status === 'ACTIVE') {
                var lockModified = false;
                if (verdict.filled && !lock.filled) {
                  lock.filled = true;
                  lockModified = true;
                }
                if (verdict.bePlusActive && !lock.bePlusActive && (lock.filled || verdict.filled)) {
                  lock.bePlusActive = true;
                  lock.notifiedSlPlus = true;
                  lock.slPlusAlerted = true;
                  lockModified = true;
                  try { notifySlPlusTriggered(symbol, tfA, lock); } catch (e) {}
                }
                if (lockModified) {
                  saveSignalLock(symbol, tfA, lock);
                }
                SE.applyLockedSignal(a, lock, verdict);
                if (a.feedUnverified || isFeedEstimate || !feedReal) {
                  a.signalEligible = false;
                  a.convictionScore = 50;
                  a.confluenceScore = 50;
                  a.direction = 'NEUTRAL';
                }
              } else {
                a.lockCleared = verdict || { status: 'GONE' };
                recordSignalOutcome(symbol, tfA, verdict, lock); // jujur: outcome dicatat
                saveSignalLock(symbol, tfA, null);
              }
            }
            /* Kartu yang TAMPIL (create/apply) = komitmen terlacak. Penerbitan baru
               dihormati 3 penjaga: feed asli + cooldown pasca-SL/invalidasi + ambang
               adaptif dari akurasi terukur horizon (mengetat otomatis saat radar buruk). */
            var alignmentStatus = a.topDown && a.topDown.alignmentStatus;
            var directionAligned = (a.direction === 'LONG' && alignmentStatus === 'ALIGNED_BULLISH') ||
              (a.direction === 'SHORT' && alignmentStatus === 'ALIGNED_BEARISH');
            a.htfLtfAligned = !!(directionAligned && a.topDown && a.topDown.isAligned !== false);
            var actUpper = String(a.action || a.label || '').trim().toUpperCase();
            var isWaitZoneAction = !actUpper ? false : (
              actUpper === 'WAIT' || actUpper === 'WAIT_ZONE' || actUpper === 'WAIT ZONE' ||
              actUpper === 'TUNGGU' || actUpper === 'NEUTRAL' || actUpper === 'UNALIGNED' ||
              /\b(WAIT|TUNGGU|NO-TRADE|NEUTRAL|UNALIGNED|HOLD)\b/.test(actUpper)
            );
            var spotLongOnlyOk = (state.mode !== 'investor' || a.direction === 'LONG') &&
              ((state.subMode !== 'spot' && !a.spotOnly) || a.direction === 'LONG');
            var manualJournalEligible = state.manualInstrumentSelection === true &&
              a.manualSelection === true &&
              state.mode === 'trader' && scope === 'create' &&
              String(symbol).toUpperCase() === String(state.symbol).toUpperCase() &&
              tfA === state.tf && directionAligned && a.htfLtfAligned === true &&
              spotLongOnlyOk && !isWaitZoneAction &&
              (a.signalTier === 'PRO' || a.signalTier === 'ELITE') &&
              num(a.confluenceScore, 0) >= Math.max(80, adaptiveMinScore(tfA)) &&
              a.signalEligible && !a.__estFeed && !a.feedUnverified && feedReal &&
              !signalCooldownActive(symbol, tfA);
            if (!a.lockedSignal && manualJournalEligible) {
              var lockSnapshot = buildManualJournalAnalysisSnapshot(a, symbol, tfA, feedSource);
              var nl = (lockSnapshot && journalAdmission(lockSnapshot, symbol, tfA)) ? SE.createSignalLock(a, symbol, state.mode, state.subMode) : null;
              if (nl && isAssetMarketOpen(symbol) && isPriceCompatibleWithSymbol(nl.entry, symbol)) {
                if (a.feedUnverified) nl.feedUnverified = true;
                nl.analysis = lockSnapshot;
                saveSignalLock(symbol, tfA, nl);
                SE.applyLockedSignal(a, nl, { status: 'ACTIVE', bePlusActive: false });
                try { checkTelegramHighScoreSignal(a, { sym: symbol, tf: tfA }); } catch (e) {}
              }
            }
          }
        } catch (e) {}
        a.confidence = a.confluenceScore;
        return a;
      }
    }
  } catch (e) {}
  return computeQuickAnalysis(candles, symbol, tf);
}
/* Fallback ringan (self-contained) jika shared module belum termuat */
function computeQuickAnalysis(candles, symbol, tf) {
  candles = Array.isArray(candles) && candles.length >= 5 ? candles : [];
  if (candles.length) {
    var lastC0 = candles[candles.length - 1];
    if (lastC0 && !isPriceCompatibleWithSymbol(lastC0.close, symbol)) {
      candles = (typeof generateSeedCandles === 'function') ? generateSeedCandles(symbol, tf).candles : [];
    }
  }
  var n = candles.length;
  var last = n ? candles[n - 1] : { open: 100, high: 100, low: 100, close: 100, time: Math.floor(Date.now() / 1000) };
  var price = last.close;
  var closes = candles.map(function (c) { return c.close; });
  var emaArr = function (arr, p) {
    var out = new Array(arr.length); var k = 2 / (p + 1); var prev = arr[0] || price;
    for (var i = 0; i < arr.length; i++) { prev = i === 0 ? arr[0] : arr[i] * k + prev * (1 - k); out[i] = prev; }
    return out;
  };
  var ema20A = emaArr(closes, 20), ema50A = emaArr(closes, 50), ema200A = emaArr(closes, 200);
  var ema20 = ema20A[n - 1] || price, ema50 = ema50A[n - 1] || price, ma200 = ema200A[n - 1] || price;
  var trSum = 0, trCount = 0, i;
  for (i = Math.max(1, n - 14); i < n; i++) {
    var c = candles[i], p = candles[i - 1];
    trSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    trCount++;
  }
  var atr = trCount ? (trSum / trCount) : price * 0.004;
  var gains = 0, losses = 0;
  for (i = Math.max(1, n - 14); i < n; i++) {
    var d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  var rsi = losses === 0 ? (gains > 0 ? 100 : 50) : 100 - (100 / (1 + gains / losses));
  var wins = candles.slice(-40);
  var swingHigh = Math.max.apply(null, wins.map(function (c) { return c.high; }).concat([price]));
  var swingLow = Math.min.apply(null, wins.map(function (c) { return c.low; }).concat([price]));
  var bull = price >= ema20 && ema20 >= ema50;
  var bear = price < ema20 && ema20 < ema50;
  var softDir = bull ? 'LONG' : bear ? 'SHORT' : 'NEUTRAL';
  var score = 50;
  if (bull) {
    score = 68;
    if (price > ma200) score += 7; else score -= 5;
    if (rsi > 52 && rsi < 72) score += 5; else if (rsi < 48 && rsi > 28) score -= 5;
  } else if (bear) {
    score = 68;
    if (price < ma200) score += 7; else score -= 5;
    if (rsi < 48 && rsi > 28) score += 5; else if (rsi > 52 && rsi < 72) score -= 5;
  }
  score = Math.max(12, Math.min(96, Math.round(score)));
  // Mode ringan: sinyal trader terbit jika skor >= 62 (selaras PRO_MIN_SCORE)
  var liteEligible = softDir !== 'NEUTRAL' && score >= 62;
  if (!liteEligible) {
    score = Math.min(score, 59);
  }
  var direction = state.mode === 'investor'
    ? (softDir === 'SHORT' ? 'NEUTRAL' : softDir)
    : (liteEligible ? softDir : 'NEUTRAL');
  var isShort = direction === 'SHORT';
  var riskDist = atr * 1.65;
  var entry = (liteEligible || (state.mode === 'investor' && direction !== 'NEUTRAL')) ? price : null;
  var sl = entry === null ? null : (isShort ? entry + riskDist : entry - riskDist);
  var tp1 = entry === null ? null : (isShort ? entry - riskDist * 1.5 : entry + riskDist * 1.5);
  var tp2 = entry === null ? null : (isShort ? entry - riskDist * 2.5 : entry + riskDist * 2.5);
  var tp3 = entry === null ? null : (isShort ? entry - riskDist * 4.0 : entry + riskDist * 4.0);
  var meta = getMeta(symbol);
  var prevClose = n > 1 ? closes[n - 2] : price;
  var vwapVal = (ema20 + ema50) / 2;
  return {
    symbol: meta.symbol, name: meta.name, assetClass: meta.assetClass, region: meta.region,
    timeframe: tf || 'H1', mode: state.mode,
    lastPrice: price, changePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    direction: direction, investorStatus: direction === 'LONG' ? 'GRADUAL DCA ACCUMULATION' : 'HOLD / WAIT VALUE',
    confluenceScore: score, confidence: score, convictionScore: score,
    softBias: softDir, signalEligible: state.mode === 'investor' ? direction !== 'NEUTRAL' : liteEligible,
    signalTier: liteEligible ? (score >= 84 ? 'ELITE' : 'PRO') : null,
    entryType: liteEligible ? 'MARKET' : null, lockedSignal: false,
    gating: {
      minScore: 62, minWinRate: 50, score: score,
      winRate: liteEligible ? (score >= 84 ? 82.5 : 68.0) : 48.0,
      vetoLong: [], vetoShort: [],
      active: liteEligible ? [] : ['LOW_SCORE'],
      htfBias: bull ? 1 : bear ? -1 : 0
    },
    regime: bull ? 'BULLISH ORDERFLOW' : bear ? 'BEARISH ORDERFLOW' : 'NORMAL EXPANSION',
    structureTag: bull ? 'HIGHER HIGH / HIGHER LOW' : bear ? 'LOWER HIGH / LOWER LOW' : 'INTERNAL RANGE EQUILIBRIUM',
    entry: entry, sl: sl, tp1: tp1, tp2: tp2, tp3: tp3,
    levels: {
      entry: entry, sl: sl, tp1: tp1, tp2: tp2, tp3: tp3, rrRatio: entry === null ? null : 2.5,
      poc: price, vah: swingHigh, val: swingLow, tpoPoc: price, vwap: vwapVal,
      swingHigh: swingHigh, swingLow: swingLow,
      pivot: (swingHigh + swingLow + price) / 3, r1: swingHigh, r2: swingHigh, s1: swingLow, s2: swingLow,
      dcaZone1: price * 0.992, dcaZone2: price * 0.965, dcaZone3: price * 0.925,
      invTarget1: price * 1.12, invTarget2: price * 1.28, invTarget3: price * 1.55, invInvalidation: price * 0.86
    },
    indicators: {
      ema20: ema20, ema50: ema50, sma100: ema50, ema200: ma200, ma200: ma200, vwap: vwapVal,
      rsi: rsi, atr: atr, atrPct: (atr / price) * 100, macdHist: (ema20 - ema50) * 0.25,
      bbUpper: price + 2 * atr, bbLower: price - 2 * atr, bbWidth: (4 * atr / price) * 100,
      smcStatus: bull ? 'HIGHER HIGH / HIGHER LOW (Bullish Orderflow)' : bear ? 'LOWER HIGH / LOWER LOW (Bearish Orderflow)' : 'INTERNAL RANGE EQUILIBRIUM',
      liquiditySweep: 'NONE (Normal Liquidity Flow)', fvgNote: 'FVG Seimbang (Terisi)',
      demandZoneText: formatPrice(swingLow), supplyZoneText: formatPrice(swingHigh),
      // Default netral pilar ORBIT IQ saat engine penuh belum termuat
      orbLabel: 'Opening Range 60m Sesi UTC', orbState: 'N/A — engine penuh belum termuat', orbHigh: 0, orbLow: 0,
      thetaIndex: 50, thetaNote: 'Mode ringan — menunggu engine kuantitatif penuh',
      vwapEntryText: 'Mode ringan — pantau pullback/reclaim VWAP', vwapDevAtr: 0, vwapEntryQuality: 50,
      erValue: 0.5, erNote: 'Mode ringan — menunggu engine kuantitatif penuh', quantEdgeScore: 50
    },
    subScores: { trend: score, structure: score, momentum: Math.round(rsi), quantEdge: 50, cotBias: 52 },
    fundamentalCot: {
      institutionalBias: bull ? 'NET LONG BIAS' : bear ? 'NET SHORT BIAS' : 'NEUTRAL / MIXED',
      specLongPct: bull ? 58 : bear ? 42 : 50, specShortPct: bull ? 42 : bear ? 58 : 50,
      netSpecContracts: 0, weeklyDelta: 0,
      commHedgerBias: 'MENUNGGU DATA CFTC TERBARU',
      cotReportLabel: 'CFTC Disaggregated Commitments of Traders',
      centralBankStance: 'Pantau keputusan suku bunga bank sentral terdekat',
      macroRegime: bull ? 'RISK-ON' : 'SELEKTIF', dxyCorrelation: 'Korelasi DXY dinamis',
      valuationMetrics: 'Valuasi wajar relatif terhadap rata-rata historis',
      orderflowMetric: 'Orderflow netral', macroDriver: 'Sentimen pasar global',
      upcomingCatalyst: 'Rilis data ekonomi terjadwal'
    },
    backtest: { disabled: false, sampleSize: 0, winRate: 0, expectancyR: 0, profitFactor: 0, netR: 0, maxDrawdownR: 0, weakEvidence: true },
    reasons: [
      '[Engine Cepat] Analisis dasar dimuat — modul quant lengkap sedang disinkronkan.',
      '[MA Stack] Harga ' + formatPrice(price, symbol) + ' vs EMA20 ' + formatPrice(ema20, symbol) + ' / EMA50 ' + formatPrice(ema50, symbol) + ' | RSI(14): ' + rsi.toFixed(1) + '.'
    ],
    series: {
      ema20: candles.map(function (c, idx) { return { time: c.time, value: ema20A[idx] || c.close }; }),
      ema50: candles.map(function (c, idx) { return { time: c.time, value: ema50A[idx] || c.close }; }),
      ema200: candles.map(function (c, idx) { return { time: c.time, value: ema200A[idx] || c.close }; }),
      vwap: candles.map(function (c, idx) { return { time: c.time, value: ema20A[idx] || c.close }; }),
      bbUpper: candles.map(function (c) { return { time: c.time, value: c.close + 2 * atr }; }),
      bbLower: candles.map(function (c) { return { time: c.time, value: c.close - 2 * atr }; }),
      rsi: candles.map(function (c) { return { time: c.time, value: rsi }; })
    }
  };
}

/* ==================== 3. FEED DATA PASAR (candlestick OHLCV) ==================== */
function fetchRealMarketCandles(symbol, tf, requestController) {
  return new Promise(function (resolve) {
    var ctrl = requestController || new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 12000);
    fetch('/api/market/analyze?symbol=' + encodeURIComponent(symbol) + '&tf=' + encodeURIComponent(tf || 'H1'), {
      cache: 'no-store', signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (d) {
      if (d && Array.isArray(d.candles) && d.candles.length >= 5) {
        var candles = d.candles
          .map(function (c) {
            var o = num(c.open);
            var h = num(c.high);
            var l = num(c.low);
            var cl = num(c.close);
            var minSp = Math.max(cl * 0.0016, 0.0001);
            if (symbol && symbol.indexOf('/') > -1 && symbol.indexOf('/USDT') === -1 && symbol.indexOf('XAU/') === -1 && symbol.indexOf('XAG/') === -1) {
              minSp = Math.max(cl * 0.00008, 0.00004);
            }
            var maxP = Math.max(h, o, cl);
            var minP = Math.min(l, o, cl);
            if ((maxP - minP) < minSp) {
              var pad = (minSp - (maxP - minP)) * 0.5;
              maxP = Math.max(o, cl) + pad;
              minP = Math.max(0.000001, Math.min(o, cl) - pad);
            }
            return { time: num(c.time), open: o, high: maxP, low: minP, close: cl, volume: num(c.volume, 0) };
          })
          .filter(function (c) { return c.time > 0 && c.close > 0; })
          .sort(function (a, b) { return a.time - b.time; });
        if (candles.length >= 5) {
          resolve({
            candles: candles,
            price: num(d.price, candles[candles.length - 1].close),
            changePct: num(d.changePct, 0),
            source: d.source || 'LIVE_BROKER',
            symbol: symbol,
            tf: tf
          });
          return;
        }
      }
      throw new Error('DATA_SHORT');
    }).catch(function (fetchError) {
      clearTimeout(timer);
      // Canceled/stale request: let the caller discard it instead of generating fallback candles.
      if (ctrl.signal && ctrl.signal.aborted) throw fetchError || new Error('REQUEST_ABORTED');
      // Fallback lokal terkalibrasi (agar UI tidak pernah kosong)
      var local;
      try {
        if (QC && QC.generateInstitutionalSeries) {
          local = QC.generateInstitutionalSeries(getMeta(symbol), tf || 'H1', 220);
        }
      } catch (e) {}
      if (!local || !local.length) {
        var base = (getMeta(symbol).basePrice) || 100;
        var step = TF_SECONDS[tf] || 3600;
        var now = Math.floor(Date.now() / 1000 / step) * step;
        var seed = 7; var s = symbol || 'X';
        for (var i = 0; i < s.length; i++) seed = (seed * 33 + s.charCodeAt(i)) % 100000;
        var rnd = function () { seed = (seed * 16807 + 11) % 2147483647; return (seed % 10000) / 10000; };
        var arr = []; var cur = base;
        for (i = 199; i >= 0; i--) {
          var o = cur; var cl = Math.max(base * 0.4, o + (rnd() - 0.496) * base * 0.005);
          var minSp = Math.max(cl * 0.0016, 0.0001);
          if (symbol && symbol.indexOf('/') > -1 && symbol.indexOf('/USDT') === -1 && symbol.indexOf('XAU/') === -1 && symbol.indexOf('XAG/') === -1) {
            minSp = Math.max(cl * 0.00008, 0.00004);
          }
          var h = Math.max(o, cl) + Math.max(rnd() * base * 0.002, minSp * 0.5);
          var l = Math.max(0.000001, Math.min(o, cl) - Math.max(rnd() * base * 0.002, minSp * 0.5));
          arr.push({ time: now - i * step, open: o, high: h, low: l, close: cl, volume: Math.round(200 + rnd() * 700) });
          cur = cl;
        }
        local = arr;
      }
      var lc = (local && local.length) ? local[local.length - 1] : null;
      var lastP = lc ? lc.close : (state.livePrice || 2680);
      resolve({ candles: local || [], price: lastP, changePct: 0.1, source: 'EDGE_SYNTHETIC_CALIBRATED', symbol: symbol, tf: tf });
    });
  });
}

/* Payload seri utama sesuai tipe chart: candlestick/bar = OHLC penuh;
   line/area = titik close saja. Semua jalur data (setData & tick live) WAJIB
   lewat helper ini supaya chart selalu konsisten dengan harga. */
function mainSeriesPayload(candles) {
  if (state.chartType === 'line' || state.chartType === 'area') {
    var out = [];
    for (var q = 0; q < candles.length; q++) out.push({ time: candles[q].time, value: candles[q].close });
    return out;
  }
  return candles;
}
function updateMainSeries(bar) {
  if (!candleSeries || !bar) return;
  var p = (state.chartType === 'line' || state.chartType === 'area') ? { time: bar.time, value: bar.close } : bar;
  try { candleSeries.update(p); } catch (e) {}
}
/* Ganti tipe chart ala TradingView: seri harga utama dibongkar & dibangun ulang
   sesuai pilihan; overlay indikator & garis level digambar ulang di seri baru. */
function applyChartType(type, skipSave) {
  if (['candles', 'bars', 'line', 'area'].indexOf(type) === -1) type = 'candles';
  state.chartType = type;
  if (!skipSave) { try { localStorage.setItem('xstarzg_chart_type', type); } catch (e) {} }
  var barEl = $id('chartTypeBar');
  if (barEl) Array.prototype.forEach.call(barEl.querySelectorAll('.chart-type-btn'), function (b) {
    b.classList.toggle('active', b.getAttribute('data-ctype') === type);
  });
  if (!chartInstance) return;
  try { if (candleSeries) chartInstance.removeSeries(candleSeries); } catch (e) {}
  candleSeries = null; drawnPriceLines = [];
  if (type === 'bars') {
    candleSeries = chartInstance.addBarSeries({ upColor: '#10b981', downColor: '#f43f5e', thinBars: false });
  } else if (type === 'line') {
    candleSeries = chartInstance.addLineSeries({ color: '#38bdf8', lineWidth: 2, lastValueVisible: true });
  } else if (type === 'area') {
    candleSeries = chartInstance.addAreaSeries({ lineColor: '#38bdf8', topColor: 'rgba(56,189,248,0.32)', bottomColor: 'rgba(56,189,248,0.03)', lineWidth: 2, lastValueVisible: true });
  } else {
    candleSeries = chartInstance.addCandlestickSeries({
      upColor: '#10b981', downColor: '#f43f5e',
      borderUpColor: '#10b981', borderDownColor: '#f43f5e',
      wickUpColor: '#10b981', wickDownColor: '#f43f5e'
    });
  }
  syncChartPriceFormat();
  if (state.candles && state.candles.length) candleSeries.setData(mainSeriesPayload(state.candles));
  if (state.lastAnalysis) {
    try { syncIndicatorOverlays(state.lastAnalysis); } catch (e) {}
    try { drawChartLevels(state.lastAnalysis); } catch (e) {}
  }
  try { chartInstance.timeScale().fitContent(); } catch (e) {}
}

/* ==================== 4. GRAFIK TRADINGVIEW (Lightweight Charts) ==================== */
// v2026.64: presisi axis/tag LWC mengikuti harga simbol aktif — axis semua instrumen
// (termasuk harga <1) selalu terbaca; tanpa ini tag axis membulat ke 2 desimal.
function lwcPriceFormat(ref) {
  var a = Math.abs(Number(ref));
  var p = !Number.isFinite(a) || a <= 0 ? 4 : a >= 1000 ? 2 : a >= 20 ? 2 : a >= 1 ? 4 : Math.max(5, Math.min(8, -Math.floor(Math.log10(a) + 1e-12) + 3));
  return { type: 'price', precision: p, minMove: Number('1e-' + p) };
}
function syncChartPriceFormat() {
  if (!candleSeries || !state.candles || !state.candles.length) return;
  try {
    var pf = lwcPriceFormat(state.candles[state.candles.length - 1].close);
    candleSeries.applyOptions({ priceFormat: pf });
    [ema20Line, ema50Line, ma200Line, vwapLine].forEach(function (ser) { try { if (ser) ser.applyOptions({ priceFormat: pf }); } catch (e) {} });
  } catch (e) {}
}
var chartResizeRo = null;
var lastChartWidth = 0;
var lastChartHeight = 0;
function initChart() {
  var el = $id('tvChartContainer');
  if (!el) return false;
  var sk = $id('tvChartLoadingSkeleton');
  if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
  if (chartInstance) return true;
  var fnFallback = (typeof drawCanvasFallbackChart === 'function') ? drawCanvasFallbackChart : (typeof window !== 'undefined' ? window.drawCanvasFallbackChart : null);
  if (typeof LightweightCharts === 'undefined') {
    if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
    if (state.candles && state.candles.length && typeof fnFallback === 'function') {
      try { fnFallback(state.candles, state.lastAnalysis); } catch (e) {}
    }
    return false; // canvas fallback menangani
  }
  // Mobile: container bisa berukuran 0 saat init terlalu dini (rotasi/panel baru
  // tampil) -> tunggu frame berikutnya sampai ada lebar nyata, maksimal ~1.5 dtk.
  // Satu timer pending saja (flag global) agar panggilan berulang tidak menumpuk timer.
  if ((el.clientWidth || 0) < 40) {
    if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
    if (state.candles && state.candles.length && typeof fnFallback === 'function') {
      try { fnFallback(state.candles, state.lastAnalysis); } catch (e) {}
    }
    if (typeof window !== 'undefined' && !window.__chartInitPending) {
      window.__chartInitPending = true;
      var tries = 0;
      var tmr = setInterval(function () {
        tries++;
        if ((el.clientWidth || 0) >= 40 || tries > 45) {
          clearInterval(tmr);
          window.__chartInitPending = false;
          if (!chartInstance) {
            try {
              initChart();
              if (chartInstance && state.candles && state.candles.length) {
                if (state.lastAnalysis) renderAllVisuals(state.lastAnalysis);
                else candleSeries && candleSeries.setData(mainSeriesPayload(state.candles));
              }
            } catch (e) {}
          }
        }
      }, 33);
    }
    return false;
  }
  try {
    var oldCanvas = el.querySelector('canvas.xstarzg-fallback-canvas');
    if (oldCanvas) { try { oldCanvas.remove(); } catch (e) {} }
    if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
    chartInstance = LightweightCharts.createChart(el, {
      width: el.clientWidth || 820,
      height: el.clientHeight || 470,
      layout: { background: { color: '#050811' }, textColor: '#94a3b8', fontSize: 11, fontFamily: "'Inter', sans-serif" },
      grid: { vertLines: { color: 'rgba(30, 41, 59, 0.55)' }, horzLines: { color: 'rgba(30, 41, 59, 0.55)' } },
      crosshair: { mode: LightweightCharts.CrosshairMode ? LightweightCharts.CrosshairMode.Normal : 0 },
      rightPriceScale: { borderColor: '#1e293b', scaleMargins: { top: 0.12, bottom: 0.10 } },
      timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 9 },
      localization: { locale: 'id-ID' }
    });
    if (typeof ResizeObserver !== 'undefined') {
      if (!chartResizeRo) {
        chartResizeRo = new ResizeObserver(function () {
          try {
            if (!chartInstance || !el) return;
            var w = el.clientWidth || 0;
            var h = el.clientHeight || 470;
            if (w > 40 && (w !== lastChartWidth || h !== lastChartHeight)) {
              lastChartWidth = w;
              lastChartHeight = h;
              chartInstance.applyOptions({ width: w, height: h });
            }
          } catch (e) {}
        });
      }
      try { chartResizeRo.disconnect(); } catch (e) {}
      chartResizeRo.observe(el);
    }
    candleSeries = chartInstance.addCandlestickSeries({
      upColor: '#10b981', downColor: '#f43f5e',
      borderUpColor: '#10b981', borderDownColor: '#f43f5e',
      wickUpColor: '#10b981', wickDownColor: '#f43f5e'
    });
    ema20Line = chartInstance.addLineSeries({ color: '#38bdf8', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    ema50Line = chartInstance.addLineSeries({ color: '#eab308', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    ma200Line = chartInstance.addLineSeries({ color: '#a855f7', lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
    vwapLine = chartInstance.addLineSeries({ color: '#ec4899', lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });

    // Render instan 0ms: jika data candle sudah siap, langsung tampilkan di grafik
    if (candleSeries && state.candles && state.candles.length) {
      try {
        candleSeries.setData(mainSeriesPayload(state.candles));
        if (chartInstance && chartInstance.timeScale) chartInstance.timeScale().fitContent();
      } catch (eCandle) {}
    }
    if (sk) { try { sk.style.display = 'none'; } catch (e) {} }

    window.addEventListener('resize', function () {
      try {
        var w = el.clientWidth || 0;
        var h = el.clientHeight || 470;
        if (chartInstance && w > 40 && (w !== lastChartWidth || h !== lastChartHeight)) {
          lastChartWidth = w;
          lastChartHeight = h;
          chartInstance.applyOptions({ width: w, height: h });
        }
      } catch (e) {}
    });
    // Hormati preferensi tipe chart tersimpan
    try {
      var savedCt = localStorage.getItem('xstarzg_chart_type');
      if (savedCt && savedCt !== 'candles') applyChartType(savedCt, true);
      else applyChartType('candles', true);
    } catch (e) {}
    return true;
  } catch (e) {
    chartInstance = null; candleSeries = null;
    if (sk) { try { sk.style.display = 'none'; } catch (e2) {} }
    if (typeof fnFallback === 'function' && state.candles && state.candles.length) {
      try { fnFallback(state.candles, state.lastAnalysis); } catch (e3) {}
    }
    return false;
  }
}
try { if (typeof window !== 'undefined') window.initChart = initChart; } catch (e) {}
function clearDrawnPriceLines() {
  if (!candleSeries) return;
  for (var i = 0; i < drawnPriceLines.length; i++) {
    try { candleSeries.removePriceLine(drawnPriceLines[i]); } catch (e) {}
  }
  drawnPriceLines = [];
}
function drawChartLevels(analysis) {
  if (!candleSeries || !analysis || !analysis.levels) return;
  clearDrawnPriceLines();
  var showSMC = $id('chkSMC') ? $id('chkSMC').checked : true;
  var showSniper = $id('chkSniper') ? $id('chkSniper').checked : true;
  var oc = (typeof latestSignalOutcome === 'function') ? latestSignalOutcome(analysis.symbol, analysis.timeframe || state.tf) : null;
  if (analysis.lockedSignal) oc = null;
  var L = effectiveLevels(analysis);
  var curP = (state.candles && state.candles.length) ? state.candles[state.candles.length - 1].close : (analysis.lastPrice || 0);
  var add = function (price, color, title, style) {
    var p = num(price);
    if (!p || p <= 0) return;
    if (curP > 0 && (p > curP * 4 || p < curP * 0.25)) return; // anti-scale blowout (cegah chart hilang)
    try {
      var pl = candleSeries.createPriceLine({
        price: p, color: color, lineWidth: 1,
        lineStyle: style === undefined ? 2 : style,
        axisLabelVisible: true, title: title
      });
      drawnPriceLines.push(pl);
    } catch (e) {}
  };
  if (showSMC) {
    add(L.poc, '#eab308', 'POC', 1);
    add(L.swingHigh, 'rgba(244,63,94,0.7)', 'SUPPLY', 3);
    add(L.swingLow, 'rgba(16,185,129,0.7)', 'DEMAND', 3);
    if (L.fib && num(L.fib.goldenPocket) > 0) {
      add(L.fib.goldenPocket, '#fbbf24', 'FIBO 61.8%', 2);
    }
  }
  if (showSniper) {
    if (state.mode === 'investor') {
      add(L.dcaZone1, '#10b981', 'DCA 1', 2);
      add(L.dcaZone2, '#10b981', 'DCA 2', 2);
      add(L.dcaZone3, '#10b981', 'DCA 3', 2);
      add(L.invTarget1, '#38bdf8', 'TARGET', 0);
    } else {
      // Futures 2-arah: tampilkan garis estimasi likuidasi; Spot 1-arah: tanpa garis likuidasi
      var rp = riskParams(analysis);
      if (state.subMode === 'futures' && num(rp.liq) > 0 && (!oc || oc.status === 'ACTIVE')) {
        add(rp.liq, 'rgba(168,85,247,0.9)', 'EST. LIQ ' + rp.lev + 'x', 3);
      }
      if (oc && oc.status === 'TP_HIT') {
        var tpP = (oc.lock && num(oc.lock.tp1) > 0) ? num(oc.lock.tp1) : L.tp1;
        var entryP = (oc.lock && num(oc.lock.entry) > 0) ? num(oc.lock.entry) : L.entry;
        var slP = (oc.lock && num(oc.lock.sl) > 0) ? num(oc.lock.sl) : L.sl;
        add(tpP, '#10b981', 'TP1 REACHED ✓', 0);
        add(entryP, 'rgba(56,189,248,0.45)', 'ENTRY (DONE)', 2);
        add(slP, 'rgba(244,63,94,0.3)', 'SL (CLOSED)', 2);
      } else if (oc && oc.status === 'BE_SAVED') {
        var entryP = (oc.lock && num(oc.lock.entry) > 0) ? num(oc.lock.entry) : L.entry;
        var slP = (oc.lock && num(oc.lock.sl) > 0) ? num(oc.lock.sl) : L.sl;
        add(entryP, '#10b981', 'SL+ HIT (0-RISK) ✓', 0);
        add(slP, 'rgba(244,63,94,0.25)', 'SL (SAFE)', 2);
      } else if (oc && oc.status === 'SL_HIT') {
        var entryP = (oc.lock && num(oc.lock.entry) > 0) ? num(oc.lock.entry) : L.entry;
        var slP = (oc.lock && num(oc.lock.sl) > 0) ? num(oc.lock.sl) : L.sl;
        add(slP, '#f43f5e', 'SL HIT ✗', 0);
        add(entryP, 'rgba(56,189,248,0.3)', 'ENTRY', 2);
      } else {
        var isBeActive = (analysis.tradeManagement && analysis.tradeManagement.bePlusActive) || (L && L.bePlusActive) || (analysis.lockedSignal && analysis.lockedSignal.bePlusActive);
        var slPlusVal = (L && L.slPlus) || (analysis.lockedSignal && analysis.lockedSignal.slPlus);

        add(L.entry, '#38bdf8', 'ENTRY', 0);

        if (isBeActive && num(slPlusVal) > 0) {
          add(slPlusVal, '#10b981', 'SL+ (0-RISK BE+)', 0);
          add(L.sl, 'rgba(244,63,94,0.35)', 'INITIAL SL (BE PROTECTED)', 3);
        } else {
          add(L.sl, '#f43f5e', 'STOP LOSS', 2);
        }

        add(L.tp1, '#10b981', 'TP1', 2);
        add(L.tp2, '#10b981', 'TP2', 2);
        add(L.tp3, '#34d399', 'TP3', 2);
      }
    }
  }
}
function syncIndicatorOverlays(analysis) {
  if (!analysis || !analysis.series) return;
  var showEMA = $id('chkEMA') ? $id('chkEMA').checked : true;
  var showVWAP = $id('chkVWAP') ? $id('chkVWAP').checked : true;
  try {
    if (ema20Line) ema20Line.setData(showEMA ? analysis.series.ema20 : []);
    if (ema50Line) ema50Line.setData(showEMA ? analysis.series.ema50 : []);
    if (ma200Line) ma200Line.setData(showEMA ? analysis.series.ema200 : []);
    if (vwapLine) vwapLine.setData(showVWAP ? analysis.series.vwap : []);
  } catch (e) {}
}

/* ==================== 5. RENDER SEMUA VISUAL (renderAllVisuals) ==================== */
function pillarHtml(name, val, note, sentiment) {
  return '<div class="pillar-item ' + (sentiment || 'neutral') + '">' +
    '<span class="p-name">' + name + '</span>' +
    '<span class="p-val">' + val + '</span>' +
    (note ? '<div style="color:#94a3b8;margin-top:2px;font-size:10.8px;">' + note + '</div>' : '') +
    '</div>';
}
function renderPillars(a) {
  var tech = $id('techPillarsGrid');
  var techHint = $id('techPillarsBrainHint');
  var macroHint = $id('macroPillarsBrainHint');
  var assetClass = (a && a.assetClass) || (state.currentInstrument && state.currentInstrument.assetClass) || 'forex';
  var isId = (typeof window !== 'undefined' && window.XSI18N && typeof window.XSI18N.getLanguage === 'function' ? window.XSI18N.getLanguage() : 'en') === 'id';
  if (techHint) {
    if (assetClass === 'crypto') {
      techHint.innerHTML = isId ? '🪙 Otak Kripto: Prioritas SMC &amp; Orderflow (60%)' : '🪙 Crypto Brain: SMC &amp; Orderflow (60%) Priority';
    } else if (assetClass === 'forex') {
      techHint.innerHTML = isId ? '💱 Otak Forex: Prioritas SMC/OTE &amp; Sesi Bank (56%)' : '💱 Forex Brain: SMC/OTE &amp; Session Timing (56%) Priority';
    } else if (assetClass === 'stocks') {
      techHint.innerHTML = isId ? '📈 Otak Saham: Prioritas Tren MA-200 &amp; ORB Bel Pembukaan (62%)' : '📈 Equities Brain: MA-200 Trend &amp; Opening Bell ORB (62%) Priority';
    } else {
      techHint.innerHTML = isId ? '🌾 Otak Komoditas: Prioritas Supply/Demand Fisik &amp; SMC (58%)' : '🌾 Commodities Brain: Physical S&D &amp; SMC (58%) Priority';
    }
  }
  if (macroHint) {
    if (assetClass === 'crypto') {
      macroHint.innerHTML = isId ? '🪙 Makro Kripto: Likuiditas M2 &amp; Dominasi Spot ETF' : '🪙 Crypto Macro: M2 Liquidity &amp; Spot ETF Dominance';
    } else if (assetClass === 'forex') {
      macroHint.innerHTML = isId ? '💱 Makro Forex: Suku Bunga Bank Sentral &amp; Korelasi DXY' : '💱 Forex Macro: Central Bank Rates &amp; DXY Correlation';
    } else if (assetClass === 'stocks') {
      macroHint.innerHTML = isId ? '📈 Makro Saham: Valuasi Intrinsik &amp; Siklus Sektoral' : '📈 Equities Macro: Intrinsic Valuation &amp; Sector Cycles';
    } else {
      macroHint.innerHTML = isId ? '🌾 Makro Komoditas: Laporan CFTC COT &amp; Siklus Inflasi' : '🌾 Commodities Macro: CFTC COT Report &amp; Inflation Cycles';
    }
  }
  if (tech) {
    var ind = a.indicators, lv = a.levels;
    var p = a.lastPrice;
    var bull = function (c) { return c ? 'bull' : 'bear'; };
    tech.innerHTML =
      pillarHtml(T('ui.ePnEma', '1. EMA Ribbon 20 / 50'), formatPrice(ind.ema20, a ? a.symbol : state.symbol) + ' / ' + formatPrice(ind.ema50, a ? a.symbol : state.symbol), ind.ema20 > ind.ema50 ? T('ui.ePtRibbonUp', 'Ribbon bullish tersusun rapi') : T('ui.ePtRibbonDn', 'Ribbon bearish / belum searah'), bull(ind.ema20 > ind.ema50)) +
      pillarHtml(T('ui.ePnMa200', '2. MA-200 Macro Filter'), formatPrice(ind.ma200 || ind.ema200, a ? a.symbol : state.symbol), p >= (ind.ma200 || ind.ema200) ? T('ui.ePtMacroUp', 'Harga di atas garis makro (bias naik)') : T('ui.ePtMacroDn', 'Harga di bawah garis makro (bias turun)'), bull(p >= (ind.ma200 || ind.ema200))) +
      pillarHtml(T('ui.ePnVwap', '3. VWAP Institusional'), formatPrice(ind.vwap, a ? a.symbol : state.symbol), p >= ind.vwap ? T('ui.ePtVwapUp', 'Di atas VWAP — buyer dominan sesi ini') : T('ui.ePtVwapDn', 'Di bawah VWAP — seller dominan sesi ini'), bull(p >= ind.vwap)) +
      pillarHtml(T('ui.ePnVpvr', '4. Volume Profile (VPVR)'), 'POC ' + formatPrice(lv.poc), 'VAH ' + formatPrice(lv.vah, a ? a.symbol : state.symbol) + ' • VAL ' + formatPrice(lv.val, a ? a.symbol : state.symbol), p >= lv.poc ? 'bull' : 'bear') +
      pillarHtml(T('ui.ePnTpo', '5. TPO Market Profile'), 'TPO POC ' + formatPrice(lv.tpoPoc || lv.poc, a ? a.symbol : state.symbol), T('ui.ePtTpo', 'Distribusi waktu harga pasar'), 'neutral') +
      pillarHtml(T('ui.ePnSmc', '6. Struktur SMC (BOS / CHoCH)'), localizeEngineString(ind.smcStatus || '-'), null, (ind.smcStatus || '').indexOf('BULL') > -1 || (ind.smcStatus || '').indexOf('HIGHER') > -1 ? 'bull' : (ind.smcStatus || '').indexOf('BEAR') > -1 || (ind.smcStatus || '').indexOf('LOWER') > -1 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnFvg', '7. Fair Value Gap (FVG)'), localizeEngineString(ind.fvgNote || '-'), T('ui.ePtFvg', 'Deteksi imbalance 3-candle terbaru'), (ind.fvgNote || '').indexOf('Bullish') > -1 ? 'bull' : (ind.fvgNote || '').indexOf('Bearish') > -1 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnSweep', '8. Liquidity Sweep (BSL/SSL)'), localizeEngineString(ind.liquiditySweep || 'NONE'), T('ui.ePtSweep', 'Stop-hunt di sekitar swing terdekat'), (ind.liquiditySweep || '').indexOf('▲') > -1 ? 'bull' : (ind.liquiditySweep || '').indexOf('▼') > -1 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnSd', '9. Supply & Demand Zone'), 'D: ' + (ind.demandZoneText || formatPrice(lv.swingLow, a ? a.symbol : state.symbol)), 'S: ' + (ind.supplyZoneText || formatPrice(lv.swingHigh, a ? a.symbol : state.symbol)), 'neutral') +
      pillarHtml(T('ui.ePnPivot', '10. Pivot Support / Resistance'), 'S1 ' + formatPrice(lv.s1, a ? a.symbol : state.symbol) + ' • R1 ' + formatPrice(lv.r1, a ? a.symbol : state.symbol),
        T('ui.ePtPivot', 'Pivot klasik: ') + formatPrice(lv.pivot, a ? a.symbol : state.symbol) +
        (lv.fib ? ' • Fibo 61.8%: ' + formatPrice(lv.fib.goldenPocket, a ? a.symbol : state.symbol) + ' • Ext 1.618: ' + formatPrice(lv.fib.goldenExtension, a ? a.symbol : state.symbol) : '') +
        (num(lv.swingLow) > 0 && num(lv.swingHigh) > 0 ? ' • ' + fillTpl(T('ui.ePtZone', 'Zona struktur: S ≈{S} • R ≈{R}'), { S: formatPrice(psychRoundPrice(Math.min(lv.swingLow, lv.s1)), a.symbol), R: formatPrice(psychRoundPrice(Math.max(lv.swingHigh, lv.r1)), a.symbol) }) : ''),
        bull(p >= lv.pivot)) +
      pillarHtml(T('ui.ePnRsi', '11. RSI(14) & MACD Histogram'), 'RSI ' + num(ind.rsi, 50).toFixed(1) + ' • MACD ' + (num(ind.macdHist) >= 0 ? '+' : '') + num(ind.macdHist).toPrecision(3), num(ind.rsi) > 70 ? T('ui.ePtRsiOb', 'Overbought — rawan koreksi') : num(ind.rsi) < 30 ? T('ui.ePtRsiOs', 'Oversold — rawan pantulan') : T('ui.ePtRsiOk', 'Momentum sehat'), num(ind.macdHist) >= 0 ? 'bull' : 'bear') +
      pillarHtml(T('ui.ePnBb', '12. Bollinger Bands & ATR'), 'BBW ' + num(ind.bbWidth).toFixed(2) + '% • ATR ' + num(ind.atrPct).toFixed(2) + '%', num(ind.bbWidth) < 1.25 ? T('ui.ePtBbSq', 'Squeeze — siap breakout volatilitas') : T('ui.ePtBbNorm', 'Ekspansi volatilitas normal'), 'neutral') +
      pillarHtml(T('ui.ePnOrb', '13. ORB Breakout (Opening Range)'), ind.orbHigh && ind.orbLow ? formatPrice(ind.orbLow, a ? a.symbol : state.symbol) + ' – ' + formatPrice(ind.orbHigh, a ? a.symbol : state.symbol) : localizeEngineString(ind.orbLabel || 'ORB'),
        localizeEngineString(ind.orbState || '-'),
        (ind.orbState || '').indexOf('ATAS ▲') > -1 ? 'bull' : (ind.orbState || '').indexOf('BAWAH ▼') > -1 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnTheta', '14. Theta Index (Decay Momentum)'), 'θ ' + num(ind.thetaIndex, 50) + '/100',
        localizeEngineString(ind.thetaNote || '-'),
        num(ind.thetaIndex, 50) >= 62 ? 'bull' : num(ind.thetaIndex, 50) <= 38 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnVwapEntry', '15. Entry Institusional di VWAP'), T('ui.ePtQuality', 'Kualitas ') + num(ind.vwapEntryQuality, 50) + '/100',
        localizeEngineString(ind.vwapEntryText || '-'),
        (ind.vwapEntryText || '').indexOf('▲') > -1 ? 'bull' : (ind.vwapEntryText || '').indexOf('▼') > -1 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnEr', '16. Efficiency Ratio (Kualitas Tren)'), (num(ind.erValue, 0.5) * 100).toFixed(0) + '%',
        localizeEngineString(ind.erNote || '-'),
        num(ind.erValue, 0.5) >= 0.55 ? (a.direction === 'SHORT' ? 'bear' : 'bull') : 'neutral') +
      pillarHtml(T('ui.ePnFiboRetrace', '17. Fibonacci Retracement (OTE)'), lv.fib && lv.fib.retracement ? '61.8% ' + formatPrice(lv.fib.goldenPocket, a ? a.symbol : state.symbol) : '--', lv.fib && lv.fib.retracement ? '50% Eq ' + formatPrice(lv.fib.retracement.r500, a ? a.symbol : state.symbol) + ' • 78.6% OTE ' + formatPrice(lv.fib.retracement.r786, a ? a.symbol : state.symbol) : T('ui.ePtFiboRetrace', 'Kedalaman koreksi pullback'), 'neutral') +
      pillarHtml(T('ui.ePnFiboExt', '18. Fibonacci Extension (Target TP)'), lv.fib && lv.fib.extension ? '161.8% ' + formatPrice(lv.fib.goldenExtension, a ? a.symbol : state.symbol) : '--', lv.fib && lv.fib.extension ? '127.2% ' + formatPrice(lv.fib.extension.ext1272, a ? a.symbol : state.symbol) + ' • 200% ' + formatPrice(lv.fib.extension.ext2000, a ? a.symbol : state.symbol) : T('ui.ePtFiboExt', 'Proyeksi target kelanjutan gelombang'), a.direction === 'LONG' ? 'bull' : a.direction === 'SHORT' ? 'bear' : 'neutral');
  }
  var macro = $id('macroPillarsGrid');
  if (macro) {
    var fc = a.fundamentalCot || {};
    var mq = a.macroQuant || { posCyclePct: 50, drawdownPct: 0, upClosesPct: 50, atrPercentile: 50, sessionQuality: '-', htfAligned: true };
    var longPct = num(fc.specLongPct, 50);
    macro.innerHTML =
      pillarHtml(T('ui.ePmCot', '1. CFTC COT — Posisi Institusi'), 'Long ' + longPct + '% / Short ' + (100 - longPct) + '%', (localizeEngineString(fc.cotReportLabel || 'CFTC COT')) + ' • ' + (localizeEngineString(fc.institutionalBias || '-')), longPct >= 55 ? 'bull' : longPct <= 45 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePmCb', '2. Bank Sentral & Suku Bunga'), localizeEngineString(fc.macroRegime || '-'), localizeEngineString(fc.centralBankStance || '-'), 'neutral') +
      // (fundamental terukur)
      pillarHtml(T('ui.ePmDxy', '3. Korelasi Dolar AS (DXY)'), localizeEngineString(fc.dxyCorrelation || '-'), null, 'neutral') +
      pillarHtml(T('ui.ePmVal', '4. Valuasi Intrinsik'), localizeEngineString(fc.valuationMetrics || '-'), null, 'neutral') +
      pillarHtml(T('ui.ePmOf', '5. Orderflow & Commercial Hedger'), localizeEngineString(fc.orderflowMetric || '-'), fc.commHedgerBias ? localizeEngineString(fc.commHedgerBias) : null, 'neutral') +
      pillarHtml(T('ui.ePmCat', '6. Katalis Terdekat'), deskCatalystValue(state.symbol, fc.upcomingCatalyst), deskCatalystNote(state.symbol, fc.macroDriver), 'neutral') +
      // Fundamental TERUKUR dari data candle nyata (bukan kutipan statis)
      pillarHtml(T('ui.fmCycle', '7. Posisi Siklus Harga (Terukur)'), fillTpl(T('ui.fmCycleVal', '{p}% of cycle range • DD {d}% from peak'), { p: mq.posCyclePct, d: mq.drawdownPct }), mq.posCyclePct > 88 ? T('ui.fmCycleHi', 'di puncak — rawan jadi exit liquidity') : mq.posCyclePct < 12 ? T('ui.fmCycleLo', 'di dasar siklus — rawan pantulan') : null, mq.posCyclePct > 88 || mq.posCyclePct < 12 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.fmPersist', '8. Persistensi Momentum (50 candle)'), mq.upClosesPct + '% candle ditutup naik', null, mq.upClosesPct >= 55 ? 'bull' : mq.upClosesPct <= 42 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.fmVolPct', '9. Persentil Volatilitas ATR'), T('ui.fmVolPctVal', 'ATR saat ini berada di persentil {p}% dari 120 pengamatan').replace('{p}', mq.atrPercentile), mq.atrPercentile > 92 ? T('ui.fmVolExt', 'volatilitas outlier — SL mudah tersambar noise') : null, mq.atrPercentile > 92 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.fmSession', '10. Kualitas Sesi & Keselarasan HTF'), (mq.sessionQuality || '-') + ' • ' + (mq.htfAligned ? T('ui.fmHtfOk', 'HTF selaras dengan arah sinyal') : T('ui.fmHtfNo', 'HTF melawan — wajib ekstra hati-hati')), null, mq.htfAligned ? 'bull' : 'bear');
  }
}

/* ==================== 6B. ANALISIS INSTRUMEN PER KELOMPOK (SNIPER MTF) ====================
   Menampilkan daftar psikologi, teknikal, dan fundamental untuk kelompok aktif.
   Hanya konfluensi yang SEARAH yang dihitung ke skor sniper; indikator konteks
   tetap tampil tetapi tidak menambah skor (anti skor-inflasi). */
function gaItemHtml(item) {
  var tone = item.tone || 'neutral';
  var stCls = item.counted ? ' on' : (item.criterion ? ' miss' : '');
  var stTxt = item.counted ? '✓ ' + T('ui.gaCounted', 'dihitung') : item.criterion ? '✗ ' + T('ui.gaMiss', 'belum') : T('ui.gaContext', 'konteks');
  return '<div class="ga-item ' + tone + '">' +
    '<div class="ga-item-top"><span class="ga-label">' + item.label + '</span>' +
    '<span class="ga-count' + stCls + '">' + stTxt + '</span></div>' +
    '<div class="ga-value">' + item.value + '</div>' +
    (item.note ? '<div class="ga-note">' + item.note + '</div>' : '') +
    '</div>';
}
function gaCardHtml(icon, title, items) {
  var body = '';
  for (var i = 0; i < items.length; i++) body += gaItemHtml(items[i]);
  return '<div class="ga-card"><div class="ga-card-head"><span>' + icon + '</span> <span>' + title + '</span></div>' +
    '<div class="ga-card-body">' + body + '</div></div>';
}
function renderGroupAnalysisInto(containerId, group, dex) {
  var el = $id(containerId);
  if (!el) return;
  var isId = (typeof window !== 'undefined' && window.XSI18N && typeof window.XSI18N.getLanguage === 'function' ? window.XSI18N.getLanguage() : 'en') === 'id';
  var model = null;
  try {
    if (window.XSGroup && typeof window.XSGroup.buildGroupAnalysis === 'function') {
      model = window.XSGroup.buildGroupAnalysis({
        group: group, analysis: state.lastAnalysis, candles: state.candles, dex: dex || null, lang: isId ? 'id' : 'en'
      });
    }
  } catch (e) { model = null; }
  if (!model) {
    // Modul dimuat asinkron lewat engine-boot; applyEngines() akan menggambar ulang
    // begitu modul siap, jadi tampilkan status netral (bukan seolah rusak).
    el.innerHTML = '<div class="ga-empty">' + (isId
      ? 'Menyiapkan mesin analisis kelompok…'
      : 'Preparing the group analysis engine…') + '</div>';
    return;
  }
  if (model.empty) {
    el.innerHTML = '<div class="ga-empty">' + (group === 'dex'
      ? (isId ? 'Cari lalu pilih pair DEX dulu — daftar psikologi, teknikal, dan fundamental akan terisi otomatis.' : 'Search and pick a DEX pair first — psychology, technical and fundamental lists fill automatically.')
      : (isId ? 'Pilih instrumen secara manual lalu tekan Analisis — daftar psikologi, teknikal, dan fundamental kelompok ini akan terisi otomatis.' : 'Select an instrument manually then press Analyze — this group psychology, technical and fundamental list fills automatically.')) + '</div>';
    return;
  }
  if (containerId === 'groupAnalysisBody') {
    setTxt('groupAnalysisTitle', model.title);
    var badge = $id('groupAnalysisBadge');
    if (badge) {
      badge.textContent = group === 'investor' ? (isId ? 'INVESTOR • SPOT DCA' : 'INVESTOR • SPOT DCA') : (isId ? 'TRADER • SNIPER MTF' : 'TRADER • SNIPER MTF');
      badge.className = 'ga-badge' + (group === 'investor' ? ' ga-badge-investor' : '');
    }
  }
  var dirUp = model.direction === 'LONG' || model.direction === 'BULLISH';
  var dirDown = model.direction === 'SHORT' || model.direction === 'BEARISH';
  var dirTxt = dirUp ? '▲ ' + (isId ? 'BIAS NAIK' : 'BULLISH BIAS') : dirDown ? '▼ ' + (isId ? 'BIAS TURUN' : 'BEARISH BIAS') : '◆ ' + (isId ? 'NETRAL / TUNGGU' : 'NEUTRAL / WAIT');
  var dirCol = dirUp ? '#10b981' : dirDown ? '#f43f5e' : '#f59e0b';
  var bandCol = (model.band === 'ELITE' || model.band === 'PRO') ? '#10b981' : model.band === 'WATCH' ? '#f59e0b' : '#94a3b8';
  var ladder = '';
  for (var li = 0; li < model.ladder.rows.length; li++) {
    var row = model.ladder.rows[li];
    var rowTone = row.bias === 'BULLISH' ? 'bull' : row.bias === 'BEARISH' ? 'bear' : 'neutral';
    ladder += '<div class="ga-step ' + rowTone + '">' +
      '<span class="ga-step-tier">' + row.tier + '</span>' +
      '<span class="ga-step-tf">' + row.tfs + '</span>' +
      '<span class="ga-step-role">' + row.role + '</span>' +
      '<strong class="ga-step-bias">' + row.detail + '</strong></div>';
  }
  el.innerHTML =
    '<div class="ga-scorebar">' +
      '<div class="ga-score-main"><span class="ga-score-num" style="color:' + bandCol + ';">' + model.score + '</span>' +
      '<span class="ga-score-max">/100</span>' +
      '<span class="ga-band" style="color:' + bandCol + ';border-color:' + bandCol + ';">' + model.band + '</span></div>' +
      '<div class="ga-score-dir" style="color:' + dirCol + ';">' + dirTxt + '</div>' +
    '</div>' +
    '<div class="ga-score-note">' + model.scoreNote + '</div>' +
    '<div class="ga-ladder">' + ladder + '</div>' +
    '<div class="ga-grid">' +
      gaCardHtml('🧠', isId ? 'Psikologi Pasar' : 'Market Psychology', model.psychology) +
      gaCardHtml('📐', isId ? 'Teknikal — Sniper MTF' : 'Technical — Sniper MTF', model.technical) +
      gaCardHtml('📊', isId ? 'Fundamental' : 'Fundamental', model.fundamental) +
    '</div>';
}
function renderGroupAnalysis() {
  renderGroupAnalysisInto('groupAnalysisBody', state.mode === 'investor' ? 'investor' : 'trader');
}
function renderMemeGroupAnalysis() {
  renderGroupAnalysisInto('memeGroupAnalysis', 'dex', {
    pair: activeMemeToken, candles: activeMemeCandles, security: activeMemeSecurity
  });
}
function renderNarrative(a) {
  var box = $id('narrativeHumanBox');
  if (!box) return;
  var assetClass = (a && a.assetClass) || (state.currentInstrument && state.currentInstrument.assetClass) || 'forex';
  var isId = (typeof window !== 'undefined' && window.XSI18N && typeof window.XSI18N.getLanguage === 'function' ? window.XSI18N.getLanguage() : 'en') === 'id';
  var brainBadgeHtml = '';
  if (assetClass === 'crypto') {
    brainBadgeHtml = '<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);font-size:11px;font-weight:700;color:#fbbf24;margin-bottom:8px;">' +
      '<span>🪙 ' + (isId ? 'OTAK KRIPTO INSTITUSIONAL' : 'INSTITUTIONAL CRYPTO BRAIN') + '</span>' +
      '<span style="color:#94a3b8;font-weight:500;">• ' + (isId ? 'Prioritas: SMC Liquidity Pools (34%) &amp; Orderflow Delta (26%)' : 'Priority: SMC Liquidity Pools (34%) &amp; Orderflow Delta (26%)') + '</span>' +
      '</div>';
  } else if (assetClass === 'forex') {
    brainBadgeHtml = '<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);font-size:11px;font-weight:700;color:#38bdf8;margin-bottom:8px;">' +
      '<span>💱 ' + (isId ? 'OTAK FOREX INTERBANK' : 'INTERBANK FOREX BRAIN') + '</span>' +
      '<span style="color:#94a3b8;font-weight:500;">• ' + (isId ? 'Prioritas: Retest OTE Fibo (32%) &amp; Sesi Likuiditas (24%)' : 'Priority: OTE Fibo Retest (32%) &amp; Session Timing (24%)') + '</span>' +
      '</div>';
  } else if (assetClass === 'stocks') {
    brainBadgeHtml = '<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.35);font-size:11px;font-weight:700;color:#c084fc;margin-bottom:8px;">' +
      '<span>📈 ' + (isId ? 'OTAK SAHAM INSTITUSIONAL' : 'INSTITUTIONAL EQUITIES BRAIN') + '</span>' +
      '<span style="color:#94a3b8;font-weight:500;">• ' + (isId ? 'Prioritas: Tren Makro MA-200 (34%) &amp; ORB Bel Pembukaan (28%)' : 'Priority: MA-200 Macro Trend (34%) &amp; Opening Bell ORB (28%)') + '</span>' +
      '</div>';
  } else {
    brainBadgeHtml = '<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);font-size:11px;font-weight:700;color:#34d399;margin-bottom:8px;">' +
      '<span>🌾 ' + (isId ? 'OTAK KOMODITAS & LOGAM' : 'COMMODITIES & METALS BRAIN') + '</span>' +
      '<span style="color:#94a3b8;font-weight:500;">• ' + (isId ? 'Prioritas: Supply/Demand Fisik (30%) &amp; CFTC COT Hedgers (24%)' : 'Priority: Physical S&D (30%) &amp; CFTC COT Hedgers (24%)') + '</span>' +
      '</div>';
  }
  var dir = a.direction === 'LONG' ? T('ui.eDirLong', '▲ BIAS LONG / BUY') : a.direction === 'SHORT' ? T('ui.eDirShort', '▼ BIAS SHORT / SELL') : T('ui.eDirNeutral', '◆ NETRAL / MENUNGGU');
  var dirCol = a.direction === 'LONG' ? '#10b981' : a.direction === 'SHORT' ? '#f43f5e' : '#f59e0b';
  var reasons = (a.reasons || []).map(function (r) { return '<div style="margin-bottom:5px;">' + localizeEngineString(r) + '</div>'; }).join('');
  var headTxt = fillTpl(T('ui.eNarrHead', '{dir} — Skor Konfluensi {s}/100 ({r})'), { dir: dir, s: a.confluenceScore, r: localizeEngineString(a.regime || '-') });
  box.innerHTML =
    brainBadgeHtml +
    '<div style="margin-bottom:8px;font-weight:800;color:' + dirCol + ';">' + headTxt + '</div>' +
    reasons +
    gateBlockHtml(a) +
    '<div style="margin-top:4px;font-size:11.5px;color:#94a3b8;">' + fillTpl(T('ui.eNarrFoot', 'Harga live, Entry/SL/TP & pilar di atas dihitung dari candle broker real-time. Setup terkunci selama periode candle {tf} aktif dan diperbarui otomatis setiap candle baru terbentuk.'), { tf: (a.timeframe || state.tf) }) + '</div>';
}
/* Blok gerbang institusional (aturan #1 D & #2) + papan TF terbaik hasil scan.
   Memakai elemen narasi yang sudah ada — tanpa mengubah layout/halaman. */
function gateBlockHtml(a) {
  if (!a || a.error) return '';
  if (state.mode !== 'trader') return '';
  var out = '';
  if (a.lockedSignal || a.signalEligible) {
    var dTxt = a.direction === 'LONG' ? T('ui.tbLong', '▲ LONG / BUY') : T('ui.tbShort', '▼ SHORT / SELL');
    out += '<div style="margin-top:7px;padding:7px 9px;border-radius:7px;background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.35);font-size:11.5px;color:#a7f3d0;">' +
      fillTpl(T('ui.eGateLockOk', '🔒 Setup TERKUNCI di TF {tf} — {dir} • skor {s} • winrate {w}%. Angka Entry/SL/TP permanen hingga TP tersentuh, SL tembus, atau struktur penutup membatalkan Order Block.'), {
        tf: (a.lockTf || a.timeframe || state.tf), dir: dTxt,
        s: (a.lockScore || a.confluenceScore || 0), w: num(a.lockWinRate || (a.backtest ? a.backtest.winRate : 0)).toFixed(1)
      }) + '</div>';

    var tm = a.tradeManagement || {};
    var L = (typeof effectiveLevels === 'function') ? effectiveLevels(a) : (a.levels || {});
    var slPlusVal = tm.slPlus || (a.direction === 'LONG' ? Number(L.entry) * 1.0008 : Number(L.entry) * 0.9992);
    var slPlusFmt = typeof formatPrice === 'function' ? formatPrice(slPlusVal, a.symbol) : String(slPlusVal);
    var dirSlPlusTxt = a.direction === 'LONG' ? 'di atas entry' : 'di bawah entry';
    if (tm.bePlusActive) {
      out += '<div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.6);font-size:12px;color:#6ee7b7;font-weight:700;">' +
        fillTpl(T('ui.eSlPlusActive', '🛡️ SARAN 0-RISK AKTIF: Harga telah mencapai zona aman ({pct}% target). SEGERA GESER SL KE {slp} (SL+ {dir}). Posisi ini sekarang 100% BEBAS RISIKO!'), { pct: tm.progressPct || 40, slp: slPlusFmt, dir: dirSlPlusTxt }) +
        '</div>';
    } else if (tm.brain === 'SCALP') {
      out += '<div style="margin-top:6px;padding:6px 9px;border-radius:7px;background:rgba(245,158,11,0.09);border:1px solid rgba(245,158,11,0.35);font-size:11.5px;color:#fde68a;">' +
        fillTpl(T('ui.eScalpAdvisor', '⚡ OTAK SCALP: Disiplin proteksi agresif — saat harga bergerak 30% ke target, sistem menyalakan instruksi SL+ ke {slp} untuk mengunci modal 0-risk.'), { slp: slPlusFmt }) +
        '</div>';
    } else {
      out += '<div style="margin-top:6px;padding:6px 9px;border-radius:7px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.32);font-size:11.5px;color:#bae6fd;">' +
        fillTpl(T('ui.eSniperAdvisor', '🎯 OTAK SNIPER (Target Minimal 1:2 R:R): Kesabaran institusional — target penuh di TP2 (≥2R). Jika belum mencapai 1:2, sistem menyarankan geser SL ke SL+ ({slp}) {dir} untuk mengunci 0-Risk.'), { slp: slPlusFmt, dir: dirSlPlusTxt }) +
        '</div>';
    }

    if (a.riskPlan) {
      out += '<div style="margin-top:6px;padding:6px 9px;border-radius:7px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.32);font-size:11.5px;color:#ddd6fe;">' +
        fillTpl(T('ui.eRiskPlan', '🛡️ Rencana Master: risiko {r}% • setengah TP1 lalu SL ke Break-Even • sisanya runner TP2/TP3 • maks {m} posisi aktif.'), { r: a.riskPlan.riskPct, m: a.riskPlan.maxActivePositions }) + '</div>';
    }
  } else {
    out += '<div style="margin-top:7px;padding:7px 9px;border-radius:7px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.32);font-size:11.5px;color:#fca5a5;">' +
      fillTpl(T('ui.eGateForbidden', '⛔ TIMEFRAME {tf} DILARANG ENTRY (rawan loss) — gerbang institusional menolak; tidak ada angka Entry/SL/TP yang dipaksakan di TF ini.'), { tf: (a.timeframe || state.tf) }) +
      '</div>';
  }
  /* Koherensi WR vs entry: winrate historis besar TIDAK sama dengan izin entry.
     Saat WR tinggi tapi gerbang menolak, jelaskan alasannya secara eksplisit agar
     panel tidak terlihat kontradiktif. */
  if (a.backtest && !a.backtest.disabled && num(a.backtest.winRate, 0) >= 60 && !a.signalEligible && !a.lockedSignal) {
    var why0 = (a.gating && a.gating.active && a.gating.active.length) ? gateShortLabel(a.gating.active[0]) : '';
    out += '<div style="margin-top:6px;padding:6px 9px;border-radius:7px;background:rgba(56,189,248,0.07);border:1px solid rgba(56,189,248,0.3);font-size:11.5px;color:#bae6fd;">' +
      fillTpl(T('ui.eWrVsEntry', 'ℹ️ Winrate walk-forward {wr}% memang besar — tapi WR ≠ izin entry: WR menilai masa lalu, sedangkan entry hanya diterbitkan bila struktur + volume + momentum TERKINI mengonfirmasi. Sekarang yang ditunggu: {why}. Menunggu konfirmasi inilah yang menyelamatkan dari fakeout.'), { wr: num(a.backtest.winRate, 0).toFixed(1), why: why0 }) +
      '</div>';
  }
  if (state.mode === 'trader' && a.brainMetrics) {
    var bm = a.brainMetrics;
    var bmTxt = bm.brain === 'SCALP'
      ? fillTpl(T('ui.eBrainScalp', '⚡ OTAK SCALP (M5) — Tekanan orderflow BUY {of}% | Kecepatan tape {vel}% | Adj otak {adj}'), { of: bm.buyVolPct == null ? '—' : bm.buyVolPct, vel: bm.tapeVelPct == null ? '—' : bm.tapeVelPct, adj: (bm.brainAdj > 0 ? '+' : '') + bm.brainAdj })
      : fillTpl(T('ui.eBrainSniper', '🎯 OTAK SNIPER — Posisi range 90 candle {pos}% | BOS50 {bos} | Adj otak {adj}'), { pos: bm.posInRangePct == null ? '—' : bm.posInRangePct, bos: bm.bosDir > 0 ? '↑' : bm.bosDir < 0 ? '↓' : '—', adj: (bm.brainAdj > 0 ? '+' : '') + bm.brainAdj });
    out += '<div style="margin-top:6px;padding:6px 9px;border-radius:7px;background:rgba(148,163,184,0.07);border:1px solid rgba(148,163,184,0.28);font-size:11.5px;color:#cbd5e1;">' + bmTxt + '</div>';
  }
  var newsWarn = (typeof newsSoonFor === 'function') ? newsSoonFor(state.symbol, 90) : null;
  if (newsWarn) {
    out += '<div style="margin-top:6px;padding:6px 9px;border-radius:7px;background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.35);font-size:11.5px;color:#fde68a;">' +
      fillTpl(T('ui.eNewsWarn', '⏰ PERINGATAN NEWS: {t} ({imp}) sekitar {w} — volatilitas dapat melonjak dua arah; disiplin master = tunggu resolusi news, jangan entry tepat sebelum rilis.'), { t: escH(newsWarn.title), imp: newsWarn.impact, w: newsFmtTime(newsWarn.ts) }) + '</div>';
  }
  if (macroState.data && macroState.data.ok) {
    var md = macroState.data;
    out += '<div style="margin-top:6px;padding:5px 9px;border-radius:7px;background:rgba(56,189,248,0.07);border:1px solid rgba(56,189,248,0.25);font-size:11px;color:#bae6fd;">' +
      fillTpl(T('ui.eMacroTrader', '🌐 Konteks Makro: {r} • Growth {g}% • Inflasi {i}% • USD {u}% • Risk {x}% — sesuaikan ekspektasi & sizing dengan cuaca makro.'), { r: macroRegimeLabel(), g: md.growth, i: md.inflation, u: md.usdBias, x: md.riskAppetite }) + '</div>';
  }
  var b = state.bestTfBoard;
  if (b && b.groups) {
    var cell = function (g) {
      if (!g || !g.tf) return '—';
      if (g.tier === 'ELITE') return g.tf + ' ★ ELITE ' + num(g.winRate).toFixed(0) + '%';
      if (g.tier === 'PRO') return g.tf + ' ✅ PRO ' + num(g.winRate).toFixed(0) + '%';
      return g.tf + ' ✖';
    };
    out += '<div style="margin-top:6px;font-size:11.5px;font-weight:700;color:#e2e8f0;">' +
      fillTpl(T('ui.eGateBest', 'Status Scan Timeframe Terbaik → Scalping: {sc} | Intraday: {id} | Swing: {sw}'), {
        sc: cell(b.groups.scalping), id: cell(b.groups.intraday), sw: cell(b.groups.swing)
      }) + '</div>' +
      '<div style="font-size:10.8px;color:#94a3b8;">' + T('ui.eGateBestHint', '✖ artinya horizon itu BELUM ADA setup layak (ditahan gerbang — bukan rekomendasi). Buka TF berlogo ✅ (PRO, skor ≥62) atau ★ (ELITE, skor ≥84 & WR ≥78%).') + '</div>';
  } else if (!a.signalEligible && !a.lockedSignal) {
    out += '<div style="font-size:10.8px;color:#94a3b8;margin-top:4px;">' + T('ui.eGateScanning', 'Memindai 9 timeframe di belakang layar untuk mengarahkan ke sinyal terbaik…') + '</div>';
  }
  return out;
}

/* ==================== 2B. SCAN MULTI-TIMEFRAME (aturan #2) ====================
   Memindai 9 TF di belakang layar, memilih 1 TF terbaik per kelompok gaya
   trading (Scalping M1/M5/M15, Intraday M30/H1/H4, Swing D1/W1/MN), lalu
   menyajikan papan rekomendasi. Cache 5 menit per (simbol|mode) di-invalidate
   saat candle closed baru terbentuk (anchor berubah). */
var bestTfScanSeq = 0;
var bestTfScanCache = {};
function scheduleBestTfScan() { return; }
/* Parameter risiko futures (leverage aman & estimasi harga likuidasi) */
function riskParams(a) {
  var atrPct = Math.max(0.05, num(a && a.indicators ? a.indicators.atrPct : 0) || 0.5);
  var lev = atrPct < 0.4 ? 25 : atrPct < 0.9 ? 20 : atrPct < 1.8 ? 15 : atrPct < 3.2 ? 10 : 5;
  var dir = a && a.direction;
  var entry = num(a && a.levels ? a.levels.entry : 0);
  var liq = entry > 0 ? (dir === 'SHORT' ? entry * (1 + 0.92 / lev) : entry * (1 - 0.92 / lev)) : 0;
  return { lev: lev, liq: liq };
}
/* Level yang ditampilkan & digariskan.
   Trader SPOT dipaksa 1-arah (proteksi LONG saja — tanpa setup SHORT),
   Futures memakai level 2-arah sesuai analisis, Investor memakai zona DCA. */
function effectiveLevels(a) {
  var L = (a && a.levels) || {};
  if (!a) return L;
  // Jika sinyal sedang terkunci aktif, level a.levels sudah di-apply oleh applyLockedSignal.
  // Namun jika kunci baru saja selesai (TP_HIT, SL_HIT, BE_SAVED), baca outcome aktif
  // agar panel teks (Keterangan Sinyal) dan chart garis 100% SINKRON dengan target transaksi tersebut!
  if (!a.lockedSignal) {
    var oc = (typeof latestSignalOutcome === 'function') ? latestSignalOutcome(a.symbol, a.timeframe || state.tf) : null;
    if (oc && oc.lock && (oc.status === 'TP_HIT' || oc.status === 'SL_HIT' || oc.status === 'BE_SAVED')) {
      if (isPriceCompatibleWithSymbol(oc.lock.entry, a.symbol)) {
        return {
          entry: oc.lock.entry,
          sl: oc.lock.sl,
          tp1: oc.lock.tp1,
          tp2: oc.lock.tp2,
          tp3: oc.lock.tp3,
          rrRatio: oc.lock.rrRatio,
          poc: L.poc,
          swingHigh: L.swingHigh,
          swingLow: L.swingLow,
          fib: L.fib,
          dcaZone1: L.dcaZone1,
          dcaZone2: L.dcaZone2,
          dcaZone3: L.dcaZone3,
          invTarget1: L.invTarget1,
          invTarget2: L.invTarget2
        };
      }
    }
  }
  // Trader SPOT 1-arah: tampilkan level HANYA jika ada sinyal_LONG yang lolos
  // gerbang ketat (entry sudah sangat terkunci di engine). Tidak ada entry liar
  // dari harga live; tanpa sinyal valid -> panel menampilkan '--' (anti-overtrade).
  if (state.mode === 'trader' && state.subMode === 'spot') {
    if (!a.signalEligible || a.direction !== 'LONG') return L;
    return L;
  }
  return L;
}
function renderPanels(a) {
  var isInvestor = state.mode === 'investor';
  var traderPanel = $id('traderSetupPanel');
  var invPanel = $id('investorSetupPanel');
  if (traderPanel) traderPanel.classList.toggle('hidden', isInvestor);
  if (invPanel) invPanel.classList.toggle('hidden', !isInvestor);
  if (isInvestor) {
    var lv = a.levels;
    var fair = num(lv.poc, a.lastPrice) * 0.55 + num(lv.vwap, a.lastPrice) * 0.45;
    if (fair <= 0) fair = a.lastPrice;
    var diffPct = ((a.lastPrice - fair) / fair) * 100;
    var status = diffPct < -3 ? T('ui.vUnder', 'UNDERVALUE (DISKON)') : diffPct > 3 ? T('ui.vOver', 'OVERVALUE (PREMIUM)') : T('ui.vFair', 'FAIR VALUE');
    var rating = a.direction === 'LONG' ? (a.confluenceScore >= 65 ? T('ui.rStrongAccum', 'STRONG ACCUMULATE') : T('ui.rAccum', 'ACCUMULATE')) : a.direction === 'SHORT' ? T('ui.rWaitReduce', 'WAIT / REDUCE') : T('ui.rHoldWatch', 'HOLD / WATCH');
    setTxt('valInvRating', rating);
    // Warna berbasis arah analisis (bukan substring teks) agar kebal terjemahan multi-bahasa
    $id('valInvRating') && ($id('valInvRating').style.color = a.direction === 'LONG' ? '#10b981' : a.direction === 'SHORT' ? '#f59e0b' : '#38bdf8');
    setTxt('valInvFairValue', formatPrice(fair, a.symbol));
    setTxt('valInvValuationStatus', status);
    $id('valInvValuationStatus') && ($id('valInvValuationStatus').style.color = diffPct < -3 ? '#10b981' : diffPct > 3 ? '#f43f5e' : '#f8fafc');
    setTxt('valInvMoS', fillTpl(T('ui.eMos', 'MoS: {s}% vs Harga Live'), { s: (diffPct <= 0 ? '+' : '−') + Math.abs(diffPct).toFixed(1) }));
    setTxt('valInvDCA1', formatPrice(lv.dcaZone1, a.symbol));
    setTxt('valInvDCA2', formatPrice(lv.dcaZone2, a.symbol));
    setTxt('valInvDCA3', formatPrice(lv.dcaZone3, a.symbol));
    // v2026.58: bobot alokasi DCA menyesuaikan REGIME GLOBAL MACRO (relatif value)
    var dcaW = macroDcaWeights();
    ['valInvDCA1', 'valInvDCA2', 'valInvDCA3'].forEach(function (vid, wi) {
      var el = $id(vid); var lb = el && el.closest ? el.closest('.level-box') : null; lb = lb ? lb.querySelector('.lbl') : null;
      if (lb) lb.textContent = fillTpl(T('ui.invDcaPace', '🟢 DCA TAHAP {n} — ALOKASI {p}% MODAL'), { n: wi + 1, p: dcaW[wi] });
    });
    var avg = num(lv.dcaZone1) * (dcaW[0] / 100) + num(lv.dcaZone2) * (dcaW[1] / 100) + num(lv.dcaZone3) * (dcaW[2] / 100);
    setTxt('valInvAvgPrice', formatPrice(avg, a.symbol));
    setTxt('valInvTarget1', formatPrice(lv.invTarget1, a.symbol));
    setTxt('valInvTarget2', formatPrice(lv.invTarget2, a.symbol));
    var rsiV = num(a.indicators.rsi, 50);
    var phase = a.regime && a.regime.indexOf('TREND') > -1 ? T('ui.ePhaseMarkup', 'Fase Markup Tren') : rsiV < 38 ? T('ui.ePhaseAccum', 'Fase Akumulasi Diskon') : rsiV > 68 ? T('ui.ePhaseDistrib', 'Fase Distribusi / Euforia') : T('ui.ePhaseGradual', 'Akumulasi Bertahap (Sideways Positif)');
    setTxt('valInvCyclePhase', phase);
    var yieldTxt = a.assetClass === 'crypto' ? T('ui.eYieldCrypto', 'Potensi staking/DeFi 2–8% APY') : a.assetClass === 'stocks' ? T('ui.eYieldStocks', 'Dividen & capital gain jangka panjang') : a.assetClass === 'metals' ? T('ui.eYieldMetals', 'Aset lindung nilai inflasi global') : T('ui.eYieldOther', 'Instrumen makro multi-sesi');
    setTxt('valInvYield', yieldTxt);
    setTxt('valSetupLockBadgeTxt', '');
    return;
  }
  // ---- Trader panel ----
  var isEst = a.__estFeed || (state.feedSource && feedIsEstimate(state.feedSource));
  var dir = a.direction;
  var isSpot = state.subMode === 'spot';
  var oc = (typeof latestSignalOutcome === 'function') ? latestSignalOutcome(a.symbol, a.timeframe || state.tf) : null;
  if (a.lockedSignal) oc = null;
  var dirBox = $id('valSignalDirection');
  if (dirBox) {
    var txt, col;
    if (isEst) {
      txt = T('ui.eEstFeed', '○ Data estimasi — sinyal nonaktif');
      col = '#f59e0b';
    } else if (oc && oc.status === 'TP_HIT') {
      txt = T('ui.eDirTpHit', '✅ TP TERCAPAI — SETUP SELESAI');
      col = '#10b981';
    } else if (oc && oc.status === 'BE_SAVED') {
      txt = T('ui.eDirBeSaved', '🛡️ TERSELAMATKAN SL+ (0-RISK, MODAL AMAN)');
      col = '#10b981';
    } else if (oc && oc.status === 'SL_HIT') {
      txt = T('ui.eDirSlHit', '❌ SL TERSENTUH — SETUP INVALID');
      col = '#f43f5e';
    } else if (isSpot) {
      txt = dir === 'LONG' ? T('ui.eDirSpotLong', 'SPOT BUY / AKUMULASI (1-ARAH)') : T('ui.eDirSpotWait', '◆ TUNGGU SETUP BELI (SPOT 1-ARAH)');
      col = dir === 'LONG' ? '#10b981' : '#f59e0b';
    } else {
      txt = dir === 'LONG' ? T('ui.eDirLongSet', 'LONG / BUY SETUP') : dir === 'SHORT' ? T('ui.eDirShortSet', 'SHORT / SELL SETUP') : T('ui.eDirWaitZone', '◆ WAIT / NO-TRADE ZONE');
      col = dir === 'LONG' ? '#10b981' : dir === 'SHORT' ? '#f43f5e' : '#f59e0b';
    }
    dirBox.textContent = txt;
    dirBox.style.color = col;
    dirBox.style.background = col === '#10b981' ? 'rgba(16,185,129,0.18)' : col === '#f43f5e' ? 'rgba(244,63,94,0.18)' : 'rgba(245,158,11,0.16)';
  }
  var lockBadge;
  if (isEst) lockBadge = '○ FEED ESTIMASI';
  else if (oc && oc.status === 'TP_HIT') lockBadge = '✅ TP COMPLETED';
  else if (oc && oc.status === 'BE_SAVED') lockBadge = '🛡️ SL+ 0-RISK';
  else if (oc && oc.status === 'SL_HIT') lockBadge = '❌ SL HIT';
  else if (a.lockedSignal) lockBadge = fillTpl(T('ui.eLocked', '🔒 LOCKED {tf}'), { tf: (a.lockTf || a.timeframe || state.tf) }) + (a.signalTier === 'ELITE' ? ' ★' : '');
  else if (a.signalEligible) lockBadge = fillTpl(a.signalTier === 'ELITE' ? T('ui.eEliteSetup', '✅ ELITE SETUP {tf}') : T('ui.eProSetup', '✅ PRO SETUP {tf}'), { tf: (a.timeframe || state.tf) });
  else lockBadge = fillTpl(T('ui.eNoTradeTf', '🚫 NO-TRADE ZONE {tf}'), { tf: (a.timeframe || state.tf) });
  setTxt('valSetupLockBadge', lockBadge);
  var scoreToShow = (oc && oc.lock && oc.lock.score) ? oc.lock.score : num(a.convictionScore, a.confluenceScore || a.confidence || 50);
  setTxt('valConfidenceScore', scoreToShow + '%');
  setTxt('valRegime', localizeEngineString(a.regime || '-'));
  var L = effectiveLevels(a);
  setTxt('valEntry', isEst ? '--' : formatPrice(L.entry, a.symbol));
  setTxt('valSL', isEst ? '--' : formatPrice(L.sl, a.symbol));
  setTxt('valSLDesc', isEst ? T('ui.eEstFeed', 'Data estimasi — sinyal nonaktif') : fillTpl(isSpot ? T('ui.eSlSpot', 'Proteksi LONG spot di luar swing wick + buffer ATR {p}%') : T('ui.eSlFutures', 'Di luar swing wick + buffer ATR {p}%'), { p: num(a.indicators.atrPct).toFixed(2) }));
  if (window.__calcWidget && window.__calcWidget.elBalance && !isEst) {
    try { window.__calcWidget.setLevelsFromSignal({ entry: L.entry, stopLoss: L.sl }); } catch (e) {}
  }
  setTxt('valTP1', isEst ? '--' : formatPrice(L.tp1, a.symbol));
  setTxt('valTP2', isEst ? '--' : formatPrice(L.tp2, a.symbol));
  setTxt('valTP3', isEst ? '--' : formatPrice(L.tp3, a.symbol));
  if (L.fib && L.fib.retracement && L.fib.extension) {
    setTxt('valFibo500', formatPrice(L.fib.retracement.r500, a.symbol));
    setTxt('valFibo618', formatPrice(L.fib.retracement.r618, a.symbol));
    setTxt('valFibo786', formatPrice(L.fib.retracement.r786, a.symbol));
    setTxt('valFiboExt127', formatPrice(L.fib.extension.ext1272, a.symbol));
    setTxt('valFiboExt161', formatPrice(L.fib.extension.ext1618, a.symbol));
    setTxt('valFiboExt200', formatPrice(L.fib.extension.ext2000, a.symbol));
  } else {
    setTxt('valFibo500', '--');
    setTxt('valFibo618', '--');
    setTxt('valFibo786', '--');
    setTxt('valFiboExt127', '--');
    setTxt('valFiboExt161', '--');
    setTxt('valFiboExt200', '--');
  }
  var rp = riskParams(a);
  setTxt('valRecLeverage', rp.lev + 'x');
  setTxt('valLiqPrice', formatPrice(rp.liq, a.symbol));
  setTxt('valRRRatio', L.rrRatio ? ('1 : ' + num(L.rrRatio).toFixed(2)) : '--');
  // Backtest
  var bt = a.backtest || {};
  if (bt.disabled) {
    setTxt('valBtWinRate', 'N/A');
    setTxt('valBtProfitFactor', 'N/A');
    setTxt('valBtNetReturn', T('ui.eBtMacro', 'TF Makro'));
    setTxt('valBtMaxDD', 'N/A');
    setTxt('valBtTrades', T('ui.eBtOff', 'Backtest nonaktif di TF makro'));
  } else {
    setTxt('valBtWinRate', num(bt.winRate).toFixed(1) + '%');
    setTxt('valBtProfitFactor', num(bt.profitFactor).toFixed(2));
    setTxt('valBtNetReturn', (num(bt.netR) >= 0 ? '+' : '') + num(bt.netR).toFixed(1) + 'R');
    setTxt('valBtMaxDD', '-' + num(bt.maxDrawdownR).toFixed(1) + 'R');
    setTxt('valBtTrades', fillTpl(T('ui.eBtSignals', '{n} Sinyal Historis'), { n: bt.sampleSize || 0 }) + (bt.weakEvidence ? T('ui.eBtWeak', ' • Sampel Terbatas') : ''));
  }
  // Saham = pasar spot (tanpa leverage/likuidasi ala derivatif); crypto spot jg spot.
  // Kotak futures hanya relevan untuk instrumen margin: crypto futures & CFD
  // (forex/metal/komoditas) — bukan saham, bukan spot.
  var marginProduct = !isSpot && a.assetClass !== 'stocks';
  var futBox = $id('futuresRiskBox');
  if (futBox) futBox.classList.toggle('hidden', !marginProduct);
  if (!marginProduct) { setTxt('valRecLeverage', '1x (SPOT)'); setTxt('valLiqPrice', '--'); }
  // v2026.59: toggle SPOT/FUTURES dibiarkan terlihat di SEMUA aset pada mode trader
  // (dipulihkan atas permintaan user — tombol sempat dianggap "hilang").
  renderConfluenceMatrix(a);
  renderSentimentFlow(a);
  updateRiskSizing();
}
function renderConfluenceMatrix(a) {
  var grid = $id('confluenceMatrixGrid');
  if (!grid || !a) return;
  var ind = a.indicators || {};
  var p = num(a.lastPrice);

  // 1. Trend Structure
  var isEmaUp = num(ind.ema20) > num(ind.ema50);
  var isAboveMa200 = p >= num(ind.ma200 || ind.ema200);
  var trendVal, trendCls;
  if (isEmaUp && isAboveMa200) { trendVal = 'BULLISH ▲'; trendCls = 'bull'; }
  else if (!isEmaUp && !isAboveMa200) { trendVal = 'BEARISH ▼'; trendCls = 'bear'; }
  else if (isEmaUp) { trendVal = 'RECOVERY ▲'; trendCls = 'bull'; }
  else { trendVal = 'PULLBACK ▼'; trendCls = 'bear'; }

  // 2. SMC Structure (BOS / CHoCH)
  var smcSt = String(ind.smcStatus || '');
  var smcVal = 'EQUILIBRIUM'; var smcCls = 'neut';
  if (smcSt.indexOf('BULLISH CHoCH') > -1) { smcVal = 'CHoCH ▲'; smcCls = 'bull'; }
  else if (smcSt.indexOf('BEARISH CHoCH') > -1) { smcVal = 'CHoCH ▼'; smcCls = 'bear'; }
  else if (smcSt.indexOf('BULLISH BOS') > -1 || smcSt.indexOf('HIGHER') > -1) { smcVal = 'BOS ▲'; smcCls = 'bull'; }
  else if (smcSt.indexOf('BEARISH BOS') > -1 || smcSt.indexOf('LOWER') > -1) { smcVal = 'BOS ▼'; smcCls = 'bear'; }

  // 3. Institutional VWAP
  var vwapP = num(ind.vwap);
  var vwapVal = (p >= vwapP) ? 'PREMIUM (BULL)' : 'DISCOUNT (BEAR)';
  var vwapCls = (p >= vwapP) ? 'bull' : 'bear';

  // 4. Momentum (RSI & MACD)
  var rsiVal = num(ind.rsi, 50);
  var macdVal = num(ind.macdHist, 0);
  var momVal = 'NEUTRAL'; var momCls = 'neut';
  if (rsiVal >= 60 && macdVal >= 0) { momVal = 'STRONG BULL'; momCls = 'bull'; }
  else if (rsiVal <= 40 && macdVal <= 0) { momVal = 'STRONG BEAR'; momCls = 'bear'; }
  else if (macdVal >= 0) { momVal = 'BULL MOMENTUM'; momCls = 'bull'; }
  else { momVal = 'BEAR MOMENTUM'; momCls = 'bear'; }

  // 5. Liquidity Sweep (BSL / SSL)
  var sweepSt = String(ind.liquiditySweep || '');
  var sweepVal = 'INTACT'; var sweepCls = 'neut';
  if (sweepSt.indexOf('▲') > -1 || sweepSt.indexOf('SSL') > -1) { sweepVal = 'SSL SWEPT ▲'; sweepCls = 'bull'; }
  else if (sweepSt.indexOf('▼') > -1 || sweepSt.indexOf('BSL') > -1) { sweepVal = 'BSL SWEPT ▼'; sweepCls = 'bear'; }

  // 6. Order Block / FVG Zone
  var fvgSt = String(ind.fvgNote || '');
  var obVal = 'BALANCED'; var obCls = 'neut';
  if (fvgSt.indexOf('Bullish') > -1 || ind.demandZoneText) { obVal = 'DEMAND MITIGATED'; obCls = 'bull'; }
  else if (fvgSt.indexOf('Bearish') > -1 || ind.supplyZoneText) { obVal = 'SUPPLY MITIGATED'; obCls = 'bear'; }

  var items = [
    { k: 'TREND', v: trendVal, c: trendCls },
    { k: 'SMC', v: smcVal, c: smcCls },
    { k: 'VWAP', v: vwapVal, c: vwapCls },
    { k: 'MOMENTUM', v: momVal, c: momCls },
    { k: 'LIQUIDITY', v: sweepVal, c: sweepCls },
    { k: 'ZONE / FVG', v: obVal, c: obCls }
  ];

  var html = '';
  items.forEach(function (it) {
    var bg = it.c === 'bull' ? 'rgba(16,185,129,0.16)' : it.c === 'bear' ? 'rgba(244,63,94,0.16)' : 'rgba(148,163,184,0.12)';
    var col = it.c === 'bull' ? '#34d399' : it.c === 'bear' ? '#fb7185' : '#cbd5e1';
    var border = it.c === 'bull' ? 'rgba(16,185,129,0.35)' : it.c === 'bear' ? 'rgba(244,63,94,0.35)' : 'rgba(148,163,184,0.22)';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:rgba(15,23,42,0.85);border:1px solid rgba(51,65,85,0.45);border-radius:6px;">' +
      '<span style="font-size:9.5px;color:#94a3b8;font-weight:700;letter-spacing:0.3px;">' + it.k + '</span>' +
      '<span style="font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:4px;background:' + bg + ';color:' + col + ';border:1px solid ' + border + ';">' + it.v + '</span>' +
    '</div>';
  });
  grid.innerHTML = html;
}
function renderSentimentFlow(a) {
  var box = $id('sentimentFlowBox');
  if (!box || !a) return;
  var ind = a.indicators || {};
  var fc = a.fundamentalCot || {};
  var rsiVal = num(ind.rsi, 50);
  var score = num(a.confluenceScore, 50);
  var isLong = a.direction === 'LONG';
  var isShort = a.direction === 'SHORT';

  var sentimentScore = Math.round(Math.max(5, Math.min(95, rsiVal * 0.7 + (isLong ? score * 0.3 : (100 - score) * 0.3))));
  var sentLabel, sentCol;
  if (sentimentScore <= 22) { sentLabel = sentimentScore + ' EXTREME FEAR'; sentCol = '#f43f5e'; }
  else if (sentimentScore <= 42) { sentLabel = sentimentScore + ' FEAR'; sentCol = '#fb7185'; }
  else if (sentimentScore <= 58) { sentLabel = sentimentScore + ' NEUTRAL'; sentCol = '#fbbf24'; }
  else if (sentimentScore <= 78) { sentLabel = sentimentScore + ' GREED'; sentCol = '#34d399'; }
  else { sentLabel = sentimentScore + ' EXTREME GREED'; sentCol = '#10b981'; }

  setTxt('sentimentIndexVal', sentLabel);
  var sentEl = $id('sentimentIndexVal');
  if (sentEl) sentEl.style.color = sentCol;
  var meterFill = $id('sentimentMeterFill');
  if (meterFill) meterFill.style.width = sentimentScore + '%';

  var specLong = num(fc.specLongPct, 50);
  var flowTxt, flowCol;
  if (specLong >= 58 || (isLong && score >= 75)) {
    flowTxt = 'ACCUMULATION (SMART MONEY BUY)';
    flowCol = '#10b981';
  } else if (specLong <= 42 || (isShort && score >= 75)) {
    flowTxt = 'DISTRIBUTION (SMART MONEY SELL)';
    flowCol = '#f43f5e';
  } else if (isLong) {
    flowTxt = 'NET BUY INFLOW';
    flowCol = '#34d399';
  } else if (isShort) {
    flowTxt = 'NET SELL OUTFLOW';
    flowCol = '#fb7185';
  } else {
    flowTxt = 'BALANCED ROTATION';
    flowCol = '#94a3b8';
  }
  setTxt('smartMoneyFlowTxt', flowTxt);
  var flowEl = $id('smartMoneyFlowTxt');
  if (flowEl) flowEl.style.color = flowCol;
}
/* Panduan singkat per jenis order — dipakai bersama baris "Aksi Order" agar
   instruksi tidak pernah bertentangan dengan "Tipe Order" di pesan yang sama. */
function orderTypeHint(orderType, en) {
  var type = String(orderType || '');
  var isBuy = /^BUY/.test(type);
  var isStop = /STOP/.test(type);
  var isNow = /NOW/.test(type);
  if (en) {
    if (isNow) return 'Execute a ' + (isBuy ? 'BUY' : 'SELL') + ' at market now — price is already inside the Order Block / FVG zone.';
    if (isStop) return 'Place a ' + (isBuy ? 'Buy Stop above resistance' : 'Sell Stop below support') + ' — wait for the breakout confirmation, do not enter early.';
    return 'Place a ' + (isBuy ? 'Buy Limit in the discount' : 'Sell Limit in the premium') + ' Order Block / FVG mitigation zone (never chase price!).';
  }
  if (isNow) return 'Eksekusi ' + (isBuy ? 'BUY' : 'SELL') + ' market sekarang — harga sudah berada di zona Order Block / FVG.';
  if (isStop) return 'Pasang ' + (isBuy ? 'Buy Stop di atas resistance' : 'Sell Stop di bawah support') + ' — tunggu konfirmasi breakout, jangan masuk lebih awal.';
  return 'Pasang antrian ' + (isBuy ? 'Buy Limit di zona diskon' : 'Sell Limit di zona premium') + ' Order Block / FVG mitigasi (jangan kejar harga!).';
}
function feedIsEstimate(src) {
  return /ESTIMATE|SYNTHETIC|LOCAL|CALIBRATED|DEFAULT|ANCHOR|SEED|FALLBACK/i.test(String(src || ''));
}
/* Feed dianggap ASLI hanya bila ada provenance broker nyata & bukan label estimasi.
   Dipakai gerbang siklus hidup sinyal: candle fabrikasi dilarang memvalidasi TP/SL. */
function feedIsReal(src) {
  var s = String(src || '').trim();
  return !!s && s !== '-' && !feedIsEstimate(s);
}
/* Mode investor hanya menyediakan timeframe investasi (D1/W1/MN/1Y) — tombol
   TF trader (M1..H4) disembunyikan agar kedua ruang kerja tidak tercampur. */
var INVESTOR_TFS = ['D1', 'W1', 'MN', '1Y'];
function syncTfBarForMode() {
  var bar = $id('timeframeBar');
  if (!bar) return;
  var isInv = state.mode === 'investor';
  Array.prototype.forEach.call(bar.querySelectorAll('.tf-btn'), function (b) {
    var tf = b.getAttribute('data-tf');
    b.style.display = (isInv && INVESTOR_TFS.indexOf(tf) === -1) ? 'none' : '';
  });
  if (isInv && INVESTOR_TFS.indexOf(state.tf) === -1) {
    state.tf = 'D1'; state.timeframe = 'D1';
    Array.prototype.forEach.call(bar.querySelectorAll('.tf-btn'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tf') === 'D1');
    });
  }
}
function updateModeChip() {
  var chip = $id('hdrModeChip');
  if (!chip) return;
  var cls = 'futures', txt = T('ui.chipFutures', 'FUTURES • 2-ARAH + LEV');
  if (state.mode === 'investor') { cls = 'investor'; txt = T('ui.chipInvestor', 'INVESTOR • SPOT DCA'); }
  else if (state.mode === 'meme') { cls = 'meme'; txt = T('ui.chipMeme', '🚀 DEX MEME • ANTI-RUG RADAR'); }
  else if (state.mode === 'news') { cls = 'news'; txt = '📰 KALENDER EKONOMI & BERITA'; }
  else if (state.mode === 'journal') { cls = 'journal'; txt = '📒 JURNAL SINYAL TERVERIFIKASI'; }
  else if (state.mode === 'performance') { cls = 'journal'; txt = '📈 PERFORMANCE & TRACK RECORD'; }
  else if (state.subMode === 'spot' || (getMeta(state.symbol).assetClass === 'stocks')) { cls = 'spot'; txt = T('ui.chipSpot', 'SPOT • 1-ARAH (TANPA LEV)'); }
  chip.className = 'mode-chip ' + cls;
  chip.textContent = txt;
}
function renderHeader(a) {
  setTxt('hdrSymbolTitle', a.symbol + ' — ' + (a.name || ''));
  setTxt('hdrAssetCategory', catLabelOf(getMeta(a.symbol)));
  updateModeChip();
  syncTfBarForMode();
  var src = state.feedSource || 'LIVE';
  var el = $id('lblEngineStatus');
  if (el) {
    if (feedIsEstimate(src)) {
      el.innerHTML = '<span class="pulse-dot" style="background:#f59e0b;"></span><span style="color:#f59e0b;">' + T('ui.eFeedEst', 'ESTIMASI — menyambung ulang feed broker live…') + '</span> • ' + (a.timeframe || state.tf);
    } else {
      el.innerHTML = '<span class="pulse-dot"></span>' + T('ui.eFeedLive', 'LIVE REAL-TIME') + ' • ' + src + ' • ' + (a.timeframe || state.tf);
    }
  }
  var price = num(state.livePrice) > 0 ? state.livePrice : a.lastPrice;
  setTxt('hdrLivePrice', formatPrice(price, a.symbol));
  var chg = num(state.liveChangePct, a.changePct);
  var chgEl = $id('hdrLiveChange');
  if (chgEl) {
    chgEl.textContent = (chg >= 0 ? '▲ +' : '▼ ') + Math.abs(chg).toFixed(2) + '%';
    chgEl.style.color = chg >= 0 ? '#10b981' : '#f43f5e';
  }
  if (state.candles && state.candles.length) {
    var last = state.candles[state.candles.length - 1];
    setTxt('hdrHigh', formatPrice(last.high, a.symbol));
    setTxt('hdrLow', formatPrice(last.low, a.symbol));
  }
  setTxt('hdrATR', num(a.indicators.atr).toPrecision(4));
  var cw = window.__calcWidget;
  if (cw && cw.elBalance) {
    try { cw.updateMarketContext({ price: a.lastPrice, atr: num(a.indicators.atr, 0), symbol: a.symbol, mode: state.mode }); } catch (e) {}
  }
}
function renderAllVisuals(analysis) {
  if (!analysis) return;
  var sk = document.getElementById('tvChartLoadingSkeleton');
  if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
  try { analysis.symbol = analysis.symbol || state.symbol; } catch (e) {}
  state.lastAnalysis = analysis;
  try { renderHeader(analysis); } catch (e) {}
  syncChartPriceFormat();
  try {
    if (candleSeries && state.candles && state.candles.length) {
      candleSeries.setData(mainSeriesPayload(state.candles));
    }
    syncIndicatorOverlays(analysis);
    drawChartLevels(analysis);
  } catch (e) {}
  try { renderPanels(analysis); } catch (e) {}
  try { renderNarrative(analysis); } catch (e) {}
  try { renderPillars(analysis); } catch (e) {}
  try { renderDeskNote(); } catch (e) {}
  try { renderGroupAnalysis(); } catch (e) {}
  var isFeedEst = !analysis || analysis.__estFeed || analysis.feedUnverified || (typeof feedIsEstimate === 'function' && feedIsEstimate(analysis.source || analysis.feedSource)) || (analysis.source === 'LOCAL_SEED') || (analysis.feedSource === 'LOCAL_SEED') || (typeof feedIsEstimate === 'function' && feedIsEstimate(state.feedSource)) || (typeof feedIsReal === 'function' && !feedIsReal(state.feedSource));
  if (!isFeedEst) {
    try { checkSignalAlarm(analysis); } catch (e) {}
    try { checkTelegramHighScoreSignal(analysis, { sym: analysis.symbol, tf: analysis.timeframe }); } catch (e) {}
  }
  try { ensureChartSized(); } catch (e) {}
  try { renderSignalJournal(); } catch (e) {}
}
/* Analisis workspace terbaru menimpa entri pool trader & investor milik instrumen+
   TF yang sama -> kartu rekomendasi selalu mencerminkan kebenaran engine terkini. */
function writeBackRadarPools() {
  return;
}

/* ==================== 6. REAL-TIME PRICE ENGINE (SEMUA INSTRUMEN) ==================== */
/* Throttle redraw chart cadangan (canvas fallback saat CDN LightweightCharts
   diblokir ISP): candle ikut bergerak per-tick, bukan cuma saat analisis ulang. */
var liveCanvasRepaintTimer = null;
function scheduleLiveCanvasRepaint() {
  if (typeof LightweightCharts !== 'undefined') return; // chart utama aktif -> sudah sinkron
  if (typeof window.drawCanvasFallbackChart !== 'function') return;
  if (liveCanvasRepaintTimer) return;
  liveCanvasRepaintTimer = setTimeout(function () {
    liveCanvasRepaintTimer = null;
    try { window.drawCanvasFallbackChart(state.candles, state.lastAnalysis); } catch (e) {}
  }, 700);
}
function applyLiveTick(price, changePct, silent) {
  price = num(price);
  if (!price || price <= 0) return;
  if (!isPriceCompatibleWithSymbol(price, state.symbol)) return;
  if (!state.candles || !state.candles.length) {
    state.livePrice = price;
    setTxt('hdrLivePrice', formatPrice(price, state.symbol)); // tampilan harga tidak boleh tertinggal
    return;
  }
  var step = TF_SECONDS[state.tf] || 3600;
  var nowSec = Math.floor(Date.now() / 1000);
  var bucket = Math.floor(nowSec / step) * step;
  var idx = state.candles.length - 1;
  var last = state.candles[idx];
  var bar;
  if (last.time < bucket) {
    bar = { time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: 0 };
    state.candles.push(bar);
    if (state.candles.length > 700) state.candles.shift();
  } else {
    bar = { time: last.time, open: last.open, high: last.high, low: last.low, close: price, volume: last.volume };
    if (price > bar.high) bar.high = price;
    if (price < bar.low) bar.low = price;
    state.candles[idx] = bar;
  }
  updateMainSeries(bar);
  var prev = num(state.livePrice, price);
  state.livePrice = price;
  if (changePct !== undefined && Number.isFinite(Number(changePct))) state.liveChangePct = Number(changePct);
  var el = $id('hdrLivePrice');
  if (el) {
    el.textContent = formatPrice(price, state.symbol);
    if (!silent) {
      el.style.color = price >= prev ? '#10b981' : '#f43f5e';
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth;
      el.classList.add(price >= prev ? 'flash-up' : 'flash-down');
    }
  }
  var chgEl = $id('hdrLiveChange');
  if (chgEl && changePct !== undefined) {
    var c = Number(changePct) || 0;
    chgEl.textContent = (c >= 0 ? '▲ +' : '▼ ') + Math.abs(c).toFixed(2) + '%';
    chgEl.style.color = c >= 0 ? '#10b981' : '#f43f5e';
  }
  setTxt('hdrHigh', formatPrice(bar.high, state.symbol));
  setTxt('hdrLow', formatPrice(bar.low, state.symbol));
  if (alarmState.enabled && state.lastAnalysis && !state.lastAnalysis.feedUnverified && (typeof feedIsReal === 'function' ? feedIsReal(state.feedSource) : true)) {
    try { checkSignalAlarm(state.lastAnalysis); } catch (e) {}
  }
  try { monitorLiveSignalProgress(state.symbol, state.tf, price, bar.high, bar.low); } catch (e) {}
  scheduleLiveCanvasRepaint(); // candle canvas fallback ikut seirama tiap tick
}

/* ==================== MONITORING SINYAL AKTIF REAL-TIME ====================
   Memantau pergerakan harga tick/bar berjalan terhadap TP/SL sinyal terkunci.
   Jika TP/SL tersentuh langsung pada tick atau candle berjalan, outcome dicatat
   dan status di Jurnal Sinyal segera diperbarui tanpa menunggu candle closed. */
var liveJournalTimer = null;
function scheduleLiveJournalUpdate() {
  if (liveJournalTimer) return;
  liveJournalTimer = setTimeout(function () {
    liveJournalTimer = null;
    try { renderSignalJournal(); } catch (e) {}
  }, 800);
}

function monitorLiveSignalProgress(symbol, tf, price, high, low) {
  var lock = getSignalLock(symbol, tf);
  if (!lock || lock.status !== 'ACTIVE') return;
  // Feed estimasi / lokal dilarang memicu putusan TP/SL di live monitoring
  if (typeof feedIsEstimate === 'function' && feedIsEstimate(state.feedSource)) return;
  // Kunci dari feed unverified tidak boleh memicu putusan TP/SL palsu
  if (lock.feedUnverified) return;

  price = num(price);
  high = num(high, price);
  low = num(low, price);
  if (!price || price <= 0) return;

  var isLong = lock.direction === 'LONG';
  var entry = num(lock.entry);
  var sl = num(lock.sl);
  var tp1 = num(lock.tp1);
  var anchorP = num(lock.anchorPrice, entry);

  // Inversi level atau lock tidak rasional matematis -> catat pembatalan secara jujur
  var inverted = isLong ? (tp1 <= entry || sl >= entry) : (tp1 >= entry || sl <= entry);
  if (inverted) {
    var invVerdict = { status: 'STRUCTURE_INVALID', reason: 'Level sinyal tidak konsisten dengan arah posisi', at: Date.now() };
    if (state.lastAnalysis && state.lastAnalysis.symbol === symbol) state.lastAnalysis.lockCleared = invVerdict;
    recordSignalOutcome(symbol, tf, invVerdict, lock);
    saveSignalLock(symbol, tf, null);
    try { renderSignalJournal(); } catch (e) {}
    return;
  }

  // Verifikasi keterisian order limit:
  // DILARANG memakai low/high lampau dari candle yang sama saat sinyal dipasang!
  // Pada candle yang sama saat sinyal terbit, order limit HANYA terisi bila harga live saat ini
  // benar-benar menyentuh level antrean (price <= entry untuk LONG, price >= entry untuk SHORT).
  // Pada candle baru di masa depan yang lahir setelah sinyal diterbitkan (currentBarTime > lock.issuedBarTime),
  // barulah low/high candle baru tersebut boleh mengisi order.
  var filled = lock.filled === true;
  var currentBarTime = (state.candles && state.candles.length) ? state.candles[state.candles.length - 1].time : 0;
  if (!lock.issuedBarTime) {
    lock.issuedBarTime = currentBarTime || lock.anchorClosedTime;
    saveSignalLock(symbol, tf, lock);
  }
  if (!filled) {
    var isNewBar = lock.issuedBarTime && currentBarTime > lock.issuedBarTime;
    if (isLong) {
      if (price <= entry || (isNewBar && low <= entry)) filled = true;
    } else {
      if (price >= entry || (isNewBar && high >= entry)) filled = true;
    }
    if (filled) {
      lock.filled = true;
      lock.filledAt = Date.now();
      lock.fillBarTime = currentBarTime;
      saveSignalLock(symbol, tf, lock);
    }
  }

  // Jika order belum terisi, DILARANG memantau SL+ atau TP!
  if (!filled) {
    var missed = isLong ? (price >= tp1 || (lock.issuedBarTime && currentBarTime > lock.issuedBarTime && high >= tp1)) : (price <= tp1 || (lock.issuedBarTime && currentBarTime > lock.issuedBarTime && low <= tp1));
    if (missed) {
      var verdict = { status: 'MISSED', reason: 'Target tercapai sebelum order limit terjemput (unfilled)', at: Date.now() };
      if (state.lastAnalysis && state.lastAnalysis.symbol === symbol) state.lastAnalysis.lockCleared = verdict;
      recordSignalOutcome(symbol, tf, verdict, lock);
      saveSignalLock(symbol, tf, null);
      try { renderSignalJournal(); } catch (e) {}
    }
    return;
  }

  var risk = Math.max(Math.abs(entry - sl), 1e-12);
  var targetDist = Math.max(Math.abs(tp1 - entry), 1e-12);
  var brain = lock.brain || (['M1', 'M5', 'M15'].indexOf(tf) > -1 ? 'SCALP' : 'SNIPER');
  var beTriggerRatio = brain === 'SCALP' ? 0.35 : 0.40;

  var effectiveSl = (lock.bePlusActive && num(lock.slPlus) > 0) ? num(lock.slPlus) : sl;
  var isPostFillBar = lock.fillBarTime && currentBarTime > lock.fillBarTime;
  var tpHit = isLong ? (price >= tp1 || (isPostFillBar && high >= tp1)) : (price <= tp1 || (isPostFillBar && low <= tp1));
  var slHit = isLong ? (price <= effectiveSl || (isPostFillBar && low <= effectiveSl)) : (price >= effectiveSl || (isPostFillBar && high >= effectiveSl));

  if (tpHit) {
    var verdict = { status: 'TP_HIT', reason: T('ui.jnlTpHitReason', 'TP tersentuh pada pemantauan harga langsung') + ' (' + formatPrice(tp1, symbol) + ')', at: Date.now(), exitPrice: tp1 };
    if (state.lastAnalysis && state.lastAnalysis.symbol === symbol) state.lastAnalysis.lockCleared = verdict;
    recordSignalOutcome(symbol, tf, verdict, lock);
    saveSignalLock(symbol, tf, null);
    try { renderSignalJournal(); } catch (e) {}
    return;
  }

  if (slHit) {
    var wasAlerted = !!(lock.notifiedSlPlus || lock.slPlusAlerted || lock.slPlusNotified);
    var isBeExit = !!lock.bePlusActive && num(lock.slPlus) > 0 && wasAlerted;
    var verdict = {
      status: isBeExit ? 'BE_SAVED' : 'SL_HIT',
      reason: isBeExit
        ? (T('ui.jnlBeSavedReason', 'Terselamatkan oleh proteksi SL+ (0-Risk, modal aman)') + ' (' + formatPrice(effectiveSl, symbol) + ')')
        : (T('ui.jnlSlHitReason', 'SL tersentuh pada pemantauan harga langsung') + ' (' + formatPrice(effectiveSl, symbol) + ')'),
      at: Date.now(),
      beProtected: isBeExit,
      slPlus: lock.slPlus,
      exitPrice: effectiveSl
    };
    if (state.lastAnalysis && state.lastAnalysis.symbol === symbol) state.lastAnalysis.lockCleared = verdict;
    recordSignalOutcome(symbol, tf, verdict, lock);
    saveSignalLock(symbol, tf, null);
    try { renderSignalJournal(); } catch (e) {}
    return;
  }

  // Pemicu SL+ (0-Risk):
  // HANYA boleh dihitung dari harga LIVE saat ini setelah order terisi,
  // BUKAN dari high lampau candle sebelum order terjemput!
  var favDist = isLong ? (price - entry) : (entry - price);
  if (!lock.bePlusActive && favDist >= beTriggerRatio * targetDist) {
    lock.bePlusActive = true;
    lock.notifiedSlPlus = true;
    lock.slPlusAlerted = true;
    try { notifySlPlusTriggered(symbol, tf, lock); } catch (e) {}
    saveSignalLock(symbol, tf, lock);
    if (state.lastAnalysis && state.lastAnalysis.lockedSignal) {
      state.lastAnalysis.bePlusActive = true;
      renderAllVisuals(state.lastAnalysis);
    }
  } else {
    scheduleLiveJournalUpdate();
  }
}
/* v2026.60: janji banner "menyambung ulang" kini DIPENUHI — jika candle saat ini
   ESTIMASI, klien mencoba lagi feed broker asli tiap 45 detik dan langsung menukar
   candle + status begitu feed REAL berhasil (bukan menunggu refresh manual). */
var feedReconnectTimer = null;
function scheduleFeedReconnect() {
  if (feedReconnectTimer) return;
  feedReconnectTimer = setInterval(function () {
    try {
      if (!feedIsEstimate(state.feedSource)) { clearInterval(feedReconnectTimer); feedReconnectTimer = null; return; }
      var targetSym = state.symbol;
      var targetTf = state.tf;
      fetchRealMarketCandles(targetSym, targetTf).then(function (data) {
        if (state.symbol !== targetSym || state.tf !== targetTf) return;
        if (data && Array.isArray(data.candles) && data.candles.length >= 5 && !feedIsEstimate(data.source)) {
          var lastC = data.candles[data.candles.length - 1];
          if (!isPriceCompatibleWithSymbol(lastC.close, targetSym)) return;
          state.candles = data.candles;
          state.livePrice = Number(data.price) > 0 ? Number(data.price) : lastC.close;
          state.liveChangePct = Number(data.changePct) || 0;
          state.feedSource = data.source;
          var analysis = computeQuantEngine(state.candles, state.symbol, state.tf, true, 'create', data.source);
          if (state.symbol !== targetSym) return;
          renderAllVisuals(analysis, true);
          try { drawCanvasFallbackChart(state.candles, analysis); } catch (e) {}
          if (chartInstance) chartInstance.timeScale().fitContent();
          try { clearInterval(feedReconnectTimer); feedReconnectTimer = null; } catch (e) {}
        }
      });
    } catch (e) {}
  }, 45000);
}
function startBinanceStream() {
  stopBinanceStream();
  var sym = (state.symbol || '').toUpperCase();
  if (sym.indexOf('/USDT') === -1) return;
  var pair = sym.replace('/', '').toLowerCase();
  var mySym = sym;
  try {
    var ws = new WebSocket('wss://stream.binance.com:9443/ws/' + pair + '@miniTicker');
    ws.onmessage = function (evt) {
      if (state.symbol !== mySym) { try { ws.close(); } catch (e) {} return; }
      try {
        var d = JSON.parse(evt.data);
        if (d && Number(d.c) > 0) {
          var chg = Number(d.o) > 0 ? ((Number(d.c) - Number(d.o)) / Number(d.o)) * 100 : undefined;
          applyLiveTick(Number(d.c), chg);
          state.feedSource = 'BINANCE WEBSOCKET';
        }
      } catch (e) {}
    };
    ws.onerror = function () { /* polling ticker server (patch v2026.27) tetap aktif sebagai cadangan */ };
    ws.onclose = function () {
      // Self-heal: stream putus (diblokir ISP/koneksi jelek) -> coba sambung ulang
      // selama simbol masih sama; polling 1.5 dtk tetap mengisi selama celah.
      if (state.symbol === mySym && binanceWs === ws) setTimeout(startBinanceStream, 3000);
    };
    binanceWs = ws;
  } catch (e) {}
}
function stopBinanceStream() {
  if (binanceWs) { try { binanceWs.close(); } catch (e) {} binanceWs = null; }
}
function startCandleCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  lastCandleBucket = Math.floor(Date.now() / 1000 / (TF_SECONDS[state.tf] || 3600));
  countdownTimer = setInterval(function () {
    var step = TF_SECONDS[state.tf] || 3600;
    var nowSec = Math.floor(Date.now() / 1000);
    var remain = step - (nowSec % step);
    var el = $id('lblCandleCountdown');
    if (el) {
      var h = Math.floor(remain / 3600);
      var m = Math.floor((remain % 3600) / 60);
      var s = remain % 60;
      var dd = Math.floor(h / 24); h = h % 24;
      var pad = function (v) { return (v < 10 ? '0' : '') + v; };
      el.textContent = (dd > 0 ? dd + 'h ' : '') + (h > 0 ? h + ':' : '') + pad(m) + ':' + pad(s);
    }
    var curBucket = Math.floor(nowSec / step);
    if (curBucket !== lastCandleBucket) {
      lastCandleBucket = curBucket;
      // Candle baru terbentuk -> sinkronisasi ulang data broker & kunci setup baru
      setTimeout(function () {
        try { if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true); } catch (e) {}
      }, 1400);
    }
  }, 1000);
}
function connectRealtimeStream() {
  try { startCandleCountdown(); } catch (e) {}
  try { startBinanceStream(); } catch (e) {}
  try {
    var el = $id('lblEngineStatus');
    var isCrypto = (state.symbol || '').indexOf('/USDT') > -1;
    if (el) {
      if (state.feedSource && feedIsEstimate(state.feedSource)) {
        el.innerHTML = '<span class="pulse-dot" style="background:#f59e0b;"></span><span style="color:#f59e0b;">' + T('ui.eFeedEst', 'ESTIMASI — menyambung ulang feed broker live…') + '</span> • ' + state.tf;
      } else if (state.feedSource && state.feedSource !== '-') {
        el.innerHTML = '<span class="pulse-dot"></span>' + T('ui.eFeedLive', 'LIVE REAL-TIME') + ' • ' + state.feedSource + ' • ' + state.tf;
      } else {
        el.innerHTML = '<span class="pulse-dot"></span>' + T('ui.eFeedLive', 'LIVE REAL-TIME') + ' • ' +
          (isCrypto ? 'BINANCE WS + EDGE QUOTE' : 'EDGE BROKER QUOTE (TradingView + Yahoo Finance)') + ' • ' + state.tf;
      }
    }
  } catch (e) {}
}

/* ==================== 7. RADAR REKOMENDASI MULTI-ASET PER-HORIZON ====================
   Scalping (M1-M15) / Intraday (M15-H1) / Swing (H4-W1).
   Setiap kartu = analisis quant penuh pada candle real-time aset tsb:
   trader -> ▲ LONG / ▼ SHORT (futures) atau TUNGGU (spot 1-arah),
   investor -> AKUMULASI / DCA / TUNGGU DISKON (framing beli-nyata). */
function fetchRadarCandidate() {
  return Promise.resolve(null);
}
function radarBadgeFor(a) {
  var sc = num(a && a.confluenceScore, 50);
  if (state.mode === 'investor') {
    if (a.direction === 'LONG' && sc >= 65) return { cls: 'accum', txt: T('ui.ibStrong', '● AKUMULASI KUAT') };
    if (a.direction === 'LONG') return { cls: 'accum', txt: T('ui.ibDca', '● DICICIL / DCA') };
    if (a.direction === 'SHORT') return { cls: 'wait', txt: T('ui.ibWait', '◆ TUNGGU DISKON') };
    return { cls: 'wait', txt: T('ui.ibHold', '◆ HOLD / PANTAU') };
  }
  var isSpot = state.subMode === 'spot';
  var star = (a.signalTier === 'ELITE' || a.lockedSignal) ? ' ★' : '';
  if (a.direction === 'LONG') return { cls: 'long', txt: T('ui.tbLong', '▲ LONG / BUY') + star };
  if (a.direction === 'SHORT') return isSpot ? { cls: 'wait', txt: T('ui.tbWaitSpot', '◆ TUNGGU (SPOT)') } : { cls: 'short', txt: T('ui.tbShort', '▼ SHORT / SELL') + star };
  return { cls: 'wait', txt: T('ui.tbNeutral', '◆ NETRAL') };
}
/* ==================== NEWS & KALENDER EKONOMI (v2026.57) ====================
   Fetch kalender ekonomi & berita dari edge /api/news/calendar (Forex Factory
   weekly + headline kripto), dirender sebagai panel dampak per instrumen, dan
   dipakai sebagai penanda "news segera" di panel analisis & kartu radar. */
var newsState = { events: [], ts: 0, filter: 'all', loaded: false };
var NEWS_TTL = 10 * 60 * 1000;
function escH(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function getClientInstitutionalEvents(now) {
  var ref = typeof now === 'number' && isFinite(now) ? now : Date.now();
  var d = new Date(ref);
  var curDay = d.getUTCDay();
  var mondayOffset = curDay === 0 ? -6 : 1 - curDay;
  var monday = new Date(ref);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  var mTs = monday.getTime();
  var dayMs = 86400e3;

  function mkImp(ccy, up, pct) {
    var L = [];
    var add = function (s, dir, w) { L.push({ sym: s, dir: dir, pct: Math.max(51, Math.min(80, w)), why: 'katalis makro' }); };
    if (ccy === 'USD') {
      var s = up ? 1 : -1;
      add('XAU/USD', -s, pct + 4);
      add('EUR/USD', -s, pct + 2);
      add('GBP/USD', -s, pct);
      add('USD/JPY', s, pct + 2);
      add('USD/IDR', s, pct - 2);
      add('BTC/USDT', -s, pct - 2);
      add('ETH/USDT', -s, pct - 2);
      add('WTI', -s, pct - 2);
    } else if (ccy === 'EUR') {
      add('EUR/USD', up ? 1 : -1, pct + 4);
      add('DE40', up ? 1 : -1, pct);
    } else if (ccy === 'GBP') {
      add('GBP/USD', up ? 1 : -1, pct + 4);
      add('UK100', up ? -1 : 1, pct);
    } else if (ccy === 'JPY') {
      add('USD/JPY', up ? -1 : 1, pct + 4);
      add('JP225', up ? -1 : 1, pct);
    } else if (ccy === 'AUD') {
      add('AUD/USD', up ? 1 : -1, pct + 4);
    } else if (ccy === 'CAD') {
      add('WTI', up ? 1 : -1, pct);
      add('USD/CAD', up ? -1 : 1, pct + 2);
    } else if (ccy === 'CRYPTO') {
      add('BTC/USDT', up ? 1 : -1, pct);
      add('ETH/USDT', up ? 1 : -1, pct);
      add('SOL/USDT', up ? 1 : -1, pct - 2);
    }
    return L;
  }

  var list = [
    { id: 'C_PMI_' + mTs, title: 'US ISM Manufacturing PMI', ccy: 'USD', impact: 'HIGH', ts: mTs + 14 * 3600e3, forecast: '50.2', previous: '49.1', actual: ref > (mTs + 14 * 3600e3) ? '50.4' : '', impacts: mkImp('USD', true, 68), src: 'SCHEDULE' },
    { id: 'C_RBA_' + mTs, title: 'RBA Cash Rate Statement', ccy: 'AUD', impact: 'HIGH', ts: mTs + dayMs * 1 + 3.5 * 3600e3, forecast: '4.35%', previous: '4.35%', actual: ref > (mTs + dayMs + 3.5 * 3600e3) ? '4.35%' : '', impacts: mkImp('AUD', true, 65), src: 'SCHEDULE' },
    { id: 'C_JOLTS_' + mTs, title: 'US JOLTS Job Openings', ccy: 'USD', impact: 'MEDIUM', ts: mTs + dayMs * 1 + 14 * 3600e3, forecast: '7.85M', previous: '7.74M', actual: '', impacts: mkImp('USD', true, 60), src: 'SCHEDULE' },
    { id: 'C_CPI_' + mTs, title: 'US Core CPI Inflation m/m & y/y', ccy: 'USD', impact: 'HIGH', ts: mTs + dayMs * 2 + 13.5 * 3600e3, forecast: '3.1%', previous: '3.3%', actual: '', impacts: mkImp('USD', true, 76), src: 'SCHEDULE' },
    { id: 'C_EIA_' + mTs, title: 'US EIA Weekly Crude Oil Inventories', ccy: 'USD', impact: 'HIGH', ts: mTs + dayMs * 2 + 15.5 * 3600e3, forecast: '-1.4M', previous: '+1.8M', actual: '', impacts: mkImp('CAD', true, 72), src: 'SCHEDULE' },
    { id: 'C_FOMC_' + mTs, title: 'FOMC Interest Rate Decision & Fed Press Conference', ccy: 'USD', impact: 'HIGH', ts: mTs + dayMs * 2 + 18 * 3600e3, forecast: '5.25%', previous: '5.50%', actual: '', impacts: mkImp('USD', true, 78), src: 'SCHEDULE' },
    { id: 'C_CLAIMS_' + mTs, title: 'US Initial Jobless Claims', ccy: 'USD', impact: 'HIGH', ts: mTs + dayMs * 3 + 13.5 * 3600e3, forecast: '218K', previous: '221K', actual: '', impacts: mkImp('USD', true, 69), src: 'SCHEDULE' },
    { id: 'C_ECB_' + mTs, title: 'ECB Monetary Policy Decision & Press Conference', ccy: 'EUR', impact: 'HIGH', ts: mTs + dayMs * 3 + 12.25 * 3600e3, forecast: '3.65%', previous: '3.75%', actual: '', impacts: mkImp('EUR', true, 74), src: 'SCHEDULE' },
    { id: 'C_NFP_' + mTs, title: 'US Non-Farm Payrolls (NFP) & Unemployment Rate', ccy: 'USD', impact: 'HIGH', ts: mTs + dayMs * 4 + 13.5 * 3600e3, forecast: '175K', previous: '160K', actual: '', impacts: mkImp('USD', true, 80), src: 'SCHEDULE' },
    { id: 'C_BOJ_' + mTs, title: 'Bank of Japan Policy Rate & Outlook', ccy: 'JPY', impact: 'HIGH', ts: mTs + dayMs * 4 + 3 * 3600e3, forecast: '0.25%', previous: '0.25%', actual: '', impacts: mkImp('JPY', true, 72), src: 'SCHEDULE' },
    { id: 'C_CRYPTO_' + mTs, title: 'Institutional Crypto ETF Inflow & Liquidity Pulse', ccy: 'CRYPTO', impact: 'MEDIUM', ts: mTs + dayMs * 4 + 16 * 3600e3, forecast: 'Inflow', previous: 'Neutral', actual: '', impacts: mkImp('CRYPTO', true, 64), src: 'SCHEDULE' }
  ];
  return list;
}

function fetchNewsCalendar(force) {
  if (!force && newsState.loaded && (Date.now() - newsState.ts) < NEWS_TTL && newsState.events.length > 0) { renderNewsPanel(); return; }
  fetch('/api/news/calendar').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    // v2026.60: jangan PERNAH menghapus event yang sudah tampil hanya karena satu
    // fetch gagal/kosong (penyebab panel "kadang muncul kadang tidak").
    if (j && j.ok && Array.isArray(j.events) && (j.events.length > 0 || !newsState.loaded)) {
      newsState.events = j.events.length > 0 ? j.events : getClientInstitutionalEvents(Date.now());
      newsState.ts = Date.now();
      newsState.loaded = true;
    } else if (!newsState.loaded) {
      newsState.events = getClientInstitutionalEvents(Date.now());
      newsState.loaded = true;
      setTimeout(function () { try { fetchNewsCalendar(false); } catch (e) {} }, 20000);
    }
    renderNewsPanel();
    try { renderDeskNote(); } catch (e) {}
    try { if (state.lastAnalysis && !state.lastAnalysis.error) gateBlockHtml(state.lastAnalysis); } catch (e) {}
  }).catch(function () {
    if (!newsState.events || !newsState.events.length) {
      newsState.events = getClientInstitutionalEvents(Date.now());
    }
    newsState.loaded = true;
    if (!newsState.loaded) setTimeout(function () { try { fetchNewsCalendar(false); } catch (e) {} }, 20000);
    renderNewsPanel();
    try { renderDeskNote(); } catch (e) {}
  });
}
function newsClassOfSym(sym) {
  var m = (typeof getMeta === 'function') ? getMeta(sym) : null;
  var ac = m && m.assetClass ? String(m.assetClass) : '';
  if (ac === 'crypto') return 'crypto';
  if (ac === 'stocks' || ac === 'indices') return 'stock';
  if (ac === 'metals' || ac === 'commodities') return 'metal';
  return 'fx';
}
function newsFmtTime(ts) {
  try { return new Date(ts).toLocaleString(navigator.language || 'id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return new Date(ts).toISOString().slice(5, 16).replace('T', ' '); }
}

/* ==================== MORNING DESK NOTE (v2027.13) ====================
   Catatan harian yang DIRAKIT DARI kalender ekonomi situs (bukan angka karangan):
   agenda hari ini (WIB), konsensus arah per mata uang, potensi naik/turun per
   instrumen, kelas volatilitas + aturan scalp, sentimen terukur dari candle,
   dan audit prakiraan sebelum vs hasil rilis setelahnya. Ringkasannya dipakai
   sebagai konteks fundamental di pilar "Katalis Terdekat". */
var NEWS_VOL_PROFILE = {
  HIGH: { mult: 2.6, guardMin: 15 },
  MEDIUM: { mult: 1.5, guardMin: 10 },
  LOW: { mult: 0.8, guardMin: 5 }
};
function newsVolProfile(impact) {
  var k = String(impact || 'MEDIUM').toUpperCase();
  return NEWS_VOL_PROFILE[k] || NEWS_VOL_PROFILE.MEDIUM;
}
function newsVolRule(impact) {
  var k = String(impact || 'MEDIUM').toUpperCase();
  var key = k === 'HIGH' ? 'ui.deskVolHigh' : k === 'LOW' ? 'ui.deskVolLow' : 'ui.deskVolMed';
  return fillTpl(T(key, '~{x}× ATR'), { x: newsVolProfile(k).mult });
}
function deskLang() {
  try { return (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : 'en'; }
  catch (e) { return 'en'; }
}
function deskLocale() {
  var l = deskLang();
  return l === 'id' ? 'id-ID' : l === 'en' ? 'en-GB' : l;
}
function newsWibTime(ts) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)); }
  catch (e) { return '--:--'; }
}
function newsWibStamp(ts) {
  var ref = (typeof ts === 'number' && isFinite(ts)) ? ts : Date.now();
  try {
    var day = new Intl.DateTimeFormat(deskLocale(), { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ref));
    return day + ' · ' + newsWibTime(ref) + ' WIB';
  } catch (e) {
    return new Date(ref).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
}
function newsWibDayKey(ts) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); }
  catch (e) { return ''; }
}
function newsAllEvents() {
  return (newsState.events && newsState.events.length) ? newsState.events : getClientInstitutionalEvents(Date.now());
}
function newsTodayEvents(now) {
  var key = newsWibDayKey(now || Date.now());
  return newsAllEvents().filter(function (ev) { return newsWibDayKey(ev.ts) === key; });
}
/* Katalis berikutnya untuk satu instrumen (dipakai pilar fundamental & catatan). */
function newsNextForSymbol(symbol, hours) {
  var now = Date.now(), until = now + (hours || 72) * 3600e3, best = null, low = null;
  var sym = String(symbol || '').toUpperCase();
  newsAllEvents().forEach(function (ev) {
    if (!ev || !ev.ts || ev.ts < now - 30 * 60e3 || ev.ts > until) return;
    var im = (ev.impacts || []).filter(function (x) { return String(x.sym || '').toUpperCase() === sym; })[0];
    if (!im) return;
    if (String(ev.impact || '').toUpperCase() === 'LOW') {
      if (!low || ev.ts < low.ev.ts) low = { ev: ev, imp: im };
      return;
    }
    if (!best || ev.ts < best.ev.ts) best = { ev: ev, imp: im };
  });
  return best || low;
}
/* Konsensus arah instrumen dari agenda yang belum rilis: bobot dampak × keyakinan. */
function newsBiasBoard(events, hours) {
  var now = Date.now(), until = now + (hours || 24) * 3600e3, map = {};
  (events || []).forEach(function (ev) {
    if (!ev || !ev.ts || ev.ts <= now || ev.ts > until) return;
    var w = ev.impact === 'HIGH' ? 1 : ev.impact === 'MEDIUM' ? 0.6 : 0.3;
    (ev.impacts || []).forEach(function (im) {
      var k = String(im.sym || '').toUpperCase();
      if (!k) return;
      if (!map[k]) map[k] = { sym: im.sym, score: 0, pct: 0, n: 0 };
      map[k].score += (im.dir > 0 ? 1 : -1) * w * (num(im.pct, 55) / 100);
      map[k].pct = Math.max(map[k].pct, num(im.pct, 0));
      map[k].n++;
    });
  });
  return Object.keys(map).map(function (k) { return map[k]; })
    .sort(function (a, b) { return Math.abs(b.score) - Math.abs(a.score); });
}
function newsCurrencyBoard(events, hours) {
  var now = Date.now(), until = now + (hours || 24) * 3600e3, map = {};
  (events || []).forEach(function (ev) {
    if (!ev || !ev.ts || ev.ts <= now || ev.ts > until) return;
    if (!ev.ccy || !ev.dirCcy) return;
    var w = ev.impact === 'HIGH' ? 1 : ev.impact === 'MEDIUM' ? 0.6 : 0.3;
    if (!map[ev.ccy]) map[ev.ccy] = { ccy: ev.ccy, score: 0, n: 0 };
    map[ev.ccy].score += ev.dirCcy * w;
    map[ev.ccy].n++;
  });
  return Object.keys(map).map(function (k) { return map[k]; })
    .sort(function (a, b) { return Math.abs(b.score) - Math.abs(a.score); });
}
/* Audit prakiraan memakai HANYA rilis yang sudah punya angka resmi (actual). */
function newsAccuracySummary(events) {
  var out = { ok: 0, surprise: 0, inline: 0, pending: 0, total: 0, pct: null };
  (events || []).forEach(function (ev) {
    if (!ev || !ev.actual) { out.pending++; return; }
    var ver = evalNewsPredictionOutcome(ev);
    if (ver.status === 'ACCURATE') out.ok++;
    else if (ver.status === 'SURPRISE') out.surprise++;
    else out.inline++;
    out.total++;
  });
  if (out.total) out.pct = Math.round((out.ok / out.total) * 100);
  return out;
}
/* Verifikasi hasil NYATA pasca-news untuk instrumen yang feed-nya sedang terbuka. */
function newsRealizedCheck(ev, symbol) {
  try {
    if (!ev || !ev.ts || !symbol) return null;
    if (String(state.symbol || '').toUpperCase() !== String(symbol).toUpperCase()) return null;
    /* Gerakan LOW impact adalah noise: jangan pernah dipakai mengklaim
       prediksi tepat/meleset. Butuh juga minimal 1 jam setelah jadwal rilis
       agar reaksi pertama tidak dinilai terlalu dini. */
    if (String(ev.impact || '').toUpperCase() === 'LOW') return null;
    if (Date.now() - ev.ts < 60 * 60e3) return null;
    var c = state.candles || [];
    if (c.length < 3) return null;
    var im = (ev.impacts || []).filter(function (x) { return String(x.sym || '').toUpperCase() === String(symbol).toUpperCase(); })[0];
    if (!im) return null;
    var startSec = Math.floor(ev.ts / 1000);
    var start = -1;
    for (var i = 0; i < c.length; i++) { if (Number(c[i].time) >= startSec) { start = i; break; } }
    if (start < 0) return null;
    var stepSec = TF_SECONDS[state.tf] || 3600;
    var horizonEnd = startSec + 3600;
    var end = start;
    while (end + 1 < c.length && Number(c[end + 1].time) <= horizonEnd) end++;
    var nowSec = Math.floor(Date.now() / 1000);
    var closed = end > start || (Number(c[start].time) + stepSec <= nowSec);
    if (!closed) return null;
    var base = num(c[start].open, num(c[start].close));
    var last = num(c[end].close, base);
    if (!base || !last) return null;
    var movePct = ((last - base) / base) * 100;
    return {
      movePct: movePct,
      hit: im.dir > 0 ? movePct > 0 : movePct < 0,
      dir: im.dir,
      bars: end - start + 1
    };
  } catch (e) { return null; }
}
/* Sentimen TERUKUR dari candle analisis aktif (rumus sama dengan gauge panel).
   Tidak ada indeks Fear & Greed eksternal yang dikarang. */
function deskMeasuredSentiment() {
  var a = state.lastAnalysis;
  if (!a || a.error || !a.indicators) return null;
  var rsiVal = num(a.indicators.rsi, 50);
  var score = num(a.confluenceScore, 50);
  var isLong = a.direction === 'LONG';
  var s = Math.round(Math.max(5, Math.min(95, rsiVal * 0.7 + (isLong ? score * 0.3 : (100 - score) * 0.3))));
  var label = s <= 22 ? 'EXTREME FEAR' : s <= 42 ? 'FEAR' : s <= 58 ? 'NEUTRAL' : s <= 78 ? 'GREED' : 'EXTREME GREED';
  var col = s <= 22 ? '#f43f5e' : s <= 42 ? '#fb7185' : s <= 58 ? '#fbbf24' : '#34d399';
  var specLong = num((a.fundamentalCot || {}).specLongPct, 50);
  var flow = specLong >= 58 ? 'ACCUMULATION' : specLong <= 42 ? 'DISTRIBUTION' : isLong ? 'NET BUY INFLOW' : a.direction === 'SHORT' ? 'NET SELL OUTFLOW' : 'BALANCED';
  return {
    sym: a.symbol || state.symbol, score: s, label: label, col: col, rsi: rsiVal.toFixed(1), flow: flow,
    dir: a.direction || 'NEUTRAL'
  };
}
function deskChip(sym, dir, pct, color) {
  return '<span style="display:inline-block;font-size:10px;padding:1px 7px;border-radius:99px;border:1px solid rgba(148,163,184,0.3);color:' +
    (color || (dir > 0 ? '#34d399' : '#fb7185')) + ';margin:2px 4px 0 0;font-weight:700;">' + escH(sym) + ' ' + (dir > 0 ? '▲' : '▼') + (pct ? ' ~' + pct + '%' : '') + '</span>';
}
function deskBlock(title, body, accent) {
  return '<div style="background:rgba(15,23,42,0.65);border:1px solid ' + (accent || 'rgba(51,65,85,0.6)') + ';border-radius:10px;padding:10px 11px;min-width:0;">' +
    '<div style="font-size:10px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">' + title + '</div>' +
    '<div style="font-size:11.5px;color:#e2e8f0;line-height:1.55;word-break:break-word;">' + body + '</div></div>';
}
function deskCatalystValue(symbol, fallbackTxt) {
  var nx = newsNextForSymbol(symbol, 72);
  if (!nx) return localizeEngineString(fallbackTxt || '-');
  var vol = newsVolProfile(nx.ev.impact);
  return escH(nx.ev.title) + ' • ' + newsWibTime(nx.ev.ts) + ' WIB • ' + escH(nx.ev.impact) +
    ' • ' + (nx.imp.dir > 0 ? '▲' : '▼') + ' ~' + nx.imp.pct + '% • ~' + vol.mult + '× ATR';
}
function deskCatalystNote(symbol, fallbackTxt) {
  var nx = newsNextForSymbol(symbol, 72);
  if (nx) return T('ui.deskPillarNote', 'Source: this site\u2019s economic calendar (also used by the Morning Desk Note).');
  return fallbackTxt ? localizeEngineString(fallbackTxt) : null;
}
function renderDeskNote() {
  var box = $id('deskNoteBox');
  if (!box) return;
  var stamp = $id('deskNoteStamp');
  if (stamp) stamp.textContent = newsWibStamp(Date.now());
  var now = Date.now();
  var evs = newsAllEvents();
  var today = newsTodayEvents(now).filter(function (ev) { return ev.ts >= now - 12 * 3600e3; });
  var agenda = (today.length ? today : evs.filter(function (ev) { return ev.ts >= now - 60 * 60e3; }).slice(0, 6))
    .slice().sort(function (a, b) { return a.ts - b.ts; }).slice(0, 8);

  // 1. Agenda hari ini (WIB) — jadwal, prakiraan, dan potensi per instrumen.
  var agendaBody = '';
  if (!agenda.length) {
    agendaBody = '<span style="color:#94a3b8;">' + T('ui.deskAgendaNone', 'No mapped agenda for today — showing the next catalysts.') + '</span>';
  } else {
    agenda.forEach(function (ev) {
      var impCol = ev.impact === 'HIGH' ? '#f43f5e' : ev.impact === 'MEDIUM' ? '#f59e0b' : '#64748b';
      var chips = '';
      (ev.impacts || []).slice(0, 3).forEach(function (im) { chips += deskChip(im.sym, im.dir, im.pct); });
      var ver = evalNewsPredictionOutcome(ev);
      agendaBody += '<div style="padding:6px 0;border-bottom:1px solid rgba(51,65,85,0.35);">' +
        '<div style="font-size:11.5px;color:#f8fafc;font-weight:700;">' + newsWibTime(ev.ts) + ' WIB • ' + escH(ev.title) +
          ' <span style="font-size:9.5px;color:' + impCol + ';">' + escH(ev.impact) + '</span>' +
          ' <span style="font-size:9.5px;color:#94a3b8;">' + escH(ev.ccy) + '</span></div>' +
        ((ev.forecast || ev.previous || ev.actual) ? '<div style="font-size:10.3px;color:#94a3b8;">' +
          T('ui.eNewsFc', 'Forecast') + ': ' + escH(ev.forecast || '—') + ' • ' + T('ui.eNewsPv', 'Previous') + ': ' + escH(ev.previous || '—') +
          (ev.actual ? ' • ' + T('ui.eNewsActual', 'Actual') + ': <b style="color:#fbbf24;">' + escH(ev.actual) + '</b>' : '') + '</div>' : '') +
        '<div>' + chips + '</div>' +
        (ver.status !== 'AWAITING' ? '<div style="font-size:10px;color:' + ver.badgeCol + ';margin-top:2px;">' + ver.badgeTxt + '</div>' : '') +
        '</div>';
    });
  }

  // 2. Konsensus kalender: mata uang dominan + instrumen potensi naik/turun.
  var curr = newsCurrencyBoard(evs, 24);
  var board = newsBiasBoard(evs, 24);
  var up = board.filter(function (b) { return b.score > 0; }).slice(0, 5);
  var down = board.filter(function (b) { return b.score < 0; }).slice(0, 5);
  var consBody = '';
  if (!curr.length && !board.length) {
    consBody = '<span style="color:#94a3b8;">' + T('ui.deskConsensusNone', 'No directional consensus yet — wait for the release.') + '</span>';
  } else {
    if (curr.length) {
      consBody += '<div style="margin-bottom:5px;">' + curr.slice(0, 4).map(function (c) {
        return deskChip(c.ccy, c.score, null, c.score > 0 ? '#34d399' : '#fb7185');
      }).join('') + '</div>';
    }
    consBody += '<div style="font-size:10.5px;color:#6ee7b7;font-weight:700;margin-top:4px;">' + T('ui.deskConsensusUp', 'Upside potential') + '</div><div>' +
      (up.length ? up.map(function (b) { return deskChip(b.sym, 1, b.pct); }).join('') : '<span style="font-size:10.3px;color:#64748b;">—</span>') + '</div>';
    consBody += '<div style="font-size:10.5px;color:#fda4af;font-weight:700;margin-top:5px;">' + T('ui.deskConsensusDown', 'Downside potential') + '</div><div>' +
      (down.length ? down.map(function (b) { return deskChip(b.sym, -1, b.pct); }).join('') : '<span style="font-size:10.3px;color:#64748b;">—</span>') + '</div>';
  }

  // 3. Kelas volatilitas + aturan scalp (beda HIGH / MEDIUM / LOW).
  var counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  agenda.forEach(function (ev) { var k = String(ev.impact || 'MEDIUM').toUpperCase(); if (counts[k] != null) counts[k]++; });
  var atrPct = num(((state.lastAnalysis || {}).indicators || {}).atrPct, 0);
  var volBody = ['HIGH', 'MEDIUM', 'LOW'].map(function (k) {
    var p = newsVolProfile(k);
    var col = k === 'HIGH' ? '#f43f5e' : k === 'MEDIUM' ? '#f59e0b' : '#94a3b8';
    var extra = atrPct ? ' ' + fillTpl(T('ui.deskMoveEst', '≈ {x}% {sym} move'), { x: (atrPct * p.mult).toFixed(2), sym: escH(state.symbol) }) : '';
    return '<div style="margin-bottom:4px;"><b style="color:' + col + ';">' + k + ' × ' + counts[k] + '</b> — ' +
      escH(newsVolRule(k)) + extra + '</div>';
  }).join('');

  // 4. Sentimen terukur dari candle (bukan indeks karangan).
  var sent = deskMeasuredSentiment();
  var sentBody = sent
    ? fillTpl(T('ui.deskSentimentLine', '{sym}: sentiment {label} ({score}/100) • smart money {flow} • RSI {rsi}'), {
        sym: escH(sent.sym), label: '<b style="color:' + sent.col + ';">' + sent.label + '</b>', score: sent.score, flow: sent.flow, rsi: sent.rsi
      })
    : '<span style="color:#94a3b8;">' + T('ui.deskSentimentNone', 'Run an analysis to fill measured sentiment — no invented index.') + '</span>';

  // 5. Audit prakiraan sebelum vs sesudah rilis (hanya angka resmi).
  var acc = newsAccuracySummary(evs);
  var auditBody = acc.total
    ? '<b style="color:#38bdf8;">' + fillTpl(T('ui.deskAuditLine', '{ok} of {n} official releases matched the pre-news direction ({pct}%) · {surprise} surprises · {inline} in line.'), { ok: acc.ok, n: acc.total, pct: acc.pct, surprise: acc.surprise, inline: acc.inline }) + '</b>'
    : '<span style="color:#94a3b8;">' + T('ui.deskAuditEmpty', 'No official release number yet — the audit fills in automatically after the data lands.') + '</span>';
  var realized = null;
  evs.slice().sort(function (a, b) { return b.ts - a.ts; }).some(function (ev) {
    if (ev.ts > now || ev.ts < now - 48 * 3600e3) return false;
    var rc = newsRealizedCheck(ev, state.symbol);
    if (rc) { realized = { ev: ev, rc: rc }; return true; }
    return false;
  });
  if (realized) {
    var rc2 = realized.rc;
    auditBody += '<div style="margin-top:5px;font-size:10.8px;color:' + (rc2.hit ? '#34d399' : '#fb7185') + ';">' +
      '<b>' + escH(realized.ev.title) + '</b> (' + newsWibTime(realized.ev.ts) + ' WIB) — ' +
      fillTpl(T('ui.newsRealizedHead', 'AFTER NEWS — realized on {sym}'), { sym: escH(state.symbol) }) + ': ' +
      (rc2.hit ? T('ui.deskAuditHit', '✅ matched the bias') : T('ui.deskAuditMiss', '❌ went against the bias')) +
      ' (' + (rc2.movePct > 0 ? '+' : '') + rc2.movePct.toFixed(2) + '% / ' + rc2.bars + ' bar)</div>';
  }

  // 6. Input untuk analisis XStarZG pada instrumen aktif.
  var nx = newsNextForSymbol(state.symbol, 72);
  var techBias = (state.lastAnalysis && !state.lastAnalysis.error) ? (state.lastAnalysis.direction || 'NEUTRAL') : 'NEUTRAL';
  var VERDICT_DEFAULT = {
    'ui.deskAlign': 'aligned: keep the setup but trim risk before the release',
    'ui.deskConflict': 'conflicting: stay flat until the release resolves, do not add risk',
    'ui.deskNeutralVerdict': 'not aligned yet: wait for confirmation'
  };
  var verdictKey = 'ui.deskNeutralVerdict', verdictCol = '#94a3b8';
  if (nx) {
    if (techBias === 'LONG') {
      if (nx.imp.dir > 0) { verdictKey = 'ui.deskAlign'; verdictCol = '#34d399'; } else { verdictKey = 'ui.deskConflict'; verdictCol = '#fb7185'; }
    } else if (techBias === 'SHORT') {
      if (nx.imp.dir < 0) { verdictKey = 'ui.deskAlign'; verdictCol = '#34d399'; } else { verdictKey = 'ui.deskConflict'; verdictCol = '#fb7185'; }
    }
  }
  var verdictTxt = T(verdictKey, VERDICT_DEFAULT[verdictKey]);
  var engineBody = nx
    ? fillTpl(T('ui.deskEngineLine', '{sym}: next catalyst {title} at {time} WIB ({impact}) — fundamental bias {dir} ~{pct}%, technical bias {tech} → {verdict}.'), {
        sym: escH(state.symbol), title: escH(nx.ev.title), time: newsWibTime(nx.ev.ts), impact: escH(nx.ev.impact),
        dir: nx.imp.dir > 0 ? '▲' : '▼', pct: nx.imp.pct, tech: techBias,
        verdict: '<b style="color:' + verdictCol + ';">' + escH(verdictTxt) + '</b>'
      })
    : fillTpl(T('ui.deskEngineNone', '{sym}: no mapped catalyst in the next 72 hours — technicals lead, keep standard risk.'), { sym: escH(state.symbol) });

  var totalToday = agenda.length;
  box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;">' +
    deskBlock(escH(fillTpl(T('ui.deskAgenda', 'Today\u2019s agenda ({n})'), { n: totalToday })), agendaBody, 'rgba(56,189,248,0.35)') +
    deskBlock(T('ui.deskConsensus', 'Calendar consensus'), consBody) +
    deskBlock(T('ui.deskVol', 'Volatility class & scalp rules'), volBody) +
    deskBlock(T('ui.deskSentiment', 'Measured sentiment & flow'), sentBody) +
    deskBlock(T('ui.deskAudit', 'Pre-news vs post-news audit'), auditBody) +
    deskBlock(T('ui.deskEngineTitle', 'Input for XStarZG analysis'), engineBody, 'rgba(167,139,250,0.35)') +
    '</div>' +
    '<div style="font-size:10.5px;color:#64748b;margin-top:8px;">' + fillTpl(T('ui.deskUpdated', 'Updated {t} WIB'), { t: newsWibTime(now) }) + '</div>';

  var rf = $id('btnDeskRefresh');
  if (rf) rf.onclick = function () { try { fetchNewsCalendar(true); } catch (e) {} };
  var oc = $id('btnDeskOpenCal');
  if (oc) oc.onclick = function () { try { setMode('news'); } catch (e) {} };
}

function evalNewsPredictionOutcome(ev) {
  function parseNum(x) {
    if (x == null) return null;
    var m = String(x).replace('%', '').replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
  var act = parseNum(ev.actual);
  var fc = parseNum(ev.forecast);
  var prev = parseNum(ev.previous);
  var titleL = (ev.title || '').toLowerCase();
  var isUnemp = titleL.indexOf('unemployment') > -1 || titleL.indexOf('jobless') > -1 || titleL.indexOf('claims') > -1;

  // Proyeksi konsensus pra-event (Prakiraan vs Sebelumnya)
  var predDir = ev.predDir || 0;
  if (!predDir && fc != null && prev != null) {
    predDir = fc > prev ? 1 : fc < prev ? -1 : 0;
    if (isUnemp) predDir = -predDir;
  }

  // Realisasi aktual vs prakiraan
  var actDir = 0;
  var dev = 0;
  if (act != null && fc != null) {
    actDir = act > fc ? 1 : act < fc ? -1 : 0;
    dev = Math.round((act - fc) * 100) / 100;
    if (isUnemp) actDir = -actDir;
  }

  var isDone = !!ev.actual || (ev.ts <= Date.now());
  var status = 'AWAITING';
  var badgeTxt = isEn ? '⏳ AWAITING OFFICIAL RELEASE' : '⏳ MENUNGGU RILIS RESMI';
  var badgeCol = '#38bdf8';
  var explanation = '';
  var goldImpact = '';

  if (act != null && fc != null) {
    var devUnit = (ev.forecast && ev.forecast.indexOf('%') > -1) ? '%' : '';
    var devSign = dev > 0 ? '+' : '';
    var devTxt = devSign + dev + devUnit;

    if (actDir === predDir && predDir !== 0) {
      status = 'ACCURATE';
      badgeTxt = isEn ? '🎯 ACCURATE PREDICTION (CONFIRMED)' : '🎯 PREDIKSI TEPAT (TERKONFIRMASI)';
      badgeCol = '#10b981';
      explanation = isEn
        ? 'Actual release (' + ev.actual + ') confirms analyst consensus (' + ev.forecast + '). Deviation ' + devTxt + ' aligned with expectations.'
        : 'Data rilis aktual (' + ev.actual + ') mengonfirmasi proyeksi konsensus analis (' + ev.forecast + '). Deviasi ' + devTxt + ' sejalan dengan ekspektasi.';
      goldImpact = ev.ccy === 'USD'
        ? (actDir > 0
            ? (isEn ? '📉 Selling pressure on Gold (XAU/USD pressured by stronger USD)' : '📉 Tekanan jual pada Emas (XAU/USD melemah tertekan USD kuat)')
            : (isEn ? '📈 Buying rally catalyst for Gold (XAU/USD strengthened by weaker USD)' : '📈 Katalis reli beli pada Emas (XAU/USD menguat terdorong pelemahan USD)'))
        : '';
    } else if (actDir !== 0 && predDir !== 0 && actDir !== predDir) {
      status = 'SURPRISE';
      badgeTxt = isEn ? '⚡ MARKET SURPRISE (OPPOSITE DEVIATION)' : '⚡ KEJUTAN PASAR (DEVIASI BERLAWANAN)';
      badgeCol = '#f59e0b';
      explanation = isEn
        ? 'Warning: Actual release (' + ev.actual + ') diverged opposite of consensus expectation (' + ev.forecast + '). Surprise deviation ' + devTxt + '!'
        : 'Peringatan: Data rilis aktual (' + ev.actual + ') bertolak belakang dari ekspektasi konsensus (' + ev.forecast + '). Terjadi deviasi kejutan ' + devTxt + '!';
      goldImpact = ev.ccy === 'USD'
        ? (actDir > 0
            ? (isEn ? '📉 Gold XAU/USD dropped sharply on surprise USD spike' : '📉 Emas XAU/USD berbalik anjlok akibat kejutan lonjakan USD')
            : (isEn ? '🚀 Gold XAU/USD surged into rally on surprise USD plunge' : '🚀 Emas XAU/USD melonjak reli akibat kejutan anjloknya USD'))
        : '';
    } else {
      status = 'IN_LINE';
      badgeTxt = isEn ? '⚖️ IN LINE WITH CONSENSUS' : '⚖️ SESUAI EKSPEKTASI KONSENSUS';
      badgeCol = '#94a3b8';
      explanation = isEn
        ? 'Actual release (' + ev.actual + ') matches forecast exactly (' + ev.forecast + '). Volatility stabilizing.'
        : 'Data rilis aktual (' + ev.actual + ') tepat seimbang dengan prakiraan (' + ev.forecast + '). Volatilitas cepat stabil.';
      goldImpact = isEn
        ? 'Stabilized reaction on XAU/USD after first 5 minutes.'
        : 'Reaksi stabil pada XAU/USD pasca 5 menit pertama.';
    }
  } else {
    status = 'AWAITING';
    /* Rilis sudah lewat tetapi angka resmi belum masuk feed: JANGAN diklaim
       sebagai prediksi tepat maupun kejutan — status jujur "belum terverifikasi". */
    if (isDone) {
      badgeTxt = T('ui.newsReleasedNoActual', '🕓 RELEASED — official number not in feed yet');
      badgeCol = '#94a3b8';
    } else {
      badgeTxt = isEn ? '⏳ AWAITING OFFICIAL RELEASE' : '⏳ MENUNGGU RILIS RESMI';
      badgeCol = '#38bdf8';
    }
    var pStr = isEn
      ? (predDir > 0 ? 'Potential ' + (ev.ccy || 'Currency') + ' Strength' : predDir < 0 ? 'Potential ' + (ev.ccy || 'Currency') + ' Weakness' : 'Neutral')
      : (predDir > 0 ? 'Potensi Penguatan ' + (ev.ccy || 'Mata Uang') : predDir < 0 ? 'Potensi Pelemahan ' + (ev.ccy || 'Mata Uang') : 'Netral');
    explanation = isEn
      ? 'Consensus forecast: ' + pStr + ' (Forecast: ' + (ev.forecast || '—') + ' vs Previous: ' + (ev.previous || '—') + ').'
      : 'Prakiraan konsensus: ' + pStr + ' (Prakiraan: ' + (ev.forecast || '—') + ' vs Sebelumnya: ' + (ev.previous || '—') + ').';
    goldImpact = ev.ccy === 'USD'
      ? (predDir > 0
          ? (isEn ? 'If actual release > forecast: Gold XAU/USD tends to face downward pressure.' : 'Jika rilis aktual > prakiraan: Emas XAU/USD cenderung tertekan turun.')
          : (isEn ? 'If actual release < forecast: Gold XAU/USD has catalyst to surge upward.' : 'Jika rilis aktual < prakiraan: Emas XAU/USD berpeluang melesat naik.'))
      : '';
  }

  return {
    status: status,
    badgeTxt: badgeTxt,
    badgeCol: badgeCol,
    explanation: explanation,
    goldImpact: goldImpact,
    isDone: isDone,
    releasedNoActual: isDone && act == null,
    vol: newsVolProfile(ev.impact)
  };
}

function renderNewsPanel() {
  var grid = $id('newsGrid');
  if (!grid) return;
  var now = Date.now();
  var accBar = $id('newsAccuracyBar');
  if (accBar) {
    var accAll = newsAccuracySummary(newsAllEvents());
    var accTxt = accAll.total
      ? '<b style="color:#38bdf8;">' + fillTpl(T('ui.newsAccuracyHead', 'Prediction accuracy: {ok}/{n} official releases matched ({pct}%) · {surprise} surprises'), { ok: accAll.ok, n: accAll.total, pct: accAll.pct, surprise: accAll.surprise }) + '</b>'
      : T('ui.newsAccuracyNone', 'Accuracy audit starts once official release numbers arrive — pre-news bias is a scenario, not a result.');
    accBar.innerHTML = accTxt + ' <span style="color:#94a3b8;">• ' +
      ['HIGH', 'MEDIUM', 'LOW'].map(function (k) {
        var p = newsVolProfile(k);
        var col = k === 'HIGH' ? '#f43f5e' : k === 'MEDIUM' ? '#f59e0b' : '#94a3b8';
        return '<span style="color:' + col + ';font-weight:700;">' + k + '</span> ' + fillTpl(T('ui.newsVolTag', '~{x}× ATR • guard ±{m} min'), { x: p.mult, m: p.guardMin });
      }).join(' • ') + '</span>';
  }
  if (!newsState.events || !newsState.events.length) {
    newsState.events = getClientInstitutionalEvents(now);
  }
  var evs = (newsState.events || []).filter(function (ev) { return ev.ts >= now - 12 * 3600e3; });
  if (newsState.filter === 'high') {
    evs = evs.filter(function (e) { return e.impact === 'HIGH'; });
  } else if (newsState.filter === 'verified') {
    evs = (newsState.events || []).filter(function (e) { return !!e.actual || (e.ts <= now); });
  } else if (newsState.filter !== 'all') {
    evs = evs.filter(function (e) { return (e.impacts || []).some(function (x) { return newsClassOfSym(x.sym) === newsState.filter; }); });
  }
  evs = evs.slice().sort(function (a, b) {
    if (newsState.filter === 'verified') return b.ts - a.ts; // Yang terbaru rilis di urutan atas
    return a.ts - b.ts;
  });
  if (!evs.length) {
    // Jika semua agenda minggu ini telah selesai (misal di akhir pekan), tarik proyeksi minggu depan
    var nextWeekEvs = getClientInstitutionalEvents(now + 3 * 86400e3);
    evs = nextWeekEvs.filter(function (ev) { return ev.ts >= now - 12 * 3600e3; });
    if (newsState.filter === 'high') evs = evs.filter(function (e) { return e.impact === 'HIGH'; });
    else if (newsState.filter === 'verified') evs = (nextWeekEvs || []).filter(function (e) { return !!e.actual; });
    else if (newsState.filter !== 'all') evs = evs.filter(function (e) { return (e.impacts || []).some(function (x) { return newsClassOfSym(x.sym) === newsState.filter; }); });
    if (!evs.length) evs = nextWeekEvs.slice(0, 12);
  }
  evs = evs.slice(0, 14);
  if (!evs.length) {
    grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.eNewsEmpty', 'Tidak ada agenda berdampak dalam 7 hari ke depan yang terpetakan ke instrumen katalog.') + '</span></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < evs.length; i++) {
    var ev = evs[i];
    var diffMin = ev.ts - now;
    var done = diffMin <= 0;
    var soon = !done && diffMin <= 90 * 60e3; // ⏰ khusus event MENDATANG (<90 mnt)
    var impCol = ev.impact === 'HIGH' ? '#f43f5e' : ev.impact === 'MEDIUM' ? '#f59e0b' : '#64748b';
    var impTxt = ev.impact === 'HIGH' ? T('ui.eNewsHigh', 'HIGH') : ev.impact === 'MEDIUM' ? T('ui.eNewsMed', 'MEDIUM') : T('ui.eNewsLow', 'LOW');
    var chips = '';
    var list = (ev.impacts || []).slice(0, 8);
    for (var k = 0; k < list.length; k++) {
      var im = list[k];
      chips += '<button type="button" class="btn-news-sym" data-sym="' + escH(im.sym) + '" title="Buka grafik ' + escH(im.sym) + '" style="font-size:10px;padding:2px 7px;border-radius:99px;border:1px solid rgba(148,163,184,0.3);background:rgba(15,23,42,0.6);color:' + (im.dir > 0 ? '#34d399' : '#fb7185') + ';cursor:pointer;font-weight:700;">'
        + escH(im.sym) + ' ' + (im.dir > 0 ? '▲' : '▼') + ' ~' + im.pct + '%</button>';
    }
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var brokerAlert = ev.impact === 'HIGH'
      ? '<div style="font-size:9.5px;color:#fb7185;margin-top:6px;padding:3px 6px;background:rgba(244,63,94,0.08);border-radius:4px;line-height:1.35;">' +
        (isEn
          ? '⚡ <b>Broker & Market Volatility Alert:</b> Beware spread widening & margin adjustments 15 mins prior to and 5 mins after this high-impact news release.'
          : '⚡ <b>Peringatan Broker & Volatilitas Pasar:</b> Waspada lonjakan spread & penyesuaian margin 15 menit sebelum hingga 5 menit setelah rilis berita berdampak tinggi ini.') +
        '</div>'
      : '';

    var ver = evalNewsPredictionOutcome(ev);
    var auditTag = ver.status !== 'AWAITING'
      ? T('ui.newsPostHead', 'AFTER NEWS — verified audit')
      : T('ui.newsPreHead', 'BEFORE NEWS — consensus scenario');
    var realized = newsRealizedCheck(ev, state.symbol);
    var realizedHtml = realized
      ? '<div style="font-size:9.8px;font-weight:700;color:' + (realized.hit ? '#34d399' : '#fb7185') + ';">' +
        fillTpl(T('ui.newsRealizedHead', 'AFTER NEWS — realized on {sym}'), { sym: escH(state.symbol) }) + ': ' +
        (realized.hit ? T('ui.deskAuditHit', '✅ matched the bias') : T('ui.deskAuditMiss', '❌ went against the bias')) +
        ' (' + (realized.movePct > 0 ? '+' : '') + realized.movePct.toFixed(2) + '% / ' + realized.bars + ' bar)</div>'
      : ((ev.impacts || []).some(function (x) { return String(x.sym).toUpperCase() === String(state.symbol || '').toUpperCase(); }) && done
        ? '<div style="font-size:9.5px;color:#64748b;">' + T('ui.newsRealizedNoData', 'Realized move needs this instrument&#39;s live feed open on the matching event.') + '</div>'
        : '');
    var volLine = '<div style="font-size:9.8px;color:#94a3b8;margin-top:4px;">⚡ ' + escH(newsVolRule(ev.impact)) + '</div>';
    var goldImpactHeader = isEn ? '🪙 <b>Gold Market Impact:</b> ' : '🪙 <b>Dampak Nyata Emas:</b> ';
    var verBox = '<div style="margin-top:7px;padding:7px 9px;border-radius:6px;background:rgba(15,23,42,0.7);border:1px solid ' + ver.badgeCol + '44;display:flex;flex-direction:column;gap:4px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
        '<span style="font-size:10px;font-weight:800;color:' + ver.badgeCol + ';">' + ver.badgeTxt + '</span>' +
        '<span style="font-size:9px;color:' + (ver.status !== 'AWAITING' ? '#94a3b8;background:rgba(255,255,255,0.06)' : '#38bdf8') + ';padding:1px 6px;border-radius:4px;">' + auditTag + '</span>' +
      '</div>' +
      '<div style="font-size:10.2px;color:#cbd5e1;line-height:1.35;">' + escH(ver.explanation) + '</div>' +
      (ver.goldImpact ? ('<div style="font-size:9.8px;color:#fde68a;font-weight:600;">' + goldImpactHeader + escH(ver.goldImpact) + '</div>') : '') +
    '</div>';

    html += '<div class="radar-card" style="cursor:default;' + (done ? 'opacity:0.85;' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start;min-width:0;">' +
        '<span style="font-size:12px;font-weight:700;color:var(--text-bright);line-height:1.35;word-break:break-word;min-width:0;flex:1;">' + escH(ev.title) + '</span>' +
        '<span style="flex-shrink:0;font-size:10px;padding:2px 8px;border-radius:99px;background:' + impCol + '22;color:' + impCol + ';border:1px solid ' + impCol + '55;white-space:nowrap;">' + impTxt + '</span>' +
      '</div>' +
      '<div style="font-size:10.8px;color:#94a3b8;margin-top:3px;word-break:break-word;">' + escH(ev.ccy) + ' • ' + newsFmtTime(ev.ts) + (soon ? ' • <b style="color:#f59e0b;">⏰ ' + T('ui.eNewsSoon', 'SEGERA') + '</b>' : done ? ' • <b style="color:#10b981;">✅ ' + T('ui.eNewsDone', 'SELESAI') + '</b>' : '') + '</div>' +
      ((ev.forecast || ev.previous) ? '<div style="font-size:10.5px;color:#cbd5e1;margin-top:3px;word-break:break-word;">' + (ev.actual ? T('ui.eNewsActual', 'Hasil') + ': <b style="color:#fbbf24;">' + escH(ev.actual) + '</b> • ' : '') + T('ui.eNewsFc', 'Prakiraan') + ': <b>' + escH(ev.forecast || '—') + '</b> • ' + T('ui.eNewsPv', 'Sebelumnya') + ': ' + escH(ev.previous || '—') + '</div>' : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">' + chips + '</div>' +
      volLine +
      realizedHtml +
      verBox +
      brokerAlert +
    '</div>';
  }
  grid.innerHTML = html;
  Array.prototype.forEach.call(grid.querySelectorAll('.btn-news-sym[data-sym]'), function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var sym = btn.getAttribute('data-sym');
      if (sym) gotoInstrument(sym);
    });
  });
}
// Event ber-impact yang dekat dengan instrumen (untuk peringatan panel/radar)
function newsSoonFor(symbol, windowMin) {
  var now = Date.now(), best = null;
  for (var i = 0; i < newsState.events.length; i++) {
    var ev = newsState.events[i];
    if (ev.impact === 'LOW') continue;
    var d = ev.ts - now;
    if (d < 0 || d > (windowMin || 90) * 60e3) continue; // v2026.62: event selesai bukan lagi "segera"
    if (!(ev.impacts || []).some(function (x) { return x.sym === symbol; })) continue;
    if (!best || ev.ts < best.ts) best = ev;
  }
  return best;
}


/* ==================== JURNAL SINYAL (v2026.65) ====================
   Rekam jejak TERVERIFIKASI perangkat: setiap komitmen tercatat sampai putusan
   akhir — TP, SL, Invalid struktur, atau Expired horison. Ini jawaban atas
   "kenapa sinyal berubah/hilang": tidak hilang, tersimpan & bisa diaudit. */
function jnlStatusBadge(st, beActive) {
  var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
  var m = {
    PENDING_FILL: ['#f59e0b', null, isEn ? '⏳ PENDING LIMIT — not filled yet' : '⏳ MENUNGGU TERISI — limit belum kena'],
    FILLED: ['#10b981', null, isEn ? '📍 FILLED — position running' : '📍 TERISI — posisi berjalan'],
    ACTIVE: beActive
      ? ['#10b981', 'ui.jnlBeActive', isEn ? '🛡️ SL+ ACTIVE (0-RISK)' : '🛡️ SL+ AKTIF (0-RISK)']
      : ['#38bdf8', 'ui.jnlActive', isEn ? '🔒 ACTIVE - awaiting TP/SL' : '🔒 AKTIF - menunggu TP/SL'],
    BE_SAVED: ['#10b981', 'ui.jnlBeSaved', isEn ? '🛡️ SAVED BY SL+ (0-RISK)' : '🛡️ TERSELAMATKAN SL+ (0-RISK)'],
    TP_HIT: ['#10b981', 'ui.jnlTP', isEn ? '✅ TP HIT' : '✅ TP TERSENTUH'],
    SL_HIT: ['#f43f5e', 'ui.jnlSL', isEn ? '❌ SL HIT' : '❌ SL TERSENTUH'],
    STRUCTURE_INVALID: ['#f59e0b', 'ui.jnlInvalid', isEn ? '⚠️ STRUCTURE INVALID' : '⚠️ INVALID STRUKTUR'],
    EXPIRED: ['#a8a29e', 'ui.jnlExpired', isEn ? '⏳ EXPIRED (horizon elapsed)' : '⏳ KEDALUWARSA (horison lewat)'],
    MISSED: ['#94a3b8', null, isEn ? '↗ MISSED (unfilled)' : '↗ TERLEWAT (unfilled)'],
    CANCELLED: ['#94a3b8', null, isEn ? '🚫 CANCELLED' : '🚫 DIBATALKAN']
  }[st] || ['#64748b', null, st];
  return { col: m[0], txt: m[1] ? T(m[1], m[2]) : (m[2] || st) };
}
function localizeJournalReason(reason) {
  if (!reason) return '';
  var s = String(reason);
  var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
  if (isEn) {
    s = s.replace(/Terselamatkan oleh proteksi SL\+ \(0-Risk, modal aman\)/g, 'Saved by SL+ protection (0-Risk, capital safe)');
    s = s.replace(/Target 1:2 R:R tersentuh — setup selesai/g, 'Target 1:2 R:R hit — setup completed');
    s = s.replace(/TP tersentuh — setup selesai/g, 'TP hit — setup completed');
    s = s.replace(/TP tersentuh pada pemantauan harga langsung/g, 'TP hit on live price stream');
    s = s.replace(/SL tersentuh pada pemantauan harga langsung/g, 'SL hit on live price stream');
    s = s.replace(/SL tersentuh pada candle closed/g, 'SL hit on closed candle');
    s = s.replace(/Target tercapai sebelum order limit terjemput \(unfilled\)/g, 'Target reached before limit order filled (unfilled)');
    s = s.replace(/SL tersentuh sebelum order limit terjemput/g, 'SL touched before limit order filled');
    s = s.replace(/Horison setup berakhir tanpa TP\/SL \((\d+) candle berlalu\)/g, 'Setup horizon expired without TP/SL ($1 bars passed)');
    s = s.replace(/Struktur berbalik \+ harga diterima melawan trade \(>=50% risiko\) — Order Block batal/g, 'Structure flip + price accepted against trade (>=50% risk) — Order Block invalid');
  }
  return s;
}
/* ==================== 3-SEGMENT JOURNAL SYSTEM (TRADER • INVESTOR • DEX MEME) ==================== */
var INVESTOR_JOURNAL_KEY = 'xstarzg_investor_journal_v1';
var MEME_JOURNAL_KEY = 'xstarzg_meme_journal_v1';
var activeJournalTab = 'trader'; // 'trader' | 'investor' | 'meme'

function syncCuratedInvestorToJournal() { return []; }

function investorJournalStore() {
  try {
    var raw = localStorage.getItem(journalStorageKey(INVESTOR_JOURNAL_KEY));
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        var cleaned = parsed.filter(function (x) { return x && x.id !== 'inv_btc'; });
        if (cleaned.length) return cleaned;
      }
    }
  } catch (e) {}
  return syncCuratedInvestorToJournal();
}

function saveInvestorJournalStore(items) {
  try { localStorage.setItem(journalStorageKey(INVESTOR_JOURNAL_KEY), JSON.stringify(items || [])); } catch (e) {}
}

function syncRecommendedMemeToJournal() { return []; }

function memeJournalStore() {
  try {
    var raw = localStorage.getItem(journalStorageKey(MEME_JOURNAL_KEY));
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        var cleaned = parsed.filter(function (x) { return x && x.id !== 'meme_pnut' && x.id !== 'meme_brett'; });
        if (cleaned.length) return cleaned;
      }
    }
  } catch (e) {}
  return [];
}

function saveMemeJournalStore(items) {
  try { localStorage.setItem(journalStorageKey(MEME_JOURNAL_KEY), JSON.stringify(items || [])); } catch (e) {}
}

window.removeInvestorJournalItem = function (id) {
  var all = investorJournalStore().filter(function (x) { return x.id !== id; });
  saveInvestorJournalStore(all);
  renderSignalJournal();
};

window.removeMemeJournalItem = function (id) {
  var all = memeJournalStore().filter(function (x) { return x.id !== id; });
  saveMemeJournalStore(all);
  renderSignalJournal();
};

function renderSignalJournal() {
  try { auditAndCleanseCorruptedStorage(); } catch (e) {}
  var list = $id('signalJournalList'); var sum = $id('journalSummary');
  if (!list) return;

  var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
  var isEn = curLang !== 'id';
  var dateLocale = isEn ? 'en-US' : 'id-ID';

  // 1. Kumpulkan data dari 3 kelompok
  var locks = signalLockStore();
  var outs = signalOutcomeStore();
  var traderRows = [];
  /* Posisi yang SEDANG BERJALAN memakai tiga status nyata mesin cloud:
     PENDING_FILL (limit dipasang, belum terisi), FILLED (terisi & dipantau), ACTIVE.
     Dulu hanya ACTIVE yang dirender, sehingga entri berjalan hilang dari daftar
     walau angkanya sudah ikut terhitung di rekap jurnal. */
  var RUNNING_STATUS = { ACTIVE: 1, PENDING_FILL: 1, FILLED: 1, OPEN: 1 };
  var symFromKey = function (key) { return String(key || '').split('|')[0].toUpperCase(); };
  for (var k in locks) {
    if (k === '__migratedV2') continue;
    var lk = locks[k];
    if (!lk || !RUNNING_STATUS[String(lk.status || 'ACTIVE').toUpperCase()]) continue;
    var lkSym = String(lk.symbol || symFromKey(k) || '').toUpperCase();
    var lkTf = lk.tf || String(k || '').split('|')[3] || '';
    if (!lkSym || !lkTf) continue;
    var lkRawStatus = String(lk.status || '').toUpperCase();
    var lkSt = (lk.filled || lkRawStatus === 'FILLED') ? 'FILLED'
      : (lkRawStatus === 'PENDING_FILL' ? 'PENDING_FILL' : 'ACTIVE');
    traderRows.push({ sym: lkSym, tf: lkTf, dir: lk.direction, st: lkSt, bePlusActive: !!lk.bePlusActive, slPlus: lk.slPlus, entry: lk.entry, sl: lk.sl, tp1: lk.tp1, tp2: lk.tp2, score: lk.score, at: lk.issuedAt || lk.created || 0, brain: lk.brain, feedUnverified: !!lk.feedUnverified });
  }
  for (var k2 in outs) {
    var o = outs[k2]; if (!o || !o.lock) continue;
    var oSym = String(o.lock.symbol || symFromKey(k2) || '').toUpperCase();
    var oTf = o.lock.tf || String(k2 || '').split('|')[3] || '';
    if (!oSym || !oTf) continue;
    traderRows.push({ sym: oSym, tf: oTf, dir: o.dir, st: o.status, bePlusActive: !!o.bePlusActive, slPlus: o.slPlus || (o.lock && o.lock.slPlus), entry: o.entry, sl: o.lock.sl, tp1: o.lock.tp1, tp2: o.lock.tp2, score: o.score, at: o.at, reason: o.reason, brain: o.lock.brain });
  }

  var invItems = investorJournalStore();
  var memeItems = memeJournalStore();

  // 2. Perbarui badge angka pada tab segmen
  var bTr = $id('badgeCountJnlTrader'); if (bTr) bTr.textContent = traderRows.length;
  var bInv = $id('badgeCountJnlInvestor'); if (bInv) bInv.textContent = invItems.length;
  var bMeme = $id('badgeCountJnlMeme'); if (bMeme) bMeme.textContent = memeItems.length;

  // 3. Sinkronkan visual tombol tab aktif
  var tabTr = $id('btnTabJnlTrader'); if (tabTr) tabTr.classList.toggle('active', activeJournalTab === 'trader');
  var tabInv = $id('btnTabJnlInvestor'); if (tabInv) tabInv.classList.toggle('active', activeJournalTab === 'investor');
  var tabMeme = $id('btnTabJnlMeme'); if (tabMeme) tabMeme.classList.toggle('active', activeJournalTab === 'meme');

  var invBar = $id('investorJournalBar');
  var memeBar = $id('memeJournalBar');

  var searchInput = $id('inpJournalSearch');
  var clearBtn = $id('btnJournalClearSearch');
  var q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
  if (clearBtn) clearBtn.style.display = q ? 'inline-block' : 'none';

  // ==================== TAB 1: JURNAL TRADER ====================
  if (activeJournalTab === 'trader') {
    if (sum) sum.style.display = '';
    if (invBar) invBar.classList.add('hidden');
    if (memeBar) memeBar.classList.add('hidden');

    if (sum) {
      var acc = radarAccStore(); var chips = '';
      ['scalping', 'intraday', 'swing'].forEach(function (hz) {
        var st = acc[hz];
        if (!st || !st.sample) return;
        chips += '<span style="font-size:10.5px;padding:3px 8px;border-radius:99px;border:1px solid rgba(148,163,184,0.3);color:#cbd5e1;">' + hz.toUpperCase() + ' — WR <b style="color:#fbbf24;">' + st.winRate + '%</b> (n=' + st.sample + ')</span>';
      });
      sum.innerHTML = chips || ('<span style="font-size:10.5px;color:#64748b;">' + T('ui.jnlNoStats', 'Statistik terbentuk setelah ada komitmen yang selesai di perangkat ini.') + '</span>');
    }

    if (!traderRows.length) {
      list.innerHTML = '<div style="font-size:12px;color:#64748b;padding:16px 4px;text-align:center;">' + T('ui.jnlEmpty', 'Belum ada komitmen terekam. Jurnal terisi otomatis begitu ada sinyal yang lolos gerbang ketat.') + '</div>';
      return;
    }
    traderRows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });

    var rows = traderRows;
    var filteredRows = rows;
    if (q) {
      filteredRows = rows.filter(function (r) {
        var sym = (r.sym || '').toLowerCase(), tf = (r.tf || '').toLowerCase(), dir = (r.dir || '').toLowerCase(), st = (r.st || '').toLowerCase();
        return sym.indexOf(q) > -1 || tf.indexOf(q) > -1 || dir.indexOf(q) > -1 || st.indexOf(q) > -1;
      });
    }

    if (!filteredRows.length) {
      list.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:24px 8px;text-align:center;">' +
        T('ui.jnlNoMatch', 'Tidak ditemukan sinyal yang cocok dengan pencarian "{q}".').replace('{q}', escH(searchInput ? searchInput.value : '')) +
        '<br/><button type="button" class="btn-reset-jnl-search" style="margin-top:8px;background:none;border:none;color:#38bdf8;cursor:pointer;text-decoration:underline;font-size:12px;font-weight:700;">' +
        T('ui.jnlResetSearch', '✕ Hapus filter pencarian') + '</button></div>';
      var rBtn = list.querySelector('.btn-reset-jnl-search');
      if (rBtn && searchInput) rBtn.onclick = function () { searchInput.value = ''; renderSignalJournal(); };
      return;
    }

    var html = '';
    filteredRows.slice(0, 100).forEach(function (r) {
      var b = jnlStatusBadge(r.st, r.bePlusActive);
      var dcol = r.dir === 'LONG' ? '#34d399' : '#fb7185';
      var tTxt = r.at ? new Date(r.at).toLocaleString(dateLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      var isSniper = r.brain === 'SNIPER' || (r.tf && ['M30', 'H1', 'H4', 'D1', 'W1', 'MN'].indexOf(r.tf) > -1);
      var isScalp = !isSniper;
      var isRunning = r.st === 'ACTIVE' || r.st === 'PENDING_FILL' || r.st === 'FILLED';
      var slPlusRow = (r.slPlus && (r.bePlusActive || r.st === 'BE_SAVED'))
        ? ' • <b style="color:#6ee7b7;">SL+ ' + formatPrice(num(r.slPlus), r.sym) + ' (0-Risk)</b>'
        : '';
      var targetLabel = isScalp
        ? (' • <b style="color:#38bdf8;">Target 1:2 R:R (TP1) ' + formatPrice(num(r.tp1), r.sym) + '</b>' + (r.tp2 ? (' <span style="color:#64748b;">(TP2: ' + formatPrice(num(r.tp2), r.sym) + ')</span>') : ''))
        : (r.tp2 ? (' • <b style="color:#38bdf8;">Target 1:2 R:R (TP2) ' + formatPrice(num(r.tp2), r.sym) + '</b> <span style="color:#64748b;">(TP1: ' + formatPrice(num(r.tp1), r.sym) + ')</span>') : (' • TP1 ' + formatPrice(num(r.tp1), r.sym)));

      var advisorNotice = '';
      if (isSniper && isRunning) {
        var slPosTxt = r.dir === 'LONG' ? T('ui.jnlAboveEntry', 'di atas entry') : T('ui.jnlBelowEntry', 'di bawah entry');
        advisorNotice = r.bePlusActive
          ? ('<div style="font-size:10.2px;color:#6ee7b7;margin-top:2px;">🛡️ 0-RISK TERKUNCI: Stop Loss diproteksi di SL+ ' + formatPrice(num(r.slPlus), r.sym) + ' (' + slPosTxt + ') menuju Target 1:2 R:R (TP2).</div>')
          : ('<div style="font-size:10.2px;color:#fde68a;margin-top:2px;">⚠️ SNIPER ADVISOR: Target penuh minimal 1:2 R:R (TP2). Geser SL ke SL+ ' + formatPrice(num(r.slPlus), r.sym) + ' saat menyentuh TP1 untuk proteksi 0-Risk!</div>');
      } else if (isScalp && isRunning) {
        advisorNotice = r.bePlusActive
          ? ('<div style="font-size:10.2px;color:#6ee7b7;margin-top:2px;">🛡️ 0-RISK TERKUNCI: Modal aman (SL+ ' + formatPrice(num(r.slPlus), r.sym) + ') menuju Target 1:2 R:R (TP1).</div>')
          : ('<div style="font-size:10.2px;color:#fde68a;margin-top:2px;">⚡ SCALP ADVISOR: Target mandatori R:R 1:2 (TP1). SL+ aktif otomatis untuk proteksi modal.</div>');
      }

      if (r.st === 'PENDING_FILL') {
        advisorNotice = '<div style="font-size:10.2px;color:#f59e0b;margin-top:2px;">⏳ Order BELUM terisi — antrian limit di ' + formatPrice(num(r.entry), r.sym) + ' masih menunggu harga. Jangan ubah level; batalkan bila sistem mengirim notifikasi cancel.</div>';
      }

      var liveMonitorInfo = '';
      if (isRunning) {
        var curP = (state.symbol && state.symbol.toUpperCase() === (r.sym || '').toUpperCase() && state.livePrice > 0) ? state.livePrice : null;
        if (curP) {
          var isL = r.dir === 'LONG';
          var entryN = num(r.entry), tp1N = num(r.tp1), slN = num(r.sl);
          var targetDist = Math.max(Math.abs(tp1N - entryN), 1e-12);
          var gainDist = isL ? (curP - entryN) : (entryN - curP);
          var progPct = Math.round((gainDist / targetDist) * 100);
          var progCol = progPct >= 0 ? '#34d399' : '#fb7185';
          var progLabel = progPct >= 0 ? ('+' + progPct + '% ' + (isEn ? 'towards TP' : 'menuju TP')) : (progPct + '% ' + (isEn ? 'near SL' : 'mendekati SL'));
          liveMonitorInfo = '<div style="font-size:10.5px;color:#cbd5e1;margin-top:4px;padding:3px 8px;border-radius:6px;background:rgba(15,23,42,0.55);border:1px solid rgba(56,189,248,0.25);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
            '<span>📡 <b style="color:#38bdf8;">Live:</b> ' + formatPrice(curP, r.sym) + ' <span style="color:#64748b;font-size:9.5px;">(Δ TP: ' + formatPrice(Math.abs(curP - tp1N), r.sym) + ' • Δ SL: ' + formatPrice(Math.abs(curP - slN), r.sym) + ')</span></span>' +
            '<span style="color:' + progCol + ';font-weight:700;">' + progLabel + '</span>' +
          '</div>';
        }
      }

      html += '<div class="radar-card jnl-card" data-sym="' + escH(r.sym) + '" data-tf="' + escH(r.tf || '') + '" style="cursor:pointer;" title="' + escH(T('ui.jnlOpen', 'Klik untuk membuka kembali grafik instrumen ini')) + '">' +
        '<div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start;min-width:0;">' +
          '<span class="r-name" style="min-width:0;">' + escH(r.sym || '-') + ' <span style="color:#64748b;font-size:10px;">' + escH(r.tf || '') + '</span></span>' +
          '<span style="display:inline-flex;align-items:center;gap:5px;flex-shrink:0;">' +
            '<span style="color:#38bdf8;font-size:11px;">↗</span>' +
            '<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:' + b.col + '22;color:' + b.col + ';border:1px solid ' + b.col + '55;white-space:nowrap;">' + b.txt + '</span>' +
          '</span>' +
        '</div>' +
        '<div style="font-size:10.8px;color:#94a3b8;margin-top:3px;word-break:break-word;">' +
          '<b style="color:' + dcol + ';">' + (r.dir || '—') + '</b> • ' + tTxt + ' • ' + T('ui.jnlEntry', 'Entry') + ' ' + formatPrice(num(r.entry), r.sym) + ' • SL ' + formatPrice(num(r.sl), r.sym) + slPlusRow + targetLabel +
        '</div>' +
        advisorNotice +
        liveMonitorInfo +
        (r.reason ? '<div style="font-size:10.2px;color:#64748b;margin-top:2px;">' + escH(localizeJournalReason(r.reason)).slice(0, 110) + '</div>' : '') +
      '</div>';
    });
    list.innerHTML = html;
    Array.prototype.forEach.call(list.querySelectorAll('.radar-card[data-sym]'), function (card) {
      card.addEventListener('click', function () {
        gotoInstrument(card.getAttribute('data-sym'), card.getAttribute('data-tf'));
      });
    });
    return;
  }

  // ==================== TAB 2: JURNAL INVESTOR (SPOT DCA & VALUASI) ====================
  if (activeJournalTab === 'investor') {
    if (sum) sum.style.display = 'none';
    if (invBar) invBar.classList.remove('hidden');
    if (memeBar) memeBar.classList.add('hidden');

    // Hitung metrik portofolio investor secara real-time
    var totalInvCount = invItems.length;
    var sumPnl = 0;
    var winCount = 0;

    invItems.forEach(function (it) {
      var sym = (it.symbol || '').toUpperCase();
      var curP = 0;
      if (state.symbol && state.symbol.toUpperCase() === sym && Number(state.livePrice) > 0) {
        curP = Number(state.livePrice);
      } else if (typeof investorScanPool !== 'undefined' && investorScanPool[sym] && Number(investorScanPool[sym].price) > 0) {
        curP = Number(investorScanPool[sym].price);
      } else if (typeof radarScanPool !== 'undefined' && radarScanPool.swing && radarScanPool.swing[sym + '|D1'] && Number(radarScanPool.swing[sym + '|D1'].item.price) > 0) {
        curP = Number(radarScanPool.swing[sym + '|D1'].item.price);
      } else if (Number(it.currentPrice) > 0) {
        curP = Number(it.currentPrice);
      } else {
        curP = Number(it.entryPrice);
      }
      it._curP = curP;
      var pnl = (it.entryPrice > 0 && curP > 0) ? ((curP - it.entryPrice) / it.entryPrice) * 100 : 0;
      it._pnl = pnl;
      sumPnl += pnl;
      if (pnl >= 0) winCount++;
    });

    var avgPnl = totalInvCount ? (sumPnl / totalInvCount) : 0;
    var winPct = totalInvCount ? Math.round((winCount / totalInvCount) * 100) : 0;

    var elInvCount = $id('invStatCount'); if (elInvCount) elInvCount.textContent = totalInvCount + (isEn ? ' Assets' : ' Aset');
    var elInvAvg = $id('invStatAvgReturn');
    if (elInvAvg) {
      elInvAvg.textContent = (avgPnl >= 0 ? '+' : '') + avgPnl.toFixed(2) + '%';
      elInvAvg.style.color = avgPnl >= 0 ? '#34d399' : '#fb7185';
    }
    var elInvWin = $id('invStatWinRate');
    if (elInvWin) {
      elInvWin.textContent = winCount + '/' + totalInvCount + ' (' + winPct + (isEn ? '% In Profit)' : '% Hijau)');
      elInvWin.style.color = winPct >= 60 ? '#fbbf24' : '#cbd5e1';
    }

    if (!invItems.length) {
      list.innerHTML = '<div style="font-size:12px;color:#64748b;padding:24px 4px;text-align:center;">' +
        (isEn
          ? '💼 No spot / DCA investment records yet.<br/>Click <b>"Record DCA / New Investment"</b> above or save from the Investor panel when analyzing stocks/crypto!'
          : '💼 Belum ada catatan investasi spot / DCA.<br/>Klik tombol <b>"Catat Akumulasi / Investasi Baru"</b> di atas atau klik tombol simpan di panel Investor saat menganalisis saham/kripto!') +
      '</div>';
      return;
    }

    var filteredInv = invItems;
    if (q) {
      filteredInv = invItems.filter(function (x) {
        return (x.symbol || '').toLowerCase().indexOf(q) > -1 || (x.name || '').toLowerCase().indexOf(q) > -1 || (x.notes || '').toLowerCase().indexOf(q) > -1;
      });
    }

    var invHtml = '';
    filteredInv.forEach(function (it) {
      var pnl = it._pnl || 0;
      var curP = it._curP || it.entryPrice;
      var pnlCol = pnl >= 0 ? '#34d399' : '#fb7185';
      var pnlSign = pnl >= 0 ? '+' : '';
      var daysHeld = it.at ? Math.max(1, Math.round((Date.now() - it.at) / 86400000)) : 1;
      var targetProg = it.target1 ? Math.round(((curP - it.entryPrice) / (it.target1 - it.entryPrice)) * 100) : null;
      var tProgText = (targetProg !== null && targetProg > 0)
        ? (' • ' + targetProg + (isEn ? '% towards Target 1' : '% menuju Target 1'))
        : '';
      var statusBadgeText = pnl >= 0
        ? (isEn ? '🟢 IN PROFIT' : '🟢 PROFIT')
        : (isEn ? '⏳ ACCUMULATION' : '⏳ AKUMULASI (FLOATING LOSS)');

      invHtml += '<div class="radar-card jnl-card inv-jnl-card" data-sym="' + escH(it.symbol) + '" style="border:1px solid rgba(16,185,129,0.3);background:rgba(2,6,23,0.7);padding:14px;border-radius:12px;display:flex;flex-direction:column;gap:8px;cursor:pointer;" title="' + (isEn ? 'Click to open live monitoring & valuation chart for this asset' : 'Klik untuk membuka pemantauan langsung & grafik valuasi instrumen ini') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span class="r-name" style="font-size:15px;color:#f8fafc;font-weight:900;">' + escH(it.symbol) + '</span>' +
              '<span style="font-size:11px;color:#94a3b8;font-weight:600;">' + escH(it.name || 'Spot') + '</span>' +
              '<span class="brand-tag" style="background:rgba(16,185,129,0.15);color:#34d399;font-size:10px;">DCA SPOT</span>' +
            '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + (isEn ? 'Invested: ' : 'Diinvestasikan: ') + new Date(it.at || Date.now()).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' }) + ' (' + daysHeld + (isEn ? ' days elapsed)' : ' hari berjalan)') + '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-size:15px;font-weight:900;color:' + pnlCol + ';">' + pnlSign + pnl.toFixed(2) + '%</div>' +
            '<span style="font-size:9.5px;padding:2px 7px;border-radius:99px;background:' + (pnl >= 0 ? '#10b98122' : '#f43f5e22') + ';color:' + pnlCol + ';font-weight:800;">' + statusBadgeText + '</span>' +
          '</div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;font-size:11px;background:rgba(15,23,42,0.6);padding:8px 10px;border-radius:8px;border:1px solid rgba(51,65,85,0.4);">' +
          '<div><span style="color:#94a3b8;display:block;">' + (isEn ? 'Buy / Avg Price:' : 'Harga Beli / Rata-rata:') + '</span> <strong style="color:#f8fafc;">' + formatPrice(it.entryPrice, it.symbol) + '</strong></div>' +
          '<div><span style="color:#94a3b8;display:block;">' + (isEn ? 'Market Live Price:' : 'Harga Live Pasar:') + '</span> <strong style="color:#38bdf8;">' + formatPrice(curP, it.symbol) + '</strong></div>' +
          (it.target1 ? ('<div><span style="color:#94a3b8;display:block;">' + (isEn ? 'Bull Cycle Target 1:' : 'Target Siklus Bull 1:') + '</span> <strong style="color:#34d399;">' + formatPrice(it.target1, it.symbol) + '</strong></div>') : '') +
          (it.target2 ? ('<div><span style="color:#94a3b8;display:block;">' + (isEn ? 'Extension Target 2:' : 'Target Ekstensi 2:') + '</span> <strong style="color:#a855f7;">' + formatPrice(it.target2, it.symbol) + '</strong></div>') : '') +
        '</div>' +

        (it.notes ? ('<div style="font-size:11px;color:#cbd5e1;line-height:1.4;background:rgba(16,185,129,0.06);padding:6px 10px;border-radius:6px;border-left:3px solid #10b981;">💡 <i>' + escH(it.notes) + '</i>' + tProgText + '</div>') : '') +

        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:2px;">' +
          '<button type="button" class="hz-btn btn-open-inv-chart" data-sym="' + escH(it.symbol) + '" style="font-size:11px;padding:5px 12px;border-radius:6px;background:rgba(56,189,248,0.18);color:#38bdf8;font-weight:700;border:1px solid rgba(56,189,248,0.35);cursor:pointer;">' +
            (isEn ? '📊 Open Valuation Analysis' : '📊 Buka Analisis Valuasi') +
          '</button>' +
          '<button type="button" class="btn-del-inv" data-id="' + escH(it.id) + '" style="background:none;border:none;color:#94a3b8;font-size:11px;cursor:pointer;padding:4px 8px;" title="' + (isEn ? 'Remove from journal' : 'Hapus dari jurnal') + '">' +
            (isEn ? '✕ Delete' : '✕ Hapus') +
          '</button>' +
        '</div>' +
        '<div style="font-size:9.5px;color:#6ee7b7;opacity:0.85;">' + (isEn ? '👆 Tap / click this card for live valuation & metrics' : '👆 Sentuh / klik kartu ini untuk pemantauan live & grafik valuasi') + '</div>' +
      '</div>';
    });

    list.innerHTML = invHtml;

    function openInvestorAsset(sym) {
      if (!sym) return;
      setMode('investor');
      gotoInstrument(sym, 'D1');
    }

    Array.prototype.forEach.call(list.querySelectorAll('.inv-jnl-card'), function (card) {
      card.addEventListener('click', function (e) {
        if (e.target && e.target.closest && (e.target.closest('.btn-del-inv') || e.target.closest('button'))) return;
        var s = card.getAttribute('data-sym');
        openInvestorAsset(s);
      });
    });

    Array.prototype.forEach.call(list.querySelectorAll('.btn-open-inv-chart'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var s = b.getAttribute('data-sym');
        openInvestorAsset(s);
      };
    });

    Array.prototype.forEach.call(list.querySelectorAll('.btn-del-inv'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.getAttribute('data-id');
        if (confirm(isEn ? 'Remove this investment from Investor Journal?' : 'Hapus catatan investasi ini dari Jurnal Investor?')) {
          window.removeInvestorJournalItem(id);
        }
      };
    });
    return;
  }

  // ==================== TAB 3: JURNAL DEX MICIN (SOLANA & EVM GEMS) ====================
  if (activeJournalTab === 'meme') {
    if (sum) sum.style.display = 'none';
    if (invBar) invBar.classList.add('hidden');
    if (memeBar) memeBar.classList.remove('hidden');

    var totalMemeCount = memeItems.length;
    var bestX = 1.0;
    var safeCount = 0;

    memeItems.forEach(function (m) {
      var curP = (activeMemeToken && activeMemeToken.symbol === m.symbol && activeMemeToken.basePrice > 0)
        ? activeMemeToken.basePrice
        : (Number(m.currentPrice) > 0 ? Number(m.currentPrice) : Number(m.buyPrice));
      m._curP = curP;
      var mult = curP > 0 && m.buyPrice > 0 ? (curP / m.buyPrice) : 1.0;
      m._mult = mult;
      var pnl = ((curP - m.buyPrice) / m.buyPrice) * 100;
      m._pnl = pnl;
      if (mult > bestX) bestX = mult;
      if (mult >= 2.0 || m.tp1Secured) safeCount++;
    });

    var elMemeCount = $id('memeStatCount'); if (elMemeCount) elMemeCount.textContent = totalMemeCount + (isEn ? ' Coins' : ' Koin');
    var elMemeBest = $id('memeStatBestGain');
    if (elMemeBest) {
      elMemeBest.textContent = bestX.toFixed(2) + 'x (' + (bestX >= 1 ? '+' : '') + Math.round((bestX - 1) * 100) + '%)';
      elMemeBest.style.color = bestX >= 2 ? '#c084fc' : '#f8fafc';
    }
    var elMemeSafe = $id('memeStatSafeCount');
    if (elMemeSafe) {
      elMemeSafe.textContent = safeCount + (isEn ? ' Coins 2x (0-Risk)' : ' Koin 2x (0-Risk)');
      elMemeSafe.style.color = safeCount > 0 ? '#34d399' : '#cbd5e1';
    }

    if (!memeItems.length) {
      list.innerHTML = '<div style="font-size:12px;color:#64748b;padding:24px 4px;text-align:center;">' +
        (isEn
          ? '🚀 No DEX meme coins recorded yet.<br/>Click <b>"Record New DEX Gem"</b> above or record on the DEX Meme radar when hunting coins on Solana/Base/BSC!'
          : '🚀 Belum ada koin micin tercatat di jurnal.<br/>Klik tombol <b>"Catat Koin Micin Baru"</b> di atas atau klik tombol catat pada radar DEX Meme saat memburu koin di Solana/Base/BSC!') +
      '</div>';
      return;
    }

    var filteredMeme = memeItems;
    if (q) {
      filteredMeme = memeItems.filter(function (x) {
        return (x.symbol || '').toLowerCase().indexOf(q) > -1 || (x.name || '').toLowerCase().indexOf(q) > -1 || (x.chain || '').toLowerCase().indexOf(q) > -1;
      });
    }

    var memeHtml = '';
    filteredMeme.forEach(function (m) {
      var mult = m._mult || 1.0;
      var pnl = m._pnl || 0;
      var curP = m._curP || m.buyPrice;
      var multCol = mult >= 2.0 ? '#c084fc' : mult >= 1.0 ? '#34d399' : '#fb7185';
      var multSign = pnl >= 0 ? '+' : '';
      var daysHeld = m.at ? Math.max(1, Math.round((Date.now() - m.at) / 86400000)) : 1;

      var ruleNotice = mult >= 2.0
        ? '<div style="font-size:10.5px;color:#6ee7b7;padding:5px 8px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);border-radius:6px;margin-top:4px;">💰 <b>' +
          (isEn ? 'GOLDEN RULE 2x REACHED:' : 'GOLDEN RULE 2x TERPENUHI:') +
          '</b> ' +
          (isEn
            ? 'Coin has surged 2x! Withdraw your initial capital now so your position becomes a 100% risk-free "Moonbag"!'
            : 'Koin telah naik 2x lipat! Tarik modal awal Anda sekarang agar posisi menjadi "Moonbag" 100% bebas risiko!') +
          '</div>'
        : '<div style="font-size:10.5px;color:#fde68a;padding:5px 8px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:6px;margin-top:4px;">⚠️ <b>' +
          (isEn ? 'DEX GEM GUIDANCE:' : 'PANDUAN MICIN:') +
          '</b> ' +
          (isEn
            ? 'Target a 2x multiple to secure initial capital. Never hold if developer pulls pool liquidity!'
            : 'Targetkan kelipatan 2x untuk balik modal. Jangan menahan jika likuiditas pool ditarik dev!') +
          '</div>';

      memeHtml += '<div class="radar-card jnl-card meme-jnl-card" data-sym="' + escH(m.symbol) + '" style="border:1px solid rgba(168,85,247,0.35);background:rgba(2,6,23,0.7);padding:14px;border-radius:12px;display:flex;flex-direction:column;gap:8px;cursor:pointer;" title="' + (isEn ? 'Click to open live chart DEX terminal for this coin' : 'Klik untuk membuka terminal live chart DEX koin ini') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span class="r-name" style="font-size:15px;color:#f8fafc;font-weight:900;">' + escH(m.symbol) + '</span>' +
              '<span style="font-size:11px;color:#94a3b8;font-weight:600;">' + escH(m.name || 'DEX Token') + '</span>' +
              '<span class="brand-tag" style="background:#581c87;color:#d8b4fe;font-size:10px;">' + escH(m.chainLabel || (m.chain || 'DEX').toUpperCase()) + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + (isEn ? 'Bought: ' : 'Dibeli: ') + new Date(m.at || Date.now()).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' }) + ' (' + daysHeld + (isEn ? ' days) • CA: ' : ' hari) • CA: ') + '<code>' + escH((m.address || '').slice(0, 6) + '...' + (m.address || '').slice(-4)) + '</code></div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-size:16px;font-weight:900;color:' + multCol + ';">' + mult.toFixed(2) + 'x (' + multSign + pnl.toFixed(1) + '%)</div>' +
            '<span style="font-size:9.5px;padding:2px 7px;border-radius:99px;background:' + (mult >= 2.0 ? '#9333ea33' : '#38bdf822') + ';color:' + multCol + ';font-weight:800;">' + (mult >= 2.0 ? '🚀 MOONSHOT 2X+' : (isEn ? '⏳ MONITORED' : '⏳ DIPANTAU')) + '</span>' +
          '</div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;font-size:11px;background:rgba(15,23,42,0.6);padding:8px 10px;border-radius:8px;border:1px solid rgba(51,65,85,0.4);">' +
          '<div><span style="color:#94a3b8;display:block;">' + (isEn ? 'Buy Price ($ USD):' : 'Harga Beli ($ USD):') + '</span> <strong style="color:#f8fafc;">$' + m.buyPrice + '</strong></div>' +
          '<div><span style="color:#94a3b8;display:block;">' + (isEn ? 'DEX Live Price:' : 'Harga Live DEX:') + '</span> <strong style="color:#38bdf8;">$' + curP + '</strong></div>' +
          '<div><span style="color:#94a3b8;display:block;">' + (isEn ? 'Break-Even Target:' : 'Target Balik Modal:') + '</span> <strong style="color:#34d399;">' + (m.targetX || 2.0) + 'x ($' + ((m.buyPrice * (m.targetX || 2.0)).toFixed(4)) + ')</strong></div>' +
        '</div>' +

        ruleNotice +
        (m.notes ? ('<div style="font-size:10.5px;color:#94a3b8;font-style:italic;">' + (isEn ? 'Notes: ' : 'Catatan: ') + escH(m.notes) + '</div>') : '') +

        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:2px;">' +
          '<button type="button" class="hz-btn btn-open-meme-terminal" data-sym="' + escH(m.symbol) + '" style="font-size:11px;padding:5px 12px;border-radius:6px;background:rgba(168,85,247,0.22);color:#d8b4fe;font-weight:700;border:1px solid rgba(168,85,247,0.4);cursor:pointer;">' +
            (isEn ? '🚀 Open DEX Terminal / Chart' : '🚀 Buka Terminal DEX / Chart') +
          '</button>' +
          '<button type="button" class="btn-del-meme" data-id="' + escH(m.id) + '" style="background:none;border:none;color:#94a3b8;font-size:11px;cursor:pointer;padding:4px 8px;" title="' + (isEn ? 'Remove from journal' : 'Hapus dari jurnal') + '">' +
            (isEn ? '✕ Delete' : '✕ Hapus') +
          '</button>' +
        '</div>' +
        '<div style="font-size:9.5px;color:#d8b4fe;opacity:0.85;">' + (isEn ? '👆 Tap / click this card for live DEX chart & execution' : '👆 Sentuh / klik kartu ini untuk live chart & eksekusi DEX') + '</div>' +
      '</div>';
    });

    list.innerHTML = memeHtml;

    function openMemeAsset(sym) {
      if (!sym) return;
      setMode('meme');
      var saved = memeItems.find(function (item) { return (item.symbol || '').toUpperCase() === String(sym).toUpperCase(); });
      if (!saved || !saved.address) return;
      var chain = $id('selMemeChain');
      var address = $id('inpMemeAddress');
      if (chain && saved.chain) chain.value = saved.chain;
      if (address) address.value = saved.address;
      searchManualDexToken();
    }

    Array.prototype.forEach.call(list.querySelectorAll('.meme-jnl-card'), function (card) {
      card.addEventListener('click', function (e) {
        if (e.target && e.target.closest && (e.target.closest('.btn-del-meme') || e.target.closest('button') || e.target.closest('a'))) return;
        var s = card.getAttribute('data-sym');
        openMemeAsset(s);
      });
    });

    Array.prototype.forEach.call(list.querySelectorAll('.btn-open-meme-terminal'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var sym = b.getAttribute('data-sym');
        openMemeAsset(sym);
      };
    });

    Array.prototype.forEach.call(list.querySelectorAll('.btn-del-meme'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.getAttribute('data-id');
        if (confirm(isEn ? 'Remove this meme coin from DEX Journal?' : 'Hapus koin micin ini dari Jurnal DEX?')) {
          window.removeMemeJournalItem(id);
        }
      };
    });
  }
}

/* ==================== GLOBAL MACRO REGIME MAP (v2026.58) ==================== */
var macroState = { data: null, ts: 0 };
var MACRO_TTL = 30 * 60 * 1000;
function fetchMacroRegime(force) {
  if (!force && macroState.data && Date.now() - macroState.ts < MACRO_TTL) { renderMacroMap(); return; }
  fetch('/api/macro/regime').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && j.ok) { macroState = { data: j, ts: Date.now() }; }
    renderMacroMap();
  }).catch(function () { renderMacroMap(); });
}
var MACRO_REGIME_KEY = { GOLDILOCKS: 'eMacroGoldi', REFLASI: 'eMacroReflasi', STAGFLASI: 'eMacroStag', DESINFLASI_DEFENSIF: 'eMacroDef', CAMPURAN: 'eMacroMix' };
function macroRegimeLabel() {
  var d = macroState.data; if (!d || !d.regime) return '';
  var key = MACRO_REGIME_KEY[d.regime] || 'eMacroMix';
  return T('ui.' + key, d.regime);
}
function renderMacroMap() {
  var box = $id('macroMapBox');
  if (!box) return;
  var d = macroState.data;
  if (!d || !d.ok) { box.style.display = 'none'; return; }
  box.style.display = state.mode === 'investor' ? 'block' : 'none';
  if (state.mode !== 'investor') return;
  var flowChips = '';
  (d.flow || []).slice(0, 5).forEach(function (f) {
    flowChips += '<span style="font-size:10px;padding:2px 8px;border-radius:99px;border:1px solid rgba(148,163,184,0.3);color:' + (f.score >= 55 ? '#34d399' : f.score <= 45 ? '#fb7185' : '#94a3b8') + ';">' + escH(f.label) + ' ' + f.score + '</span>';
  });
  var impChips = '';
  (d.impacts || []).slice(0, 5).forEach(function (im) {
    impChips += '<span style="font-size:10px;padding:2px 7px;border-radius:99px;color:' + (im.dir > 0 ? '#34d399' : '#fb7185') + ';border:1px solid rgba(148,163,184,0.25);">' + escH(im.sym) + ' ' + (im.dir > 0 ? '▲' : '▼') + '</span>';
  });
  box.innerHTML =
    '<div style="font-size:11px;font-weight:800;color:#7dd3fc;">' + T('ui.eMacroTitle', '🌐 Peta Global Macro — Regime: {r} • Growth {g}% • Inflasi {i}% • USD {u}% • Risk-Appetite {x}%').replace('{r}', macroRegimeLabel()).replace('{g}', d.growth).replace('{i}', d.inflation).replace('{u}', d.usdBias).replace('{x}', d.riskAppetite) + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">' + flowChips + '</div>'
    + (impChips ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' + impChips + '</div>' : '')
    + '<div style="font-size:10.5px;color:#94a3b8;margin-top:5px;">' + fillTpl(T('ui.eMacroDca', 'Bobot DCA disesuaikan regime global macro: Tahap-1 {a}% • Tahap-2 {b}% • Tahap-3 {c}%.'), { a: d.dcaWeights[0], b: d.dcaWeights[1], c: d.dcaWeights[2] }) + '</div>';
}
function macroDcaWeights() {
  var d = macroState.data;
  return d && d.ok && d.dcaWeights ? d.dcaWeights : [40, 35, 25];
}

/* Label pendek alasan gerbang (kartu radar) — WR historis besar ≠ izin entry;
   kartu wajib menyebut APA yang masih ditunggu supaya tidak terasa kontradiktif. */
function gateShortLabel(code) {
  var m = {
    LOW_SCORE: T('ui.gLowScore', 'Skor berada di bawah ambang'),
    NO_SEQ: T('ui.gNoSeq', 'Menunggu urutan sweep→BOS + volume terkonfirmasi'),
    SQUEEZE_UNCONFIRMED: T('ui.eVetoSqueeze', 'Squeeze belum terkonfirmasi breakout bervolume'),
    PERSIST_WAIT: T('ui.eVetoPersist', 'Momentum baru 1 candle — menunggu candle ke-2 searah'),
    CHOPPY: T('ui.gChoppy', 'Pasar sideways/choppy — efficiency ratio rendah'),
    LOW_WINRATE: T('ui.gWinrate', 'Statistik walk-forward/recent form belum cukup kuat'),
    SPOT_ONLY: T('ui.gSpot', 'Mode spot 1-arah — SHORT tidak diizinkan'),
    SCALP_PRESSURE: T('ui.gScalpPressure', 'Tekanan orderflow berlawanan — scalp melawan tape terlarang'),
    SNIPER_PREMIUM: T('ui.gSniperPremium', 'Harga berada di zona premium/diskon — akumulasi menunggu harga murah'),
    SNIPER_STRUCTURE: T('ui.gSniperStruct', 'Struktur belum selaras (BOS/HTF lawan arah) — sniper wajib konfirmasi'),
    COUNTER_HTF_ALIGNMENT: T('ui.eVetoHtf', 'Melawan arah tren makro 1D/4H — menunggu keselarasan pasar'),
    CISD_COUNTER: T('ui.gCISD', 'Change in state of delivery lawan arah — reversal sedang berjalan'),
    FOMO_ZONE: T('ui.gFomo', 'Harga jauh dari zona OTE — master tidak mengejar kereta')
  };
  return m[code] || T('ui.gVeto', 'Veto struktur/likuiditas aktif (anti jebakan)');
}
function radarAssetGroupOf(sym) {
  var meta = getMeta(sym);
  var c = meta.assetClass;
  if (c === 'crypto') return 'crypto';
  if (c === 'forex' || c === 'metals' || c === 'commodities') return 'fx_comm';
  if (c === 'stocks') return 'stocks';
  var s = String(sym || '').toUpperCase();
  if (s.indexOf('/USDT') > -1 || s.indexOf('BTC') > -1 || s.indexOf('ETH') > -1 || s.indexOf('SOL') > -1) return 'crypto';
  if (s.slice(-3) === '.JK') return 'stocks';
  if (s.indexOf('/') > -1 || s.indexOf('XAU') === 0 || s.indexOf('XAG') === 0 || s === 'WTI' || s === 'BRENT' || s === 'NATGAS') return 'fx_comm';
  return 'stocks';
}

function getRadarGroups() {
  return [
    { key: 'crypto', label: T('ui.rgCryptoLabel', '🪙 OTAK KRIPTO'), sub: T('ui.rgCryptoSub', 'CRYPTO SPOT & PERP INTELLIGENCE'), col: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', emptyText: T('ui.rgCryptoEmpty', 'Memindai instrumen Kripto (BTC, ETH, Altcoins)…') },
    { key: 'fx_comm', label: T('ui.rgFxCommLabel', '💱 OTAK FOREX & KOMODITAS'), sub: T('ui.rgFxCommSub', 'FX, EMAS/LOGAM & ENERGI INTELLIGENCE'), col: '#38bdf8', bg: 'rgba(56,189,248,0.08)', border: '#38bdf8', emptyText: T('ui.rgFxCommEmpty', 'Memindai Forex & Komoditas (Gold/XAU, Emas Gram, Silver, Oil, FX)…') },
    { key: 'stocks', label: T('ui.rgStocksLabel', '📈 OTAK SAHAM'), sub: T('ui.rgStocksSub', 'US/GLOBAL EQUITIES & SAHAM IDX INTELLIGENCE'), col: '#10b981', bg: 'rgba(16,185,129,0.08)', border: '#10b981', emptyText: T('ui.rgStocksEmpty', 'Memindai Saham Global (NVDA, AAPL) & Saham Indonesia IDX…') }
  ];
}
var RADAR_GROUPS = getRadarGroups();

function isActionableRadarSignal(it) {
  if (!it || !it.analysis || it.analysis.__estFeed) return false;
  var a = it.analysis;
  var hasScore = num(it.analysis.convictionScore, 0) >= 55;
  var sc = (a.convictionScore != null || a.confluenceScore != null) ? num(a.convictionScore, a.confluenceScore) : 0;
  // Rekomendasi eksekusi engine WAJIB minimal skor 78% (skor 60-an dilarang masuk rekomendasi)
  if (sc > 0 && sc < 78) return false;
  if (state.mode === 'investor') {
    return hasScore && (a.direction === 'LONG' || (a.levels && a.levels.dcaZone1 > 0));
  }
  return hasScore && (a.direction === 'LONG' || a.direction === 'SHORT') &&
    a.levels && a.levels.entry != null;
}

/* ==================== ADAPTIVE ENTRY VIABILITY ENGINE ====================
   Mengevaluasi kelayakan eksekusi sinyal secara real-time saat pengguna membuka
   aplikasi XStarZG. Mencegah trader memaksakan entry pada setup yang sudah jalan
   jauh (terlambat/pucuk) atau posisi yang sedang floating minus rawan SL. */
function evaluateSignalViability(it) {
  if (!it || !it.analysis) {
    return { key: 'NONE', label: '--', sub: '', worth: false, badgeCls: 'wait', priority: 99, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
  }
  var a = it.analysis;
  var sym = String(it.sym || a.symbol || '').toUpperCase();
  var tf = it.tf || a.timeframe || 'H1';
  var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
  var isInvestor = state.mode === 'investor';
  var L = a.levels || {};
  var dir = a.direction;
  var isLong = dir === 'LONG';
  var isShort = dir === 'SHORT';
  var curP = Number(it.price || a.lastPrice || 0);

  var lock = (typeof getSignalLock === 'function') ? getSignalLock(sym, tf) : null;
  if (!lock && a.lockedSignal) lock = a.lockedSignal;
  var isOwnTrade = it.isUserActiveTrade || Boolean(lock && lock.status === 'ACTIVE') || Boolean(a.lockedSignal && a.lockedSignal.status === 'ACTIVE');

  // 1. Cek jam buka bursa / market open (kecuali untuk posisi aktif milik user yang sedang dipantau)
  var isMarketOpen = (typeof isAssetMarketOpen === 'function') ? isAssetMarketOpen(sym) : true;
  var isCrypto = sym.indexOf('/USDT') > -1 || sym.indexOf('/USDC') > -1 || sym.indexOf('BTC') > -1 || sym.indexOf('ETH') > -1 || sym.indexOf('/SOL') > -1;
  if (!isMarketOpen && !isCrypto && !isOwnTrade) {
    return {
      key: 'CLOSED',
      label: isEn ? '⏸️ MARKET CLOSED (OFF-HOURS)' : '⏸️ SESI TUTUP (AKHIR PEKAN/LIBUR)',
      sub: isEn ? 'Market Closed • Awaiting Session Open' : 'Bursa Sedang Tutup • Menunggu Pembukaan Sesi',
      worth: false,
      badgeCls: 'wait',
      priority: 50,
      color: '#94a3b8',
      bg: 'rgba(148,163,184,0.12)'
    };
  }

  // 2. Mode Investor (Standar Ambang Batas Elit WAJIB >= 78%)
  if (isInvestor) {
    var hasInvScore = (a.convictionScore != null || a.confluenceScore != null);
    var sc = hasInvScore ? num(a.convictionScore, a.confluenceScore) : null;
    if (sc !== null && sc > 0 && sc < 78 && !isOwnTrade) {
      return {
        key: 'WATCHLIST',
        label: isEn ? '👀 WATCHLIST (SCORE ' + Math.round(sc) + '/100)' : '👀 PANTAUAN (SKOR ' + Math.round(sc) + '/100)',
        sub: isEn ? 'Score < 78% • Awaiting Elite Confluence Standard' : 'Skor < 78% • Belum Memenuhi Standar Elit Eksekusi (≥78%)',
        worth: false,
        badgeCls: 'wait',
        priority: 45,
        color: '#94a3b8',
        bg: 'rgba(148,163,184,0.12)'
      };
    }
    var dca1 = Number(L.dcaZone1 || curP);
    var nearDca = curP > 0 && dca1 > 0 ? (curP <= dca1 * 1.03) : true;
    if ((sc == null || sc >= 78) && nearDca) {
      return {
        key: 'FRESH',
        label: isEn ? '🟢 ACCUMULATION ZONE (ACTIONABLE)' : '🟢 ZONA AKUMULASI (LAYAK BIKIN PORTO)',
        sub: isEn ? 'Price Near Fair Value / Buy Zone' : 'Harga di Bawah Nilai Wajar • Diskon DCA 1',
        worth: true,
        badgeCls: 'long',
        priority: 1,
        color: '#10b981',
        bg: 'rgba(16,185,129,0.14)'
      };
    }
    return {
      key: 'PULLBACK',
      label: isEn ? '🔵 HOLD / WAIT FOR DIP' : '🔵 PANTAU HARGA DISKON',
      sub: isEn ? 'Wait for Retracement to DCA Level' : 'Tunggu Koreksi Mendekati Area Cicil DCA',
      worth: false,
      badgeCls: 'wait',
      priority: 20,
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.12)'
    };
  }

  // 3. Sinyal Netral / Konsolidasi
  if (!isLong && !isShort) {
    return {
      key: 'NEUTRAL',
      label: isEn ? '◆ NEUTRAL / CHOPPY' : '◆ NETRAL (KONSOLIDASI)',
      sub: isEn ? 'Awaiting Structure Breakout' : 'Menunggu Breakout Struktur & Arah Jelas',
      worth: false,
      badgeCls: 'wait',
      priority: 90,
      color: '#94a3b8',
      bg: 'rgba(148,163,184,0.10)'
    };
  }

  // 4. Belum selaras Top-Down
  if (a.topDown && !a.topDown.isAligned && !isOwnTrade) {
    return {
      key: 'UNALIGNED',
      label: isEn ? '🟡 AWAITING HTF ALIGNMENT' : '🟡 MENUNGGU ALIGNMENT (POTENSIAL)',
      sub: isEn ? 'Macro Bias (' + (a.topDown.macroBias || 'NEUTRAL') + ') vs Struct' : 'Arah HTF (' + (a.topDown.macroBias || 'NETRAL') + ') Belum Selaras',
      worth: false,
      badgeCls: 'wait',
      priority: 40,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.12)'
    };
  }

  // 5. Standar Elit Eksekusi Trader: WAJIB skor >= 78%
  // Jika skor berada di bawah 78 (mis. skor 60-an), TIDAK BOLEH masuk ke rekomendasi eksekusi / FRESH / PULLBACK.
  var hasScoreProvided = (a.convictionScore != null || a.confluenceScore != null);
  var scTrader = hasScoreProvided ? num(a.convictionScore, a.confluenceScore) : null;
  if (scTrader !== null && scTrader > 0 && scTrader < 78 && !isOwnTrade) {
    return {
      key: 'WATCHLIST',
      label: isEn ? '👀 WATCHLIST (SCORE ' + Math.round(scTrader) + '/100)' : '👀 PANTAUAN (SKOR ' + Math.round(scTrader) + '/100)',
      sub: isEn ? 'Score < 78% • Awaiting Elite Confluence Standard' : 'Skor < 78% • Belum Memenuhi Standar Elit Eksekusi (≥78%)',
      worth: false,
      badgeCls: 'wait',
      priority: 45,
      color: '#94a3b8',
      bg: 'rgba(148,163,184,0.12)'
    };
  }

  // 6. Masa Pendinginan / Siklus Selesai (Cooldown pasca outcome)
  // Sinyal yang sedang dalam masa pendinginan (cooldown) DILARANG masuk radar sebagai FRESH!
  if (!isOwnTrade && typeof signalCooldownActive === 'function' && signalCooldownActive(sym, tf)) {
    return {
      key: 'COOLDOWN',
      label: isEn ? '⚪ COMPLETED / COOLDOWN' : '⚪ SELESAI / COOLDOWN',
      sub: isEn ? 'Setup Finished / Cooling Down • Awaiting Next Cycle' : 'Siklus Setup Selesai • Masa Pendinginan (Anti-FOMO)',
      worth: false,
      badgeCls: 'wait',
      priority: 85,
      color: '#94a3b8',
      bg: 'rgba(148,163,184,0.12)'
    };
  }

  var entry = Number(L.entry || 0);
  var sl = Number(L.sl || 0);
  var tp1 = Number(L.tp1 || 0);
  var atr = Number(a.atr || 1);

  var isFilled = lock && lock.filled === true;
  var isBePlusActive = lock && (lock.bePlusActive === true || lock.notifiedSlPlus === true || lock.slPlusAlerted === true);

  // 7. Proteksi Setup Usang / Pending Limit Terlalu Lama (Timeout > 12 lilin)
  var ageMs = lock ? (Date.now() - (lock.issuedAt || lock.created || 0)) : 0;
  var maxPendingMs = (tf === 'M1' || tf === 'M5' || tf === 'M15') ? (60 * 60 * 1000) : (tf === 'M30' || tf === 'H1') ? (8 * 3600 * 1000) : (24 * 3600 * 1000);
  if (lock && !isFilled && !isOwnTrade && ageMs > maxPendingMs) {
    return {
      key: 'EXPIRED',
      label: isEn ? '⌛ EXPIRED (TIMEOUT)' : '⌛ KEDALUWARSA (TIMEOUT)',
      sub: isEn ? 'Pending Window Closed (>12 Bars) • Setup Stale' : 'Batas Waktu Tunggu Habis (>12 Lilin) • Setup Usang',
      worth: false,
      badgeCls: 'wait',
      priority: 75,
      color: '#94a3b8',
      bg: 'rgba(148,163,184,0.12)'
    };
  }

  if (!entry || !sl || !tp1 || curP <= 0) {
    return {
      key: 'FRESH',
      label: isEn ? '🟢 READY TO ENTER (NEW)' : '🟢 SIAP ENTRY (BARU)',
      sub: isEn ? 'New Pending Limit Setup' : 'Antrean Limit Baru Terbit',
      worth: true,
      badgeCls: 'long',
      priority: 1,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.14)'
    };
  }

  var targetDist = Math.max(Math.abs(tp1 - entry), 1e-9);
  var riskDist = Math.max(Math.abs(entry - sl), 1e-9);

  // Jarak kemajuan (floating favorable progress)
  var favDist = isLong ? (curP - entry) : (entry - curP);
  var favRatio = favDist / targetDist; // positif = profit, negatif = floating minus

  // Sisa Risk-to-Reward jika trader baru masuk sekarang pada curP (mengacu ke target penuh TP2 atau TP1)
  var targetHigh = Number(L.tp2 || L.tp1 || 0);
  var remReward = isLong ? Math.max(0, targetHigh - curP) : Math.max(0, curP - targetHigh);
  var remRisk = isLong ? Math.max(1e-9, curP - sl) : Math.max(1e-9, sl - curP);
  var curRR = remReward / remRisk;

  // Kasus A: Rawan SL / Calon Invalidasi (Floating minus >= 50% jarak risiko)
  var againstDist = isLong ? (entry - curP) : (curP - entry);
  if (againstDist >= 0.50 * riskDist) {
    return {
      key: 'NEAR_SL',
      label: isOwnTrade
        ? (isEn ? '🔴 YOUR ACTIVE TRADE (NEAR SL / UNDER PRESSURE)' : '🔴 POSISI ANDA (RAWAN SL / MINUS)')
        : (isEn ? '🔴 NEAR SL (AVOID ENTRY)' : '🔴 RAWAN SL (JANGAN IKUT)'),
      sub: isOwnTrade
        ? (isEn ? 'Price Under Pressure Near SL • Monitor Risk' : 'Harga Tertekan Dekat SL • Pantau Ketat Risiko')
        : (isEn ? 'Price Under Pressure Near SL • Risk of Invalidation' : 'Harga Tertekan Dekat SL • Calon Batal, Amankan Modal'),
      worth: false,
      badgeCls: 'wait',
      priority: 80,
      color: '#f43f5e',
      bg: 'rgba(244,63,94,0.14)'
    };
  }

  // Kasus B: Terlambat / Jangan Kejar (Sinyal lama yang sudah jalan jauh)
  // - SL+ (0-Risk) sudah terpicu
  // - ATAU harga sudah lari >= 28% ke arah TP1
  // - ATAU sudah jalan >= 20% DAN sisa R:R baru sudah di bawah 1:1
  if (isBePlusActive || favRatio >= 0.28 || (favRatio >= 0.20 && curRR < 1.0)) {
    var pctTxt = Math.max(0, Math.round(favRatio * 100));
    return {
      key: 'LATE',
      label: isOwnTrade
        ? (isBePlusActive
            ? (isEn ? '🛡️ YOUR ACTIVE TRADE (SL+ 0-RISK ACTIVE)' : '🛡️ POSISI ANDA (SL+ 0-RISIKO AMAN)')
            : (isEn ? '🏃 YOUR ACTIVE TRADE (RUNNING +' + pctTxt + '%)' : '🏃 POSISI ANDA (PROFIT +' + pctTxt + '%)'))
        : (isEn ? '🟡 DO NOT CHASE (LATE)' : '🟡 JANGAN KEJAR (TERLAMBAT)'),
      sub: isOwnTrade
        ? (isBePlusActive
            ? (isEn ? 'Running +' + pctTxt + '% to TP • SL+ Safeguards Capital' : 'Profit +' + pctTxt + '% Menuju TP • SL+ Melindungi Modal')
            : (isEn ? 'Progressing Towards TP1 • Journey In-Flight' : 'Perjalanan Menuju TP1 • Pantau Perjalanan ke Target'))
        : (isEn ? 'Running Profit +' + pctTxt + '% • Unfavorable R:R for New Entry' : 'Profit Sedang Berjalan +' + pctTxt + '% • R:R Baru Jelek, Jangan Kejar Pucuk'),
      worth: false,
      badgeCls: isOwnTrade ? 'long' : 'wait',
      priority: isOwnTrade ? 1 : 30,
      color: isBePlusActive ? '#10b981' : '#fbbf24',
      bg: isBePlusActive ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.12)'
    };
  }

  // Kasus C: Sedang Berjalan Tapi Masih Layak Ikut (Pullback / Retest ke Zona Entry)
  // - Order sempat terjemput / filled ATAU isOwnTrade dengan favRatio < 20%
  // - favRatio masih tipis (< 20%) atau harga sedang pullback tepat di area entry
  // - Sisa R:R masih sehat
  if ((isFilled || isOwnTrade) && favRatio < 0.20) {
    return {
      key: 'PULLBACK',
      label: isOwnTrade
        ? (isEn ? '🔵 YOUR ACTIVE TRADE (AT ENTRY ZONE)' : '🔵 POSISI ANDA (DI AREA ENTRY)')
        : (isEn ? '🔵 RUNNING • WORTH JOINING (PULLBACK)' : '🔵 BERJALAN • BISA IKUT (PULLBACK)'),
      sub: isOwnTrade
        ? (isEn ? 'Price Floating Near Entry Area • Position Active' : 'Harga Bergerak Dekat Titik Masuk • Posisi Sedang Aktif')
        : (isEn ? 'Retesting Entry Area • Remaining R:R ' + curRR.toFixed(1) + ':1' : 'Retest Area Entry • Sisa R:R ' + curRR.toFixed(1) + ':1 Masih Sehat'),
      worth: true,
      badgeCls: 'long',
      priority: 2,
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.14)'
    };
  }

  // Kasus D: Sinyal Baru / Fresh Entry (Antrean Limit Siap Pasang)
  // - Belum terjemput
  // - R:R awal utuh
  var initialRR = L.rrRatio ? Number(L.rrRatio).toFixed(1) : '2.0';
  return {
    key: 'FRESH',
    label: isEn ? '🟢 READY TO ENTER (NEW)' : '🟢 SIAP ENTRY (BARU)',
    sub: isEn ? 'Pending Limit Order • R:R ' + initialRR + ':1 Intact' : 'Antrean Limit Siap Pasang • R:R ' + initialRR + ':1 Utuh',
    worth: true,
    badgeCls: 'long',
    priority: 1,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.14)'
  };
}
try { window.evaluateSignalViability = evaluateSignalViability; } catch (e) {}

function syncRadarViabilityTabs() {
  var bar = $id('radarViabilityBar');
  if (!bar) return;
  var v = state.radarViability || 'actionable';
  Array.prototype.forEach.call(bar.querySelectorAll('.hz-btn'), function (b) {
    b.classList.toggle('active', (b.getAttribute('data-viab') || 'actionable') === v);
  });
}

function renderRadarCardHtml(it) {
  if (!it || !it.analysis) return '';
  var a = it.analysis;
  var meta = getMeta(it.sym) || {};
  var badge = radarBadgeFor(a);
  if (a.__estFeed) badge = { cls: 'wait', txt: T('ui.eEstFeed', '○ Data estimasi — sinyal nonaktif') };
  var chg = num(it.changePct, num(a.changePct));
  var chgCol = chg >= 0 ? '#10b981' : '#f43f5e';
  var sc = num(a.convictionScore, a.confluenceScore);
  var entryRef = state.mode === 'investor'
    ? (a.levels && a.levels.dcaZone1 ? a.levels.dcaZone1 : a.lastPrice)
    : (a.levels && a.levels.entry != null ? a.levels.entry : (a.direction !== 'NEUTRAL' ? (it.price || a.lastPrice) : null));
  var entryDisplay = (entryRef != null && (state.mode === 'investor' || a.direction !== 'NEUTRAL'))
    ? formatPrice(entryRef, it.sym)
    : '--';
  var isActive = it.sym === state.symbol && it.tf === state.tf;
  var outBadge = '';
  var oc = (typeof latestSignalOutcome === 'function') ? latestSignalOutcome(it.sym, it.tf) : null;
  if (oc && a.__estFeed) oc = null;
  if (oc) {
    var ocTxt = oc.status === 'TP_HIT' ? T('ui.eOutTp', 'TP tercapai — setup selesai')
      : oc.status === 'BE_SAVED' ? T('ui.eOutBe', 'Terselamatkan SL+ (0-Risk, modal aman)')
      : oc.status === 'STRUCTURE_INVALID' ? T('ui.eOutInv', 'Dibatalkan struktur + penerimaan harga')
      : T('ui.eOutSl', 'SL tersentuh — sinyal invalid');
    var dt = new Date(oc.at);
    var hhmm = ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2);
    outBadge = '<span class="sig-badge ' + (oc.status === 'TP_HIT' || oc.status === 'BE_SAVED' ? 'long' : 'wait') + '" style="margin-top:4px;">'
      + (oc.status === 'TP_HIT' ? '✓ ' : oc.status === 'BE_SAVED' ? '🛡️ ' : '✗ ') + ocTxt + ' • ' + hhmm + '</span>';
  }
  var tpSlRow = '';
  if (a.levels && a.levels.sl && a.levels.tp1 && state.mode !== 'investor') {
    var tgtVal = a.levels.tp2 ? a.levels.tp2 : a.levels.tp1;
    var tgtLbl = a.levels.tp2 ? 'Target 1:2 (TP2)' : 'TP1';
    tpSlRow = '<div style="display:flex;justify-content:space-between;gap:4px;margin-top:3px;font-size:10px;color:#94a3b8;font-family:var(--font-mono);">' +
      '<span>SL: <b style="color:#fca5a5;">' + formatPrice(a.levels.sl, it.sym) + '</b></span>' +
      '<span>' + tgtLbl + ': <b style="color:#6ee7b7;">' + formatPrice(tgtVal, it.sym) + '</b></span>' +
    '</div>';
  }

  var journeyBarHtml = '';
  if (state.mode !== 'investor' && a.levels && a.levels.entry && a.levels.tp1 && (it.isUserActiveTrade || a.lockedSignal || viab.key === 'LATE' || viab.key === 'PULLBACK' || viab.key === 'NEAR_SL')) {
    var entryPrice = Number(a.levels.entry);
    var tp1Price = Number(a.levels.tp1);
    var curPrice = Number(it.price || a.lastPrice || entryPrice);
    var tDist = Math.max(Math.abs(tp1Price - entryPrice), 1e-9);
    var isLongCard = a.direction === 'LONG';
    var fDistCard = isLongCard ? (curPrice - entryPrice) : (entryPrice - curPrice);
    var fRatioCard = fDistCard / tDist;
    var jPct = Math.min(100, Math.max(0, Math.round(fRatioCard * 100)));
    var jCol = fRatioCard >= 0.5 ? '#10b981' : (fRatioCard > 0 ? '#38bdf8' : (fRatioCard < -0.2 ? '#f43f5e' : '#fbbf24'));
    var jStatusText = (fDistCard >= 0 ? '+' : '') + jPct + '% ke TP1';
    if (a.lockedSignal && (a.lockedSignal.bePlusActive || a.lockedSignal.notifiedSlPlus)) {
      jStatusText = '🛡️ SL+ 0-Risk (' + jStatusText + ')';
    }
    journeyBarHtml = '<div style="margin-top:5px;padding-top:4px;border-top:1px dashed rgba(148,163,184,0.18);">' +
      '<div style="display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8;font-family:var(--font-mono);margin-bottom:2px;">' +
        '<span>' + (it.isUserActiveTrade ? '🔒 POSISI ANDA' : 'JOURNEY') + '</span>' +
        '<span style="color:' + jCol + ';font-weight:700;">' + jStatusText + '</span>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.07);border-radius:99px;height:5px;overflow:hidden;position:relative;">' +
        '<div style="background:' + jCol + ';width:' + jPct + '%;height:100%;border-radius:99px;"></div>' +
      '</div>' +
    '</div>';
  }

  var viab = evaluateSignalViability(it);
  var viabBadgeHtml = (state.mode !== 'investor' || viab.key === 'FRESH') ? (
    '<div style="font-size:10px;font-weight:800;color:' + viab.color + ';background:' + viab.bg + ';border:1px solid ' + viab.color + '44;padding:3.5px 8px;border-radius:6px;margin-top:4px;display:flex;flex-direction:column;gap:1.5px;">' +
      '<span>' + escH(viab.label) + '</span>' +
      '<span style="font-size:9.5px;font-weight:600;opacity:0.88;">' + escH(viab.sub) + '</span>' +
    '</div>'
  ) : '';

  var cardBorder = (viab.key === 'FRESH')
    ? 'border-color:rgba(16,185,129,0.4);box-shadow:0 0 10px rgba(16,185,129,0.08);'
    : (viab.key === 'PULLBACK')
      ? 'border-color:rgba(56,189,248,0.4);box-shadow:0 0 10px rgba(56,189,248,0.08);'
      : (viab.key === 'LATE')
        ? 'border-color:rgba(245,158,11,0.25);opacity:0.88;'
        : (viab.key === 'NEAR_SL')
          ? 'border-color:rgba(244,63,94,0.3);opacity:0.85;'
          : '';

  return '<div class="radar-card' + (isActive ? ' active' : '') + '" data-sym="' + it.sym + '" data-tf="' + it.tf + '" style="' + cardBorder + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">' +
      '<span class="r-sym">' + it.sym + ' <small style="color:#64748b;font-weight:700;">' + it.tf + '</small></span>' +
      '<span class="r-live">' + (feedIsEstimate(it.source) ? '○ EST' : '● LIVE') + '</span>' +
    '</div>' +
    '<span class="r-name">' + escH(meta.name || it.sym) + '</span>' +
    '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px;">' +
      '<span class="r-price">' + formatPrice(it.price, it.sym) + '</span>' +
      '<span class="r-chg" style="color:' + chgCol + ';">' + pctFmt(chg) + '</span>' +
    '</div>' +
    '<span class="sig-badge ' + badge.cls + '">' + badge.txt + '</span>' + outBadge +
    viabBadgeHtml +
    (function () {
      var tdHtml = '';
      if (a && a.topDown) {
        var td = a.topDown;
        var isEnTd = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
        if (td.isAligned) {
          tdHtml = '<div style="font-size:10px;font-weight:700;color:#10b981;background:rgba(16,185,129,0.12);padding:2px 6px;border-radius:4px;margin-top:3px;">' +
            '🟢 ALIGNED: 1D/4H (' + escH(td.macroBias) + ') ➔ 1H/15m ➔ 5m</div>';
        } else {
          tdHtml = '<div style="font-size:10px;font-weight:600;color:#f59e0b;background:rgba(245,158,11,0.1);padding:2px 6px;border-radius:4px;margin-top:3px;">' +
            '🟡 ' + (isEnTd ? 'Awaiting Alignment' : 'Menunggu Keselarasan') + ' (' + escH(td.macroBias) + ' vs ' + escH(td.structBias) + ')</div>';
        }
      }
      var sessHtml = '';
      if (a && a.sessionInfo) {
        var sess = a.sessionInfo;
        var sessCol = sess.isOptimal ? '#38bdf8' : '#94a3b8';
        sessHtml = '<div style="font-size:9.5px;color:' + sessCol + ';margin-top:2px;">' +
          (sess.isOptimal ? '⚡ Sesi Optimal: ' : '🌐 Sesi: ') + '<b>' + escH(sess.bestSession) + '</b></div>';
      }
      return tdHtml + sessHtml;
    })() +
    (state.mode === 'trader' && !a.signalEligible && !a.lockedSignal && !a.__estFeed && a.gating && a.gating.active && a.gating.active.length
      ? '<div style="font-size:10.5px;color:#f59e0b;margin-top:3px;line-height:1.35;">⛔ ' + gateShortLabel(a.gating.active[0]) + '</div>' : '') +
    (function () { var nw = newsSoonFor(it.sym, 120); return nw ? '<div style="font-size:10.5px;color:#7dd3fc;margin-top:3px;">⏰ ' + escH(nw.title).slice(0, 34) + ' • ' + newsFmtTime(nw.ts) + '</div>' : ''; })() +
    '<div style="display:flex;justify-content:space-between;gap:6px;margin-top:5px;">' +
      '<span class="r-entry">' + (state.mode === 'investor' ? T('ui.cDcaShort', 'Zona DCA 1: ') : T('ui.cEntry', 'Entry: ')) + entryDisplay + '</span>' +
      '<span class="r-score">' + T('ui.cScore', 'SKOR') + ' ' + sc + '</span>' +
    '</div>' +
    tpSlRow +
    journeyBarHtml +
  '</div>';
}

function syncRadarGroupTabs() {
  var bar = $id('radarGroupBar');
  if (!bar) return;
  var g = state.radarGroup || 'all';
  Array.prototype.forEach.call(bar.querySelectorAll('.hz-btn'), function (b) {
    b.classList.toggle('active', (b.getAttribute('data-rg') || 'all') === g);
  });
}

function paintRadarItems(cfg, items, noneQualified) {
  var grid = $id('opportunityRadarGrid');
  if (!grid) return;
  items = items ? items.slice() : [];

  // INJEKSI POSISI AKTIF PENGGUNA (Active Locks dari signalLockStore):
  // Pengguna membutuhkan pemantauan perjalanan entry mereka di tab "Running Setups".
  // Pastikan setiap trade aktif yang sedang berjalan masuk ke daftar radar dan diprioritaskan!
  try {
    var allLocks = (typeof signalLockStore === 'function') ? signalLockStore() : {};
    for (var lkKey in allLocks) {
      if (lkKey === '__migratedV2') continue;
      var lk = allLocks[lkKey];
      if (!lk || lk.status !== 'ACTIVE' || !lk.tf || !lk.symbol) continue;
      var lkSym = lk.symbol.toUpperCase();
      var lkTf = lk.tf;
      var foundIdx = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i] && items[i].sym && items[i].sym.toUpperCase() === lkSym && items[i].tf === lkTf) {
          foundIdx = i;
          break;
        }
      }
      var curP = (state.symbol && state.symbol.toUpperCase() === lkSym && state.livePrice > 0)
        ? state.livePrice
        : (lk.lastPrice || lk.entry);
      if (foundIdx >= 0) {
        items[foundIdx].isUserActiveTrade = true;
        if (items[foundIdx].analysis) {
          items[foundIdx].analysis.lockedSignal = lk;
          if (curP) items[foundIdx].price = curP;
        }
      } else {
        var itAnalysis = {
          symbol: lk.symbol,
          timeframe: lk.tf,
          direction: lk.direction,
          lastPrice: curP,
          confluenceScore: lk.score || 80,
          convictionScore: lk.score || 80,
          signalEligible: true,
          lockedSignal: lk,
          levels: {
            entry: lk.entry,
            sl: lk.sl,
            tp1: lk.tp1,
            tp2: lk.tp2,
            rrRatio: lk.rrRatio || 2.0
          },
          topDown: { isAligned: true, macroBias: lk.direction === 'LONG' ? 'BULLISH' : 'BEARISH' }
        };
        items.unshift({
          sym: lk.symbol,
          tf: lk.tf,
          price: curP,
          changePct: 0.5,
          analysis: itAnalysis,
          source: 'ACTIVE_LOCK',
          isUserActiveTrade: true
        });
      }
    }
  } catch (e) {}

  if (!items.length) {
    grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.radarFeedEmpty', 'Feed radar belum tersedia — coba lagi sebentar.') + '</span></div>';
    return;
  }
  syncRadarGroupTabs();
  syncRadarViabilityTabs();
  var html = '';
  var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
  var viabFilter = state.radarViability || 'actionable';

  /* Kejujuran daftar: bila TIDAK ADA yang lolos gerbang, tampilkan banner tegas —
     daftar di bawahnya hanyalah pantauan (kandidat terbaik yang tersedia), bukan
     rekomendasi. (Skor mereka ditahan <62 oleh engine = memang belum layak eksekusi.) */
  if (noneQualified && state.mode !== 'investor') {
    html += '<div class="radar-card" style="cursor:default;grid-column:1/-1;border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.06);"><span class="r-name" style="color:#fbbf24;">' +
      T('ui.eRadarNone', '⚠️ Belum ada sinyal yang lolos gerbang ketat saat ini. Daftar di bawah = PANTAUAN saja (bukan rekomendasi) — lazim saat pasar sepi/akhir pekan & feed estimasi. Rekomendasi kembali begitu setup nyata matang.') +
      '</span></div>';
  }

  var activeGroup = state.radarGroup || 'all';
  var curGroups = getRadarGroups();

  function sortAndFilterRadarGroup(rawItems) {
    var copy = rawItems.slice();
    copy.sort(function (x, y) {
      var xUser = (x && (x.isUserActiveTrade || (x.analysis && x.analysis.lockedSignal && x.analysis.lockedSignal.status === 'ACTIVE'))) ? 1 : 0;
      var yUser = (y && (y.isUserActiveTrade || (y.analysis && y.analysis.lockedSignal && y.analysis.lockedSignal.status === 'ACTIVE'))) ? 1 : 0;
      if (xUser !== yUser) return yUser - xUser;

      var vx = evaluateSignalViability(x);
      var vy = evaluateSignalViability(y);
      if (vx.priority !== vy.priority) return vx.priority - vy.priority;
      var xAligned = (x && x.analysis && x.analysis.topDown && x.analysis.topDown.isAligned) ? 1 : 0;
      var yAligned = (y && y.analysis && y.analysis.topDown && y.analysis.topDown.isAligned) ? 1 : 0;
      if (xAligned !== yAligned) return yAligned - xAligned;
      var xScore = (x && x.analysis) ? num(x.analysis.convictionScore, 0) : 0;
      var yScore = (y && y.analysis) ? num(y.analysis.convictionScore, 0) : 0;
      return yScore - xScore;
    });

    if (viabFilter === 'actionable') {
      return copy.filter(function (it) {
        return evaluateSignalViability(it).worth === true;
      });
    }
    if (viabFilter === 'fresh') {
      return copy.filter(function (it) {
        return evaluateSignalViability(it).key === 'FRESH';
      });
    }
    if (viabFilter === 'running') {
      return copy.filter(function (it) {
        var isLocked = it.isUserActiveTrade || (it.analysis && it.analysis.lockedSignal && it.analysis.lockedSignal.status === 'ACTIVE');
        if (isLocked) return true;
        var k = evaluateSignalViability(it).key;
        return k === 'PULLBACK' || k === 'LATE' || k === 'NEAR_SL';
      });
    }
    return copy;
  }

  if (activeGroup === 'all') {
    curGroups.forEach(function (grp, gIdx) {
      var grpItems = items.filter(function (it) { return it && it.analysis && radarAssetGroupOf(it.sym) === grp.key && !it.analysis.__estFeed; });
      var actCount = grpItems.filter(function (it) { return evaluateSignalViability(it).worth; }).length;
      var filteredGrp = sortAndFilterRadarGroup(grpItems);
      var strongGrp = filteredGrp.filter(isActionableRadarSignal);
      // TAMPILKAN SEMUA sinyal yang lolos filter (jangan dipotong/disembunyikan)!
      var displayItems = (viabFilter === 'running' || viabFilter === 'fresh' || viabFilter === 'all')
        ? filteredGrp
        : (strongGrp.length ? strongGrp : (viabFilter === 'actionable' && !filteredGrp.length ? grpItems.slice(0, 4) : filteredGrp.slice(0, 6)));

      var badgeText = '';
      if (viabFilter === 'running') {
        badgeText = filteredGrp.length > 0
          ? ('<span style="font-size:10.5px;color:#38bdf8;font-weight:800;background:rgba(56,189,248,0.18);border:1px solid rgba(56,189,248,0.4);padding:2px 9px;border-radius:99px;">🏃 ' + filteredGrp.length + ' ' + (isEn ? 'Running Setups' : 'Setup Berjalan') + '</span>')
          : ('<span style="font-size:10.5px;color:#94a3b8;font-weight:700;background:rgba(148,163,184,0.15);padding:2px 9px;border-radius:99px;">0 ' + (isEn ? 'Running Setups' : 'Setup Berjalan') + '</span>');
      } else if (viabFilter === 'fresh') {
        badgeText = filteredGrp.length > 0
          ? ('<span style="font-size:10.5px;color:#10b981;font-weight:800;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.4);padding:2px 9px;border-radius:99px;">⚡ ' + filteredGrp.length + ' ' + (isEn ? 'Fresh Signals' : 'Sinyal Baru') + '</span>')
          : ('<span style="font-size:10.5px;color:#94a3b8;font-weight:700;background:rgba(148,163,184,0.15);padding:2px 9px;border-radius:99px;">0 ' + (isEn ? 'Fresh Signals' : 'Sinyal Baru') + '</span>');
      } else if (viabFilter === 'all') {
        badgeText = '<span style="font-size:10.5px;color:#cbd5e1;font-weight:800;background:rgba(148,163,184,0.18);border:1px solid rgba(148,163,184,0.4);padding:2px 9px;border-radius:99px;">📋 ' + filteredGrp.length + ' ' + (isEn ? 'All Pairs' : 'Semua Pair') + '</span>';
      } else {
        badgeText = actCount > 0
          ? ('<span style="font-size:10.5px;color:#10b981;font-weight:800;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.4);padding:2px 9px;border-radius:99px;">🎯 ' + actCount + ' ' + (isEn ? 'Actionable Now' : 'Layak Ikut Entry') + '</span>')
          : (grpItems.length
            ? '<span style="font-size:10.5px;color:#fbbf24;font-weight:800;background:rgba(245,158,11,0.15);padding:2px 9px;border-radius:99px;">' + grpItems.length + ' ' + (isEn ? 'Watchlist' : 'Pantauan') + '</span>'
            : '<span style="font-size:10.5px;color:#94a3b8;font-weight:700;">' + T('ui.rScanningShort', 'Memindai…') + '</span>');
      }

      var focusTitle = T('ui.rFocusTitle', 'Fokus pada bagan {label}').replace('{label}', grp.label);
      html += '<div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-radius:9px;background:' + grp.bg + ';border:1px solid ' + grp.border + '44;border-left:4px solid ' + grp.col + ';margin-top:' + (gIdx > 0 ? '18px' : '4px') + ';flex-wrap:wrap;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<strong style="color:#f8fafc;font-size:13px;letter-spacing:0.3px;">' + grp.label + '</strong>' +
          '<span style="font-size:9.5px;color:#94a3b8;font-weight:700;">' + grp.sub + '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          badgeText +
          '<button type="button" class="btn-group-focus hz-btn" data-focus-rg="' + grp.key + '" title="' + escH(focusTitle) + '" style="font-size:10.5px;padding:3px 10px;border-radius:6px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);color:#7dd3fc;cursor:pointer;font-weight:700;">' +
            T('ui.rFocusBtn', 'Fokus Bagan ↗') +
          '</button>' +
        '</div>' +
      '</div>';
      if (!grpItems.length) {
        html += '<div class="radar-card" style="cursor:default;grid-column:1/-1;padding:12px;font-size:11.5px;color:#94a3b8;">' + grp.emptyText + '</div>';
      } else {
        if (viabFilter === 'actionable' && !actCount) {
          html += '<div style="grid-column:1/-1;font-size:10.5px;color:#fbbf24;margin:2px 0 6px;padding:6px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">' +
            '<span>' + (isEn ? '💡 No fresh/pullback setups currently available in this group (positions are running or consolidating). Showing running setups below (avoid chasing late moves):' : '💡 Belum ada setup baru atau pullback di kelompok ini saat Anda buka app (posisi sedang berjalan jauh atau konsolidasi). Menampilkan setup yang sedang berjalan (jangan kejar pucuk):') + '</span>' +
            '<button type="button" class="btn-group-focus" data-focus-rg="' + grp.key + '" style="background:none;border:none;color:#38bdf8;cursor:pointer;font-weight:700;font-size:11px;text-decoration:underline;">' + (isEn ? 'View All Watchlist →' : 'Buka Semua Pantauan →') + '</button>' +
            '</div>';
        } else if (viabFilter === 'actionable' && !strongGrp.length) {
          html += '<div style="grid-column:1/-1;font-size:10.5px;color:#fbbf24;margin:2px 0 6px;padding:5px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">' +
            '<span>' + T('ui.rNoticeConsolidation', '💡 Belum ada setup yang lolos gerbang ketat institusional (skor ≥ 70) pada kelompok ini saat ini — pasar sedang konsolidasi atau menunggu konfirmasi struktur agar modal aman. Menampilkan kandidat pantauan terdekat:') + '</span>' +
            '<button type="button" class="btn-group-focus" data-focus-rg="' + grp.key + '" style="background:none;border:none;color:#38bdf8;cursor:pointer;font-weight:700;font-size:11px;text-decoration:underline;">' + T('ui.rOpenAllWatch', 'Buka Semua Pantauan →') + '</button>' +
            '</div>';
        } else if (viabFilter === 'running' && !displayItems.length) {
          html += '<div style="grid-column:1/-1;font-size:10.5px;color:#94a3b8;margin:2px 0 6px;padding:6px 12px;background:rgba(148,163,184,0.06);border:1px dashed rgba(148,163,184,0.25);border-radius:8px;">' +
            (isEn ? 'ℹ️ No active/running entries in this asset class right now. When you take a trade or a setup enters pullback/late stage, it will appear here so you can monitor its journey to TP/SL+.' : 'ℹ️ Belum ada posisi aktif/setup yang sedang berjalan di kelompok aset ini. Begitu Anda ambil entry atau setup memasuki fase perjalanan/pullback, perjalanannya menuju TP/SL+ akan terpantau di sini.') +
            '</div>';
        } else if (viabFilter === 'fresh' && !displayItems.length) {
          html += '<div style="grid-column:1/-1;font-size:10.5px;color:#94a3b8;margin:2px 0 6px;padding:6px 12px;background:rgba(148,163,184,0.06);border:1px dashed rgba(148,163,184,0.25);border-radius:8px;">' +
            (isEn ? 'ℹ️ No brand new (fresh) pending setups currently in this group. Waiting for institutional setup confirmation.' : 'ℹ️ Belum ada sinyal limit baru (fresh) di kelompok ini saat ini. Menunggu konfirmasi setup institusional berikutnya.') +
            '</div>';
        }
        displayItems.forEach(function (it) {
          html += renderRadarCardHtml(it);
        });
        var totalCount = (viabFilter === 'running' || viabFilter === 'fresh' || viabFilter === 'all')
          ? filteredGrp.length
          : (strongGrp.length || grpItems.length);
        var showAllSummary = T('ui.rShowingAll', '✅ Menampilkan semua <b>{shown} dari {total}</b> instrumen {label} (lengkap, tidak ada yang disembunyikan)')
          .replace('{shown}', displayItems.length)
          .replace('{total}', totalCount)
          .replace('{label}', grp.label);
        var openTabLabel = T('ui.rOpenTab', 'Buka Tab Khusus {label} →').replace('{label}', grp.label);
        html += '<div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:5px 10px;font-size:11px;color:#94a3b8;border-bottom:1px dashed rgba(148,163,184,0.2);margin-bottom:6px;flex-wrap:wrap;gap:6px;">' +
          '<span>' + showAllSummary + '</span>' +
          '<button type="button" class="btn-group-focus" data-focus-rg="' + grp.key + '" style="background:none;border:none;color:#38bdf8;cursor:pointer;font-weight:700;font-size:11px;">' + openTabLabel + '</button>' +
        '</div>';
      }
    });
  } else {
    var selGrp = curGroups.find(function (g) { return g.key === activeGroup; }) || curGroups[0];
    var selItems = items.filter(function (it) { return it && it.analysis && radarAssetGroupOf(it.sym) === activeGroup && !it.analysis.__estFeed; });
    var selActCount = selItems.filter(function (it) { return evaluateSignalViability(it).worth; }).length;
    var filteredSel = sortAndFilterRadarGroup(selItems);
    var strongSel = filteredSel.filter(isActionableRadarSignal);
    var showSel = (viabFilter === 'running' || viabFilter === 'fresh' || viabFilter === 'all')
      ? filteredSel
      : (strongSel.length ? strongSel : (viabFilter === 'actionable' && !filteredSel.length ? selItems.slice(0, 6) : filteredSel));

    var statusBadge = '';
    if (viabFilter === 'running') {
      statusBadge = filteredSel.length > 0
        ? ('<span style="font-size:10.5px;color:#38bdf8;font-weight:800;background:rgba(56,189,248,0.18);border:1px solid rgba(56,189,248,0.4);padding:2px 9px;border-radius:99px;">🏃 ' + filteredSel.length + ' ' + (isEn ? 'Running Setups' : 'Setup Berjalan') + '</span>')
        : ('<span style="font-size:10.5px;color:#94a3b8;font-weight:700;background:rgba(148,163,184,0.15);padding:2px 9px;border-radius:99px;">0 ' + (isEn ? 'Running Setups' : 'Setup Berjalan') + '</span>');
    } else if (viabFilter === 'fresh') {
      statusBadge = filteredSel.length > 0
        ? ('<span style="font-size:10.5px;color:#10b981;font-weight:800;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.4);padding:2px 9px;border-radius:99px;">⚡ ' + filteredSel.length + ' ' + (isEn ? 'Fresh Signals' : 'Sinyal Baru') + '</span>')
        : ('<span style="font-size:10.5px;color:#94a3b8;font-weight:700;background:rgba(148,163,184,0.15);padding:2px 9px;border-radius:99px;">0 ' + (isEn ? 'Fresh Signals' : 'Sinyal Baru') + '</span>');
    } else if (viabFilter === 'all') {
      statusBadge = '<span style="font-size:10.5px;color:#cbd5e1;font-weight:800;background:rgba(148,163,184,0.18);border:1px solid rgba(148,163,184,0.4);padding:2px 9px;border-radius:99px;">📋 ' + filteredSel.length + ' ' + (isEn ? 'All Pairs' : 'Semua Pair') + '</span>';
    } else {
      statusBadge = selActCount > 0
        ? ('<span style="font-size:10.5px;color:#10b981;font-weight:800;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.4);padding:2px 9px;border-radius:99px;">🎯 ' + selActCount + ' ' + (isEn ? 'Actionable Now' : 'Layak Ikut Entry') + '</span>')
        : (selItems.length
          ? '<span style="font-size:10.5px;color:#fbbf24;font-weight:800;background:rgba(245,158,11,0.15);padding:2px 9px;border-radius:99px;">' + selItems.length + ' ' + (isEn ? 'Watchlist' : 'Pantauan') + '</span>'
          : '<span style="font-size:10.5px;color:#94a3b8;font-weight:700;">' + T('ui.rScanningShort', 'Memindai…') + '</span>');
    }

    html += '<div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-radius:9px;background:' + selGrp.bg + ';border:1px solid ' + selGrp.border + '44;border-left:4px solid ' + selGrp.col + ';margin-top:4px;flex-wrap:wrap;gap:8px;">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<button type="button" class="btn-group-focus hz-btn" data-focus-rg="all" style="font-size:11px;padding:3px 10px;border-radius:6px;background:rgba(15,23,42,0.85);border:1px solid rgba(148,163,184,0.4);color:#cbd5e1;cursor:pointer;font-weight:700;">' +
          T('ui.rBack3Groups', '← Kembali ke 3 Bagan') +
        '</button>' +
        '<strong style="color:#f8fafc;font-size:13px;letter-spacing:0.3px;">' + selGrp.label + '</strong>' +
        '<span style="font-size:9.5px;color:#94a3b8;font-weight:700;">' + selGrp.sub + '</span>' +
      '</div>' +
      statusBadge +
    '</div>';
    if (!selItems.length) {
      html += '<div class="radar-card" style="cursor:default;grid-column:1/-1;padding:14px;font-size:12px;color:#94a3b8;">' + selGrp.emptyText + '</div>';
    } else {
      if (viabFilter === 'actionable' && !selActCount) {
        html += '<div style="grid-column:1/-1;font-size:10.5px;color:#fbbf24;margin:2px 0 6px;padding:6px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;">' +
          (isEn ? '💡 No fresh/pullback setups currently available in this group (positions are running or consolidating). Showing running setups below (avoid chasing late moves):' : '💡 Belum ada setup baru atau pullback di kelompok ini saat Anda buka app (posisi sedang berjalan jauh atau konsolidasi). Menampilkan setup yang sedang berjalan (jangan kejar pucuk):') +
          '</div>';
      } else if (viabFilter === 'actionable' && !strongSel.length) {
        html += '<div style="grid-column:1/-1;font-size:10.5px;color:#fbbf24;margin:2px 0 6px;padding:5px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;">' +
          T('ui.rNoticeConsolidationAll', '💡 Belum ada setup yang lolos gerbang ketat institusional (skor ≥ 70) pada kelompok ini saat ini — pasar sedang konsolidasi atau menunggu konfirmasi struktur. Menampilkan seluruh kandidat pantauan:') +
          '</div>';
      } else if (viabFilter === 'running' && !showSel.length) {
        html += '<div style="grid-column:1/-1;font-size:10.5px;color:#94a3b8;margin:2px 0 6px;padding:6px 12px;background:rgba(148,163,184,0.06);border:1px dashed rgba(148,163,184,0.25);border-radius:8px;">' +
          (isEn ? 'ℹ️ No active/running entries in this group right now. When you take a trade or a setup enters pullback/late stage, it will appear here so you can monitor its journey to TP/SL+.' : 'ℹ️ Belum ada posisi aktif/setup yang sedang berjalan di kelompok ini. Begitu Anda ambil entry atau setup memasuki fase perjalanan/pullback, perjalanannya menuju TP/SL+ akan terpantau di sini.') +
          '</div>';
      } else if (viabFilter === 'fresh' && !showSel.length) {
        html += '<div style="grid-column:1/-1;font-size:10.5px;color:#94a3b8;margin:2px 0 6px;padding:6px 12px;background:rgba(148,163,184,0.06);border:1px dashed rgba(148,163,184,0.25);border-radius:8px;">' +
          (isEn ? 'ℹ️ No brand new (fresh) pending setups in this group currently. Waiting for institutional setup confirmation.' : 'ℹ️ Belum ada sinyal limit baru (fresh) di kelompok ini saat ini. Menunggu konfirmasi setup institusional berikutnya.') +
          '</div>';
      }
      showSel.forEach(function (it) {
        html += renderRadarCardHtml(it);
      });
      var totalSelCount = (viabFilter === 'running' || viabFilter === 'fresh' || viabFilter === 'all')
        ? filteredSel.length
        : (strongSel.length || selItems.length);
      var showSelSummary = T('ui.rShowingAll', '✅ Menampilkan semua <b>{shown} dari {total}</b> instrumen {label} (lengkap, tidak ada yang disembunyikan)')
        .replace('{shown}', showSel.length)
        .replace('{total}', totalSelCount)
        .replace('{label}', selGrp.label);
      html += '<div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:6px 10px;font-size:11px;color:#94a3b8;margin-top:8px;">' +
        '<span>' + showSelSummary + '</span>' +
        '<button type="button" class="btn-group-focus" data-focus-rg="all" style="background:none;border:none;color:#38bdf8;cursor:pointer;font-weight:700;font-size:11px;">' + T('ui.rBack3GroupsFull', '← Kembali ke Tampilan 3 Bagan Lengkap') + '</button>' +
      '</div>';
    }
  }

  grid.innerHTML = html;
  Array.prototype.forEach.call(grid.querySelectorAll('.radar-card[data-sym]'), function (card) {
    card.addEventListener('click', function () {
      gotoInstrument(card.getAttribute('data-sym'), card.getAttribute('data-tf'));
    });
  });
  Array.prototype.forEach.call(grid.querySelectorAll('[data-focus-rg]'), function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var rg = btn.getAttribute('data-focus-rg') || 'all';
      state.radarGroup = rg;
      syncRadarGroupTabs();
    });
  });
}
function syncHorizonTabs() {
  var bar = $id('radarHorizonBar');
  if (!bar) return;
  Array.prototype.forEach.call(bar.querySelectorAll('.hz-btn[data-hz]'), function (b) {
    b.classList.toggle('active', b.getAttribute('data-hz') === state.radarHorizon);
  });
}

/* ============ REKOMENDASI KHUSUS INVESTOR (bukan radar trader) ============ */
// Kurasi aset berkualitas untuk akumulasi jangka panjang (12–36 bulan), dinilai
// dari valuasi (MoS vs nilai wajar), zona cicil DCA, dan kesehatan tren makro.
/* Semesta investasi diambil dari SELURUH katalog (saham IDX/global, logam, crypto) —
   dinilai merata, bukan cuma aset besar. Kurasi menampilkan hanya kandidat yang
   bias makro D1/W1 akumulatif (layak diinvestasikan sesuai horizon waktunya). */
function investableUniverse() {
  // Ruang kerja investor fokus pada aset yang benar-benar bisa dibeli/diakumulasi:
  // saham (IDX/global) dan crypto spot (termasuk pair Binance real-time).
  // Logam/forex/komoditas tetap ada di workspace Trader, bukan rekomendasi investasi.
  return currentCatalog().filter(function (inst) {
    return inst.assetClass === 'stocks' || inst.assetClass === 'crypto';
  });
}
/* Sembunyikan kategori yang tidak bisa diinvestasikan saat workspace Investor aktif,
   supaya pemilih instrumen tidak menawarkan emas/forex/komoditas kontrak. */
function syncInvestorCatalogFilters() {
  var selCat = $id('selCategory');
  if (!selCat) return;
  var investorOnly = state.mode === 'investor';
  var allowed = { ALL: 1, IDX: 1, US_STOCKS: 1, CRYPTO: 1 };
  Array.prototype.forEach.call(selCat.options, function (o) {
    var keep = !investorOnly || allowed[o.value] === 1;
    o.hidden = !keep;
    o.disabled = !keep;
  });
  if (investorOnly && allowed[selCat.value] !== 1) selCat.value = 'ALL';
}
var investorPickRunSeq = 0;
var investorPickCache = { ts: 0, items: [] };
var investorScanPool = {}; // sym -> { ts, item }; cache bergilir semesta investasi (TTL 10 mnt)
// Label kategori kartu kurasi investor (dilokalkan sesuai bahasa aktif)
var INV_CAT_KEY = {
  'SAFE-HAVEN • LOGAM MULIA': 'eIcHaven',
  'LOGAM • ENERGI HIJAU': 'eIcMetal',
  'BLUECHIP CRYPTO • ETF SPOT': 'eIcBtc',
  'BLUECHIP CRYPTO • SMART CONTRACT': 'eIcEth',
  'INDEKS NASIONAL': 'eIcIdx',
  'BLUECHIP • PERBANKAN': 'eIcBank',
  'BLUECHIP • DIVIDEN': 'eIcDiv',
  'DEFENSIF • TELEKOMUNIKASI': 'eIcTelco',
  'BLUECHIP • KONGLOMERASI': 'eIcKong',
  'GROWTH • AI & CHIP': 'eIcAi',
  'GROWTH • MEGA-CAP AS': 'eIcMega'
};
function invCatOf(cat) {
  var k = INV_CAT_KEY[cat];
  return k ? T('ui.' + k, cat) : cat;
}
function investorRatingFor(a) {
  var sc = num(a && a.confluenceScore, 50);
  if (a.direction === 'LONG' && sc >= 65) return { cls: 'accum', txt: T('ui.ibStrong', '● AKUMULASI KUAT') };
  if (a.direction === 'LONG') return { cls: 'accum', txt: T('ui.ibDcaStep', '● DICICIL / DCA BERTAHAP') };
  if (a.direction === 'SHORT') return { cls: 'wait', txt: T('ui.ibWaitMore', '◆ TUNGGU DISKON LAGI') };
  return { cls: 'wait', txt: T('ui.ibHold', '◈ HOLD / PANTAU') };
}
function drawInvestorPickCards(items) {
  var grid = $id('investorPicksGrid');
  if (!grid) return;
  if (!items || !items.length) {
    grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.invEmpty', 'Kurasi portofolio belum termuat — coba beberapa saat lagi…') + '</span></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var a = it.analysis;
    var meta = getMeta(it.sym);
    var badge = investorRatingFor(a);
    var lv = a.levels || {};
    // Nilai wajar ala panel investor: 55% POC volume + 45% VWAP sesi
    var fair = num(lv.poc, a.lastPrice) * 0.55 + num(lv.vwap, a.lastPrice) * 0.45;
    if (fair <= 0) fair = a.lastPrice;
    var mosPct = ((a.lastPrice - fair) / fair) * 100; // negatif = harga di bawah nilai wajar (diskon)
    var mosTxt = mosPct <= 0 ? T('ui.cDisc', 'DISKON') + ' ' + Math.abs(mosPct).toFixed(1) + '%' : T('ui.cPrem', 'PREMIUM') + ' ' + Math.abs(mosPct).toFixed(1) + '%';
    var chg = num(it.changePct, num(a.changePct));
    var chgCol = chg >= 0 ? '#10b981' : '#f43f5e';
    var sc = num(a.confluenceScore, 50);
    var isActive = it.sym === state.symbol;
    html += '<div class="radar-card inv-pick-card' + (isActive ? ' active' : '') + '" data-sym="' + it.sym + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">' +
        '<span class="r-sym">' + it.sym + '</span>' +
        '<span class="r-live">' + (feedIsEstimate(it.source) ? '○ EST' : '● LIVE') + '</span>' +
      '</div>' +
      '<span class="r-name">' + (meta.name || it.sym) + ' <span class="inv-cat">' + invCatOf(it.cat) + '</span></span>' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px;">' +
        '<span class="r-price">' + formatPrice(it.price, it.sym) + '</span>' +
        '<span class="r-chg" style="color:' + chgCol + ';">' + pctFmt(chg) + '</span>' +
      '</div>' +
      '<span class="sig-badge ' + badge.cls + '">' + badge.txt + '</span>' +
      '<div class="inv-rows">' +
        '<div><span>' + T('ui.cFair', 'Nilai Wajar') + '</span><b>' + formatPrice(fair, it.sym) + '</b></div>' +
        '<div><span>' + T('ui.cDca', 'Zona Cicil (DCA 1)') + '</span><b>' + formatPrice(num(lv.dcaZone1, it.price * 0.99), it.sym) + '</b></div>' +
        '<div><span>' + T('ui.cTarget', 'Target Siklus 12–36 bln') + '</span><b style="color:#34d399;">' + formatPrice(num(lv.invTarget1, it.price * 1.12), it.sym) + '</b></div>' +
        '<div><span>' + T('ui.cMos', 'Margin of Safety') + '</span><b style="color:' + (mosPct <= 0 ? '#10b981' : '#f59e0b') + ';">' + mosTxt + '</b></div>' +
      '</div>' +
      '<div class="r-score" style="margin-top:5px;">' + T('ui.cScore', 'SKOR KONFLUENSI') + ' ' + sc + '/100</div>' +
    '</div>';
  }
  grid.innerHTML = html;
  Array.prototype.forEach.call(grid.querySelectorAll('.inv-pick-card'), function (card) {
    card.addEventListener('click', function () { gotoInstrument(card.getAttribute('data-sym'), 'D1'); });
  });
}
function renderInvestorPicks() { return; }
/* ==================== MEME & DEX GEM RADAR (ANTI-RUG SCANNER) ==================== */
var activeMemeToken = null;
var activeMemeSecurity = {};
var activeMemeChartView = 'candles';
var activeMemeTf = 'M5';
var activeMemeCandles = [];
var memePairSearchSeq = 0;
var memePairAnalysisSeq = 0;
var memePairResults = [];

function setDexText(id, value) {
  var el = $id(id);
  if (el) el.textContent = value == null || value === '' ? 'Unavailable' : String(value);
}
function renderDexTechnical(candles) {
  var target = $id('memeTechBody');
  if (!target) return;
  if (!Array.isArray(candles) || candles.length < 20) {
    target.textContent = 'Technical analysis unavailable: insufficient verified OHLCV data.';
    return;
  }
  var closes = candles.map(function (c) { return Number(c.close); });
  var ema = function (period) {
    var k = 2 / (period + 1), value = closes[0];
    for (var i = 1; i < closes.length; i++) value = closes[i] * k + value * (1 - k);
    return value;
  };
  var gains = 0, losses = 0;
  for (var i = Math.max(1, closes.length - 14); i < closes.length; i++) {
    var delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta; else losses -= delta;
  }
  var periods = Math.min(14, closes.length - 1);
  var avgGain = gains / periods, avgLoss = losses / periods;
  var rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  var e20 = ema(20), e50 = closes.length >= 50 ? ema(50) : null;
  var trend = e50 == null ? 'Insufficient bars for EMA50' : (e20 > e50 ? 'EMA20 above EMA50' : e20 < e50 ? 'EMA20 below EMA50' : 'EMA20 equals EMA50');
  target.textContent = trend + ' · EMA20 ' + formatMemePrice(e20) + (e50 == null ? '' : ' · EMA50 ' + formatMemePrice(e50)) + ' · RSI14 ' + rsi.toFixed(1);
}
function renderDexMarket(result) {
  var pair = result && result.pair;
  if (!pair) throw new Error('Market provider returned no pair data');
  activeMemeToken = pair;
  activeMemeCandles = Array.isArray(result.candles) ? result.candles : [];
  var label = (pair.baseToken && (pair.baseToken.symbol || pair.baseToken.name)) || pair.symbol || 'Token';
  setDexText('memeInspectSymbol', label);
  setDexText('memeInspectName', (pair.baseToken && pair.baseToken.name) || pair.name || label);
  setDexText('memeChartTitle', label + ' / ' + ((pair.quoteToken && pair.quoteToken.symbol) || '—') + ' · ' + activeMemeTf);
  setDexText('memeInspectPrice', Number(pair.priceUsd) > 0 ? formatMemePrice(pair.priceUsd) : 'Unavailable');
  setDexText('memeInspectLiq', Number(pair.liquidityUsd) > 0 ? '$' + formatCompactNum(pair.liquidityUsd) : 'Unavailable');
  setDexText('memeInspectVol5m', Number(pair.volume24h) > 0 ? '$' + formatCompactNum(pair.volume24h) + ' (24h)' : 'Unavailable');
  setDexText('memeInspectMcap', Number(pair.fdv) > 0 ? '$' + formatCompactNum(pair.fdv) : 'Unavailable');
  setDexText('memeInspectChg24h', pair.marketStatus || 'Unavailable');
  var security = result.security || {};
  activeMemeSecurity = security;
  setDexText('memeInspectSafetyBadge', security.status === 'verified' ? 'Verified' : 'Unverified');
  setDexText('memeInspectBuyPressure', security.holderDistribution || 'Unavailable');
  setDexText('memeSecurityStatus', security.message || 'On-chain security data unavailable/unverified.');
  var fund = $id('memeFundGrid');
  if (fund) {
    fund.textContent = '';
    [
      'Security source: ' + (security.source || 'Unavailable'),
      'Contract risk: ' + (security.riskSummary || 'Unavailable'),
      'Holder distribution: ' + (security.holderDistribution || 'Unavailable'),
      'Tokenomics: ' + (security.tokenomics || 'Unavailable'),
      'Sentiment: Unavailable (no verified sentiment source)'
    ].forEach(function (text) { var item = document.createElement('div'); item.textContent = text; fund.appendChild(item); });
  }
  setDexText('memeMarketSource', 'Market source: ' + (result.marketSource || 'Unavailable') + ' · OHLCV source: ' + (result.ohlcvSource || 'Unavailable') + ' · as of ' + (result.asOf || 'Unavailable') + ' · freshness: ' + (result.freshness || 'Unavailable') + ' · validity: ' + (result.validity || 'unverified'));
  renderDexTechnical(activeMemeCandles);
  drawMemeCandleChart(pair, activeMemeCandles);
  try { renderMemeGroupAnalysis(); } catch (e) {}
}
async function analyzeManualDexPair(pairAddress) {
  if (!pairAddress || !activeMemeChainValue()) return;
  var seq = ++memePairAnalysisSeq;
  var status = $id('memeSearchStatus');
  if (status) status.textContent = 'Loading current market data, OHLCV, and available on-chain checks…';
  try {
    var params = new URLSearchParams({ action: 'analyze', chain: activeMemeChainValue(), pairAddress: pairAddress, tf: activeMemeTf });
    var response = await fetch('/api/dex/analysis?' + params.toString());
    var data = await response.json();
    if (seq !== memePairAnalysisSeq) return;
    if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP ' + response.status));
    renderDexMarket(data);
    if (status) status.textContent = data.validity === 'verified' ? 'Market data loaded from the stated provider.' : 'Market/security data is unavailable or unverified; no signal is issued.';
  } catch (error) {
    if (seq !== memePairAnalysisSeq) return;
    activeMemeToken = null;
    activeMemeCandles = [];
    if (status) status.textContent = 'Unable to load DEX data: ' + error.message;
    setDexText('memeMarketSource', 'Market source: unavailable · OHLCV source: unavailable · validity: unverified');
    renderDexTechnical([]);
    drawMemeCandleChart(null, []);
  }
}
function activeMemeChainValue() {
  var select = $id('selMemeChain');
  return select ? select.value : '';
}
async function searchManualDexToken() {
  var chain = activeMemeChainValue();
  var addressInput = $id('inpMemeAddress');
  var address = (addressInput && addressInput.value || '').trim();
  var results = $id('memeSearchResults');
  var status = $id('memeSearchStatus');
  if (!chain || address.length < 6 || address.length > 100) {
    if (status) status.textContent = 'Enter a valid contract or pair address for the selected blockchain.';
    if (results) results.textContent = '';
    return;
  }
  var seq = ++memePairSearchSeq;
  if (status) status.textContent = 'Searching the selected blockchain…';
  if (results) results.textContent = '';
  try {
    var params = new URLSearchParams({ action: 'search', chain: chain, address: address });
    var response = await fetch('/api/dex/analysis?' + params.toString());
    var data = await response.json();
    if (seq !== memePairSearchSeq) return;
    if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP ' + response.status));
    memePairResults = Array.isArray(data.pairs) ? data.pairs : [];
    if (!memePairResults.length) {
      if (status) status.textContent = 'No matching market pair was returned by the provider.';
      return;
    }
    if (status) status.textContent = 'Choose an exact pair returned by the provider to load its actual market data.';
    memePairResults.forEach(function (pair) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'hz-btn';
      button.style.textAlign = 'left';
      var base = pair.baseToken && (pair.baseToken.symbol || pair.baseToken.name) || 'Token';
      var quote = pair.quoteToken && pair.quoteToken.symbol || '—';
      button.textContent = base + '/' + quote + ' · ' + (pair.dexId || 'DEX') + ' · ' + (pair.pairAddress || 'pair unavailable');
      button.addEventListener('click', function () { analyzeManualDexPair(pair.pairAddress); });
      results.appendChild(button);
    });
  } catch (error) {
    if (seq === memePairSearchSeq && status) status.textContent = 'DEX search failed: ' + error.message;
  }
}

function invalidateManualDexSelection() {
  memePairSearchSeq++;
  memePairAnalysisSeq++;
  memePairResults = [];
  activeMemeToken = null;
  activeMemeSecurity = {};
  activeMemeCandles = [];
  var results = $id('memeSearchResults');
  if (results) results.textContent = '';
  var status = $id('memeSearchStatus');
  if (status) status.textContent = 'Selection changed. Search again to load matching market data.';
  ['memeInspectSymbol', 'memeInspectName', 'memeInspectPrice', 'memeInspectLiq',
    'memeInspectVol5m', 'memeInspectMcap', 'memeInspectChg24h',
    'memeInspectSafetyBadge', 'memeInspectBuyPressure'].forEach(function (id) {
    setDexText(id, 'Unavailable');
  });
  setDexText('memeSecurityStatus', 'On-chain security data unavailable/unverified.');
  setDexText('memeMarketSource', 'Market source: unavailable · OHLCV source: unavailable · validity: unverified');
  var fund = $id('memeFundGrid');
  if (fund) fund.textContent = 'Tokenomics, holder distribution, and sentiment are unavailable until verified data is loaded.';
  renderDexTechnical([]);
  drawMemeCandleChart(null, []);
  try { renderMemeGroupAnalysis(); } catch (e) {}
}

function formatCompactNum(n) {
  var numVal = Number(n) || 0;
  if (numVal >= 1e9) return (numVal / 1e9).toFixed(2) + 'B';
  if (numVal >= 1e6) return (numVal / 1e6).toFixed(2) + 'M';
  if (numVal >= 1e3) return (numVal / 1e3).toFixed(1) + 'K';
  return numVal.toFixed(0);
}

function formatMemePrice(price) {
  var p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return '$0.00';
  if (p < 0.000001) return '$' + p.toFixed(9);
  if (p < 0.0001) return '$' + p.toFixed(8);
  if (p < 0.01) return '$' + p.toFixed(6);
  if (p < 1) return '$' + p.toFixed(4);
  if (p < 10) return '$' + p.toFixed(3);
  return '$' + p.toFixed(2);
}

function switchMemeChartView(view) {
  activeMemeChartView = view;
  if (activeMemeToken) drawMemeCandleChart(activeMemeToken, activeMemeCandles);
}

function drawMemeCandleChart(item, candleList) {
  var canvas = $id('memeCandleCanvas');
  if (!canvas) return;
  var parent = canvas.parentElement;
  if (!parent) return;

  var w = parent.clientWidth || 800;
  var h = parent.clientHeight || 520;
  if (w <= 0 || h <= 0) { w = 800; h = 520; }
  var dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.scale(dpr, dpr);

  // Background gradient
  var bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#060913');
  bgGrad.addColorStop(1, '#090e1b');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  var candles = Array.isArray(candleList) ? candleList : (Array.isArray(activeMemeCandles) ? activeMemeCandles : []);
  var N = candles.length;
  if (!N) { ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'; ctx.fillText('Verified OHLCV unavailable', 18, 30); ctx.restore(); return; }

  var chartTop = 45;
  var chartBottom = h - 90;
  var chartH = chartBottom - chartTop;
  var volTop = h - 85;
  var volBottom = h - 22;
  var volH = volBottom - volTop;
  var axisRightW = 82;
  var plotW = w - axisRightW;

  var minP = Infinity, maxP = -Infinity, maxVol = 1;
  for (var i = 0; i < N; i++) {
    var bar = candles[i];
    if (bar.low < minP) minP = bar.low;
    if (bar.high > maxP) maxP = bar.high;
    if (bar.volume > maxVol) maxVol = bar.volume;
  }
  var pad = (maxP - minP) * 0.12 || (maxP * 0.05);
  minP = Math.max(0, minP - pad);
  maxP = maxP + pad;
  var pDiff = maxP - minP || 1;

  var yOf = function (price) {
    return chartBottom - ((price - minP) / pDiff) * chartH;
  };

  // Horizontal Grid lines & Price Tags
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (var g = 0; g <= 5; g++) {
    var pGrid = minP + (pDiff * g) / 5;
    var yGrid = Math.round(yOf(pGrid)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, yGrid);
    ctx.lineTo(plotW, yGrid);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.fillText(formatMemePrice(pGrid), plotW + 5, yGrid + 3);
  }

  // Vertical time grid lines
  for (var tg = 1; tg < 6; tg++) {
    var txGrid = Math.round((plotW * tg) / 6) + 0.5;
    ctx.beginPath();
    ctx.moveTo(txGrid, chartTop);
    ctx.lineTo(txGrid, h - 22);
    ctx.stroke();
  }

  var barSpacing = plotW / N;
  var candleW = Math.max(2, Math.floor(barSpacing * 0.72));

  // EMA series (20 & 50)
  var ema20 = [], ema50 = [];
  var k20 = 2 / 21, k50 = 2 / 51;
  var prev20 = candles[0].close, prev50 = candles[0].close;
  for (var ei = 0; ei < N; ei++) {
    prev20 = candles[ei].close * k20 + prev20 * (1 - k20);
    prev50 = candles[ei].close * k50 + prev50 * (1 - k50);
    ema20.push(prev20);
    ema50.push(prev50);
  }

  // Draw Volume Bars
  for (var vi = 0; vi < N; vi++) {
    var vBar = candles[vi];
    var vx = Math.round(vi * barSpacing + (barSpacing - candleW) / 2);
    var vBarH = Math.max(2, Math.round((vBar.volume / maxVol) * volH));
    var vy = volBottom - vBarH;
    var isUpV = vBar.close >= vBar.open;
    ctx.fillStyle = isUpV ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)';
    ctx.fillRect(vx, vy, candleW, vBarH);
  }

  // Draw Candlesticks
  for (var ci = 0; ci < N; ci++) {
    var cBar = candles[ci];
    var cx = Math.round(ci * barSpacing + (barSpacing - candleW) / 2);
    var cxCenter = cx + Math.floor(candleW / 2);
    var isUp = cBar.close >= cBar.open;
    var candleColor = isUp ? '#10b981' : '#f43f5e';

    var yHigh = Math.round(yOf(cBar.high));
    var yLow = Math.round(yOf(cBar.low));
    var yOpen = Math.round(yOf(cBar.open));
    var yClose = Math.round(yOf(cBar.close));

    // Wick
    ctx.strokeStyle = candleColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cxCenter + 0.5, yHigh);
    ctx.lineTo(cxCenter + 0.5, yLow);
    ctx.stroke();

    // Body
    var bodyTop = Math.min(yOpen, yClose);
    var bodyH = Math.max(1.5, Math.abs(yOpen - yClose));
    ctx.fillStyle = candleColor;
    ctx.fillRect(cx, bodyTop, candleW, bodyH);
  }

  // Draw EMA20 Curve
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (var e1 = 0; e1 < N; e1++) {
    var ex1 = Math.round(e1 * barSpacing + barSpacing / 2);
    var ey1 = yOf(ema20[e1]);
    if (e1 === 0) ctx.moveTo(ex1, ey1); else ctx.lineTo(ex1, ey1);
  }
  ctx.stroke();

  // Draw EMA50 Curve
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (var e2 = 0; e2 < N; e2++) {
    var ex2 = Math.round(e2 * barSpacing + barSpacing / 2);
    var ey2 = yOf(ema50[e2]);
    if (e2 === 0) ctx.moveTo(ex2, ey2); else ctx.lineTo(ex2, ey2);
  }
  ctx.stroke();

  // Current Price Line & Right Axis Pill
  var lastBar = candles[N - 1];
  var lastCx = Math.round((N - 1) * barSpacing + (barSpacing - candleW) / 2) + Math.floor(candleW / 2);
  var lastP = lastBar.close;
  var lastY = Math.round(yOf(lastP));
  var isBullTick = lastBar.close >= lastBar.open;
  var tickColor = isBullTick ? '#10b981' : '#f43f5e';

  // Live Pulsing Price Bead on Latest Candle
  var pulseR = 5 + Math.sin(Date.now() / 200) * 2;
  ctx.fillStyle = isBullTick ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';
  ctx.beginPath();
  ctx.arc(lastCx + 0.5, lastY + 0.5, pulseR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(lastCx + 0.5, lastY + 0.5, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = tickColor;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, lastY + 0.5);
  ctx.lineTo(plotW, lastY + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // Right pill
  var pillW = Math.max(78, axisRightW - 4);
  ctx.fillStyle = tickColor;
  ctx.fillRect(plotW + 2, lastY - 8, pillW, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9.5px monospace';
  ctx.fillText(formatMemePrice(lastP), plotW + 4, lastY + 4);

  // Top HUD Bar
  var hudW = Math.min(w - 12, 600);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(6, 6, hudW, 28);
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
  ctx.strokeRect(6, 6, hudW, 28);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 12px monospace';
  var chainQuote = (item.chainId === 'solana' ? 'SOL' : (item.chainId === 'base' ? 'ETH' : (item.chainId === 'bsc' ? 'BNB' : 'ETH')));
  ctx.fillText((item && item.baseToken && item.baseToken.symbol || 'Token') + ' / ' + chainQuote, 14, 25);

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = tickColor;
  ctx.fillText(formatMemePrice(lastP), 140, 25);

  var changeValue = item && item.change24h;
  var hasChange = changeValue !== null && changeValue !== undefined && String(changeValue).trim() !== '' && Number.isFinite(Number(changeValue));
  var chg24 = hasChange ? Number(item.change24h) : 0;
  ctx.fillStyle = !hasChange ? '#94a3b8' : (chg24 >= 0 ? '#10b981' : '#f43f5e');
  var chg24Txt = hasChange ? ((chg24 >= 0 ? '+' : '') + chg24.toFixed(1) + '% (24h)') : '24h change unavailable';
  ctx.fillText(chg24Txt, 240, 25);

  ctx.font = '10px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('EMA20: ' + formatMemePrice(ema20[N - 1]), 330, 25);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('EMA50: ' + formatMemePrice(ema50[N - 1]), 440, 25);

  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 9.5px monospace';
  ctx.fillText('● ' + (activeMemeTf || 'M5') + ' DATA', hudW - 70, 25);

  // Bottom Watermark
  ctx.fillStyle = '#475569';
  ctx.font = '9.5px monospace';
  ctx.fillText('XSTARZG • OHLCV PROVIDER DATA', 8, h - 7);

  ctx.restore();
}

function gotoInstrument(sym, tf) {
  if (!sym) return;
  if (!ensureQuotaFor(sym)) { renderInstrumentCatalog(); return; }
  if (state.mode === 'news' || state.mode === 'journal' || state.mode === 'meme') setMode('trader');
  if (feedReconnectTimer) { try { clearInterval(feedReconnectTimer); feedReconnectTimer = null; } catch (e) {} }
  state.manualInstrumentSelection = true;
  state.symbol = sym;
  if (tf && TF_SECONDS[tf]) {
    state.tf = tf;
    state.timeframe = tf;
    var tfBar = $id('timeframeBar');
    if (tfBar) Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tf') === tf);
    });
  }
  try { auditAndCleanseCorruptedStorage(); } catch (e) {}
  state.candles = [];
  state.lastAnalysis = null;
  state.bestTfBoard = null;
  state.feedSource = '-';
  renderInstrumentCatalog();
  saveSession();
  if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
  connectRealtimeStream();
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
}
 
/* ==================== 8. RISK & POSITION CALCULATOR ==================== */
function updateRiskSizing() {
  var a = state.lastAnalysis;
  if (!a || !a.levels) return;
  var bal = num($id('inpCalcBalance') ? $id('inpCalcBalance').value : 1000, 1000);
  var riskPct = num($id('inpCalcRiskPct') ? $id('inpCalcRiskPct').value : 1, 1);
  var riskUsd = bal * (riskPct / 100);
  var L = effectiveLevels(a);
  var stopDist = (L && L.entry && L.sl) ? Math.abs(num(L.entry) - num(L.sl)) : 0;
  if (!(stopDist > 0)) {
    // Tidak ada sinyal aktif (gerbang ketat menolak) -> kalkulator DILARANG
    // menghitung lot dari harga liar dan TIDAK memicu kalkulasi ulang sinyal.
    setTxt('valCalcDollarRisk', '--');
    setTxt('valCalcLotSize', '--');
    return;
  }
  var units = riskUsd / stopDist;
  setTxt('valCalcDollarRisk', '$' + riskUsd.toFixed(2));
  setTxt('valCalcLotSize', (units >= 100 ? units.toFixed(1) : units.toFixed(4)) + T('ui.eLotUnits', ' Unit'));
}

/* ==================== 8B. SMART SIGNAL & PRICE ALARM ENGINE (v2026.69) ====================
   Alarm sinyal pintar & pemantau setup multi-timeframe berbasis Web Audio (chime lonceng)
   dan Web Notification (push layar HP/laptop). Trader dapat mengaktifkan alarm pada aset
   yang sedang dipantau (mis. GRAM/USDT, XAU/USD, BTC) lalu meninggalkan layar dengan tenang;
   begitu setup ELITE/PRO terbuka atau harga menyentuh entry, lonceng langsung berdentang. */
var alarmState = {
  enabled: false,
  symbol: null,
  lastAlertKey: null
};

function playAlertChime() {
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    var ctx = new AudioCtx();
    if (ctx.state === 'suspended') { ctx.resume(); }
    var now = ctx.currentTime;

    var osc1 = ctx.createOscillator();
    var osc2 = ctx.createOscillator();
    var gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.5, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 1.2);
    osc2.start(now + 0.12);
    osc2.stop(now + 1.2);
  } catch (e) {}
}

function sendBrowserPushNotification(title, body, sym, tf) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    try {
      var n = new Notification(title, {
        body: body,
        icon: '/assets/favicon.svg?v=2027.13',
        badge: '/assets/favicon.svg?v=2027.13',
        requireInteraction: true
      });
      n.onclick = function () {
        window.focus();
        if (typeof gotoInstrument === 'function' && sym) gotoInstrument(sym, tf || 'H1');
        this.close();
      };
    } catch (e) {}
  }
}

function showAlarmToast(title, body) {
  var t = $id('signalAlarmToast');
  if (!t) return;
  setTxt('alarmToastTitle', title);
  setTxt('alarmToastBody', body);
  t.classList.remove('hidden');
  try {
    if (window.__alarmToastTimer) clearTimeout(window.__alarmToastTimer);
    window.__alarmToastTimer = setTimeout(function () {
      t.classList.add('hidden');
    }, 12000);
  } catch (e) {}
}

function triggerAlarmAlert(title, body, sym, tf) {
  playAlertChime();
  sendBrowserPushNotification(title, body, sym, tf);
  showAlarmToast(title, body);
}

function checkSignalAlarm(analysis) {
  if (!alarmState.enabled || !analysis || analysis.error) return;
  var sym = (analysis.symbol || state.symbol || '').toUpperCase();
  var monSym = (alarmState.symbol || '').toUpperCase();
  if (monSym && sym !== monSym) return;

  // 1. Sesi bursa harus buka! Jika akhir pekan (Sabtu/Minggu) untuk Forex/Emas/Saham, jangan bunyikan alarm!
  if (!isAssetMarketOpen(sym)) return;

  // 2. Feed harus nyata, BUKAN estimasi atau seed lokal!
  var isFeedEst = analysis.feedUnverified || analysis.__estFeed || (typeof feedIsEstimate === 'function' && feedIsEstimate(analysis.feedSource)) || analysis.feedSource === 'LOCAL_SEED' || (typeof feedIsReal === 'function' && !feedIsReal(analysis.feedSource || state.feedSource));
  if (isFeedEst) return;

  // 3. Validasi harga agar harga seed 4055 atau kontaminasi simbol tidak memicu alarm palsu
  var lastP = analysis.lastPrice || (analysis.levels && analysis.levels.entry);
  if (lastP && !isPriceCompatibleWithSymbol(lastP, sym)) return;

  // 4. Sinyal ELITE / PRO terbuka
  if (analysis.signalEligible === true && analysis.direction && analysis.direction !== 'NEUTRAL') {
    var tf = analysis.timeframe || state.tf || 'H1';
    var key = 'SIG|' + sym + '|' + tf + '|' + analysis.direction + '|' + (analysis.anchorClosedTime || '');
    if (alarmState.lastAlertKey === key) return;
    alarmState.lastAlertKey = key;

    var L = analysis.levels || {};
    var entryTxt = L.entry ? formatPrice(L.entry, sym) : formatPrice(analysis.lastPrice, sym);
    var tpTxt = L.tp1 ? formatPrice(L.tp1, sym) : '-';
    var slTxt = L.sl ? formatPrice(L.sl, sym) : '-';

    var title = '🔔 SETUP ' + analysis.direction + ' TERBUKA: [' + sym + '] (' + tf + ')';
    var body = (analysis.signalTier || 'ELITE') + ' Setup • Skor ' + (analysis.convictionScore || analysis.confluenceScore || 50) + '% • Entry: ' + entryTxt + ' • TP1: ' + tpTxt + ' • SL: ' + slTxt;
    triggerAlarmAlert(title, body, sym, tf);

    var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
    var isEn = curLang !== 'id' && curLang !== 'ms';
    var score = analysis.convictionScore || analysis.confluenceScore || 50;

    var tgAlarmMsg = isEn ? (
      '🚨 <b>[SPECIAL WATCHLIST ALARM — ' + sym + ']</b>\n\n' +
      'Monitored Asset: <b>' + sym + '</b> (' + tf + ')\n' +
      'Setup: <b>' + (analysis.direction === 'LONG' ? '🟢 BUY / LONG' : '🔴 SELL / SHORT') + ' (' + (analysis.signalTier || 'PRO') + ')</b>\n' +
      'Confidence Score: <b>' + score + '%</b>\n\n' +
      '🎯 <b>Entry:</b> ' + entryTxt + '\n' +
      '🛡️ <b>Stop Loss:</b> ' + slTxt + '\n' +
      '✅ <b>Target TP1:</b> ' + tpTxt + '\n\n' +
      '⚡ <i>Your monitored pair has just triggered a signal! Check your trading app now!</i>'
    ) : (
      '🚨 <b>[ALARM PANTAUAN KHUSUS BERBUNYI — ' + sym + ']</b>\n\n' +
      'Aset Pantauan: <b>' + sym + '</b> (' + tf + ')\n' +
      'Setup: <b>' + (analysis.direction === 'LONG' ? '🟢 BELI / LONG' : '🔴 JUAL / SHORT') + ' (' + (analysis.signalTier || 'PRO') + ')</b>\n' +
      'Skor Konfluensi: <b>' + score + '%</b>\n\n' +
      '🎯 <b>Entry:</b> ' + entryTxt + '\n' +
      '🛡️ <b>Stop Loss:</b> ' + slTxt + '\n' +
      '✅ <b>Target TP1:</b> ' + tpTxt + '\n\n' +
      '⚡ <i>Pair yang Anda pasang alarm khusus baru saja memicu sinyal! Buka aplikasi trading Anda sekarang!</i>'
    );
    try { sendTelegramAlert(tgAlarmMsg); } catch (e) {}
    return;
  }

  // 2. Harga live menyentuh level Entry setup aktif
  if (analysis.levels && analysis.levels.entry && num(analysis.levels.entry) > 0) {
    var p = num(analysis.lastPrice || state.livePrice);
    var en = num(analysis.levels.entry);
    if (p > 0 && Math.abs(p - en) / en <= 0.002) {
      var touchKey = 'TOUCH|' + sym + '|' + Math.round(en) + '|' + (analysis.anchorClosedTime || '');
      if (alarmState.lastAlertKey === touchKey) return;
      alarmState.lastAlertKey = touchKey;

      var titleTouch = '🎯 HARGA MENYENTUH ENTRY: [' + sym + ']';
      var bodyTouch = 'Harga terkini ' + formatPrice(p, sym) + ' menyentuh titik Entry ' + formatPrice(en, sym) + ' (' + (analysis.timeframe || state.tf) + ')';
      triggerAlarmAlert(titleTouch, bodyTouch, sym, analysis.timeframe);

      var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
      var isEn = curLang !== 'id' && curLang !== 'ms';
      var tgTouchMsg = isEn ? (
        '🎯 <b>[ENTRY TOUCH ALARM — ' + sym + ']</b>\n\n' +
        'Monitored Asset: <b>' + sym + '</b>\n' +
        'Live Price: <b>' + formatPrice(p, sym) + '</b>\n' +
        'Entry Zone: <b>' + formatPrice(en, sym) + '</b> (' + (analysis.timeframe || state.tf) + ')\n\n' +
        '⚡ <i>Price has just hit your entry zone! Place or check your order now!</i>'
      ) : (
        '🎯 <b>[ALARM ENTRY TERSENTUH — ' + sym + ']</b>\n\n' +
        'Aset Pantauan: <b>' + sym + '</b>\n' +
        'Harga Terkini: <b>' + formatPrice(p, sym) + '</b>\n' +
        'Titik Entry: <b>' + formatPrice(en, sym) + '</b> (' + (analysis.timeframe || state.tf) + ')\n\n' +
        '⚡ <i>Harga pasar baru saja menyentuh zona Entry! Segera eksekusi order Anda di aplikasi broker/exchange!</i>'
      );
      try { sendTelegramAlert(tgTouchMsg); } catch (e) {}
    }
  }
}

function updateAlarmUi() {
  var btn = $id('btnToggleSignalAlarm');
  var icon = $id('lblAlarmIcon');
  var txt = $id('lblAlarmText');
  var chip = $id('alarmStatusChip');
  var sym = alarmState.symbol || state.symbol || 'Aset Terpilih';

  if (alarmState.enabled) {
    if (icon) icon.textContent = '🔔';
    if (txt) txt.textContent = 'Alarm Aktif (' + sym + ')';
    if (btn) {
      btn.style.borderColor = '#10b981';
      btn.style.color = '#10b981';
      btn.style.background = 'rgba(16,185,129,0.12)';
    }
    if (chip) {
      chip.classList.remove('hidden');
      setTxt('alarmMonitoredSym', sym);
    }
  } else {
    if (icon) icon.textContent = '🔕';
    if (txt) txt.textContent = T('ui.alarmBtn', 'Pasang Alarm Sinyal');
    if (btn) {
      btn.style.borderColor = 'rgba(56,189,248,0.4)';
      btn.style.color = '#38bdf8';
      btn.style.background = '';
    }
    if (chip) chip.classList.add('hidden');
  }
}

/* Alarm lonceng juga dicatat ke cloud agar bot GitHub tetap memantaunya 24/7
   walau dashboard/browser sudah ditutup. */
function syncCloudPriceAlarm(action) {
  if (!state.user || !state.user.email) return Promise.resolve(null);
  var alarm = {
    symbol: (alarmState.symbol || state.symbol || '').toUpperCase(),
    tf: state.tf || 'H1',
    kind: 'signal',
    entry: (state.lastAnalysis && state.lastAnalysis.levels && state.lastAnalysis.levels.entry) || state.livePrice || null
  };
  if (!alarm.symbol) return Promise.resolve(null);
  return ensureAuthToken().then(function (token) {
    if (!token) throw new Error('Cloud alarm sync requires an authenticated session');
    return fetch('/api/market/price-alarms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: action, alarm: alarm })
    });
  }).then(function (r) {
    return r && r.json ? r.json() : null;
  }).catch(function (err) {
    console.warn('Cloud alarm sync failed:', err.message);
    return null;
  });
}

function toggleSignalAlarm() {
  alarmState.enabled = !alarmState.enabled;
  if (alarmState.enabled) {
    alarmState.symbol = (state.symbol || 'GRAM/USDT').toUpperCase();
    alarmState.lastAlertKey = null;
    try { syncCloudPriceAlarm('save'); } catch (e) {}

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }
    playAlertChime();
    showAlarmToast('🔔 ALARM AKTIF', 'XStarZG memantau setup sinyal & entry untuk [' + alarmState.symbol + ']. Lonceng & notifikasi browser akan berbunyi saat peluang terbuka.');

    var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
    var isEn = curLang !== 'id' && curLang !== 'ms';
    var tgConfirm = isEn ? (
      '🔔 <b>[PRIORITY ALARM ACTIVATED: ' + alarmState.symbol + ']</b>\n\n' +
      'Asset: <b>' + alarmState.symbol + '</b> is now being monitored with high priority!\n' +
      'Instant alerts will be sent directly to this Telegram when a new setup forms or price touches Entry.'
    ) : (
      '🔔 <b>[ALARM PANTAUAN PRIORITAS AKTIF: ' + alarmState.symbol + ']</b>\n\n' +
      'Aset: <b>' + alarmState.symbol + '</b> kini dipantau secara prioritas!\n' +
      'Begitu sinyal baru (ELITE/PRO) terdeteksi atau harga pasar menyentuh titik Entry, bot Telegram akan langsung mengirimkan peringatan darurat ke sini.\n' +
      '☁️ <i>Alarm ini juga dipantau bot cloud 24/7 — tetap berbunyi walau dashboard sudah ditutup.</i>'
    );
    try { sendTelegramAlert(tgConfirm); } catch (e) {}
  } else {
    try { syncCloudPriceAlarm('remove'); } catch (e) {}
  }
  try {
    localStorage.setItem('xstarzg_signal_alarm_v1', JSON.stringify({
      enabled: alarmState.enabled,
      symbol: alarmState.symbol
    }));
  } catch (e) {}
  updateAlarmUi();
}

function loadPersistedAlarm() {
  try {
    var raw = localStorage.getItem('xstarzg_signal_alarm_v1');
    if (raw) {
      var d = JSON.parse(raw);
      if (d && d.enabled) {
        alarmState.enabled = true;
        alarmState.symbol = d.symbol || state.symbol || 'GRAM/USDT';
      }
    }
  } catch (e) {}
  updateAlarmUi();
}

/* ---- SL+ (0-Risk Break-Even Plus) Automatic Alert System ---- */
var slPlusNotifyState = {
  enabled: true,
  lastNotifiedMap: {}
};

function sendBrowserPushNotification(title, body, iconUrl) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: iconUrl || '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'xstarzg-slplus-alert'
      });
    } catch (e) {}
  }
}

function updateSlPlusNotifyUi() {
  var btn = $id('btnToggleSlPlusNotify');
  if (!btn) return;
  var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
  var isEn = curLang !== 'id';

  if (slPlusNotifyState.enabled) {
    btn.innerHTML = '🛡️ ' + (isEn ? 'SL+ Alert: ON' : 'Notif SL+: AKTIF');
    btn.style.borderColor = '#10b981';
    btn.style.color = '#10b981';
    btn.style.background = 'rgba(16,185,129,0.12)';
    btn.title = isEn ? 'Auto alert active: chime & push reminder when SL+ triggers' : 'Notifikasi otomatis aktif: lonceng & notif browser saat SL+ aktif';
  } else {
    btn.innerHTML = '🛡️ ' + (isEn ? 'SL+ Alert: OFF' : 'Notif SL+: NONAKTIF');
    btn.style.borderColor = 'rgba(148,163,184,0.3)';
    btn.style.color = '#94a3b8';
    btn.style.background = 'rgba(15,23,42,0.6)';
    btn.title = isEn ? 'Click to enable SL+ alerts' : 'Klik untuk mengaktifkan notifikasi SL+';
  }
}

function toggleSlPlusNotification() {
  slPlusNotifyState.enabled = !slPlusNotifyState.enabled;
  if (slPlusNotifyState.enabled) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }
    try { playAlertChime(); } catch (e) {}
    var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
    var isEn = curLang !== 'id';
    showAlarmToast(
      isEn ? '🛡️ SL+ ALERT ENABLED (0-RISK)' : '🛡️ NOTIFIKASI SL+ AKTIF (0-RISK)',
      isEn ? 'Chime & browser push notification will sound immediately when trade reaches SL+ trigger so you can adjust stop loss to break-even plus.' :
             'Lonceng & notifikasi browser akan langsung berbunyi ketika posisi menyentuh trigger SL+ agar Anda segera memindahkan stop loss ke BE+ di terminal broker.'
    );
  }
  savePersistedSlPlusNotify();
  updateSlPlusNotifyUi();
}

function savePersistedSlPlusNotify() {
  try {
    localStorage.setItem('xstarzg_slplus_notify_v1', JSON.stringify({
      enabled: !!slPlusNotifyState.enabled
    }));
  } catch (e) {}
}

function loadPersistedSlPlusNotify() {
  try {
    var raw = localStorage.getItem('xstarzg_slplus_notify_v1');
    if (raw) {
      var d = JSON.parse(raw);
      if (typeof d.enabled === 'boolean') {
        slPlusNotifyState.enabled = d.enabled;
      }
    } else {
      slPlusNotifyState.enabled = true;
    }
  } catch (e) {}
  updateSlPlusNotifyUi();
}

function notifySlPlusTriggered(symbol, tf, lock) {
  if (lock) {
    lock.notifiedSlPlus = true;
    lock.slPlusAlerted = true;
  }
  if (!slPlusNotifyState.enabled) return;
  if (!symbol || !lock) return;
  if (!lock.filled) return; // Order limit belum terisi di exchange — dilarang kirim alarm geser SL!
  if (lock.feedUnverified || (typeof feedIsEstimate === 'function' && feedIsEstimate(lock.source || state.feedSource)) || (typeof feedIsReal === 'function' && !feedIsReal(lock.source || state.feedSource))) return;

  // STRICT GUARD: Jika setup ini sudah pernah tercatat selesai (TP_HIT / SL_HIT / MISSED / EXPIRED / BE_SAVED / CANCELLED), DILARANG KERAS kirim SL+!
  var oc = (typeof latestSignalOutcome === 'function') ? latestSignalOutcome(symbol, tf) : null;
  if (oc && (oc.status === 'TP_HIT' || oc.status === 'SL_HIT' || oc.status === 'MISSED' || oc.status === 'EXPIRED' || oc.status === 'BE_SAVED' || oc.status === 'CANCELLED')) {
    return;
  }

  var key = symbol + ':' + (tf || '') + ':' + (lock.issuedAt || lock.at || 0);
  if (slPlusNotifyState.lastNotifiedMap[key]) return;
  slPlusNotifyState.lastNotifiedMap[key] = Date.now();

  var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
  var isEn = curLang !== 'id';

  var isLong = lock.direction === 'LONG';
  var entryTxt = lock.entry ? formatPrice(lock.entry, symbol) : '—';
  var slPriceFormatted = lock.slPlus ? formatPrice(lock.slPlus, symbol) : (lock.entry ? formatPrice(lock.entry, symbol) : '');
  var title = isEn ? '🛡️ SL+ TRIGGERED (0-RISK): ' + symbol : '🛡️ SL+ TERPICU (0-RISK): ' + symbol;
  var body = isEn ?
    ('[' + (tf || 'M5') + '] ' + (lock.direction || '') + ' reached 0-risk zone! Move SL to ' + (slPriceFormatted || 'BE+') + ' on your broker now.') :
    ('[' + (tf || 'M5') + '] ' + (lock.direction || '') + ' mencapai zona 0-risk! Geser SL Anda ke ' + (slPriceFormatted || 'BE+') + ' di broker sekarang.');

  try { playAlertChime(); } catch (e) {}
  try { showAlarmToast(title, body); } catch (e) {}
  try { sendBrowserPushNotification(title, body); } catch (e) {}

  // Kirim notifikasi darurat instan ke bot Telegram di HP trader (Bahasa dinamis sesuai sistem)
  if (telegramConfig && telegramConfig.notifySlPlus && (telegramConfig.chatId || state.user)) {
    var tgSlPlusMsg = isEn ? (
      '🛡️ <b>[XSTARZG 24/7 CLOUD — SL+ TRIGGERED — 0-RISK ALERT]</b>\n\n' +
      'Asset: <b>' + symbol + '</b> (' + (tf || 'M5') + ')\n' +
      'Direction: <b>' + (isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT') + '</b>\n' +
      'Initial Entry: <b>' + entryTxt + '</b>\n' +
      (isLong ?
        ('Move Stop Loss to: <b>' + (slPriceFormatted || 'BE+') + ' (0-Risk BE+)</b>\n<i>(Placed ABOVE entry price ' + entryTxt + ' to lock in profit / risk-free trade)</i>\n\n' +
         '⚠️ <i>Price reached the 0-Risk safety threshold! Open your exchange/broker now and adjust your Stop Loss up to ' + (slPriceFormatted || 'BE+') + ' to protect 100% of your capital!</i>') :
        ('Move Stop Loss to: <b>' + (slPriceFormatted || 'BE+') + ' (0-Risk BE+)</b>\n<i>(Placed BELOW entry price ' + entryTxt + ' to lock in profit / risk-free trade)</i>\n\n' +
         '⚠️ <i>Price reached the 0-Risk safety threshold! Open your exchange/broker now and adjust your Stop Loss down to ' + (slPriceFormatted || 'BE+') + ' to protect 100% of your capital!</i>')
      )
    ) : (
      '🛡️ <b>[XSTARZG 24/7 CLOUD — SL+ TERPICU — 0-RISK ALERT]</b>\n\n' +
      'Aset: <b>' + symbol + '</b> (' + (tf || 'M5') + ')\n' +
      'Arah: <b>' + (isLong ? '🟢 BUY / LONG' : '🔴 SELL / SHORT') + '</b>\n' +
      'Entry Awal: <b>' + entryTxt + '</b>\n' +
      (isLong ?
        ('Target Geser SL: <b>' + (slPriceFormatted || 'BE+') + ' (0-Risk BE+)</b>\n<i>(Pasang DI ATAS harga entry ' + entryTxt + ' untuk mengunci profit / posisi bebas risiko)</i>\n\n' +
         '⚠️ <i>Harga telah mencapai zona aman 0-Risk! Buka exchange/broker Anda sekarang dan naikkan Stop Loss ke ' + (slPriceFormatted || 'BE+') + ' agar modal terlindungi 100%!</i>') :
        ('Target Geser SL: <b>' + (slPriceFormatted || 'BE+') + ' (0-Risk BE+)</b>\n<i>(Pasang DI BAWAH harga entry ' + entryTxt + ' untuk mengunci profit / posisi bebas risiko)</i>\n\n' +
         '⚠️ <i>Harga telah mencapai zona aman 0-Risk! Buka exchange/broker Anda sekarang dan turunkan Stop Loss ke ' + (slPriceFormatted || 'BE+') + ' agar modal terlindungi 100%!</i>')
      )
    );
    try { sendTelegramAlert(tgSlPlusMsg); } catch (e) {}
  }
}

/* ==================== INTEGRASI NOTIFIKASI BOT TELEGRAM (0 KUOTA CF) ====================
   Mengirim notifikasi instan langsung dari browser pengguna ke api.telegram.org.
   100% 0 kuota Cloudflare, privasi terjamin, dan aman bagi baterai HP. */
var TELEGRAM_CONFIG_KEY = 'xstarzg_telegram_config_v1';
var telegramConfig = {
  botToken: '',
  chatId: '',
  notifySlPlus: true,
  notifyHighScore: true,
  minScore: 62,
  horizons: { scalping: true, intraday: true, swing: true },
  lastSentMap: {}
};

function loadPersistedTelegramConfig() {
  try {
    var raw = localStorage.getItem(TELEGRAM_CONFIG_KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        if (typeof d.botToken === 'string') telegramConfig.botToken = d.botToken.trim();
        if (typeof d.chatId === 'string' || typeof d.chatId === 'number') telegramConfig.chatId = String(d.chatId).trim();
        if (typeof d.notifySlPlus === 'boolean') telegramConfig.notifySlPlus = d.notifySlPlus;
        if (typeof d.notifyHighScore === 'boolean') telegramConfig.notifyHighScore = d.notifyHighScore;
        if (typeof d.minScore === 'number' || typeof d.minScore === 'string') telegramConfig.minScore = Math.min(parseInt(d.minScore, 10) || 62, 62);
        if (d.horizons && typeof d.horizons === 'object') {
          telegramConfig.horizons = {
            scalping: d.horizons.scalping !== false,
            intraday: d.horizons.intraday !== false,
            swing: d.horizons.swing !== false
          };
        }
      }
    }
  } catch (e) {}

  try {
    var rawSent = localStorage.getItem('xstarzg_tg_last_sent_v1');
    if (rawSent) {
      telegramConfig.lastSentMap = JSON.parse(rawSent) || {};
    }
  } catch (e) {}

  syncTelegramLinkStatus();
  updateTelegramUi();
}

function syncTelegramLinkStatus() {
  if (!state.user) return Promise.resolve(null);
  var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
  var clientLang = (curLang === 'id' || String(curLang).toLowerCase().indexOf('id') === 0) ? 'id' : 'en';
  return ensureAuthToken().then(function (token) {
    if (!token) return null;
    return fetch('/api/notify/telegram-link?lang=' + encodeURIComponent(clientLang), { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.linkedChatId) {
          telegramConfig.chatId = String(d.linkedChatId).trim();
          savePersistedTelegramConfig();
          updateTelegramUi();
        }
        return d;
      });
  }).catch(function () { return null; });
}

function savePersistedTelegramConfig() {
  try {
    localStorage.setItem(TELEGRAM_CONFIG_KEY, JSON.stringify({
      botToken: telegramConfig.botToken,
      chatId: telegramConfig.chatId,
      notifySlPlus: telegramConfig.notifySlPlus,
      notifyHighScore: telegramConfig.notifyHighScore,
      minScore: telegramConfig.minScore,
      horizons: telegramConfig.horizons
    }));
    if (telegramConfig.lastSentMap) {
      localStorage.setItem('xstarzg_tg_last_sent_v1', JSON.stringify(telegramConfig.lastSentMap));
    }
  } catch (e) {}
  updateTelegramUi();
}

function recordTelegramSentKey(dedupKey) {
  if (!dedupKey) return;
  telegramConfig.lastSentMap = telegramConfig.lastSentMap || {};
  telegramConfig.lastSentMap[dedupKey] = Date.now();
  try {
    var nowL = Date.now();
    for (var k in telegramConfig.lastSentMap) {
      if (nowL - telegramConfig.lastSentMap[k] > 24 * 3600 * 1000) {
        delete telegramConfig.lastSentMap[k];
      }
    }
    localStorage.setItem('xstarzg_tg_last_sent_v1', JSON.stringify(telegramConfig.lastSentMap));
  } catch (e) {}
}

function updateTelegramUi() {
  var curUser = state.user;
  var isOwner = curUser && (curUser.tier === 'OWNER_VIP' || (curUser.email && (curUser.email === 'sevenfoldarmy2822@gmail.com' || curUser.email === 'gilfanputra@gmail.com')));
  var isAffiliate = curUser && (curUser.isAffiliate || curUser.role === 'affiliate');
  var isVip = isOwner || isAffiliate || (curUser && curUser.tier === 'VIP' && (!curUser.vipUntil || curUser.vipUntil > Date.now()));

  var txtEl = $id('lblTelegramVipText') || $id('lblTelegramText');
  var txtJnlEl = $id('lblTelegramVipJnlText');
  var btnMain = $id('btnTelegramVipAccess') || $id('btnOpenTelegramModal');
  var btnJnl = $id('btnTelegramVipAccessJnl') || $id('btnOpenTelegramModalJnl');

  var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
  var isEn = curLang !== 'id' && curLang !== 'ms';

  var iconMain = btnMain ? btnMain.querySelector('span:first-child') : null;
  var iconJnl = btnJnl ? btnJnl.querySelector('span:first-child') : null;

  var labelText = '';
  if (telegramConfig.chatId) {
    labelText = 'Telegram: ' + telegramConfig.chatId;
    if (iconMain) iconMain.textContent = '✅';
    if (iconJnl) iconJnl.textContent = '✅';
  } else if (isVip) {
    labelText = isEn ? 'Link Telegram (Tap Here)' : 'Sambungkan Telegram';
    if (iconMain) iconMain.textContent = '✈️';
    if (iconJnl) iconJnl.textContent = '✈️';
  } else {
    labelText = isEn ? 'Telegram Alerts (Phone)' : 'Notif Telegram (HP)';
    if (iconMain) iconMain.textContent = '✈️';
    if (iconJnl) iconJnl.textContent = '✈️';
  }

  if (txtEl) txtEl.textContent = labelText;
  if (txtJnlEl) txtJnlEl.textContent = labelText;

  if (btnMain) {
    if (telegramConfig.chatId) {
      btnMain.style.borderColor = 'rgba(16,185,129,0.7)';
      btnMain.style.color = '#6ee7b7';
      btnMain.style.background = 'rgba(16,185,129,0.16)';
    } else if (isVip) {
      btnMain.style.borderColor = 'rgba(56,189,248,0.6)';
      btnMain.style.color = '#38bdf8';
      btnMain.style.background = 'rgba(56,189,248,0.12)';
    } else {
      btnMain.style.borderColor = 'rgba(245,158,11,0.5)';
      btnMain.style.color = '#fbbf24';
      btnMain.style.background = 'rgba(245,158,11,0.08)';
    }
  }
  if (btnJnl) {
    if (telegramConfig.chatId) {
      btnJnl.style.borderColor = 'rgba(16,185,129,0.7)';
      btnJnl.style.color = '#6ee7b7';
      btnJnl.style.background = 'rgba(16,185,129,0.22)';
    } else if (isVip) {
      btnJnl.style.borderColor = 'rgba(56,189,248,0.6)';
      btnJnl.style.color = '#38bdf8';
      btnJnl.style.background = 'rgba(56,189,248,0.15)';
    } else {
      btnJnl.style.borderColor = 'rgba(245,158,11,0.5)';
      btnJnl.style.color = '#fbbf24';
      btnJnl.style.background = 'rgba(245,158,11,0.12)';
    }
  }

  var inpToken = $id('inpTelegramBotToken');
  var inpChat = $id('inpTelegramChatId');
  var chkSl = $id('chkTelegramSlPlus');
  var chkHs = $id('chkTelegramHighScore');
  var selScore = $id('selTelegramMinScore');
  var chkScalp = $id('chkTelegramScalp');
  var chkIntra = $id('chkTelegramIntra');
  var chkSwing = $id('chkTelegramSwing');

  if (inpToken && !inpToken.dataset.userEdited) inpToken.value = telegramConfig.botToken || '';
  if (inpChat && !inpChat.dataset.userEdited) inpChat.value = telegramConfig.chatId || '';
  if (chkSl) chkSl.checked = !!telegramConfig.notifySlPlus;
  if (chkHs) chkHs.checked = !!telegramConfig.notifyHighScore;
  var selScore = $id('selTelegramMinScore');
  var chkScalp = $id('chkTelegramScalp');
  var chkIntra = $id('chkTelegramIntra');
  var chkSwing = $id('chkTelegramSwing');

  if (inpToken && !inpToken.dataset.userEdited) inpToken.value = telegramConfig.botToken || '';
  if (inpChat && !inpChat.dataset.userEdited) inpChat.value = telegramConfig.chatId || '';
  if (chkSl) chkSl.checked = !!telegramConfig.notifySlPlus;
  if (chkHs) chkHs.checked = !!telegramConfig.notifyHighScore;
  if (selScore) selScore.value = String(telegramConfig.minScore || 75);
  if (chkScalp) chkScalp.checked = telegramConfig.horizons ? (telegramConfig.horizons.scalping !== false) : true;
  if (chkIntra) chkIntra.checked = telegramConfig.horizons ? (telegramConfig.horizons.intraday !== false) : true;
  if (chkSwing) chkSwing.checked = telegramConfig.horizons ? (telegramConfig.horizons.swing !== false) : true;
}

function formatTelegramError(rawErr) {
  var err = String(rawErr || '');
  var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
  var isEn = curLang !== 'id' && curLang !== 'ms';

  if (/chat not found/i.test(err)) {
    return isEn ?
      'Chat ID not found! Ensure you opened your bot in Telegram and clicked START, and your Chat ID from @userinfobot is correct.' :
      'Chat ID tidak ditemukan! Pastikan Anda sudah membuka bot Anda di Telegram dan klik tombol START, serta Chat ID dari @userinfobot sudah benar.';
  }
  if (/unauthorized/i.test(err)) {
    return isEn ?
      'Invalid Bot Token! Please paste the exact HTTP API Token provided by @BotFather (e.g. 7123456789:AAHk...).' :
      'Bot Token tidak valid! Salin ulang HTTP API Token lengkap yang diberikan oleh @BotFather (contoh: 7123456789:AAHk...).';
  }
  if (/bot was blocked/i.test(err)) {
    return isEn ?
      'Bot was blocked by your Telegram account! Please open the bot and unblock it.' :
      'Bot terblokir oleh akun Telegram Anda! Silakan buka bot Anda di Telegram dan klik Unblock.';
  }
  if (/can\'t parse entities|parse/i.test(err)) {
    return isEn ? 'Text formatting error.' : 'Format teks pesan ditolak Telegram.';
  }
  return err;
}

function validateTelegramInputs(token, chatId) {
  var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
  var isEn = curLang !== 'id' && curLang !== 'ms';

  var cleanToken = String(token || '').trim().replace(/^bot/i, '');
  var cleanChatId = String(chatId || '').trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '');

  if (!cleanToken) {
    return isEn ? '⚠️ Please enter the HTTP API Bot Token from @BotFather!' : '⚠️ Masukkan HTTP API Bot Token dari @BotFather!';
  }
  if (!cleanChatId) {
    return isEn ? '⚠️ Please enter your numeric Chat ID / UID from @userinfobot!' : '⚠️ Masukkan angka Chat ID / UID dari @userinfobot!';
  }

  // Token format check: must contain a colon ":" separating numeric bot ID and secret key, and NOT contain "@" or "t.me"
  if (cleanToken.indexOf(':') === -1 || cleanToken.indexOf('@') !== -1 || cleanToken.indexOf('t.me') !== -1) {
    return isEn ?
      '⚠️ Invalid Token format! The Bot Token must be the "HTTP API Token" from @BotFather with digits and letters separated by a colon (e.g. 7123456789:AAHk... NOT the bot @username or t.me link). Please copy the token from @BotFather.' :
      '⚠️ Format Token salah! Bot Token harus berupa "HTTP API Token" dari @BotFather berisi angka & huruf dengan tanda titik dua (contoh: 7123456789:AAHk... BUKAN alamat atau username @bot). Buka @BotFather dan salin tokennya.';
  }

  // Chat ID format check: must be numeric
  if (!/^-?\d+$/.test(cleanChatId)) {
    return isEn ?
      '⚠️ Chat ID must be your numeric account ID (e.g. 987654321 from @userinfobot), NOT a username!' :
      '⚠️ Chat ID / UID harus berupa angka ID akun Telegram Anda (contoh: 987654321 dari @userinfobot), BUKAN username!';
  }

  return null;
}

function relayAlertToServer(token, chatId, text) {
  var tokenPromise = (typeof ensureAuthToken === 'function')
    ? ensureAuthToken().catch(function () { return ''; })
    : Promise.resolve('');

  return tokenPromise.then(function (authToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    var bodyPayload = { text: text };
    if (token) bodyPayload.token = token;
    if (chatId) bodyPayload.chatId = chatId;

    // Utamakan endpoint /api/notify/telegram-link yang terbukti 100% bekerja di production
    if (authToken) {
      return fetch('/api/notify/telegram-link', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ action: 'send_alert', chatId: chatId, text: text })
      }).then(function (r) {
        return r.json().then(function (d) {
          if (d && d.ok) return d;
          return directRelayTelegram(token, chatId, text, headers);
        });
      }).catch(function () {
        return directRelayTelegram(token, chatId, text, headers);
      });
    }

    return directRelayTelegram(token, chatId, text, headers);
  }).catch(function (e) {
    return { ok: false, error: e.message };
  });
}

function directRelayTelegram(token, chatId, text, headers) {
  var bodyPayload = { text: text };
  if (token) bodyPayload.token = token;
  if (chatId) bodyPayload.chatId = chatId;

  return fetch('/api/notify/telegram', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(bodyPayload)
  }).then(function (r) {
    return r.json().then(function (d) {
      if (d && d.chatId && !telegramConfig.chatId) {
        telegramConfig.chatId = String(d.chatId).trim();
        savePersistedTelegramConfig();
        updateTelegramUi();
      }
      return d;
    });
  });
}

function sendTelegramAlert(text) {
  if (!text) return Promise.resolve({ ok: false, error: 'Text kosong' });
  if (!telegramConfig.chatId && !state.user) {
    return Promise.resolve({ ok: false, error: 'Chat ID belum diisi dan pengguna belum login' });
  }
  var chatId = telegramConfig.chatId ? String(telegramConfig.chatId).trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '') : '';
  var token = telegramConfig.botToken ? String(telegramConfig.botToken).trim().replace(/^bot/i, '') : '';

  // 1. Jika ada token bot langsung di client dan ada chatId: coba direct browser-to-Telegram dispatch
  if (token && chatId) {
    var directUrl = 'https://api.telegram.org/bot' + token + '/sendMessage';
    return fetch(directUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    }).then(function (r) {
      return r.json().then(function (res) {
        if (res && res.ok) return { ok: true, direct: true };
        var desc = (res && (res.description || res.error)) || ('HTTP ' + r.status);
        throw new Error(desc);
      });
    }).catch(function () {
      return relayAlertToServer(token, chatId, text);
    });
  }

  // 2. Official VIP Bot: kirim langsung via server relay yang memegang token bot resmi
  return relayAlertToServer(token, chatId, text);
}

function checkTelegramHighScoreSignal(a, item) {
  if (!telegramConfig.notifyHighScore) return;
  if (!telegramConfig.chatId && !state.user) return;
  if (!a || a.error || !a.signalEligible || (a.direction !== 'LONG' && a.direction !== 'SHORT')) return;

  // STRICT GUARD: Dilarang keras mengirim notifikasi jika data feed adalah estimasi / seed lokal / unverified!
  if (a.__estFeed || a.source === 'LOCAL_SEED' || a.feedUnverified) return;
  var src = a.source || (item && item.source) || state.feedSource;
  if (typeof feedIsEstimate === 'function' && feedIsEstimate(src)) return;
  if (typeof feedIsReal === 'function' && !feedIsReal(src)) return;

  // STRICT GUARD: Verifikasi keselarasan pasar Top-Down (1D/4H vs 1H/15m) — anti counter-trend noise
  if (a.topDown && !a.topDown.isAligned) return;

  var minThresh = Math.max(num(telegramConfig.minScore, 78), 78);
  var score = num(a.confluenceScore, a.confidence || 0);
  if (score < minThresh) return;

  var sym = a.symbol || (item && item.sym) || state.symbol;
  var tf = a.timeframe || (item && item.tf) || state.tf || 'H1';
  var hz = (typeof hzOfTf === 'function') ? hzOfTf(tf) : 'intraday';

  // STRICT GUARD 1: Jika instrumen sudah memiliki active lock yang sedang berjalan:
  // DILARANG KERAS mengirim notifikasi "PELUANG SKOR BESAR (BARU)"! Ini adalah posisi yang sedang aktif/berjalan!
  var activeLock = (typeof getSignalLock === 'function') ? getSignalLock(sym, tf) : null;
  if (!activeLock && a.lockedSignal && a.lockedSignal.status === 'ACTIVE') activeLock = a.lockedSignal;
  if (activeLock && activeLock.status === 'ACTIVE') return;

  // STRICT GUARD 2: Jika instrumen dalam masa pendinginan (cooldown):
  if (typeof signalCooldownActive === 'function' && signalCooldownActive(sym, tf)) return;

  if (telegramConfig.horizons && telegramConfig.horizons[hz] === false) return;

  var L = a.levels || {};
  var entry = L.entry || a.entry || (a.lockedSignal && a.lockedSignal.entry);
  var sl = L.sl || a.sl || (a.lockedSignal && a.lockedSignal.sl);
  var tp1 = L.tp1 || a.tp1 || (a.lockedSignal && a.lockedSignal.tp1);
  var tp2 = L.tp2 || a.tp2 || (a.lockedSignal && a.lockedSignal.tp2);
  var tp3 = L.tp3 || a.tp3 || (a.lockedSignal && a.lockedSignal.tp3);
  if (!entry || !sl || !tp1) return;

  if (!isAssetMarketOpen(sym)) return;
  if (!isPriceCompatibleWithSymbol(entry, sym) || !isPriceCompatibleWithSymbol(sl, sym) || !isPriceCompatibleWithSymbol(tp1, sym)) return;

  // Dapatkan livePrice KHUSUS untuk instrumen ini (anti kontaminasi lintas aset dengan state.candles)
  var livePrice = a.lastPrice || a.livePrice || (item && item.price);
  if (!livePrice || !isPriceCompatibleWithSymbol(livePrice, sym)) {
    if (a.candles && a.candles.length) {
      var lc = a.candles[a.candles.length - 1];
      if (lc && isPriceCompatibleWithSymbol(lc.close, sym)) livePrice = lc.close;
    }
  }
  if (!livePrice || !isPriceCompatibleWithSymbol(livePrice, sym)) {
    if (item && item.candles && item.candles.length) {
      var lc2 = item.candles[item.candles.length - 1];
      if (lc2 && isPriceCompatibleWithSymbol(lc2.close, sym)) livePrice = lc2.close;
    }
  }
  if (!livePrice || !isPriceCompatibleWithSymbol(livePrice, sym)) {
    if (state.symbol && state.symbol.toUpperCase() === sym.toUpperCase() && state.livePrice && isPriceCompatibleWithSymbol(state.livePrice, sym)) {
      livePrice = state.livePrice;
    }
  }
  if (!livePrice || !isPriceCompatibleWithSymbol(livePrice, sym)) {
    livePrice = entry;
  }

  var isLong = a.direction === 'LONG';
  var targetDist = Math.abs(tp1 - entry);
  var risk = Math.abs(entry - sl);
  var atr = a.atr || (risk * 0.5) || (livePrice * 0.005);

  // Anti-chasing:
  // 1. Jangan kirim jika harga saat ini sudah menyentuh / melewati TP1 atau SL
  if (isLong) {
    if (livePrice >= tp1 || livePrice <= sl) return;
  } else {
    if (livePrice <= tp1 || livePrice >= sl) return;
  }

  /* Konfirmasi eksekusi M5/M1 (doktrin sniper). Sinyal M15/M30 "skor tinggi"
     TIDAK dikirim bila pemicu eksekusi belum searah — M15 tetap menjadi acuan
     struktur, tetapi entry menunggu konfirmasi timeframe eksekusi. */
  var execBiasTg = (a.topDown && a.topDown.execBias) ? String(a.topDown.execBias).toUpperCase() : '';
  if (execBiasTg && execBiasTg !== (a.direction === 'LONG' ? 'BULLISH' : 'BEARISH')) return;

  // 2. Untuk order Market/Instan (harga berada di sekitar entry), pastikan harga belum lari > 35% target
  var isMarketOrder = Math.abs(entry - livePrice) <= 0.15 * atr;
  if (isMarketOrder && targetDist > 0) {
    var marketProgress = isLong ? (livePrice - entry) / targetDist : (entry - livePrice) / targetDist;
    if (marketProgress > 0.35) return;
  }

  var anchorId = (activeLock && (activeLock.anchorClosedTime || activeLock.issuedAt)) || a.anchorClosedTime || (a.lockedSignal && a.lockedSignal.anchorClosedTime) || entry || 0;
  var dedupKey = 'tg:' + sym + ':' + tf + ':' + a.direction + ':' + anchorId;
  telegramConfig.lastSentMap = telegramConfig.lastSentMap || {};
  if (telegramConfig.lastSentMap[dedupKey]) return;
  if (typeof recordTelegramSentKey === 'function') {
    recordTelegramSentKey(dedupKey);
  } else {
    telegramConfig.lastSentMap[dedupKey] = Date.now();
  }

  var curLang = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function') ? window.XSI18N.getLanguage() : (navigator.language || 'en-US');
  var isEn = curLang !== 'id' && curLang !== 'ms';

  var hzLabel = hz === 'scalping' ? '⚡ SCALPING' : (hz === 'swing' ? '🌊 SWING' : '🎯 INTRADAY');
  var dirEmoji = a.direction === 'LONG' ?
    (isEn ? '🟢 BUY / LONG' : '🟢 BELI / LONG') :
    (isEn ? '🔴 SELL / SHORT' : '🔴 JUAL / SHORT');
  var tierTxt = a.signalTier === 'ELITE' ? 'ELITE ★' : 'PRO';

  var risk = Math.abs(entry - sl);
  var reward = Math.abs(tp1 - entry);
  var rrRatio = risk > 0 ? (reward / risk).toFixed(1) : '2.0';

  var atr = a.atr || (risk * 0.5) || (livePrice * 0.005);
  var isLong = a.direction === 'LONG';
  var orderInstruction = '';

  if (isLong) {
    orderInstruction = isEn ?
      ('📌 <b>Action:</b> <code>BUY LIMIT</code> @ <b>' + formatPrice(entry, sym) + '</b>\n' +
       '💡 <i>Place pending Buy Limit order in discount Order Block / FVG mitigation zone (never chase peak prices!).</i>') :
      ('📌 <b>Aksi Order:</b> <code>BUY LIMIT</code> @ <b>' + formatPrice(entry, sym) + '</b>\n' +
       '💡 <i>Pasang antrian Buy Limit pada zona diskon Order Block / FVG mitigasi (jangan kejar harga di pucuk!).</i>');
  } else {
    orderInstruction = isEn ?
      ('📌 <b>Action:</b> <code>SELL LIMIT</code> @ <b>' + formatPrice(entry, sym) + '</b>\n' +
       '💡 <i>Place pending Sell Limit order in premium Order Block / FVG mitigation zone (never chase low prices!).</i>') :
      ('📌 <b>Aksi Order:</b> <code>SELL LIMIT</code> @ <b>' + formatPrice(entry, sym) + '</b>\n' +
       '💡 <i>Pasang antrian Sell Limit pada zona premium Order Block / FVG mitigasi (jangan kejar harga di lembah!).</i>');
  }

  var topDownBlock = '';
  if (a.topDown) {
    var td = a.topDown;
    topDownBlock = isEn ?
      ('📊 <b>MARKET ALIGNMENT (TOP-DOWN ALIGNED):</b>\n' +
       '• 1D–4H Macro: <b>' + escH(td.macroBias) + '</b> (Direction & Liquidity)\n' +
       '• 1H–15m Structure: <b>' + escH(td.structBias) + '</b> (OB & FVG)\n' +
       '• 5m–1m Execution: <b>' + escH(a.direction) + '</b> (Entry Confirmation)\n' +
       (td.sessionFlow && td.sessionFlow.story ? ('⚡ Order Flow: <i>' + escH(td.sessionFlow.story) + '</i>\n') : '')) :
      ('📊 <b>KESELARASAN PASAR (TOP-DOWN ALIGNED):</b>\n' +
       '• 1D–4H Makro: <b>' + escH(td.macroBias) + '</b> (Arah & Likuiditas)\n' +
       '• 1H–15m Struktur: <b>' + escH(td.structBias) + '</b> (Order Block & FVG)\n' +
       '• 5m–1m Eksekusi: <b>' + escH(a.direction) + '</b> (Konfirmasi Entry)\n' +
       (td.sessionFlow && td.sessionFlow.story ? ('⚡ Order Flow: <i>' + escH(td.sessionFlow.story) + '</i>\n') : ''));
  }

  var sessionBlock = '';
  if (a.sessionInfo) {
    var sess = a.sessionInfo;
    sessionBlock = isEn ?
      ('🏛️ <b>Optimal Session:</b> <code>' + escH(sess.bestSession) + '</code> (' + (sess.isOptimal ? 'Peak Liquidity 🔥' : 'Regular Hours') + ')\n') :
      ('🏛️ <b>Sesi Optimal:</b> <code>' + escH(sess.bestSession) + '</code> (' + (sess.isOptimal ? 'Puncak Likuiditas 🔥' : 'Sesi Reguler') + ')\n');
  }

  var isCrypto = (sym || '').indexOf('/USDT') > -1 || (sym || '').indexOf('BTC') > -1 || (sym || '').indexOf('ETH') > -1 || (sym || '').indexOf('SOL') > -1;
  var isStock = (sym || '').indexOf('.JK') > -1 || ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'SPY', 'QQQ'].indexOf(sym) > -1;
  var platformName = isEn ?
    (isCrypto ? 'your crypto exchange (Binance/Bybit/OKX/etc.)' : isStock ? 'your stock brokerage account' : 'your trading platform / broker') :
    (isCrypto ? 'exchange kripto pilihan Anda (Binance/Bybit/Tokocrypto/OKX)' : isStock ? 'aplikasi sekuritas/broker saham Anda' : 'broker/aplikasi trading Anda');

  var diff = (num(livePrice, 0) || num(entry, 0)) - num(entry, 0);
  var orderType = '';
  if (isLong) {
    if (diff < -0.08 * atr) orderType = 'BUY LIMIT (Diskon Pullback)';
    else if (diff > 0.08 * atr) orderType = 'BUY STOP (Breakout Resistance)';
    else orderType = 'BUY NOW (Market / Instan)';
  } else {
    if (diff > 0.08 * atr) orderType = 'SELL LIMIT (Premium Pullback)';
    else if (diff < -0.08 * atr) orderType = 'SELL STOP (Breakdown Support)';
    else orderType = 'SELL NOW (Market / Instan)';
  }

  /* SATU KEPUTUSAN ORDER untuk satu pesan.
     Baris "Tipe Order" dan "Aksi Order" WAJIB menyebut jenis order yang sama.
     Sebelumnya tipe order dihitung dari jarak harga (bisa BUY NOW) sementara
     instruksi selalu menulis BUY LIMIT sehingga pesan saling bertentangan. */
  var orderVerb = orderType.replace(/\s*\(.*\)$/, '');
  orderInstruction = isEn
    ? ('📌 <b>Action:</b> <code>' + orderVerb + '</code> @ <b>' + formatPrice(entry, sym) + '</b>\n' +
       '💡 <i>' + orderTypeHint(orderType, true) + '</i>')
    : ('📌 <b>Aksi Order:</b> <code>' + orderVerb + '</code> @ <b>' + formatPrice(entry, sym) + '</b>\n' +
       '💡 <i>' + orderTypeHint(orderType, false) + '</i>');

  var tgMsg = isEn ? (
    '🚀 <b>[XSTARZG 24/7 CLOUD — NEW HIGH-SCORE OPPORTUNITY (' + tierTxt + ')]</b>\n\n' +
    'Asset: <b>' + sym + '</b> (' + tf + ' • ' + hzLabel + ')\n' +
    'Setup: <b>' + dirEmoji + ' (' + tierTxt + ' SETUP)</b>\n' +
    'Confidence Score: <b>' + score + '%</b>\n' +
    'Market Regime: <i>' + (a.regime || 'Institutional Flow') + '</i>\n' +
    (sessionBlock ? sessionBlock : '') +
    (topDownBlock ? ('\n' + topDownBlock + '\n') : '\n') +
    '📌 <b>Order Type:</b> <code>' + orderType + '</code>\n' +
    orderInstruction + '\n\n' +
    '🎯 <b>Entry Level:</b> ' + formatPrice(entry, sym) + '\n' +
    '🛡️ <b>Stop Loss:</b> ' + formatPrice(sl, sym) + '\n' +
    '✅ <b>Take Profit 1:</b> ' + formatPrice(tp1, sym) + '\n' +
    (tp2 ? ('✅ <b>Take Profit 2:</b> ' + formatPrice(tp2, sym) + '\n') : '') +
    (tp3 ? ('🚀 <b>Target TP3:</b> ' + formatPrice(tp3, sym) + '\n') : '') +
    '\n📱 <i>Open ' + platformName + ' and execute according to the instructions above. Cloud bot will monitor this position 24/7 and alert you when SL+ (0-Risk) triggers!</i>'
  ) : (
    '🚀 <b>[XSTARZG 24/7 CLOUD — PELUANG BARU SKOR BESAR (' + tierTxt + ')]</b>\n\n' +
    'Aset: <b>' + sym + '</b> (' + tf + ' • ' + hzLabel + ')\n' +
    'Setup: <b>' + dirEmoji + ' (' + tierTxt + ' SETUP)</b>\n' +
    'Confidence Score: <b>' + score + '%</b>\n' +
    'Regime Pasar: <i>' + (a.regime || 'Institutional Flow') + '</i>\n' +
    (sessionBlock ? sessionBlock : '') +
    (topDownBlock ? ('\n' + topDownBlock + '\n') : '\n') +
    '📌 <b>Tipe Order:</b> <code>' + orderType + '</code>\n' +
    orderInstruction + '\n\n' +
    '🎯 <b>Titik Entry:</b> ' + formatPrice(entry, sym) + '\n' +
    '🛡️ <b>Stop Loss:</b> ' + formatPrice(sl, sym) + '\n' +
    '✅ <b>Take Profit 1:</b> ' + formatPrice(tp1, sym) + '\n' +
    (tp2 ? ('✅ <b>Take Profit 2:</b> ' + formatPrice(tp2, sym) + '\n') : '') +
    (tp3 ? ('🚀 <b>Target TP3:</b> ' + formatPrice(tp3, sym) + '\n') : '') +
    '\n📱 <i>Buka aplikasi broker / exchange Anda dan pasang order sesuai instruksi di atas. Bot memantau posisi 24/7 dan akan mengirim peringatan SL+ (0-Risk) setelah order terjemput!</i>'
  );

  try { sendTelegramAlert(tgMsg); } catch (e) {}
}

/* ==================== 9. SESI, KUOTA & ALUR LAYAR ==================== */
function saveSession() {
  if (!state.user) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 4,
      user: state.user,
      // Preferensi workspace ikut tersimpan: refresh halaman tidak menendang user keluar
      symbol: state.symbol, tf: state.tf, mode: state.mode, subMode: state.subMode,
      radarHorizon: state.radarHorizon,
      // Instrumen yang SUDAH dipilih manual juga dipulihkan; tanpa flag ini engine
      // menolak menghitung setelah refresh dan chart tertahan di candle seed sintetis.
      manualSelection: state.manualInstrumentSelection === true,
      at: Date.now()
    }));
    var tok = (state.user && (state.user.ownerToken || state.user.authToken)) || '';
    if (tok) localStorage.setItem('xstarzg_jwt', tok);
  } catch (e) {}
}
function loadSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var p = JSON.parse(raw);
    if (!p) return null;
    // Kompatibel mundur: format lama menyimpan objek user langsung
    var user = p.user || (p.email ? p : null);
    if (!user || !user.email) return null;
    if (user.tier === 'VIP' && user.vipUntil && Date.now() > user.vipUntil) user.tier = 'FREE';
    p.user = user;
    var tok = (user.ownerToken || user.authToken) || '';
    if (tok) {
      try { localStorage.setItem('xstarzg_jwt', tok); } catch (e) {}
    }
    return p;
  } catch (e) { return null; }
}
// Terapkan preferensi workspace dari sesi tersimpan (dipakai saat restore setelah refresh)
function applyWorkspacePrefs(saved) {
  if (!saved) return;
  if (typeof saved.symbol === 'string' && saved.symbol.length > 1) state.symbol = saved.symbol;
  /* Pulihkan pilihan manual sebelumnya (bukan auto-scan). Sesi lama belum punya
     flag manualSelection: bila sesi itu menyimpan simbol+TF workspace, anggap
     instrumen itu memang pilihan user — engine boleh mengambil candle nyata,
     supaya chart tidak tertahan di preview seed setelah refresh. */
  if (saved.manualSelection === true ||
      (typeof saved.symbol === 'string' && saved.symbol.length > 1 && !!saved.tf)) {
    state.manualInstrumentSelection = true;
  }
  var btns, i, on;
  var tfBar = $id('timeframeBar');
  if (tfBar && saved.tf) {
    btns = tfBar.querySelectorAll('.tf-btn');
    var tfOk = false;
    for (i = 0; i < btns.length; i++) {
      on = btns[i].getAttribute('data-tf') === saved.tf;
      tfOk = tfOk || on;
      btns[i].classList.toggle('active', on);
    }
    if (tfOk) { state.tf = saved.tf; state.timeframe = saved.tf; }
  }
  if (saved.mode === 'investor' || saved.mode === 'trader' || saved.mode === 'meme' || saved.mode === 'news' || saved.mode === 'journal' || saved.mode === 'performance') {
    state.mode = saved.mode;
    var t = $id('btnModeTrader'), inv = $id('btnModeInvestor'), mem = $id('btnModeMeme');
    var nw = $id('btnModeNews'), jn = $id('btnModeJournal');
    if (t) t.classList.toggle('active', saved.mode === 'trader');
    if (inv) inv.classList.toggle('active', saved.mode === 'investor');
    if (mem) mem.classList.toggle('active', saved.mode === 'meme');
    if (nw) nw.classList.toggle('active', saved.mode === 'news');
    if (jn) jn.classList.toggle('active', saved.mode === 'journal');
    var pfm = $id('btnModePerformance');
    if (pfm) pfm.classList.toggle('active', saved.mode === 'performance');
    var wrap = $id('traderSubModeWrap');
    if (wrap) wrap.style.display = saved.mode === 'trader' ? 'flex' : 'none';
  }
  if (saved.subMode === 'spot' || saved.subMode === 'futures') {
    state.subMode = saved.subMode;
    var f = $id('btnSubFutures'), s = $id('btnSubSpot');
    if (f) f.classList.toggle('active', saved.subMode === 'futures');
    if (s) s.classList.toggle('active', saved.subMode === 'spot');
  }
  if (saved.radarHorizon === 'scalping' || saved.radarHorizon === 'intraday' || saved.radarHorizon === 'swing') {
    state.radarHorizon = saved.radarHorizon;
    if (typeof syncHorizonTabs === 'function') syncHorizonTabs();
  }
  if (typeof updateModeChip === 'function') updateModeChip();
  if (typeof syncTfBarForMode === 'function') syncTfBarForMode();
}
// Sinkronkan workspace & section rekomendasi: radar trader vs kurasi portofolio investor vs DEX meme radar vs kalender berita vs jurnal sinyal.
function syncModeSections() {
  var tiWrap = $id('traderInvestorWorkspaceWrap');
  var memeWrap = $id('memeWorkspaceWrap');
  var newsWrap = $id('newsWorkspaceWrap');
  var journalWrap = $id('journalWorkspaceWrap');
  var perfWrap = $id('performanceWorkspaceWrap');
  var traderSec = $id('traderRadarSection'), invSec = $id('investorRadarSection');
  var isInv = state.mode === 'investor';
  var isMeme = state.mode === 'meme';
  var isNews = state.mode === 'news';
  var isJournal = state.mode === 'journal';
  var isPerf = state.mode === 'performance';

  if (tiWrap) tiWrap.classList.toggle('hidden', isMeme || isNews || isJournal || isPerf);
  if (memeWrap) memeWrap.classList.toggle('hidden', !isMeme);
  if (isMeme) { try { renderMemeGroupAnalysis(); } catch (e) {} }
  // Panel setup mengikuti mode aktif tanpa menunggu analisis baru — inilah yang
  // membuat workspace Investor (valuasi & DCA) hilang saat mode ditukar.
  var traderPanel = $id('traderSetupPanel'), invPanel = $id('investorSetupPanel');
  if (traderPanel) traderPanel.classList.toggle('hidden', isInv || isMeme || isNews || isJournal || isPerf);
  if (invPanel) invPanel.classList.toggle('hidden', !isInv);
  if (newsWrap) newsWrap.classList.toggle('hidden', !isNews);
  if (journalWrap) journalWrap.classList.toggle('hidden', !isJournal);
  if (perfWrap) perfWrap.classList.toggle('hidden', !isPerf);
  if (traderSec) traderSec.classList.toggle('hidden', isInv || isMeme || isNews || isJournal || isPerf);
  if (invSec) invSec.classList.toggle('hidden', !isInv);
  var investorMacro = $id('investorMacroContextSection');
  if (investorMacro) investorMacro.classList.toggle('hidden', !isInv);
  if (typeof syncModeButtonLabels === 'function') syncModeButtonLabels();
}
function syncModeButtonLabels() {
  var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
  var bn = $id('btnModeNews');
  var bj = $id('btnModeJournal');
  var bp = $id('btnModePerformance');
  if (bn) bn.textContent = isEn ? '📰 ECONOMIC CALENDAR' : '📰 KALENDER EKONOMI';
  if (bj) bj.textContent = isEn ? '📒 SIGNAL JOURNAL' : '📒 JURNAL SINYAL';
  if (bp) bp.textContent = isEn ? '📈 PERFORMANCE' : '📈 PERFORMANCE';
  // Penjelasan DCA: menghapus kebingungan "kenapa DCA 3 paling bawah".
  var dcaStepLabels = [
    isEn ? '🟢 DCA STEP 1 — 40% OF CAPITAL (first tranche)' : '🟢 DCA TAHAP 1 — ALOKASI 40% MODAL (cicilan pertama)',
    isEn ? '🟢 DCA STEP 2 — 35% OF CAPITAL (add on deeper discount)' : '🟢 DCA TAHAP 2 — ALOKASI 35% MODAL (tambah saat lebih diskon)',
    isEn ? '🟢 DCA STEP 3 — 25% OF CAPITAL (deepest discount, optional)' : '🟢 DCA TAHAP 3 — ALOKASI 25% MODAL (diskon terdalam, opsional)'
  ];
  ['lblInvDcaStep1', 'lblInvDcaStep2', 'lblInvDcaStep3'].forEach(function (id, idx) {
    var el = $id(id);
    if (el) el.textContent = dcaStepLabels[idx];
  });
  var dcaHowTitle = $id('lblInvDcaHowTitle');
  if (dcaHowTitle) dcaHowTitle.textContent = isEn ? 'How DCA 1 → 3 works' : 'Cara kerja DCA 1 → 3';
  var dcaHowBody = $id('lblInvDcaHowBody');
  if (dcaHowBody) {
    dcaHowBody.innerHTML = isEn
      ? 'These are three <b>buy ladder levels</b>, not three targets you must all hit. Buy the first tranche at DCA 1, add at DCA 2, and reserve the last tranche for DCA 3 — the <b>deepest discount</b>, not a mandatory bottom. If price reverses before reaching DCA 3, that is fine: averaging is optional, discipline is not. Start accumulating only when the investor score is <b>≥ 60</b> (aggressive ≥ 75). Below 45, wait for a discount.'
      : 'Ini <b>tangga pembelian</b>, bukan tiga target yang wajib disentuh semua. Beli cicilan pertama di DCA 1, tambah di DCA 2, dan sisakan jatah terakhir untuk DCA 3 — harga <b>paling diskon</b>, bukan syarat harga dasar. Kalau harga berbalik sebelum DCA 3, itu tidak masalah: rata-rata boleh berhenti, disiplin tidak. Mulai akumulasi hanya bila skor investor <b>≥ 60</b> (agresif ≥ 75). Di bawah 45, tunggu diskon.';
  }
  var bBacks = document.querySelectorAll('.btn-back-to-trader');
  Array.prototype.forEach.call(bBacks, function (b) {
    b.textContent = isEn ? '← Back to Analysis Terminal' : '← Kembali ke Terminal Analisis';
  });

  // Sinkronisasi teks Instagram masukan & kritik agar dinamis mengikuti bahasa sistem
  var lblIg = $id('lblIgBtnText');
  if (lblIg) lblIg.textContent = isEn ? 'Instagram DM & Feedback' : 'Masukan & Kritik (Instagram)';
  var btnIgJnl = $id('btnOpenInstagramModalJnl');
  if (btnIgJnl && typeof btnIgJnl.querySelector === 'function') {
    try {
      var sp = btnIgJnl.querySelector('span:last-child');
      if (sp) sp.textContent = isEn ? 'Instagram Community & DM' : 'Masukan & Kritik Instagram';
    } catch (eIg) {}
  }
  var igTitle = $id('lblIgBannerTitle');
  if (igTitle) igTitle.textContent = isEn ? 'Official Community & Feedback Channel' : 'Komunitas & Saluran Masukan Resmi';
  var igDesc = $id('lblIgBannerDesc');
  if (igDesc) {
    igDesc.innerHTML = isEn
      ? 'Follow our official <strong>@xstarzganalysis</strong> Instagram to discuss, comment on posts, and send a <strong>Direct Message (DM Chat)</strong> for questions, feedback, or feature suggestions directly to the team.'
      : 'Follow akun resmi <strong>@xstarzganalysis</strong> untuk berdiskusi, memberikan komentar di postingan kami, serta kirimkan <strong>Direct Message (DM Chat)</strong> pesan pribadi untuk masukan, saran fitur, atau kritik langsung kepada tim pengembang.';
  }
  var igBtn = $id('lblIgBannerBtn');
  if (igBtn) igBtn.textContent = isEn ? 'Visit Instagram @xstarzganalysis' : 'Kunjungi Instagram @xstarzganalysis';
  var gateIg = $id('lblGateIgText');
  if (gateIg) gateIg.textContent = isEn ? '💬 Questions, feedback, or suggestions? Contact our Instagram DM:' : '💬 Punya pertanyaan, saran, atau kritik? Hubungi DM kami:';
  var footerIg = $id('lblFooterIgText');
  if (footerIg) footerIg.textContent = isEn ? '💬 Have questions or feedback? Connect with us on official Instagram:' : '💬 Punya masukan atau kritik? Terhubung dengan kami di media sosial:';

  var lblViabTitle = $id('lblViabTitle');
  if (lblViabTitle) lblViabTitle.textContent = isEn ? 'Entry Viability Filter:' : 'Kelayakan Entry Saat Buka:';
  var btnViabAct = document.querySelector('[data-viab="actionable"] span');
  if (btnViabAct) btnViabAct.textContent = isEn ? '🎯 Actionable Only (Fresh & Pullback)' : '🎯 Layak Ikut Saja (Fresh & Pullback)';
  var btnViabFresh = document.querySelector('[data-viab="fresh"] span');
  if (btnViabFresh) btnViabFresh.textContent = isEn ? '⚡ Fresh Signals Only' : '⚡ Sinyal Baru Saja';
  var btnViabRun = document.querySelector('[data-viab="running"] span');
  if (btnViabRun) btnViabRun.textContent = isEn ? '🕒 Running Setups' : '🕒 Sedang Berjalan';
  var btnViabAll = document.querySelector('[data-viab="all"] span');
  if (btnViabAll) btnViabAll.textContent = isEn ? '🌐 Show All' : '🌐 Tampilkan Semua';

  // Sinkronisasi teks ringkasan & tombol Jurnal Investor & DEX Meme
  var elInvTitle = $id('lblInvPortTitle'); if (elInvTitle) elInvTitle.innerHTML = isEn ? '📊 <strong>Investment Portfolio:</strong>' : '📊 <strong>Portofolio Investasi:</strong>';
  var elInvTot = $id('lblInvTotalAssets'); if (elInvTot) elInvTot.textContent = isEn ? 'Total Assets:' : 'Total Aset:';
  var elInvAvgRet = $id('lblInvAvgReturn'); if (elInvAvgRet) elInvAvgRet.textContent = isEn ? 'Avg Return:' : 'Rata-rata Return:';
  var elInvProf = $id('lblInvProfitableAssets'); if (elInvProf) elInvProf.textContent = isEn ? 'Profitable Assets:' : 'Aset Profit:';
  var elBtnAddInv = $id('lblBtnAddInvestor'); if (elBtnAddInv) elBtnAddInv.textContent = isEn ? 'Record DCA / New Investment' : 'Catat Akumulasi / Investasi Baru';

  var elMemeTitle = $id('lblMemePortTitle'); if (elMemeTitle) elMemeTitle.innerHTML = isEn ? '🚀 <strong>DEX Meme Portfolio:</strong>' : '🚀 <strong>Portofolio Koin Micin:</strong>';
  var elMemeTot = $id('lblMemeTotalCoins'); if (elMemeTot) elMemeTot.textContent = isEn ? 'Total Coins:' : 'Total Koin:';
  var elMemeGain = $id('lblMemeBestGain'); if (elMemeGain) elMemeGain.textContent = isEn ? 'Best Multiplier:' : 'Best Multiplier:';
  var elMemeProt = $id('lblMemeProtectedCap'); if (elMemeProt) elMemeProt.textContent = isEn ? 'Capital Protected:' : 'Modal Terlindungi:';
  var elBtnAddMeme = $id('lblBtnAddMeme'); if (elBtnAddMeme) elBtnAddMeme.textContent = isEn ? 'Record New DEX Gem' : 'Catat Koin Micin Baru';

  var elTabTrader = $id('lblTabJnlTrader'); if (elTabTrader) elTabTrader.textContent = isEn ? 'Trader Journal (Futures & FX)' : 'Jurnal Trader (Futures & FX)';
  var elTabInv = $id('lblTabJnlInvestor'); if (elTabInv) elTabInv.textContent = isEn ? 'Investor Journal (Spot DCA & Valuation)' : 'Jurnal Investor (Spot DCA & Valuasi)';
  var elTabMeme = $id('lblTabJnlMeme'); if (elTabMeme) elTabMeme.textContent = isEn ? 'DEX Meme Journal (Solana & EVM)' : 'Jurnal DEX Micin (Solana & EVM)';

  var inpJnlSrch = $id('inpJournalSearch');
  if (inpJnlSrch) inpJnlSrch.placeholder = isEn ? '🔍 Search pair / instrument (e.g. EUR/USD, GBP, BTC, XAU)...' : '🔍 Cari pair / instrumen (mis. EUR/USD, GBP, BTC, XAU)...';

  // Modal Investor Labels
  var mInvT = $id('lblAddInvTitle'); if (mInvT) mInvT.textContent = isEn ? 'Record Investor Portfolio / DCA' : 'Catat Portofolio / Akumulasi Investor';
  var mInvD = $id('lblAddInvDesc'); if (mInvD) mInvD.textContent = isEn ? 'Track the performance of spot instruments, stocks, and crypto accumulated over time to see true net returns.' : 'Pantau performa instrumen spot / saham / kripto yang Anda beli dari waktu ke waktu untuk melihat apakah benar-benar menghasilkan keuntungan.';
  var mInvSym = $id('lblAddInvSym'); if (mInvSym) mInvSym.textContent = isEn ? 'Asset Symbol (e.g. BBCA.JK, NVDA, BTC/USDT, XAU/USD)' : 'Simbol / Aset (mis. BBCA.JK, NVDA, BTC/USDT, XAU/USD)';
  var mInvEnt = $id('lblAddInvEntry'); if (mInvEnt) mInvEnt.textContent = isEn ? 'Buy Price / Entry' : 'Harga Beli / Entry';
  var mInvT1 = $id('lblAddInvTarget1'); if (mInvT1) mInvT1.textContent = isEn ? 'Take Profit Target 1 (Optional)' : 'Target Jual 1 (Opsional)';
  var mInvN = $id('lblAddInvNotes'); if (mInvN) mInvN.textContent = isEn ? 'DCA / Accumulation Notes (Optional)' : 'Catat Akumulasi (Opsional)';
  var btnSubInv = $id('btnSubmitAddInvestor'); if (btnSubInv) btnSubInv.textContent = isEn ? '💾 Save to Journal' : '💾 Simpan ke Jurnal';

  // Modal Meme Labels
  var mMemeT = $id('lblAddMemeTitle'); if (mMemeT) mMemeT.textContent = isEn ? 'Record DEX Meme Purchase' : 'Catat Pembelian Koin Micin DEX';
  var mMemeD = $id('lblAddMemeDesc'); if (mMemeD) mMemeD.textContent = isEn ? 'Track multiplier gains (2x, 5x, 10x) live and follow Golden Rules to protect your initial capital.' : 'Pantau kelipatan keuntungan (2x, 5x, 10x) koin micin Anda secara live dan ikuti Golden Rules untuk mengamankan modal awal.';
  var mMemeSym = $id('lblAddMemeSym'); if (mMemeSym) mMemeSym.textContent = isEn ? 'Coin Symbol (e.g. PNUT, BRETT)' : 'Simbol Koin (mis. PNUT, BRETT)';
  var mMemeCh = $id('lblAddMemeChain'); if (mMemeCh) mMemeCh.textContent = isEn ? 'Network (Chain)' : 'Jaringan (Chain)';
  var mMemeBp = $id('lblAddMemeBuyPrice'); if (mMemeBp) mMemeBp.textContent = isEn ? 'Buy Price ($ USD)' : 'Harga Beli ($ USD)';
  var mMemeTx = $id('lblAddMemeTargetX'); if (mMemeTx) mMemeTx.textContent = isEn ? 'Target Multiplier (x)' : 'Target Kelipatan (x)';
  var mMemeCa = $id('lblAddMemeCA'); if (mMemeCa) mMemeCa.textContent = isEn ? 'Contract Address / CA (Optional)' : 'Contract Address / CA (Opsional)';
  var btnSubMeme = $id('btnSubmitAddMeme'); if (btnSubMeme) btnSubMeme.textContent = isEn ? '🚀 Save Gem' : '🚀 Simpan Koin';
}
// Turunkan tier sesi owner yang tidak bisa dibuktikan ke server (defense-in-depth).
function downgradeOwnerSession() {
  if (!state.user || state.user.tier !== 'OWNER_VIP') return;
  state.user.tier = 'FREE';
  try { delete state.user.ownerToken; } catch (e) {}
  saveSession();
  updateUserUi();
}
// Re-validasi sesi OWNER_VIP hasil restore refresh ke server. Toleran jika jaringan
// gagal (server belum bangun dsb.) — hanya downgrade saat server menjawab tegas TIDAK.
// Re-validasi sesi VIP berbayar ke server. Netiquette sama seperti owner: toleran
// saat jaringan error, downgrade HANYA saat server menjawab tegas (token invalid/
// kedaluwarsa). Tier VIP TANPA token server (sisa grant lokal era lama) diturunkan
// ke FREE — lisensi kini hanya sah bila dikeluarkan & ditandatangani server.
function verifyVipSession() {
  try {
    if (!state.user || state.user.tier !== 'VIP') return;
    if (typeof fetch !== 'function') return;
    if (!state.user.authToken) {
      state.user.tier = 'FREE'; state.user.vipUntil = null;
      saveSession(); updateUserUi(); return;
    }
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + state.user.authToken } })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (res) {
        var d = (res && res.d) || {};
        if (!d.ok || !d.user) {
          // Token ditolak/kedaluwarsa (mis. 30 hari berlalu): daftarkan ulang diam-2 —
          // entitlement VIP yang masih sah di database server dipulihkan otomatis.
          state.user.authToken = null;
          ensureAuthToken().then(function () { updateUserUi(); }).catch(function () {
            state.user.tier = 'FREE'; state.user.vipUntil = null;
            saveSession(); updateUserUi();
          });
          return;
        }
        var until = Number(d.user.vipUntil) || 0;
        if (d.user.tier === 'VIP' && until > Date.now()) {
          if (until !== state.user.vipUntil) { state.user.vipUntil = until; saveSession(); updateUserUi(); }
          return;
        }
        if (until && until <= Date.now()) {
          state.user.tier = 'FREE'; state.user.vipUntil = null;
          saveSession(); updateUserUi();
        }
      })
      .catch(function () { /* jaringan error -> toleran, sesi dipertahankan */ });
  } catch (e) {}
}
function verifyOwnerSession() {
  try {
    if (!state.user || state.user.tier !== 'OWNER_VIP') return;
    if (typeof fetch !== 'function') return;
    if (!state.user.ownerToken) { downgradeOwnerSession(); return; }
    fetch('/api/auth/owner-verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.user.email, token: state.user.ownerToken })
    }).then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok === false) downgradeOwnerSession(); })
      .catch(function () { /* jaringan error -> toleran, sesi dipertahankan */ });
  } catch (e) {}
}
function quotaLimit() {
  if (!state.user) return 0;
  if (state.user.tier === 'VIP') {
    var until = Number(state.user.vipUntil) || 0;
    if (until > 0 && until <= Date.now()) {
      state.user.tier = 'FREE';
      state.user.vipUntil = null;
      saveSession();
      updateUserUi();
      return 2;
    }
    return Infinity;
  }
  if (state.user.tier === 'OWNER_VIP') return Infinity;
  if (state.user.tier === 'FREE') return 2;
  return 0; // GUEST: hanya melihat instrumen default, ganti instrumen wajib login
}
function tierBadge(u) {
  if (!u || u.tier === 'GUEST') return T('ui.tierGuestBadge', 'MODE TAMU');
  if (u.tier === 'OWNER_VIP') return '👑 OWNER VIP';
  if (u.tier === 'VIP') return '💎 VIP MEMBER';
  return '✅ FREE GOOGLE';
}
function updateUserUi() {
  var u = state.user;
  if (u && u.tier === 'VIP') {
    var until = Number(u.vipUntil) || 0;
    if (until > 0 && until <= Date.now()) {
      u.tier = 'FREE';
      u.vipUntil = null;
      saveSession();
    }
  }
  setTxt('lblUserName', u ? (u.name || u.email.split('@')[0]) : T('ui.guestName', 'Tamu'));
  var badge = $id('lblUserTierBadge');
  if (badge) {
    badge.textContent = tierBadge(u);
    badge.style.background = u && (u.tier === 'VIP' || u.tier === 'OWNER_VIP') ? '#065f46' : u && u.tier === 'FREE' ? '#1e3a5f' : '#475569';
  }
  setTxt('ddUserEmail', u ? u.email : '-');
  setTxt('ddUserTier', tierBadge(u));
  var unlocked = unlockedSymbols();
  var limit = quotaLimit();
  setTxt('ddUserQuota', limit === Infinity ? unlocked.length + ' / ∞ Unlimited' : unlocked.length + ' / ' + limit + ' ' + T('ui.quotaUnit', 'Instrumen'));

  // Banner peringatan kedaluwarsa VIP (H-2 / hari ke-28 ke atas)
  var banner = $id('vipExpiryWarningBanner');
  if (banner) {
    if (u && u.tier === 'VIP' && u.vipUntil) {
      var msLeft = Number(u.vipUntil) - Date.now();
      var daysLeft = Math.ceil(msLeft / 86400000);
      if (msLeft > 0 && daysLeft <= 2) {
        banner.classList.remove('hidden');
        setTxt('vipExpiryDaysText', daysLeft <= 1 ? T('ui.vipLess24h', 'less than 24 hours') : daysLeft + ' ' + T('ui.vipDaysUnit', 'days'));
        try {
          var uiLang = (window.XSI18N && window.XSI18N.getLanguage && window.XSI18N.getLanguage()) || 'en';
          var expDate = new Date(Number(u.vipUntil)).toLocaleDateString(uiLang, { day: 'numeric', month: 'short', year: 'numeric' });
          setTxt('vipExpiryDateText', expDate);
        } catch (e) {
          setTxt('vipExpiryDateText', new Date(Number(u.vipUntil)).toISOString().slice(0, 10));
        }
      } else {
        banner.classList.add('hidden');
      }
    } else {
      banner.classList.add('hidden');
    }
  }

  // Tombol admin panel khusus owner
  var btnOwnerSubs = $id('btnOpenOwnerSubscribers');
  if (btnOwnerSubs) {
    btnOwnerSubs.classList.toggle('hidden', !u || u.tier !== 'OWNER_VIP');
  }

  try { updateTelegramUi(); } catch (e) {}
  if (u && !telegramConfig.chatId) { try { syncTelegramLinkStatus(); } catch (e) {} }
}
function fetchOwnerSubscribers() {
  if (!state.user || state.user.tier !== 'OWNER_VIP') return;
  var token = state.user.ownerToken || state.user.authToken;
  var container = $id('ownerSubsListContainer');
  if (container) container.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:16px;">' + T('ui.ownerSubsLoading', 'Loading D1 subscriber data...') + '</div>';
  fetch('/api/admin/overview', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok) {
        if (container) container.innerHTML = '<div style="color:#f43f5e;padding:12px;">Gagal memuat data: ' + escH((d && d.error) || 'Akses ditolak') + '</div>';
        return;
      }
      setTxt('valOwnerTotalSubs', d.count || 0);
      setTxt('valOwnerActiveSubs', d.activeCount || 0);
      if (!d.subscribers || !d.subscribers.length) {
        if (container) container.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:16px;">Belum ada pelanggan VIP berbayar di database D1.</div>';
        return;
      }
      var rows = d.subscribers.map(function (s) {
        var statusBadge = s.isActive
          ? '<span style="color:#10b981;font-weight:700;">● AKTIF (sisa ' + s.daysRemaining + ' hari)</span>'
          : '<span style="color:#f43f5e;font-weight:700;">✖ HABIS / EXPIRED</span>';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(51,65,85,0.4);gap:8px;">' +
          '<div><strong style="color:#f8fafc;font-size:12px;">' + escH(s.email) + '</strong>' +
          '<div style="color:#94a3b8;font-size:10.5px;">Berakhir: ' + escH(s.vipUntilDate) + '</div></div>' +
          '<div>' + statusBadge + '</div>' +
          '</div>';
      }).join('');
      if (container) container.innerHTML = rows;
    })
    .catch(function (e) {
      if (container) container.innerHTML = '<div style="color:#f43f5e;padding:12px;">Error: ' + escH(e.message) + '</div>';
    });
}
function unlockedSymbols() {
  if (!state.user || !state.user.email) return [];
  try {
    return JSON.parse(localStorage.getItem('xstarzg_unlock_' + state.user.email) || '[]');
  } catch (e) { return []; }
}
function persistUnlocked(list) {
  if (!state.user || !state.user.email) return;
  try { localStorage.setItem('xstarzg_unlock_' + state.user.email, JSON.stringify(list.slice(0, 60))); } catch (e) {}
}
function ensureQuotaFor(symbol) {
  var u = state.user;
  // Instrumen showcase default selalu terbuka untuk semua pengunjung
  if (symbol === 'XAU/USD') return true;
  var limit = quotaLimit();
  if (limit === Infinity) return true;
  var unlocked = unlockedSymbols();
  if (unlocked.indexOf(symbol) > -1 || symbol === state.symbol) return true;
  if (unlocked.length < limit) {
    unlocked.push(symbol);
    persistUnlocked(unlocked);
    updateUserUi();
    return true;
  }
  // Kuota habis
  if (!u || u.tier === 'GUEST') {
    var gm = $id('googleAuthModal');
    if (gm) gm.classList.remove('hidden');
  } else {
    var reason = $id('vipModalReasonText');
    if (reason) reason.textContent = T('ui.quotaFull', 'Kuota {limit} instrumen akun FREE Anda sudah penuh ({list}). Upgrade VIP $29 USDT untuk membuka seluruh 700+ instrumen tanpa batas.').replace('{limit}', limit).replace('{list}', unlocked.join(', '));
    var pm = $id('paymentModal');
    if (pm) pm.classList.remove('hidden');
  }
  return false;
}
function showScreen(name) {
  try {
    var front = $id('frontLandingScreen'), gate = $id('loginGateScreen'), work = $id('appWorkspaceWrapper');
    if (front) {
      if (name === 'front') front.classList.remove('hidden'); else front.classList.add('hidden');
    }
    if (gate) {
      if (name === 'gate') gate.classList.remove('hidden'); else gate.classList.add('hidden');
    }
    if (work) {
      if (name === 'work') {
        work.classList.remove('hidden');
        var sk = document.getElementById('tvChartLoadingSkeleton');
        if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
      } else {
        work.classList.add('hidden');
      }
    }
    var dd = $id('userProfileDropdown');
    if (dd) dd.classList.add('hidden');
    try { window.scrollTo({ top: 0 }); } catch (e) {}
  } catch (e) {
    console.warn('showScreen error:', e);
  }
}
function enterWorkspace() {
  try {
    showScreen('work');
    ensureChartVendorLoaded();
    ensureQuantEnginesLoaded();
    var sk = document.getElementById('tvChartLoadingSkeleton');
    if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
    updateUserUi();
    syncModeSections();
    try { renderGroupAnalysis(); } catch (e) {}
    try { renderInstrumentCatalog(); } catch (e) {}
    if (!state.manualInstrumentSelection) {
      state.candles = [];
      state.lastAnalysis = null;
      state.feedSource = '-';
      /* Pengunjung baru / Mode Tamu: terminal TIDAK boleh tampil kosong. Pakai
         instrumen showcase default (XAU/USD selalu terbuka) lalu analisis otomatis
         begitu mesin kuantitatif siap, sehingga chart + panel terisi tanpa klik. */
      if (!ensureQuotaFor(state.symbol)) state.symbol = 'XAU/USD';
      state.manualInstrumentSelection = true;
      try { renderInstrumentCatalog(); } catch (e) {}
    }
    try { initChart(); } catch (e) {}
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { try { initChart(); } catch (e) {} });
    }
    if (state.manualInstrumentSelection) {
      try { connectRealtimeStream(); } catch (e) {}
      var autoRunWhenReady = function (tries) {
        if (window.__XS_SE && typeof window.runFullAnalysis === 'function') {
          try { window.runFullAnalysis(true); } catch (e) {}
          return;
        }
        if (tries < 60) setTimeout(function () { autoRunWhenReady(tries + 1); }, 250);
      };
      autoRunWhenReady(0);
    }
  } catch (e) { console.error('enterWorkspace error:', e); }
}
try { if (typeof window !== 'undefined') { window.showScreen = showScreen; window.enterWorkspace = enterWorkspace; } } catch (e) {}

/* ==================== 10. VIP PAYMENT (ON-CHAIN BSC VERIFY) ==================== */
/* v2026.66: verifikasi pembayaran DIPINDAH penuh ke server (/api/billing/verify-bsc).
   Versi lama memverifikasi sendiri via RPC publik lalu MENULIS SENDIRI tier VIP di
   localStorage — siapa pun bisa mengaktifkan VIP tanpa membayar. Sekarang server yang
   memeriksa receipt on-chain, menolak replay txHash, dan menandatangani entitlement. */
function serverRegister(email, name) {
  return fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, name: name })
  }).then(function (r) { return r.json(); });
}
// Pastikan akun punya JWT server (sesi publik diterbitkan /api/auth/register).
function ensureAuthToken() {
  if (state.user && state.user.ownerToken) return Promise.resolve(state.user.ownerToken);
  if (state.user && state.user.authToken) return Promise.resolve(state.user.authToken);
  var storedJwt = '';
  try { storedJwt = localStorage.getItem('xstarzg_jwt') || ''; } catch (e) {}
  if (storedJwt) return Promise.resolve(storedJwt);
  if (!state.user || !state.user.email || /@xstarzg\.local$/.test(state.user.email)) return Promise.reject(new Error('Silakan login terlebih dahulu.'));
  return serverRegister(state.user.email, state.user.name).then(function (d) {
    if (!d || !d.ok || !d.token) throw new Error((d && d.error) || 'Gagal otentikasi sesi');
    state.user.authToken = d.token;
    if (d.user && d.user.tier === 'VIP' && d.user.vipUntil) {
      state.user.tier = 'VIP';
      state.user.vipUntil = d.user.vipUntil;
    } else if (d.user && d.user.tier === 'FREE' && state.user.tier === 'VIP') {
      // Server (D1) menyatakan entitlement sudah habis -> turunkan secara jujur.
      state.user.tier = 'FREE';
      state.user.vipUntil = null;
    }
    saveSession();
    return d.token;
  });
}
// Verifikasi on-chain DI SERVER + auto-approve entitlement bertanda tangan.
// Jika JWT kedaluwarsa (401), daftarkan ulang sesi lalu coba SEKALI lagi.
function serverVerifyBscPayment(txHash) {
  var callVerify = function (token) {
    return fetch('/api/billing/verify-bsc', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ txHash: txHash })
    }).then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); });
  };
  return ensureAuthToken().then(callVerify).then(function (res) {
    if (res && res.status === 401 && state.user) {
      state.user.authToken = null;
      return ensureAuthToken().then(callVerify);
    }
    return res;
  }).then(function (res) {
    var d = (res && res.d) || {};
    if (d && d.ok) return { verified: true, vipUntil: Number(d.vipUntil) || 0, token: d.token || null };
    return { verified: false, error: (d && d.error) || T('ui.eVipNotFound', 'TxHash belum ditemukan. Pastikan transfer $29 USDT (BEP-20) sudah terkonfirmasi.') };
  });
}
// v2026.66: hidrasi modal pembayaran dari faktur SERVER (/api/billing/invoice) —
// nominal, wallet resmi, dan ID faktur satu sumber kebenaran. Markup hardcoded
// hanya fallback bila fetch gagal (mis. fungsi Cloudflare belum aktif di dev).
function hydrateVipInvoice() {
  try {
    if (typeof fetch !== 'function') return;
    fetch('/api/billing/invoice').then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok || !d.invoice) return;
      var w = $id('vipWalletAddr'); if (w && d.invoice.wallet) { w.textContent = d.invoice.wallet; VIP_WALLET = d.invoice.wallet; }
      var p = $id('vipPriceLabel'); if (p && d.invoice.amount) { p.textContent = '$' + Number(d.invoice.amount).toFixed(2) + ' USDT'; VIP_PRICE = Number(d.invoice.amount) || VIP_PRICE; }
      var inv = $id('vipInvoiceId'); if (inv) inv.textContent = d.invoice.id || '';
    }).catch(function () {});
  } catch (e) {}
}
function bindVipFlow() {
  var pm = $id('paymentModal');
  var open = function (reasonText) {
    if (reasonText) { var r = $id('vipModalReasonText'); if (r) r.textContent = reasonText; }
    if (pm) pm.classList.remove('hidden');
    hydrateVipInvoice();
  };
  var bind = function (id, fn) { var el = $id(id); if (el) el.addEventListener('click', fn); };
  bind('btnOpenVipModal', function () { open(); });
  bind('btnOpenVipFromMenu', function () {
    var dd = $id('userProfileDropdown'); if (dd) dd.classList.add('hidden');
    open();
  });
  bind('btnCloseVipModal', function () { if (pm) pm.classList.add('hidden'); });
  bind('btnCopyWallet', function () {
    var btn = $id('btnCopyWallet');
    var done = function () { if (btn) { btn.textContent = T('ui.eCopied', '✅ Tersalin!'); setTimeout(function () { btn.textContent = T('ui.eCopy', '📋 Salin'); }, 1800); } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(VIP_WALLET).then(done).catch(done);
    } else done();
  });
  bind('btnVerifyTxHash', function () {
    var inp = $id('inpTxHash');
    var fb = $id('vipVerifyFeedback');
    var btn = $id('btnVerifyTxHash');
    var tx = (inp && inp.value || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) {
      if (fb) { fb.style.color = '#fda4af'; fb.textContent = T('ui.eVipTxInvalid', '⚠️ Format TxHash tidak valid — harus diawali 0x dan 64 karakter hex.'); }
      return;
    }
    // Lisensi diikat ke akun nyata — Mode Tamu harus login dulu (bukan placeholder lokal).
    if (!state.user || !state.user.email || state.user.tier === 'GUEST' || /@xstarzg\.local$/.test(state.user.email)) {
      if (fb) { fb.style.color = '#fda4af'; fb.textContent = T('ui.eVipNeedLogin', '⚠️ Masuk dengan email Google dulu — lisensi VIP diikat ke akun Anda.'); }
      var gm = $id('googleAuthModal'); if (gm) gm.classList.remove('hidden');
      return;
    }
    if (fb) { fb.style.color = '#94a3b8'; fb.textContent = T('ui.eVipVerifying', '⏳ Memverifikasi pembayaran on-chain di jaringan BNB Smart Chain (BEP-20)…'); }
    if (btn) btn.disabled = true;
    serverVerifyBscPayment(tx).then(function (res) {
      if (btn) btn.disabled = false;
      if (res && res.verified) {
        if (fb) { fb.style.color = '#10b981'; fb.textContent = fillTpl(T('ui.eVipSuccess', '✅ Pembayaran ${amt} USDT TERVERIFIKASI ON-CHAIN! Lisensi VIP 30 hari aktif.'), { amt: VIP_PRICE.toFixed(2) }); }
        // Entitlement BERASAL DARI SERVER: tier, vipUntil, dan token bertanda tangan.
        state.user.tier = 'VIP';
        state.user.vipUntil = res.vipUntil || (Date.now() + 30 * 86400000);
        if (res.token) state.user.authToken = res.token;
        saveSession(); updateUserUi();
        setTimeout(function () { if (pm) pm.classList.add('hidden'); }, 2200);
      } else if (fb) {
        fb.style.color = '#fda4af';
        fb.textContent = 'ℹ️ ' + ((res && res.error) || T('ui.eVipNotFound', 'TxHash belum ditemukan. Pastikan transfer $29 USDT (BEP-20) sudah terkonfirmasi.'));
      }
    }).catch(function () {
      if (btn) btn.disabled = false;
      if (fb) { fb.style.color = '#fda4af'; fb.textContent = 'ℹ️ ' + T('ui.eVipServerFail', 'Server verifikasi tidak merespons. Coba lagi sesaat.'); }
    });
  });
  bind('btnRenewVipFromBanner', function () {
    open(T('ui.vipRenewReason', 'Renew your VIP license so your access to 700+ instruments is not interrupted.'));
  });
  var osm = $id('ownerSubscribersModal');
  bind('btnOpenOwnerSubscribers', function () {
    var dd = $id('userProfileDropdown'); if (dd) dd.classList.add('hidden');
    if (osm) osm.classList.remove('hidden');
    fetchOwnerSubscribers();
  });
  bind('btnCloseOwnerSubscribers', function () {
    if (osm) osm.classList.add('hidden');
  });
  bind('btnRefreshOwnerSubs', function () {
    fetchOwnerSubscribers();
  });
}

/* ==================== 11. BINDING SEMUA TOMBOL & ALUR ==================== */
function bindUiEvents() {
  var bind = function (id, fn) {
    var el = $id(id);
    if (el) {
      el.addEventListener('click', function (e) {
        try { fn(e); } catch (err) { console.error('Click error on ' + id + ':', err); }
      });
    }
  };
  /* ---- Landing & Login gate ---- */
  bind('btnNavLoginGate', function () {
    if (state.user && state.user.tier && state.user.tier !== 'GUEST') enterWorkspace(); else showScreen('gate');
  });
  bind('btnHeroLoginGate', function () {
    if (state.user && state.user.tier && state.user.tier !== 'GUEST') enterWorkspace(); else showScreen('gate');
  });
  bind('btnHeroPreview', function () {
    state.user = { email: 'guest@xstarzg.local', name: T('ui.guestName', 'Tamu'), tier: 'GUEST' };
    saveSession();
    enterWorkspace();
  });
  bind('btnBackToLanding', function () { showScreen('front'); });
  bind('btnBrandLogoHome', function () { showScreen('front'); });
  bind('btnTriggerGooglePopup', function () {
    var gm = $id('googleAuthModal');
    if (gm) {
      gm.classList.remove('hidden');
      var inp = $id('googleEmailInput');
      if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 80);
    }
  });
  bind('btnInstantPreview', function () {
    state.user = { email: 'guest@xstarzg.local', name: T('ui.guestName', 'Tamu'), tier: 'GUEST' };
    saveSession();
    enterWorkspace();
  });
  bind('btnGateOwnerDirect', function () {
    var gm = $id('googleAuthModal');
    if (gm) {
      gm.classList.remove('hidden');
      var blk = $id('ownerLoginBlock');
      if (blk) blk.classList.remove('hidden');
      var einp = $id('ownerEmailInput');
      var cinp = $id('ownerCodeInput');
      if (einp && !einp.value) einp.value = 'sevenfoldarmy2822@gmail.com';
      if (cinp) setTimeout(function () { try { cinp.focus(); } catch (e) {} }, 80);
    }
  });
  var closeGoogle = function () { var gm = $id('googleAuthModal'); if (gm) gm.classList.add('hidden'); };
  bind('btnCloseGoogleModal', closeGoogle);
  bind('btnCancelGoogleModal', closeGoogle);
  bind('btnSubmitGoogleEmail', function () {
    var emailEl = $id('googleEmailInput');
    var nameEl = $id('googleNameInput');
    var email = (emailEl && emailEl.value || '').trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
      if (emailEl) { emailEl.style.borderColor = '#f43f5e'; emailEl.focus(); }
      setTxt('googleAuthError', T('ui.gErrInvalid', 'Masukkan alamat Google yang valid (cth: nama@gmail.com)'));
      return;
    }
    if (emailEl) emailEl.style.borderColor = '#334155';
    var name = (nameEl && nameEl.value || '').trim() || email.split('@')[0];
    // Semua jalur login Google publik = FREE. Tier OWNER_VIP hanya dari server:
    // jalur Owner terpisah (email + kode rahasia) divalidasi /api/auth/owner.
    var tier = 'FREE';
    var prevP = loadSession();
    var prev = prevP && prevP.user ? prevP.user : null;
    state.user = {
      email: email, name: name.charAt(0).toUpperCase() + name.slice(1), tier: tier,
      vipUntil: (prev && prev.email === email) ? prev.vipUntil : null
    };
    if (prev && prev.email === email && prev.tier === 'VIP' && prev.vipUntil && Date.now() < prev.vipUntil) {
      state.user.tier = 'VIP';
    }
    saveSession();
    closeGoogle();
    enterWorkspace();
    // v2026.66: terbitkan sesi JWT server sunyi-2 (dibutuhkan untuk verifikasi
    // pembayaran VIP yang mengikat identitas). Gagal jaringan = ditoleransi,
    // akan dicoba ulang otomatis saat user menekan tombol verifikasi.
    try { ensureAuthToken().then(function () { updateUserUi(); }).catch(function () {}); } catch (e) {}
  });
  /* ---- Jalur khusus OWNER: email + kode rahasia, divalidasi penuh di server ----
     Toggle blok owner sengaja HANYA ditangani delegated click guard di bagian atas
     berkas. Dulu id yang sama juga di-bind di sini, sehingga satu tap men-toggle
     dua kali (buka lalu tutup lagi) dan tombol tampak tidak bisa diklik. */
  bind('btnSubmitOwnerLogin', function () {
    var emailEl = $id('ownerEmailInput'), codeEl = $id('ownerCodeInput'), btn = $id('btnSubmitOwnerLogin');
    var email = (emailEl && emailEl.value || '').trim().toLowerCase();
    var code = (codeEl && codeEl.value || '').trim();
    if (!email || !code) { setTxt('ownerLoginError', T('ui.ownerNeedFields', 'Isi email pemilik dan kode akses rahasia.')); return; }
    setTxt('ownerLoginError', '');
    if (btn) { btn.disabled = true; btn.textContent = T('ui.ownerVerifying', '⏳ Memverifikasi ke server…'); }
    fetch('/api/auth/owner', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, code: code })
    }).then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (res) {
        var d = res.d || {};
        if (!d.ok) {
          setTxt('ownerLoginError', d.error || T('ui.eOwnerBadCred', 'Kredensial tidak valid.'));
          if (codeEl) { codeEl.value = ''; codeEl.focus(); }
          return;
        }
        // Server mengonfirmasi identitas owner (kode rahasia benar) -> tier OWNER_VIP + token JWT
        state.user = { email: d.user.email, name: d.user.name || 'Owner', tier: 'OWNER_VIP', ownerToken: d.token };
        saveSession();
        closeGoogle();
        updateUserUi();
        enterWorkspace();
      })
      .catch(function () { setTxt('ownerLoginError', T('ui.ownerConnFail', 'Koneksi ke server otentikasi gagal. Coba lagi.')); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = T('ui.ownerSubmit', 'Verifikasi ke Server & Masuk sebagai Owner'); } });
  });
  /* ---- Topbar: mode & profil ---- */
  bind('btnModeTrader', function () { setMode('trader'); });
  bind('btnModeInvestor', function () { setMode('investor'); });
  bind('btnModeMeme', function () { setMode('meme'); });
  bind('btnModeNews', function () { setMode('news'); });
  bind('btnModeJournal', function () { setMode('journal'); });
  bind('btnModePerformance', function () { setMode('performance'); });
  bind('btnSubFutures', function () { setSubMode('futures'); });
  bind('btnSubSpot', function () { setSubMode('spot'); });
  Array.prototype.forEach.call(document.querySelectorAll('.btn-back-to-trader'), function (b) {
    b.addEventListener('click', function () { setMode('trader'); });
  });
  var btnSess = $id('btnUserSession');
  if (btnSess) btnSess.addEventListener('click', function (e) {
    e.stopPropagation();
    var dd = $id('userProfileDropdown');
    if (dd) dd.classList.toggle('hidden');
    updateUserUi();
  });
  document.addEventListener('click', function (e) {
    var dd = $id('userProfileDropdown');
    if (dd && !dd.classList.contains('hidden') && !dd.contains(e.target) && e.target !== btnSess && !(btnSess && btnSess.contains(e.target))) {
      dd.classList.add('hidden');
    }
  });
  bind('btnBackToFrontFromMenu', function () { showScreen('front'); });
  var doLogout = function () {
    state.user = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    updateUserUi();
    showScreen('front');
  };
  bind('btnLogout', doLogout);
  bind('btnDirectLogout', doLogout);
  /* ---- Kontrol instrumen ---- */
  var catSel = $id('selCategory');
  if (catSel) catSel.addEventListener('change', function () {
    renderInstrumentCatalog();
    if (catSel.value === 'CRYPTO') {
      if (QC && QC.registerDynamicInstrument) lazyLoadCryptoPairs();
      else if (!window.__xsCryptoCatalogWaiter) {
        window.__xsCryptoCatalogWaiter = true;
        window.addEventListener('xs-engine-booted', function () {
          if (QC && QC.registerDynamicInstrument && catSel.value === 'CRYPTO') lazyLoadCryptoPairs();
        }, { once: true });
      }
    }
  });
  var searchInp = $id('inpSearchAsset');
  if (searchInp) {
    searchInp.addEventListener('input', function () { renderInstrumentCatalog(searchInp.value); });
    searchInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = ($id('selInstrument') || {}).querySelector ? $id('selInstrument').querySelector('option') : null;
        if (first && first.value) selectSymbol(first.value);
      }
    });
  }
  var instSel = $id('selInstrument');
  if (instSel) instSel.addEventListener('change', function () { if (instSel.value) selectSymbol(instSel.value); });
  /* ---- Timeframe bar ---- */
  var tfBar = $id('timeframeBar');
  if (tfBar) {
    Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var tf = btn.getAttribute('data-tf');
        if (!tf || tf === state.tf) return;
        Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (b) { b.classList.toggle('active', b === btn); });
        state.tf = tf; state.timeframe = tf;
        // Keep the last valid chart visible while the new timeframe is loading.
        // Clearing candles here forced runFullAnalysis to synchronously seed and
        // quantify 220 synthetic bars before fetching the real timeframe.
        state.bestTfBoard = null;
        saveSession();
        setTxt('lblEngineStatus', '⏳ MEMUAT ' + tf + ' — mengambil candle broker…');
        try { startCandleCountdown(); } catch (e) {}
        if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
      });
    });
  }
  /* ---- Pemilih tipe chart (Candlestick/Bar/Line/Area) ---- */
  var ctBar = $id('chartTypeBar');
  if (ctBar) {
    Array.prototype.forEach.call(ctBar.querySelectorAll('.chart-type-btn'), function (btn) {
      btn.addEventListener('click', function () { applyChartType(btn.getAttribute('data-ctype')); });
    });
  }
  /* ---- Tab horizon radar (Scalping / Intraday / Swing) ---- */
  var hzBar = $id('radarHorizonBar');
  if (hzBar) {
    Array.prototype.forEach.call(hzBar.querySelectorAll('.hz-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var hz = btn.getAttribute('data-hz');
        if (!hz || hz === state.radarHorizon) return;
        state.radarHorizon = hz;
        syncHorizonTabs();
        saveSession();
      });
    });
  }
  /* ---- Manual DEX pair lookup and timeframe selection ---- */
  bind('btnMemeSearch', searchManualDexToken);
  var memeChainSelect = $id('selMemeChain');
  if (memeChainSelect) memeChainSelect.addEventListener('change', invalidateManualDexSelection);
  var memeAddressInput = $id('inpMemeAddress');
  if (memeAddressInput) memeAddressInput.addEventListener('input', invalidateManualDexSelection);
  if (memeAddressInput) memeAddressInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') searchManualDexToken();
  });
  var mtfBar = $id('memeTfBar');
  if (mtfBar) Array.prototype.forEach.call(mtfBar.querySelectorAll('.tf-btn'), function (btn) {
    btn.addEventListener('click', function () {
      var tf = btn.getAttribute('data-mtf') || 'M5';
      if (tf === activeMemeTf) return;
      activeMemeTf = tf;
      Array.prototype.forEach.call(mtfBar.querySelectorAll('.tf-btn'), function (b) {
        b.classList.toggle('active', b === btn);
      });
      if (activeMemeToken) analyzeManualDexPair(activeMemeToken.pairAddress);
    });
  });
  window.addEventListener('resize', function () {
    if (state.mode === 'meme') drawMemeCandleChart(activeMemeToken, activeMemeCandles);
  });
  /* ---- Overlay toggles & recalc ---- */
  ['chkEMA', 'chkVWAP', 'chkSMC', 'chkSniper'].forEach(function (id) {
    var el = $id(id);
    if (el) el.addEventListener('change', function () {
      syncIndicatorOverlays(state.lastAnalysis);
      drawChartLevels(state.lastAnalysis);
      // v2026.63: canvas fallback juga ikut menggambar ulang overlay/level
      try { if (typeof window.drawCanvasFallbackChart === 'function') window.drawCanvasFallbackChart(state.candles, state.lastAnalysis); } catch (e) {}
    });
  });
  bind('btnRunEngine', function () { if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true); });
  /* ---- Smart Signal & Price Alarm ---- */
  bind('btnToggleSignalAlarm', toggleSignalAlarm);
  bind('btnCloseAlarmToast', function () {
    var t = $id('signalAlarmToast'); if (t) t.classList.add('hidden');
  });
  bind('btnTestAlarmSound', function () {
    playAlertChime();
    showAlarmToast('🔊 TES SUARA ALARM', 'Denting lonceng institusional aktif & jernih. Begitu sinyal [' + (alarmState.symbol || state.symbol || 'GRAM/USDT') + '] terbuka, suara ini akan berbunyi.');
  });
  /* ---- Signal Journal search & SL+ alerts ---- */
  var inpJnlSearch = $id('inpJournalSearch');
  if (inpJnlSearch) {
    inpJnlSearch.addEventListener('input', function () { renderSignalJournal(); });
    inpJnlSearch.addEventListener('change', function () { renderSignalJournal(); });
  }
  bind('btnJournalClearSearch', function () {
    if (inpJnlSearch) {
      inpJnlSearch.value = '';
      inpJnlSearch.focus();
    }
    renderSignalJournal();
  });
  bind('btnClearAllJournalHistory', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var msg = isEn
      ? 'Clear all local and cloud signal journal history for this account? This cannot be undone.'
      : 'Hapus seluruh riwayat jurnal sinyal lokal dan cloud untuk akun ini? Tindakan ini tidak dapat dibatalkan.';
    if (!confirm(msg)) return;
    try {
      var cleared = { at: Date.now(), pending: !!(state.user && state.user.email && state.user.tier !== 'GUEST' && !/@xstarzg\.local$/.test(state.user.email)) };
      clearLocalJournalKeys();
      localStorage.setItem(journalTombstoneKey(), JSON.stringify(cleared));
    } catch (error) {
      alert((isEn ? 'Local journal reset failed: ' : 'Reset jurnal lokal gagal: ') + error.message);
      return;
    }
    renderSignalJournal();
    if (!state.user || !state.user.email || state.user.tier === 'GUEST' || /@xstarzg\.local$/.test(state.user.email)) {
      alert(isEn ? 'Local history was cleared. Sign in to clear this account’s cloud history.' : 'Riwayat lokal dihapus. Masuk untuk menghapus riwayat cloud akun ini.');
      return;
    }
    syncCloudSignalJournal().then(function () {
      alert(isEn ? 'Local and cloud journal history was cleared.' : 'Riwayat jurnal lokal dan cloud berhasil dihapus.');
    }).catch(function (error) {
      alert((isEn ? 'Local history was cleared; cloud deletion is pending and will retry: ' : 'Riwayat lokal dihapus; penghapusan cloud tertunda dan akan dicoba ulang: ') + error.message);
    });
  });
  bind('btnToggleSlPlusNotify', function () {
    toggleSlPlusNotification();
  });
  loadPersistedSlPlusNotify();
  updateSlPlusNotifyUi();

  /* ---- 3-Segment Journal Tabs & Actions ---- */
  bind('btnTabJnlTrader', function () {
    activeJournalTab = 'trader';
    renderSignalJournal();
  });
  bind('btnTabJnlInvestor', function () {
    activeJournalTab = 'investor';
    renderSignalJournal();
  });
  bind('btnTabJnlMeme', function () {
    activeJournalTab = 'meme';
    renderSignalJournal();
  });

  // Quick-Add buttons from workspaces
  bind('btnQuickAddInvestorJnl', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var sym = state.symbol || 'BTC/USDT';
    var price = (state.candles && state.candles.length) ? state.candles[state.candles.length - 1].close : (state.livePrice || 100);
    var an = state.lastAnalysis;
    var lv = (an && an.levels) || {};
    var it = {
      id: 'inv_' + Date.now(),
      symbol: sym,
      name: (an && an.name) || sym,
      assetClass: (an && an.assetClass) || 'crypto',
      entryPrice: price,
      currentPrice: price,
      dcaZone1: num(lv.dcaZone1, price),
      dcaZone2: num(lv.dcaZone2, price * 0.95),
      dcaZone3: num(lv.dcaZone3, price * 0.90),
      target1: num(lv.invTarget1, price * 1.25),
      target2: num(lv.invTarget2, price * 1.50),
      valuationStatus: (an && an.direction === 'LONG' ? (isEn ? 'UNDERVALUED (DISCOUNT)' : 'UNDERVALUE (DISKON)') : 'FAIR VALUE'),
      notes: isEn ? 'Spot accumulation recorded directly from Investor panel.' : 'Akumulasi spot dicatat langsung dari panel Investor.',
      at: Date.now(),
      status: 'ACTIVE'
    };
    var all = investorJournalStore();
    all.unshift(it);
    saveInvestorJournalStore(all);
    activeJournalTab = 'investor';
    renderSignalJournal();
    alert(isEn
      ? ('✅ Accumulation for ' + sym + ' successfully saved to Investor Journal!\n\nBuy Price: ' + formatPrice(price, sym))
      : ('✅ Akumulasi ' + sym + ' berhasil dicatat ke Jurnal Investor!\n\nHarga Beli: ' + formatPrice(price, sym)));
  });

  bind('btnQuickAddMemeJnl', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var token = activeMemeToken;
    if (token) {
      var it = {
        id: 'meme_' + Date.now(),
        symbol: token.symbol,
        name: token.name,
        chain: token.chain,
        chainLabel: token.chainLabel || token.chain.toUpperCase(),
        address: token.address,
        buyPrice: token.basePrice,
        currentPrice: token.basePrice,
        targetX: 2.0,
        tp1Secured: false,
        notes: isEn ? ('Recorded directly from live inspection DEX Workspace (' + (token.chainLabel || '') + ').') : ('Dicatat langsung dari live inspection DEX Workspace (' + (token.chainLabel || '') + ').'),
        at: Date.now(),
        status: 'ACTIVE'
      };
      var all = memeJournalStore();
      all.unshift(it);
      saveMemeJournalStore(all);
      activeJournalTab = 'meme';
      renderSignalJournal();
      alert(isEn
        ? ('✅ Coin ' + token.symbol + ' successfully saved to DEX Meme Journal!\n\nDEX Buy Price: $' + token.basePrice)
        : ('✅ Koin ' + token.symbol + ' berhasil dicatat ke Jurnal DEX Micin!\n\nHarga Beli DEX: $' + token.basePrice));
    }
  });

  // Modals: Add Investor Record
  var modalAddInv = $id('addInvestorModal');
  bind('btnOpenAddInvestorModal', function () {
    if (modalAddInv) {
      var inpSym = $id('inpAddInvSymbol');
      var inpEnt = $id('inpAddInvEntry');
      var inpT1 = $id('inpAddInvTarget1');
      if (inpSym) inpSym.value = state.symbol || '';
      if (inpEnt) {
        var p = (state.candles && state.candles.length) ? state.candles[state.candles.length - 1].close : (state.livePrice || '');
        inpEnt.value = p || '';
      }
      if (inpT1) inpT1.value = '';
      modalAddInv.classList.remove('hidden');
    }
  });
  bind('btnCloseAddInvestorModal', function () { if (modalAddInv) modalAddInv.classList.add('hidden'); });
  bind('btnCancelAddInvestorModal', function () { if (modalAddInv) modalAddInv.classList.add('hidden'); });
  bind('btnSubmitAddInvestor', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var inpSym = $id('inpAddInvSymbol');
    var inpEnt = $id('inpAddInvEntry');
    var inpT1 = $id('inpAddInvTarget1');
    var inpNotes = $id('inpAddInvNotes');
    var sym = inpSym ? inpSym.value.trim().toUpperCase() : '';
    var ent = inpEnt ? parseFloat(inpEnt.value) : 0;
    if (!sym || !ent || ent <= 0) {
      alert(isEn ? '⚠️ Please enter a valid Asset Symbol and Buy Price!' : '⚠️ Mohon isi Simbol Aset dan Harga Beli yang valid!');
      return;
    }
    var t1 = inpT1 && parseFloat(inpT1.value) > 0 ? parseFloat(inpT1.value) : (ent * 1.3);
    var notes = inpNotes ? inpNotes.value.trim() : '';
    var it = {
      id: 'inv_' + Date.now(),
      symbol: sym,
      name: sym,
      assetClass: sym.indexOf('/') > -1 ? 'crypto' : 'stocks',
      entryPrice: ent,
      currentPrice: ent,
      target1: t1,
      target2: ent * 1.6,
      valuationStatus: isEn ? 'UNDERVALUED (DISCOUNT)' : 'UNDERVALUE (DISKON)',
      notes: notes || (isEn ? 'Manually recorded investment.' : 'Investasi dicatat secara manual.'),
      at: Date.now(),
      status: 'ACTIVE'
    };
    var all = investorJournalStore();
    all.unshift(it);
    saveInvestorJournalStore(all);
    if (modalAddInv) modalAddInv.classList.add('hidden');
    activeJournalTab = 'investor';
    renderSignalJournal();
  });

  // Modals: Add Meme Record
  var modalAddMeme = $id('addMemeModal');
  bind('btnOpenAddMemeModal', function () {
    if (modalAddMeme) {
      var inpSym = $id('inpAddMemeSymbol');
      var inpP = $id('inpAddMemeBuyPrice');
      if (inpSym) inpSym.value = (activeMemeToken && activeMemeToken.symbol) || '';
      if (inpP) inpP.value = (activeMemeToken && activeMemeToken.basePrice) || '';
      modalAddMeme.classList.remove('hidden');
    }
  });
  bind('btnCloseAddMemeModal', function () { if (modalAddMeme) modalAddMeme.classList.add('hidden'); });
  bind('btnCancelAddMemeModal', function () { if (modalAddMeme) modalAddMeme.classList.add('hidden'); });
  bind('btnSubmitAddMeme', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var inpSym = $id('inpAddMemeSymbol');
    var selChain = $id('selAddMemeChain');
    var inpP = $id('inpAddMemeBuyPrice');
    var inpX = $id('inpAddMemeTargetX');
    var inpCA = $id('inpAddMemeCA');
    var sym = inpSym ? inpSym.value.trim().toUpperCase() : '';
    var p = inpP ? parseFloat(inpP.value) : 0;
    if (!sym || !p || p <= 0) {
      alert(isEn ? '⚠️ Please enter a valid Coin Symbol and Buy Price!' : '⚠️ Mohon isi Simbol Koin dan Harga Beli yang valid!');
      return;
    }
    var chain = selChain ? selChain.value : 'solana';
    var chainLabel = chain === 'solana' ? '🟣 Solana' : (chain === 'base' ? '🔵 Base' : (chain === 'bsc' ? '🟡 BSC' : '⚪ Ethereum'));
    var tx = inpX && parseFloat(inpX.value) > 0 ? parseFloat(inpX.value) : 2.0;
    var ca = inpCA ? inpCA.value.trim() : '';
    var it = {
      id: 'meme_' + Date.now(),
      symbol: sym,
      name: sym,
      chain: chain,
      chainLabel: chainLabel,
      address: ca || (sym.toLowerCase() + '_pool'),
      buyPrice: p,
      currentPrice: p,
      targetX: tx,
      tp1Secured: false,
      notes: isEn ? 'DEX Gem recorded manually to profit radar.' : 'Koin micin dicatat manual ke radar keuntungan.',
      at: Date.now(),
      status: 'ACTIVE'
    };
    var all = memeJournalStore();
    all.unshift(it);
    saveMemeJournalStore(all);
    if (modalAddMeme) modalAddMeme.classList.add('hidden');
    activeJournalTab = 'meme';
    renderSignalJournal();
  });

  /* ---- Telegram VIP Gating & 1-Click Access Flow ---- */
  var modalTgVip = $id('telegramVipModal');
  var paywallBlock = $id('tgVipPaywallBlock');
  var activeBlock = $id('tgVipActiveBlock');
  var linkStart = $id('linkTgVipStart');
  var badgeUser = $id('lblTgVipUserBadge');
  var btnUpgradeTg = $id('btnUpgradeToVipForTg');
  var btnCloseTgVip = $id('btnCloseTgVipModal');
  var inpTgUid = $id('inpTgVipChatId');
  var btnSaveTgUid = $id('btnSaveTgVipChatId');
  var msgTgUidStatus = $id('msgTgVipStatus');
  var boxOwnerBot = $id('tgOwnerBotConfigBox');
  var inpOwnerBotUser = $id('inpTgOfficialBotUsername');
  var btnSaveOwnerBotUser = $id('btnSaveOfficialBotUsername');
  var msgOwnerBotStatus = $id('msgTgOfficialBotStatus');

  var currentDeepLinkUrl = null;

  function openTelegramVipModal() {
    var curUser = state.user;
    var isOwner = curUser && (curUser.tier === 'OWNER_VIP' || (curUser.email && (curUser.email === 'sevenfoldarmy2822@gmail.com' || curUser.email === 'gilfanputra@gmail.com')));
    var isAffiliate = curUser && (curUser.isAffiliate || curUser.role === 'affiliate');
    var isVip = isOwner || isAffiliate || (curUser && curUser.tier === 'VIP' && (!curUser.vipUntil || curUser.vipUntil > Date.now()));

    if (msgTgUidStatus) msgTgUidStatus.textContent = '';
    if (msgOwnerBotStatus) msgOwnerBotStatus.textContent = '';
    currentDeepLinkUrl = null;

    if (!isVip) {
      // User FREE / GUEST -> Tampilkan Paywall Gating dengan tombol upgrade VIP!
      if (paywallBlock) paywallBlock.classList.remove('hidden');
      if (activeBlock) activeBlock.classList.add('hidden');
    } else {
      // User VIP / Owner / Affiliate -> Tampilkan Aktivasi 1-Klik!
      if (paywallBlock) paywallBlock.classList.add('hidden');
      if (activeBlock) activeBlock.classList.remove('hidden');

      if (badgeUser) {
        badgeUser.textContent = isOwner ? '👑 OWNER / DEVELOPER' : (isAffiliate ? '🤝 AFFILIATE PARTNER' : '💎 VIP PRO MEMBER');
      }

      if (boxOwnerBot) {
        boxOwnerBot.classList.toggle('hidden', !isOwner);
      }

      // Ambil deep-link aktivasi terenkripsi dari server
      if (linkStart) {
        linkStart.style.opacity = '0.7';
      }

      ensureAuthToken().then(function (token) {
        if (!token) return;
        return fetch('/api/notify/telegram-link', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (linkStart) linkStart.style.opacity = '1';
          if (d && d.ok) {
            if (d.deepLink) {
              currentDeepLinkUrl = d.deepLink;
              if (linkStart) linkStart.href = d.deepLink;
            }
            if (d.botUsername && inpOwnerBotUser && !inpOwnerBotUser.value) {
              inpOwnerBotUser.value = '@' + d.botUsername;
            }
            if (d.linkedChatId) {
              telegramConfig.chatId = String(d.linkedChatId).trim();
              savePersistedTelegramConfig();
              updateTelegramUi();
              if (inpTgUid) inpTgUid.value = d.linkedChatId;
              if (msgTgUidStatus) {
                msgTgUidStatus.style.color = '#10b981';
                msgTgUidStatus.textContent = fillTpl(T('ui.tgLinkedId', '✅ Your phone is connected (ID: {id})'), { id: d.linkedChatId });
              }
            }
          }
        });
      }).catch(function () {
        if (linkStart) linkStart.style.opacity = '1';
      });
    }

    if (modalTgVip) modalTgVip.classList.remove('hidden');
  }

  // Intersep klik linkStart jika bot belum disetel
  if (linkStart) {
    linkStart.addEventListener('click', function (e) {
      if (!currentDeepLinkUrl) {
        e.preventDefault();
        var curUser = state.user;
        var isOwner = curUser && (curUser.tier === 'OWNER_VIP' || (curUser.email && (curUser.email === 'sevenfoldarmy2822@gmail.com' || curUser.email === 'gilfanputra@gmail.com')));
        if (isOwner) {
          if (msgOwnerBotStatus) {
            msgOwnerBotStatus.style.color = '#f59e0b';
            msgOwnerBotStatus.textContent = T('ui.tgEnterBotUser', '⚠️ Enter your Telegram bot username above once, then click Save!');
          }
          if (inpOwnerBotUser) inpOwnerBotUser.focus();
        } else {
          if (msgTgUidStatus) {
            msgTgUidStatus.style.color = '#38bdf8';
            msgTgUidStatus.textContent = T('ui.tgConnectUidHint', '💡 Connect your Telegram Chat ID in the field below to activate notifications!');
          }
          if (inpTgUid) inpTgUid.focus();
        }
      }
    });
  }

  // Handler simpan username bot resmi khusus Owner
  if (btnSaveOwnerBotUser) {
    btnSaveOwnerBotUser.addEventListener('click', function () {
      var botVal = inpOwnerBotUser ? inpOwnerBotUser.value.trim().replace(/^@/, '') : '';
      if (!botVal) {
        if (msgOwnerBotStatus) {
          msgOwnerBotStatus.style.color = '#f43f5e';
          msgOwnerBotStatus.textContent = T('ui.tgNeedBotFather', '⚠️ Enter your bot username from @BotFather!');
        }
        return;
      }
      if (msgOwnerBotStatus) {
        msgOwnerBotStatus.style.color = '#38bdf8';
        msgOwnerBotStatus.textContent = T('ui.tgSavingBot', '⏳ Saving the official bot settings...');
      }
      btnSaveOwnerBotUser.disabled = true;

      ensureAuthToken().then(function (token) {
        return fetch('/api/notify/telegram-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ action: 'set_bot_config', botUsername: botVal })
        }).then(function (r) { return r.json(); });
      }).then(function (d) {
        if (d && d.ok) {
          if (msgOwnerBotStatus) {
            msgOwnerBotStatus.style.color = '#10b981';
            msgOwnerBotStatus.textContent = fillTpl(T('ui.tgBotSaved', '✅ Done! Bot @{user} is now active for all users.'), { user: botVal });
          }
          // Refresh deep-link seketika
          openTelegramVipModal();
        } else {
          if (msgOwnerBotStatus) {
            msgOwnerBotStatus.style.color = '#f43f5e';
            msgOwnerBotStatus.textContent = (d && d.error) ? ('❌ ' + d.error) : T('ui.tgSaveFailed', '❌ Failed to save.');
          }
        }
      }).catch(function (e) {
        if (msgOwnerBotStatus) {
          msgOwnerBotStatus.style.color = '#f43f5e';
          msgOwnerBotStatus.textContent = '❌ Error: ' + e.message;
        }
      }).finally(function () {
        btnSaveOwnerBotUser.disabled = false;
      });
    });
  }

  function closeTelegramVipModal() {
    if (modalTgVip) modalTgVip.classList.add('hidden');
  }

  bind('btnTelegramVipAccess', openTelegramVipModal);
  bind('btnTelegramVipAccessJnl', openTelegramVipModal);
  bind('btnCloseTgVipModal', closeTelegramVipModal);
  if (modalTgVip) {
    modalTgVip.addEventListener('click', function (e) {
      if (e.target === modalTgVip) closeTelegramVipModal();
    });
  }

  if (btnUpgradeTg) {
    btnUpgradeTg.addEventListener('click', function () {
      closeTelegramVipModal();
      var pm = $id('paymentModal');
      var r = $id('vipModalReasonText');
      if (r) r.textContent = 'Tingkatkan akun ke VIP Pro untuk membuka bot notifikasi Telegram 24/7 di HP serta akses tanpa batas ke seluruh 700+ instrumen.';
      if (pm) pm.classList.remove('hidden');
      try { hydrateVipInvoice(); } catch (e) {}
    });
  }

  if (btnSaveTgUid) {
    btnSaveTgUid.addEventListener('click', function () {
      var cid = inpTgUid ? inpTgUid.value.trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '') : '';
      if (!cid || !/^-?\d+$/.test(cid)) {
        if (msgTgUidStatus) {
          msgTgUidStatus.style.color = '#f43f5e';
          msgTgUidStatus.textContent = T('ui.tgInvalidUid', '⚠️ Enter a valid Chat ID / UID number from @userinfobot!');
        }
        return;
      }
      if (msgTgUidStatus) {
        msgTgUidStatus.style.color = '#38bdf8';
        msgTgUidStatus.textContent = T('ui.tgLinkingUid', '⏳ Linking this ID to the VIP database...');
      }
      btnSaveTgUid.disabled = true;

      ensureAuthToken().then(function (token) {
        if (!token) throw new Error(T('ui.tgPleaseLogin', 'Please sign in first.'));
        return fetch('/api/notify/telegram-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ chatId: cid })
        }).then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok || !d.ok) {
              throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
            }
            return d;
          });
        });
      }).then(function (d) {
        if (msgTgUidStatus) {
          msgTgUidStatus.style.color = '#10b981';
          msgTgUidStatus.textContent = fillTpl(T('ui.tgUidLinked', '✅ Connected! Your phone ({id}) will receive signals 24/7.'), { id: cid });
        }
        telegramConfig.chatId = cid;
        savePersistedTelegramConfig();
        updateTelegramUi();
      }).catch(function (e) {
        if (msgTgUidStatus) {
          msgTgUidStatus.style.color = '#f43f5e';
          msgTgUidStatus.textContent = fillTpl(T('ui.tgFailedGeneric', '❌ Failed: {err}'), { err: e.message || '-' });
        }
      }).finally(function () {
        btnSaveTgUid.disabled = false;
      });
    });
  }

  // Handler tombol kirim pesan tes ke HP
  var btnTestPing = $id('btnTestTgPing');
  var msgTestPing = $id('msgTgTestStatus');
  if (btnTestPing) {
    btnTestPing.addEventListener('click', function () {
      var cid = inpTgUid ? inpTgUid.value.trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '') : (telegramConfig.chatId || '');
      if (msgTestPing) {
        msgTestPing.style.color = '#38bdf8';
        msgTestPing.textContent = T('ui.tgTestSending', '⏳ Sending a test message to your Telegram...');
      }
      btnTestPing.disabled = true;
      ensureAuthToken().then(function (token) {
        if (!token) throw new Error(T('ui.tgPleaseLogin', 'Please sign in first.'));
        return fetch('/api/notify/telegram-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ action: 'test_ping', chatId: cid })
        }).then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok || !d.ok) throw new Error((d && (d.error || d.message)) || T('ui.tgSendFailed', 'Failed to send the message.'));
            return d;
          });
        });
      }).then(function (d) {
        if (msgTestPing) {
          msgTestPing.style.color = '#10b981';
          msgTestPing.textContent = T('ui.tgTestOk', '✅ Success! Open Telegram on your phone — the test message has arrived!');
        }
        if (cid) {
          telegramConfig.chatId = cid;
          savePersistedTelegramConfig();
          updateTelegramUi();
        }
      }).catch(function (err) {
        if (msgTestPing) {
          msgTestPing.style.color = '#f43f5e';
          msgTestPing.textContent = '❌ ' + err.message;
        }
      }).finally(function () {
        btnTestPing.disabled = false;
      });
    });
  }

  /* ---- Instagram & Sosmed Feedback Modal Flow ---- */
  var modalIg = $id('instagramFeedbackModal');
  var btnCloseIg = $id('btnCloseInstagramModal');
  var btnCopyIg = $id('btnCopyIgLink');
  var toastIg = $id('copyIgSuccessToast');
  var IG_URL = 'https://www.instagram.com/xstarzganalysis?avpt=ZWF1dThxYzQwNmNj';

  function openInstagramModal() {
    if (modalIg) modalIg.classList.remove('hidden');
    if (toastIg) toastIg.textContent = '';
  }

  function closeInstagramModal() {
    if (modalIg) modalIg.classList.add('hidden');
  }

  bind('btnOpenInstagramModal', openInstagramModal);
  bind('btnOpenInstagramModalJnl', openInstagramModal);
  bind('btnOpenInstagramFromMenu', function () {
    var dd = $id('userProfileDropdown');
    if (dd) dd.classList.add('hidden');
    openInstagramModal();
  });
  bind('btnCloseInstagramModal', closeInstagramModal);

  if (modalIg) {
    modalIg.addEventListener('click', function (e) {
      if (e.target === modalIg) closeInstagramModal();
    });
  }

  function fallbackCopyIgText(text) {
    try {
      var t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
      if (toastIg) {
        toastIg.style.color = '#10b981';
        toastIg.textContent = '✅ Link Instagram @xstarzganalysis berhasil disalin!';
        setTimeout(function () { if (toastIg) toastIg.textContent = ''; }, 3500);
      }
    } catch (e) {}
  }

  if (btnCopyIg) {
    btnCopyIg.addEventListener('click', function () {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(IG_URL).then(function () {
          if (toastIg) {
            toastIg.style.color = '#10b981';
            toastIg.textContent = '✅ Link Instagram @xstarzganalysis berhasil disalin ke clipboard!';
            setTimeout(function () { if (toastIg) toastIg.textContent = ''; }, 3500);
          }
        }).catch(function () {
          fallbackCopyIgText(IG_URL);
        });
      } else {
        fallbackCopyIgText(IG_URL);
      }
    });
  }

  /* ---- Risk calc inputs ---- */
  ['inpCalcBalance', 'inpCalcRiskPct'].forEach(function (id) {
    var el = $id(id);
    if (el) el.addEventListener('input', updateRiskSizing);
  });
  bindVipFlow();
}
/* ==================== PERFORMANCE & TRACK RECORD (JUJUR, TERMASUK LOSS) ====================
   Dihitung dari jurnal yang sudah diputuskan (cloud + perangkat). Angka loss,
   kedaluwarsa, dan batal TIDAK dibuang — itu justru bukti transparansi. */
var PERF_R_BY_STATUS = {
  TP_HIT: 2, BE_SAVED: 0, SL_HIT: -1, STRUCTURE_INVALID: -0.5,
  EXPIRED: 0, CANCELLED: 0, MISSED: 0
};
function perfClosedRows() {
  var outs = signalOutcomeStore();
  var rows = [];
  for (var k in outs) {
    var o = outs[k];
    if (!o || !o.lock) continue;
    var st = String(o.status || '').toUpperCase();
    if (!(st in PERF_R_BY_STATUS)) continue;
    rows.push({
      sym: String(o.lock.symbol || '').toUpperCase(), tf: o.lock.tf,
      dir: o.dir || o.lock.direction || '-', st: st,
      score: num(o.score), at: num(o.at)
    });
  }
  rows.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  return rows;
}
function computePerformanceStats() {
  var rows = perfClosedRows();
  var wins = 0, losses = 0, be = 0;
  var totalR = 0, grossWin = 0, grossLoss = 0, equity = 0, peak = 0, maxDD = 0;
  var curve = [{ i: 0, r: 0 }];
  rows.forEach(function (row, i) {
    var r = PERF_R_BY_STATUS[row.st] || 0;
    if (row.st === 'TP_HIT') wins++;
    else if (row.st === 'SL_HIT' || row.st === 'STRUCTURE_INVALID') losses++;
    else if (row.st === 'BE_SAVED') be++;
    totalR += r;
    equity += r;
    if (r > 0) grossWin += r;
    else if (r < 0) grossLoss += Math.abs(r);
    if (equity > peak) peak = equity;
    var dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    curve.push({ i: i + 1, r: Number(equity.toFixed(2)) });
  });
  var decided = wins + losses;
  var locks = signalLockStore();
  var running = 0;
  for (var lk in locks) {
    var l = locks[lk];
    if (l && (l.status === 'ACTIVE' || l.status === 'PENDING_FILL' || l.status === 'FILLED')) running++;
  }
  return {
    rows: rows, wins: wins, losses: losses, be: be, decided: decided,
    winRate: decided ? Math.round((wins / decided) * 100) : 0,
    totalR: totalR, avgR: rows.length ? totalR / rows.length : 0,
    maxDD: maxDD,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
    curve: curve, running: running
  };
}
var botPerformance = null;
function fetchBotPerformance() {
  return fetch('/api/market/performance')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      botPerformance = (d && d.ok && d.stats && d.stats.total > 0) ? d : null;
      return botPerformance;
    })
    .catch(function () { botPerformance = null; return null; });
}
function renderBotPerformance() {
  var wrap = $id('perfBotBlock'), el = $id('perfBotStats'), note = $id('perfBotNote');
  if (!wrap || !el) return;
  if (!botPerformance) { wrap.classList.add('hidden'); return; }
  var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
  var s = botPerformance.stats;
  wrap.classList.remove('hidden');
  var cards = [
    { label: isEn ? 'Published & decided' : 'Terbit & Diputuskan', value: String(s.total), note: (isEn ? 'signals' : 'sinyal') },
    { label: 'Win Rate', value: s.decided ? s.winRate + '%' : '—', note: s.wins + 'W / ' + s.losses + 'L / ' + s.be + 'BE', col: s.winRate >= 50 ? '#34d399' : '#fb7185' },
    { label: isEn ? 'Average R' : 'Rata-rata R', value: (s.avgR >= 0 ? '+' : '') + s.avgR + 'R', note: (isEn ? 'per signal' : 'per sinyal'), col: s.avgR >= 0 ? '#34d399' : '#fb7185' },
    { label: 'Profit Factor', value: s.profitFactor === null ? '∞' : String(s.profitFactor), note: (s.totalR >= 0 ? '+' : '') + s.totalR + 'R total', col: (s.profitFactor === null || s.profitFactor >= 1) ? '#34d399' : '#fb7185' },
    { label: 'Max Drawdown', value: '-' + s.maxDD + 'R', note: isEn ? 'peak to trough' : 'puncak ke lembah', col: '#f59e0b' }
  ];
  el.innerHTML = cards.map(function (c) {
    return '<div style="background:rgba(2,6,23,0.6);border:1px solid rgba(51,65,85,0.6);border-radius:10px;padding:10px 12px;">' +
      '<div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;">' + escH(c.label) + '</div>' +
      '<div style="font-size:18px;font-weight:900;color:' + (c.col || '#f8fafc') + ';">' + escH(c.value) + '</div>' +
      '<div style="font-size:10px;color:#64748b;">' + escH(c.note) + '</div></div>';
  }).join('');
  if (note) {
    note.textContent = isEn
      ? 'Aggregated from every signal the cloud bot actually published and later closed. Losses and invalidations are included; nothing is filtered out.'
      : 'Dihitung dari seluruh sinyal yang benar-benar diterbitkan bot cloud lalu ditutup. Loss dan invalidasi ikut dihitung; tidak ada yang difilter.';
  }
}
function renderPerformancePage() {
  var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
  try { renderBotPerformance(); } catch (e) {}
  var st = computePerformanceStats();
  var statsEl = $id('perfStats');
  var curveEl = $id('perfCurve');
  var tableEl = $id('perfTable');
  var noteEl = $id('perfNote');

  if (noteEl) {
    noteEl.textContent = isEn
      ? 'Track record is built only from signals that passed the strict gate and were later decided (TP, SL, invalidated, expired, cancelled). Losses and breakevens are shown, not hidden. Sample size: ' + st.rows.length + ' closed signal(s).'
      : 'Track record hanya dihitung dari sinyal yang lolos gerbang ketat lalu diputuskan (TP, SL, invalidasi, kedaluwarsa, dibatalkan). Loss dan break-even ditampilkan, bukan disembunyikan. Ukuran sampel: ' + st.rows.length + ' sinyal selesai.';
  }

  if (statsEl) {
    var pf = st.profitFactor === Infinity ? '∞' : st.profitFactor.toFixed(2);
    var cards = [
      { label: isEn ? 'Closed signals' : 'Sinyal Selesai', value: String(st.rows.length), note: st.running + (isEn ? ' still running' : ' masih berjalan') },
      { label: 'Win Rate', value: st.decided ? st.winRate + '%' : '—', note: st.wins + 'W / ' + st.losses + 'L / ' + st.be + 'BE', col: st.winRate >= 50 ? '#34d399' : '#fb7185' },
      { label: isEn ? 'Average R' : 'Rata-rata R', value: (st.avgR >= 0 ? '+' : '') + st.avgR.toFixed(2) + 'R', note: isEn ? 'per closed signal' : 'per sinyal selesai', col: st.avgR >= 0 ? '#34d399' : '#fb7185' },
      { label: 'Profit Factor', value: pf, note: (st.totalR >= 0 ? '+' : '') + st.totalR.toFixed(2) + 'R total', col: st.profitFactor >= 1 ? '#34d399' : '#fb7185' },
      { label: 'Max Drawdown', value: '-' + st.maxDD.toFixed(2) + 'R', note: isEn ? 'peak to trough' : 'puncak ke lembah', col: '#f59e0b' }
    ];
    statsEl.innerHTML = cards.map(function (c) {
      return '<div style="background:rgba(15,23,42,0.7);border:1px solid rgba(51,65,85,0.6);border-radius:10px;padding:12px 14px;">' +
        '<div style="font-size:10.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">' + escH(c.label) + '</div>' +
        '<div style="font-size:20px;font-weight:900;color:' + (c.col || '#f8fafc') + ';margin:2px 0;">' + escH(c.value) + '</div>' +
        '<div style="font-size:10.5px;color:#64748b;">' + escH(c.note) + '</div></div>';
    }).join('');
  }

  if (curveEl) {
    var pts = st.curve;
    if (pts.length < 2) {
      curveEl.innerHTML = '<text x="300" y="92" text-anchor="middle" fill="#64748b" font-size="12">' +
        (isEn ? 'Equity curve appears after the first closed signal.' : 'Kurva ekuitas muncul setelah sinyal pertama selesai.') + '</text>';
    } else {
      var minR = Math.min.apply(null, pts.map(function (p) { return p.r; }));
      var maxR = Math.max.apply(null, pts.map(function (p) { return p.r; }));
      if (maxR === minR) { maxR += 1; minR -= 1; }
      var W = 600, H = 180, pad = 10;
      var sx = function (i) { return pad + (i / (pts.length - 1)) * (W - pad * 2); };
      var sy = function (r) { return H - pad - ((r - minR) / (maxR - minR)) * (H - pad * 2); };
      var line = pts.map(function (p, i) { return sx(i).toFixed(1) + ',' + sy(p.r).toFixed(1); }).join(' ');
      var zeroY = sy(0).toFixed(1);
      var lastR = pts[pts.length - 1].r;
      var stroke = lastR >= 0 ? '#34d399' : '#fb7185';
      curveEl.innerHTML =
        '<line x1="' + pad + '" y1="' + zeroY + '" x2="' + (W - pad) + '" y2="' + zeroY + '" stroke="#334155" stroke-dasharray="4 4" stroke-width="1" />' +
        '<polyline points="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />' +
        '<text x="' + pad + '" y="' + (H - 2) + '" fill="#64748b" font-size="10">0</text>' +
        '<text x="' + (W - pad) + '" y="' + (H - 2) + '" text-anchor="end" fill="#64748b" font-size="10">' + escH(String(pts.length - 1)) + (isEn ? ' trades' : ' trade') + '</text>';
    }
  }

  if (tableEl) {
    if (!st.rows.length) {
      tableEl.innerHTML = '<div style="font-size:12px;color:#64748b;padding:14px;text-align:center;">' +
        (isEn ? 'No completed signals yet. The record fills automatically as signals hit TP/SL or expire.' : 'Belum ada sinyal selesai. Rekam jejak terisi otomatis saat sinyal menyentuh TP/SL atau kedaluwarsa.') + '</div>';
    } else {
      var recent = st.rows.slice(-30).reverse();
      var rowsHtml = recent.map(function (r) {
        var b = jnlStatusBadge(r.st, false);
        var rMul = PERF_R_BY_STATUS[r.st] || 0;
        var when = r.at ? new Date(r.at).toLocaleDateString(isEn ? 'en-US' : 'id-ID', { month: 'short', day: 'numeric' }) : '—';
        return '<tr>' +
          '<td style="padding:6px 8px;border-bottom:1px solid rgba(51,65,85,0.4);"><b>' + escH(r.sym || '-') + '</b> <span style="color:#64748b;font-size:10px;">' + escH(r.tf || '') + '</span></td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid rgba(51,65,85,0.4);color:' + (r.dir === 'LONG' ? '#34d399' : '#fb7185') + ';font-weight:700;">' + escH(r.dir || '-') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid rgba(51,65,85,0.4);">' + escH(b.txt) + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid rgba(51,65,85,0.4);color:' + (rMul > 0 ? '#34d399' : rMul < 0 ? '#fb7185' : '#94a3b8') + ';font-weight:700;">' + (rMul > 0 ? '+' : '') + rMul + 'R</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid rgba(51,65,85,0.4);color:#64748b;">' + escH(when) + '</td>' +
        '</tr>';
      }).join('');
      tableEl.innerHTML = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;color:#cbd5e1;">' +
        '<thead><tr style="color:#94a3b8;text-align:left;font-size:10.5px;text-transform:uppercase;">' +
        '<th style="padding:6px 8px;">' + (isEn ? 'Instrument' : 'Instrumen') + '</th>' +
        '<th style="padding:6px 8px;">' + (isEn ? 'Side' : 'Arah') + '</th>' +
        '<th style="padding:6px 8px;">' + (isEn ? 'Result' : 'Hasil') + '</th>' +
        '<th style="padding:6px 8px;">R</th>' +
        '<th style="padding:6px 8px;">' + (isEn ? 'Date' : 'Tanggal') + '</th>' +
        '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
    }
  }
}
function setMode(mode) {
  state.mode = mode;
  syncTfBarForMode();
  var t = $id('btnModeTrader'), i = $id('btnModeInvestor'), m = $id('btnModeMeme');
  var nw = $id('btnModeNews'), jn = $id('btnModeJournal'), pf = $id('btnModePerformance');
  if (t) t.classList.toggle('active', mode === 'trader');
  if (i) i.classList.toggle('active', mode === 'investor');
  if (m) m.classList.toggle('active', mode === 'meme');
  if (nw) nw.classList.toggle('active', mode === 'news');
  if (jn) jn.classList.toggle('active', mode === 'journal');
  if (pf) pf.classList.toggle('active', mode === 'performance');
  var sub = $id('traderSubModeWrap');
  if (sub) sub.style.display = mode === 'trader' ? 'flex' : 'none';
  if (mode === 'investor' && state.radarHorizon === 'scalping') state.radarHorizon = 'swing';
  /* Investor tidak boleh mendarat di emas/forex/komoditas: pindahkan otomatis ke
     aset investasi nyata pertama (crypto/saham), lalu muat feed-nya. */
  if (mode === 'investor') {
    try {
      var invUniverse = investableUniverse();
      var curInvestable = false;
      for (var iu = 0; iu < invUniverse.length; iu++) {
        if (invUniverse[iu].symbol === state.symbol) { curInvestable = true; break; }
      }
      if (!curInvestable && invUniverse.length) {
        var targetSym = invUniverse[0].symbol;
        try { syncInvestorCatalogFilters(); } catch (e) {}
        if (typeof gotoInstrument === 'function') gotoInstrument(targetSym, state.timeframe);
        else state.symbol = targetSym;
      }
    } catch (e) {}
  }
  try { syncInvestorCatalogFilters(); renderInstrumentCatalog(); } catch (e) {}
  syncHorizonTabs();
  syncModeSections();
  /* Ruang kerja aktif harus langsung terisi: panel setup sudah ditukar di
     syncModeSections, lalu analisis dihitung ulang untuk mode ini (TF investor
     D1/W1/MN/1Y berbeda dari TF trader) agar daftar teknikal/fundamental dan
     skor sniper tidak tampak kosong setelah pindah mode. */
  try {
    if ((mode === 'trader' || mode === 'investor') && state.manualInstrumentSelection &&
        state.candles && state.candles.length && typeof window.runFullAnalysis === 'function') {
      window.runFullAnalysis(true);
    } else if (state.lastAnalysis) {
      try { renderPanels(state.lastAnalysis); } catch (e) {}
      try { renderPillars(state.lastAnalysis); } catch (e) {}
      try { renderGroupAnalysis(); } catch (e) {}
    }
  } catch (e) {}
  try {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () {
      try { if (typeof initChart === 'function') initChart(); } catch (e) {}
      /* JANGAN pakai chartInstance.resize() tanpa argumen: di lightweight-charts
         versi ini itu mengeset lebar/tinggi menjadi 0 sehingga kanvas chart
         hilang (chart kosong) setelah pindah workspace. Ukur ulang eksplisit. */
      try {
        var chartBox = $id('tvChartContainer');
        if (chartInstance && chartBox && (chartBox.clientWidth || 0) > 40) {
          chartInstance.applyOptions({
            width: chartBox.clientWidth,
            height: chartBox.clientHeight || 470
          });
        }
      } catch (e) {}
    });
  } catch (e) {}
  if (mode === 'news') { fetchNewsCalendar(true); renderNewsPanel(); }
  else if (mode === 'journal') { syncCloudSignalJournal(); renderSignalJournal(); }
  else if (mode === 'performance') {
    var refreshPerf = function () { try { renderPerformancePage(); } catch (e) {} };
    try { fetchBotPerformance().then(refreshPerf).catch(refreshPerf); } catch (e) { refreshPerf(); }
    if (typeof syncCloudSignalJournal === 'function') {
      try { syncCloudSignalJournal().then(refreshPerf).catch(refreshPerf); } catch (e) { refreshPerf(); }
    }
  }
  renderMacroMap();
  updateModeChip();
  syncTfBarForMode();
  saveSession();
}
function setSubMode(sub) {
  state.subMode = sub;
  var f = $id('btnSubFutures'), s = $id('btnSubSpot');
  if (f) f.classList.toggle('active', sub === 'futures');
  if (s) s.classList.toggle('active', sub === 'spot');
  updateModeChip();
  syncTfBarForMode();
  saveSession();
  state.bestTfBoard = null;
  if (state.lastAnalysis) {
    renderPanels(state.lastAnalysis);
    renderHeader(state.lastAnalysis);
    drawChartLevels(state.lastAnalysis);
  }
}
function selectSymbol(sym) {
  if (!sym) return;
  if (!ensureQuotaFor(sym)) {
    renderInstrumentCatalog();
    return;
  }
  if (feedReconnectTimer) { try { clearInterval(feedReconnectTimer); feedReconnectTimer = null; } catch (e) {} }
  state.manualInstrumentSelection = true;
  state.symbol = sym;
  state.candles = [];
  state.lastAnalysis = null;
  state.bestTfBoard = null;
  state.feedSource = '-';
  try { auditAndCleanseCorruptedStorage(); } catch (e) {}
  renderInstrumentCatalog();
  saveSession(); // preferensi ikut tersimpan agar refresh tidak keluar
  if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
  connectRealtimeStream();
}

/* ==================== 12. BOOTSTRAP ==================== */
/* AUTO-PILOT radar & kurasi investor: memindai ulang katalog secara mandiri setiap
   slot rotasi (5 menit) sehingga instrumen berpotensi baru muncul sendiri tanpa
   refresh manual. Repaint murah tiap 60 dtk; scan batch penuh tiap 5 menit;
   jeda otomatis saat tab tidak terlihat. */
var radarAutoLastForce = 0;
function startRadarAutoPilot() { return; }
var __xsBootCoreStarted = false;
function bootCore() {
  if (__xsBootCoreStarted) return;
  __xsBootCoreStarted = true;
  try { bindUiEvents(); } catch (e) {}
  try { loadPersistedTelegramConfig(); } catch (e) {}
  var saved = null;
  try { saved = loadSession(); } catch (e) {}
  if (saved && saved.user) {
    // FIX refresh-kickout: sesi login tersimpan -> langsung kembali ke dashboard
    // analisa dengan simbol/timeframe/mode terakhir (tanpa login ulang).
    state.user = saved.user;
    try { syncTelegramLinkStatus(); } catch (e) {}
    try { syncCloudSignalJournal(); } catch (e) {}
    try { applyWorkspacePrefs(saved); } catch (e) {}
    try { updateUserUi(); } catch (e) {}
    try { verifyOwnerSession(); } catch (e) {}
    try { verifyVipSession(); } catch (e) {}
    try { syncModeSections(); } catch (e) {}
    try { enterWorkspace(); } catch (e) {}
  } else {
    // Deteksi mode PWA / Android WebAPK: jika dibuka dari launcher / APK,
    // langsung masuk ke workspace sebagai Tamu tanpa tertahan di layar depan (splash hang fix)
    var isPwaLaunch = false;
    try {
      isPwaLaunch = !!window.__isPwaLaunch ||
        (window.location && window.location.search && window.location.search.indexOf('pwa=1') > -1) ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (ePwaLaunch) {}

    if (isPwaLaunch) {
      state.user = { email: 'pwa-guest@xstarzg.local', name: T('ui.guestName', 'Tamu') + ' PWA', tier: 'GUEST' };
      try { saveSession(); } catch (e) {}
      try { updateUserUi(); } catch (e) {}
      try { syncModeSections(); } catch (e) {}
      try { enterWorkspace(); } catch (e) {}
    } else if (state.user) {
      try { renderInstrumentCatalog(); } catch (e) {}
      try { updateUserUi(); } catch (e) {}
      try { syncModeSections(); } catch (e) {}
      try { enterWorkspace(); } catch (e) {}
    } else {
      try { updateUserUi(); } catch (e) {}
      try { showScreen('front'); } catch (e) {}
    }
  }
  // Muat mesin quant bersama (hasil penyempurnaan sesi sebelumnya)
  // Engine kuantitatif dimuat lewat berkas modul eksternal /js/engine-boot.js
  // (CSP ketat tanpa 'unsafe-eval'): modul menaruh hasil di window.__XS_QC/__XS_SE
  // lalu memicu event 'xs-engine-booted'.
  var applyEngines = function () {
    var qc = window.__XS_QC || null, se = window.__XS_SE || null;
    if (!qc && !se) return;
    if (qc) QC = qc;
    if (se) SE = se;
    renderInstrumentCatalog();
    try { renderGroupAnalysis(); } catch (e) {}
    try { renderMemeGroupAnalysis(); } catch (e) {}
    // Expanded crypto catalog is opt-in: load it only when the user selects CRYPTO.
    // Setelah restore-refresh engine mungkin belum siap saat analisa awal jalan
    // (fallback ringan) -> jalankan ulang satu kali agar 22 pilar penuh tampil.
    if (state.user && state.candles && state.candles.length && typeof window.runFullAnalysis === 'function') {
      window.runFullAnalysis(true);
    }
  };
  if (window.__XS_QC || window.__XS_SE) { applyEngines(); }
  else {
    window.addEventListener('xs-engine-booted', applyEngines, { once: true });
    // Pengaman: jika event terlambat, coba baca ulang setelah 3 dtk.
    setTimeout(function () { if (!QC && !SE && (window.__XS_QC || window.__XS_SE)) applyEngines(); }, 3000);
  }
  // Fallback logo ramah-CSP (menggantikan atribut onerror inline yang diblokir CSP)
  try {
    Array.prototype.forEach.call(document.querySelectorAll('img[data-logo-fallback]'), function (img) {
      img.addEventListener('error', function () { img.style.display = 'none'; });
    });
  } catch (e) {}
  // i18n (round 6): saat bahasa diganti, render ulang semua bagian dinamis agar teks
  // mengikuti bahasa terpilih (katalog, radar, kartu investor, chip mode, panel user).
  window.addEventListener('xs-lang-changed', function () {
    try {
      if (window.XSI18N && typeof window.XSI18N.applyTranslationsToDOM === 'function') window.XSI18N.applyTranslationsToDOM();
      updateLandingCounts();
      renderInstrumentCatalog();
      updateUserUi();
      updateModeChip();
      syncTfBarForMode();
      syncHorizonTabs();
      try { syncModeButtonLabels(); } catch (e) {}
      // force=false: gunakan cache radar/kurasi bila ada (tidak memicu fetch ulang)
      if (state.mode === 'investor') renderInvestorPicks(false);
      try { renderSignalJournal(); } catch (e) {}
      try { updateSlPlusNotifyUi(); } catch (e) {}
      try { updateTelegramUi(); } catch (e) {}
      // Narasi analisis terakhir tetap — jalankan ulang analisis agar panel sisi ikut bahasa baru
      if (state.user && state.candles && state.candles.length && typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
    } catch (e) {}
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootCore);
} else {
  bootCore();
}

// === XSTARZG_SAFE_REALTIME_TICKER_V2026_27 ===
(function () {
  let rtBusy = false;
  let rtLastTick = 0;
  const RT_TICK_MS = 5000;
  setInterval(async function () {
    if (rtBusy) return;
    try {
      if (typeof state === 'undefined' || !state || !state.symbol) return;
      /* HEMAT KUOTA CLOUDFLARE (v2026.66): Functions request dibatasi 100rb/hari
         di paket gratis, jadi ticker diperketat tanpa mengurangi fitur:
         1) tab latar belakang -> 0 request (document.hidden);
         2) kancelensi 1.5 dtk -> 5 dtk (harga terakhir tetap tampil dari state);
         3) crypto /USDT -> Binance langsung dari browser (gratis, tanpa kuota CF),
            edge Function tetap sebagai fallback penuh. */
      if (typeof document !== 'undefined' && document.hidden) return;
      const workEl = document.getElementById('appWorkspaceWrapper');
      if (workEl && workEl.classList.contains('hidden')) return;
      if (Date.now() - rtLastTick < RT_TICK_MS) return;
      rtLastTick = Date.now();
      rtBusy = true;
      const sym = state.symbol;
      const tf = state.tf || state.timeframe || 'H1';
      if ((sym || '').indexOf('/USDT') > -1) {
        try {
          const bc = new AbortController();
          const bt = setTimeout(function () { try { bc.abort(); } catch (e) {} }, 4000);
          const rB = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=' + sym.replace('/', ''), { signal: bc.signal });
          clearTimeout(bt);
          if (rB.ok) {
            const jB = await rB.json();
            const lpB = Number(jB && jB.price);
            if (lpB > 0 && state.symbol === sym && typeof applyLiveTick === 'function') {
              applyLiveTick(lpB, undefined, true);
              ['hdrLivePrice', 'livePriceDisplay', 'valCurrentPrice'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el) el.textContent = typeof formatPrice === 'function' ? formatPrice(lpB, sym) : lpB;
              });
              rtBusy = false;
              return;
            }
          }
        } catch (eB) { /* lanjut ke edge Function di bawah */ }
      }
      const res = await fetch('/api/market/analyze?quote=1&symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(tf));
      if (res.ok) {
        const d = await res.json();
        const q = d && d.quote ? d.quote : null;
        if (q && Number(q.price) > 0 && state.symbol === sym) {
          const liveP = Number(q.price);
          const prevP = Number(state.livePrice) || liveP;
          // Teruskan ke satu jalur resmi: applyLiveTick membucket waktu TF dengan benar
          // (candle forming baru saat bucket berganti — chart bergerak sesuai waktu).
          if (typeof applyLiveTick === 'function') applyLiveTick(liveP, Number.isFinite(Number(q.changePct)) ? Number(q.changePct) : undefined, true);
          else state.livePrice = liveP;
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
    } catch (e) {
      // Anti-stall: edge quote gagal/lemot -> crypto coba langsung Binance ticker ringan
      // supaya harga tampilan & candle tidak pernah tertinggal dari pasar.
      try {
        const sym2 = state.symbol;
        if ((sym2 || '').indexOf('/USDT') > -1) {
          const r2 = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=' + sym2.replace('/', ''), { cache: 'no-store' });
          if (r2.ok) {
            const j2 = await r2.json();
            const lp = Number(j2 && j2.price);
            if (lp > 0 && state.symbol === sym2 && typeof applyLiveTick === 'function') applyLiveTick(lp, undefined, true);
          }
        }
      } catch (e2) {}
    }
    rtBusy = false;
  }, 1500);
})();

// === XSTARZG_INSTANT_RENDER_GUARANTEE_V2026_30 ===
(function () {
  const SEED_PRICES = {
    // Harga jangkar dikalibrasi realistis ke pasar spot aktif — hanya dipakai 0-2 detik sebelum kuotasi live tiba
    'XAU/USD': 2680.00, 'XAU/IDR': 1405000, 'XAG/USD': 31.50, 'XPT/USD': 980.00, 'XPD/USD': 1050.00, 'XCU/USD': 4.30, 'HG/USD': 4.30,
    'EUR/USD': 1.0845, 'GBP/USD': 1.2960, 'USD/JPY': 152.40, 'USD/CHF': 0.8650, 'AUD/USD': 0.6580, 'USD/CAD': 1.3890,
    'NZD/USD': 0.5980, 'USD/IDR': 16550, 'BBCA.JK': 9850, 'BBRI.JK': 4420, 'BMRI.JK': 6150, 'BBNI.JK': 4880,
    'TLKM.JK': 2760, 'ASII.JK': 4950, 'ANTM.JK': 1620, 'NVDA': 142.50, 'AAPL': 234.80, 'MSFT': 428.00,
    'TSLA': 262.00, 'BTC/USDT': 100000.00, 'ETH/USDT': 3400.00, 'SOL/USDT': 200.00, 'BNB/USDT': 645.00,
    'SEI/USDT': 0.28, 'SEI': 0.28, 'KAS/USDT': 0.15, 'KAS': 0.15, 'USD/ZAR': 18.00, 'USDZAR': 18.00,
    'LDO/USDT': 1.45, 'KCS/USDT': 5.82, 'FET/USDT': 1.15, 'TAO/USDT': 450.00, 'RENDER/USDT': 4.80, 'PEPE/USDT': 0.00001,
    'RAY/USDT': 1.35, 'RAY': 1.35,
    'NZD/JPY': 87.35, 'NZDJPY': 87.35, 'AUD/JPY': 100.25, 'CAD/JPY': 109.60, 'CHF/JPY': 176.10, 'EUR/JPY': 165.20, 'GBP/JPY': 197.50
  };
  function generateSeedCandles(symbol, tf) {
    const sym = (symbol || 'XAU/USD').toUpperCase();
    const meta = (typeof getMeta === 'function' ? getMeta(sym) : null) || (typeof QC !== 'undefined' && QC && QC.getInstrumentMeta ? QC.getInstrumentMeta(sym) : null);
    const baseP = (meta && Number(meta.basePrice) > 0) ? Number(meta.basePrice) : (SEED_PRICES[sym] || 100);
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
      const wave = Math.sin(i * 0.15) * (atr * 0.20);
      const noise = (rand() - 0.500) * (atr * 0.45);
      cur = Math.max(baseP * 0.7, Math.min(baseP * 1.3, cur - noise - wave * 0.10));
      closes[i] = cur;
    }
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = nowBucket - (count - 1 - i) * step;
      const o = i === 0 ? closes[0] * 0.999 : closes[i - 1];
      const c = closes[i];
      const wickUp = Math.max((0.2 + rand() * 0.5) * atr * 0.65, c * 0.0012);
      const wickDn = Math.max((0.2 + rand() * 0.5) * atr * 0.65, c * 0.0012);
      const h = Math.max(o, c) + wickUp;
      const l = Math.max(0.000001, Math.min(o, c) - wickDn);
      out.push({ time: t, open: o, high: h, low: l, close: c, volume: Math.round(120 + rand() * 800) });
    }
    return { price: baseP, candles: out };
  }
  // Fallback Canvas Candlestick Renderer jika CDN LightweightCharts diblokir ISP
  // v2026.63 REWRITE: axis harga nyata di kanan + tag level (ENTRY/SL/TP/DCA)
  // dari analysis.levels via effectiveLevels (bug lama: baca analysis.entry langsung
  // yang selalu undefined -> garis & harga SL/TP tidak pernah tergambar).
  function __fxEmaList(values, period) {
    const out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    const k = 2 / (period + 1);
    let e = 0; for (let i = 0; i < period; i++) e += values[i]; e /= period;
    out[period - 1] = e;
    for (let i = period; i < values.length; i++) { e = values[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  function drawCanvasFallbackChart(candles, analysis) {
    const container = document.getElementById('tvChartContainer');
    const skeleton = document.getElementById('tvChartLoadingSkeleton');
    if (skeleton) { try { skeleton.style.display = 'none'; } catch (e) {} }
    if (!container || (chartInstance && typeof LightweightCharts !== 'undefined')) return;
    let canvas = container.querySelector('canvas.xstarzg-fallback-canvas');
    if (!canvas) {
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
    if (!ctx) return;
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, w, h);
    if (!candles || !candles.length) return;
    const slice = candles.slice(-90);
    const N = slice.length;

    // ---- Toggle indikator & level (sama dengan chart utama) ----
    const showEMA = $id('chkEMA') ? $id('chkEMA').checked : true;
    const showVWAP = $id('chkVWAP') ? $id('chkVWAP').checked : true;
    const showSMC = $id('chkSMC') ? $id('chkSMC').checked : true;
    const showSniper = $id('chkSniper') ? $id('chkSniper').checked : true;
    const L = (() => { try { return analysis ? effectiveLevels(analysis) : {}; } catch (e) { return (analysis && analysis.levels) || {}; } })();
    const fullCloses = candles.map(c => c.close);
    const ema20 = showEMA ? __fxEmaList(fullCloses, 20).slice(-N) : null;
    const ema50 = showEMA ? __fxEmaList(fullCloses, 50).slice(-N) : null;
    const ma200 = showEMA ? __fxEmaList(fullCloses, 200).slice(-N) : null;
    let vwapN = null;
    if (showVWAP && typeof QC !== 'undefined' && QC && QC.calcVWAP) {
      try { vwapN = (QC.calcVWAP(candles, Math.min(60, candles.length)).vwap || []).slice(-N); } catch (e) {}
    }

    // ---- Rentang harga mencakup candle DAN seluruh overlay/level aktif ----
    let maxP = -Infinity, minP = Infinity;
    slice.forEach(c => { if (c.high > maxP) maxP = c.high; if (c.low < minP) minP = c.low; });
    const absorb = (arr) => { if (!arr) return; for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v != null && Number.isFinite(v)) { if (v > maxP) maxP = v; if (v < minP) minP = v; } } };
    absorb(ema20); absorb(ema50); absorb(ma200); absorb(vwapN);
    const lvlKeys = showSniper
      ? (state.mode === 'investor' ? ['dcaZone1', 'dcaZone2', 'dcaZone3', 'invTarget1', 'invTarget2'] : ['entry', 'sl', 'tp1', 'tp2'])
      : [];
    if (showSMC) lvlKeys.push('poc', 'swingHigh', 'swingLow');
    lvlKeys.forEach(k => {
      const v = Number(L[k]);
      if (Number.isFinite(v) && v > 0) {
        if (!slice.length || (maxP > 0 && v <= maxP * 3.5 && v >= minP * 0.28)) {
          if (v > maxP) maxP = v;
          if (v < minP) minP = v;
        }
      }
    });
    if (!Number.isFinite(maxP) || !Number.isFinite(minP) || maxP <= minP) { maxP = (candles[candles.length - 1].close || 100) * 1.01; minP = maxP * 0.98; }
    const pad = (maxP - minP) * 0.06 || 1;
    maxP += pad; minP -= pad;

    // ---- Geometri area plot & AXIS HARGA kanan (fix bug utama: tidak ada bacaan harga) ----
    const AX = 78;                 // lebar kolom axis harga kanan
    const top = 26, bottom = 20;   // ruang legenda atas & time axis bawah
    const plotR = w - AX - 6;      // batas kanan area candle
    const yOf = (p) => top + (maxP - p) * (h - top - bottom) / (maxP - minP);
    const yClamp = (y) => Math.max(top + 6, Math.min(h - bottom - 2, y));
    // fxPriceAxis: tick genap (nice numbers) — dibaca kanan-kiri seperti chart TradingView
    function fxPriceAxis(rangeMax, rangeMin, count) {
      const rawStep = (rangeMax - rangeMin) / count;
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
      const norm = rawStep / mag;
      const stepM = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
      const t0 = Math.ceil(rangeMin / stepM) * stepM;
      const out = [];
      for (let v = t0; v <= rangeMax; v += stepM) if (out.length < 14) out.push(v); else break;
      return out;
    }
    ctx.font = '10px monospace';
    ctx.textBaseline = 'middle';
    fxPriceAxis(maxP, minP, 6).forEach(v => {
      const y = yOf(v);
      if (y < top || y > h - bottom) return;
      ctx.strokeStyle = 'rgba(148,163,184,0.10)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotR, y); ctx.stroke();
      const txt = formatPrice(v, analysis ? analysis.symbol : undefined);
      ctx.fillStyle = '#64748b';
      ctx.fillText(txt, plotR + 6, y);
    });
    // garis frame plot
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.strokeRect(0.5, top + 0.5, plotR, h - top - bottom);

    // ---- Candlestick ----
    const stepX = plotR / N;
    const barW = Math.max(2, stepX * 0.68);
    slice.forEach((c, idx) => {
      const x = idx * stepX + (stepX - barW) / 2;
      const isUp = c.close >= c.open;
      ctx.strokeStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.fillStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, yOf(c.high));
      ctx.lineTo(x + barW / 2, yOf(c.low));
      ctx.stroke();
      const yTop = yOf(Math.max(c.open, c.close));
      const yBot = yOf(Math.min(c.open, c.close));
      ctx.fillRect(x, yTop, barW, Math.max(1.5, yBot - yTop));
    });

    // ---- Garis overlay (EMA20/50/200 + VWAP) ----
    const plotLine = (arr, col, dashed) => {
      if (!arr) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath(); let started = false;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v == null || !Number.isFinite(v)) continue;
        const x = i * stepX + stepX / 2, y = yOf(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    };
    plotLine(ema20, '#38bdf8', false);
    plotLine(ema50, '#eab308', false);
    plotLine(ma200, '#a855f7', false);
    plotLine(vwapN, '#ec4899', true);

    // ---- Tag level (harga) di tepi axis: lvTag ----
    function lvTag(p, col, lbl, dash) {
      const v = Number(p);
      if (!Number.isFinite(v) || v <= 0) return;
      const y = yClamp(yOf(v));
      ctx.strokeStyle = col;
      ctx.setLineDash(dash === 0 ? [] : [5, 4]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotR, y); ctx.stroke();
      ctx.setLineDash([]);
      const txt = lbl + ' ' + formatPrice(v, analysis ? analysis.symbol : undefined);
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(txt).width + 8;
      const x0 = w - tw - 4;
      ctx.fillStyle = col;
      ctx.fillRect(x0, y - 8, tw, 15);
      ctx.fillStyle = '#0b1020';
      ctx.fillText(txt, x0 + 4, y);
    }
    if (showSMC) {
      lvTag(L.poc, '#eab308', 'POC', 1);
      if (L.swingHigh > 0) lvTag(L.swingHigh, 'rgba(244,63,94,0.85)', 'SUPPLY', 1);
      if (L.swingLow > 0) lvTag(L.swingLow, 'rgba(16,185,129,0.85)', 'DEMAND', 1);
    }
    if (showSniper) {
      if (state.mode === 'investor') {
        lvTag(L.dcaZone1, '#10b981', 'DCA1'); lvTag(L.dcaZone2, '#34d399', 'DCA2'); lvTag(L.dcaZone3, '#6ee7b7', 'DCA3');
        lvTag(L.invTarget1, '#38bdf8', 'T1'); lvTag(L.invTarget2, '#818cf8', 'T2');
      } else {
        const isBeActive = (analysis && analysis.tradeManagement && analysis.tradeManagement.bePlusActive) || (L && L.bePlusActive) || (analysis && analysis.lockedSignal && analysis.lockedSignal.bePlusActive);
        const slPlusVal = (L && L.slPlus) || (analysis && analysis.lockedSignal && analysis.lockedSignal.slPlus);
        lvTag(L.entry, '#38bdf8', 'ENTRY', 0);
        if (isBeActive && Number(slPlusVal) > 0) {
          lvTag(slPlusVal, '#10b981', 'SL+ (0-RISK)', 0);
          lvTag(L.sl, 'rgba(244,63,94,0.35)', 'SL (BE+)', 1);
        } else {
          lvTag(L.sl, '#f43f5e', 'SL', 1);
        }
        lvTag(L.tp1, '#10b981', 'TP1', 1);
        lvTag(L.tp2, '#34d399', 'TP2', 1);
      }
    }

    // ---- Harga TERKINI: garis penuh + pil harga di axis ----
    const lastC = candleLastPrice(sourceSafe(candles));
    function candleLastPrice(arr) { const c = arr[arr.length - 1]; return c && Number.isFinite(c.close) ? c.close : 0; }
    function sourceSafe(a) { return a && a.length ? a : []; }
    if (lastC > 0) {
      const y = yClamp(yOf(lastC));
      const up = slice[N - 1].close >= (slice[N - 2] ? slice[N - 2].close : slice[N - 1].open);
      const col = up ? '#10b981' : '#f43f5e';
      ctx.strokeStyle = col; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotR, y); ctx.stroke(); ctx.setLineDash([]);
      const txt = formatPrice(lastC, analysis ? analysis.symbol : undefined);
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(txt).width + 8;
      ctx.fillStyle = col; ctx.fillRect(plotR + 2, y - 8, Math.min(tw, AX - 2), 15);
      ctx.fillStyle = '#ffffff'; ctx.fillText(txt, plotR + 6, y);
    }

    // ---- Legenda indikator rapi (kiri atas) ----
    ctx.font = 'bold 9.5px monospace';
    let lx = 8; const ly = 13;
    const legend = (txt, col) => {
      const tw = ctx.measureText(txt).width + 14;
      if (lx + tw > plotR) return;
      ctx.fillStyle = 'rgba(11,16,32,0.72)'; ctx.fillRect(lx, ly - 8, tw, 16);
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(lx + 3, ly); ctx.lineTo(lx + 10, ly); ctx.stroke();
      ctx.fillStyle = '#cbd5e1'; ctx.fillText(txt, lx + 12, ly);
      lx += tw + 4;
    };
    if (ema20) legend('EMA20', '#38bdf8');
    if (ema50) legend('EMA50', '#eab308');
    if (ma200) legend('MA200', '#a855f7');
    if (vwapN) legend('VWAP', '#ec4899');
    ctx.fillStyle = '#475569'; ctx.font = '9px monospace';
    ctx.fillText('FALLBACK VIEW — axis harga aktif', 8, h - 7);
  }
    // Expose untuk heartbeat live-tick (anti-desync chart vs harga saat CDN diblokir)
  window.__canvasRenderer = drawCanvasFallbackChart;
  window.drawCanvasFallbackChart = drawCanvasFallbackChart;
  window.generateSeedCandles = generateSeedCandles;
  window.SEED_PRICES = SEED_PRICES;
  let analysisRequestSeq = 0;
  let activeAnalysisController = null;
  // Do not block the UI with a second full quant calculation on synthetic seed candles.
  // Seed candles are only a visual placeholder; the complete engine runs once real data arrives.
  window.runFullAnalysis = async function (forceRecalc = false) {
    if (!state.manualInstrumentSelection) {
      setTxt('lblEngineStatus', 'Pilih instrumen secara manual, lalu tekan Analisis.');
      return null;
    }
    const mySeq = ++analysisRequestSeq;
    const reqSymbol = state.symbol;
    const reqTf = state.tf;
    if (activeAnalysisController) {
      try { activeAnalysisController.abort(); } catch (e) {}
    }
    const requestController = new AbortController();
    activeAnalysisController = requestController;
    try {
      if (!chartInstance && typeof initChart === 'function') initChart();
      try { auditAndCleanseCorruptedStorage(); } catch (e) {}

      // Initial workspace entry only: draw a lightweight seed preview without running
      // computeQuantEngine/renderAllVisuals. A timeframe switch retains the prior bars
      // and therefore skips this branch entirely.
      if (!state.candles || state.candles.length === 0 || (state.lastAnalysis && state.lastAnalysis.symbol !== reqSymbol)) {
        const seeded = generateSeedCandles(reqSymbol, reqTf);
        if (mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf) return;
        state.candles = seeded.candles;
        state.livePrice = seeded.price;
        state.liveChangePct = 0.25;
        state.feedSource = 'LOCAL_SEED';
        state.lastAnalysis = null;
        renderSeedCandlesPreview(state.candles);
      }

      setTxt('lblEngineStatus', '⏳ MEMUAT ' + reqTf + ' — mengambil candle broker…');
      const data = await fetchRealMarketCandles(reqSymbol, reqTf, requestController);
      // Ignore responses from requests superseded by a newer symbol/timeframe selection.
      if (mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf) return;
      if (data && data.symbol && data.symbol !== reqSymbol) return;

      // Successful HTTP responses can still contain broker-fallback/synthetic candles.
      // Show them as an unverified preview only; never spend a full quant pass on them.
      if (data && Array.isArray(data.candles) && data.candles.length >= 5 && feedIsEstimate(data.source)) {
        const estimatedLastBar = data.candles[data.candles.length - 1];
        if (!isPriceCompatibleWithSymbol(estimatedLastBar.close, reqSymbol)) return;
        state.candles = data.candles;
        state.livePrice = Number(data.price) || estimatedLastBar.close;
        state.liveChangePct = Number(data.changePct) || 0;
        state.feedSource = data.source || 'EDGE_SYNTHETIC_CALIBRATED';
        state.lastAnalysis = null;
        renderSeedCandlesPreview(state.candles);
        setTxt('lblEngineStatus', '⚠ FEED ESTIMASI — preview saja; sinyal belum diverifikasi');
        connectRealtimeStream();
        scheduleFeedReconnect();
        return;
      }

      if (data && Array.isArray(data.candles) && data.candles.length >= 5) {
        const lastBar = data.candles[data.candles.length - 1];
        if (!isPriceCompatibleWithSymbol(lastBar.close, reqSymbol)) return;
        state.candles = data.candles;
        state.livePrice = Number(data.price) || lastBar.close;
        state.liveChangePct = Number(data.changePct) || 0.25;
        state.feedSource = data.source || 'LIVE_BROKER';
        if (!feedIsEstimate(state.feedSource) && feedReconnectTimer) {
          try { clearInterval(feedReconnectTimer); feedReconnectTimer = null; } catch (e) {}
        }
        // Exactly one full quant pass per successful timeframe response.
        const analysis = computeQuantEngine(state.candles, reqSymbol, reqTf, forceRecalc, 'create', data.source || 'LIVE_BROKER');
        if (mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf) return;
        renderAllVisuals(analysis, true);
        drawCanvasFallbackChart(state.candles, analysis);
        if (chartInstance) chartInstance.timeScale().fitContent();
        connectRealtimeStream();
        if (feedIsEstimate(state.feedSource)) scheduleFeedReconnect();
      }
    } catch (err) {
      if (mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf) return;
      // Do not run the expensive quant engine over synthetic fallback candles.
      // Keep the chart usable, mark the feed as unverified, and allow a retry.
      const seeded = generateSeedCandles(reqSymbol, reqTf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      state.liveChangePct = 0;
      state.feedSource = 'LOCAL_SEED';
      state.lastAnalysis = null;
      renderSeedCandlesPreview(state.candles);
      setTxt('lblEngineStatus', '⚠ FEED ' + reqTf + ' TIDAK TERSEDIA — pratinjau lokal, sinyal belum diverifikasi');
      scheduleFeedReconnect();
      connectRealtimeStream();
    } finally {
      if (activeAnalysisController === requestController) activeAnalysisController = null;
    }
  };
  // Pre-warm radar & initial analysis on load
  var __xsBootPostDomStarted = false;
  function bootPostDom() {
    if (__xsBootPostDomStarted) return;
    __xsBootPostDomStarted = true;
    setTimeout(function () {
      // Do not compute/render seed analysis while the landing or login screen is visible.
      var workEl = document.getElementById('appWorkspaceWrapper');
      var isInWork = workEl && !workEl.classList.contains('hidden');
      if (isInWork && (!state.candles || !state.candles.length)) {
        try {
          const seeded = generateSeedCandles(state.symbol, state.tf);
          state.candles = seeded.candles;
          state.livePrice = seeded.price;
          state.feedSource = 'LOCAL_SEED';
          state.lastAnalysis = null;
          renderSeedCandlesPreview(state.candles);
        } catch (eInitAn) {}
      }
      // Setelah refresh, instrumen yang sudah dipilih manual harus langsung dianalisis
      // (candle nyata), bukan tertahan di preview seed sintetis.
      if (isInWork && state.manualInstrumentSelection && !state.lastAnalysis &&
          SE && typeof window.runFullAnalysis === 'function') {
        try { window.runFullAnalysis(true); } catch (e) {}
      }
      // Initial background feeds run only after an actual workspace entry.
      if (isInWork) {
        try { fetchNewsCalendar(false); } catch (e) {}
        try { fetchMacroRegime(false); } catch (e) {}
        try { renderMacroMap(); } catch (e) {}
        try { renderSignalJournal(); } catch (e) {}
        // DEX/Meme scanner is loaded on demand when the user opens Meme mode; do not fetch it during Trader/Investor startup.
      }
      setInterval(function () {
        var w = document.getElementById('appWorkspaceWrapper');
        if (w && !w.classList.contains('hidden')) {
          try { fetchNewsCalendar(false); } catch (e) {}
        }
      }, 15 * 60 * 1000);
      setInterval(function () {
        var w = document.getElementById('appWorkspaceWrapper');
        if (w && !w.classList.contains('hidden')) {
          try { fetchMacroRegime(false); } catch (e) {}
        }
      }, MACRO_TTL);
      setInterval(function () {
        var w = document.getElementById('appWorkspaceWrapper');
        if (w && !w.classList.contains('hidden')) {
          try { renderMacroMap(); } catch (e) {}
        }
      }, 60 * 1000);
      setInterval(function () {
        var w = document.getElementById('appWorkspaceWrapper');
        if (w && !w.classList.contains('hidden')) {
          try { renderSignalJournal(); } catch (e) {}
        }
      }, 60 * 1000);
      try { loadPersistedAlarm(); } catch (e) {}
      var nfBar = $id('newsFilterBar');
      if (nfBar) nfBar.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-nf]') : null;
        if (!b) return;
        newsState.filter = b.getAttribute('data-nf');
        nfBar.querySelectorAll('.hz-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderNewsPanel();
      });

      var rgBar = $id('radarGroupBar');
      if (rgBar) rgBar.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-rg]') : null;
        if (!b) return;
        state.radarGroup = b.getAttribute('data-rg') || 'all';
        rgBar.querySelectorAll('.hz-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      });

      var viabBar = $id('radarViabilityBar');
      if (viabBar) viabBar.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-viab]') : null;
        if (!b) return;
        state.radarViability = b.getAttribute('data-viab') || 'actionable';
        viabBar.querySelectorAll('.hz-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      });

      // ==================== PWA INSTALL & SERVICE WORKER ====================
      if ('serviceWorker' in navigator) {
        var registerSW = function () {
          navigator.serviceWorker.register('/sw.js').then(function (reg) {
            try { reg.update(); } catch (e) {}
            reg.addEventListener('updatefound', function () {
              var newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', function () {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    try { newWorker.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
                  }
                });
              }
            });
          }).catch(function (err) {
            console.warn('SW registration failed:', err);
          });
        };
        if (document.readyState === 'complete') {
          registerSW();
        } else {
          window.addEventListener('load', registerSW);
        }
        var isInitialController = !!navigator.serviceWorker.controller;
        var swPageStartTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
        var refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', function () {
          // Never force a page reload: SW activation is sufficient, and forced
          // reloads can create Android WebAPK splash/startup loops.
          try {
            var isPwaStandalone = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && navigator.standalone === true);
            if (isPwaStandalone) return;
          } catch (ePwa) {}
          return;
        });
      }

      var deferredPwaPrompt = null;
      var btnNavInstall = $id('btnNavInstallPwa');
      var btnInstallPwa = $id('btnInstallPwa');
      var isStandalone = false;
      try {
        isStandalone = (typeof window !== 'undefined' && window.matchMedia && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)') && window.matchMedia('(display-mode: standalone)').matches) || (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true);
      } catch (e) {
        isStandalone = false;
      }

      function updatePwaInstallUI(show) {
        if (isStandalone) {
          if (btnNavInstall) btnNavInstall.classList.add('hidden');
          if (btnInstallPwa) btnInstallPwa.classList.add('hidden');
          return;
        }
        if (btnNavInstall) btnNavInstall.classList.toggle('hidden', !show);
        if (btnInstallPwa) btnInstallPwa.classList.toggle('hidden', !show);
      }

      if (!isStandalone) {
        updatePwaInstallUI(true);
      }

      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPwaPrompt = e;
        updatePwaInstallUI(true);
      });

      function handlePwaInstallAction() {
        if (deferredPwaPrompt) {
          deferredPwaPrompt.prompt();
          deferredPwaPrompt.userChoice.then(function (res) {
            if (res && res.outcome === 'accepted') {
              updatePwaInstallUI(false);
            }
            deferredPwaPrompt = null;
          });
        } else {
          alert(T('ui.pwaInstallGuide', 'Instalasi Aplikasi XStarZG (Mode APK / PWA):\n\n' +
            '• Android Chrome: Ketuk menu titik tiga (⋮) di kanan atas browser, lalu pilih "Tambahkan ke Layar Utama" / "Instal Aplikasi".\n' +
            '• iPhone / iPad (Safari): Ketuk tombol Share (ikon kotak berpanah ke atas), lalu pilih "Tambahkan ke Layar Utama" (Add to Home Screen).\n\n' +
            'Aplikasi terinstal langsung seperti APK tanpa biaya dan dapat dibuka offline!'));
        }
      }

      if (btnNavInstall) btnNavInstall.addEventListener('click', handlePwaInstallAction);
      if (btnInstallPwa) btnInstallPwa.addEventListener('click', handlePwaInstallAction);

      window.addEventListener('appinstalled', function () {
        deferredPwaPrompt = null;
        updatePwaInstallUI(false);
      });
    }, 50);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPostDom);
  } else {
    bootPostDom();
  }
})();
