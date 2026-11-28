const CHAINS = {
  solana: { dex: 'solana', gecko: 'solana', goplus: null },
  base: { dex: 'base', gecko: 'base', goplus: '8453' },
  bsc: { dex: 'bsc', gecko: 'bsc', goplus: '56' },
  ethereum: { dex: 'ethereum', gecko: 'eth', goplus: '1' }
};
const TIMEFRAMES = {
  M5: { timeframe: 'minute', aggregate: 5, seconds: 300 },
  H1: { timeframe: 'hour', aggregate: 1, seconds: 3600 },
  H4: { timeframe: 'hour', aggregate: 4, seconds: 14400 },
  D1: { timeframe: 'day', aggregate: 1, seconds: 86400 }
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    // User-Agent wajib: sebagian provider (GeckoTerminal/RugCheck) menolak
    // permintaan tanpa UA dari IP edge, sehingga OHLCV tampak "unavailable".
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'XStarZG-Analysis/1.0 (+https://xstarzganalysis.pages.dev)'
      }
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validAddress(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{6,100}$/.test(value);
}

// Terima alamat mentah, alamat dengan spasi/newline, atau URL DexScreener yang
// ditempel utuh — lalu ambil alamat kontrak/pair-nya saja.
function cleanAddress(value) {
  let s = String(value || '').trim();
  try {
    const m = s.match(/dexscreener\.com\/(?:[a-z0-9-]+\/)?(?:pairs\/)?([A-Za-z0-9]{6,100})/i);
    if (m) s = m[1];
  } catch (e) {}
  return s.replace(/\s+/g, '');
}

const CHAIN_ALIASES = {
  sol: 'solana', solana: 'solana',
  eth: 'ethereum', ethereum: 'ethereum', erc20: 'ethereum',
  bnb: 'bsc', bsc: 'bsc', bnbchain: 'bsc',
  base: 'base'
};

function normalizePair(pair) {
  return {
    chainId: pair.chainId,
    pairAddress: pair.pairAddress,
    dexId: pair.dexId || 'DEX',
    baseToken: pair.baseToken || {},
    quoteToken: pair.quoteToken || {},
    priceUsd: Number(pair.priceUsd) || null,
    liquidityUsd: Number(pair.liquidity && pair.liquidity.usd) || null,
    volume24h: Number(pair.volume && pair.volume.h24) || null,
    fdv: Number(pair.fdv) || null,
    change24h: Number(pair.priceChange && pair.priceChange.h24) || null,
    marketStatus: Number(pair.priceUsd) > 0 ? 'Price returned by provider' : 'Unavailable'
  };
}

async function searchPairs(chain, address) {
  const tokenUrl = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`;
  const pairUrl = `https://api.dexscreener.com/latest/dex/pairs/${chain}/${encodeURIComponent(address)}`;
  const responses = await Promise.allSettled([getJson(tokenUrl), getJson(pairUrl)]);
  const payloads = responses.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (!payloads.length) throw new Error('Market provider search is unavailable');
  const seen = new Set();
  const pairs = [];
  for (const payload of payloads) {
    for (const pair of Array.isArray(payload.pairs) ? payload.pairs : []) {
      if (pair.chainId !== chain || !pair.pairAddress || seen.has(pair.pairAddress)) continue;
      seen.add(pair.pairAddress);
      pairs.push(normalizePair(pair));
    }
  }
  if (!pairs.length) {
    // Cadangan: endpoint pencarian bebas DexScreener. Berguna saat pengguna
    // menempel alamat pair (bukan kontrak token) atau alamat baru yang belum
    // terindeks pada endpoint token/pair.
    try {
      const search = await getJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(address)}`);
      for (const pair of Array.isArray(search.pairs) ? search.pairs : []) {
        if (pair.chainId !== chain || !pair.pairAddress || seen.has(pair.pairAddress)) continue;
        seen.add(pair.pairAddress);
        pairs.push(normalizePair(pair));
      }
    } catch (e) {}
  }
  return pairs;
}

async function fetchSecurity(chain, address) {
  try {
    if (chain === 'solana') {
      const report = await getJson(`https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(address)}/report`);
      const reportedAddress = String(report.mint || report.tokenMeta && report.tokenMeta.mint || '');
      if (reportedAddress !== address || !Number.isFinite(Number(report.score))) {
        return { status: 'unverified', source: 'RugCheck', message: 'Security response could not be matched to the selected contract.' };
      }
      const riskNames = Array.isArray(report.risks) ? report.risks.map(risk => risk.name || risk.description).filter(Boolean).slice(0, 5) : [];
      return {
        status: 'verified',
        source: 'RugCheck',
        message: 'Provider report matched the selected mint; this is not a guarantee of safety.',
        riskSummary: `Reported score ${Number(report.score)}${riskNames.length ? ` · ${riskNames.join(', ')}` : ''}`,
        holderDistribution: 'Unavailable from the returned report',
        tokenomics: report.tokenMeta && report.tokenMeta.supply ? `Reported supply ${report.tokenMeta.supply}` : 'Unavailable'
      };
    }
    const config = CHAINS[chain];
    if (!config.goplus) return { status: 'unverified', source: null, message: 'Security provider is not available for this chain.' };
    const data = await getJson(`https://api.gopluslabs.io/api/v1/token_security/${config.goplus}?contract_addresses=${encodeURIComponent(address)}`);
    const report = data && data.result && data.result[address.toLowerCase()];
    if (!report) return { status: 'unverified', source: 'GoPlus', message: 'No matching security report was returned.' };
    const holderCount = report.holder_count ? `${report.holder_count} holders reported` : 'Unavailable';
    const concentration = Array.isArray(report.holders) && report.holders.length
      ? `${report.holders.slice(0, 10).reduce((sum, holder) => sum + (Number(holder.percent) || 0), 0).toFixed(2)}% held by top 10 reported`
      : holderCount;
    const risks = [];
    if (report.is_honeypot === '1') risks.push('honeypot flag');
    if (report.is_mintable === '1') risks.push('mintable');
    if (report.is_blacklisted === '1') risks.push('blacklist capability');
    if (report.is_proxy === '1') risks.push('proxy contract');
    return {
      status: 'verified',
      source: 'GoPlus',
      message: 'Provider report matched the selected contract; flags may be incomplete and are not a guarantee of safety.',
      riskSummary: risks.length ? risks.join(', ') : 'No listed flags in provider response',
      holderDistribution: concentration,
      tokenomics: report.total_supply ? `Reported supply ${report.total_supply}` : 'Unavailable'
    };
  } catch (error) {
    return { status: 'unverified', source: null, message: `Security data unavailable: ${error.message}` };
  }
}

