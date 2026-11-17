-- Skema entitlement & log transaksi VIP (Cloudflare D1).
-- Sekali saja di dashboard/CLI:
--   wrangler d1 create xstarzg-db
--   wrangler d1 execute xstarzg-db --remote --file=migrations/0001_vip.sql
-- lalu isi database_id hasil create pada blok [[d1_databases]] di wrangler.toml.
-- Tanpa binding DB aplikasi tetap jalan (JWT bertanda tangan + KV opsional),
-- tetapi entitlement tidak bertahan lintas isolate/perangkat.
CREATE TABLE IF NOT EXISTS vip_entitlements (
  email      TEXT PRIMARY KEY,
  vip_until  INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vip_tx (
  tx_hash    TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
