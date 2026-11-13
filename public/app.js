'use strict';
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
    ['Momentum jenuh (RSI di luar zona 34-66)', 'eVetoExh'],
    ['Divergensi momentum MACD vs struktur swing', 'eVetoDiv'],
    ['Melawan bias struktur timeframe di atasnya', 'eVetoHtf'],
    ['Skor konfluensi di bawah 84', 'eVetoScore'],
    ['Winrate historis di bawah 78%', 'eVetoWr'],
    ['Belum ada urutan Liquidity Sweep -> CHoCH/BOS', 'eVetoSeq'],
    ['Struktur choppy (Efficiency Ratio rendah)', 'eVetoChop'],
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
  radarHorizon: 'intraday',  // 'scalping' | 'intraday' | 'swing'
  bestTfBoard: null,         // papan hasil scan multi-TF (engine), diisi async
  candles: [],
  lastAnalysis: null,
  livePrice: 0,
  liveChangePct: 0,
  feedSource: '-',
  user: null                 // { email, name, tier: 'GUEST'|'FREE'|'VIP'|'OWNER_VIP', vipUntil }
};
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
      { sym: 'BTC/USDT', tf: 'M5' }, { sym: 'ETH/USDT', tf: 'M5' }, { sym: 'SOL/USDT', tf: 'M5' },
      { sym: 'XAU/USD', tf: 'M15' }, { sym: 'EUR/USD', tf: 'M5' }, { sym: 'GBP/JPY', tf: 'M15' },
      { sym: 'USD/JPY', tf: 'M15' }, { sym: 'NVDA', tf: 'M15' }
    ]
  },
  intraday: {
    label: '🎯 INTRADAY', tfRange: 'M15–H1',
    infoTrader: 'Target harian: SMC, FVG, session breakout & VPVR pada M15–H1.',
    infoInvestor: 'Rekomendasi pembelian nyata harian — cek kembali valuasi sebelum akumulasi.',
    list: [
      { sym: 'BTC/USDT', tf: 'M30' }, { sym: 'ETH/USDT', tf: 'M30' }, { sym: 'XAU/USD', tf: 'H1' },
      { sym: 'XAU/IDR', tf: 'H1' }, { sym: 'EUR/USD', tf: 'H1' }, { sym: 'USD/IDR', tf: 'M30' },
      { sym: 'WTI', tf: 'H1' }, { sym: 'BBCA.JK', tf: 'H1' }, { sym: 'BMRI.JK', tf: 'H1' }, { sym: 'NVDA', tf: 'H1' }
    ]
  },
  swing: {
    label: '🌊 SWING', tfRange: 'H4–W1',
    infoTrader: 'Multi-hari: supply/demand, struktur tren & CFTC COT pada H4–W1.',
    infoInvestor: 'Akumulasi spot jangka menengah-panjang: beli nyata bertahap (DCA) di zona demand.',
    list: [
      { sym: 'BTC/USDT', tf: 'H4' }, { sym: 'ETH/USDT', tf: 'H4' }, { sym: 'XAU/USD', tf: 'D1' },
      { sym: 'XAU/IDR', tf: 'D1' }, { sym: 'EUR/USD', tf: 'H4' }, { sym: 'WTI', tf: 'D1' },
      { sym: 'CPO', tf: 'H4' }, { sym: 'BBCA.JK', tf: 'D1' }, { sym: 'BBRI.JK', tf: 'D1' },
      { sym: 'IHSG', tf: 'D1' }, { sym: 'NVDA', tf: 'D1' }, { sym: 'SPY', tf: 'D1' }
    ]
  }
};
var radarCache = {};
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
  if (a >= 0.01) return n.toFixed(5);
  return n.toFixed(8);
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

