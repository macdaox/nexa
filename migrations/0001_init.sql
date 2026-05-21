CREATE TABLE IF NOT EXISTS exchange_accounts (
  id TEXT PRIMARY KEY,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance', 'okx')),
  name TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  secret_key_encrypted TEXT NOT NULL,
  passphrase_encrypted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS asset_balances (
  id TEXT PRIMARY KEY,
  exchange_account_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  available REAL NOT NULL DEFAULT 0,
  frozen REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  usdt_value REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  FOREIGN KEY (exchange_account_id) REFERENCES exchange_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_balances_exchange_account_id
  ON asset_balances(exchange_account_id);

CREATE INDEX IF NOT EXISTS idx_asset_balances_asset
  ON asset_balances(asset);
