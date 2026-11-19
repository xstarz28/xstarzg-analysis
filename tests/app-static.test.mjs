// Verifikasi statis integrasi app.js + index.html (Node, tanpa dependensi).
// Fokus: cache-bust versi, isolasi kalkulator dari generator sinyal, keberadaan
// wiring lock / scan multi-TF / gerbang, dan kesehatan i18n.
import fs from 'node:fs';

const R = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = R('../public/index.html');
const app = R('../public/app.js');
const boot = R('../public/js/engine-boot.js');
const i18nIndex = R('../public/i18n/index.js');
const eng = R('../public/js/shared/signal-engine.js');
const edgeAnalyze = R('../functions/api/market/analyze.js');
const edgeNews = R('../functions/api/news/calendar.js');
const edgeMacro = R('../functions/api/macro/regime.js');
const edgeMarket = R('../functions/api/market/analyze.js');
const edgeQuotes = R('../functions/api/market/quotes.js');
const calcMod = R('../public/js/calculator.js');
const engineBoot = R('../public/js/engine-boot.js');
const wrangler = R('../wrangler.toml');
const css = R('../public/styles.css');

let passed = 0, failed = 0;
const chk = (n, c) => { if (c) { passed++; } else { failed++; console.log('FAIL:', n); } };

// --- Versi cache-bust ---
chk('index.html memakai v=2026.46 (styles)', /styles\.css\?v=2026\.68/.test(html));
chk('index.html memakai v=2026.46 (app.js)', /app\.js\?v=2026\.68/.test(html));
chk('index.html memakai v=2026.46 (engine-boot module)', /<script type="module" src="\/js\/engine-boot\.js\?v=2026\.68">/.test(html));
chk('index.html memakai v=2026.46 (i18n boot module)', /<script type="module" src="\/i18n\/boot\.js\?v=2026\.68">/.test(html));
chk('engine-boot import shared v=2026.46 (2x)', /quant-core\.js\?v=2026\.68/.test(boot) && /signal-engine\.js\?v=2026\.68/.test(boot));
chk('i18n index import locale v=2026.46', /locales\/\$\{currentLang\}\.js\?v=2026\.68/.test(i18nIndex));
chk('tidak ada sisa versi lama 2026.36/2026.37', !/2026\.36|2026\.37/.test(html + boot + i18nIndex));

// --- Isolasi kalkulator (aturan #3.3) ---
const calcInputBindings = (app.match(/\['inpCalcBalance', 'inpCalcRiskPct'\][\s\S]{0,220}/g) || []).join('');
chk('input kalkulator hanya memicu updateRiskSizing', calcInputBindings.includes('updateRiskSizing') && !calcInputBindings.includes('runFullAnalysis'));
{
  const i = app.indexOf('function updateRiskSizing()');
  const body = app.slice(i, app.indexOf('/* ==================== 9.', i));
  chk('updateRiskSizing tidak memanggil engine ulang', !body.includes('computeQuantEngine') && !body.includes('runFullAnalysis(') && !body.includes('runFullAnalysis ='));
}
chk('kalkulator menolak menghitung saat tidak ada sinyal terkunci', app.includes("valCalcLotSize', '--'"));

// --- Wiring lock persisten (aturan #3.2) ---
chk('kunci storage siglock v2 ada', app.includes("'xstarzg_siglock_v2'"));
chk('radar/kurasi memakai scope apply + provenance feed (komitmen terlacak sejak tampil)', app.includes("computeQuantEngine(d.candles, item.sym, item.tf, false, 'apply', d.source)"));
chk('lock divalidasi sebelum diterapkan', app.includes('SE.validateSignalLock(') && app.includes('SE.applyLockedSignal('));
chk('lock baru diterbitkan hanya dari sinyal eligible + 2 penjaga', /signalCooldownActive\(symbol, tfA\) && num\(a\.confluenceScore, 0\) >= adaptiveMinScore\(tfA\)\) \{\s*var nl = SE\.createSignalLock/.test(app));

// --- Wiring scan multi-TF (aturan #2) ---
chk('9 TF dipindai', app.includes("'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'"));
chk('scan dijadwalkan setelah analisis', app.includes('scheduleBestTfScan();'));
chk('papan TF terbaik dirender ke narasi', app.includes('state.bestTfBoard'));
chk('badge NO-TRADE tersedia', app.includes('eNoTradeTf'));
// Wiring i18n baris Institutional Gate (lulus/ditolak) + map 9 label veto
chk('regex gate LULUS/DITOLAK di localizeEngineString', app.includes('Institutional Gate\\] LULUS') && app.includes('Institutional Gate\\] DITOLAK'));
chk('9 label veto dipetakan di ENGINE_TEXT_MAP', ['eVetoOverext','eVetoWall','eVetoExh','eVetoDiv','eVetoHtf','eVetoScore','eVetoWr','eVetoSeq','eVetoChop'].every(k => app.includes("'" + k + "'")));
chk('kunci narasi gate + tier dipakai', ['eGateLockOk','eGateForbidden','eGateBest','eGateBestHint','eGateScanning','eEliteSetup','eProSetup','eGatePassPro','eVetoSpotOnly','signalTier'].every(k => app.includes(k)));

