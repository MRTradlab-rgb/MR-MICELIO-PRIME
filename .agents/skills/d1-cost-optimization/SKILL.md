---
name: d1-cost-optimization
description: Optimize Cloudflare D1 reads, writes, indexes, retention, and batching in MR Micélio Prime without losing historical learning data.
---

# D1 Cost Optimization

- Start by measuring query frequency and rows read/written; distinguish statement count from billed row operations.
- Preserve all existing tables and history. No destructive migrations, DROP, reset, or truncation.
- Use indexes that match WHERE, JOIN, and ORDER BY patterns; justify each index by an observed query.
- Use D1 batch for groups of independent statements and chunk below platform limits.
- Keep SELECTs narrow and bounded; avoid unbounded history reads and unnecessary payload columns.
- Prefer idempotent migrations (CREATE INDEX IF NOT EXISTS) and verify schema compatibility.
- Avoid duplicate writes/events with stable idempotency keys.
- For any optimization, explain whether it reduces billed rows, latency, or both. Never claim batching alone reduces billed row counts.
