# Task 013 production gate report

Evidence timestamp: 2026-08-30, Asia/Bangkok. Repository working tree under test: `D:\STARTUP\chess-intelligent`.

## Decision

`PRODUCTION_GATE_BLOCKED`

The implementation subset is verified, but this host cannot provide the conditional-blocker evidence required by Task 013: real PostgreSQL clean/upgrade/concurrency/query plans, an actual backup and separate restore, deployed HTTPS cookies and Origin/CORS behavior, or the four-role browser security matrix. No unit/PGlite result is promoted to production-operation evidence.

## Environment

| Component               | Actual evidence                                           |
| ----------------------- | --------------------------------------------------------- |
| Host                    | Windows, Asia/Bangkok                                     |
| Node.js                 | v24.11.1                                                  |
| pnpm                    | 11.19.0                                                   |
| Docker client           | 29.2.1                                                    |
| Docker Compose          | v5.1.0; production profile parses successfully            |
| Docker daemon           | Unavailable: access to `docker_engine` denied/unavailable |
| PostgreSQL server       | `NOT_RUN`; no reachable server                            |
| PostgreSQL client tools | `pg_dump`, `pg_restore`, and `psql` not found             |
| Browser acceptance      | `NOT_RUN`; no production-like HTTPS services              |
| Stockfish               | executable not found                                      |

## Repository verification

| Check                  | Result                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier               | PASS                                                                                                                                  |
| ESLint                 | PASS                                                                                                                                  |
| strict TypeScript      | PASS across eight workspace projects                                                                                                  |
| regression suite       | PASS: 34 files / 178 tests; 4 files / 5 tests intentionally skipped                                                                   |
| Task 013 focused suite | PASS: invitation delivery/redaction, reset lifecycle/race, enumeration/throttle, SMTP failure, health/headers, dependency fail-closed |
| production build       | PASS: Next.js optimized build plus API/Worker/package builds                                                                          |
| Compose parse          | PASS (static only)                                                                                                                    |
| dependency audit       | PASS: official npm audit reports no known vulnerabilities after upgrading Nodemailer to 9.0.1                                         |
| static secret/log scan | PASS: no credential/private-key/token-to-log pattern found in application/package TypeScript                                          |

The full final verification command is `pnpm check`; the production build is `pnpm build`. This is implementation verification, not deployment verification.

## PostgreSQL and migration evidence

- PGlite applies migrations `001` through `014`, including password-reset and invitation-delivery state.
- `verify:production:database` supports explicitly acknowledged `CLEAN` and `UPGRADE` targets, validates current schema/critical tables, exercises transaction rollback, and simulates a failed migration transaction without persisting its object or migration row.
- CI provisions PostgreSQL for its targeted integration path.
- Actual server version, clean result, upgrade preservation, PostgreSQL concurrency behavior, pool behavior, and query plans are all `NOT_RUN` on this host.

## Backup and restore evidence

- `db:backup` requires `DATABASE_BACKUP_CONFIRM=YES`, an explicit source URL, and an explicit `.dump` target. It uses custom-format `pg_dump` and writes a count/stable-ID manifest.
- `db:restore:verify` requires a distinct empty database, restores with `--exit-on-error`, and compares migration/count/hash manifests across representative chess, evidence, learning, Academy, identity, session, invitation/reset, consent, and audit tables.
- No dump was produced and no restore was performed because PostgreSQL and its client tools were unavailable.
- Restore time, RPO, and RTO: `NOT_MEASURED`; no guarantee is claimed.

## HTTPS, proxy, and browser evidence

- Static topology: Caddy → Web/API; API/PostgreSQL/Worker remain on an internal network. Caddy's `tls internal` is local acceptance configuration, not public-certificate proof.
- Production config rejects insecure cookies, internal routes, implicit migrations, absent exact origins/public URL, and absent SMTP.
- Fastify injection verifies Secure/HttpOnly/SameSite/`__Host-` header construction, exact Origin denial, explicit credentialed CORS, request IDs, and security headers.
- Actual reverse-proxy forwarded headers, HTTPS `Set-Cookie`, browser cookie persistence/revocation, mixed content, console, responsive visual QA, and accessibility smoke are `NOT_RUN`.
- OWNER, ADMIN, COACH, and STUDENT browser flows are all `NOT_RUN`; so are deployed direct-ID, same-Player/two-Academy, Coach impersonation, consent, and session-expiry attacks.

## Email and password reset evidence

