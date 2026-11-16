/* ==================== NEWS & ECONOMIC CALENDAR (v2026.56+) ====================
   Sumber gratis tanpa API key:
   - Forex Factory weekly calendar XML (rontgen CPI/PMI/FOMC/NFP dll per mata uang)
   - CoinDesk RSS (headline kripto)
   Engine bias: aturan judul (inflasi/suku bunga/lapangan kerja/PMI → dampak ke
   mata uang), lalu dipetakan ke instrumen yang DIMAHARKAN menguat/melemah
   (XAU, perak, EUR/USD, USD/JPY, USD/IDR, BTC/ETH, WTI/BRENT, indeks Asia/Eropa).
   Output JSON siap-render oleh klien + dipakai untuk penanda "news segera". */

// v2026.60: daftar mirror + timeout; Codeploys CF kadang di-rate-limit satu host,
// mirror lain menjaga panel tetap terisi (bug: kalender kadang muncul kadang tidak).
const FF_URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.xml',
  'https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.xml'
];
const CRYPTO_RSS_URLS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss'
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
function fetchTextTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, ms || 8000);
  return fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
    .then(r => { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
}
async function fetchFirstOk(urls, parser) {
  for (const u of urls) {
    try { const txt = await fetchTextTimeout(u, 8000); const rows = parser(txt); if (rows && rows.length) return rows; } catch (e) {}
  }
  return [];
}
let cache = { ts: 0, data: null };
const TTL = 10 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=600'
};

// Aturan judul -> bagaimana "beat" (forecast/prev lebih tinggi) memengaruhi mata uang
const TITLE_RULES = [
  { keys: ['cpi', 'inflation', 'ppi', 'pce', 'hicp'], kind: 'hawk' },   // inflasi panas -> hawkish -> ccy KUAT
  { keys: ['interest rate', 'rate decision', 'fomc', 'ecb', 'boj', 'boe', 'rbnz', 'rba', 'fed ', 'powell'], kind: 'hawk' },
  { keys: ['unemployment', 'jobless', 'claims'], kind: 'unemp' },       // pengangguran naik -> ccy LEMAH (cek SEBELUM 'jobs': 'unemployment' memuat 'employment')
  { keys: ['non-farm', 'nfp', 'employment change', 'adp', 'payroll', 'initial job'], kind: 'jobs' }, // jobs kuat -> ccy kuat
  { keys: ['pmi', 'ism ', 'manufacturing', 'services'], kind: 'growth' },
  { keys: ['retail sales', 'gdp', 'confidence', 'sentiment', 'consumer'], kind: 'growth' },
  { keys: ['trade balance', 'current account'], kind: 'growth' }
];

function classify(title) {
  const t = String(title || '').toLowerCase();
  for (const r of TITLE_RULES) if (r.keys.some(k => t.includes(k))) return r.kind;
  return 'growth';
}

