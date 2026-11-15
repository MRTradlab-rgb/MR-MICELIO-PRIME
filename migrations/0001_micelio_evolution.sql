-- MR Micélio Prime: MICÉLIO EVOLUTION
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS evolution_agents (
  agent_id TEXT PRIMARY KEY,
  archetype TEXT NOT NULL CHECK(archetype IN ('CONSERVADOR','EXPLORADOR')),
  specialty TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  cox_balance INTEGER NOT NULL DEFAULT 0 CHECK(cox_balance >= 0),
  total_predictions INTEGER NOT NULL DEFAULT 0,
  correct_predictions INTEGER NOT NULL DEFAULT 0,
  repeated_errors INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evolution_missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT,
  team_key TEXT,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  target_json TEXT NOT NULL,
  reward_cox INTEGER NOT NULL DEFAULT 0 CHECK(reward_cox >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','FAILED','CANCELLED')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(agent_id) REFERENCES evolution_agents(agent_id)
);

CREATE TABLE IF NOT EXISTS evolution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_event_id TEXT UNIQUE,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(agent_id) REFERENCES evolution_agents(agent_id)
);

CREATE TABLE IF NOT EXISTS evolution_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT,
  reward_type TEXT NOT NULL CHECK(reward_type IN ('INDIVIDUAL','COLLECTIVE')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(agent_id) REFERENCES evolution_agents(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_evolution_agents_rank ON evolution_agents(level DESC, xp DESC, cox_balance DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_missions_status ON evolution_missions(status);
CREATE INDEX IF NOT EXISTS idx_evolution_events_agent ON evolution_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_rewards_created ON evolution_rewards(created_at DESC);
