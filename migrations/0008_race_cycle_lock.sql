-- Serialize manual and scheduled paper-race cycles to avoid duplicate virtual trades.
-- Additive migration; does not alter wallet or trade history.
CREATE TABLE IF NOT EXISTS race_cycle_lock (
  lock_id INTEGER PRIMARY KEY CHECK (lock_id = 1),
  owner_token TEXT NOT NULL,
  lock_until_ms INTEGER NOT NULL DEFAULT 0
);
