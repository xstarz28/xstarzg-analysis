const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

const NETWORKS = {
  solana: { dex: 'solana', gecko: 'solana', label: 'Solana' },
  base: { dex: 'base', gecko: 'base', label: 'Base' },
  bsc: { dex: 'bsc', gecko: 'bsc', label: 'BNB Chain' },
  ethereum: { dex: 'ethereum', gecko: 'eth', label: 'Ethereum' }
};

const TIMEFRAMES = {
  M1: { period: 'minute', aggregate: 1 },
  M5: { period: 'minute', aggregate: 5 },
  M15: { period: 'minute', aggregate: 15 },
  H1: { period: 'hour', aggregate: 1 },
  H4: { period: 'hour', aggregate: 4 },
  D1: { period: 'day', aggregate: 1 }
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Cache-Control': 'no-store', ...extra }
  });
}

function validAddress(network, address) {
  if (network === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Upstream HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalisePair(pair, network, address) {
  const wanted = address.toLowerCase();
  const baseAddress = String(pair?.baseToken?.address || '');
  const quoteAddress = String(pair?.quoteToken?.address || '');
  const isBase = baseAddress.toLowerCase() === wanted;
  const isQuote = quoteAddress.toLowerCase() === wanted;
  if (!isBase && !isQuote) return null;

  const basePriceUsd = asNumber(pair.priceUsd);
  const priceNative = asNumber(pair.priceNative);
  const tokenPriceUsd = isBase
    ? basePriceUsd
    : (basePriceUsd !== null && priceNative > 0 ? basePriceUsd / priceNative : null);
  const txns = pair.txns || {};
  const volume = pair.volume || {};
  const priceChange = pair.priceChange || {};
  const liquidity = pair.liquidity || {};

  return {
    network,
    chainId: pair.chainId || network,
    dexId: pair.dexId || null,
    pairAddress: pair.pairAddress || null,
    pairUrl: pair.url || null,
    tokenSide: isBase ? 'base' : 'quote',
    token: isBase ? pair.baseToken : pair.quoteToken,
    quoteToken: isBase ? pair.quoteToken : pair.baseToken,
    priceUsd: tokenPriceUsd,
    priceNative: isBase ? priceNative : (tokenPriceUsd && basePriceUsd ? basePriceUsd / tokenPriceUsd : null),
    liquidityUsd: asNumber(liquidity.usd),
    fdv: asNumber(pair.fdv),
    marketCap: asNumber(pair.marketCap),
    volume: {
      m5: asNumber(volume.m5),
      h1: asNumber(volume.h1),
      h6: asNumber(volume.h6),
      h24: asNumber(volume.h24)
    },
    priceChange: {
      m5: asNumber(priceChange.m5),
      h1: asNumber(priceChange.h1),
      h6: asNumber(priceChange.h6),
      h24: asNumber(priceChange.h24)
    },
    transactions: {
      m5: txns.m5 || null,
      h1: txns.h1 || null,
      h6: txns.h6 || null,
      h24: txns.h24 || null
    },
    pairCreatedAt: asNumber(pair.pairCreatedAt),
    labels: Array.isArray(pair.labels) ? pair.labels : [],
    baseToken: pair.baseToken || null,
    quote: pair.quoteToken || null,
    imageUrl: pair.info?.imageUrl || null,
    websites: Array.isArray(pair.info?.websites) ? pair.info.websites : [],
    socials: Array.isArray(pair.info?.socials) ? pair.info.socials : []
  };
}

async function fetchOhlcv(network, pairAddress, address, timeframe) {
  const cfg = TIMEFRAMES[timeframe];
  if (!cfg || !pairAddress) return { candles: [], source: null, warning: 'Timeframe or pool is not available.' };

  const url = new URL(
    'https://api.geckoterminal.com/api/v2/networks/' + network + '/pools/' +
    encodeURIComponent(pairAddress) + '/ohlcv/' + cfg.period
  );
  url.searchParams.set('aggregate', String(cfg.aggregate));
  url.searchParams.set('limit', '220');
  url.searchParams.set('currency', 'usd');
  url.searchParams.set('token', address);
  url.searchParams.set('include_empty_intervals', 'false');

  try {
    const data = await fetchJson(url.toString());
    const rows = data?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(rows)) {
      return { candles: [], source: 'GECKOTERMINAL', warning: 'OHLCV response did not contain candle rows.' };
    }
    const candles = rows
      .map(row => ({
        time: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]) || 0
      }))
      .filter(c => Number.isFinite(c.time) && c.close > 0 &&
        [c.open, c.high, c.low, c.close].every(Number.isFinite))
      .sort((a, b) => a.time - b.time);
    return {
      candles,
      source: 'GECKOTERMINAL_OHLCV',
      warning: candles.length < 35 ? 'Data candle kurang dari 35 bar; indikator lanjutan belum dihitung.' : null
    };
  } catch (error) {
    return {
      candles: [],
      source: null,
      warning: 'OHLCV unavailable: ' + String(error?.message || error).slice(0, 180)
    };
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const network = String(url.searchParams.get('network') || '').toLowerCase();
  const address = String(url.searchParams.get('address') || '').trim();
  const timeframe = String(url.searchParams.get('tf') || 'M5').toUpperCase();
  const networkConfig = NETWORKS[network];

  if (!networkConfig) return json({ ok: false, error: 'Unsupported network.' }, 400);
  if (!validAddress(network, address)) return json({ ok: false, error: 'Invalid token contract / mint address for selected network.' }, 400);
  if (!TIMEFRAMES[timeframe]) return json({ ok: false, error: 'Unsupported DEX timeframe.' }, 400);

  try {
    const pairUrl = 'https://api.dexscreener.com/token-pairs/v1/' +
      networkConfig.dex + '/' + encodeURIComponent(address);
    const pairRows = await fetchJson(pairUrl);
    const matches = (Array.isArray(pairRows) ? pairRows : [])
      .map(pair => normalisePair(pair, networkConfig.dex, address))
      .filter(pair => pair && pair.priceUsd !== null && pair.priceUsd > 0);
    if (!matches.length) {
      return json({ ok: false, error: 'No valid DEX pair was found for this contract on the selected network.' }, 404);
    }

    matches.sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
    const pair = matches[0];
    const ohlcv = await fetchOhlcv(networkConfig.gecko, pair.pairAddress, address, timeframe);

    return json({
      ok: true,
      requested: { network, address, timeframe },
      network: { id: network, label: networkConfig.label },
      pair,
      pairCount: matches.length,
      candles: ohlcv.candles,
      candleSource: ohlcv.source,
      candleWarning: ohlcv.warning,
      verification: {
        marketData: 'DEXSCREENER',
        ohlcv: ohlcv.source || 'UNAVAILABLE',
        contractSecurity: 'NOT_VERIFIED',
        warning: 'Market price and liquidity are not a smart-contract security audit. LP lock/burn, mint/freeze authority, holder concentration and honeypot status are not verified by this endpoint.'
      },
      fetchedAt: new Date().toISOString()
    }, 200, { 'Cache-Control': 'public, max-age=10, s-maxage=10' });
  } catch (error) {
    return json({
      ok: false,
      error: 'DEX data provider could not be reached: ' + String(error?.message || error).slice(0, 180)
    }, 502);
  }
}
