# D1 optimization — evaluation batching

## Change
The autonomous engine now closes due forecasts in D1 batches, then writes evaluation records and aggregates agent counters in batches. Batch size is 80 statements to remain below platform statement limits. Threshold adaptation remains unchanged in principle: minimum 10 recent outcomes, bounded adjustment, and no strategy replacement.

Migration `0003_engine_evaluation_index.sql` adds an idempotent index for the adaptive-threshold query ordered by agent and newest evaluation ID.

## Important billing distinction
Batching reduces request/round-trip overhead and can improve execution time. It does **not** automatically reduce D1 rows read or written. The index may reduce rows scanned for the recent-evaluation query. Measure Cloudflare D1 metrics before/after to confirm.

## Apply
Run migration 0003 against the existing Micélio D1 database. It only adds an index; it does not delete or rewrite historical records.

## Validation
- Confirm `/engine/status` remains PAPER_ONLY and has no real-order capability.
- Run a manual autonomous tick with fresh closed candles.
- Confirm pending forecasts become CLOSED exactly once, one evaluation per forecast, and agent totals increase consistently.
- Compare D1 rows read/written and duration across equivalent cycles.
- Confirm stale/missing market data still causes symbol skips rather than fabricated prices.