async function analyzePair(chain, pairAddress, tf) {
  const config = CHAINS[chain];
  const interval = TIMEFRAMES[tf];
  const market = await getJson(`https://api.dexscreener.com/latest/dex/pairs/${config.dex}/${encodeURIComponent(pairAddress)}`);
  const rawPair = (Array.isArray(market.pairs) ? market.pairs : []).find(pair =>
    pair.chainId === config.dex &&
    (pair.pairAddress === pairAddress || pair.pairAddress.toLowerCase() === pairAddress.toLowerCase())
  );
  if (!rawPair) return json({ ok: false, error: 'The provider did not return this pair on the selected blockchain.' }, 404);
  const pair = normalizePair(rawPair);
  const tokenAddress = rawPair.baseToken && rawPair.baseToken.address;
  const [ohlcvResult, security] = await Promise.allSettled([
    getJson(`https://api.geckoterminal.com/api/v2/networks/${config.gecko}/pools/${encodeURIComponent(pairAddress)}/ohlcv/${interval.timeframe}?aggregate=${interval.aggregate}&limit=120&currency=usd`),
    fetchSecurity(chain, tokenAddress)
  ]);
  const candleRows = ohlcvResult.status === 'fulfilled'
    ? (((ohlcvResult.value || {}).data || {}).attributes || {}).ohlcv_list
    : null;
  const candles = (Array.isArray(candleRows) ? candleRows : []).map(row => ({
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  })).filter(candle =>
    Number.isFinite(candle.time) && candle.open > 0 && candle.high > 0 &&
    candle.low > 0 && candle.close > 0 && Number.isFinite(candle.volume) &&
    candle.volume >= 0 && candle.high >= Math.max(candle.open, candle.low, candle.close) &&
    candle.low <= Math.min(candle.open, candle.high, candle.close)
  ).sort((a, b) => a.time - b.time);
  const newest = candles.length ? candles[candles.length - 1].time * 1000 : 0;
  const ageMs = newest ? Date.now() - newest : Infinity;
  const fresh = ageMs >= 0 && ageMs <= interval.seconds * 2000;
  const securityData = security.status === 'fulfilled' ? security.value : {
    status: 'unverified', source: null, message: 'Security data unavailable.'
  };
  const marketValid = pair.priceUsd > 0 && pair.liquidityUsd > 0 && candles.length >= 20 && fresh;
  const valid = marketValid && securityData.status === 'verified';
  return json({
    ok: true,
    pair,
    candles,
    security: securityData,
    marketSource: 'DexScreener',
    ohlcvSource: ohlcvResult.status === 'fulfilled' ? 'GeckoTerminal' : 'Unavailable',
    asOf: newest ? new Date(newest).toISOString() : null,
    freshness: newest ? (fresh ? 'fresh' : 'stale') : 'unavailable',
    marketValidity: marketValid ? 'verified' : 'unverified',
    validity: valid ? 'verified' : 'unverified',
    error: ohlcvResult.status === 'rejected' ? `OHLCV unavailable: ${ohlcvResult.reason.message}` : null
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const rawChain = String(url.searchParams.get('chain') || '').toLowerCase().trim();
  const chain = CHAIN_ALIASES[rawChain] || rawChain;
  const address = cleanAddress(url.searchParams.get('address') || url.searchParams.get('pairAddress'));
  if (!CHAINS[chain]) return json({ ok: false, error: 'Unsupported blockchain.' }, 400);
  if (!validAddress(address)) return json({ ok: false, error: 'A valid contract or pair address is required.' }, 400);
  try {
    if (action === 'search') {
      const pairs = await searchPairs(CHAINS[chain].dex, address);
      return json({
        ok: true,
        pairs,
        hint: pairs.length ? null : `No pair was returned for ${address} on ${chain}. Check the selected blockchain, then try the pair address from the DEX chart URL.`
      });
    }
    if (action === 'analyze') {
      const tf = url.searchParams.get('tf') || 'M5';
      if (!TIMEFRAMES[tf]) return json({ ok: false, error: 'Unsupported timeframe.' }, 400);
      return await analyzePair(chain, address, tf);
    }
    return json({ ok: false, error: 'Unsupported action.' }, 400);
  } catch (error) {
    return json({ ok: false, error: error.message }, 502);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return json({ ok: false, error: 'Method not allowed.' }, 405);
  return onRequestGet(context);
}
