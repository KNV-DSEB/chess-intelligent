---
type: "query"
date: "2026-09-12T03:09:57.094515+00:00"
question: "Trace Pilot 001B deployment, database recovery, session, SMTP, and Worker dependencies"
contributor: "graphify"
outcome: "useful"
source_nodes: ["deployment-runbook.md", "migrations.ts", "backup-cli.ts", "registerCsrfOriginBoundary()", "SmtpEmailDeliveryProvider", "worker", "stockfish-uci-engine.ts"]
---

# Q: Trace Pilot 001B deployment, database recovery, session, SMTP, and Worker dependencies

## Answer

Expanded from implementation navigation via graph vocab: [deployment, production, runtime, worker, stockfish, postgres, migrations, backup, smtp, cookie, cors, origin]. Traversal identified deployment-runbook.md, migrations.ts, backup-cli.ts, registerCsrfOriginBoundary(), SmtpEmailDeliveryProvider, worker.ts, and stockfish-uci-engine.ts. Source verification found the Pilot blockers in production-verification-cli.ts, database-operations.ts, postgres-verification.test.ts, and the single-host production topology. The integration boundary preserves Vercel as Web-only, Caddy/Fastify/Worker/Stockfish as long-lived backend workloads, managed PostgreSQL as server-only, exact Web Origin for credentialed CORS/CSRF, and API-host-only Secure cookies.

## Outcome

- Signal: useful

## Source Nodes

- deployment-runbook.md
- migrations.ts
- backup-cli.ts
- registerCsrfOriginBoundary()
- SmtpEmailDeliveryProvider
- worker
- stockfish-uci-engine.ts