-- Two-player independent virtual trading race: Gemma Prime vs Micelio Prime.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS race_wallets (
  wallet_id TEXT PRIMARY KEY CHECK(wallet_id IN ('GEMMA','MICELIO')),
  initial_balance REAL NOT NULL CHECK(initial_balance = 10),
  cash_balance REAL NOT NULL CHECK(cash_balance >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS race_positions (
  wallet_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  entry_price REAL NOT NULL CHECK(entry_price > 0),
  opened_at TEXT NOT NULL,
  PRIMARY KEY(wallet_id,symbol),
  FOREIGN KEY(wallet_id) REFERENCES race_wallets(wallet_id)
);
CREATE TABLE IF NOT EXISTS race_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  fee REAL NOT NULL,
  slippage REAL NOT NULL,
  net_pnl REAL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(wallet_id) REFERENCES race_wallets(wallet_id)
);
CREATE TABLE IF NOT EXISTS race_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  quote_count INTEGER NOT NULL,
  quotes_json TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_race_trades_wallet ON race_trades(wallet_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_race_cycles_created ON race_cycles(created_at DESC);