// Peta dampak ke instrumen catalog kita (arah = arah instrumen berbanding currency)
// usdUp: boolean apakah CUACA beat membuat USD menguat (untuk ccy USD).
function buildImpacts(ccy, dirPct) {
  const up = dirPct.dir === 1;
  const pct = dirPct.pct;
  const L = [];
  const add = (sym, dir, w) => L.push({ sym, dir, pct: Math.max(51, Math.min(80, w)), why: w >= 62 ? 'dampak langsung line utama' : 'dampak spillover' });
  if (ccy === 'USD') {
    const s = up ? 1 : -1; // s = USD menguat
    add('XAU/USD', -s, pct + 4);      // USD kuat menekan logam mulia (instrumen dikutip dalam USD & alternatif yield)
    add('XAG/USD', -s, pct + 2);
    add('EUR/USD', -s, pct + 2);
    add('GBP/USD', -s, pct);
    add('AUD/USD', -s, pct - 2);
    add('NZD/USD', -s, pct - 4);
    add('USD/JPY', s, pct + 2);
    add('USD/IDR', s, pct - 2);
    add('BTC/USDT', -s, pct - 2);     // risk asset: likuiditas mengetat -> crypto tertekan
    add('ETH/USDT', -s, pct - 2);
    add('SOL/USDT', -s, pct - 4);
    add('WTI', -s, pct - 2);
    add('BRENT', -s, pct - 2);
  } else if (ccy === 'JPY') {
    add('USD/JPY', up ? -1 : 1, pct + 4);
    add('JP225', up ? -1 : 1, pct);   // yen kuat menekan eksportir Nikkei
  } else if (ccy === 'EUR') {
    add('EUR/USD', up ? 1 : -1, pct + 4);
    add('DE40', up ? 1 : -1, pct - 2);
  } else if (ccy === 'GBP') {
    add('GBP/USD', up ? 1 : -1, pct + 4);
    add('UK100', up ? -1 : 1, pct - 4);
  } else if (ccy === 'AUD') {
    add('AUD/USD', up ? 1 : -1, pct + 4);
  } else if (ccy === 'NZD') {
    add('NZD/USD', up ? 1 : -1, pct + 4);
  } else if (ccy === 'CAD') {
    add('WTI', up ? 1 : -1, pct);       // CAD & minyak berkolerasi
  } else if (ccy === 'CHF') {
    add('XAU/USD', up ? 1 : -1, pct - 4); // safe-haven kompleks
  } else if (ccy === 'CNY') {
    add('AUD/USD', up ? 1 : -1, pct - 2);
  } else if (ccy === 'CRYPTO') {
    add('BTC/USDT', up ? 1 : -1, pct);
    add('ETH/USDT', up ? 1 : -1, pct);
    add('SOL/USDT', up ? 1 : -1, pct - 2);
  }
  return L;
}