// --- Kesehatan i18n: 20 locale seragam ---
const langs = ['id', 'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ar', 'ru', 'es', 'pt', 'fr', 'de', 'hi', 'tr', 'vi', 'th', 'ms', 'nl', 'it', 'pl'];
const mods = await Promise.all(langs.map(l => import(`../public/i18n/locales/${l}.js`)));
const ref = Object.keys(mods[0].default.ui).sort().join('|');
let uniform = true, count = Object.keys(mods[0].default.ui).length;
mods.forEach((m, i) => { if (Object.keys(m.default.ui).sort().join('|') !== ref) { uniform = false; console.log('  key mismatch:', langs[i]); } });
chk('20 locale punya keyset ui seragam (558)', uniform && count === 558);
chk('radar memindai seluruh katalog (rotatingSlice + radarScanPool)', app.includes('rotatingSlice(catalogSortedStable()') && app.includes('radarScanPool'));
chk('kurasi investor dari semesta investasi dinamis', app.includes('investableUniverse()') && !app.includes('var INVESTOR_PICKS = ['));
chk('mode investor menyaring TF trader (D1/W1/MN/1Y)', app.includes("var INVESTOR_TFS = ['D1', 'W1', 'MN', '1Y']") && app.includes('syncTfBarForMode()'));
chk('engine expose tier & skor analis', eng.includes('PRO_MIN_SCORE') && eng.includes('signalTier') && eng.includes('analystScore') && eng.includes('detectLiquidityPools'));
chk('engine punya skor keyakinan netral-arah + spotOnly', eng.includes('convictionScore') && eng.includes('spotOnlyEffect') && eng.includes('SPOT_ONLY'));
chk('backtest melacak statistik per-arah (longWR/shortWR)', eng.includes('longWR') && eng.includes('shortWR'));
chk('papan TF tier-aware (★ ELITE / ✅ PRO)', app.includes("' ★ ELITE '") && app.includes("' ✅ PRO '"));
chk('radar menyaring keyakinan >= 55', app.includes('convictionScore, 0) >= 55'));
chk('kotak futures tidak untuk saham/spot', app.includes("a.assetClass !== 'stocks'") && app.includes('marginProduct'));
chk('toggle spot/futures tampak di semua aset (dipulihkan v2026.59)', !app.includes("showSub = a.assetClass === 'crypto'"));
chk('lock mengikat skor keyakinan (fix skor berubah saat refresh)', eng.includes('a.convictionScore = Math.max(a.convictionScore || 0, lock.score || 0)'));
chk('radar & kurasi investor auto-refresh mandiri', app.includes('startRadarAutoPilot') && app.includes('__radarAutoTimer') && app.includes('renderOpportunityRadar(force)') && app.includes('renderInvestorPicks(force)'));
chk('ticker realtime lewat bucket waktu resmi (bukan timpa candle terakhir)', !app.includes('lastBar.close = liveP') && app.includes('applyLiveTick(liveP'));
chk('pemilih tipe chart (candlestick/bar/line/area) ter-wire', html.includes('chartTypeBar') && html.includes('data-ctype="area"') && app.includes('applyChartType') && app.includes('mainSeriesPayload') && app.includes('updateMainSeries'));
chk('chart responsif HP (ResizeObserver + defer lebar 0)', app.includes('ResizeObserver') && app.includes('__chartInitPending'));
chk('pool radar 15 mnt & kurasi 30 mnt (rotasi penuh katalog)', app.includes('15 * 60000') && app.includes('1800000'));
chk('kartu rekomendasi membawa snapshot candle', app.includes('candles.slice(-240)'));
chk('klik-through memakai snapshot segar + lock create (konsistensi skor)', app.includes('primeFromRadarPool(sym, tf)') && app.includes("computeQuantEngine(state.candles, sym, tf || state.tf, false, 'create', primedSource)"));
chk('invalidasi lock butuh penerimaan harga (anti chop)', eng.includes('againstLong') && eng.includes('STRUCTURE_INVALID'));
chk('radar hemat kuota: TTL 15 mnt + batch 30/slot 4 mnt', app.includes('15 * 60000') && app.includes('rotatingSlice(catalogSortedStable(), 30, 4)'));
chk('analisis workspace menulis-balik ke pool rekomendasi', app.includes('writeBackRadarPools(analysis)') && app.includes('WORKSPACE LIVE'));
chk('pindah mode memaksa rescan rekomendasi', app.includes('renderInvestorPicks(true)') && app.includes('renderOpportunityRadar(true)'));
chk('gate konfirmasi volume & squeeze breakout', eng.includes('volImpulse') && eng.includes('squeezeBlockedDir') && eng.includes('SQUEEZE_UNCONFIRMED'));
chk('tier memakai performa terkini (recentWinRate)', eng.includes('recentWinRate') && eng.includes('>= 70'));
chk('fundamental terukur (macroQuant) ada di output & UI', eng.includes('macroQuant') && app.includes('fmCycle') && app.includes('fmVolPct'));
chk('anti-desync: heartbeat canvas fallback terhubung ke tick live', app.includes('scheduleLiveCanvasRepaint()') && app.includes('window.drawCanvasFallbackChart = drawCanvasFallbackChart'));
chk('websocket crypto self-heal (onclose reconnect)', app.includes('ws.onclose') && app.includes('setTimeout(startBinanceStream, 3000)'));
chk('harga tampilan ikut walau candle belum siap', app.includes("setTxt('hdrLivePrice', formatPrice(price, state.symbol))"));
chk('cadangan anti-stall Binance ticker untuk crypto', app.includes("ticker/price?symbol=' + sym2.replace"));
chk('lock v3 per-TF + migrasi v2 (sinyal lama tidak dibuang)', app.includes("'xstarzg_siglock_v3'") && app.includes('__migratedV2') && app.includes("'|' + String(tf || state.tf || '')"));
chk('lifecycle outcome tercatat + cooldown pasca-SL', app.includes('recordSignalOutcome(symbol, tfA, verdict, lock)') && app.includes('signalCooldownActive(symbol, tfA)') && app.includes("'xstarzg_sigoutcome_v1'"));
chk('kartu radar ikut menerbitkan kunci (scope create/apply)', app.includes("(scope === 'create' || scope === 'apply') && a.signalEligible"));
chk('akurasi radar adaptif mengetatkan ambang terbit', app.includes('adaptiveMinScore(tfA)') && eng.includes('radarAdaptiveGate') && eng.includes('updateRadarAccuracy'));
chk('badge outcome jujur di kartu radar', app.includes('latestSignalOutcome(it.sym, it.tf)') && app.includes('eOutSl'));
chk('gate persistensi 2-candle anti fakeout', eng.includes('persistOk') && eng.includes('PERSIST_WAIT'));
chk('candle fabrikasi edge dicap jujur EST_ANCHORED', edgeAnalyze.includes("'EST_ANCHORED:'") && edgeAnalyze.includes('candle di fungsi ini DIFABRIKASI'));
chk('siklus hidup sinyal digerbang feed asli (feedIsReal)', app.includes('function feedIsReal(') && app.includes('if (!feedReal) a.feedUnverified = true;') && app.includes('if (feedReal && typeof SE.validateSignalLock'));
chk('kandidat feed estimasi dikeluarkan dari rekomendasi & badge-nya jelas', app.includes('a.__estFeed = !feedIsReal(d.source)') && app.includes('!it.analysis.__estFeed') && app.includes("T('ui.eEstFeed'"));
chk('rekonsiliasi outcome palsu -> lock dipulihkan', app.includes('reconcileSignalOutcome(symbol, tfA, closedBars0)') && app.includes('lock: lock ? {'));
chk('banner jujur saat radar kosong (pantauan bukan rekomendasi)', app.includes('noneQualified') && app.includes('eRadarNone'));
chk('kartu menyebut alasan gerbang (koherensi WR vs entry)', app.includes('gateShortLabel(a.gating.active[0])') && app.includes('gNoSeq'));
chk('panel menjelaskan WR besar tapi belum boleh entry', app.includes('eWrVsEntry'));
chk('peringatan risiko permanen (bukan nasihat keuangan) di semua halaman', html.includes('risk-disclaimer-bar') && html.includes('ui.eDisclaimer'));


