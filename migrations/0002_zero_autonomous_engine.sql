-- MR TradLab ZERO autonomous paper engine; no order or wallet tables.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS engine_agents (
  agent_id TEXT PRIMARY KEY,
  archetype TEXT NOT NULL CHECK(archetype IN ('CONSERVADOR','EXPLORADOR')),
  strategy TEXT NOT NULL,
  threshold REAL NOT NULL,
  total_forecasts INTEGER NOT NULL DEFAULT 0,
  closed_forecasts INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  net_return_sum REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS engine_market_candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  open_time INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  close_time INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(symbol,open_time)
);
CREATE TABLE IF NOT EXISTS engine_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_key TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  candle_open_time INTEGER NOT NULL,
  target_open_time INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('BUY','SELL')),
  entry_price REAL NOT NULL,
  strategy TEXT NOT NULL,
  score REAL NOT NULL,
  confidence REAL NOT NULL,
  regime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CLOSED')),
  exit_price REAL,
  gross_return REAL,
  net_return REAL,
  outcome TEXT CHECK(outcome IN ('WIN','LOSS')),
  created_at TEXT NOT NULL,
  evaluated_at TEXT,
  FOREIGN KEY(agent_id) REFERENCES engine_agents(agent_id)
);
CREATE TABLE IF NOT EXISTS engine_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_id INTEGER NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  net_return REAL NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('WIN','LOSS')),
  evaluated_at TEXT NOT NULL,
  FOREIGN KEY(forecast_id) REFERENCES engine_forecasts(id),
  FOREIGN KEY(agent_id) REFERENCES engine_agents(agent_id)
);
CREATE TABLE IF NOT EXISTS engine_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  symbols_ok INTEGER NOT NULL,
  symbols_failed INTEGER NOT NULL,
  forecasts_created INTEGER NOT NULL,
  forecasts_evaluated INTEGER NOT NULL,
  details TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engine_forecasts_pending ON engine_forecasts(status,symbol,target_open_time);
CREATE INDEX IF NOT EXISTS idx_engine_forecasts_agent ON engine_forecasts(agent_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_evaluations_agent ON engine_evaluations(agent_id,evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_runs_date ON engine_runs(run_at DESC);
