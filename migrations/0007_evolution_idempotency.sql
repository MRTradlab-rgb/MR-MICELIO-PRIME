-- Safely claim evaluation event IDs and one collective reward per UTC day.
-- Additive migration; existing event/reward history is preserved.
ALTER TABLE evolution_events ADD COLUMN claim_token TEXT;
CREATE TABLE IF NOT EXISTS evolution_collective_claims (
  reward_day TEXT PRIMARY KEY,
  claim_token TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);
INSERT OR IGNORE INTO evolution_collective_claims(reward_day,claim_token,claimed_at)
SELECT substr(created_at,1,10), 'legacy:' || MIN(id), MIN(created_at)
FROM evolution_rewards
WHERE reward_type='COLLECTIVE'
GROUP BY substr(created_at,1,10);
