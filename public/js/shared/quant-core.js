export const TIMEFRAMES = [
  { id: 'M1', label: '1m', seconds: 60, horizon: 'scalping', bars: 320 },
  { id: 'M5', label: '5m', seconds: 300, horizon: 'scalping', bars: 320 },
  { id: 'M15', label: '15m', seconds: 900, horizon: 'scalping', bars: 320 },
  { id: 'M30', label: '30m', seconds: 1800, horizon: 'intraday', bars: 300 },
  { id: 'H1', label: '1H', seconds: 3600, horizon: 'intraday', bars: 300 },
  { id: 'H4', label: '4H', seconds: 14400, horizon: 'swing', bars: 280 },
  { id: 'D1', label: '1D', seconds: 86400, horizon: 'swing', bars: 260 },
  { id: 'W1', label: '1W', seconds: 604800, horizon: 'macro', bars: 200 },
  { id: 'MN', label: '1M', seconds: 2592000, horizon: 'macro', bars: 120 },
  { id: '1Y', label: '1Y', seconds: 31536000, horizon: 'macro', bars: 40 }
];
export const TIMEFRAME_SECONDS = {
  M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800, MN: 2592000, '1Y': 31536000
};
export const SCALPING_TIMEFRAMES = ['M1', 'M5', 'M15'];
export const HORIZON_GROUPS = {
  scalping: { id: 'scalping', label: '⚡ SCALPING', tfs: ['M1', 'M5', 'M15'], defaultTf: 'M5', desc: 'Eksekusi cepat M1-M15 (Momentum, VWAP & Orderflow)' },
  intraday: { id: 'intraday', label: '🎯 INTRADAY', tfs: ['M15', 'M30', 'H1'], defaultTf: 'M30', desc: 'Target harian M15-H1 (SMC, FVG, Session Breakout & VPVR)' },
  swing: { id: 'swing', label: '🌊 SWING', tfs: ['H4', 'D1', 'W1'], defaultTf: 'H4', desc: 'Multi-hari H4-W1 (Supply/Demand, Struktur Tren & CFTC COT)' },
  macro: { id: 'macro', label: '🏛️ INVESTOR / MACRO', tfs: ['D1', 'W1', 'MN', '1Y'], defaultTf: 'D1', desc: 'Akumulasi Spot, DCA Bertahap & Valuasi Makro' },
  all: { id: 'all', label: 'ALL TF', tfs: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN', '1Y'], defaultTf: 'H1', desc: 'Semua Timeframe M1 s/d 1Y' }
};
const mkCrypto = (sym, name, basePrice) => ({
  symbol: `${sym}/USDT`, name, assetClass: 'crypto', provider: 'binance', providerSymbol: `${sym}USDT`,
  isRealtime: true, delayMinutes: 0, basePrice, cotCategory: 'CME_CRYPTO'
});
const mkForex = (sym, name, basePrice) => ({
  symbol: sym, name, assetClass: 'forex', provider: 'edge_fx', providerSymbol: sym.replace('/', ''),
  isRealtime: true, delayMinutes: 0, basePrice, cotCategory: 'CFTC_FX'
});
const mkMetal = (sym, name, basePrice) => ({
  symbol: sym, name, assetClass: 'metals', provider: 'edge_metal', providerSymbol: sym.replace('/', ''),
  isRealtime: true, delayMinutes: 0, basePrice, cotCategory: 'CFTC_METALS'
});
const mkComm = (sym, name, basePrice, proxy) => ({
  symbol: sym, name, assetClass: 'commodities', provider: 'edge_comm', providerSymbol: sym, proxySymbol: proxy,
  isRealtime: true, delayMinutes: 0, basePrice, cotCategory: 'CFTC_COMMODITIES'
});
const mkStock = (sym, name, basePrice, region = 'US') => ({
  symbol: sym, name: `[${region}] ${name}`, assetClass: 'stocks', region, provider: 'edge_stock', providerSymbol: sym,
  isRealtime: true, delayMinutes: 0, basePrice, cotCategory: 'CFTC_EQUITY_INDEX'
});
export const DEFAULT_INSTRUMENTS = [
  // CRYPTO (55 Major + Live Search Supports 1,500+ Pairs)
  mkCrypto('BTC', 'Bitcoin', 94500), mkCrypto('ETH', 'Ethereum', 2780), mkCrypto('SOL', 'Solana', 192),
  mkCrypto('BNB', 'BNB Chain', 655), mkCrypto('XRP', 'Ripple XRP', 2.55), mkCrypto('ADA', 'Cardano', 0.82),
  mkCrypto('DOGE', 'Dogecoin', 0.26), mkCrypto('AVAX', 'Avalanche', 26.4), mkCrypto('LINK', 'Chainlink', 18.9),
  mkCrypto('TON', 'Toncoin', 3.85), mkCrypto('SUI', 'Sui Network', 3.42), mkCrypto('DOT', 'Polkadot', 5.20),
  mkCrypto('NEAR', 'NEAR Protocol', 3.60), mkCrypto('APT', 'Aptos', 6.40), mkCrypto('ARB', 'Arbitrum', 0.49),
  mkCrypto('OP', 'Optimism', 1.15), mkCrypto('PEPE', 'Pepe Coin', 0.0000105), mkCrypto('SHIB', 'Shiba Inu', 0.0000162),
  mkCrypto('LTC', 'Litecoin', 124), mkCrypto('BCH', 'Bitcoin Cash', 345), mkCrypto('UNI', 'Uniswap', 9.80),
  mkCrypto('AAVE', 'Aave Protocol', 255), mkCrypto('INJ', 'Injective', 15.8), mkCrypto('RENDER', 'Render AI', 4.65),
  mkCrypto('FET', 'Artificial Superintelligence', 0.78), mkCrypto('TAO', 'Bittensor AI', 415), mkCrypto('ONDO', 'Ondo RWA', 1.22),
  mkCrypto('TIA', 'Celestia', 3.90), mkCrypto('SEI', 'Sei Network', 0.28), mkCrypto('JUP', 'Jupiter DEX', 0.84),
  mkCrypto('BONK', 'Bonk Solana', 0.000018), mkCrypto('WIF', 'dogwifhat', 0.72), mkCrypto('FLOKI', 'Floki Inu', 0.000098),
  mkCrypto('ATOM', 'Cosmos Hub', 4.95), mkCrypto('FIL', 'Filecoin', 3.45), mkCrypto('ICP', 'Internet Computer', 7.20),
  mkCrypto('HBAR', 'Hedera Hashgraph', 0.23), mkCrypto('ALGO', 'Algorand', 0.29), mkCrypto('VET', 'VeChain', 0.034),
  mkCrypto('FTM', 'Fantom / Sonic', 0.62), mkCrypto('MKR', 'Maker / Sky', 1420), mkCrypto('LDO', 'Lido DAO', 1.68),
  mkCrypto('CRV', 'Curve DAO', 0.54), mkCrypto('PENDLE', 'Pendle Yield', 3.65), mkCrypto('ENA', 'Ethena', 0.48),
  mkCrypto('WLD', 'Worldcoin', 1.28), mkCrypto('STX', 'Stacks BTC L2', 0.96), mkCrypto('IMX', 'Immutable X', 0.85),
  mkCrypto('GRT', 'The Graph', 0.14), mkCrypto('SAND', 'The Sandbox', 0.38), mkCrypto('MANA', 'Decentraland', 0.34),
  mkCrypto('AXS', 'Axie Infinity', 4.40), mkCrypto('GALA', 'Gala Games', 0.023), mkCrypto('JASMY', 'JasmyCoin', 0.022),
  mkCrypto('TRUMP', 'Official Trump', 17.50),
  // BINGX & MEXC EXPANSION GEMS & HIGH-VOLUME PAIRS (20 Aset Baru)
  mkCrypto('KAS', 'Kaspa PoW Network', 0.15), mkCrypto('SUPER', 'SuperVerse Gaming & NFT', 1.15),
  mkCrypto('POPCAT', 'Popcat Solana Meme', 1.20), mkCrypto('BRETT', 'Brett Base Meme Leader', 0.12),
  mkCrypto('VIRTUAL', 'Virtuals Protocol AI Agent', 1.85), mkCrypto('SPX', 'SPX6900 Cult Meme', 0.75),
  mkCrypto('RAY', 'Raydium Solana DEX', 5.20), mkCrypto('OM', 'MANTRA RWA Chain', 3.80),
  mkCrypto('MEW', 'cat in a dogs world', 0.009), mkCrypto('NEIRO', 'First Neiro on Ethereum', 0.0018),
  mkCrypto('MOODENG', 'Moo Deng Viral Meme', 0.45), mkCrypto('GOAT', 'Goatseus Maximus AI Meme', 0.78),
  mkCrypto('PNUT', 'Peanut the Squirrel', 1.10), mkCrypto('ACT', 'Act I The AI Prophecy', 0.48),
  mkCrypto('AERO', 'Aerodrome Finance Base DEX', 1.35), mkCrypto('TURBO', 'Turbo AI Meme Coin', 0.0085),
  mkCrypto('AI16Z', 'ai16z Decentralized AI DAO', 0.42), mkCrypto('FARTCOIN', 'Fartcoin AI Agent', 0.38),
  mkCrypto('KCS', 'KuCoin Token', 11.50), mkCrypto('PENGU', 'Pudgy Penguins Web3', 0.035),
  // FOREX (28 Pairs: Majors, Minors, Crosses & Asia/IDR)
  mkForex('EUR/USD', 'Euro / US Dollar', 1.0485), mkForex('GBP/USD', 'British Pound / US Dollar', 1.2590),
  mkForex('USD/JPY', 'US Dollar / Japanese Yen', 151.40), mkForex('USD/IDR', 'US Dollar / Rupiah Indonesia', 16285),
  mkForex('AUD/USD', 'Australian Dollar / US Dollar', 0.6365), mkForex('USD/CAD', 'US Dollar / Canadian Dollar', 1.4190),
  mkForex('USD/CHF', 'US Dollar / Swiss Franc', 0.8980), mkForex('NZD/USD', 'New Zealand Dollar / US Dollar', 0.5740),
  mkForex('EUR/JPY', 'Euro / Japanese Yen', 158.75), mkForex('GBP/JPY', 'British Pound / Japanese Yen', 190.60),
  mkForex('EUR/GBP', 'Euro / British Pound', 0.8328), mkForex('AUD/JPY', 'Australian Dollar / Yen', 96.35),
  mkForex('CAD/JPY', 'Canadian Dollar / Yen', 106.70), mkForex('CHF/JPY', 'Swiss Franc / Yen', 168.60),
  mkForex('NZD/JPY', 'New Zealand Dollar / Yen', 86.90), mkForex('EUR/AUD', 'Euro / Australian Dollar', 1.6470),
  mkForex('GBP/AUD', 'British Pound / Australian Dollar', 1.9780), mkForex('EUR/CAD', 'Euro / Canadian Dollar', 1.4880),
  mkForex('GBP/CAD', 'British Pound / Canadian Dollar', 1.7860), mkForex('EUR/CHF', 'Euro / Swiss Franc', 0.9415),
  mkForex('GBP/CHF', 'British Pound / Swiss Franc', 1.1305), mkForex('AUD/CAD', 'Australian Dollar / Canadian Dollar', 0.9030),
  mkForex('AUD/NZD', 'Australian Dollar / New Zealand Dollar', 1.1085), mkForex('USD/SGD', 'US Dollar / Singapore Dollar', 1.3420),
  mkForex('USD/CNH', 'US Dollar / Offshore Yuan China', 7.2650), mkForex('USD/THB', 'US Dollar / Thai Baht', 33.85),
  mkForex('USD/MXN', 'US Dollar / Mexican Peso', 20.35), mkForex('USD/ZAR', 'US Dollar / South African Rand', 18.40),
  // METALS (10 Precious & Industrial Metals)
  mkMetal('XAU/USD', 'Gold Spot / Emas Dunia (USD)', 2915.0), mkMetal('XAU/IDR', 'Emas Spot / Gram (IDR Proxy)', 1528000),
  // Harga jangkar logam dikalibrasi ulang ke pasar 2026 (XAG spot ~$50, XPT ~$1.580, tembaga ~$5.10/lb)
  mkMetal('XAG/USD', 'Silver Spot / Perak (USD)', 50.00), mkMetal('XPT/USD', 'Platinum Spot (USD)', 1580.0),
  mkMetal('XPD/USD', 'Palladium Spot (USD)', 1050.0), mkMetal('HG/USD', 'Copper LME / Tembaga (USD/lb)', 5.10),
  mkMetal('NI/USD', 'Nickel LME / Nikel (USD/Ton)', 15680), mkMetal('SN/USD', 'Tin LME / Timah (USD/Ton)', 31450),
  mkMetal('AL/USD', 'Aluminum LME (USD/Ton)', 2640), mkMetal('LI/USD', 'Lithium Carbonate (USD/Ton)', 10850),
  // COMMODITIES & CFTC FUTURES (16 Energy, Nusantara & Agriculture)
  mkComm('WTI', 'WTI Crude Oil / Minyak Mentah AS', 71.20, 'USO'),
  mkComm('BRENT', 'Brent Crude Oil / Minyak Global', 75.10, 'BNO'),
  mkComm('NATGAS', 'Henry Hub Natural Gas / Gas Alam', 3.75, 'UNG'),
  mkComm('CPO', 'Crude Palm Oil / Minyak Sawit (MYR/Ton)', 4520, 'CPO'),
  mkComm('COAL', 'Newcastle Coal / Batu Bara (USD/Ton)', 124.50, 'COAL'),
  mkComm('HEATOIL', 'NY Harbor Heating Oil Futures', 2.38, 'UHN'),
  mkComm('GASOLINE', 'RBOB Gasoline Futures', 2.12, 'UGA'),
  mkComm('WHEAT', 'CFTC CBOT Wheat / Gandum', 592.0, 'WEAT'),
  mkComm('CORN', 'CFTC CBOT Corn / Jagung', 496.0, 'CORN'),
  mkComm('SOYBEAN', 'CFTC CBOT Soybeans / Kedelai', 1048.0, 'SOYB'),
  mkComm('COFFEE', 'CFTC Arabica Coffee / Kopi', 385.0, 'JO'),
  mkComm('COCOA', 'CFTC ICE Cocoa / Kakao (USD/Ton)', 9850.0, 'NIB'),
  mkComm('SUGAR', 'CFTC Sugar No.11 / Gula Mentah', 19.85, 'CANE'),
  mkComm('COTTON', 'CFTC ICE Cotton / Kapas', 68.40, 'BAL'),
  mkComm('CATTLE', 'CFTC CME Live Cattle Futures', 196.50, 'COW'),
  mkComm('LUMBER', 'Random Length Lumber / Kayu', 585.0, 'WOOD'),
  // SAHAM INDONESIA (IDX LQ45 & Sektoral Unggulan)
  mkStock('IHSG', 'Indeks Harga Saham Gabungan (JKSE)', 6825, 'ID'),
  mkStock('BBCA.JK', 'Bank Central Asia Tbk (Rp)', 9350, 'ID'),
  mkStock('BBRI.JK', 'Bank Rakyat Indonesia Tbk (Rp)', 4120, 'ID'),
  mkStock('BMRI.JK', 'Bank Mandiri (Persero) Tbk (Rp)', 5375, 'ID'),
  mkStock('BBNI.JK', 'Bank Negara Indonesia Tbk (Rp)', 4480, 'ID'),
  mkStock('BRIS.JK', 'Bank Syariah Indonesia Tbk (Rp)', 2940, 'ID'),
  mkStock('TLKM.JK', 'Telkom Indonesia (Persero) Tbk (Rp)', 2680, 'ID'),
  mkStock('ASII.JK', 'Astra International Tbk (Rp)', 4790, 'ID'),
  mkStock('AMMN.JK', 'Amman Mineral Internasional Tbk (Rp)', 7450, 'ID'),
  mkStock('BREN.JK', 'Barito Renewables Energy Tbk (Rp)', 6950, 'ID'),
  mkStock('TPIA.JK', 'Chandra Asri Pacific Tbk (Rp)', 7200, 'ID'),
  mkStock('GOTO.JK', 'GoTo Gojek Tokopedia Tbk (Rp)', 81, 'ID'),
  mkStock('ADRO.JK', 'Alamtri Resources / Adaro Energy (Rp)', 2360, 'ID'),
  mkStock('PTBA.JK', 'Bukit Asam Tbk - Batu Bara (Rp)', 2750, 'ID'),
  mkStock('ITMG.JK', 'Indo Tambangraya Megah Tbk (Rp)', 25800, 'ID'),
  mkStock('ANTM.JK', 'Aneka Tambang Tbk - Emas & Nikel (Rp)', 1645, 'ID'),
  mkStock('MDKA.JK', 'Merdeka Copper Gold Tbk (Rp)', 1820, 'ID'),
  mkStock('INCO.JK', 'Vale Indonesia Tbk - Nikel (Rp)', 3420, 'ID'),
  mkStock('PGAS.JK', 'Perusahaan Gas Negara Tbk (Rp)', 1660, 'ID'),
  mkStock('MEDC.JK', 'Medco Energi Internasional Tbk (Rp)', 1135, 'ID'),
  mkStock('AKRA.JK', 'AKR Corporindo Tbk (Rp)', 1245, 'ID'),
  mkStock('UNTR.JK', 'United Tractors Tbk (Rp)', 25100, 'ID'),
  mkStock('ICBP.JK', 'Indofood CBP Sukses Makmur Tbk (Rp)', 11450, 'ID'),
  mkStock('INDF.JK', 'Indofood Sukses Makmur Tbk (Rp)', 7650, 'ID'),
  mkStock('UNVR.JK', 'Unilever Indonesia Tbk (Rp)', 1580, 'ID'),
  mkStock('KLBF.JK', 'Kalbe Farma Tbk (Rp)', 1265, 'ID'),
  mkStock('CPIN.JK', 'Charoen Pokphand Indonesia Tbk (Rp)', 4680, 'ID'),
  mkStock('SMGR.JK', 'Semen Indonesia (Persero) Tbk (Rp)', 2890, 'ID'),
  mkStock('BSDE.JK', 'Bumi Serpong Damai Tbk (Rp)', 945, 'ID'),
  mkStock('BUKA.JK', 'Bukalapak.com Tbk (Rp)', 128, 'ID'),
  // SAHAM AMERIKA SERIKAT (US Wall Street & Indices)
  mkStock('SPY', 'S&P 500 Index ETF', 604.5, 'US'),
  mkStock('QQQ', 'Nasdaq 100 Tech ETF', 528.2, 'US'),
  mkStock('DIA', 'Dow Jones Industrial ETF', 442.8, 'US'),
  mkStock('IWM', 'Russell 2000 Small Cap ETF', 224.6, 'US'),
  mkStock('NVDA', 'NVIDIA Corporation (AI)', 136.8, 'US'),
  mkStock('AAPL', 'Apple Inc.', 242.5, 'US'),
  mkStock('MSFT', 'Microsoft Corporation', 416.0, 'US'),
  mkStock('AMZN', 'Amazon.com Inc.', 228.4, 'US'),
  mkStock('GOOGL', 'Alphabet Inc. (Google)', 186.2, 'US'),
  mkStock('META', 'Meta Platforms Inc.', 698.5, 'US'),
  mkStock('TSLA', 'Tesla Inc.', 354.0, 'US'),
  mkStock('AMD', 'Advanced Micro Devices', 114.2, 'US'),
  mkStock('AVGO', 'Broadcom Inc.', 232.0, 'US'),
  mkStock('NFLX', 'Netflix Inc.', 1015.0, 'US'),
  mkStock('BRK.B', 'Berkshire Hathaway', 476.0, 'US'),
  mkStock('JPM', 'JPMorgan Chase & Co.', 272.5, 'US'),
  mkStock('V', 'Visa Inc.', 348.0, 'US'),
  mkStock('LLY', 'Eli Lilly & Co.', 865.0, 'US'),
  mkStock('XOM', 'Exxon Mobil Corp.', 110.5, 'US'),
  mkStock('PLTR', 'Palantir Technologies', 112.4, 'US'),
  mkStock('COIN', 'Coinbase Global Inc.', 274.0, 'US'),
  mkStock('MSTR', 'Strategy / MicroStrategy', 332.0, 'US'),
  // AI, Cloud & Semiconductors
  mkStock('SMCI', 'Super Micro Computer (AI Servers)', 32.5, 'US'),
  mkStock('ARM', 'Arm Holdings plc (AI CPU)', 142.0, 'US'),
  mkStock('INTC', 'Intel Corporation', 24.5, 'US'),
  mkStock('MU', 'Micron Technology (HBM Memory)', 108.0, 'US'),
  mkStock('QCOM', 'Qualcomm Incorporated (Snapdragon)', 165.0, 'US'),
  mkStock('ORCL', 'Oracle Corporation (Cloud AI)', 188.0, 'US'),
  // FinTech, Trading & Neobanks
  mkStock('HOOD', 'Robinhood Markets Inc.', 36.8, 'US'),
  mkStock('PYPL', 'PayPal Holdings Inc.', 84.5, 'US'),
  mkStock('SQ', 'Block Inc. (Square & Cash App)', 88.0, 'US'),
  mkStock('SOFI', 'SoFi Technologies Inc.', 15.2, 'US'),
  // Mobility, EV, Space & Defense
  mkStock('UBER', 'Uber Technologies Inc.', 76.5, 'US'),
  mkStock('ABNB', 'Airbnb Inc.', 138.0, 'US'),
  mkStock('RIVN', 'Rivian Automotive Inc. (EV)', 12.8, 'US'),
  mkStock('BA', 'Boeing Company (Aerospace)', 158.0, 'US'),
  mkStock('LMT', 'Lockheed Martin (Defense/Aerospace)', 475.0, 'US'),
  mkStock('RTX', 'RTX Corporation (Raytheon Aerospace)', 124.0, 'US'),
  // Consumer, Retail & Global Mega Brands
  mkStock('WMT', 'Walmart Inc.', 92.5, 'US'),
  mkStock('COST', 'Costco Wholesale Corporation', 965.0, 'US'),
  mkStock('DIS', 'Walt Disney Company', 112.0, 'US'),
  mkStock('NKE', 'NIKE Inc.', 78.5, 'US'),
  mkStock('SBUX', 'Starbucks Corporation', 98.0, 'US'),
  // Healthcare, Pharma & Biotech
  mkStock('PFE', 'Pfizer Inc. (Biopharma)', 26.5, 'US'),
  mkStock('MRK', 'Merck & Co. Inc.', 102.0, 'US'),
  mkStock('UNH', 'UnitedHealth Group', 580.0, 'US'),
  // Industrial & Energy Giants
  mkStock('CVX', 'Chevron Corporation (Energy)', 158.0, 'US'),
  mkStock('CAT', 'Caterpillar Inc. (Industrial)', 395.0, 'US'),
  // SAHAM & INDEKS GLOBAL (Asia, Eropa, Timur Tengah)
  mkStock('JP225', 'Nikkei 225 Index (Jepang)', 38950, 'JP'),
  mkStock('7203.T', 'Toyota Motor Corp (JPY)', 2845, 'JP'),
  mkStock('6758.T', 'Sony Group Corp (JPY)', 3480, 'JP'),
  mkStock('9984.T', 'SoftBank Group (JPY)', 9620, 'JP'),
  mkStock('HK50', 'Hang Seng Index (Hong Kong)', 21850, 'HK'),
  mkStock('BABA', 'Alibaba Group Holding', 118.5, 'CN'),
  mkStock('0700.HK', 'Tencent Holdings (HKD)', 468.0, 'CN'),
  mkStock('1211.HK', 'BYD Company EV (HKD)', 342.0, 'CN'),
  mkStock('TSM', 'Taiwan Semiconductor (TSMC)', 204.5, 'TW'),
  mkStock('005930.KS', 'Samsung Electronics (KRW)', 56800, 'KR'),
  mkStock('DE40', 'DAX 40 Index (Jerman)', 22150, 'EU'),
  mkStock('UK100', 'FTSE 100 Index (Inggris)', 8740, 'UK'),
  mkStock('ASML', 'ASML Holding NV (Belanda)', 738.0, 'EU'),
  mkStock('MC.PA', 'LVMH Moet Hennessy (EUR)', 692.0, 'EU'),
  mkStock('NVO', 'Novo Nordisk A/S (Denmark)', 84.5, 'EU'),
  mkStock('D05.SI', 'DBS Group Bank (Singapura SGD)', 44.8, 'SG'),
  mkStock('SE', 'Sea Limited / Shopee (Asia)', 126.4, 'SG'),
  mkStock('2222.SR', 'Saudi Aramco (Arab Saudi SAR)', 27.85, 'SA')
];
export function registerDynamicInstrument(inst) {
  if (!inst || !inst.symbol) return;
  const exists = DEFAULT_INSTRUMENTS.find(i => i.symbol.toUpperCase() === inst.symbol.toUpperCase());
  if (!exists) DEFAULT_INSTRUMENTS.push(inst);
}
export function getInstrumentMeta(symbol) {
  const clean = String(symbol || 'BTC/USDT').trim().toUpperCase();
  const found = DEFAULT_INSTRUMENTS.find(i => i.symbol.toUpperCase() === clean || i.providerSymbol.toUpperCase() === clean);
  if (found) return found;
  if (clean.endsWith('/USDT') || clean.endsWith('USDT')) {
    const base = clean.replace('/USDT', '').replace('USDT', '');
    const dyn = mkCrypto(base, `${base} Crypto Asset`, 1.0);
    DEFAULT_INSTRUMENTS.push(dyn);
    return dyn;
  }
  return DEFAULT_INSTRUMENTS[0];
}
export function calcSMA(values, period) {
  const res = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) res[i] = sum / period;
  }
  return res;
}
export function calcEMA(values, period) {
  const res = new Array(values.length).fill(null);
  if (values.length < period) return res;
  const k = 2 / (period + 1);
  let emaVal = 0;
  for (let i = 0; i < period; i++) emaVal += values[i];
  emaVal /= period;
  res[period - 1] = emaVal;
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
    res[i] = emaVal;
  }
  return res;
}
export function calcRSI(closes, period = 14) {
  const res = new Array(closes.length).fill(50);
  if (closes.length <= period) return res;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  res[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    res[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return res;
}
export function calcATR(candles, period = 14) {
  const tr = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) tr[i] = candles[i].high - candles[i].low;
    else {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      tr[i] = Math.max(hl, hc, lc);
    }
  }
  return calcSMA(tr, period);
}
export function calcMACD(closes, fast = 12, slow = 26, sig = 9) {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = closes.map((_, i) => (emaFast[i] !== null && emaSlow[i] !== null) ? emaFast[i] - emaSlow[i] : 0);
  const sigLine = calcEMA(macdLine, sig);
  const hist = macdLine.map((v, i) => sigLine[i] !== null ? v - sigLine[i] : 0);
  return { macdLine, sigLine, hist };
}
export function calcBollinger(closes, period = 20, mult = 2) {
  const mid = calcSMA(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  const widthPct = new Array(closes.length).fill(0);
  for (let i = period - 1; i < closes.length; i++) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += Math.pow(closes[j] - mid[i], 2);
    const std = Math.sqrt(sq / period);
    upper[i] = mid[i] + mult * std;
    lower[i] = mid[i] - mult * std;
    widthPct[i] = mid[i] > 0 ? ((upper[i] - lower[i]) / mid[i]) * 100 : 0;
  }
  return { mid, upper, lower, widthPct };
}
// Modern Institutional Indicator 1: Rolling Anchored VWAP + Deviation Bands
export function calcVWAP(candles, lookback = 60) {
  const vwap = new Array(candles.length).fill(null);
  const upper = new Array(candles.length).fill(null);
  const lower = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - lookback + 1);
    let cumPV = 0, cumV = 0;
    for (let j = start; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      const vol = candles[j].volume || 1;
      cumPV += tp * vol;
      cumV += vol;
    }
    const mean = cumV > 0 ? cumPV / cumV : candles[i].close;
    vwap[i] = mean;
    let sq = 0;
    for (let j = start; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      sq += Math.pow(tp - mean, 2);
    }
    const std = Math.sqrt(sq / (i - start + 1));
    upper[i] = mean + 1.5 * std;
    lower[i] = mean - 1.5 * std;
  }
  return { vwap, upper, lower };
}
// Modern Institutional Indicator 2: VPVR (Volume Profile Visible Range) + TPO (Time Price Opportunity)
export function calcVolumeAndTpoProfile(candles, bins = 24) {
  if (!candles || candles.length === 0) return { poc: 0, vah: 0, val: 0, tpoPoc: 0 };
  const slice = candles.slice(-120);
  let minP = Infinity, maxP = -Infinity;
  for (const c of slice) {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
  }
  if (maxP <= minP) {
    const p = slice[slice.length - 1].close;
    return { poc: p, vah: p, val: p, tpoPoc: p };
  }
  const step = (maxP - minP) / bins;
  const volHist = new Array(bins).fill(0);
  const tpoHist = new Array(bins).fill(0);
  for (const c of slice) {
    const mid = (c.high + c.low + c.close) / 3;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((mid - minP) / step)));
    volHist[idx] += (c.volume || 1);
    const lowBin = Math.min(bins - 1, Math.max(0, Math.floor((c.low - minP) / step)));
    const highBin = Math.min(bins - 1, Math.max(0, Math.floor((c.high - minP) / step)));
    for (let b = lowBin; b <= highBin; b++) tpoHist[b] += 1;
  }
  let maxVol = -1, pocIdx = 0, maxTpo = -1, tpoIdx = 0;
  for (let i = 0; i < bins; i++) {
    if (volHist[i] > maxVol) { maxVol = volHist[i]; pocIdx = i; }
    if (tpoHist[i] > maxTpo) { maxTpo = tpoHist[i]; tpoIdx = i; }
  }
  const poc = minP + (pocIdx + 0.5) * step;
  const tpoPoc = minP + (tpoIdx + 0.5) * step;
  const vah = minP + Math.min(bins, pocIdx + 5) * step;
  const val = minP + Math.max(0, pocIdx - 4) * step;
  return { poc, vah, val, tpoPoc };
}
export function calcVolumeProfile(candles, bins = 24) {
  return calcVolumeAndTpoProfile(candles, bins);
}
export function detectSwingsNoLookahead(candles, leftRight = 3) {
  const swings = [];
  for (let i = leftRight; i < candles.length - leftRight; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= leftRight; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high < candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low > candles[i + j].low) isLow = false;
    }
    if (isHigh) swings.push({ type: 'HIGH', index: i, confirmedAtIndex: i + leftRight, price: candles[i].high, time: candles[i].time });
    if (isLow) swings.push({ type: 'LOW', index: i, confirmedAtIndex: i + leftRight, price: candles[i].low, time: candles[i].time });
  }
  return swings;
}
// Modern Institutional Indicator 3: SMC, FVG, Liquidity Sweep, Order Block, Supply/Demand & S/R
export function detectModernInstitutionalStructure(candles, swings, atrVal, tfId = 'H1') {
  const len = candles.length;
  const last = candles[len - 1];
  const lastPrice = last.close;
  const safeAtr = atrVal || (lastPrice * 0.01);
  // 1. Fair Value Gaps (FVG - 3-Candle Imbalance)
  let bullFvg = null, bearFvg = null;
  for (let i = len - 2; i >= Math.max(2, len - 45); i--) {
    const c0 = candles[i - 2], c2 = candles[i];
    if (!bullFvg && c2.low > c0.high && (c2.low - c0.high) > safeAtr * 0.12) {
      bullFvg = { top: c2.low, bottom: c0.high, mid: (c2.low + c0.high) / 2 };
    }
    if (!bearFvg && c2.high < c0.low && (c0.low - c2.high) > safeAtr * 0.12) {
      bearFvg = { top: c0.low, bottom: c2.high, mid: (c0.low + c2.high) / 2 };
    }
    if (bullFvg && bearFvg) break;
  }
  // 2. Confirmed Swing Highs & Lows for SMC BOS/CHoCH, Support/Resistance & Liquidity Sweeps
  const highs = swings.filter(s => s.type === 'HIGH' && s.confirmedAtIndex <= len - 1);
  const lows = swings.filter(s => s.type === 'LOW' && s.confirmedAtIndex <= len - 1);
  const recentHigh = highs.length ? highs[highs.length - 1].price : lastPrice + safeAtr * 2;
  const prevHigh = highs.length > 1 ? highs[highs.length - 2].price : recentHigh;
  const recentLow = lows.length ? lows[lows.length - 1].price : lastPrice - safeAtr * 2;
  const prevLow = lows.length > 1 ? lows[lows.length - 2].price : recentLow;
  // SMC Market Structure (BOS / CHoCH)
  let smcStatus = 'INTERNAL RANGE EQUILIBRIUM';
  let smcBias = 0;
  if (lastPrice > recentHigh) {
    smcStatus = recentHigh < prevHigh ? 'BULLISH CHoCH (Change of Character ▲)' : 'BULLISH BOS (Break of Structure ▲)';
    smcBias = 1;
  } else if (lastPrice < recentLow) {
    smcStatus = recentLow > prevLow ? 'BEARISH CHoCH (Change of Character ▼)' : 'BEARISH BOS (Break of Structure ▼)';
    smcBias = -1;
  } else if (recentHigh > prevHigh && recentLow > prevLow) {
    smcStatus = 'HIGHER HIGH / HIGHER LOW (Bullish Orderflow)';
    smcBias = 1;
  } else if (recentHigh < prevHigh && recentLow < prevLow) {
    smcStatus = 'LOWER HIGH / LOWER LOW (Bearish Orderflow)';
    smcBias = -1;
  }
  // 3. Liquidity Sweep (BSL / SSL Stop Hunt on recent 8 candles)
  let liquiditySweep = 'NONE (Normal Liquidity Flow)';
  let sweepBias = 0;
  const recentBars = candles.slice(-8);
  for (const b of recentBars) {
    if (b.low < recentLow && b.close > recentLow) {
      liquiditySweep = `SSL SWEEP ▲ (Stop-Hunt di bawah ${recentLow.toPrecision(6)} lalu Reclaim Bullish)`;
      sweepBias = 1;
      break;
    }
    if (b.high > recentHigh && b.close < recentHigh) {
      liquiditySweep = `BSL SWEEP ▼ (Stop-Hunt di atas ${recentHigh.toPrecision(6)} lalu Reject Bearish)`;
      sweepBias = -1;
      break;
    }
  }
  // 4. Supply & Demand Zones + Order Blocks
  const demandZone = { low: recentLow, high: recentLow + safeAtr * 0.65 };
  const supplyZone = { low: recentHigh - safeAtr * 0.65, high: recentHigh };
  // 5. Classical Pivot Support & Resistance (S1, S2, R1, R2)
  // v2026.62: pivot KLASIK sesuai konvensi analis — dihitung dari H/L/C periode
  // kalender SEBELUMNYA (D1 intraday -> kemarin; chart D1 -> candle harian kemarin;
  // W1 -> minggu lalu; MN -> bulan lalu), BUKAN jendela 24 candle campur-aduk.
  const tfObj = TIMEFRAMES.find(t => t.id === tfId) || null;
  const tfSec = tfObj ? tfObj.seconds : 3600;
  let prevP;
  if (tfSec >= 86400) {
    const pb = candles[Math.max(0, candles.length - 2)];
    prevP = { h: pb.high, l: pb.low, c: pb.close };
  } else {
    const dayStart = Math.floor(candles[candles.length - 1].time / 86400) * 86400;
    let ph = -Infinity, pl = Infinity, pc = null;
    for (let i = candles.length - 1; i >= 0; i--) {
      const t = candles[i].time;
      if (t >= dayStart) continue;
      if (t < dayStart - 86400) break;
      if (candles[i].high > ph) ph = candles[i].high;
      if (candles[i].low < pl) pl = candles[i].low;
      if (pc === null) pc = candles[i].close;
    }
    if (!Number.isFinite(ph) || pc === null) {
      const pb = candles[Math.max(0, candles.length - 2)];
      prevP = { h: pb.high, l: pb.low, c: pb.close };
    } else prevP = { h: ph, l: pl, c: pc };
  }
  const pivot = (prevP.h + prevP.l + prevP.c) / 3;
  const r1 = 2 * pivot - prevP.l;
  const s1 = 2 * pivot - prevP.h;
  const r2 = pivot + (prevP.h - prevP.l);
  const s2 = pivot - (prevP.h - prevP.l);
  return {
    smcStatus,
    smcBias,
    bullFvg,
    bearFvg,
    liquiditySweep,
    sweepBias,
    demandZone,
    supplyZone,
    pivotSr: { pivot, r1, r2, s1, s2 }
  };
}
export function generateInstitutionalSeries(metaOrSymbol, tfId = 'H1', count = 300) {
  const meta = typeof metaOrSymbol === 'string' ? getInstrumentMeta(metaOrSymbol) : (metaOrSymbol || DEFAULT_INSTRUMENTS[0]);
  const tfObj = TIMEFRAMES.find(t => t.id === tfId) || TIMEFRAMES[4];
  const stepSec = tfObj.seconds;
  const nowSec = Math.floor(Date.now() / 1000);
  const alignedNow = nowSec - (nowSec % stepSec);
  let seed = 2166136261;
  const key = `${meta.symbol}_${tfId}`;
  for (let i = 0; i < key.length; i++) {
    seed ^= key.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const base = meta.basePrice || 100;
  const volScale = meta.assetClass === 'forex' ? 0.0022 : meta.assetClass === 'metals' ? 0.0045 : meta.assetClass === 'crypto' ? 0.0095 : 0.006;
  const tfFactor = Math.max(0.25, Math.min(3.2, Math.pow(stepSec / 3600, 0.38)));
  const stepVol = base * volScale * tfFactor;
  let price = base * (0.94 + rand() * 0.12);
  const candles = [];
  let wavePhase = rand() * Math.PI * 2;
  for (let i = count - 1; i >= 0; i--) {
    const t = alignedNow - i * stepSec;
    wavePhase += 0.085;
    const cycleDrift = Math.sin(wavePhase) * (stepVol * 0.32);
    const shock = (rand() - 0.492) * stepVol * 1.45;
    const open = price;
    let close = Math.max(base * 0.15, open + cycleDrift + shock);
    const wickUp = Math.abs((rand() * 0.85) * stepVol);
    const wickDn = Math.abs((rand() * 0.85) * stepVol);
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(base * 0.1, Math.min(open, close) - wickDn);
    const volume = Math.round((1200 + rand() * 6800) * (1 + Math.abs(close - open) / (stepVol || 1)));
    candles.push({
      time: t,
      open: Number(open.toPrecision(7)),
      high: Number(high.toPrecision(7)),
      low: Number(low.toPrecision(7)),
      close: Number(close.toPrecision(7)),
      volume
    });
    price = close;
  }
  return candles;
}
// Legacy Export Aliases
export const sma = calcSMA;
export const ema = calcEMA;
export const rsi = calcRSI;
export const atr = calcATR;
export const macd = calcMACD;
export const bollingerBands = calcBollinger;
export const detectFractalSwings = detectSwingsNoLookahead;
export const computeVolumeProfile = calcVolumeProfile;
export const generateSyntheticCandles = generateInstitutionalSeries;