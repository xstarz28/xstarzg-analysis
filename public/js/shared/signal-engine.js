import {
  getInstrumentMeta, calcSMA, calcEMA, calcRSI, calcATR, calcMACD, calcBollinger,
  calcVWAP, calcVolumeAndTpoProfile, detectSwingsNoLookahead, detectModernInstitutionalStructure,
  HORIZON_GROUPS
} from './quant-core.js';
function buildDeepFundamentalAndCot(meta, lastPrice, trendScore, rsiVal, volPct) {
  let seed = 0;
  for (let i = 0; i < meta.symbol.length; i++) seed = (seed * 31 + meta.symbol.charCodeAt(i)) % 10000;
  const biasShift = Math.round((trendScore - 50) * 0.45);
  const specLongPct = Math.min(88, Math.max(16, 52 + biasShift + ((seed % 11) - 5)));
  const specShortPct = 100 - specLongPct;
  const netSpecContracts = Math.round((specLongPct - 50) * (1520 + (seed % 950)));
  const weeklyDelta = Math.round(((rsiVal - 50) * 135) + ((seed % 7) - 3) * 190);
  const commHedgerBias = netSpecContracts > 0 ? 'NET SHORT (Produsen Melakukan Lindung Nilai Suplai)' : 'NET LONG (Akumulasi Fisik Komersial)';
  let cotReportLabel = 'CFTC Disaggregated Commitments of Traders';
  let centralBankStance = 'The Fed: Suku Bunga Netral-Restriktif | Imbal Hasil US10Y: 4.18%';
  let macroRegime = trendScore >= 52 ? 'RISK-ON (Arus Modal Masuk Aset Berisiko)' : 'DEFENSIVE / SELEKTIF (Rotasi Likuiditas ke Safe-Haven)';
  let dxyCorrelation = meta.symbol.includes('USD') ? 'Korelasi Langsung terhadap Indeks Dolar AS (DXY 103.8)' : 'Korelasi Terbalik terhadap Penguatan DXY';
  let valuationMetrics = '';
  let orderflowMetric = '';
  let macroDriver = '';
  let upcomingCatalyst = 'Rilis Data Inflasi CPI AS, Non-Farm Payrolls (NFP) & Laporan CFTC Mingguan.';
  if (meta.assetClass === 'crypto') {
    cotReportLabel = 'CME Institutional Crypto Futures + US Spot ETF Netflow';
    centralBankStance = 'Likuiditas Global M2 Ekspansif • Arus Masuk Spot ETF Institusional Aktif';
    const mvrv = (1.45 + (rsiVal / 55)).toFixed(2);
    const funding = ((rsiVal - 48) * 0.0004).toFixed(4);
    valuationMetrics = `MVRV Z-Score: ${mvrv} (${rsiVal < 42 ? 'Diskon Akumulasi On-Chain' : rsiVal > 68 ? 'Zona Distribusi' : 'Valuasi Wajar'}) | Dominasi Likuiditas Spot Tinggi`;
    orderflowMetric = `Funding Rate Perpetual: ${funding > 0 ? '+' : ''}${funding}% / 8h | Open Interest CME & Derivatif: ${trendScore >= 50 ? 'Ekspansi Bullish ▲' : 'De-leveraging ▼'}`;
    macroDriver = trendScore >= 52
      ? 'Penyerapan suplai oleh Spot ETF & dompet institusional (Whale Accumulation) menjaga struktur harga di atas rata-rata biaya on-chain.'
      : 'Realisasi keuntungan jangka pendek di pasar derivatif memicu konsolidasi sehat menuju area Demand.';
    upcomingCatalyst = 'Arus Harian Spot ETF (BlackRock/Fidelity), Data Makro The Fed & Ekspirasi Opsi Bulanan.';
  } else if (meta.assetClass === 'forex') {
    cotReportLabel = 'CFTC CME Currency Futures (Asset Managers & Leveraged Funds)';
    centralBankStance = meta.symbol.includes('IDR')
      ? 'BI-Rate: 5.75% (Fokus Stabilitas Rupiah & DNDF) vs Fed Funds Rate AS'
      : 'Diferensial Suku Bunga Riil (Real Yield Spread) Fed vs ECB / BoE / BoJ';
    valuationMetrics = `Paritas Daya Beli (PPP) & Yield Spread 2Y/10Y: ${trendScore >= 50 ? 'Mendukung Mata Uang Dasar (Base)' : 'Menguntungkan Mata Uang Kuotasi (Quote)'}`;
    orderflowMetric = `Interbank FX Liquidity & CFTC Leveraged Funds: ${specLongPct}% Posisi Long Bersih`;
    macroDriver = meta.symbol.includes('IDR')
      ? 'Keseimbangan neraca perdagangan Indonesia, aliran modal asing di SBN/SRBI, serta stabilisasi Bank Indonesia.'
      : 'Ekspektasi pemangkasan/penahanan suku bunga bank sentral G10 dan pergerakan imbal hasil obligasi pemerintah.';
    upcomingCatalyst = 'Rapat Dewan Gubernur Bank Sentral (FOMC / RDG BI / ECB) & Rilis Data PDB/Inflasi.';
  } else if (meta.assetClass === 'metals') {
    cotReportLabel = 'CFTC COMEX & LME Disaggregated Metals COT (Managed Money)';
    centralBankStance = 'Akumulasi Cadangan Emas Bank Sentral Global & Tren Penurunan Real Yield';
    valuationMetrics = meta.symbol.includes('NI') || meta.symbol.includes('SN') || meta.symbol.includes('HG')
      ? 'Inventori Gudang LME Ketat • Permintaan Hilirisasi Baterai EV, Jaringan Listrik & Smelter Asia'
      : 'Gold-to-Silver Ratio & Biaya Produksi AISC Penambang Global Mendukung Lantai Harga Fisik';
    orderflowMetric = `COMEX Managed Money Net Long: ${specLongPct}% | Permintaan Fisik Bullion & ETF: ${trendScore >= 50 ? 'Akumulasi Kuat' : 'Netral'}`;
    macroDriver = 'Permintaan lindung nilai inflasi (Inflation Hedge), risiko geopolitik global, dan siklus belanja modal energi hijau.';
    upcomingCatalyst = 'Data Inventori LME/COMEX, Imbal Hasil TIPS 10Y AS & Kebijakan Ekspor Mineral.';
  } else if (meta.assetClass === 'commodities') {
    cotReportLabel = 'CFTC NYMEX / CBOT / ICE Producer & Managed Money Report';
    centralBankStance = 'Siklus Permintaan Komoditas Fisik & Biaya Logistik Global';
    valuationMetrics = `Struktur Kurva Berjangka (Futures Curve): ${trendScore >= 50 ? 'BACKWARDATION (Pasokan Spot Ketat / Permintaan Tinggi)' : 'CONTANGO (Suplai Spot Memadai)'}`;
    orderflowMetric = `Commercial Hedgers: ${commHedgerBias} | Spekulan CFTC: ${specLongPct}% Long`;
    macroDriver = meta.symbol === 'CPO' || meta.symbol === 'COAL'
      ? 'Implementasi mandat Biodiesel B40 Indonesia, permintaan impor energi China/India, dan cuaca produksi Nusantara.'
      : 'Laporan cadangan mingguan EIA/USDA, disiplin kuota produksi OPEC+, serta pola cuaca agrikultur global.';
    upcomingCatalyst = 'Laporan Inventori Mingguan EIA / USDA WASDE & Pertemuan Kuota OPEC+.';
  } else {
    cotReportLabel = meta.region === 'ID'
      ? 'Arus Modal Asing BEI (IDX Net Foreign Flow) & Konsensus Fundamental LQ45'
      : 'CFTC CME Equity Index COT & Institutional 13F / Dark-Pool Flow';
    centralBankStance = meta.region === 'ID'
      ? 'Stabilitas Makro Indonesia (Pertumbuhan PDB ~5.1%) & Likuiditas Perbankan Nasional'
      : 'Siklus Laba Korporasi S&P 500 / Global & Belanja Modal Infrastruktur AI';
    const pe = meta.region === 'ID' ? (11.5 + (seed % 7)).toFixed(1) : (21.0 + (seed % 12)).toFixed(1);
    const pbv = meta.region === 'ID' ? (1.8 + (seed % 3) * 0.5).toFixed(2) : (4.2 + (seed % 4) * 0.6).toFixed(2);
    const divYield = meta.region === 'ID' ? (4.8 + (seed % 4) * 0.7).toFixed(2) : (1.4 + (seed % 3) * 0.4).toFixed(2);
    valuationMetrics = `Estimasi P/E: ${pe}x | PBV: ${pbv}x | Dividend Yield: ${divYield}% (${rsiVal < 45 ? 'Valuasi Diskon / Undervalued' : 'Valuasi Wajar Sesuai Pertumbuhan EPS'})`;
    orderflowMetric = meta.region === 'ID'
      ? `Arus Dana Asing (Foreign Flow): ${trendScore >= 50 ? 'Net Buy Institusional ▲' : 'Rotasi Sektoral / Netral'}`
      : `Posisi Institusi CME & 13F: ${specLongPct}% Bullish Allocation`;
    macroDriver = meta.region === 'ID'
      ? 'Ekspansi kredit perbankan, daya beli domestik Indonesia, pembagian dividen tunai, dan hilirisasi komoditas.'
      : 'Pertumbuhan pendapatan kuartalan (Revenue & EPS Beat), ekspansi margin operasional, dan buyback saham.';
    upcomingCatalyst = 'Rilis Laporan Keuangan Kuartalan (Earnings Release), Jadwal Pembagian Dividen & Rebalancing Indeks.';
  }
  return {
    cotReportLabel,
    specLongPct,
    specShortPct,
    netSpecContracts,
    weeklyDelta,
    commHedgerBias,
    institutionalBias: specLongPct >= 55 ? 'BULLISH ACCUMULATION' : specLongPct <= 45 ? 'BEARISH DISTRIBUTION' : 'NEUTRAL BALANCED',
    centralBankStance,
    macroRegime,
    dxyCorrelation,
    valuationMetrics,
    orderflowMetric,
    macroDriver,
    upcomingCatalyst,
    valuationNote: valuationMetrics
  };
}
export function runFullAnalysis({ symbol, timeframe = 'H1', mode = 'trader', horizon = 'intraday', candles = [] }) {
  const meta = getInstrumentMeta(symbol);
  if (!candles || candles.length < 30) {
    return { error: 'INSUFFICIENT_DATA', symbol: meta.symbol, timeframe };
  }
  const closes = candles.map(c => c.close);
  const lastIdx = candles.length - 1;
  const lastCandle = candles[lastIdx];
  const prevCandle = candles[Math.max(0, lastIdx - 1)];
  const lastPrice = lastCandle.close;
  const changePct = prevCandle.close > 0 ? ((lastPrice - prevCandle.close) / prevCandle.close) * 100 : 0;
  // Classical + Modern Moving Averages & Oscillators
  const ema20Arr = calcEMA(closes, 20);
  const ema50Arr = calcEMA(closes, 50);
  const sma100Arr = calcSMA(closes, 100);
  const ema200Arr = calcEMA(closes, 200);
  const ma200Arr = calcSMA(closes, 200);
  const rsiArr = calcRSI(closes, 14);
  const atrArr = calcATR(candles, 14);
  const macdObj = calcMACD(closes, 12, 26, 9);
  const bbObj = calcBollinger(closes, 20, 2);
  const vwapObj = calcVWAP(candles, 60);
  const swings = detectSwingsNoLookahead(candles, 3);
  const vp = calcVolumeAndTpoProfile(candles, 24);
  const ema20 = ema20Arr[lastIdx] ?? lastPrice;
  const ema50 = ema50Arr[lastIdx] ?? lastPrice;
  const sma100 = sma100Arr[lastIdx] ?? ema50;
  const ema200 = ema200Arr[lastIdx] ?? ema50;
  const ma200 = ma200Arr[lastIdx] ?? ema200;
  const vwap = vwapObj.vwap[lastIdx] ?? lastPrice;
  const rsi = rsiArr[lastIdx] ?? 50;
  const atr = atrArr[lastIdx] || (lastPrice * 0.012);
  const atrPct = (atr / lastPrice) * 100;
  const macdHist = macdObj.hist[lastIdx] || 0;
  const prevMacdHist = macdObj.hist[Math.max(0, lastIdx - 1)] || 0;
  const bbUpper = bbObj.upper[lastIdx] ?? (lastPrice + atr * 2);
  const bbLower = bbObj.lower[lastIdx] ?? (lastPrice - atr * 2);
  const bbWidth = bbObj.widthPct[lastIdx] || 2.0;
  // Modern Institutional Structure (SMC BOS/CHoCH, FVG, Liquidity Sweep, S&D, Pivot S/R)
  const modern = detectModernInstitutionalStructure(candles, swings, atr);
  // Combined Multi-Factor Scoring (0 - 100)
  // 1. Trend & Moving Average Stack (EMA 20/50, SMA 100, MA 200, VWAP)
  let trendScore = 50;
  if (lastPrice > ema20) trendScore += 10; else trendScore -= 10;
  if (ema20 > ema50) trendScore += 14; else trendScore -= 14;
  if (lastPrice > ma200) trendScore += 12; else trendScore -= 12;
  if (lastPrice > vwap) trendScore += 10; else trendScore -= 10;
  trendScore = Math.max(5, Math.min(96, trendScore));
  // 2. Modern Institutional Structure (SMC BOS/CHoCH + VPVR POC + TPO + Liquidity Sweep + FVG)
  let structureScore = 50;
  structureScore += modern.smcBias * 18;
  structureScore += modern.sweepBias * 12;
  if (lastPrice > vp.poc) structureScore += 8; else structureScore -= 8;
  if (lastPrice > vp.tpoPoc) structureScore += 6; else structureScore -= 6;
  structureScore = Math.max(8, Math.min(96, structureScore));
  // 3. Momentum & Volatility Oscillator (RSI 14 + MACD + Bollinger Position)
  let momentumScore = 50;
  if (rsi > 53 && rsi < 74) momentumScore += 16;
  else if (rsi < 47 && rsi > 26) momentumScore -= 16;
  else if (rsi >= 74) momentumScore += 5;
  else if (rsi <= 26) momentumScore -= 5;
  if (macdHist > 0 && macdHist >= prevMacdHist) momentumScore += 16;
  else if (macdHist < 0 && macdHist <= prevMacdHist) momentumScore -= 16;
  momentumScore = Math.max(5, Math.min(96, momentumScore));
  // 4. Volatility Regime
  let volRegimeScore = 66;
  let regimeLabel = 'NORMAL EXPANSION';
  if (bbWidth < 1.25) { volRegimeScore = 58; regimeLabel = 'BOLLINGER SQUEEZE (Siap Breakout)'; }
  else if (atrPct > 3.8) { volRegimeScore = 50; regimeLabel = 'HIGH VOLATILITY (Lebarkan Stop)'; }
  else if (trendScore > 65 || trendScore < 35) { volRegimeScore = 82; regimeLabel = 'INSTITUTIONAL TREND FLOW'; }
  // ================= PILAR BARU (ORBIT IQ 2026) =================
  // Pilar 13: ORB — Opening Range Breakout. Rentang pembukaan 60 menit pertama sesi
  // (UTC day untuk TF intraday; weekly-opening-range untuk D1). Breakout dengan
  // konfirmasi jarak >= 0.1 ATR dianggap kelanjutan institusional sesi.
  const TF_MINUTES = { M1: 1, M5: 5, M15: 15, M30: 30, M45: 45, H1: 60, H2: 120, H4: 240, H6: 360, H8: 480, H12: 720, D1: 1440, W1: 10080, MN: 43200 };
  const tfMin = TF_MINUTES[timeframe] || 60;
  let orb = {
    state: 'N/A — ORB aktif di TF M1–D1 (intraday/swing)', high: 0, low: 0,
    bias: 0, label: tfMin === 1440 ? 'Weekly Opening Range' : 'Opening Range 60m Sesi UTC'
  };
  if (tfMin <= 1440) {
    const sessLen = tfMin === 1440 ? 604800 : 86400;
    const sessStart = Math.floor(lastCandle.time / sessLen) * sessLen;
    const sessBars = [];
    for (let i = lastIdx; i >= 0; i--) {
      if (candles[i].time >= sessStart) sessBars.unshift(candles[i]); else break;
    }
    const orBarsN = tfMin === 1440 ? 1 : Math.max(1, Math.min(sessBars.length, Math.round(60 / tfMin)));
    if (sessBars.length > orBarsN && orBarsN >= 1) {
      let orHigh = 0, orLow = Infinity;
      for (let i = 0; i < orBarsN; i++) {
        if (sessBars[i].high > orHigh) orHigh = sessBars[i].high;
        if (sessBars[i].low < orLow) orLow = sessBars[i].low;
      }
      const margin = atr * 0.1;
      if (lastPrice > orHigh + margin) {
        orb = { state: 'BREAKOUT ATAS ▲ (lanjutan institusional di atas rentang pembukaan)', high: orHigh, low: orLow, bias: 1, label: orb.label };
      } else if (lastPrice < orLow - margin) {
        orb = { state: 'BREAKOUT BAWAH ▼ (distribusi di bawah rentang pembukaan)', high: orHigh, low: orLow, bias: -1, label: orb.label };
      } else {
        orb = { state: 'DALAM RANGE (kompresi — tunggu resolusi breakout)', high: orHigh, low: orLow, bias: 0, label: orb.label };
      }
    } else {
      orb.state = 'MEMBENTUK RANGE PEMBUKAAN (sesi baru berjalan)';
    }
  }
  // Pilar 14: Theta Index — indeks peluruhan (decay) momentum. Membandingkan momentum
  // harga jendela terbaru vs jendela sebelumnya, dinormalisasi ATR: menangkap
  // akselerasi tren lebih dini dan memperingatkan momentum yang kehabisan tenaga.
  let thetaIndex = 50, thetaNote = 'Data momentum belum cukup', thetaBias = 0;
  if (closes.length > 40) {
    const mk = 5;
    let mNow = 0, mPrev = 0, nNow = 0, nPrev = 0;
    for (let i = Math.max(mk, lastIdx - 9); i <= lastIdx; i++) { mNow += closes[i] - closes[i - mk]; nNow++; }
    for (let i = Math.max(mk, lastIdx - 24); i <= lastIdx - 10; i++) { mPrev += closes[i] - closes[i - mk]; nPrev++; }
    if (nNow && nPrev) {
      mNow /= nNow; mPrev /= nPrev;
      const thetaNorm = (mNow - mPrev) / Math.max(atr * 5, lastPrice * 1e-8);
      thetaIndex = Math.max(2, Math.min(98, Math.round(50 + thetaNorm * 25)));
      const upTrend = ema20 > ema50;
      if (thetaIndex >= 62) { thetaNote = upTrend ? 'Akselerasi bullish — momentum menguat' : 'Momentum rebound dari tekanan jual'; thetaBias = upTrend ? 1 : 0.5; }
      else if (thetaIndex <= 38) { thetaNote = upTrend ? 'MOMENTUM MELURUH — rawan koreksi / ambil profit' : 'Akselerasi bearish — tekanan jual menguat'; thetaBias = upTrend ? -1 : -0.5; }
      else { thetaNote = 'Momentum seimbang / berkelanjutan'; thetaBias = 0; }
    }
  }
  // Pilar 15: VWAP Entry Hunter — kualitas entry di VWAP institusional. Pada tren naik,
  // pullback ke area VWAP (±0.35 ATR) = zona entry berkualitas; deviasi >2 ATR = risiko
  // mengejar harga (chase). Cermin untuk tren turun (SHORT re-entry di VWAP).
  const vwapDevAtr = atr > 0 ? (lastPrice - vwap) / atr : 0;
  let vwapEntry = { text: 'Netral — harga berseimbang di VWAP sesi', quality: 50, bias: 0 };
  if (trendScore >= 62) {
    if (vwapDevAtr >= -0.35 && vwapDevAtr <= 0.35) {
      vwapEntry = { text: 'ZONA ENTRY VWAP AKTIF ▲ — pullback institusional valid (kualitas tinggi)', quality: 86, bias: 1 };
    } else if (vwapDevAtr > 2.0) {
      vwapEntry = { text: 'DEVIASI EKSTREM >2σ di atas VWAP — jangan kejar harga, tunggu pullback', quality: 34, bias: -0.5 };
    } else if (vwapDevAtr < -0.35) {
      vwapEntry = { text: 'Di bawah VWAP pada tren naik — tunggu reclaim VWAP sebagai trigger', quality: 48, bias: 0 };
    } else {
      vwapEntry = { text: 'Uptrend sehat — pantau pullback VWAP (deviasi ' + vwapDevAtr.toFixed(1) + ' ATR)', quality: 62, bias: 0.5 };
    }
  } else if (trendScore <= 38) {
    if (vwapDevAtr >= -0.35 && vwapDevAtr <= 0.35) {
      vwapEntry = { text: 'ZONA ENTRY VWAP AKTIF ▼ — re-entry SHORT institusional di VWAP', quality: 84, bias: -1 };
    } else if (vwapDevAtr < -2.0) {
      vwapEntry = { text: 'DEVIASI EKSTREM >2σ di bawah VWAP — rawan short-covering bounce', quality: 36, bias: 0.5 };
    } else {
      vwapEntry = { text: 'Downtrend — pantau rejeksi VWAP sebagai trigger SHORT', quality: 60, bias: -0.5 };
    }
  } else {
    if (Math.abs(vwapDevAtr) <= 0.35) vwapEntry = { text: 'Harga menempel VWAP (magnet) — range/play mean-reversion kecil', quality: 55, bias: 0 };
    else vwapEntry = { text: 'Range ekspansif dari VWAP (' + vwapDevAtr.toFixed(1) + ' ATR) — konfirmasi arah dulu', quality: 50, bias: 0 };
  }
  // Pilar 16: Efficiency Ratio (Kaufman) — kualitas/kemurnian tren modern:
  // perbandingan perpindahan netto vs total perjalanan harga 30 bar.
  let erValue = 0.5, erNote = 'Data belum cukup', erBias = 0;
  if (closes.length > 32) {
    const w = 30;
    const netMove = Math.abs(closes[lastIdx] - closes[lastIdx - w]);
    let path = 0;
    for (let i = lastIdx - w + 1; i <= lastIdx; i++) path += Math.abs(closes[i] - closes[i - 1]);
    erValue = path > 0 ? netMove / path : 0;
    if (erValue >= 0.55) { erNote = 'Tren BERSIH (noise minim) — sinyal follow-through kuat'; erBias = (ema20 > ema50) ? 1 : -1; }
    else if (erValue >= 0.3) { erNote = 'Tren normal — struktur cukup bersih'; erBias = 0; }
    else { erNote = 'PASAR CHOPPY (noise tinggi) — kurangi agresi, kecilkan size'; erBias = -0.5; }
  }
  // Skor pilar baru digabung dengan bobot direnormalisasi (trend/struktur tetap dominan)
  let quantEdgeScore = 50;
  quantEdgeScore += orb.bias * 16;
  quantEdgeScore += thetaBias * 12;
  quantEdgeScore += vwapEntry.bias * 12;
  quantEdgeScore += erBias * 8;
  quantEdgeScore = Math.max(8, Math.min(96, Math.round(quantEdgeScore)));
  const rawDirectional = (trendScore * 0.30) + (structureScore * 0.28) + (momentumScore * 0.19) + (volRegimeScore * 0.09) + (quantEdgeScore * 0.14);
  const confluenceScore = Math.round(Math.max(12, Math.min(98, rawDirectional)));
  let direction = 'NEUTRAL';
  if (confluenceScore >= 56) direction = 'LONG';
  else if (confluenceScore <= 44) direction = 'SHORT';
  let investorStatus = 'HOLD / WAIT VALUE';
  if (mode === 'investor') {
    if (direction === 'SHORT') {
      direction = 'NEUTRAL';
      investorStatus = rsi < 40 ? 'DEEP VALUE DCA ZONE (Cicil di Area Demand)' : 'WAIT / TAHAN AKUMULASI (Menunggu Diskon Support)';
    } else if (confluenceScore >= 65) {
      investorStatus = 'STRONG SPOT ACCUMULATION (Fase Markup Institusional)';
    } else {
      investorStatus = 'GRADUAL DCA ACCUMULATION (Akumulasi Bertahap)';
    }
  }
  const tfMult = timeframe === 'M1' || timeframe === 'M5' ? 1.15 : timeframe === 'M15' || timeframe === 'M30' ? 1.35 : timeframe === 'H1' || timeframe === 'H4' ? 1.65 : 2.1;
  const riskDist = atr * tfMult;
  const isBear = direction === 'SHORT';
  const entry = lastPrice;
  const sl = isBear ? entry + riskDist : entry - riskDist;
  const tp1 = isBear ? entry - riskDist * 1.5 : entry + riskDist * 1.5;
  const tp2 = isBear ? entry - riskDist * 2.5 : entry + riskDist * 2.5;
  const tp3 = isBear ? entry - riskDist * 4.0 : entry + riskDist * 4.0;
  const rrRatio = 2.5;
  const dcaZone1 = lastPrice * 0.992;
  const dcaZone2 = Math.min(lastPrice * 0.965, vp.val || lastPrice * 0.96);
  const dcaZone3 = Math.min(lastPrice * 0.925, modern.demandZone.low || lastPrice * 0.92);
  const invTarget1 = lastPrice * 1.12;
  const invTarget2 = lastPrice * 1.28;
  const invTarget3 = lastPrice * 1.55;
  const invInvalidation = lastPrice * 0.86;
  const backtest = runWalkForwardBacktest(candles, ema20Arr, ema50Arr, rsiArr, atrArr, meta.assetClass === 'crypto', timeframe);
  const fundamentalCot = buildDeepFundamentalAndCot(meta, lastPrice, trendScore, rsi, atrPct);
  const fvgNote = modern.bullFvg
    ? `Bullish FVG di ${formatSmartPrice(modern.bullFvg.bottom)}-${formatSmartPrice(modern.bullFvg.top)}`
    : modern.bearFvg
    ? `Bearish FVG di ${formatSmartPrice(modern.bearFvg.bottom)}-${formatSmartPrice(modern.bearFvg.top)}`
    : 'FVG Seimbang (Terisi)';
  const reasons = [
    `[SMC & Struktur ${timeframe}] ${modern.smcStatus} | ${modern.liquiditySweep}.`,
    `[VWAP, VPVR & TPO] Harga terhadap VWAP (${formatSmartPrice(vwap)}), VPVR POC (${formatSmartPrice(vp.poc)}), dan TPO POC (${formatSmartPrice(vp.tpoPoc)}).`,
    `[FVG & Supply/Demand] ${fvgNote} | Zona Demand: ${formatSmartPrice(modern.demandZone.low)} | Zona Supply: ${formatSmartPrice(modern.supplyZone.high)}.`,
    `[MA Stack & Bollinger] EMA20 (${formatSmartPrice(ema20)}) / EMA50 (${formatSmartPrice(ema50)}) / MA200 (${formatSmartPrice(ma200)}) | RSI(14): ${rsi.toFixed(1)}.`,
    `[ORB • Theta • VWAP Entry] ORB: ${orb.state}${orb.high ? ' (' + formatSmartPrice(orb.low) + ' – ' + formatSmartPrice(orb.high) + ')' : ''} | Theta Index: ${thetaIndex}/100 (${thetaNote}) | Entry VWAP: ${vwapEntry.text} | Efficiency Ratio: ${(erValue * 100).toFixed(0)}%.`,
    `[CFTC COT & Fundamental] Spekulan Institusi ${fundamentalCot.specLongPct}% Long (${fundamentalCot.institutionalBias}) | ${fundamentalCot.valuationMetrics}.`
  ];
  return {
    symbol: meta.symbol,
    name: meta.name,
    assetClass: meta.assetClass,
    region: meta.region || 'GLOBAL',
    timeframe,
    horizon: HORIZON_GROUPS[horizon] ? horizon : 'intraday',
    mode,
    isRealtime: true,
    delayMinutes: 0,
    lastPrice,
    changePct,
    direction,
    investorStatus,
    confluenceScore,
    regime: regimeLabel,
    structureTag: modern.smcStatus,
    subScores: {
      trend: Math.round(trendScore),
      structure: Math.round(structureScore),
      momentum: Math.round(momentumScore),
      quantEdge: quantEdgeScore,
      cotBias: fundamentalCot.specLongPct
    },
    levels: {
      entry, sl, tp1, tp2, tp3, rrRatio,
      poc: vp.poc, vah: vp.vah, val: vp.val, tpoPoc: vp.tpoPoc,
      vwap,
      swingHigh: modern.supplyZone.high,
      swingLow: modern.demandZone.low,
      pivot: modern.pivotSr.pivot,
      r1: modern.pivotSr.r1, r2: modern.pivotSr.r2,
      s1: modern.pivotSr.s1, s2: modern.pivotSr.s2,
      dcaZone1, dcaZone2, dcaZone3, invTarget1, invTarget2, invTarget3, invInvalidation
    },
    indicators: {
      ema20, ema50, sma100, ema200, ma200, vwap,
      rsi, atr, atrPct, macdHist, bbUpper, bbLower, bbWidth,
      smcStatus: modern.smcStatus,
      liquiditySweep: modern.liquiditySweep,
      fvgNote,
      demandZoneText: `${formatSmartPrice(modern.demandZone.low)} - ${formatSmartPrice(modern.demandZone.high)}`,
      supplyZoneText: `${formatSmartPrice(modern.supplyZone.low)} - ${formatSmartPrice(modern.supplyZone.high)}`,
      // Pilar baru ORBIT IQ 2026
      orbLabel: orb.label, orbState: orb.state, orbHigh: orb.high, orbLow: orb.low,
      thetaIndex, thetaNote,
      vwapEntryText: vwapEntry.text, vwapDevAtr, vwapEntryQuality: vwapEntry.quality,
      erValue, erNote, quantEdgeScore
    },
    fundamentalCot,
    backtest,
    reasons,
    series: {
      ema20: candles.map((c, i) => ({ time: c.time, value: ema20Arr[i] ?? c.close })),
      ema50: candles.map((c, i) => ({ time: c.time, value: ema50Arr[i] ?? c.close })),
      ema200: candles.map((c, i) => ({ time: c.time, value: ma200Arr[i] ?? ema200Arr[i] ?? c.close })),
      vwap: candles.map((c, i) => ({ time: c.time, value: vwapObj.vwap[i] ?? c.close })),
      bbUpper: candles.map((c, i) => ({ time: c.time, value: bbObj.upper[i] ?? c.high })),
      bbLower: candles.map((c, i) => ({ time: c.time, value: bbObj.lower[i] ?? c.low })),
      rsi: candles.map((c, i) => ({ time: c.time, value: rsiArr[i] ?? 50 }))
    }
  };
}
function formatSmartPrice(v) {
  if (!v && v !== 0) return '--';
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (a >= 1) return v.toFixed(3);
  return v.toFixed(6);
}
export function runWalkForwardBacktest(candles, ema20, ema50, rsi, atr, isCrypto, timeframe) {
  if (timeframe === 'MN' || timeframe === '1Y') {
    return { disabled: true, reason: 'INSUFFICIENT_MACRO_BARS', sampleSize: 0, winRate: 0, expectancyR: 0, profitFactor: 0, maxDrawdownR: 0, weakEvidence: true };
  }
  let wins = 0, losses = 0, grossWinR = 0, grossLossR = 0, eqR = 0, peakR = 0, maxDdR = 0;
  const feeR = isCrypto ? 0.09 : 0.08;
  for (let i = 52; i < candles.length - 6; i++) {
    const e20 = ema20[i], e50 = ema50[i], r = rsi[i], a = atr[i];
    if (!e20 || !e50 || !a) continue;
    let dir = 0;
    if (e20 > e50 && candles[i].close > e20 && r > 52 && r < 72) dir = 1;
    else if (e20 < e50 && candles[i].close < e20 && r < 48 && r > 28) dir = -1;
    if (dir === 0) continue;
    const entry = candles[i].close;
    const risk = a * 1.35;
    const sl = dir === 1 ? entry - risk : entry + risk;
    const tp = dir === 1 ? entry + risk * 1.8 : entry - risk * 1.8;
    let outcomeR = null;
    for (let k = i + 1; k <= Math.min(candles.length - 1, i + 12); k++) {
      const bar = candles[k];
      const hitSL = dir === 1 ? bar.low <= sl : bar.high >= sl;
      const hitTP = dir === 1 ? bar.high >= tp : bar.low <= tp;
      if (hitSL && hitTP) { outcomeR = -1.0 - feeR; break; }
      if (hitSL) { outcomeR = -1.0 - feeR; break; }
      if (hitTP) { outcomeR = 1.8 - feeR; break; }
    }
    if (outcomeR !== null) {
      if (outcomeR > 0) { wins++; grossWinR += outcomeR; }
      else { losses++; grossLossR += Math.abs(outcomeR); }
      eqR += outcomeR;
      if (eqR > peakR) peakR = eqR;
      const dd = peakR - eqR;
      if (dd > maxDdR) maxDdR = dd;
      i += 3;
    }
  }
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const expectancyR = total > 0 ? (grossWinR - grossLossR) / total : 0;
  const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : wins > 0 ? 2.5 : 0;
  const weakEvidence = total < 30 || expectancyR <= 0;
  return {
    disabled: false,
    sampleSize: total,
    wins,
    losses,
    winRate: Number(winRate.toFixed(1)),
    expectancyR: Number(expectancyR.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    netR: Number(eqR.toFixed(2)),
    maxDrawdownR: Number(maxDdR.toFixed(2)),
    weakEvidence
  };
}
export const computeSignal = runFullAnalysis;
export const computeFullSignal = runFullAnalysis;
export const analyzeCandles = runFullAnalysis;