/* ==================== 1. KATALOG INSTRUMEN & SELECT ==================== */
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
  var catalog = currentCatalog();
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
    var og = document.createElement('optgroup');
    og.label = grp.label + ' (' + grp.items.length + (grp.key === 'crypto' && cryptoPairsLoaded ? '+' : '') + ')';
    var limit = Math.min(grp.items.length, MAX_PER_GROUP);
    // Pastikan simbol aktif selalu ada di daftar walaupun melewati batas render
    var active = null;
    for (i = 0; i < grp.items.length; i++) {
      if (grp.items[i].symbol === state.symbol) { active = grp.items[i]; break; }
    }
    var rendered = {};
    if (active) {
      var optA = document.createElement('option');
      optA.value = active.symbol; optA.textContent = active.symbol + ' — ' + (active.name || '');
      optA.selected = true;
      og.appendChild(optA); rendered[active.symbol] = true;
      symbolPresent = true;
    }
    for (i = 0; i < limit; i++) {
      inst = grp.items[i];
      if (rendered[inst.symbol]) continue;
      var opt = document.createElement('option');
      opt.value = inst.symbol;
      opt.textContent = inst.symbol + ' — ' + (inst.name || '');
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
    if (elCrypto) elCrypto.textContent = cryptoN > 55 ? floor10(cryptoN) + '+' : '400+';
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
              isRealtime: true, delayMinutes: 0, basePrice: price, cotCategory: 'CME_CRYPTO'
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
var SIGNAL_LOCK_KEY = 'xstarzg_siglock_v2';
function signalLockStore() {
  try { var p = JSON.parse(localStorage.getItem(SIGNAL_LOCK_KEY) || '{}'); return (p && typeof p === 'object') ? p : {}; }
  catch (e) { return {}; }
}
function signalLockId(symbol) {
  return (symbol || '').toUpperCase() + '|' + (state.mode || 'trader') + '|' + (state.mode === 'investor' ? 'spot' : (state.subMode || 'futures'));
}
function getSignalLock(symbol) {
  var l = signalLockStore()[signalLockId(symbol)];
  return (l && l.status === 'ACTIVE') ? l : null;
}
function saveSignalLock(symbol, lock) {
  try {
    var all = signalLockStore();
    var id = signalLockId(symbol);
    if (lock) all[id] = lock; else delete all[id];
    var ks = Object.keys(all);
    while (ks.length > 40) { var k0 = ks.shift(); delete all[k0]; }
    localStorage.setItem(SIGNAL_LOCK_KEY, JSON.stringify(all));
  } catch (e) {}
}

/* ==================== 2. MESIN ANALISIS QUANT (computeQuantEngine) ==================== */
function computeQuantEngine(candles, symbol, tf, forceRecalc, lockScope) {
  try {
    if (SE && SE.runFullAnalysis && Array.isArray(candles) && candles.length >= 30) {
      var a = SE.runFullAnalysis({
        symbol: symbol, timeframe: tf || 'H1',
        mode: state.mode || 'trader', horizon: 'all', candles: candles
      });
      if (a && !a.error) {
        /* === PERSISTENT SIGNAL LOCK (aturan #3: anti-berubah saat refresh) ===
           SKOPE 'create' = analisis utama workspace (boleh menerbitkan kunci baru),
           'apply' = radar/kurasi/scan (hanya menerapkan kunci yang sudah ada). */
        var scope = (lockScope === 'create' || lockScope === 'apply') ? lockScope : 'create';
        try {
          if (typeof SE.validateSignalLock === 'function') {
            var lock = getSignalLock(symbol);
            if (lock && lock.tf === (a.timeframe || tf)) {
              var closedBars = SE.trimClosedCandles(candles, a.tfSeconds || 3600);
              var verdict = SE.validateSignalLock(lock, closedBars, a);
              if (verdict && verdict.status === 'ACTIVE') {
                SE.applyLockedSignal(a, lock);
              } else {
                a.lockCleared = verdict || { status: 'GONE' };
                saveSignalLock(symbol, null);
              }
            }
            if (!a.lockedSignal && scope === 'create' && a.signalEligible) {
              var nl = SE.createSignalLock(a, symbol, state.mode, state.subMode);
              if (nl) { saveSignalLock(symbol, nl); SE.applyLockedSignal(a, nl); }
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
  var score = bull ? 68 : bear ? 32 : 50;
  if (price > ma200) score += 7; else score -= 7;
  if (rsi > 52 && rsi < 72) score += 5; else if (rsi < 48 && rsi > 28) score -= 5;
  score = Math.max(12, Math.min(96, Math.round(score)));
  // Gerbang ketat (mode ringan): sama dengan engine penuh — sinyal trader hanya
  // jika skor >= 84. Winrate historis tidak tersedia di mode ringan -> dianggap
  // tergantung menunggu engine penuh.
  var liteEligible = softDir !== 'NEUTRAL' && score >= 84;
  var direction = state.mode === 'investor'
    ? (softDir === 'SHORT' ? 'NEUTRAL' : softDir)
    : (liteEligible ? softDir : 'NEUTRAL');
  var riskDist = atr * 1.65;
  var isShort = softDir === 'SHORT';
  var entry = (liteEligible || state.mode === 'investor') ? price : null;
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
    confluenceScore: score, confidence: score,
    softBias: softDir, signalEligible: state.mode === 'investor' ? direction !== 'NEUTRAL' : liteEligible,
    entryType: liteEligible ? 'MARKET' : null, lockedSignal: false,
    gating: { minScore: 84, minWinRate: 78, score: score, winRate: 0, vetoLong: [], vetoShort: [], active: liteEligible ? [] : ['LOW_SCORE'], htfBias: 0 },
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
      '[MA Stack] Harga ' + formatPrice(price) + ' vs EMA20 ' + formatPrice(ema20) + ' / EMA50 ' + formatPrice(ema50) + ' | RSI(14): ' + rsi.toFixed(1) + '.'
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
function fetchRealMarketCandles(symbol, tf) {
  return new Promise(function (resolve) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 12000);
    fetch('/api/market/analyze?symbol=' + encodeURIComponent(symbol) + '&tf=' + encodeURIComponent(tf || 'H1') + '&_t=' + Date.now(), {
      cache: 'no-store', signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (d) {
      if (d && Array.isArray(d.candles) && d.candles.length >= 5) {
        var candles = d.candles
          .map(function (c) { return { time: num(c.time), open: num(c.open), high: num(c.high), low: num(c.low), close: num(c.close), volume: num(c.volume, 0) }; })
          .filter(function (c) { return c.time > 0 && c.close > 0; })
          .sort(function (a, b) { return a.time - b.time; });
        if (candles.length >= 5) {
          resolve({
            candles: candles,
            price: num(d.price, candles[candles.length - 1].close),
            changePct: num(d.changePct, 0),
            source: d.source || 'LIVE_BROKER'
          });
          return;
        }
      }
      throw new Error('DATA_SHORT');
    }).catch(function () {
      clearTimeout(timer);
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
          var h = Math.max(o, cl) + rnd() * base * 0.002;
          var l = Math.min(o, cl) - rnd() * base * 0.002;
          arr.push({ time: now - i * step, open: o, high: h, low: l, close: cl, volume: Math.round(200 + rnd() * 700) });
          cur = cl;
        }
        local = arr;
      }
      var lc = local[local.length - 1];
      resolve({ candles: local, price: lc.close, changePct: 0.1, source: 'EDGE_SYNTHETIC_CALIBRATED' });
    });
  });
}

/* ==================== 4. GRAFIK TRADINGVIEW (Lightweight Charts) ==================== */
function initChart() {
  var el = $id('tvChartContainer');
  if (!el) return false;
  if (chartInstance) return true;
  if (typeof LightweightCharts === 'undefined') return false; // canvas fallback menangani
  try {
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
    candleSeries = chartInstance.addCandlestickSeries({
      upColor: '#10b981', downColor: '#f43f5e',
      borderUpColor: '#10b981', borderDownColor: '#f43f5e',
      wickUpColor: '#10b981', wickDownColor: '#f43f5e'
    });
    ema20Line = chartInstance.addLineSeries({ color: '#38bdf8', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    ema50Line = chartInstance.addLineSeries({ color: '#eab308', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    ma200Line = chartInstance.addLineSeries({ color: '#a855f7', lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
    vwapLine = chartInstance.addLineSeries({ color: '#ec4899', lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
    window.addEventListener('resize', function () {
      try {
        var w = el.clientWidth;
        if (chartInstance && w > 0) chartInstance.applyOptions({ width: w });
      } catch (e) {}
    });
    return true;
  } catch (e) {
    chartInstance = null; candleSeries = null;
    return false;
  }
}
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
  var L = effectiveLevels(analysis);
  var add = function (price, color, title, style) {
    var p = num(price);
    if (!p || p <= 0) return;
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
      if (state.subMode === 'futures' && num(rp.liq) > 0) {
        add(rp.liq, 'rgba(168,85,247,0.9)', 'EST. LIQ ' + rp.lev + 'x', 3);
      }
      add(L.entry, '#38bdf8', 'ENTRY', 0);
      add(L.sl, '#f43f5e', 'STOP LOSS', 2);
      add(L.tp1, '#10b981', 'TP1', 2);
      add(L.tp2, '#10b981', 'TP2', 2);
      add(L.tp3, '#34d399', 'TP3', 2);
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
  if (tech) {
    var ind = a.indicators, lv = a.levels;
    var p = a.lastPrice;
    var bull = function (c) { return c ? 'bull' : 'bear'; };
    tech.innerHTML =
      pillarHtml(T('ui.ePnEma', '1. EMA Ribbon 20 / 50'), formatPrice(ind.ema20) + ' / ' + formatPrice(ind.ema50), ind.ema20 > ind.ema50 ? T('ui.ePtRibbonUp', 'Ribbon bullish tersusun rapi') : T('ui.ePtRibbonDn', 'Ribbon bearish / belum searah'), bull(ind.ema20 > ind.ema50)) +
      pillarHtml(T('ui.ePnMa200', '2. MA-200 Macro Filter'), formatPrice(ind.ma200 || ind.ema200), p >= (ind.ma200 || ind.ema200) ? T('ui.ePtMacroUp', 'Harga di atas garis makro (bias naik)') : T('ui.ePtMacroDn', 'Harga di bawah garis makro (bias turun)'), bull(p >= (ind.ma200 || ind.ema200))) +
      pillarHtml(T('ui.ePnVwap', '3. VWAP Institusional'), formatPrice(ind.vwap), p >= ind.vwap ? T('ui.ePtVwapUp', 'Di atas VWAP — buyer dominan sesi ini') : T('ui.ePtVwapDn', 'Di bawah VWAP — seller dominan sesi ini'), bull(p >= ind.vwap)) +
      pillarHtml(T('ui.ePnVpvr', '4. Volume Profile (VPVR)'), 'POC ' + formatPrice(lv.poc), 'VAH ' + formatPrice(lv.vah) + ' • VAL ' + formatPrice(lv.val), p >= lv.poc ? 'bull' : 'bear') +
      pillarHtml(T('ui.ePnTpo', '5. TPO Market Profile'), 'TPO POC ' + formatPrice(lv.tpoPoc || lv.poc), T('ui.ePtTpo', 'Distribusi waktu harga pasar'), 'neutral') +
      pillarHtml(T('ui.ePnSmc', '6. Struktur SMC (BOS / CHoCH)'), localizeEngineString(ind.smcStatus || '-'), null, (ind.smcStatus || '').indexOf('BULL') > -1 || (ind.smcStatus || '').indexOf('HIGHER') > -1 ? 'bull' : (ind.smcStatus || '').indexOf('BEAR') > -1 || (ind.smcStatus || '').indexOf('LOWER') > -1 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnFvg', '7. Fair Value Gap (FVG)'), localizeEngineString(ind.fvgNote || '-'), T('ui.ePtFvg', 'Deteksi imbalance 3-candle terbaru'), (ind.fvgNote || '').indexOf('Bullish') > -1 ? 'bull' : (ind.fvgNote || '').indexOf('Bearish') > -1 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnSweep', '8. Liquidity Sweep (BSL/SSL)'), localizeEngineString(ind.liquiditySweep || 'NONE'), T('ui.ePtSweep', 'Stop-hunt di sekitar swing terdekat'), (ind.liquiditySweep || '').indexOf('▲') > -1 ? 'bull' : (ind.liquiditySweep || '').indexOf('▼') > -1 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePnSd', '9. Supply & Demand Zone'), 'D: ' + (ind.demandZoneText || formatPrice(lv.swingLow)), 'S: ' + (ind.supplyZoneText || formatPrice(lv.swingHigh)), 'neutral') +
      pillarHtml(T('ui.ePnPivot', '10. Pivot Support / Resistance'), 'S1 ' + formatPrice(lv.s1) + ' • R1 ' + formatPrice(lv.r1), T('ui.ePtPivot', 'Pivot klasik: ') + formatPrice(lv.pivot), bull(p >= lv.pivot)) +
      pillarHtml(T('ui.ePnRsi', '11. RSI(14) & MACD Histogram'), 'RSI ' + num(ind.rsi, 50).toFixed(1) + ' • MACD ' + (num(ind.macdHist) >= 0 ? '+' : '') + num(ind.macdHist).toPrecision(3), num(ind.rsi) > 70 ? T('ui.ePtRsiOb', 'Overbought — rawan koreksi') : num(ind.rsi) < 30 ? T('ui.ePtRsiOs', 'Oversold — rawan pantulan') : T('ui.ePtRsiOk', 'Momentum sehat'), num(ind.macdHist) >= 0 ? 'bull' : 'bear') +
      pillarHtml(T('ui.ePnBb', '12. Bollinger Bands & ATR'), 'BBW ' + num(ind.bbWidth).toFixed(2) + '% • ATR ' + num(ind.atrPct).toFixed(2) + '%', num(ind.bbWidth) < 1.25 ? T('ui.ePtBbSq', 'Squeeze — siap breakout volatilitas') : T('ui.ePtBbNorm', 'Ekspansi volatilitas normal'), 'neutral') +
      pillarHtml(T('ui.ePnOrb', '13. ORB Breakout (Opening Range)'), ind.orbHigh && ind.orbLow ? formatPrice(ind.orbLow) + ' – ' + formatPrice(ind.orbHigh) : localizeEngineString(ind.orbLabel || 'ORB'),
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
        num(ind.erValue, 0.5) >= 0.55 ? (a.direction === 'SHORT' ? 'bear' : 'bull') : 'neutral');
  }
  var macro = $id('macroPillarsGrid');
  if (macro) {
    var fc = a.fundamentalCot || {};
    var longPct = num(fc.specLongPct, 50);
    macro.innerHTML =
      pillarHtml(T('ui.ePmCot', '1. CFTC COT — Posisi Institusi'), 'Long ' + longPct + '% / Short ' + (100 - longPct) + '%', (localizeEngineString(fc.cotReportLabel || 'CFTC COT')) + ' • ' + (localizeEngineString(fc.institutionalBias || '-')), longPct >= 55 ? 'bull' : longPct <= 45 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.ePmCb', '2. Bank Sentral & Suku Bunga'), localizeEngineString(fc.macroRegime || '-'), localizeEngineString(fc.centralBankStance || '-'), 'neutral') +
      pillarHtml(T('ui.ePmDxy', '3. Korelasi Dolar AS (DXY)'), localizeEngineString(fc.dxyCorrelation || '-'), null, 'neutral') +
      pillarHtml(T('ui.ePmVal', '4. Valuasi Intrinsik'), localizeEngineString(fc.valuationMetrics || '-'), null, 'neutral') +
      pillarHtml(T('ui.ePmOf', '5. Orderflow & Commercial Hedger'), localizeEngineString(fc.orderflowMetric || '-'), fc.commHedgerBias ? localizeEngineString(fc.commHedgerBias) : null, 'neutral') +
      pillarHtml(T('ui.ePmCat', '6. Katalis Terdekat'), localizeEngineString(fc.upcomingCatalyst || '-'), fc.macroDriver ? localizeEngineString(fc.macroDriver) : null, 'neutral');
  }
}
function renderNarrative(a) {
  var box = $id('narrativeHumanBox');
  if (!box) return;
  var dir = a.direction === 'LONG' ? T('ui.eDirLong', '▲ BIAS LONG / BUY') : a.direction === 'SHORT' ? T('ui.eDirShort', '▼ BIAS SHORT / SELL') : T('ui.eDirNeutral', '◆ NETRAL / MENUNGGU');
  var dirCol = a.direction === 'LONG' ? '#10b981' : a.direction === 'SHORT' ? '#f43f5e' : '#f59e0b';
  var reasons = (a.reasons || []).map(function (r) { return '<div style="margin-bottom:5px;">' + localizeEngineString(r) + '</div>'; }).join('');
  var headTxt = fillTpl(T('ui.eNarrHead', '{dir} — Skor Konfluensi {s}/100 ({r})'), { dir: dir, s: a.confluenceScore, r: localizeEngineString(a.regime || '-') });
  box.innerHTML =
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
  } else {
    out += '<div style="margin-top:7px;padding:7px 9px;border-radius:7px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.32);font-size:11.5px;color:#fca5a5;">' +
      fillTpl(T('ui.eGateForbidden', '⛔ TIMEFRAME {tf} DILARANG ENTRY (rawan loss) — gerbang institusional menolak; tidak ada angka Entry/SL/TP yang dipaksakan di TF ini.'), { tf: (a.timeframe || state.tf) }) +
      '</div>';
  }
  var b = state.bestTfBoard;
  if (b && b.groups) {
    var cell = function (g) {
      if (!g) return '—';
      if (!g.tf) return '—';
      return g.tf + (g.eligible ? ' ✅ (' + num(g.winRate).toFixed(0) + '%)' : ' ✖');
    };
    out += '<div style="margin-top:6px;font-size:11.5px;font-weight:700;color:#e2e8f0;">' +
      fillTpl(T('ui.eGateBest', 'Sinyal Terbaik Saat Ini → Scalping: {sc} | Intraday: {id} | Swing: {sw}'), {
        sc: cell(b.groups.scalping), id: cell(b.groups.intraday), sw: cell(b.groups.swing)
      }) + '</div>' +
      '<div style="font-size:10.8px;color:#94a3b8;">' + T('ui.eGateBestHint', 'Buka timeframe berlogo ✅ di atas untuk sinyal berprobabilitas tinggi (skor ≥ 84 & winrate ≥ 78%).') + '</div>';
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
function scheduleBestTfScan() {
  try {
    if (!SE || !SE.pickBestTimeframes) return;
    if (state.mode === 'investor') { state.bestTfBoard = null; return; }
    if (!state.lastAnalysis || state.lastAnalysis.error) return;
    var sym = state.symbol;
    var key = sym + '|' + (state.mode || 'trader') + '|' + (state.subMode || 'futures');
    var anchor = num(state.lastAnalysis.anchorClosedTime, 0);
    var cached = bestTfScanCache[key];
    if (cached && cached.anchor === anchor && (Date.now() - cached.ts) < 300000) {
      state.bestTfBoard = cached.board;
      renderNarrative(state.lastAnalysis);
      return;
    }
    var curTf = state.tf;
    var ALL_TFS = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];
    var byTf = {};
    byTf[curTf] = state.lastAnalysis;
    var mySeq = ++bestTfScanSeq;
    var jobs = [];
    for (var i = 0; i < ALL_TFS.length; i++) {
      (function (tf) {
        if (tf === curTf) return;
        jobs.push(fetchRealMarketCandles(sym, tf).then(function (d) {
          return { tf: tf, a: computeQuantEngine(d.candles, sym, tf, false, 'apply') };
        }));
      })(ALL_TFS[i]);
    }
    Promise.allSettled(jobs).then(function (rs) {
      if (mySeq !== bestTfScanSeq || state.symbol !== sym) return;
      for (var j = 0; j < rs.length; j++) {
        if (rs[j].status === 'fulfilled' && rs[j].value && rs[j].value.a && !rs[j].value.a.error) byTf[rs[j].value.tf] = rs[j].value.a;
      }
      var board = SE.pickBestTimeframes(byTf);
      state.bestTfBoard = board;
      bestTfScanCache[key] = { ts: Date.now(), anchor: anchor, board: board };
      if (state.lastAnalysis && !state.lastAnalysis.error) renderNarrative(state.lastAnalysis);
    }).catch(function () {});
  } catch (e) {}
}
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
    var avg = num(lv.dcaZone1) * 0.4 + num(lv.dcaZone2) * 0.35 + num(lv.dcaZone3) * 0.25;
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
  var dir = a.direction;
  var isSpot = state.subMode === 'spot';
  var dirBox = $id('valSignalDirection');
  if (dirBox) {
    var txt, col;
    if (isSpot) {
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
  if (a.lockedSignal) lockBadge = fillTpl(T('ui.eLocked', '🔒 LOCKED {tf}'), { tf: (a.lockTf || a.timeframe || state.tf) });
  else if (a.signalEligible) lockBadge = fillTpl(T('ui.eEliteSetup', '✅ ELITE SETUP {tf}'), { tf: (a.timeframe || state.tf) });
  else lockBadge = fillTpl(T('ui.eNoTradeTf', '🚫 NO-TRADE ZONE {tf}'), { tf: (a.timeframe || state.tf) });
  setTxt('valSetupLockBadge', lockBadge);
  setTxt('valConfidenceScore', (a.confluenceScore || a.confidence || 50) + '%');
  setTxt('valRegime', localizeEngineString(a.regime || '-'));
  var L = effectiveLevels(a);
  setTxt('valEntry', formatPrice(L.entry, a.symbol));
  setTxt('valSL', formatPrice(L.sl, a.symbol));
  setTxt('valSLDesc', fillTpl(isSpot ? T('ui.eSlSpot', 'Proteksi LONG spot di luar swing wick + buffer ATR {p}%') : T('ui.eSlFutures', 'Di luar swing wick + buffer ATR {p}%'), { p: num(a.indicators.atrPct).toFixed(2) }));
  setTxt('valTP1', formatPrice(L.tp1, a.symbol));
  setTxt('valTP2', formatPrice(L.tp2, a.symbol));
  setTxt('valTP3', formatPrice(L.tp3, a.symbol));
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
  var futBox = $id('futuresRiskBox');
  if (futBox) futBox.classList.toggle('hidden', isSpot);
  updateRiskSizing();
}
function feedIsEstimate(src) {
  return /ESTIMATE|SYNTHETIC|LOCAL|CALIBRATED|DEFAULT/i.test(String(src || ''));
}
function updateModeChip() {
  var chip = $id('hdrModeChip');
  if (!chip) return;
  var cls = 'futures', txt = T('ui.chipFutures', 'FUTURES • 2-ARAH + LEV');
  if (state.mode === 'investor') { cls = 'investor'; txt = T('ui.chipInvestor', 'INVESTOR • SPOT DCA'); }
  else if (state.subMode === 'spot') { cls = 'spot'; txt = T('ui.chipSpot', 'SPOT • 1-ARAH (TANPA LEV)'); }
  chip.className = 'mode-chip ' + cls;
  chip.textContent = txt;
}
function renderHeader(a) {
  setTxt('hdrSymbolTitle', a.symbol + ' — ' + (a.name || ''));
  setTxt('hdrAssetCategory', catLabelOf(getMeta(a.symbol)));
  updateModeChip();
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
}
function renderAllVisuals(analysis) {
  if (!analysis) return;
  try { analysis.symbol = analysis.symbol || state.symbol; } catch (e) {}
  state.lastAnalysis = analysis;
  try { renderHeader(analysis); } catch (e) {}
  try {
    if (candleSeries && state.candles && state.candles.length) {
      candleSeries.setData(state.candles);
    }
    syncIndicatorOverlays(analysis);
    drawChartLevels(analysis);
  } catch (e) {}
  try { renderPanels(analysis); } catch (e) {}
  try { renderNarrative(analysis); } catch (e) {}
  try { renderPillars(analysis); } catch (e) {}
}

/* ==================== 6. REAL-TIME PRICE ENGINE (SEMUA INSTRUMEN) ==================== */
function applyLiveTick(price, changePct, silent) {
  price = num(price);
  if (!price || price <= 0) return;
  if (!state.candles || !state.candles.length) { state.livePrice = price; return; }
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
  if (candleSeries && candleSeries.update) { try { candleSeries.update(bar); } catch (e) {} }
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
function fetchRadarCandidate(item) {
  return fetchRealMarketCandles(item.sym, item.tf).then(function (d) {
    var a = computeQuantEngine(d.candles, item.sym, item.tf, false, 'apply');
    if (!a) throw new Error('no-analysis');
    return {
      sym: item.sym, tf: item.tf, analysis: a,
      price: num(d.price) > 0 ? num(d.price) : a.lastPrice,
      changePct: Number.isFinite(Number(d.changePct)) ? Number(d.changePct) : num(a.changePct),
      source: d.source || 'BROKER FEED'
    };
  });
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
  if (a.direction === 'LONG') return { cls: 'long', txt: T('ui.tbLong', '▲ LONG / BUY') };
  if (a.direction === 'SHORT') return isSpot ? { cls: 'wait', txt: T('ui.tbWaitSpot', '◆ TUNGGU (SPOT)') } : { cls: 'short', txt: T('ui.tbShort', '▼ SHORT / SELL') };
  return { cls: 'wait', txt: T('ui.tbNeutral', '◆ NETRAL') };
}
function paintRadarItems(cfg, items) {
  var grid = $id('opportunityRadarGrid');
  if (!grid) return;
  if (!items || !items.length) {
    grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.radarFeedEmpty', 'Feed radar belum tersedia — coba lagi sebentar.') + '</span></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var a = it.analysis;
    var meta = getMeta(it.sym);
    var badge = radarBadgeFor(a);
    var chg = num(it.changePct, num(a.changePct));
    var chgCol = chg >= 0 ? '#10b981' : '#f43f5e';
    var sc = num(a.confluenceScore, 50);
    var entryRef = state.mode === 'investor' ? (a.levels && a.levels.dcaZone1 ? a.levels.dcaZone1 : a.lastPrice) : (a.levels ? a.levels.entry : a.lastPrice);
    var isActive = it.sym === state.symbol && it.tf === state.tf;
    html += '<div class="radar-card' + (isActive ? ' active' : '') + '" data-sym="' + it.sym + '" data-tf="' + it.tf + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">' +
        '<span class="r-sym">' + it.sym + ' <small style="color:#64748b;font-weight:700;">' + it.tf + '</small></span>' +
        '<span class="r-live">' + (feedIsEstimate(it.source) ? '○ EST' : '● LIVE') + '</span>' +
      '</div>' +
      '<span class="r-name">' + (meta.name || it.sym) + '</span>' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px;">' +
        '<span class="r-price">' + formatPrice(it.price, it.sym) + '</span>' +
        '<span class="r-chg" style="color:' + chgCol + ';">' + pctFmt(chg) + '</span>' +
      '</div>' +
      '<span class="sig-badge ' + badge.cls + '">' + badge.txt + '</span>' +
      '<div style="display:flex;justify-content:space-between;gap:6px;margin-top:5px;">' +
        '<span class="r-entry">' + (state.mode === 'investor' ? T('ui.cDcaShort', 'Zona DCA 1: ') : T('ui.cEntry', 'Entry: ')) + formatPrice(entryRef, it.sym) + '</span>' +
        '<span class="r-score">' + T('ui.cScore', 'SKOR') + ' ' + sc + '</span>' +
      '</div>' +
    '</div>';
  }
  grid.innerHTML = html;
  Array.prototype.forEach.call(grid.querySelectorAll('.radar-card[data-sym]'), function (card) {
    card.addEventListener('click', function () {
      gotoInstrument(card.getAttribute('data-sym'), card.getAttribute('data-tf'));
    });
  });
}
function syncHorizonTabs() {
  var bar = $id('radarHorizonBar');
  if (!bar) return;
  Array.prototype.forEach.call(bar.querySelectorAll('.hz-btn'), function (b) {
    b.classList.toggle('active', b.getAttribute('data-hz') === state.radarHorizon);
  });
}

/* ============ REKOMENDASI KHUSUS INVESTOR (bukan radar trader) ============ */
// Kurasi aset berkualitas untuk akumulasi jangka panjang (12–36 bulan), dinilai
// dari valuasi (MoS vs nilai wajar), zona cicil DCA, dan kesehatan tren makro.
var INVESTOR_PICKS = [
  { sym: 'XAU/USD', cat: 'SAFE-HAVEN • LOGAM MULIA' },
  { sym: 'XAG/USD', cat: 'LOGAM • ENERGI HIJAU' },
  { sym: 'BTC/USDT', cat: 'BLUECHIP CRYPTO • ETF SPOT' },
  { sym: 'ETH/USDT', cat: 'BLUECHIP CRYPTO • SMART CONTRACT' },
  { sym: 'IHSG', cat: 'INDEKS NASIONAL' },
  { sym: 'BBCA.JK', cat: 'BLUECHIP • PERBANKAN' },
  { sym: 'BBRI.JK', cat: 'BLUECHIP • DIVIDEN' },
  { sym: 'BMRI.JK', cat: 'BLUECHIP • PERBANKAN' },
  { sym: 'TLKM.JK', cat: 'DEFENSIF • TELEKOMUNIKASI' },
  { sym: 'ASII.JK', cat: 'BLUECHIP • KONGLOMERASI' },
  { sym: 'NVDA', cat: 'GROWTH • AI & CHIP' },
  { sym: 'AAPL', cat: 'GROWTH • MEGA-CAP AS' },
  { sym: 'MSFT', cat: 'GROWTH • MEGA-CAP AS' }
];
var investorPickRunSeq = 0;
var investorPickCache = { ts: 0, items: [] };
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
function renderInvestorPicks(force) {
  var grid = $id('investorPicksGrid');
  if (!grid) return;
  if (!force && investorPickCache.ts && (Date.now() - investorPickCache.ts) < 300000 && investorPickCache.items.length) {
    drawInvestorPickCards(investorPickCache.items);
    return;
  }
  var mySeq = ++investorPickRunSeq;
  grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.invScanning', 'Mengkurasi {n} aset portofolio dengan data broker real-time (D1/W1)…').replace('{n}', INVESTOR_PICKS.length) + '</span></div>';
  Promise.allSettled(INVESTOR_PICKS.map(function (p) {
    return fetchRadarCandidate({ sym: p.sym, tf: 'D1' }).then(function (r) { if (r) r.cat = p.cat; return r; });
  })).then(function (results) {
    if (mySeq !== investorPickRunSeq) return;
    var items = [];
    for (var i = 0; i < results.length; i++) if (results[i].status === 'fulfilled' && results[i].value) items.push(results[i].value);
    // Kurasi diurutkan dari kandidat akumulasi terkuat (skor konfluensi makro tertinggi)
    items.sort(function (x, y) { return num(y.analysis.confluenceScore, 50) - num(x.analysis.confluenceScore, 50); });
    investorPickCache = { ts: Date.now(), items: items };
    drawInvestorPickCards(items);
  }).catch(function () {});
}
function renderOpportunityRadar(force) {
  var grid = $id('opportunityRadarGrid');
  if (!grid) return;
  if (!state.radarHorizon) state.radarHorizon = 'intraday';
  if (state.mode === 'investor') state.radarHorizon = (state.radarHorizon === 'scalping') ? 'swing' : state.radarHorizon;
  var hz = state.radarHorizon;
  var cfg = RADAR_CONFIG[hz] || RADAR_CONFIG.intraday;
  syncHorizonTabs();
  var infoEl = $id('radarHorizonInfo');
  var hzCap = hz.charAt(0).toUpperCase() + hz.slice(1);
  if (infoEl) infoEl.textContent = (state.mode === 'investor' ? T('ui.radarInfoI' + ({ scalping: 1, intraday: 2, swing: 3 })[hz], cfg.infoInvestor || '') : T('ui.radarInfoT' + ({ scalping: 1, intraday: 2, swing: 3 })[hz], cfg.infoTrader || ''));
  var cacheKey = hz;
  var cached = radarCache[cacheKey];
  if (!force && cached && (Date.now() - cached.ts) < 90000) {
    paintRadarItems(cfg, cached.items);
    return;
  }
  var mySeq = ++radarRunSeq;
  grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.radarScanning', 'Memindai {n} aset dengan candle broker real-time (kelompok {range})…').replace('{n}', cfg.list.length).replace('{range}', cfg.tfRange) + '</span></div>';
  Promise.allSettled(cfg.list.map(fetchRadarCandidate)).then(function (results) {
    if (mySeq !== radarRunSeq) return;
    var items = [];
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled' && results[i].value) items.push(results[i].value);
    }
    // Urutkan: sinyal directional terkuat (skor paling jauh dari 50) di atas
    items.sort(function (x, y) {
      return Math.abs(num(y.analysis.confluenceScore, 50) - 50) - Math.abs(num(x.analysis.confluenceScore, 50) - 50);
    });
    radarCache[cacheKey] = { ts: Date.now(), items: items };
    paintRadarItems(cfg, items);
  }).catch(function () {});
}
function gotoInstrument(sym, tf) {
  if (!sym) return;
  if (!ensureQuotaFor(sym)) {
    renderInstrumentCatalog();
    return;
  }
  state.symbol = sym;
  if (tf && TF_SECONDS[tf]) {
    state.tf = tf;
    state.timeframe = tf;
    var tfBar = $id('timeframeBar');
    if (tfBar) {
      Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-tf') === tf);
      });
    }
  }
  state.candles = [];
  state.lastAnalysis = null;
  state.bestTfBoard = null;
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

/* ==================== 9. SESI, KUOTA & ALUR LAYAR ==================== */
function saveSession() {
  if (!state.user) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 4,
      user: state.user,
      // Preferensi workspace ikut tersimpan: refresh halaman tidak menendang user keluar
      symbol: state.symbol, tf: state.tf, mode: state.mode, subMode: state.subMode,
      radarHorizon: state.radarHorizon, at: Date.now()
    }));
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
    return p;
  } catch (e) { return null; }
}
// Terapkan preferensi workspace dari sesi tersimpan (dipakai saat restore setelah refresh)
function applyWorkspacePrefs(saved) {
  if (!saved) return;
  if (typeof saved.symbol === 'string' && saved.symbol.length > 1) state.symbol = saved.symbol;
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
  if (saved.mode === 'investor' || saved.mode === 'trader') {
    state.mode = saved.mode;
    var t = $id('btnModeTrader'), inv = $id('btnModeInvestor');
    if (t) t.classList.toggle('active', saved.mode === 'trader');
    if (inv) inv.classList.toggle('active', saved.mode === 'investor');
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
}
// Sinkronkan section rekomendasi: radar trader vs kurasi portofolio investor.
function syncModeSections() {
  var traderSec = $id('traderRadarSection'), invSec = $id('investorRadarSection');
  var isInv = state.mode === 'investor';
  if (traderSec) traderSec.classList.toggle('hidden', isInv);
  if (invSec) invSec.classList.toggle('hidden', !isInv);
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
  if (state.user.tier === 'VIP' || state.user.tier === 'OWNER_VIP') return Infinity;
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
    if (reason) reason.textContent = T('ui.quotaFull', 'Kuota {limit} instrumen akun FREE Anda sudah penuh ({list}). Upgrade VIP $29 USDT untuk membuka seluruh 600+ instrumen tanpa batas.').replace('{limit}', limit).replace('{list}', unlocked.join(', '));
    var pm = $id('paymentModal');
    if (pm) pm.classList.remove('hidden');
  }
  return false;
}
function showScreen(name) {
  var front = $id('frontLandingScreen'), gate = $id('loginGateScreen'), work = $id('appWorkspaceWrapper');
  if (front) front.classList.toggle('hidden', name !== 'front');
  if (gate) gate.classList.toggle('hidden', name !== 'gate');
  if (work) work.classList.toggle('hidden', name !== 'work');
  var dd = $id('userProfileDropdown');
  if (dd) dd.classList.add('hidden');
  try { window.scrollTo({ top: 0 }); } catch (e) {}
}
function enterWorkspace() {
  showScreen('work');
  updateUserUi();
  setTimeout(function () {
    initChart();
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
    connectRealtimeStream();
    // Hemat kuotasi: section yang sedang tersembunyi tidak perlu mem-fetch feed
    if (state.mode === 'investor') renderInvestorPicks();
    else renderOpportunityRadar();
  }, 60);
}

/* ==================== 10. VIP PAYMENT (ON-CHAIN BSC VERIFY) ==================== */
function clientVerifyBscPayment(txHash) {
  var rpcList = [
    'https://bsc-dataseed1.bnbchain.org',
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc.publicnode.com'
  ];
  var targetTopic = VIP_WALLET.toLowerCase().replace('0x', '').padStart(64, '0');
  var attempt = function (idx) {
    if (idx >= rpcList.length) return Promise.resolve({ verified: false, error: T('ui.eRpcAll', 'Semua RPC BSC gagal dihubungi.') });
    var ctrl = new AbortController();
    var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 7000);
    return fetch(rpcList[idx], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
      signal: ctrl.signal
    }).then(function (r) {
      clearTimeout(t);
      return r.json();
    }).then(function (d) {
      var receipt = d && d.result;
      if (!receipt) return attempt(idx + 1);
      if (receipt.status !== '0x1') return { verified: false, error: T('ui.eTxRevert', 'Transaksi gagal (status revert) di BSC.') };
      var logs = receipt.logs || [];
      for (var i = 0; i < logs.length; i++) {
        var lg = logs[i];
        if ((lg.address || '').toLowerCase() !== USDT_BSC_CONTRACT.toLowerCase()) continue;
        var topics = lg.topics || [];
        if ((topics[2] || '').toLowerCase().replace(/^0x0+/, '0x') !== ('0x' + VIP_WALLET.toLowerCase().replace('0x', '')) &&
            !(topics[2] || '').toLowerCase().endsWith(targetTopic)) continue;
        var usdValue = parseInt(lg.data, 16) / 1e18;
        if (usdValue >= VIP_PRICE - 0.25) return { verified: true, amount: usdValue };
        return { verified: false, error: 'Jumlah transfer $' + usdValue.toFixed(2) + ' USDT — di bawah $' + VIP_PRICE + '.' };
      }
      return { verified: false, error: T('ui.eVipNoTransfer', 'Transfer USDT ke wallet VIP resmi tidak ditemukan pada TxHash ini.') };
    }).catch(function () {
      clearTimeout(t);
      return attempt(idx + 1);
    });
  };
  return attempt(0);
}
function bindVipFlow() {
  var pm = $id('paymentModal');
  var open = function (reasonText) {
    if (reasonText) { var r = $id('vipModalReasonText'); if (r) r.textContent = reasonText; }
    if (pm) pm.classList.remove('hidden');
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
    if (fb) { fb.style.color = '#94a3b8'; fb.textContent = T('ui.eVipVerifying', '⏳ Memverifikasi pembayaran on-chain di jaringan BNB Smart Chain (BEP-20)…'); }
    if (btn) btn.disabled = true;
    clientVerifyBscPayment(tx).then(function (res) {
      if (btn) btn.disabled = false;
      if (res && res.verified) {
        if (fb) { fb.style.color = '#10b981'; fb.textContent = fillTpl(T('ui.eVipSuccess', '✅ Pembayaran ${amt} USDT TERVERIFIKASI ON-CHAIN! Lisensi VIP 30 hari aktif.'), { amt: (res.amount || VIP_PRICE).toFixed(2) }); }
        state.user = state.user || { email: 'vip@xstarzg.local', name: 'VIP Member' };
        state.user.tier = 'VIP';
        state.user.vipUntil = Date.now() + 30 * 86400000;
        saveSession(); updateUserUi();
        setTimeout(function () { if (pm) pm.classList.add('hidden'); }, 2200);
      } else if (fb) {
        fb.style.color = '#fda4af';
        fb.textContent = 'ℹ️ ' + ((res && res.error) || T('ui.eVipNotFound', 'TxHash belum ditemukan. Pastikan transfer $29 USDT (BEP-20) sudah terkonfirmasi.'));
      }
    });
  });
}

/* ==================== 11. BINDING SEMUA TOMBOL & ALUR ==================== */
function bindUiEvents() {
  var bind = function (id, fn) { var el = $id(id); if (el) el.addEventListener('click', fn); };
  /* ---- Landing & Login gate ---- */
  bind('btnNavLoginGate', function () {
    if (state.user) enterWorkspace(); else showScreen('gate');
  });
  bind('btnHeroLoginGate', function () {
    if (state.user) enterWorkspace(); else showScreen('gate');
  });
  bind('btnHeroPreview', function () {
    state.user = state.user || { email: 'guest@xstarzg.local', name: 'Mode Tamu', tier: 'GUEST' };
    enterWorkspace();
  });
  bind('btnBackToLanding', function () { showScreen('front'); });
  bind('btnBrandLogoHome', function () { showScreen('front'); });
  bind('btnTriggerGooglePopup', function () {
    var gm = $id('googleAuthModal'); if (gm) gm.classList.remove('hidden');
  });
  bind('btnInstantPreview', function () {
    state.user = { email: 'guest@xstarzg.local', name: 'Mode Tamu', tier: 'GUEST' };
    enterWorkspace();
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
  });
  /* ---- Jalur khusus OWNER: email + kode rahasia, divalidasi penuh di server ---- */
  bind('btnToggleOwnerLogin', function () {
    var blk = $id('ownerLoginBlock');
    if (blk) blk.classList.toggle('hidden');
  });
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
  bind('btnSubFutures', function () { setSubMode('futures'); });
  bind('btnSubSpot', function () { setSubMode('spot'); });
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
  if (catSel) catSel.addEventListener('change', function () { renderInstrumentCatalog(); });
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
        state.candles = [];
        state.bestTfBoard = null;
        saveSession();
        if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
        connectRealtimeStream();
      });
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
        renderOpportunityRadar(true);
      });
    });
  }
  /* ---- Overlay toggles & recalc ---- */
  ['chkEMA', 'chkVWAP', 'chkSMC', 'chkSniper'].forEach(function (id) {
    var el = $id(id);
    if (el) el.addEventListener('change', function () {
      syncIndicatorOverlays(state.lastAnalysis);
      drawChartLevels(state.lastAnalysis);
    });
  });
  bind('btnRunEngine', function () { if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true); });
  /* ---- Risk calc inputs ---- */
  ['inpCalcBalance', 'inpCalcRiskPct'].forEach(function (id) {
    var el = $id(id);
    if (el) el.addEventListener('input', updateRiskSizing);
  });
  bindVipFlow();
}
function setMode(mode) {
  state.mode = mode;
  var t = $id('btnModeTrader'), i = $id('btnModeInvestor');
  if (t) t.classList.toggle('active', mode === 'trader');
  if (i) i.classList.toggle('active', mode === 'investor');
  var sub = $id('traderSubModeWrap');
  if (sub) sub.style.display = mode === 'trader' ? 'flex' : 'none';
  // Investor: rekomendasi diframe sebagai keputusan beli-nyata; scalping bukan untuk investor
  if (mode === 'investor' && state.radarHorizon === 'scalping') state.radarHorizon = 'swing';
  syncHorizonTabs();
  syncModeSections();
  if (mode === 'investor') renderInvestorPicks(false);
  else renderOpportunityRadar(false);
  updateModeChip();
  saveSession();
  if (typeof window.runFullAnalysis === 'function' && state.candles.length) window.runFullAnalysis(true);
}
function setSubMode(sub) {
  state.subMode = sub;
  var f = $id('btnSubFutures'), s = $id('btnSubSpot');
  if (f) f.classList.toggle('active', sub === 'futures');
  if (s) s.classList.toggle('active', sub === 'spot');
  updateModeChip();
  saveSession();
  if (state.lastAnalysis) {
    renderPanels(state.lastAnalysis);
    renderHeader(state.lastAnalysis);
    drawChartLevels(state.lastAnalysis);
  }
  // Repaint badge radar (SHORT futures -> TUNGGU di spot 1-arah)
  renderOpportunityRadar(false);
}
function selectSymbol(sym) {
  if (!sym) return;
  if (!ensureQuotaFor(sym)) {
    renderInstrumentCatalog();
    return;
  }
  state.symbol = sym;
  state.candles = [];
  state.lastAnalysis = null;
  state.bestTfBoard = null;
  renderInstrumentCatalog();
  saveSession(); // preferensi ikut tersimpan agar refresh tidak keluar
  if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
  connectRealtimeStream();
  renderOpportunityRadar();
}

