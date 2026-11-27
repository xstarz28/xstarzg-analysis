/* ==================== ANALISIS INSTRUMEN PER KELOMPOK ====================
   Satu pembangun data murni (tanpa DOM) untuk tiga ruang kerja:
     • trader   — psikologi trading, teknikal SMC, fundamental makro/COT
     • investor — psikologi akumulasi, valuasi/DCA, fundamental siklus
     • dex      — psikologi meme/hype, teknikal OHLCV, fundamental on-chain

   METODE SNIPER MULTI-TIMEFRAME
   Analisis ditampilkan sebagai tangga tiga tingkat:
     HTF (1D–4H) arah & likuiditas  ->  MTF (1H–15m) struktur OB/FVG  ->
     LTF (5m–1m) konfirmasi entry.
   SKOR SNIPER hanya menjumlahkan konfluensi yang SEARAH dengan arah sinyal.
   Indikator lain tetap tampil sebagai KONTEKS dan TIDAK menambah skor —
   jadi skor tinggi tidak bisa didapat dengan menumpuk semua indikator. */

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const txt = (lang, id, en) => (lang === 'id' ? id : en);

// Harga selalu diformat rapi; angka mentah 2737.075123481634 tidak boleh tampil.
const fmtPrice = (value) => {
  const v = num(value);
  if (!(v > 0)) return '-';
  if (v >= 100) return v.toFixed(2);
  if (v >= 1) return v.toFixed(3);
  return Number(v.toPrecision(4)).toString();
};

function emaSeries(values, period) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}

