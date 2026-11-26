-- Prevent overlapping scheduled/manual engine ticks.
-- Safe additive migration; no historical data is removed.
CREATE TABLE IF NOT EXISTS engine_tick_lock (
  lock_id INTEGER PRIMARY KEY CHECK (lock_id = 1),
  owner_token TEXT NOT NULL,
  lock_until_ms INTEGER NOT NULL DEFAULT 0
);
