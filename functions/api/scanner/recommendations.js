export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const mode = url.searchParams.get('mode') === 'investor' ? 'investor' : 'trader';
  const assetFilter = (url.searchParams.get('assetClass') || 'all').toLowerCase();
  const catalog = [
    { symbol: 'BTC/USDT', assetClass: 'crypto', confluenceScore: 76.4, direction: 'LONG', winRatePct: 61.8, expectancyR: 0.54, regime: 'STRONG_TREND' },
    { symbol: 'XAU/USD', assetClass: 'metals', confluenceScore: 74.2, direction: 'LONG', winRatePct: 59.4, expectancyR: 0.48, regime: 'STRONG_TREND' },
    { symbol: 'NVDA', assetClass: 'stocks', confluenceScore: 71.8, direction: 'LONG', winRatePct: 58.2, expectancyR: 0.44, regime: 'MODERATE_TREND' },
    { symbol: 'SOL/USDT', assetClass: 'crypto', confluenceScore: 69.5, direction: 'LONG', winRatePct: 56.9, expectancyR: 0.39, regime: 'STRONG_TREND' },
    { symbol: 'EUR/USD', assetClass: 'forex', confluenceScore: 34.2, direction: 'SHORT', winRatePct: 55.0, expectancyR: 0.31, regime: 'MODERATE_TREND' },
    { symbol: 'WTI', assetClass: 'commodities', confluenceScore: 36.8, direction: 'SHORT', winRatePct: 54.1, expectancyR: 0.27, regime: 'RANGING' },
    { symbol: 'ETH/USDT', assetClass: 'crypto', confluenceScore: 65.1, direction: 'LONG', winRatePct: 55.6, expectancyR: 0.33, regime: 'MODERATE_TREND' },
    { symbol: 'SPY', assetClass: 'stocks', confluenceScore: 66.8, direction: 'LONG', winRatePct: 57.5, expectancyR: 0.36, regime: 'MODERATE_TREND' },
    { symbol: 'USD/JPY', assetClass: 'forex', confluenceScore: 64.0, direction: 'LONG', winRatePct: 54.8, expectancyR: 0.29, regime: 'MODERATE_TREND' },
    { symbol: 'XAG/USD', assetClass: 'metals', confluenceScore: 63.2, direction: 'LONG', winRatePct: 53.9, expectancyR: 0.25, regime: 'VOLATILITY_SQUEEZE' }
  ];
  const items = catalog
    .filter((item) => assetFilter === 'all' || item.assetClass === assetFilter)
    .map((item) => {
      if (mode === 'investor' && item.direction === 'SHORT') {
        return { ...item, direction: 'NEUTRAL', spotConverted: true };
      }
      return item;
    });
  return new Response(JSON.stringify({ ok: true, mode, items }), {
    headers: { 'Content-Type': 'application/json' }
  });
}