function rsiLast(values, period = 14) {
  if (values.length < 2) return 50;
  let gains = 0, losses = 0;
  const start = Math.max(1, values.length - period);
  for (let i = start; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gains += delta; else losses -= delta;
  }
  const count = Math.max(1, values.length - start);
  const avgGain = gains / count, avgLoss = losses / count;
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function volumeTrend(candles) {
  if (!Array.isArray(candles) || candles.length < 20) return null;
  const vols = candles.map(c => num(c.volume, 0));
  const recent = vols.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const prior = vols.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
  if (!(prior > 0)) return null;
  return { recent, prior, ratio: recent / prior };
}

function structureState(candles) {
  if (!Array.isArray(candles) || candles.length < 24) return 'NEUTRAL';
  const closes = candles.map(c => num(c.close));
  const recent = closes.slice(-12);
  const prior = closes.slice(-24, -12);
  const hiRecent = Math.max(...recent), hiPrior = Math.max(...prior);
  const loRecent = Math.min(...recent), loPrior = Math.min(...prior);
  if (hiRecent > hiPrior && loRecent > loPrior) return 'BULLISH';
  if (hiRecent < hiPrior && loRecent < loPrior) return 'BEARISH';
  return 'NEUTRAL';
}

function biasTone(bias) {
  return bias === 'BULLISH' ? 'bull' : bias === 'BEARISH' ? 'bear' : 'neutral';
}

function ladderState(htf, mtf, ltf) {
  const values = [htf, mtf, ltf];
  if (values.every(v => v !== 'NEUTRAL' && v === values[0])) return 'aligned';
  if (htf !== 'NEUTRAL' && htf === mtf) return 'mixed';
  return 'against';
}

function scoreBand(score, direction) {
  if (direction === 'NEUTRAL' || score <= 0) return 'NO-TRADE';
  if (score >= 84) return 'ELITE';
  if (score >= 75) return 'PRO';
  if (score >= 60) return 'WATCH';
  return 'NO-TRADE';
}

function buildLadder(lang, htf, mtf, ltf) {
  const state = ladderState(htf, mtf, ltf);
  const dirTxt = (bias) => bias === 'BULLISH'
    ? txt(lang, '▲ Bullish', '▲ Bullish')
    : bias === 'BEARISH' ? txt(lang, '▼ Bearish', '▼ Bearish') : txt(lang, '◆ Netral', '◆ Neutral');
  return {
    state,
    rows: [
      {
        tier: 'HTF',
        tfs: 'D1 – H4',
        role: txt(lang, 'Arah tren & likuiditas makro', 'Macro trend direction & liquidity'),
        bias: htf,
        detail: dirTxt(htf)
      },
      {
        tier: 'MTF',
        tfs: 'H1 – M15',
        role: txt(lang, 'Struktur Order Block / FVG', 'Order Block / FVG structure'),
        bias: mtf,
        detail: dirTxt(mtf)
      },
      {
        tier: 'LTF',
        tfs: 'M5 – M1',
        role: txt(lang, 'Konfirmasi pemicu entry', 'Entry trigger confirmation'),
        bias: ltf,
        detail: dirTxt(ltf)
      }
    ]
  };
}

/* ---------- TRADER ---------- */
function buildTrader(lang, a) {
  const ind = (a && a.indicators) || {};
  const lv = (a && a.levels) || {};
  const td = (a && a.topDown) || {};
  const fc = (a && a.fundamentalCot) || {};
  const mq = (a && a.macroQuant) || {};
  const bm = (a && a.brainMetrics) || {};
  /* Arah resmi (lolos gerbang) vs bias analitis: bila gerbang belum menerbitkan
     sinyal, panel tetap menampilkan konfluensi terukur dari softBias — tetapi
     band skornya ditahan di WATCH supaya tidak terlihat seperti sinyal resmi. */
  const engineDir = a && a.direction ? a.direction : 'NEUTRAL';
  const softDir = a && (a.softBias === 'LONG' || a.softBias === 'SHORT') ? a.softBias : 'NEUTRAL';
  const direction = engineDir !== 'NEUTRAL' ? engineDir : softDir;
  const official = engineDir !== 'NEUTRAL';
  const want = direction === 'LONG' ? 'BULLISH' : direction === 'SHORT' ? 'BEARISH' : 'NEUTRAL';

  const htf = td.macroBias || 'NEUTRAL';
  const mtf = td.structBias || (num(ind.smcStatus && ind.smcStatus.indexOf('BULL') > -1 ? 1 : 0) ? 'BULLISH' : 'NEUTRAL');
  const ltf = td.execBias || (num(ind.macdHist) >= 0 ? 'BULLISH' : 'BEARISH');
  const ladder = buildLadder(lang, htf, mtf, ltf);

  const sweepText = String(ind.liquiditySweep || 'NONE');
  const fvgText = String(ind.fvgNote || '-');
  const liquidityOk = want !== 'NEUTRAL' && (
    (want === 'BULLISH' && (sweepText.indexOf('▲') > -1 || fvgText.indexOf('Bullish') > -1)) ||
    (want === 'BEARISH' && (sweepText.indexOf('▼') > -1 || fvgText.indexOf('Bearish') > -1))
  );
  const fomoBlocked = (a && Array.isArray(a.gateReasons) ? a.gateReasons : []).some(r =>
    r === 'FOMO_ZONE' || r === 'SNIPER_PREMIUM' || r === 'OVEREXTENDED');
  const riskPct = num(a && a.masterProfile && a.masterProfile.riskPct, 0);
  // Disiplin hanya dihitung bila arah sinyal benar-benar searah makro (HTF).
  const psychOk = want !== 'NEUTRAL' && htf === want && !fomoBlocked && riskPct > 0;
  const cotBias = String(fc.institutionalBias || '').toUpperCase();
  const fundamentalOk = want !== 'NEUTRAL' && (
    (want === 'BULLISH' && (cotBias.indexOf('BULL') > -1 || String(fc.macroRegime || '').toUpperCase().indexOf('RISK-ON') > -1)) ||
    (want === 'BEARISH' && (cotBias.indexOf('BEAR') > -1 || String(fc.macroRegime || '').toUpperCase().indexOf('RISK-OFF') > -1))
  );
  const triggerOk = want !== 'NEUTRAL' && ltf === want && (td.isAligned === true || ladder.state === 'aligned');

  const scored = [
    { id: 'htf', weight: 22, ok: want !== 'NEUTRAL' && htf === want },
    { id: 'struct', weight: 20, ok: want !== 'NEUTRAL' && mtf === want },
    { id: 'trigger', weight: 18, ok: triggerOk },
    { id: 'liquidity', weight: 12, ok: liquidityOk },
    { id: 'psych', weight: 14, ok: psychOk },
    { id: 'fund', weight: 14, ok: fundamentalOk }
  ];
  const score = scored.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);

  const counted = (id) => scored.some(item => item.id === id && item.ok);
  const mark = (id) => ({ counted: counted(id), criterion: true });
  const technical = [
    { label: txt(lang, 'Bias HTF (D1/H4)', 'HTF bias (D1/H4)'), value: htf, note: txt(lang, 'Arah makro wajib searah sebelum entry', 'Macro direction must agree before entry'), tone: biasTone(htf), ...mark('htf') },
    { label: txt(lang, 'Struktur MTF (H1/M15)', 'MTF structure (H1/M15)'), value: mtf, note: txt(lang, 'BOS/CHoCH + Order Block', 'BOS/CHoCH + Order Block'), tone: biasTone(mtf), ...mark('struct') },
    { label: txt(lang, 'Pemicu LTF (M5/M1)', 'LTF trigger (M5/M1)'), value: ltf, note: txt(lang, 'Candle konfirmasi searah sinyal', 'Confirmation candle agrees with signal'), tone: biasTone(ltf), ...mark('trigger') },
    { label: txt(lang, 'Liquidity sweep / FVG', 'Liquidity sweep / FVG'), value: sweepText + ' • ' + fvgText, note: txt(lang, 'Sapuan stop lalu imbalance', 'Stop sweep then imbalance'), tone: liquidityOk ? 'bull' : 'neutral', ...mark('liquidity') },
    { label: txt(lang, 'EMA Ribbon 20/50 & MA-200', 'EMA ribbon 20/50 & MA-200'), value: num(ind.ema20) >= num(ind.ema50) ? 'BULLISH' : 'BEARISH', note: txt(lang, 'Konteks tren — tidak menambah skor', 'Trend context — does not add score'), tone: biasTone(num(ind.ema20) >= num(ind.ema50) ? 'BULLISH' : 'BEARISH'), counted: false },
    { label: txt(lang, 'RSI(14) & MACD histogram', 'RSI(14) & MACD histogram'), value: 'RSI ' + num(ind.rsi, 50).toFixed(1) + ' • MACD ' + (num(ind.macdHist) >= 0 ? '+' : '') + num(ind.macdHist).toPrecision(3), note: txt(lang, 'Konteks momentum — tidak menambah skor', 'Momentum context — does not add score'), tone: num(ind.macdHist) >= 0 ? 'bull' : 'bear', counted: false },
    { label: txt(lang, 'Bollinger & ATR', 'Bollinger & ATR'), value: 'BBW ' + num(ind.bbWidth).toFixed(2) + '% • ATR ' + num(ind.atrPct).toFixed(2) + '%', note: txt(lang, 'Konteks volatilitas — tidak menambah skor', 'Volatility context — does not add score'), tone: 'neutral', counted: false },
    { label: txt(lang, 'VWAP & VPVR', 'VWAP & VPVR'), value: 'POC ' + fmtPrice(lv.poc) + ' • VWAP ' + fmtPrice(ind.vwap), note: txt(lang, 'Konteks likuiditas sesi — tidak menambah skor', 'Session liquidity context — does not add score'), tone: 'neutral', counted: false }
  ];

  const psychology = [
    { label: txt(lang, 'Disiplin entry', 'Entry discipline'), value: fomoBlocked ? txt(lang, 'FOMO DICEGAH', 'FOMO BLOCKED') : txt(lang, 'SABAR MENUNGGU', 'PATIENT'), note: txt(lang, 'Jangan kejar harga di zona premium', 'Do not chase price in premium zone'), tone: fomoBlocked ? 'bear' : 'bull', ...mark('psych') },
    { label: txt(lang, 'Risiko per posisi', 'Risk per position'), value: riskPct > 0 ? riskPct + '%' : txt(lang, 'Belum ada sinyal', 'No signal yet'), note: txt(lang, 'Ukuran posisi mengikuti tier sinyal', 'Position size follows the signal tier'), tone: riskPct > 0 ? 'bull' : 'neutral', counted: false },
    { label: txt(lang, 'Mode otak', 'Brain mode'), value: bm.brain || (a && a.timeframe && ['M1', 'M5', 'M15'].indexOf(a.timeframe) > -1 ? 'SCALP' : 'SNIPER'), note: txt(lang, 'Sniper = presisi struktural, Scalp = momentum cepat', 'Sniper = structural precision, Scalp = fast momentum'), tone: 'neutral', counted: false },
    { label: txt(lang, 'Kesabaran target', 'Target patience'), value: txt(lang, 'TP1 50% → SL BE+', 'TP1 50% → SL BE+'), note: txt(lang, 'Kunci 0-risiko sebelum runner', 'Lock 0-risk before the runner'), tone: 'neutral', counted: false }
  ];

  const fundamental = [
    { label: txt(lang, 'CFTC COT institusi', 'CFTC COT institutions'), value: fc.institutionalBias || '-', note: 'Long ' + num(fc.specLongPct, 50) + '% / Short ' + (100 - num(fc.specLongPct, 50)) + '%', tone: biasTone(cotBias.indexOf('BULL') > -1 ? 'BULLISH' : cotBias.indexOf('BEAR') > -1 ? 'BEARISH' : 'NEUTRAL'), ...mark('fund') },
    { label: txt(lang, 'Rezim bank sentral', 'Central bank regime'), value: fc.centralBankStance || fc.macroRegime || '-', note: txt(lang, 'Konteks likuiditas global', 'Global liquidity context'), tone: 'neutral', counted: false },
    { label: txt(lang, 'Korelasi DXY', 'DXY correlation'), value: fc.dxyCorrelation || '-', note: txt(lang, 'Dolar kuat menekan aset risiko', 'Strong dollar pressures risk assets'), tone: 'neutral', counted: false },
    { label: txt(lang, 'Posisi siklus harga', 'Price cycle position'), value: num(mq.posCyclePct, 50) + '%', note: txt(lang, 'Di puncak = rawan jadi exit liquidity', 'At the top = exit liquidity risk'), tone: num(mq.posCyclePct, 50) > 88 ? 'bear' : 'neutral', counted: false },
    { label: txt(lang, 'Katalis terdekat', 'Nearest catalyst'), value: fc.upcomingCatalyst || '-', note: fc.macroDriver || '', tone: 'neutral', counted: false }
  ];

  return { ladder, psychology, technical, fundamental, score, scored, direction, official };
}

