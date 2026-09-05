# Task 013 — Production Verification, Deployment & Operational Readiness Gate V1 plan

## Pre-implementation trace

The checked-in Graphify graph predates Task 012. Its useful production path is:

```text
apps/worker/src/worker.ts
  → PgDatabase
  → runMigrations
  → AnalysisRepository
  → AnalysisWorker
  → StockfishUciEngine

apps/api/src/server.ts
  → PgDatabase
  → runMigrations
  → buildApp
```

The graph has no Session, User, Membership, Invitation, PasswordReset, or AuditEvent vocabulary. Direct source inspection is authoritative for these paths:

```text
cookie → AuthApplicationService → AuthRepository → auth_sessions → User
User → AcademySecurityApplicationService → AcademyAccessRepository → active Membership
User → Invitation → Membership
Student membership → StudentProfile → Player → assigned TrainingItem → TrainingAttempt
Academy mutation → SecurityAuditRepository → append-only security_audit_events
```

The Graphify query is preserved under `graphify-out/memory/` and explicitly records this coverage gap.

## Current deploy topology

The repository currently has a development Compose file with PostgreSQL 17 and an unused Redis service. API, Worker, and Web run as host processes. There are no Dockerfiles, reverse proxy, TLS boundary, SMTP adapter, production Compose profile, or deployable container health checks.

Current startup behavior:

- API and Worker both run migrations with their runtime database credential.
- API exposes only `GET /health`, which proves process liveness but not database/schema readiness.
- Web uses `NEXT_PUBLIC_API_URL`; development examples point to localhost.
- Worker requires a real `STOCKFISH_PATH` and uses the external UCI process boundary.
- PostgreSQL uses a bounded `pg.Pool`, but pool size and timeout configuration are implicit library defaults.

## Required processes and state

Production-like V1 needs:

1. Caddy as the only public HTTP/TLS boundary;
2. built Next.js Web;
3. Fastify API;
4. analysis Worker;
5. real PostgreSQL with a persistent volume;
6. an explicit one-shot migration process;
7. SMTP, with Mailpit only for local acceptance;
8. Stockfish mounted/configured only when engine jobs are enabled.

PostgreSQL is the only mandatory stateful application dependency. Backups are sensitive operator artifacts and must remain outside Git. SMTP and Stockfish are external operational dependencies, not sources of application identity or chess truth.

## Secrets and configuration

Production must supply database credentials, exact allowed web origins, public Web URL, Secure-cookie mode, SMTP credentials when delivery is enabled, and a valid Stockfish path for the Worker. There are no functional production password, token, SMTP, or TLS-key defaults. Raw session, invitation, and reset tokens must never enter persistence, logs, audit metadata, or benchmark output.

## Migration and recovery

Migrations `001 → 013` exist. Task 013 requires migration 014 for password-reset and delivery state. Clean and upgrade rehearsals must use real PostgreSQL. Every migration remains transactional and is recorded only after its transaction succeeds.

Rollback is not represented by unsafe reverse SQL. The V1 response is:

```text
pre-migration pg_dump (custom format)
  + application deployment rollback
  + pg_restore into a separate database when schema restoration is required
```

A backup is unverified until restore plus deterministic row-count/relationship checks succeed.

## Health and observability gap

Fastify supplies request IDs and structured Pino logs when enabled, but the current error handler can serialize unexpected errors directly. Task 013 will add sanitized 5xx responses, explicit secret redaction, response correlation IDs, security headers, `/livez`, and database/schema-aware `/readyz`. Dependency errors must never become authorization success.

## Email and password-reset gap

Task 012 returns invitation tokens to the caller because delivery is manual, and password reset is absent. Task 013 will add a provider-neutral email contract, generic SMTP adapter, delivery provenance, generic non-enumerating reset requests, 60-minute hash-only single-use reset tokens, and transactional password replacement plus session revocation.

## Initial release blockers

At implementation start these gates are open:

- real PostgreSQL clean/upgrade/concurrency/query-plan verification;
- verified pg_dump → separate pg_restore integrity rehearsal;
- actual HTTPS proxy and Secure `__Host-` cookie verification;
- real-browser OWNER/ADMIN/COACH/STUDENT authorization matrix;
- SMTP invitation/reset acceptance;
- 1,000-Student Academy benchmark against real PostgreSQL;
- real deployed Worker/Stockfish smoke;
- post-Task-012 Graphify update.

Unit/PGlite success cannot close these gates. Task 013 will provide reproducible tooling and record actual `PASS`, `FAIL`, or `NOT_RUN` evidence without downgrading missing deployment evidence to implementation success.
