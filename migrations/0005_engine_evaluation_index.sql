-- Optimize the agent's recent-evaluation lookup used by adaptive thresholds.
-- Safe/idempotent: adds an index only; preserves all forecast/evaluation history.
CREATE INDEX IF NOT EXISTS idx_engine_evaluations_agent_recent
  ON engine_evaluations(agent_id, id DESC);