/* v2026.51 DUAL-BRAIN lint */
chk('engine punya blok Dual-Brain versi benar', /DUAL-BRAIN\+ICT ATLAS \(2026\.52\)/.test(eng) && /brain === 'SCALP'/.test(eng) && /sniperPremiumVeto/.test(eng));
chk('engine level-ctx bawa brain + reasons brain', /oldLow: liqPools\.oldLow, brain/.test(eng) && /OTAK SCALP|SCALP Micro/.test(eng));
chk('app gate label dual-brain', /SCALP_PRESSURE: T\('ui\.gScalpPressure'/.test(app) && /SNIPER_STRUCTURE: T\('ui\.gSniperStruct'/.test(app));
chk('app panel badge otak', /eBrainScalp/.test(app) && /eBrainSniper/.test(app));
/* v2026.52 ICT ATLAS + MASTER MIND lint */
chk('engine ICT Atlas module', /ICT ATLAS \(v2026\.52\)/.test(eng) && /export function detectIctAtlas/.test(eng) && /function detectCISD/.test(eng) && /function detectAmdPhase/.test(eng));
chk('engine Master Mind profile', /MASTER MIND \(v2026\.52\)/.test(eng) && /riskPct/.test(eng) && /beAfterTp1/.test(eng));
chk('engine veto CISD/FOMO tersambung', /cisdCounterVeto/.test(eng) && /fomoVeto/.test(eng) && /CISD_COUNTER/.test(eng) && /riskPlan: masterProfile/.test(eng));
chk('app label gerbang + rencana master', /CISD_COUNTER: T\('ui\.gCISD'/.test(app) && /FOMO_ZONE: T\('ui\.gFomo'/.test(app) && /eRiskPlan/.test(app));
/* v2026.53 ADAPTIVE LIVE FEED lint */
chk('edge punya fetchYahooCandles + resample H4', /async function fetchYahooCandles/.test(edgeAnalyze) && /resampleCandles/.test(edgeAnalyze) && /YAHOO_CANDLES:/.test(edgeAnalyze));
chk('edge prioritas candle NYATA Yahoo sebelum fabrikasi', edgeAnalyze.indexOf('fetchYahooCandles(s, tf)') < edgeAnalyze.indexOf('buildBrokerAnchoredCandles(s, tf, liveQuote)'));
/* v2026.54 SELARAS lint: plafon skor direm per gerbang penolak */
chk('engine cap skor proporsional ke jumlah gerbang tolak', /gatesBlocked = gateReasons/.test(eng) && /59 - 2 \* gatesBlocked/.test(eng));
/* v2026.55b lint */
chk('engine cap investor NETRAL + DCA monotonic fair-value', /confluenceScore = Math\.min\(confluenceScore, 59\)/.test(eng) && /dcaZone2 = Math\.min\(dcaZone1/.test(eng) && /dcaZone3 = Math\.min\(dcaZone2/.test(eng));
chk('engine remove kondisi NEUTRAL dari cap trader', /mode === 'trader' && !eligible\) \{/.test(eng) && !/!eligible && softBias !== 'NEUTRAL'/.test(eng));
chk('label pillars diperbarui (28/10)', /28-Pillar|28 Pilar|26-Pillar|26 Pilar/.test(html));
/* v2026.56 lint: judul scan tidak lagi 'sinyal terbaik' yang ambigu */
chk('eGateBest judul status-scan jelas', /Status Scan Timeframe Terbaik/.test(app) && !app.includes('Sinyal Terbaik Saat Ini'));
/* v2026.57 NEWS lint */
chk('edge news endpoint ada & parse FF XML + bias map', /FOREXFACTORY/.test(edgeNews) && /buildImpacts/.test(edgeNews) && /etToUtc/.test(edgeNews));
chk('app fetch & render panel news', /function fetchNewsCalendar/.test(app) && /function renderNewsPanel/.test(app) && /newsGrid/.test(html));
chk('news risk chip radar & peringatan panel', /newsSoonFor/.test(app) && /eNewsWarn/.test(app));
/* v2026.58 GLOBAL MACRO lint */
chk('edge macro endpoint ada & classifyRegime', /classifyRegime/.test(edgeMacro) && /dcaWeights/.test(edgeMacro) && /'GOLDILOCKS'/.test(edgeNews+edgeMacro));
chk('app fetch/render macro + strip investor', /fetchMacroRegime/.test(app) && /renderMacroMap/.test(app) && /macroMapBox/.test(html));
chk('bobot DCA dinamis regime + konteks trader', /macroDcaWeights/.test(app) && /invDcaPace/.test(app) && /eMacroTrader/.test(app));
/* v2026.59 FITUR DIPULIHKAN lint */
chk('toggle Spot/Futures trader TIDAK disembunyikan lagi', !/showSub \? '' : 'none'/.test(app) && /btnSubFutures/.test(html));
chk('kalkulator posisi: panel HTML + widget boot + wiring levels', /id="calcPanel"/.test(html) && /resPosSizeUnits/.test(html) && /__calcWidget/.test(app) && /PositionCalculator/.test(engineBoot) && /class PositionCalculator/.test(calcMod));
chk('kalkulator memakai ATR & leverage + kunci calcTitle', /updateMarketContext/.test(calcMod) && /recalculate/.test(calcMod) && /calcTitle/.test(R('../public/i18n/locales/id.js')));
/* v2026.60 BUGFIX lint (feed + kalender) */
chk('banner ESTIMASI kini BENAR-BENAR reconnect (retry 45s)', /scheduleFeedReconnect/.test(app) && /feedReconnectTimer/.test(app));
chk('edge XAU spot pakai candle Yahoo NYATA (XAUUSD=X) tanpa pengecualian', /'XAU\/USD': \['XAUUSD=X'/.test(edgeMarket) && !/"XAU\/USD" && s !== 'XAU\/IDR'/.test(edgeMarket) && /if \(s !== 'XAU\/IDR'\)/.test(edgeMarket));
chk('kalender anti-kosong: mirror FF + stale-while-error + klien tak menghapus event', /FF_URLS/.test(edgeNews) && /cdn-nfs\.faireconomy/.test(edgeNews) && /stale: true/.test(edgeNews) && /j\.events\.length > 0 \|\| !newsState\.loaded/.test(app) && /CRYPTO_RSS_URLS/.test(edgeNews) && /cointelegraph/.test(edgeNews));
/* v2026.61 crypto multi-exchange lint */
chk('pair crypto non-Binance (HYPE dll) -> candle Bybit lalu OKX', /fetchBybitCandles/.test(edgeMarket) && /fetchOkxCandles/.test(edgeMarket) && /BYBIT:\$\{pair\}/.test(edgeMarket) && /OKX:\$\{instId\}/.test(edgeMarket) && edgeMarket.indexOf('fetchBinanceCandles(s, tf);\n    if (binData) return binData;\n    // v2026.61') > -1);
chk('quotes batch: ticker Bybit->OKX->Yahoo untuk pair non-Binance', /api\.bybit\.com\/v5\/market\/tickers/.test(edgeQuotes) && /www\.okx\.com\/api\/v5\/market\/ticker/.test(edgeQuotes));
/* v2026.62 lint: kalender selesai + zona struktur pivot */
chk('event lewat ditandai SELESAI + hasil aktual', /eNewsDone/.test(app) && /eNewsActual/.test(app) && /actual/.test(edgeNews) && /d < 0 \|\|/.test(app));
chk('pilar pivot menampilkan zona struktur psikologis', /psychRoundPrice/.test(app) && /ePtZone/.test(app));
/* v2026.63 lint: fallback canvas chart */
chk('fallback canvas punya AXIS HARGA (fxPriceAxis) & tag level (lvTag)', /function fxPriceAxis/.test(app) && /function lvTag/.test(app) && /FALLBACK VIEW — axis harga aktif/.test(app));
chk('fallback membaca level via effectiveLevels (bukan analysis.entry undefined)', /effectiveLevels\(analysis\)/.test(app) && !/drawLine\(analysis\.entry/.test(app));
chk('fallback menggambar overlay EMA/VWAP + harga terkini + toggle redraw', /__fxEmaList/.test(app) && /vwapN/.test(app) && /candleLastPrice/.test(app) && /window\.drawCanvasFallbackChart\(state\.candles, state\.lastAnalysis\)/.test(app));
/* v2026.64 lint: presisi harga micro-cap */
chk('formatPrice harga <1 pakai presisi signifikan (anti "0.00" RDNT)', /K\.floor\(Math\.log10\(a\)/.test(app) || /Math\.log10\(a\)/.test(app));
chk('LWC series menyesuaikan priceFormat per simbol (syncChartPriceFormat)', /function lwcPriceFormat/.test(app) && /syncChartPriceFormat\(\);/.test(app) && app.split('syncChartPriceFormat();').length >= 3);
/* v2026.65 lint jurnal sinyal + masa hidup horison */
chk('jurnal sinyal: section + renderer + wiring outcome', /id="signalJournalList"/.test(html) && /renderSignalJournal/.test(app) && /xstarzg_siglock_v3/.test(app));
chk('EXPIRED dicatat (bukan hilang diam-2) & ikut cooldown', /oc !== 'EXPIRED'/.test(app) && /status === 'EXPIRED'/.test(app) && /EXPIRED/.test(eng));
/* v2026.68 lint: jurnal clickable + billing server-side (auto-approve bertanda tangan) */
chk('kartu jurnal clickable -> gotoInstrument(sym, tf)', /jnl-card" data-sym/.test(app) && /list\.querySelectorAll\('\.radar-card\[data-sym\]'\)/.test(app) && /gotoInstrument\(card\.getAttribute\('data-sym'\)/.test(app) && /ui\.jnlOpen/.test(app));
chk('verifikasi VIP via SERVER /api/billing/verify-bsc (grant lokal dihapus)', app.includes("'/api/billing/verify-bsc'") && !/function clientVerifyBscPayment/.test(app) && /serverVerifyBscPayment/.test(app));
chk('sesi JWT publik /api/auth/register + dipanggil saat login', /api\/auth\/register/.test(app) && /function ensureAuthToken/.test(app) && /tvip|authToken/.test(app));
chk('server: verify-bsc WAJIB auth 401 + meneken entitlement VIP + anti-replay', /if \(!user \|\| !user\.email\)/.test(R('../functions/api/billing/verify-bsc.js')) && /tier: 'VIP', vipUntil/.test(R('../functions/api/billing/verify-bsc.js')) && /isTxUsed/.test(R('../functions/api/billing/verify-bsc.js')));
chk('endpoint register menerbitkan JWT FREE & tak pernah OWNER_VIP', /signJwt/.test(R('../functions/api/auth/register.js')) && /let tier = 'FREE'/.test(R('../functions/api/auth/register.js')));
chk('revalidasi sesi VIP saat boot (verifyVipSession + /api/auth/me)', /function verifyVipSession/.test(app) && /verifyVipSession\(\);/.test(app) && /api\/auth\/me/.test(app) && /authenticateRequest/.test(R('../functions/api/auth/me.js')));
chk('faktur invoice endpoint nyata + hidrasi modal', /onRequestGet/.test(R('../functions/api/billing/invoice.js')) && /hydrateVipInvoice/.test(app) && /id="vipInvoiceId"/.test(html) && /id="vipWalletAddr"/.test(html) && /ui\.payInvoiceId/.test(html));
chk('wrangler.toml mengikat D1 DB (database_id terkonfigurasi)', /\[\[d1_databases\]\][\s\S]*binding\s*=\s*"DB"[\s\S]*database_id\s*=\s*"d29a4547-d50e-42fb-a700-56364d967abb"/.test(wrangler));
/* v2026.68 HEMAT KUOTA CLOUDFLARE lint (paket gratis 100rb request/hari) */
chk('ticker 5 dtk + 0 request saat tab latar + crypto Binance-first', /RT_TICK_MS = 5000/.test(app) && /document\.hidden\) return;/.test(app) && /data-api\.binance\.vision\/api\/v3\/ticker\/price/.test(app));
chk('ticker tanpa cache-buster _t pada quote=1 (respons bisa di-cache)', !/analyze\?quote=1&symbol=' \+ encodeURIComponent\(sym\) \+ '&tf=' \+ encodeURIComponent\(tf\) \+ '&_t='/.test(app));
chk('batch radar & investor diet (30/4 & 26/6) + autopilot force 4 mnt', /rotatingSlice\(catalogSortedStable\(\), 30, 4\)/.test(app) && /rotatingSlice\(investableUniverse\(\), 26, 6\)/.test(app) && />= 4 \* 60000/.test(app));
chk('edge analyze quote-only di-cache 4 dtk lintas-user', /caches\.default/.test(edgeAnalyze) && /max-age=4/.test(edgeAnalyze));
/* v2026.68 RESPONSIF MOBILE lint */
chk('responsif mobile: overflow-x hidden pada html & body + radar-card min-width 0', /html\s*\{[\s\S]*overflow-x:\s*hidden/.test(css) && /radar-card\s*\{[\s\S]*min-width:\s*0/.test(css) && /#inpSearchAsset/.test(css));
/* v2026.68 ZERO-RISK SL+ & DUAL-BRAIN MANAGEMENT lint */
chk('trade management SL+ 0-risk di gateBlockHtml & jurnal', /eSlPlusActive/.test(app) && /BE_SAVED/.test(app) && /jnlBeActive/.test(app) && /eScalpAdvisor/.test(app) && /eSniperAdvisor/.test(app));
/* DUAL FIBONACCI MATRIX & US STOCKS EXPANSION lint */
chk('Dual Fibonacci matrix HTML box & elemen nilai terpasang', /id="fiboMatrixBox"/.test(html) && /id="valFibo500"/.test(html) && /id="valFibo618"/.test(html) && /id="valFiboExt161"/.test(html));
chk('app.js mengupdate Fibo matrix & Pillar 10 Fibo', /valFibo618/.test(app) && /valFiboExt161/.test(app) && /goldenPocket/.test(app));
chk('signal-engine mengekspor calculateDualFibonacci & menyematkan fib pada levels', /export function calculateDualFibonacci/.test(eng) && /fib,/.test(eng));
/* VIP EXPIRY WARNING & OWNER SUBSCRIBERS LINT */
chk('banner peringatan kedaluwarsa VIP & modal pelanggan owner terpasang', /id="vipExpiryWarningBanner"/.test(html) && /id="ownerSubscribersModal"/.test(html) && /vipExpiryDaysText/.test(app));
chk('admin overview endpoint memverifikasi owner & query D1', /vip_entitlements/.test(R('../functions/api/admin/overview.js')) && /OWNER_EMAILS/.test(R('../functions/api/admin/overview.js')));
chk('quotaLimit & auth/me otomatis mendowngrade VIP kedaluwarsa ke FREE', /state\.user\.tier = 'FREE'/.test(app) && /out\.tier = 'FREE'/.test(R('../functions/api/auth/me.js')));
/* SMART SIGNAL & PRICE ALARM (v2026.69) lint */
chk('tombol alarm sinyal, chip status & toast notifikasi terpasang di HTML', /id="btnToggleSignalAlarm"/.test(html) && /id="alarmStatusChip"/.test(html) && /id="signalAlarmToast"/.test(html));
chk('engine alarm app.js: Web Audio chime, Web Notification & checkSignalAlarm terpasang', /playAlertChime/.test(app) && /checkSignalAlarm/.test(app) && /toggleSignalAlarm/.test(app));

/* PWA (PROGRESSIVE WEB APP) & 0-CLOUDFLARE CACHE LINT */
const manifestRaw = R('../public/manifest.webmanifest');
const swRaw = R('../public/sw.js');
chk('manifest PWA terpasang valid (standalone, start_url, theme_color)', /"display":\s*"standalone"/.test(manifestRaw) && /"start_url"/.test(manifestRaw) && /"theme_color"/.test(manifestRaw));
chk('service worker sw.js terpasang dengan cache bypass untuk /api/', /caches\.open/.test(swRaw) && /url\.pathname\.startsWith\('\/api\/'\)/.test(swRaw));
chk('HTML memuat link manifest & mobile app meta tags', /<link rel="manifest" href="\/manifest\.webmanifest"/.test(html) && /name="mobile-web-app-capable"/.test(html));
chk('app.js meregister service worker & menangani instalasi PWA', /navigator\.serviceWorker\.register\('\/sw\.js'\)/.test(app) && /beforeinstallprompt/.test(app) && /btnInstallPwa/.test(app));

/* SNIPER MINIMAL 1:2 R:R TARGET & 0-RISK ADVISORY LINT */
chk('jurnal menampilkan Target 1:2 R:R (TP2) untuk Sniper', /Target 1:2 R:R \(TP2\)/.test(app) && /isSniper/.test(app));
chk('advisory peringatan SL+ proteksi 0-Risk untuk setup sniper', /SNIPER ADVISOR: Target penuh minimal 1:2 R:R \(TP2\)/.test(app) && /0-RISK TERKUNCI/.test(app));

/* 3 BAGAN OTAK REKOMENDASI RADAR (KRIPTO, FOREX & KOMODITAS, SAHAM) lint */
chk('HTML memuat radarGroupBar dengan 3 kelompok instrumen', /id="radarGroupBar"/.test(html) && /data-rg="crypto"/.test(html) && /data-rg="fx_comm"/.test(html) && /data-rg="stocks"/.test(html));
chk('app.js memisahkan kelompok radarAssetGroupOf & render 3 otak bagan', /function radarAssetGroupOf/.test(app) && /RADAR_GROUPS/.test(app) && /renderRadarCardHtml/.test(app));
chk('kartu radar menampilkan SL, TP, Entry & Skor lengkap', /r-entry/.test(app) && /r-score/.test(app) && /tgtLbl \+ ':/.test(app));
chk('tombol fokus bagan & render lengkap tanpa potongan 6 kartu', /data-focus-rg/.test(app) && /Menampilkan semua/.test(app));
chk('kalender ekonomi anti-kosong dengan fallback institusional & peringatan broker', /getClientInstitutionalEvents/.test(app) && /generateInstitutionalEvents/.test(edgeNews) && /Peringatan Broker/.test(app));
chk('tidak ada penyebutan merk broker tertentu di kalender', !/exness/i.test(app) && !/exness/i.test(html));
chk('XAU/IDR komposit nyata dari XAUUSD & USDIDR', /s === 'XAU\/IDR'/.test(edgeMarket) && /YAHOO:XAUUSD=X x USDIDR=X/.test(edgeMarket));
chk('katalog berimbang 3 kelompok saat scan (interleaved)', /crypto\.push/.test(app) && /stocks\.push/.test(app) && /interleaved\.push/.test(app));
chk('radar bersih: feed estimasi dilarang masuk rekomendasi', /if \(a\.__estFeed\) return null/.test(app) && /!it\.analysis\.__estFeed/.test(app));
chk('multi-exchange crypto diperluas dengan MEXC & perp fallback', /fetchMexcCandles/.test(edgeMarket) && /MEXC:\$\{pair\}/.test(edgeMarket));
chk('dukungan multi-exchange BingX untuk spot & swap futures', /fetchBingxCandles/.test(edgeMarket) && /BINGX:\$\{pair\}/.test(edgeMarket) && /open-api\.bingx\.com/.test(edgeQuotes));
chk('radar scan eksklusif aset kurasi terverifikasi', /!x\.isDynamic/.test(app));
chk('i18n radarGroupBar & 3 otak multibahasa terpasang',
  /data-i18n="ui\.rgAll"/.test(html) &&
  /data-i18n="ui\.rgCrypto"/.test(html) &&
  /ui\.rShowingAll/.test(app) &&
  /ui\.rOpenTab/.test(app) &&
  /getRadarGroups/.test(app));

/* MULTI-EXCHANGE EXPANSION (BINGX & MEXC) GEMS & HERO STATS LINT */
chk('katalog crypto memuat token unggulan BingX & MEXC (KAS, SUPER, POPCAT, BRETT, VIRTUAL, SPX, RAY, OM)',
  /mkCrypto\('KAS'/.test(R('../public/js/shared/quant-core.js')) &&
  /mkCrypto\('SUPER'/.test(R('../public/js/shared/quant-core.js')) &&
  /mkCrypto\('POPCAT'/.test(R('../public/js/shared/quant-core.js')) &&
  /mkCrypto\('BRETT'/.test(R('../public/js/shared/quant-core.js')) &&
  /mkCrypto\('VIRTUAL'/.test(R('../public/js/shared/quant-core.js')));

chk('dashboard depan & bar pilihan menampilkan 700+ instrumen dan 500+ pair crypto',
  /id="heroTotalInstruments">700\+<\/span>/.test(html) &&
  /id="heroCryptoCount">500\+<\/span>/.test(html) &&
  /700\+\s*Aset Aktif/.test(html) &&
  /75 Utama \+ 500\+ Pair/.test(html));

/* SEO, SEARCH ENGINE & AI BOT DISCOVERY (GOOGLE, BING, PERPLEXITY, OPENAI) LINT */
const robotsTxt = R('../public/robots.txt');
const sitemapXml = R('../public/sitemap.xml');
chk('robots.txt mengizinkan Googlebot, Bingbot & AI bots (GPTBot, PerplexityBot)',
  /User-agent:\s*Googlebot/i.test(robotsTxt) &&
  /User-agent:\s*Bingbot/i.test(robotsTxt) &&
  /User-agent:\s*GPTBot/i.test(robotsTxt) &&
  /User-agent:\s*PerplexityBot/i.test(robotsTxt) &&
  /Sitemap:\s*https:\/\/xstarzganalysis\.pages\.dev\/sitemap\.xml/.test(robotsTxt));

chk('sitemap.xml valid XML dengan URL halaman utama produksi',
  /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemapXml) &&
  /<loc>https:\/\/xstarzganalysis\.pages\.dev\/<\/loc>/.test(sitemapXml));

chk('index.html memuat meta SEO, canonical, OpenGraph, Twitter Card & Google verification',
  /name="description"/.test(html) &&
  /name="keywords"/.test(html) &&
  /rel="canonical"/.test(html) &&
  /name="robots"\s+content="index,\s*follow/.test(html) &&
  /property="og:title"/.test(html) &&
  /property="og:image"/.test(html) &&
  /name="twitter:card"/.test(html) &&
  /content="QK9_DVUmbva2pfdj4DWK_qWRlyWfKnrXWvYizARwA-o"/.test(html));

chk('index.html memuat Schema.org JSON-LD WebApplication terstruktur untuk Google & AI Knowledge Graph',
  /<script type="application\/ld\+json">/.test(html) &&
  /"@type":\s*"WebApplication"/.test(html) &&
  /"name":\s*"XStarZG Analysis"/.test(html) &&
  /"applicationCategory":\s*"FinanceApplication"/.test(html));

/* ==================== MEME & DEX GEMS SCANNER LINT ==================== */
chk('index.html memiliki tombol mode meme dan section radar DEX meme',
  html.includes('id="btnModeMeme"') &&
  html.includes('id="memeRadarSection"') &&
  html.includes('id="memeChainBar"') &&
  html.includes('id="memeSortBar"') &&
  html.includes('id="memePicksGrid"'));

const memeApi = R('../functions/api/scanner/meme.js');
chk('functions/api/scanner/meme.js valid dan mengekspor onRequest dengan caching 30s',
  memeApi.includes('export async function onRequest') &&
  memeApi.includes('s-maxage=30') &&
  /anti-rug/i.test(memeApi) &&
  memeApi.includes('solana'));

chk('app.js memuat fungsi renderMemePicks dan integrasi mode meme',
  app.includes('renderMemePicks') &&
  app.includes("mode === 'meme'") &&
  app.includes('drawMemePickCards') &&
  css.includes('.mode-chip.meme'));

chk('ruang tersendiri meme coin terisolasi total dari workspace trader/investor',
  html.includes('id="traderInvestorWorkspaceWrap"') &&
  html.includes('id="memeWorkspaceWrap"') &&
  html.includes('id="memeInspectHeader"') &&
  html.includes('id="memeDexChartIframe"') &&
  html.includes('id="memeFundGrid"') &&
  html.includes('id="memeTechnicalCard"') &&
  app.includes('selectMemeToken') &&
  memeApi.includes('metaNarrative') &&
  memeApi.includes('devStatus'));

chk('dashboard depan menampilkan mode meme coin berdampingan dengan trader dan investor',
  html.includes('MEME &amp; DEX GEMS (ANTI-RUG SCANNER)') &&
  html.includes('ui.feat5Title') &&
  html.includes('ui.feat5Desc') &&
  html.includes('Radar Khusus Koin Micin & DEX Gems'));

/* JURNAL SINYAL REAL-TIME MONITORING MENUJU TP/SL & COTTON M5 FIX */
chk('jurnal sinyal memantau pergerakan harga real-time menuju TP/SL',
  app.includes('function monitorLiveSignalProgress(') &&
  app.includes('liveMonitorInfo') &&
  app.includes('scheduleLiveJournalUpdate') &&
  app.includes('monitorLiveSignalProgress(state.symbol, state.tf, price, bar.high, bar.low);'));

chk('sinyal workspace trader terdaftar ke siklus kunci jurnal walau feed cadangan',
  app.includes("scope === 'create' || getSignalLock(symbol, tfA)") &&
  app.includes('if (a.feedUnverified) nl.feedUnverified = true;') &&
  app.includes('saveSignalLock(symbol, tfA, nl);'));

chk('saveSignalLock dan renderAllVisuals memicu pembaruan jurnal seketika',
  app.includes('localStorage.setItem(SIGNAL_LOCK_KEY, JSON.stringify(all));\n  } catch (e) {}\n  try { renderSignalJournal(); } catch (e) {}') &&
  app.includes('try { renderSignalJournal(); } catch (e) {}\n}'));

chk('ticker komoditas kapas COTTON terpetakan lengkap di TradingView dan Yahoo',
  edgeAnalyze.includes("'COTTON': ['ICEUS:CT1!', 'NYBOT:CT1!', 'TVC:COTTON']") &&
  edgeAnalyze.includes("'COTTON': ['CT=F', 'TT=F', 'BAL']"));

console.log(`APP-STATIC: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