/* ---------- INVESTOR ---------- */
function buildInvestor(lang, a) {
  const ind = (a && a.indicators) || {};
  const lv = (a && a.levels) || {};
  const td = (a && a.topDown) || {};
  const fc = (a && a.fundamentalCot) || {};
  const mq = (a && a.macroQuant) || {};
  const price = num(a && a.lastPrice);
  const fair = num(lv.poc, price) * 0.55 + num(lv.vwap, price) * 0.45;
  const mosPct = fair > 0 ? ((price - fair) / fair) * 100 : 0;
  const htf = td.macroBias || 'NEUTRAL';
  const mtf = td.structBias || 'NEUTRAL';
  const ltf = td.execBias || 'NEUTRAL';
  const ladder = buildLadder(lang, htf, mtf, ltf);
  const dca1 = num(lv.dcaZone1, price);
  const nearDca = dca1 > 0 && price > 0 ? Math.abs(price - dca1) / price <= 0.02 : false;
  const cyclePct = num(mq.posCyclePct, 50);
  const rsi = num(ind.rsi, 50);

  const scored = [
    { id: 'htf', weight: 20, ok: htf === 'BULLISH' },
    { id: 'valuation', weight: 20, ok: mosPct <= 0 },
    { id: 'dca', weight: 15, ok: nearDca },
    { id: 'cycle', weight: 15, ok: cyclePct <= 60 },
    { id: 'macro', weight: 15, ok: String(fc.macroRegime || '').toUpperCase().indexOf('RISK-OFF') === -1 },
    { id: 'psych', weight: 15, ok: rsi <= 60 && !(cyclePct > 88) }
  ];
  const score = scored.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  const counted = (id) => scored.some(item => item.id === id && item.ok);
  const mark = (id) => ({ counted: counted(id), criterion: true });

  const psychology = [
    { label: txt(lang, 'Sikap akumulasi', 'Accumulation stance'), value: mosPct <= 0 ? txt(lang, 'AKUMULASI BERTAHAP', 'GRADUAL ACCUMULATION') : txt(lang, 'TUNGGU DISKON', 'WAIT FOR DISCOUNT'), note: txt(lang, 'Beli bertahap, bukan mengejar', 'Buy gradually, never chase'), tone: mosPct <= 0 ? 'bull' : 'neutral', ...mark('psych') },
    { label: txt(lang, 'Euforia vs ketakutan', 'Euphoria vs fear'), value: cyclePct > 88 ? txt(lang, 'EUFORIA — HINDARI', 'EUPHORIA — AVOID') : cyclePct < 12 ? txt(lang, 'TAKUT — ZONA CICIL', 'FEAR — DCA ZONE') : txt(lang, 'NETRAL', 'NEUTRAL'), note: txt(lang, 'Posisi siklus ' + cyclePct + '% dari range', 'Cycle position ' + cyclePct + '% of range'), tone: cyclePct > 88 ? 'bear' : cyclePct < 12 ? 'bull' : 'neutral', counted: false },
    { label: txt(lang, 'Disiplin horizon', 'Horizon discipline'), value: '12–36 ' + txt(lang, 'bulan', 'months'), note: txt(lang, 'Abaikan noise harian', 'Ignore daily noise'), tone: 'neutral', counted: false }
  ];

  const technical = [
    { label: txt(lang, 'Tren HTF (D1/W1)', 'HTF trend (D1/W1)'), value: htf, note: txt(lang, 'Akumulasi hanya melawan tren bila valuasi ekstrem', 'Only accumulate against trend on extreme valuation'), tone: biasTone(htf), ...mark('htf') },
    { label: txt(lang, 'Margin of Safety', 'Margin of safety'), value: (mosPct <= 0 ? '+' : '−') + Math.abs(mosPct).toFixed(1) + '%', note: txt(lang, 'Harga vs nilai wajar (POC+VWAP)', 'Price vs fair value (POC+VWAP)'), tone: mosPct <= 0 ? 'bull' : 'bear', ...mark('valuation') },
    { label: txt(lang, 'Zona DCA tahap 1', 'DCA zone step 1'), value: dca1 > 0 ? fmtPrice(dca1) : '-', note: txt(lang, 'Jarak harga ke zona cicil', 'Distance to accumulation zone'), tone: nearDca ? 'bull' : 'neutral', ...mark('dca') },
    { label: txt(lang, 'Struktur MTF (H1/M15)', 'MTF structure (H1/M15)'), value: mtf, note: txt(lang, 'Konteks entry bertahap', 'Staged entry context'), tone: biasTone(mtf), counted: false },
    { label: txt(lang, 'Pemicu LTF (M5/M1)', 'LTF trigger (M5/M1)'), value: ltf, note: txt(lang, 'Konteks timing — tidak menambah skor investor', 'Timing context — does not add investor score'), tone: biasTone(ltf), counted: false },
    { label: txt(lang, 'RSI & volatilitas ATR', 'RSI & ATR volatility'), value: 'RSI ' + rsi.toFixed(1) + ' • ATR ' + num(ind.atrPct).toFixed(2) + '%', note: txt(lang, 'Konteks — tidak menambah skor', 'Context — does not add score'), tone: rsi > 70 ? 'bear' : rsi < 35 ? 'bull' : 'neutral', counted: false }
  ];

  const fundamental = [
    { label: txt(lang, 'Valuasi intrinsik', 'Intrinsic valuation'), value: fc.valuationMetrics || '-', note: txt(lang, 'POC + VWAP sebagai proksi nilai wajar', 'POC + VWAP as fair-value proxy'), tone: 'neutral', counted: false },
    { label: txt(lang, 'Rezim makro', 'Macro regime'), value: fc.macroRegime || '-', note: txt(lang, 'Risk-off menunda akumulasi agresif', 'Risk-off delays aggressive accumulation'), tone: String(fc.macroRegime || '').toUpperCase().indexOf('RISK-OFF') > -1 ? 'bear' : 'bull', ...mark('macro') },
    { label: txt(lang, 'Posisi siklus', 'Cycle position'), value: cyclePct + '% • DD ' + num(mq.drawdownPct, 0) + '%', note: txt(lang, 'Makin rendah makin baik untuk DCA', 'Lower is better for DCA'), tone: cyclePct <= 60 ? 'bull' : 'bear', ...mark('cycle') },
    { label: txt(lang, 'Persistensi momentum', 'Momentum persistence'), value: num(mq.upClosesPct, 50) + '% candle naik', note: txt(lang, 'Konteks — tidak menambah skor', 'Context — does not add score'), tone: 'neutral', counted: false },
    { label: txt(lang, 'Imbal hasil / yield', 'Yield'), value: a && a.assetClass === 'crypto' ? txt(lang, 'Staking/DeFi 2–8% APY', 'Staking/DeFi 2–8% APY') : a && a.assetClass === 'stocks' ? txt(lang, 'Dividen & capital gain', 'Dividends & capital gain') : txt(lang, 'Lindung nilai inflasi', 'Inflation hedge'), note: '', tone: 'neutral', counted: false }
  ];

  return { ladder, psychology, technical, fundamental, score, scored, mosPct, cyclePct };
}

