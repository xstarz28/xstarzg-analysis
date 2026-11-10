const CIK_MAP = {
  NVDA: { cik: '0001045810', revenue: '$113.2B', netIncome: '$63.1B', assets: '$96.0B', liabilities: '$30.1B', cash: '$38.5B' },
  AAPL: { cik: '0000320193', revenue: '$391.0B', netIncome: '$93.7B', assets: '$364.9B', liabilities: '$308.0B', cash: '$65.2B' },
  MSFT: { cik: '0000789019', revenue: '$254.1B', netIncome: '$90.5B', assets: '$523.0B', liabilities: '$243.6B', cash: '$78.4B' },
  AMZN: { cik: '0001018724', revenue: '$620.1B', netIncome: '$50.2B', assets: '$584.6B', liabilities: '$316.2B', cash: '$88.0B' },
  GOOGL: { cik: '0001652044', revenue: '$339.8B', netIncome: '$94.3B', assets: '$430.2B', liabilities: '$119.1B', cash: '$93.2B' },
  TSLA: { cik: '0001318605', revenue: '$97.7B', netIncome: '$12.7B', assets: '$119.8B', liabilities: '$48.3B', cash: '$33.6B' },
  SPY: { cik: '0000884394', revenue: 'ETF Index', netIncome: 'Yield 1.28%', assets: '$618.0B AUM', liabilities: '0.09% Exp Ratio', cash: 'S&P 500 Basket' },
  QQQ: { cik: '0001067839', revenue: 'ETF Index', netIncome: 'Yield 0.58%', assets: '$312.0B AUM', liabilities: '0.20% Exp Ratio', cash: 'Nasdaq-100 Basket' }
};
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get('symbol') || 'NVDA').toUpperCase();
  const item = CIK_MAP[symbol];
  if (!item) {
    return new Response(JSON.stringify({ ok: false, symbol, error: 'Bukan emiten SEC AS.' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      symbol,
      cik: item.cik,
      facts: {
        revenueFormatted: item.revenue,
        netIncomeFormatted: item.netIncome,
        assetsFormatted: item.assets,
        liabilitiesFormatted: item.liabilities,
        cashFormatted: item.cash
      }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}