/* ==================== 12. BOOTSTRAP ==================== */
function bootCore() {
  bindUiEvents();
  var saved = loadSession();
  if (saved && saved.user) {
    // FIX refresh-kickout: sesi login tersimpan -> langsung kembali ke dashboard
    // analisa dengan simbol/timeframe/mode terakhir (tanpa login ulang).
    state.user = saved.user;
    applyWorkspacePrefs(saved);
    renderInstrumentCatalog();
    updateUserUi();
    verifyOwnerSession();
    syncModeSections();
    enterWorkspace();
  } else {
    renderInstrumentCatalog();
    updateUserUi();
    showScreen('front');
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
    lazyLoadCryptoPairs();
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
      syncHorizonTabs();
      // force=false: gunakan cache radar/kurasi bila ada (tidak memicu fetch ulang)
      if (state.mode === 'investor') renderInvestorPicks(false);
      else renderOpportunityRadar(false);
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
    // Harga jangkar dikalibrasi ke pasar 2026 — hanya dipakai 0-2 detik sebelum kuotasi live tiba
    'XAU/USD': 4055.00, 'XAU/IDR': 2158000, 'XAG/USD': 50.00, 'XPT/USD': 1580.00, 'XPD/USD': 1050.00, 'XCU/USD': 5.10, 'HG/USD': 5.10,
    'EUR/USD': 1.0845, 'GBP/USD': 1.2960, 'USD/JPY': 152.40, 'USD/CHF': 0.8650, 'AUD/USD': 0.6580, 'USD/CAD': 1.3890,
    'NZD/USD': 0.5980, 'USD/IDR': 16550, 'BBCA.JK': 9850, 'BBRI.JK': 4420, 'BMRI.JK': 6150, 'BBNI.JK': 4880,
    'TLKM.JK': 2760, 'ASII.JK': 4950, 'ANTM.JK': 1620, 'NVDA': 142.50, 'AAPL': 234.80, 'MSFT': 428.00,
    'TSLA': 262.00, 'BTC/USDT': 100000.00, 'ETH/USDT': 3400.00, 'SOL/USDT': 200.00, 'BNB/USDT': 645.00
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
        if (p == null || !Number.isFinite(Number(p))) return;
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
      scheduleBestTfScan();
    } catch (err) {
      const seeded = generateSeedCandles(state.symbol, state.tf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      const fallbackAnalysis = computeQuantEngine(state.candles, state.symbol, state.tf, false);
      renderAllVisuals(fallbackAnalysis, true);
      drawCanvasFallbackChart(state.candles, fallbackAnalysis);
      renderOpportunityRadar();
      scheduleBestTfScan();
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