/* ---------- DEX / MEME ---------- */
function buildDex(lang, dex) {
  const pair = (dex && dex.pair) || null;
  const candles = (dex && Array.isArray(dex.candles)) ? dex.candles : [];
  const security = (dex && dex.security) || {};
  const closes = candles.map(c => num(c.close)).filter(v => v > 0);
  const last = closes.length ? closes[closes.length - 1] : 0;
  const e20 = closes.length >= 20 ? emaSeries(closes.slice(-60), 20) : 0;
  const e50 = closes.length >= 50 ? emaSeries(closes.slice(-120), 50) : 0;
  const rsi = rsiLast(closes, 14);
  const vol = volumeTrend(candles);
  const struct = structureState(candles);
  const htf = struct === 'BULLISH' ? 'BULLISH' : struct === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
  const mtf = e20 > 0 && e50 > 0 ? (e20 > e50 ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';
  const ltf = closes.length >= 2 ? (closes[closes.length - 1] >= closes[closes.length - 2] ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';
  const ladder = buildLadder(lang, htf, mtf, ltf);

  const securityOk = security.status === 'verified' &&
    !/honeypot|mintable|blacklist/i.test(String(security.riskSummary || ''));
  const liquidityUsd = num(pair && pair.liquidityUsd, 0);
  const liquidityOk = liquidityUsd >= 50000;
  const trendOk = mtf === 'BULLISH';
  const momentumOk = rsi >= 45 && rsi <= 70;
  const volumeOk = !!(vol && vol.ratio >= 1);
  const change24h = num(pair && pair.change24h, 0);
  const psychOk = last > 0 && e20 > 0 ? (last <= e20 * 1.25 && change24h < 300) : false;

  const scored = [
    { id: 'security', weight: 25, ok: securityOk },
    { id: 'trend', weight: 20, ok: trendOk },
    { id: 'momentum', weight: 15, ok: momentumOk },
    { id: 'liquidity', weight: 15, ok: liquidityOk },
    { id: 'volume', weight: 15, ok: volumeOk },
    { id: 'psych', weight: 10, ok: psychOk }
  ];
  const score = scored.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  const counted = (id) => scored.some(item => item.id === id && item.ok);
  const mark = (id) => ({ counted: counted(id), criterion: true });

  const psychology = [
    { label: txt(lang, 'Risiko hype', 'Hype risk'), value: psychOk ? txt(lang, 'TERKENDALI', 'CONTAINED') : txt(lang, 'TINGGI — HINDARI', 'HIGH — AVOID'), note: txt(lang, 'Harga >25% di atas EMA20 atau lonjakan >300% = FOMO', 'Price >25% above EMA20 or >300% pump = FOMO'), tone: psychOk ? 'bull' : 'bear', ...mark('psych') },
    { label: txt(lang, 'Perubahan 24 jam', '24h change'), value: pair && pair.change24h != null ? Number(pair.change24h).toFixed(1) + '%' : '-', note: txt(lang, 'Pompa ekstrem rawan dump', 'Extreme pumps invite dumps'), tone: change24h > 100 ? 'bear' : change24h >= 0 ? 'bull' : 'neutral', counted: false },
    { label: txt(lang, 'Disiplin ukuran', 'Size discipline'), value: txt(lang, 'Posisi kecil / risiko maks 1%', 'Small size / max 1% risk'), note: txt(lang, 'Koin micin bisa -100% dalam satu blok', 'Meme coins can go -100% in one block'), tone: 'neutral', counted: false }
  ];

  const technical = [
    { label: txt(lang, 'Struktur HTF', 'HTF structure'), value: htf, note: txt(lang, 'Higher high/lows vs lower high/lows', 'Higher highs/lows vs lower highs/lows'), tone: biasTone(htf), counted: false },
    { label: txt(lang, 'Tren EMA20/EMA50', 'EMA20/EMA50 trend'), value: mtf, note: e20 > 0 ? 'EMA20 ' + fmtPrice(e20) + (e50 > 0 ? ' • EMA50 ' + fmtPrice(e50) : '') : txt(lang, 'Butuh minimal 20 candle', 'Needs at least 20 candles'), tone: biasTone(mtf), ...mark('trend') },
    { label: 'RSI(14)', value: closes.length ? rsi.toFixed(1) : '-', note: txt(lang, 'Zona sehat 45–70', 'Healthy zone 45–70'), tone: rsi > 70 ? 'bear' : rsi < 30 ? 'bull' : 'neutral', ...mark('momentum') },
    { label: txt(lang, 'Tren volume', 'Volume trend'), value: vol ? (vol.ratio >= 1 ? '+' : '') + ((vol.ratio - 1) * 100).toFixed(0) + '%' : '-', note: txt(lang, '10 candle terakhir vs sebelumnya', 'Last 10 candles vs prior 10'), tone: volumeOk ? 'bull' : 'neutral', ...mark('volume') },
    { label: txt(lang, 'Pemicu LTF', 'LTF trigger'), value: ltf, note: txt(lang, 'Candle terakhir searah', 'Latest candle direction'), tone: biasTone(ltf), counted: false }
  ];

  const fundamental = [
    { label: txt(lang, 'Likuiditas pool', 'Pool liquidity'), value: liquidityUsd > 0 ? '$' + liquidityUsd.toLocaleString('en-US') : '-', note: txt(lang, 'Minimum $50K agar tidak mudah digeser', 'At least $50K so it cannot be pushed easily'), tone: liquidityOk ? 'bull' : 'bear', ...mark('liquidity') },
    { label: txt(lang, 'Audit keamanan', 'Security audit'), value: security.status === 'verified' ? txt(lang, 'Terverifikasi', 'Verified') : txt(lang, 'Belum terverifikasi', 'Unverified'), note: security.source ? security.source + ' • ' + (security.riskSummary || '') : (security.message || ''), tone: securityOk ? 'bull' : 'bear', ...mark('security') },
    { label: txt(lang, 'Distribusi holder', 'Holder distribution'), value: security.holderDistribution || '-', note: txt(lang, 'Konsentrasi top 10 = risiko dump', 'Top-10 concentration = dump risk'), tone: 'neutral', counted: false },
    { label: txt(lang, 'Tokenomics', 'Tokenomics'), value: security.tokenomics || '-', note: txt(lang, 'Supply & fitur mint', 'Supply & mint capability'), tone: 'neutral', counted: false },
    { label: 'FDV / MCap', value: pair && num(pair.fdv) > 0 ? '$' + num(pair.fdv).toLocaleString('en-US') : '-', note: txt(lang, 'Konteks — tidak menambah skor', 'Context — does not add score'), tone: 'neutral', counted: false }
  ];

  return { ladder, psychology, technical, fundamental, score, scored };
}

const GROUP_TITLES = {
  trader: { id: '⚡ Trader — Sniper Multi-Timeframe', en: '⚡ Trader — Sniper Multi-Timeframe' },
  investor: { id: '🏛️ Investor — Valuasi & Sniper Multi-Timeframe', en: '🏛️ Investor — Valuation & Sniper Multi-Timeframe' },
  dex: { id: '🚀 DEX Meme — Sniper Multi-Timeframe', en: '🚀 DEX Meme — Sniper Multi-Timeframe' }
};

export function buildGroupAnalysis({ group = 'trader', analysis = null, candles = [], dex = null, lang = 'id' } = {}) {
  const language = lang === 'en' ? 'en' : 'id';
  const safeGroup = GROUP_TITLES[group] ? group : 'trader';
  let built;
  if (safeGroup === 'dex') built = buildDex(language, dex);
  else if (safeGroup === 'investor') built = buildInvestor(language, analysis);
  else built = buildTrader(language, analysis);

  const direction = safeGroup === 'dex'
    ? (built.ladder.state === 'aligned' ? built.ladder.rows[0].bias : 'NEUTRAL')
    : built.direction || (analysis && analysis.direction) || 'NEUTRAL';

  /* SATU SUMBER SKOR (anti sinyal-skor ganda).
     Panel sinyal, notifikasi Telegram, dan kartu Sniper MTF wajib memakai angka
     yang sama. Bila engine sudah menerbitkan sinyal resmi yang selaras, skor
     konfluensi resmi dipakai sebagai skor utama; rincian 6 kriteria sniper tetap
     ditampilkan sebagai BUKTI (dan tetap menjadi angka bila belum ada sinyal). */
  const td = (analysis && analysis.topDown) || {};
  const officialSignal = safeGroup === 'trader' && analysis &&
    analysis.signalEligible === true && td.isAligned !== false &&
    Number(analysis.confluenceScore) > 0;
  const criteriaScore = built.score;
  const officialScore = officialSignal ? Math.round(Number(analysis.confluenceScore)) : null;
  const score = officialScore == null ? criteriaScore : officialScore;
  const execBias = td.execBias || 'NEUTRAL';
  const execConfirmed = direction !== 'NEUTRAL' && execBias === direction;
  const rawBand = scoreBand(score, direction === 'BULLISH' ? 'LONG' : direction === 'BEARISH' ? 'SHORT' : direction);
  const awaitingOfficial = safeGroup === 'trader' && built.official === false && direction !== 'NEUTRAL';
  const band = awaitingOfficial && (rawBand === 'ELITE' || rawBand === 'PRO') ? 'WATCH' : rawBand;
  const countedTotal = built.scored.filter(item => item.ok).length;

  const noteParts = [];
  if (officialScore != null) {
    noteParts.push(language === 'id'
      ? 'Skor utama ' + score + '/100 = skor konfluensi sinyal resmi (angka yang sama dengan panel sinyal & notifikasi Telegram). Bukti sniper MTF: ' + countedTotal + '/' + built.scored.length + ' kriteria (' + criteriaScore + '/100).'
      : 'Main score ' + score + '/100 = the official signal confluence (identical to the signal panel & Telegram alert). Sniper MTF evidence: ' + countedTotal + '/' + built.scored.length + ' criteria (' + criteriaScore + '/100).');
  } else {
    noteParts.push(language === 'id'
      ? 'Skor hanya menjumlahkan konfluensi yang searah (' + countedTotal + '/' + built.scored.length + ' kriteria). Indikator konteks tidak menambah skor.'
      : 'Score only sums aligned confluences (' + countedTotal + '/' + built.scored.length + ' criteria). Context indicators add no score.');
  }
  if (safeGroup === 'trader') {
    noteParts.push(execConfirmed
      ? (language === 'id'
        ? 'Eksekusi sniper dikonfirmasi di M5/M1 (' + execBias + ') — entry boleh dijalankan sesuai level.'
        : 'Sniper execution confirmed on M5/M1 (' + execBias + ') — the entry may be executed at the stated levels.')
      : (language === 'id'
        ? 'Eksekusi M5/M1 belum searah (' + execBias + ') — sniper menunggu pemicu, jangan kejar harga; M15 tetap acuan struktur.'
        : 'M5/M1 execution is not aligned yet (' + execBias + ') — the sniper waits for the trigger, do not chase; M15 remains the structure reference.'));
  }
  if (awaitingOfficial) {
    noteParts.push(language === 'id'
      ? 'Belum ada sinyal resmi — skor konfluensi ditahan di WATCH sampai gerbang sinyal lolos.'
      : 'No official signal yet — the confluence score is capped at WATCH until the signal gate passes.');
  }

  return {
    group: safeGroup,
    title: GROUP_TITLES[safeGroup][language],
    score,
    criteriaScore,
    officialScore,
    band,
    direction,
    counted: countedTotal,
    totalCriteria: built.scored.length,
    execution: { timeframe: 'M5/M1', bias: execBias, confirmed: execConfirmed },
    scoreNote: noteParts.join(' '),
    ladder: built.ladder,
    psychology: built.psychology,
    technical: built.technical,
    fundamental: built.fundamental,
    empty: safeGroup === 'dex' ? !(dex && dex.pair) : !analysis
  };
}

export const GROUP_ANALYSIS_VERSION = '2026.93';
