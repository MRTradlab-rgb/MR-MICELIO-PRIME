-- MR TradLab ZERO race portfolios. Schema only; race remains locked until runtime validation.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS race_state (
  race_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'LOCKED' CHECK(status IN ('LOCKED','READY','RUNNING','PAUSED','FINISHED')),
  target_equity REAL NOT NULL DEFAULT 1000 CHECK(target_equity > 0),
  initial_cash REAL NOT NULL DEFAULT 10 CHECK(initial_cash > 0),
  fee_per_side REAL NOT NULL DEFAULT 0.001 CHECK(fee_per_side >= 0),
  slippage_per_side REAL NOT NULL DEFAULT 0.0005 CHECK(slippage_per_side >= 0),
  max_position_fraction REAL NOT NULL DEFAULT 0.10 CHECK(max_position_fraction > 0 AND max_position_fraction <= 1),
  max_total_exposure_fraction REAL NOT NULL DEFAULT 0.50 CHECK(max_total_exposure_fraction > 0 AND max_total_exposure_fraction <= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  winner TEXT
);

CREATE TABLE IF NOT EXISTS race_wallets (
  contender_id TEXT PRIMARY KEY CHECK(contender_id IN ('gemma-prime','micelio-ensemble')),
  initial_cash REAL NOT NULL CHECK(initial_cash > 0),
  cash REAL NOT NULL,
  realized_pnl REAL NOT NULL DEFAULT 0,
  fees_paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RISK_LOCKED','FINISHED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS race_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contender_id TEXT NOT NULL,
  forecast_key TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  entry_price REAL NOT NULL CHECK(entry_price > 0),
  quantity REAL NOT NULL CHECK(quantity > 0),
  notional REAL NOT NULL CHECK(notional > 0),
  entry_fee REAL NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  mark_price REAL,
  exit_price REAL,
  gross_pnl REAL,
  net_pnl REAL,
  exit_fee REAL,
  closed_at TEXT,
  FOREIGN KEY(contender_id) REFERENCES race_wallets(contender_id)
);

CREATE TABLE IF NOT EXISTS race_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contender_id TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK(event_type IN ('INITIAL_FUNDING','OPEN_POSITION','CLOSE_POSITION','RISK_LOCK','RACE_START','RACE_FINISH')),
  amount REAL NOT NULL,
  cash_after REAL NOT NULL,
  reference_key TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(contender_id) REFERENCES race_wallets(contender_id)
);

CREATE INDEX IF NOT EXISTS idx_race_positions_open ON race_positions(contender_id,status,symbol);
CREATE INDEX IF NOT EXISTS idx_race_positions_history ON race_positions(contender_id,opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_race_ledger_history ON race_ledger(contender_id,created_at DESC);
