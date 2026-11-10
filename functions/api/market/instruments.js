export async function onRequestGet() {
  const instruments = [
    { symbol: 'BTC/USDT', name: 'Bitcoin / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'ETH/USDT', name: 'Ethereum / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'SOL/USDT', name: 'Solana / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'BNB/USDT', name: 'BNB / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'XRP/USDT', name: 'XRP / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'ADA/USDT', name: 'Cardano / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'DOGE/USDT', name: 'Dogecoin / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'AVAX/USDT', name: 'Avalanche / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'LINK/USDT', name: 'Chainlink / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'TON/USDT', name: 'Toncoin / Tether US', assetClass: 'crypto', realtime: true },
    { symbol: 'EUR/USD', name: 'Euro / US Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'GBP/USD', name: 'British Pound / US Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', assetClass: 'forex', realtime: false },
    { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', assetClass: 'forex', realtime: false },
    { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', assetClass: 'forex', realtime: false },
    { symbol: 'XAU/USD', name: 'Spot Gold (Emas / USD)', assetClass: 'metals', realtime: false },
    { symbol: 'XAG/USD', name: 'Spot Silver (Perak / USD)', assetClass: 'metals', realtime: false },
    { symbol: 'WTI', name: 'WTI Crude Oil (FRED / USO)', assetClass: 'commodities', realtime: false },
    { symbol: 'BRENT', name: 'Brent Crude Oil (FRED / BNO)', assetClass: 'commodities', realtime: false },
    { symbol: 'NATGAS', name: 'Natural Gas (FRED / UNG)', assetClass: 'commodities', realtime: false },
    { symbol: 'COPPER', name: 'Global Copper (FRED / CPER)', assetClass: 'commodities', realtime: false },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', assetClass: 'stocks', realtime: false },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust', assetClass: 'stocks', realtime: false },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', assetClass: 'stocks', realtime: false },
    { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'MSFT', name: 'Microsoft Corporation', assetClass: 'stocks', realtime: false },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'stocks', realtime: false },
    { symbol: 'TSLA', name: 'Tesla Inc.', assetClass: 'stocks', realtime: false }
  ];
  return new Response(JSON.stringify({ ok: true, total: instruments.length, instruments }), {
    headers: { 'Content-Type': 'application/json' }
  });
}