- `EmailDeliveryProvider` has disabled and generic SMTP adapters. Production invitation creation does not return the token; recording-provider tests prove only a digest is persisted and delivery audit actions contain no token.
- SMTP failure tests prove invitation delivery returns a sanitized controlled failure, reset requests remain enumeration-resistant, and failed state is persisted.
- Password reset uses 256-bit request-local tokens, SHA-256 digests, one-hour expiry, three requests/hour identifier throttling, atomic single-use consumption, Argon2id credential replacement, other-token revocation, and all-session revocation.
- PGlite concurrent completion produces one success and one rejection; old session and old password fail, new password succeeds, and reuse fails.
- Mailpit or real SMTP connection, received message contents, link opening, and full browser invitation/reset acceptance are `NOT_RUN`.

## Health and failure evidence

- `/livez` remains dependency-free.
- `/readyz` requires database connectivity and migration `014`; it returns 503 for the unavailable dependency double.
- Authentication failure against an unavailable database is sanitized and does not fail open.
- Pino redacts authorization/cookie/set-cookie/password/raw-token fields and invitation bearer URL segments. Responses carry bounded request IDs and browser security headers.
- A real PostgreSQL stop/recover smoke and a real Worker health transition are `NOT_RUN`.

## Academy benchmark and Worker evidence

- The benchmark command requires an acknowledged database whose name contains `benchmark` or `task013`. Its deterministic seed/query harness covers 1,000 Students, 50 staff, sessions, invitations, reset observations, and audit events; it emits 20-sample median/p95, `EXPLAIN (ANALYZE, BUFFERS)`, counts, and relation/index sizes.
- It reports actual assignments/attempts and does not invent the requested 10,000/50,000 learning-lineage rows. That full lineage dataset remains incomplete.
- Benchmark latency, plans, storage, and bottlenecks are `NOT_RUN`.
- Worker/engine contracts and fake-engine regressions pass. A real Stockfish executable/job in the deployment topology is `NOT_RUN` and classified `REAL_STOCKFISH_DEPLOYMENT_VERIFICATION_PENDING`.

## Graphify evidence

- The installed Graphify runtime was repaired from a broken 0.9.30 installation to 0.9.52 and supplied with its SQL parser outside the product dependency graph.
- Incremental code+SQL extraction succeeded: 2,358 nodes, 5,193 edges, 128 communities. `GRAPH_REPORT.md`, `graph.json`, and `graph.html` were regenerated; `graphify reflect` recorded six useful memories.
- Extracted paths confirm `PasswordResetApplicationService → constructor → PasswordResetRepository`, `SmtpEmailDeliveryProvider ← email-delivery.ts ← app.ts → PasswordResetRepository`, and `buildApp ← app.ts → db/index.ts → LATEST_MIGRATION_NAME`.
- Migration 014 and its `password_reset_requests` / `password_reset_tokens` table nodes are present. Dynamic filesystem migration discovery does not produce a direct AST path from the verification CLI to the SQL file, so that boundary remains validated by direct source inspection and tests.
- The 33 changed Markdown documents were not semantically re-extracted because no supported semantic backend was configured and multi-agent semantic extraction was unavailable under the active execution policy. Code/SQL graph update is complete; document graph content may be stale. This is not a production release blocker.

## Blocking issues

1. Real PostgreSQL clean install, upgrade, failure, concurrency, connection, and query-plan verification has not run.
2. No real `pg_dump` backup has been restored and integrity-compared in a separate PostgreSQL database.
3. The HTTPS reverse-proxy boundary and real session cookie have not run.
4. The OWNER/ADMIN/COACH/STUDENT browser security matrix and deployed tenant/impersonation attacks have not run.
5. Mailpit/SMTP end-to-end invitation and password-reset acceptance has not run.
6. The representative benchmark lacks the requested 10,000 Assignment / 50,000 Attempt / TrainingEvidence lineage dataset and has not run on PostgreSQL.

Stockfish deployment remains pending but is reported separately because Task 013 permits honest classification when unavailable. Graphify status is updated after the final graph attempt and is not independently a release blocker.

## Non-blocking V1 risks after the blockers are closed

- no MFA or SSO;
- no formal penetration test;
- Academy-attested guardian consent is not verified guardian identity or a legal-compliance claim;
- no durable asynchronous email queue/provider retry;
- runtime application and migration currently share a database owner role in the Compose profile;
- no contractual RPO/RTO and no repository-provided backup encryption;
- limited deterministic concept/training coverage and no advanced observability stack.
