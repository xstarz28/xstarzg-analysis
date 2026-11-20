-- Skema subscriber bot Telegram VIP & Owner/Affiliate terverifikasi
-- Menyimpan Chat ID pengguna yang telah tervalidasi lisensi VIP-nya.
-- Hanya chat_id yang ada di tabel ini dan memiliki status aktif yang akan dikirimi sinyal.
CREATE TABLE IF NOT EXISTS telegram_subscribers (
  chat_id       TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  tier          TEXT NOT NULL,
  vip_until     INTEGER,
  is_owner      INTEGER DEFAULT 0,
  is_affiliate  INTEGER DEFAULT 0,
  registered_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tg_email ON telegram_subscribers(email);

CREATE TABLE IF NOT EXISTS telegram_activations (
  code          TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  tier          TEXT NOT NULL,
  vip_until     INTEGER,
  is_owner      INTEGER DEFAULT 0,
  is_affiliate  INTEGER DEFAULT 0,
  expires_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tg_act_exp ON telegram_activations(expires_at);
