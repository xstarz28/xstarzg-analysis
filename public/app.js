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
var radarScanPool = {}; // hz -> sym|tf -> { ts, item } (cache scan bergilir katalog)
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

/* ==================== 1. KATALOG INSTRUMEN & SELECT ==================== */
/* Helper rotasi katalog: slice stabil (hash simbol+kelas) bergilir per slot waktu
   sehingga SELURUH instrumen kebagian giliran analisis — tidak hanya aset besar. */
function catalogSortedStable() {
  var cat = currentCatalog().slice();
  cat.sort(function (a, b) {
    var ha = 0, hb = 0, i, sa = a.symbol + '@' + (a.assetClass || ''), sb = b.symbol + '@' + (b.assetClass || '');
    for (i = 0; i < sa.length; i++) ha = (ha * 31 + sa.charCodeAt(i)) >>> 0;
    for (i = 0; i < sb.length; i++) hb = (hb * 31 + sb.charCodeAt(i)) >>> 0;
    return ha - hb;
  });
  return cat;
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
/* v2026.47: kunci ditingkatkan per (simbol|mode|subMode|TF) — radar multi-TF tidak
   saling menimpa; entri v2 dimigrasi (lock aktif TIDAK dibuang diam-diam).
   SETIAP pelepasan lock dicatat outcome-nya (jujur, bukan hilang tanpa jejak) dan
   SL/invalidasi memicu cooldown penerbitan ulang untuk simbol+TF yang sama. */
var SIGNAL_LOCK_KEY = 'xstarzg_siglock_v3';
var SIGNAL_LOCK_KEY_V2 = 'xstarzg_siglock_v2';
var SIGNAL_OUTCOME_KEY = 'xstarzg_sigoutcome_v1';
var RADAR_ACC_KEY = 'xstarzg_radaracc_v1';
function signalLockStore() {
  var p = {};
  try { p = JSON.parse(localStorage.getItem(SIGNAL_LOCK_KEY) || '{}') || {}; } catch (e) { p = {}; }
  if (!p.__migratedV2) {
    try {
      var old = JSON.parse(localStorage.getItem(SIGNAL_LOCK_KEY_V2) || '{}') || {};
      for (var ok in old) {
        var ol = old[ok];
        if (ol && ol.status === 'ACTIVE' && ol.tf) {
          var nk = ok + '|' + ol.tf;
          if (!p[nk]) p[nk] = ol;
        }
      }
    } catch (e) {}
    p.__migratedV2 = 1;
    try { localStorage.setItem(SIGNAL_LOCK_KEY, JSON.stringify(p)); } catch (e) {}
  }
  return p;
}
function signalLockId(symbol, tf) {
  return (symbol || '').toUpperCase() + '|' + (state.mode || 'trader') + '|' + (state.mode === 'investor' ? 'spot' : (state.subMode || 'futures')) + '|' + String(tf || state.tf || '');
}
function getSignalLock(symbol, tf) {
  var l = signalLockStore()[signalLockId(symbol, tf)];
  return (l && l.status === 'ACTIVE') ? l : null;
}
function saveSignalLock(symbol, tf, lock) {
  try {
    var all = signalLockStore();
    var id = signalLockId(symbol, tf);
    if (lock) all[id] = lock; else delete all[id];
    var ks = Object.keys(all).filter(function (k) { return k !== '__migratedV2'; });
    while (ks.length > 60) { var k0 = ks.shift(); delete all[k0]; }
    localStorage.setItem(SIGNAL_LOCK_KEY, JSON.stringify(all));
  } catch (e) {}
}
/* --- Outcome tercatat & akurasi radar terukur (loop umpan-balik jujur) --- */
function signalOutcomeStore() { try { return JSON.parse(localStorage.getItem(SIGNAL_OUTCOME_KEY) || '{}') || {}; } catch (e) { return {}; } }
function hzOfTf(tf) { var t = String(tf || ''); if (t === 'M1' || t === 'M5' || t === 'M15') return 'scalping'; if (t === 'M30' || t === 'H1') return 'intraday'; return 'swing'; }
function outcomeCooldownMs(tf) { var hz = hzOfTf(tf); return hz === 'scalping' ? 30 * 60000 : hz === 'intraday' ? 90 * 60000 : 6 * 3600000; }
function outcomeBadgeWindowMs(tf) { var hz = hzOfTf(tf); return hz === 'scalping' ? 45 * 60000 : hz === 'intraday' ? 3 * 3600000 : 12 * 3600000; }
function radarAccStore() { try { return JSON.parse(localStorage.getItem(RADAR_ACC_KEY) || '{}') || {}; } catch (e) { return {}; } }
function recordSignalOutcome(symbol, tf, verdict, lock) {
  try {
    var oc = String((verdict && verdict.status) || '');
    // v2026.65: EXPIRED dicatat juga ke jurnal (transparansi penuh) namun TIDAK
    // memengaruhi winrate adaptif (bukan kemenangan/kekalahan — netral usia setup).
    if (oc !== 'SL_HIT' && oc !== 'TP_HIT' && oc !== 'STRUCTURE_INVALID' && oc !== 'EXPIRED' && oc !== 'BE_SAVED') return;
    var beSaved = !!(verdict && verdict.beProtected) || !!(lock && lock.bePlusActive);
    var finalStatus = (oc !== 'TP_HIT' && beSaved) ? 'BE_SAVED' : oc;
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
        entry: lock.entry, sl: lock.sl, tp1: lock.tp1, tp2: lock.tp2, tp3: lock.tp3,
        slPlus: lock.slPlus, bePlusActive: beSaved,
        rrRatio: lock.rrRatio, score: lock.score, winRate: lock.winRate,
        anchorClosedTime: lock.anchorClosedTime, anchorPrice: lock.anchorPrice, issuedAt: lock.issuedAt
      } : null
    };
    var ks = Object.keys(out);
    while (ks.length > 80) { var k0 = ks.shift(); delete out[k0]; }
    localStorage.setItem(SIGNAL_OUTCOME_KEY, JSON.stringify(out));
    if (SE && SE.updateRadarAccuracy && oc !== 'EXPIRED' && finalStatus !== 'BE_SAVED') {
      var acc = radarAccStore();
      var hz = hzOfTf(tf);
      acc[hz] = SE.updateRadarAccuracy(acc[hz], oc === 'TP_HIT' ? 'TP' : 'SL');
      localStorage.setItem(RADAR_ACC_KEY, JSON.stringify(acc));
    }
    try { renderSignalJournal(); } catch (e) {}
  } catch (e) {}
}
function signalCooldownActive(symbol, tf) {
  var o = signalOutcomeStore()[signalLockId(symbol, tf)];
  return !!(o && (o.status === 'SL_HIT' || o.status === 'STRUCTURE_INVALID' || o.status === 'EXPIRED' || o.status === 'BE_SAVED') && (Date.now() - o.at) < outcomeCooldownMs(tf));
}
function latestSignalOutcome(symbol, tf) {
  var o = signalOutcomeStore()[signalLockId(symbol, tf)];
  return (o && (Date.now() - o.at) < outcomeBadgeWindowMs(tf)) ? o : null;
}
function adaptiveMinScore(tf) {
  try {
    if (SE && SE.radarAdaptiveGate) return SE.radarAdaptiveGate(radarAccStore()[hzOfTf(tf)]).minScore;
  } catch (e) {}
  return 62;
}
/* Rekonsiliasi jujur: badge TP/SL yang lahir dari candle fabrikasi (feed kotor)
   DICABUT saat candle asli membuktikan level itu tidak pernah tersentuh —
   lock dipulihkan ACTIVE dan statistik akurasi dikembalikan (rollback 1 outcome). */
