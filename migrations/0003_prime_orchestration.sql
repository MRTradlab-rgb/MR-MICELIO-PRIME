-- MR Micelio Prime orchestration layer. Apply after 0002_zero_autonomous_engine.sql.
ALTER TABLE engine_agents ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED'));
ALTER TABLE engine_agents ADD COLUMN mission TEXT;
ALTER TABLE engine_agents ADD COLUMN last_adapted_at TEXT;

CREATE TABLE IF NOT EXISTS engine_prime_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_type TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engine_prime_actions_created ON engine_prime_actions(created_at DESC);

CREATE TABLE IF NOT EXISTS engine_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','RUNNING','COMPLETED','REJECTED')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engine_experiments_status ON engine_experiments(status,created_at DESC);
