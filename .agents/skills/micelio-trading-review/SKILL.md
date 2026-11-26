---
name: micelio-trading-review
description: Review MR TradLab/Micélio paper-trading strategies, forecasts, evaluation, learning, and risk metrics. Use before changing engine behavior or interpreting performance.
---

# Micélio Trading Review

- Preserve PAPER_ONLY. No exchange orders, wallet access, real-money execution, or private keys.
- Never treat accuracy alone as evidence of profitability. Review net return after fees/slippage, expectancy, drawdown, sample size, stability by symbol and regime, and out-of-sample behavior.
- Forecasts must be based only on closed, validated candles and fresh live market data. If data is missing or stale, skip that symbol; never synthesize prices.
- Preserve agent identities, archetypes, historical forecasts, and evaluations. Do not erase or reset learning history.
- Verify idempotency keys and pending/closed state transitions before changing evaluation code.
- Review strategy threshold adaptation for bounded changes, minimum samples, and no automatic strategy swapping.
- Treat AI recommendations as proposals; action execution must use an allowlist and explicit validation.
- Report exact evidence, limitations, and tests. Separate facts, hypotheses, and recommendations.
