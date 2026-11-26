---
name: security-review
description: Review MR Micélio Prime, Cloudflare Worker endpoints, AI action execution, secrets, CORS, and data exposure before changes or releases.
---

# Security Review

- Never commit secrets, API keys, private keys, tokens, credentials, or customer data.
- Keep real trading disabled; no order endpoint, wallet access, or private exchange keys.
- Validate method, route, payload size, JSON shape, enum values, IDs, and strings at every write endpoint.
- Admin endpoints must fail closed and require server-side secrets. Never put admin tokens in browser code.
- Review CORS origins, rate limiting, abuse controls, and authentication on public write/AI endpoints.
- AI output is untrusted: parse JSON, allowlist action types, validate each parameter, and log outcomes without sensitive payloads.
- Ensure background promises are awaited or attached to ctx.waitUntil.
- Check idempotency, replay protection, and race conditions in event/evaluation writes.
- Give findings severity, file/line evidence, exploit path, and a minimal remediation; do not deploy fixes without validation.