function numOf(x) {
  if (x == null) return null;
  const m = String(x).replace('%', '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Waktu: FF mengirim MM-DD-YYYY + jam ET ("8:30am" / "All Day")
function etToUtc(dateStr, timeStr) {
  try {
    const [mm, dd, yy] = String(dateStr).trim().split('-').map(Number);
    let h = 12, mi = 0;
    const t = String(timeStr || '').toLowerCase();
    if (/all ?day|tentative/.test(t)) return Date.UTC(yy, mm - 1, dd, 12, 0, 0);
    const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (m) { h = Number(m[1]) % 12; if (m[3] === 'pm') h += 12; mi = Number(m[2] || 0); }
    // Cari offset ET via Intl (DST-aman)
    const guess = Date.UTC(yy, mm - 1, dd, h, mi);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const P = {}; parts.forEach(p => P[p.type] = p.value);
    const asUtc = Date.UTC(+P.year, +P.month - 1, +P.day, +P.hour, +P.minute);
    return guess - (asUtc - guess);
  } catch (e) { return null; }
}

function parseFx(text) {
  const evs = [];
  const items = text.match(/<event>([\s\S]*?)<\/event>/g) || [];
  for (const raw of items) {
    const get = (tag) => { const m = raw.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
    const title = get('title'), ccy = get('country'), impact = (get('impact') || '').toUpperCase();
    const forecast = get('forecast'), previous = get('previous'), actual = get('actual');
    const ts = etToUtc(get('date'), get('time'));
    if (!title || !ccy || !ts) continue;
    const kind = classify(title);
    const f = numOf(forecast), pv = numOf(previous), act = numOf(actual);
    // v2026.62: event SELESAI -> arah ditakar dari KEJUTAN aktual vs prakiraan;
    // tanpa aktual -> bias pra-event (prakiraan vs sebelumnya) seperti sebelumnya.
    let dir = 0, spread = 0;
    if (act != null && f != null) { dir = act > f ? 1 : act < f ? -1 : 0; spread = f !== 0 ? Math.abs((act - f) / f) * 100 : 0; }
    else if (f != null && pv != null) { dir = f > pv ? 1 : f < pv ? -1 : 0; spread = pv !== 0 ? Math.abs((f - pv) / pv) * 100 : 0; }
    if (kind === 'unemp') dir = -dir; // pengangguran naik = ccy lemah
    if (dir === 0) continue; // tanpa prakiraan/vs sebelumnya tidak bisa ditakar arah -> tidak ditampilkan sebagai bias
    const pct = Math.round(Math.min(78, 56 + Math.min(16, spread * 0.6) + (impact === 'HIGH' ? 6 : impact === 'MEDIUM' ? 2 : 0)));
    evs.push({
      id: 'FF_' + ts + '_' + ccy,
      title, ccy, impact: impact || 'MEDIUM', ts,
      date: new Date(ts).toISOString(), forecast, previous, actual,
      kind, dirCcy: dir,
      impacts: buildImpacts(ccy, { dir: dir === 1 ? 1 : -1, pct }),
      src: 'FOREXFACTORY'
    });
  }
  return evs;
}

const CRYPTO_POS = ['etf', 'approv', 'rally', 'surge', 'record', 'adoption', 'bull', 'inflow', 'partnership', 'legal win'];
const CRYPTO_NEG = ['hack', 'exploit', 'lawsuit', 'crash', 'ban ', 'banning', 'fear', 'selloff', 'sell-off', 'dump', 'outflow', 'fraud'];
function parseCryptoRss(text) {
  const out = [];
  const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const raw of items.slice(0, 8)) {
    const get = (tag) => { const m = raw.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
    const title = get('title'), link = get('link'), pub = get('pubDate');
    if (!title) continue;
    const tl = title.toLowerCase();
    let dir = 0;
    for (const k of CRYPTO_POS) if (tl.includes(k)) { dir = 1; break; }
    if (!dir) for (const k of CRYPTO_NEG) if (tl.includes(k)) { dir = -1; break; }
    if (!dir) continue;
    const ts = pub ? Date.parse(pub) : Date.now();
    out.push({
      id: 'CD_' + (ts || out.length) + '_' + out.length,
      title, ccy: 'CRYPTO', impact: 'MEDIUM', ts: isFinite(ts) ? ts : Date.now(),
      date: new Date(isFinite(ts) ? ts : Date.now()).toISOString(),
      forecast: '', previous: '', kind: 'headline', dirCcy: dir,
      impacts: buildImpacts('CRYPTO', { dir, pct: dir ? 58 : 58 }),
      src: 'COINDESK', link
    });
  }
  return out;
}

export const __testHooks = { parseFx, parseCryptoRss, etToUtc, buildImpacts, classify };
export async function onRequestGet(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const now = Date.now();
  if (cache.data && now - cache.ts < TTL) return new Response(JSON.stringify(cache.data), { status: 200, headers: CORS });
  const [ff, cd] = await Promise.all([fetchFirstOk(FF_URLS, parseFx), fetchFirstOk(CRYPTO_RSS_URLS, parseCryptoRss)]);
  const events = [...ff, ...cd].sort((a, b) => a.ts - b.ts);
  if (events.length) {
    const payload = { ok: true, count: events.length, now, events };
    cache = { ts: now, data: payload };
    return new Response(JSON.stringify(payload), { status: 200, headers: CORS });
  }
  // v2026.60 STALE-WHILE-ERROR: upstream seret/diblokir -> sajikan cache baik terakhir
  // (meski sudah lewat TTL) daripada panel kosong; tandai stale agar klien tahu.
  if (cache.data && cache.data.count > 0) {
    return new Response(JSON.stringify({ ...cache.data, now, stale: true }), { status: 200, headers: { ...CORS, 'Cache-Control': 'public, max-age=120' } });
  }
  return new Response(JSON.stringify({ ok: false, count: 0, now, events: [] }), { status: 200, headers: CORS });
}