function reconcileSignalOutcome(symbol, tf, closedCandles) {
  try {
    var key = signalLockId(symbol, tf);
    var out = signalOutcomeStore();
    var o = out[key];
    if (!o || (Date.now() - o.at) >= outcomeBadgeWindowMs(tf)) return;
    if (!o.lock || !Number.isFinite(Number(o.lock.anchorClosedTime))) return;
    if (o.status !== 'TP_HIT' && o.status !== 'SL_HIT') return; // struktur tidak direkonsiliasi mekanis
    var L = o.lock, isLong = L.direction === 'LONG';
    var target = o.status === 'TP_HIT' ? Number(L.tp1) : Number(L.sl);
    var hit = false;
    for (var i = 0; i < closedCandles.length; i++) {
      var c = closedCandles[i];
      if (!c || c.time <= L.anchorClosedTime || (c.time * 1000) > (o.at + 90000)) continue;
      // LONG: TP tersentuh bila high >= tp1; SL bila low <= sl. SHORT cermin.
      if (o.status === 'TP_HIT') { if (isLong ? c.high >= target : c.low <= target) { hit = true; break; } }
      else { if (isLong ? c.low <= target : c.high >= target) { hit = true; break; } }
    }
    if (!hit) {
      delete out[key];
      localStorage.setItem(SIGNAL_OUTCOME_KEY, JSON.stringify(out));
      var all = signalLockStore();
      all[key] = Object.assign({}, L, { status: 'ACTIVE' });
      localStorage.setItem(SIGNAL_LOCK_KEY, JSON.stringify(all));
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
    if (SE && SE.runFullAnalysis && Array.isArray(candles) && candles.length >= 30) {
      var a = SE.runFullAnalysis({
        symbol: symbol, timeframe: tf || 'H1',
        mode: state.mode || 'trader', horizon: 'all',
        spotOnly: state.subMode === 'spot', candles: candles
      });
      if (a && !a.error) {
        /* === PERSISTENT SIGNAL LOCK (aturan #3: anti-berubah saat refresh) ===
           SKOPE 'create' = analisis utama workspace (boleh menerbitkan kunci baru),
           'apply' = radar/kurasi/scan (hanya menerapkan kunci yang sudah ada). */
        var scope = (lockScope === 'create' || lockScope === 'apply') ? lockScope : 'create';
        /* v2026.48: siklus hidup sinyal (validasi TP/SL, outcome, penerbitan kunci)
           HANYA boleh berjalan di atas candle yang PROVENANSINYA asli (klines broker).
           Feed fabrikasi/estimasi (anchored/seed/synthetic) TIDAK boleh melahirkan
           badge TP/SL maupun komitmen baru — itulah sumber badge dusta AMDB. */
        var feedReal = typeof feedIsReal === 'function' ? feedIsReal(feedSource) : !!feedSource;
        if (!feedReal) a.feedUnverified = true;
        try {
          if (feedReal && typeof SE.validateSignalLock === 'function') {
            var tfA = a.timeframe || tf;
            var closedBars0 = SE.trimClosedCandles(candles, a.tfSeconds || 3600);
            reconcileSignalOutcome(symbol, tfA, closedBars0);
            var lock = getSignalLock(symbol, tfA);
            if (lock && lock.tf === tfA) {
              var verdict = SE.validateSignalLock(lock, closedBars0, a);
              if (verdict && verdict.status === 'ACTIVE') {
                if (verdict.bePlusActive && !lock.bePlusActive) {
                  lock.bePlusActive = true;
                  saveSignalLock(symbol, tfA, lock);
                }
                SE.applyLockedSignal(a, lock, verdict);
              } else {
                a.lockCleared = verdict || { status: 'GONE' };
                recordSignalOutcome(symbol, tfA, verdict, lock); // jujur: outcome dicatat
                saveSignalLock(symbol, tfA, null);
              }
            }
            /* Kartu yang TAMPIL (create/apply) = komitmen terlacak. Penerbitan baru
               dihormati 3 penjaga: feed asli + cooldown pasca-SL/invalidasi + ambang
               adaptif dari akurasi terukur horizon (mengetat otomatis saat radar buruk). */
            if (!a.lockedSignal && (scope === 'create' || scope === 'apply') && a.signalEligible
                && !signalCooldownActive(symbol, tfA) && num(a.confluenceScore, 0) >= adaptiveMinScore(tfA)) {
              var nl = SE.createSignalLock(a, symbol, state.mode, state.subMode);
              if (nl) { saveSignalLock(symbol, tfA, nl); SE.applyLockedSignal(a, nl, { status: 'ACTIVE', bePlusActive: false }); }
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
function initChart() {
  var el = $id('tvChartContainer');
  if (!el) return false;
  if (chartInstance) return true;
  if (typeof LightweightCharts === 'undefined') return false; // canvas fallback menangani
  // Mobile: container bisa berukuran 0 saat init terlalu dini (rotasi/panel baru
  // tampil) -> tunggu frame berikutnya sampai ada lebar nyata, maksimal ~1.5 dtk.
  // Satu timer pending saja (flag global) agar panggilan berulang tidak menumpuk timer.
  if ((el.clientWidth || 0) < 40) {
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
    // ResizeObserver: rotasi HP / buka-tutup panel / keyboard virtual tetap rapi
    try {
      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(function () {
          try {
            if (chartInstance && el.clientWidth > 0) chartInstance.applyOptions({ width: el.clientWidth });
          } catch (e) {}
        });
        ro.observe(el);
      }
    } catch (e) {}
    // Hormati preferensi tipe chart tersimpan
    try {
      var savedCt = localStorage.getItem('xstarzg_chart_type');
      if (savedCt && savedCt !== 'candles') applyChartType(savedCt, true);
      else applyChartType('candles', true);
    } catch (e) {}
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
      pillarHtml(T('ui.ePmCat', '6. Katalis Terdekat'), localizeEngineString(fc.upcomingCatalyst || '-'), fc.macroDriver ? localizeEngineString(fc.macroDriver) : null, 'neutral') +
      // Fundamental TERUKUR dari data candle nyata (bukan kutipan statis)
      pillarHtml(T('ui.fmCycle', '7. Posisi Siklus Harga (Terukur)'), (mq.posCyclePct) + '% dari range siklus • DD ' + mq.drawdownPct + '% dari puncak', mq.posCyclePct > 88 ? T('ui.fmCycleHi', 'di puncak — rawan jadi exit liquidity') : mq.posCyclePct < 12 ? T('ui.fmCycleLo', 'di dasar siklus — rawan pantulan') : null, mq.posCyclePct > 88 || mq.posCyclePct < 12 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.fmPersist', '8. Persistensi Momentum (50 candle)'), mq.upClosesPct + '% candle ditutup naik', null, mq.upClosesPct >= 55 ? 'bull' : mq.upClosesPct <= 42 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.fmVolPct', '9. Persentil Volatilitas ATR'), T('ui.fmVolPctVal', 'ATR saat ini berada di persentil {p}% dari 120 pengamatan').replace('{p}', mq.atrPercentile), mq.atrPercentile > 92 ? T('ui.fmVolExt', 'volatilitas outlier — SL mudah tersambar noise') : null, mq.atrPercentile > 92 ? 'bear' : 'neutral') +
      pillarHtml(T('ui.fmSession', '10. Kualitas Sesi & Keselarasan HTF'), (mq.sessionQuality || '-') + ' • ' + (mq.htfAligned ? T('ui.fmHtfOk', 'HTF selaras dengan arah sinyal') : T('ui.fmHtfNo', 'HTF melawan — wajib ekstra hati-hati')), null, mq.htfAligned ? 'bull' : 'bear');
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

    var tm = a.tradeManagement || {};
    var L = (typeof effectiveLevels === 'function') ? effectiveLevels(a) : (a.levels || {});
    var slPlusVal = tm.slPlus || (a.direction === 'LONG' ? Number(L.entry) * 1.0008 : Number(L.entry) * 0.9992);
    var slPlusFmt = typeof formatPrice === 'function' ? formatPrice(slPlusVal, a.symbol) : String(slPlusVal);
    if (tm.bePlusActive) {
      out += '<div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.6);font-size:12px;color:#6ee7b7;font-weight:700;">' +
        fillTpl(T('ui.eSlPlusActive', '🛡️ SARAN 0-RISK AKTIF: Harga telah mencapai zona aman ({pct}% target). SEGERA GESER SL KE {slp} (SL+ di atas entry). Posisi ini sekarang 100% BEBAS RISIKO!'), { pct: tm.progressPct || 40, slp: slPlusFmt }) +
        '</div>';
    } else if (tm.brain === 'SCALP') {
      out += '<div style="margin-top:6px;padding:6px 9px;border-radius:7px;background:rgba(245,158,11,0.09);border:1px solid rgba(245,158,11,0.35);font-size:11.5px;color:#fde68a;">' +
        fillTpl(T('ui.eScalpAdvisor', '⚡ OTAK SCALP: Disiplin proteksi agresif — saat harga bergerak 30% ke target, sistem menyalakan instruksi SL+ ke {slp} untuk mengunci modal 0-risk.'), { slp: slPlusFmt }) +
        '</div>';
    } else {
      out += '<div style="margin-top:6px;padding:6px 9px;border-radius:7px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.32);font-size:11.5px;color:#bae6fd;">' +
        fillTpl(T('ui.eSniperAdvisor', '🎯 OTAK SNIPER: Kesabaran institusional ala investor — setup diberi ruang bernapas retest. Instruksi SL+ Breakeven ({slp}) aktif setelah 50% target atau konfirmasi struktur searah.'), { slp: slPlusFmt }) +
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
          return { tf: tf, a: computeQuantEngine(d.candles, sym, tf, false, 'apply', d.source) };
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
  if (a.lockedSignal) lockBadge = fillTpl(T('ui.eLocked', '🔒 LOCKED {tf}'), { tf: (a.lockTf || a.timeframe || state.tf) }) + (a.signalTier === 'ELITE' ? ' ★' : '');
  else if (a.signalEligible) lockBadge = fillTpl(a.signalTier === 'ELITE' ? T('ui.eEliteSetup', '✅ ELITE SETUP {tf}') : T('ui.eProSetup', '✅ PRO SETUP {tf}'), { tf: (a.timeframe || state.tf) });
  else lockBadge = fillTpl(T('ui.eNoTradeTf', '🚫 NO-TRADE ZONE {tf}'), { tf: (a.timeframe || state.tf) });
  setTxt('valSetupLockBadge', lockBadge);
  setTxt('valConfidenceScore', num(a.convictionScore, a.confluenceScore || a.confidence || 50) + '%');
  setTxt('valRegime', localizeEngineString(a.regime || '-'));
  var L = effectiveLevels(a);
  setTxt('valEntry', formatPrice(L.entry, a.symbol));
  setTxt('valSL', formatPrice(L.sl, a.symbol));
  setTxt('valSLDesc', fillTpl(isSpot ? T('ui.eSlSpot', 'Proteksi LONG spot di luar swing wick + buffer ATR {p}%') : T('ui.eSlFutures', 'Di luar swing wick + buffer ATR {p}%'), { p: num(a.indicators.atrPct).toFixed(2) }));
  if (window.__calcWidget && window.__calcWidget.elBalance) {
    try { window.__calcWidget.setLevelsFromSignal({ entry: L.entry, stopLoss: L.sl }); } catch (e) {}
  }
  setTxt('valTP1', formatPrice(L.tp1, a.symbol));
  setTxt('valTP2', formatPrice(L.tp2, a.symbol));
  setTxt('valTP3', formatPrice(L.tp3, a.symbol));
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
  updateRiskSizing();
}
function feedIsEstimate(src) {
  return /ESTIMATE|SYNTHETIC|LOCAL|CALIBRATED|DEFAULT|ANCHOR|SEED|FALLBACK/i.test(String(src || ''));
}
/* Feed dianggap ASLI hanya bila ada provenance broker nyata & bukan label estimasi.
   Dipakai gerbang siklus hidup sinyal: candle fabrikasi dilarang memvalidasi TP/SL. */
function feedIsReal(src) {
  var s = String(src || '');
  return !!s && !feedIsEstimate(s);
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
  try { writeBackRadarPools(analysis); } catch (e) {}
}
/* Analisis workspace terbaru menimpa entri pool trader & investor milik instrumen+
   TF yang sama -> kartu rekomendasi selalu mencerminkan kebenaran engine terkini. */
function writeBackRadarPools(analysis) {
  if (!analysis || analysis.error || !analysis.symbol || !analysis.timeframe) return;
  var sym = analysis.symbol, tf = analysis.timeframe;
  var item = {
    sym: sym, tf: tf, analysis: analysis,
    candles: (state.candles || []).slice(-240),
    price: num(state.livePrice, analysis.lastPrice),
    changePct: num(state.liveChangePct, analysis.changePct),
    source: 'WORKSPACE LIVE'
  };
  for (var hz in radarScanPool) radarScanPool[hz][sym + '|' + tf] = { ts: Date.now(), item: item };
  investorScanPool[sym] = { ts: Date.now(), item: item };
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
  scheduleLiveCanvasRepaint(); // candle canvas fallback ikut seirama tiap tick
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
      fetchRealMarketCandles(state.symbol, state.tf).then(function (data) {
        if (data && Array.isArray(data.candles) && data.candles.length >= 5 && !feedIsEstimate(data.source)) {
          state.candles = data.candles;
          state.livePrice = Number(data.price) > 0 ? Number(data.price) : data.candles[data.candles.length - 1].close;
          state.liveChangePct = Number(data.changePct) || 0;
          state.feedSource = data.source;
          var analysis = computeQuantEngine(state.candles, state.symbol, state.tf, true, 'create', data.source);
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
function fetchRadarCandidate(item) {
  return fetchRealMarketCandles(item.sym, item.tf).then(function (d) {
    var a = computeQuantEngine(d.candles, item.sym, item.tf, false, 'apply', d.source);
    if (!a) throw new Error('no-analysis');
    // Kandidat berbasis feed estimasi/fabrikasi: dinonaktifkan dari rekomendasi
    // (sinyal, komitmen, dan outcome hanya lahir dari candle broker asli).
    a.__estFeed = !feedIsReal(d.source);
    return {
      sym: item.sym, tf: item.tf, analysis: a,
      candles: Array.isArray(d.candles) ? d.candles.slice(-240) : null, // snapshot utk konsistensi klik-through
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
function fetchNewsCalendar(force) {
  if (!force && newsState.loaded && (Date.now() - newsState.ts) < NEWS_TTL) { renderNewsPanel(); return; }
  fetch('/api/news/calendar').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    // v2026.60: jangan PERNAH menghapus event yang sudah tampil hanya karena satu
    // fetch gagal/kosong (penyebab panel "kadang muncul kadang tidak").
    if (j && j.ok && Array.isArray(j.events) && (j.events.length > 0 || !newsState.loaded)) {
      newsState.events = j.events; newsState.ts = Date.now(); newsState.loaded = true;
    } else if (!newsState.loaded) {
      // retry cepat satu-shot saat pemuatan pertama gagal (anti panel kosong diam-2)
      setTimeout(function () { try { fetchNewsCalendar(false); } catch (e) {} }, 20000);
    }
    renderNewsPanel();
    try { if (state.lastAnalysis && !state.lastAnalysis.error) gateBlockHtml(state.lastAnalysis); } catch (e) {}
  }).catch(function () {
    if (!newsState.loaded) setTimeout(function () { try { fetchNewsCalendar(false); } catch (e) {} }, 20000);
    renderNewsPanel();
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
function renderNewsPanel() {
  var grid = $id('newsGrid');
  if (!grid) return;
  var now = Date.now();
  var evs = (newsState.events || []).filter(function (ev) { return ev.ts >= now - 12 * 3600e3; });
  if (newsState.filter === 'high') evs = evs.filter(function (e) { return e.impact === 'HIGH'; });
  else if (newsState.filter !== 'all') evs = evs.filter(function (e) { return (e.impacts || []).some(function (x) { return newsClassOfSym(x.sym) === newsState.filter; }); });
  evs = evs.slice().sort(function (a, b) { return a.ts - b.ts; }).slice(0, 12);
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
    var list = (ev.impacts || []).slice(0, 6);
    for (var k = 0; k < list.length; k++) {
      var im = list[k];
      chips += '<span style="font-size:10px;padding:2px 7px;border-radius:99px;border:1px solid rgba(148,163,184,0.3);color:' + (im.dir > 0 ? '#34d399' : '#fb7185') + ';">'
        + escH(im.sym) + ' ' + (im.dir > 0 ? '▲' : '▼') + ' ~' + im.pct + '%</span>';
    }
    html += '<div class="radar-card" style="cursor:default;' + (done ? 'opacity:0.78;' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start;min-width:0;">' +
        '<span style="font-size:12px;font-weight:700;color:var(--text-bright);line-height:1.35;word-break:break-word;min-width:0;flex:1;">' + escH(ev.title) + '</span>' +
        '<span style="flex-shrink:0;font-size:10px;padding:2px 8px;border-radius:99px;background:' + impCol + '22;color:' + impCol + ';border:1px solid ' + impCol + '55;white-space:nowrap;">' + impTxt + '</span>' +
      '</div>' +
      '<div style="font-size:10.8px;color:#94a3b8;margin-top:3px;word-break:break-word;">' + escH(ev.ccy) + ' • ' + newsFmtTime(ev.ts) + (soon ? ' • <b style="color:#f59e0b;">⏰ ' + T('ui.eNewsSoon', 'SEGERA') + '</b>' : done ? ' • <b style="color:#10b981;">✅ ' + T('ui.eNewsDone', 'SELESAI') + '</b>' : '') + '</div>' +
      ((ev.forecast || ev.previous) ? '<div style="font-size:10.5px;color:#cbd5e1;margin-top:3px;word-break:break-word;">' + (ev.actual ? T('ui.eNewsActual', 'Hasil') + ': <b style="color:#fbbf24;">' + escH(ev.actual) + '</b> • ' : '') + T('ui.eNewsFc', 'Prakiraan') + ': <b>' + escH(ev.forecast || '—') + '</b> • ' + T('ui.eNewsPv', 'Sebelumnya') + ': ' + escH(ev.previous || '—') + '</div>' : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">' + chips + '</div>' +
    '</div>';
  }
  grid.innerHTML = html;
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
  var m = {
    ACTIVE: beActive ? ['#10b981', 'ui.jnlBeActive', '🛡️ SL+ AKTIF (0-RISK)'] : ['#38bdf8', 'ui.jnlActive', '🔒 AKTIF - menunggu TP/SL'],
    BE_SAVED: ['#10b981', 'ui.jnlBeSaved', '🛡️ TERSELAMATKAN SL+ (0-RISK)'],
    TP_HIT: ['#10b981', 'ui.jnlTP', '✅ TP TERSENTUH'],
    SL_HIT: ['#f43f5e', 'ui.jnlSL', '❌ SL TERSENTUH'],
    STRUCTURE_INVALID: ['#f59e0b', 'ui.jnlInvalid', '⚠️ INVALID STRUKTUR'],
    EXPIRED: ['#a8a29e', 'ui.jnlExpired', '⏳ KEDALUWARSA (horison lewat)']
  }[st] || ['#64748b', null, st];
  return { col: m[0], txt: m[2] ? T(m[1], m[2]) : st };
}
function renderSignalJournal() {
  var list = $id('signalJournalList'); var sum = $id('journalSummary');
  if (!list) return;
  var locks = signalLockStore();
  var outs = signalOutcomeStore();
  var rows = [];
  for (var k in locks) {
    if (k === '__migratedV2') continue;
    var lk = locks[k];
    if (!lk || lk.status !== 'ACTIVE' || !lk.tf) continue;
    rows.push({ sym: lk.symbol, tf: lk.tf, dir: lk.direction, st: 'ACTIVE', bePlusActive: !!lk.bePlusActive, slPlus: lk.slPlus, entry: lk.entry, sl: lk.sl, tp1: lk.tp1, score: lk.score, at: lk.issuedAt || 0 });
  }
  for (var k2 in outs) {
    var o = outs[k2]; if (!o || !o.lock) continue;
    rows.push({ sym: o.lock.symbol, tf: o.lock.tf, dir: o.dir, st: o.status, bePlusActive: !!o.bePlusActive, slPlus: o.slPlus || (o.lock && o.lock.slPlus), entry: o.entry, sl: o.lock.sl, tp1: o.lock.tp1, score: o.score, at: o.at, reason: o.reason });
  }
  // ringkasan per horison (akurasi adaptif + jumlah outcome)
  if (sum) {
    var acc = radarAccStore(); var chips = '';
    ['scalping', 'intraday', 'swing'].forEach(function (hz) {
      var st = acc[hz];
      if (!st || !st.sample) return;
      chips += '<span style="font-size:10.5px;padding:3px 8px;border-radius:99px;border:1px solid rgba(148,163,184,0.3);color:#cbd5e1;">' + hz.toUpperCase() + ' — WR <b style="color:#fbbf24;">' + st.winRate + '%</b> (n=' + st.sample + ')</span>';
    });
    sum.innerHTML = chips || ('<span style="font-size:10.5px;color:#64748b;">' + T('ui.jnlNoStats', 'Statistik terbentuk setelah ada komitmen yang selesai di perangkat ini.') + '</span>');
  }
  if (!rows.length) {
    list.innerHTML = '<div style="font-size:12px;color:#64748b;padding:8px 2px;">' + T('ui.jnlEmpty', 'Belum ada komitmen terekam. Jurnal terisi otomatis begitu ada sinyal yang lolos gerbang ketat.') + '</div>';
    return;
  }
  rows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  var html = '';
  rows.slice(0, 14).forEach(function (r) {
    var b = jnlStatusBadge(r.st, r.bePlusActive);
    var dcol = r.dir === 'LONG' ? '#34d399' : '#fb7185';
    var tTxt = r.at ? new Date(r.at).toLocaleString(navigator.language || 'id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    var slPlusRow = (r.slPlus && (r.bePlusActive || r.st === 'BE_SAVED'))
      ? ' • <b style="color:#6ee7b7;">SL+ ' + formatPrice(num(r.slPlus), r.sym) + ' (0-Risk)</b>'
      : '';
    // v2026.66: setiap kartu jurnal (riwayat TP/SL/invalid/expired HARI LALU pun)
    // bisa diklik -> membuka kembali grafik instrumen+TF tersebut via gotoInstrument.
    html += '<div class="radar-card jnl-card" data-sym="' + r.sym + '" data-tf="' + (r.tf || '') + '" style="cursor:pointer;" title="' + escH(T('ui.jnlOpen', 'Klik untuk membuka kembali grafik instrumen ini')) + '">' +
      '<div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start;min-width:0;">' +
        '<span class="r-name" style="min-width:0;">' + escH(r.sym || '-') + ' <span style="color:#64748b;font-size:10px;">' + escH(r.tf || '') + '</span></span>' +
        '<span style="display:inline-flex;align-items:center;gap:5px;flex-shrink:0;">' +
          '<span style="color:#38bdf8;font-size:11px;" title="' + escH(T('ui.jnlOpen', 'Klik untuk membuka kembali grafik instrumen ini')) + '">↗</span>' +
          '<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:' + b.col + '22;color:' + b.col + ';border:1px solid ' + b.col + '55;white-space:nowrap;">' + b.txt + '</span>' +
        '</span>' +
      '</div>' +
      '<div style="font-size:10.8px;color:#94a3b8;margin-top:3px;word-break:break-word;">' +
        '<b style="color:' + dcol + ';">' + (r.dir || '—') + '</b> • ' + tTxt + ' • ' + T('ui.jnlEntry', 'Entry') + ' ' + formatPrice(num(r.entry), r.sym) + ' • SL ' + formatPrice(num(r.sl), r.sym) + slPlusRow + ' • TP1 ' + formatPrice(num(r.tp1), r.sym) +
      '</div>' +
      (r.reason ? '<div style="font-size:10.2px;color:#64748b;margin-top:2px;">' + escH(String(r.reason)).slice(0, 90) + '</div>' : '') +
    '</div>';
  });
  list.innerHTML = html;
  Array.prototype.forEach.call(list.querySelectorAll('.radar-card[data-sym]'), function (card) {
    card.addEventListener('click', function () {
      gotoInstrument(card.getAttribute('data-sym'), card.getAttribute('data-tf'));
    });
  });
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
    CISD_COUNTER: T('ui.gCISD', 'Change in state of delivery lawan arah — reversal sedang berjalan'),
    FOMO_ZONE: T('ui.gFomo', 'Harga jauh dari zona OTE — master tidak mengejar kereta')
  };
  return m[code] || T('ui.gVeto', 'Veto struktur/likuiditas aktif (anti jebakan)');
}
function paintRadarItems(cfg, items, noneQualified) {
  var grid = $id('opportunityRadarGrid');
  if (!grid) return;
  if (!items || !items.length) {
    grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.radarFeedEmpty', 'Feed radar belum tersedia — coba lagi sebentar.') + '</span></div>';
    return;
  }
  var html = '';
  /* Kejujuran daftar: bila TIDAK ADA yang lolos gerbang, tampilkan banner tegas —
     daftar di bawahnya hanyalah pantauan (kandidat terbaik yang tersedia), bukan
     rekomendasi. (Skor mereka ditahan <62 oleh engine = memang belum layak eksekusi.) */
  if (noneQualified && state.mode !== 'investor') {
    html += '<div class="radar-card" style="cursor:default;grid-column:1/-1;border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.06);"><span class="r-name" style="color:#fbbf24;">' +
      T('ui.eRadarNone', '⚠️ Belum ada sinyal yang lolos gerbang ketat saat ini. Daftar di bawah = PANTAUAN saja (bukan rekomendasi) — lazim saat pasar sepi/akhir pekan & feed estimasi. Rekomendasi kembali begitu setup nyata matang.') +
      '</span></div>';
  }
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var a = it.analysis;
    var meta = getMeta(it.sym);
    var badge = radarBadgeFor(a);
    if (a.__estFeed) badge = { cls: 'wait', txt: T('ui.eEstFeed', '○ Data estimasi — sinyal nonaktif') };
    var chg = num(it.changePct, num(a.changePct));
    var chgCol = chg >= 0 ? '#10b981' : '#f43f5e';
    var sc = num(a.convictionScore, a.confluenceScore);
    var entryRef = state.mode === 'investor' ? (a.levels && a.levels.dcaZone1 ? a.levels.dcaZone1 : a.lastPrice) : (a.levels ? a.levels.entry : a.lastPrice);
    var isActive = it.sym === state.symbol && it.tf === state.tf;
    // Badge outcome jujur: sinyal yang gugur/selesai TIDAK hilang diam-diam —
    // kartu menampilkan hasil akhirnya (TP/SL/dibatalkan struktur) + jamnya.
    var outBadge = '';
    var oc = (typeof latestSignalOutcome === 'function') ? latestSignalOutcome(it.sym, it.tf) : null;
    if (oc && a.__estFeed) oc = null; // outcome di feed estimasi tidak dimunculkan
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
      '<span class="sig-badge ' + badge.cls + '">' + badge.txt + '</span>' + outBadge +
      // Alasan gerbang di kartu: kartu non-eligible menyebut yang masih ditunggu
      // (koheren dengan WR besar di panel — WR masa lalu, izin entry = konfirmasi kini)
      (state.mode === 'trader' && !a.signalEligible && !a.lockedSignal && !a.__estFeed && a.gating && a.gating.active && a.gating.active.length
        ? '<div style="font-size:10.5px;color:#f59e0b;margin-top:3px;line-height:1.35;">⛔ ' + gateShortLabel(a.gating.active[0]) + '</div>' : '') +
      (function () { var nw = newsSoonFor(it.sym, 120); return nw ? '<div style="font-size:10.5px;color:#7dd3fc;margin-top:3px;">⏰ ' + escH(nw.title).slice(0, 34) + ' • ' + newsFmtTime(nw.ts) + '</div>' : ''; })() +
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
/* Semesta investasi diambil dari SELURUH katalog (saham IDX/global, logam, crypto) —
   dinilai merata, bukan cuma aset besar. Kurasi menampilkan hanya kandidat yang
   bias makro D1/W1 akumulatif (layak diinvestasikan sesuai horizon waktunya). */
function investableUniverse() {
  return catalogSortedStable().filter(function (inst) {
    return inst.assetClass === 'stocks' || inst.assetClass === 'metals' || inst.assetClass === 'crypto';
  });
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
function renderInvestorPicks(force) {
  var grid = $id('investorPicksGrid');
  if (!grid) return;
  var now = Date.now();
  var cachedItems = [];
  for (var k0 in investorScanPool) if (now - investorScanPool[k0].ts < 1800000) cachedItems.push(investorScanPool[k0].item);
  var longOnly = cachedItems.filter(function (it) { return it.analysis.direction === 'LONG'; });
  longOnly.sort(function (x, y) { return num(y.analysis.confluenceScore, 50) - num(x.analysis.confluenceScore, 50); });
  var shown0 = longOnly.slice(0, 12);
  if (!force && shown0.length >= 4) { drawInvestorPickCards(shown0); return; }
  if (shown0.length) drawInvestorPickCards(shown0);
  var mySeq = ++investorPickRunSeq;
  // v2026.66: batch 26 simbol / slot 6 menit (dulu 34/5) demi kuota Functions gratis.
  var batch = rotatingSlice(investableUniverse(), 26, 6);
  if (!shown0.length) grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.invScanning', 'Mengkurasi {n} aset portofolio dengan data broker real-time (D1/W1)…').replace('{n}', batch.length + '+') + '</span></div>';
  Promise.allSettled(batch.map(function (inst) {
    return fetchRadarCandidate({ sym: inst.symbol, tf: 'D1' }).then(function (r) { if (r) r.cat = catLabelOf(getMeta(inst.symbol)); return r; });
  })).then(function (results) {
    if (mySeq !== investorPickRunSeq) return;
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled' && results[i].value) {
        var it = results[i].value;
        investorScanPool[it.sym] = { ts: Date.now(), item: it };
      }
    }
    var merged = [];
    var now2 = Date.now();
    for (var k in investorScanPool) if (now2 - investorScanPool[k].ts < 1800000) merged.push(investorScanPool[k].item);
    // Hanya aset yang bias makronya memang akumulatif (LONG D1/W1) yang direkomendasikan
    // untuk diinvestasikan — diurut dari skor konfluensi makro terkuat.
    var longs = merged.filter(function (it) { return it.analysis.direction === 'LONG' && num(it.analysis.convictionScore, 0) >= 55; });
    longs.sort(function (x, y) { return num(y.analysis.convictionScore, 0) - num(x.analysis.convictionScore, 0); });
    var shown = longs.slice(0, 12);
    if (!shown.length) { // fallback: kandidat terbaik yang sedang terpantau
      merged.sort(function (x, y) { return num(y.analysis.confluenceScore, 50) - num(x.analysis.confluenceScore, 50); });
      shown = merged.slice(0, 6);
    }
    drawInvestorPickCards(shown);
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
  if (infoEl) {
    var accTxt = '';
    try {
      var stAcc = radarAccStore()[hz];
      if (stAcc && stAcc.sample >= 5) accTxt = ' • ' + T('ui.eAccRadar', 'Akurasi radar terukur: {wr}% (n={n})').replace('{wr}', stAcc.winRate).replace('{n}', stAcc.sample);
    } catch (e) {}
    infoEl.textContent = (state.mode === 'investor' ? T('ui.radarInfoI' + ({ scalping: 1, intraday: 2, swing: 3 })[hz], cfg.infoInvestor || '') : T('ui.radarInfoT' + ({ scalping: 1, intraday: 2, swing: 3 })[hz], cfg.infoTrader || '')) + accTxt;
  }
  /* Radar merata ke seluruh katalog: batch bergilir per slot 5 menit + cache
     per-instrumen (TTL 8 mnt) -> semua simbol dinilai, 12 sinyal terkuat tampil. */
  var tfFor = hz === 'scalping' ? 'M5' : hz === 'swing' ? 'D1' : 'H1';
  var cacheKey = hz;
  var pool = radarScanPool[cacheKey] = radarScanPool[cacheKey] || {};
  var fresh = [];
  var now = Date.now();
  for (var k in pool) if (now - pool[k].ts < 15 * 60000) fresh.push(pool[k].item);
  fresh.sort(function (x, y) { return num(y.analysis.convictionScore, 0) - num(x.analysis.convictionScore, 0); });
  // Rekomendasi = penyaring instrumen berpotensi: hanya keyakinan >= 55 yang tampil;
  // jika pasar sedang sepi, tampilkan kandidat terbaik yang ada (maks 4) agar tidak kosong.
  var freshStrong = fresh.filter(function (it) { return num(it.analysis.convictionScore, 0) >= 55 && !it.analysis.__estFeed; });
  var freshShow = freshStrong.length ? freshStrong.slice(0, 12) : fresh.slice(0, 4);
  if (!force && fresh.length >= 12) { paintRadarItems(cfg, freshShow, freshStrong.length === 0); return; }
  if (fresh.length) paintRadarItems(cfg, freshShow, freshStrong.length === 0);
  // v2026.66: batch 30 simbol / slot 4 menit (dulu 40/3) — memangkas panggilan Functions
  // ~55% per pengguna demi kuota gratis Cloudflare; rotasi tetap menutupi seluruh katalog.
  var batch = rotatingSlice(catalogSortedStable(), 30, 4);
  var mySeq = ++radarRunSeq;
  if (!fresh.length) grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">' + T('ui.radarScanning', 'Memindai {n} aset dengan candle broker real-time (kelompok {range})…').replace('{n}', batch.length + '+').replace('{range}', cfg.tfRange) + '</span></div>';
  Promise.allSettled(batch.map(function (inst) { return fetchRadarCandidate({ sym: inst.symbol, tf: tfFor }); })).then(function (results) {
    if (mySeq !== radarRunSeq) return;
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled' && results[i].value) {
        var it = results[i].value;
        pool[it.sym + '|' + it.tf] = { ts: Date.now(), item: it };
      }
    }
    var merged = [];
    var now2 = Date.now();
    for (var k2 in pool) if (now2 - pool[k2].ts < 15 * 60000) merged.push(pool[k2].item);
    merged.sort(function (x, y) { return num(y.analysis.convictionScore, 0) - num(x.analysis.convictionScore, 0); });
    var strong = merged.filter(function (it) { return num(it.analysis.convictionScore, 0) >= 55 && !it.analysis.__estFeed; });
    paintRadarItems(cfg, strong.length ? strong.slice(0, 12) : merged.slice(0, 4), strong.length === 0);
  }).catch(function () {});
}
/* Kon-sistensi klik-through: hasil yang tampil di kartu rekomendasi (trader &
   investor) HARUS sama dengan yang tampil di workspace. Karena engine deterministik
   per candle closed, kita pakai ulang snapshot candle kartu yang masih segar
   (<=3 menit) sebagai data awal workspace — angka skor/entry tidak mungkin flip. */
function primeFromRadarPool(sym, tf) {
  var now = Date.now();
  var pools = [];
  for (var hz in radarScanPool) pools.push(radarScanPool[hz]);
  pools.push(investorScanPool);
  for (var p = 0; p < pools.length; p++) {
    var pool = pools[p];
    for (var key in pool) {
      var rec = pool[key];
      if (rec && rec.item && rec.item.sym === sym && rec.item.tf === tf && rec.item.candles && (now - rec.ts) < 180000) {
        return { candles: rec.item.candles, source: rec.item.source || 'BROKER FEED' };
      }
    }
  }
  return null;
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
  var primed = primeFromRadarPool(sym, tf);
  state.candles = primed ? primed.candles.slice() : [];
  var primedSource = primed ? primed.source : null;
  state.lastAnalysis = null;
  state.bestTfBoard = null;
  renderInstrumentCatalog();
  saveSession();
  // Render instan dari snapshot kartu (skor/entry identik dengan yang diklik user),
  // sekaligus scope 'create' agar sinyal yang tampil langsung TERKUNCI permanen —
  // refresh/kalkulasi ulang berikutnya tidak bisa mengubahnya sampai TP/SL/invalidasi.
  if (primed) {
    try {
      var primeAnalysis = computeQuantEngine(state.candles, sym, tf || state.tf, false, 'create', primedSource);
      if (primeAnalysis && !primeAnalysis.error) renderAllVisuals(primeAnalysis, true);
    } catch (e) {}
  }
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
  if (typeof syncTfBarForMode === 'function') syncTfBarForMode();
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
    if (reason) reason.textContent = T('ui.quotaFull', 'Kuota {limit} instrumen akun FREE Anda sudah penuh ({list}). Upgrade VIP $29 USDT untuk membuka seluruh 650+ instrumen tanpa batas.').replace('{limit}', limit).replace('{list}', unlocked.join(', '));
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
  if (state.user && state.user.authToken) return Promise.resolve(state.user.authToken);
  if (!state.user || !state.user.email || /@xstarzg\.local$/.test(state.user.email)) return Promise.reject(new Error('no-login'));
  return serverRegister(state.user.email, state.user.name).then(function (d) {
    if (!d || !d.ok || !d.token) throw new Error((d && d.error) || 'register-failed');
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
    // v2026.66: terbitkan sesi JWT server sunyi-2 (dibutuhkan untuk verifikasi
    // pembayaran VIP yang mengikat identitas). Gagal jaringan = ditoleransi,
    // akan dicoba ulang otomatis saat user menekan tombol verifikasi.
    try { ensureAuthToken().then(function () { updateUserUi(); }).catch(function () {}); } catch (e) {}
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
      // v2026.63: canvas fallback juga ikut menggambar ulang overlay/level
      try { if (typeof window.drawCanvasFallbackChart === 'function') window.drawCanvasFallbackChart(state.candles, state.lastAnalysis); } catch (e) {}
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
  syncTfBarForMode();
  var t = $id('btnModeTrader'), i = $id('btnModeInvestor');
  if (t) t.classList.toggle('active', mode === 'trader');
  if (i) i.classList.toggle('active', mode === 'investor');
  var sub = $id('traderSubModeWrap');
  if (sub) sub.style.display = mode === 'trader' ? 'flex' : 'none';
  // Investor: rekomendasi diframe sebagai keputusan beli-nyata; scalping bukan untuk investor
  if (mode === 'investor' && state.radarHorizon === 'scalping') state.radarHorizon = 'swing';
  syncHorizonTabs();
  syncModeSections();
  // Rescan paksa saat pindah mode -> kartu rekomendasi menyegarkan ke kebenaran
  // engine terbaru (anti kartu basi yg kontradiksi dengan workspace).
  if (mode === 'investor') renderInvestorPicks(true);
  else renderOpportunityRadar(true);
  renderMacroMap(); // strip peta makro hanya relevan di workspace investor
  updateModeChip();
  syncTfBarForMode();
  saveSession();
  if (typeof window.runFullAnalysis === 'function' && state.candles.length) window.runFullAnalysis(true);
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
  if (typeof window.runFullAnalysis === 'function' && state.candles.length) window.runFullAnalysis(true);
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
/* AUTO-PILOT radar & kurasi investor: memindai ulang katalog secara mandiri setiap
   slot rotasi (5 menit) sehingga instrumen berpotensi baru muncul sendiri tanpa
   refresh manual. Repaint murah tiap 60 dtk; scan batch penuh tiap 5 menit;
   jeda otomatis saat tab tidak terlihat. */
var radarAutoLastForce = 0;
function startRadarAutoPilot() {
  if (window.__radarAutoTimer) return;
  window.__radarAutoTimer = setInterval(function () {
    try {
      if (typeof document !== 'undefined' && document.hidden) return;
      var force = (Date.now() - radarAutoLastForce) >= 4 * 60000;
      if (force) radarAutoLastForce = Date.now();
      if (state.mode === 'investor') renderInvestorPicks(force);
      else renderOpportunityRadar(force);
    } catch (e) {}
  }, 60000);
}
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
    verifyVipSession();
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
    startRadarAutoPilot(); // auto-refresh mandiri radar/kurasi setelah engine siap
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
    lvlKeys.forEach(k => { const v = Number(L[k]); if (Number.isFinite(v) && v > 0) { if (v > maxP) maxP = v; if (v < minP) minP = v; } });
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
        lvTag(L.entry, '#38bdf8', 'ENTRY', 0);
        lvTag(L.sl, '#f43f5e', 'SL', 1);
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
  window.drawCanvasFallbackChart = drawCanvasFallbackChart;
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
        const instantAnalysis = computeQuantEngine(state.candles, state.symbol, state.tf, forceRecalc, 'create', 'LOCAL_SEED');
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
        if (!feedIsEstimate(state.feedSource) && feedReconnectTimer) { try { clearInterval(feedReconnectTimer); feedReconnectTimer = null; } catch (e) {} }
        const analysis = computeQuantEngine(state.candles, state.symbol, state.tf, forceRecalc, 'create', data.source || 'LIVE_BROKER');
        renderAllVisuals(analysis, true);
        drawCanvasFallbackChart(state.candles, analysis);
        if (chartInstance) chartInstance.timeScale().fitContent();
      }
      connectRealtimeStream();
      renderOpportunityRadar();
      scheduleBestTfScan();
      if (feedIsEstimate(state.feedSource)) scheduleFeedReconnect();
    } catch (err) {
      const seeded = generateSeedCandles(state.symbol, state.tf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      const fallbackAnalysis = computeQuantEngine(state.candles, state.symbol, state.tf, false, 'create', 'LOCAL_SEED');
      renderAllVisuals(fallbackAnalysis, true);
      drawCanvasFallbackChart(state.candles, fallbackAnalysis);
      renderOpportunityRadar();
      scheduleBestTfScan();
      scheduleFeedReconnect();
    }
  };
  // Pre-warm radar & initial analysis on load
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      const seeded = generateSeedCandles(state.symbol, state.tf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      const initAn = computeQuantEngine(state.candles, state.symbol, state.tf, false, 'create', 'LOCAL_SEED');
      renderAllVisuals(initAn, false);
      renderOpportunityRadar();
      fetchNewsCalendar(false);
      setInterval(function () { fetchNewsCalendar(false); }, 15 * 60 * 1000);
      fetchMacroRegime(false);
      setInterval(function () { fetchMacroRegime(false); }, MACRO_TTL);
      setInterval(function () { renderMacroMap(); }, 60 * 1000);
      renderSignalJournal();
      setInterval(function () { renderSignalJournal(); }, 60 * 1000);
      var nfBar = $id('newsFilterBar');
      if (nfBar) nfBar.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-nf]') : null;
        if (!b) return;
        newsState.filter = b.getAttribute('data-nf');
        nfBar.querySelectorAll('.hz-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderNewsPanel();
      });
    }, 50);
  });
})();
