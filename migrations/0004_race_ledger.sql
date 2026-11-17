-- 0003 created an earlier provisional race schema. Preserve it under legacy names
-- before creating the canonical schema below; no rows are dropped.
ALTER TABLE race_ledger RENAME TO race_ledger_legacy;
ALTER TABLE race_positions RENAME TO race_positions_legacy;
ALTER TABLE race_wallets RENAME TO race_wallets_legacy;
ALTER TABLE race_state RENAME TO race_state_legacy;

-- MR TradLab ZERO canonical race ledger schema. Additive: preserves engine/evolution history.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS race_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','RUNNING','STOPPED','FINISHED')),
  started_at TEXT,
  stopped_at TEXT,
  winner TEXT,
  target_usd REAL NOT NULL DEFAULT 1000 CHECK(target_usd > 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS race_wallets (
  competitor TEXT PRIMARY KEY CHECK(competitor IN ('gemma-prime','micelio-ensemble')),
  cash_usd REAL NOT NULL CHECK(cash_usd >= 0),
  initial_cash_usd REAL NOT NULL DEFAULT 10 CHECK(initial_cash_usd > 0),
  realized_pnl REAL NOT NULL DEFAULT 0,
  fees_paid REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS race_positions (
  competitor TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  qty REAL NOT NULL CHECK(qty > 0),
  avg_entry_price REAL NOT NULL CHECK(avg_entry_price > 0),
  realized_pnl REAL NOT NULL DEFAULT 0,
  entry_fee_usd REAL NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(competitor,symbol),
  FOREIGN KEY(competitor) REFERENCES race_wallets(competitor)
);

CREATE TABLE IF NOT EXISTS race_trades (
  id TEXT PRIMARY KEY,
  competitor TEXT NOT NULL,
  exec_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL','HOLD')),
  qty REAL NOT NULL DEFAULT 0 CHECK(qty >= 0),
  price REAL NOT NULL CHECK(price > 0),
  fee_usd REAL NOT NULL DEFAULT 0 CHECK(fee_usd >= 0),
  slippage_usd REAL NOT NULL DEFAULT 0 CHECK(slippage_usd >= 0),
  realized_pnl REAL NOT NULL DEFAULT 0,
  market_ts INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  decision_id TEXT,
  FOREIGN KEY(competitor) REFERENCES race_wallets(competitor)
);
CREATE INDEX IF NOT EXISTS idx_race_trades_competitor_time ON race_trades(competitor,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_race_trades_symbol_time ON race_trades(symbol,market_ts DESC);

CREATE TABLE IF NOT EXISTS race_decisions (
  id TEXT PRIMARY KEY,
  competitor TEXT NOT NULL,
  exec_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('BUY','SELL','HOLD')),
  rationale TEXT NOT NULL,
  agent_ids TEXT NOT NULL DEFAULT '[]',
  consensus TEXT NOT NULL DEFAULT '{}',
  market_price REAL NOT NULL CHECK(market_price > 0),
  market_ts INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(competitor) REFERENCES race_wallets(competitor)
);
CREATE INDEX IF NOT EXISTS idx_race_decisions_competitor_time ON race_decisions(competitor,created_at DESC);

CREATE TABLE IF NOT EXISTS race_agent_signals (
  id TEXT PRIMARY KEY,
  exec_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal TEXT NOT NULL CHECK(signal IN ('BUY','SELL','HOLD')),
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  strategy TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_race_signals_agent_time ON race_agent_signals(agent_id,created_at DESC);

CREATE TABLE IF NOT EXISTS race_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor TEXT NOT NULL,
  equity_usd REAL NOT NULL,
  cash_usd REAL NOT NULL CHECK(cash_usd >= 0),
  unrealized_pnl REAL NOT NULL,
  drawdown_pct REAL NOT NULL DEFAULT 0,
  market_ts INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(competitor) REFERENCES race_wallets(competitor)
);
CREATE INDEX IF NOT EXISTS idx_race_snapshots_competitor_time ON race_snapshots(competitor,created_at DESC);

INSERT OR IGNORE INTO race_state(id,status,target_usd,updated_at) VALUES(1,'NOT_STARTED',1000,datetime('now'));
INSERT OR IGNORE INTO race_wallets(competitor,cash_usd,initial_cash_usd,updated_at)
VALUES ('gemma-prime',10,10,datetime('now')),('micelio-ensemble',10,10,datetime('now'));
