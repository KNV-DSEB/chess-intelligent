# Task 014 production gate execution plan

Task 014 executes the production-verification paths built in Task 013. It does
not promote PGlite, source inspection, or static configuration to production
evidence. Every gate below ends as `PASS`, `FAIL`, or `NOT_RUN`; a failed gate
is remediated only after reproducing the actual runtime defect.

## Gate map

| Blocked Task 013 gate           | Required environment                                                                                       | Existing command / workflow                                                                                                           | Evidence to retain                                                                                                                                                | Pass condition                                                                                                                                                                                        | Failure remediation path                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real PostgreSQL verification    | Disposable PostgreSQL 17 databases and bounded Node pools                                                  | `pnpm verify:production:database` in `CLEAN` and `UPGRADE` modes; `pnpm test:postgres`; targeted SQL and `EXPLAIN (ANALYZE, BUFFERS)` | Server/client/image versions, migration tail, constraint/index checks, representative lineage, rollback and concurrency results, pool limits, query plans         | Migrations 001–014 apply cleanly; 013→014 preserves valid lineage; failure is atomic; security/training races have one allowed outcome; plans are non-pathological                                    | Reproduce on a disposable database, fix the smallest repository/schema cause, add a real-PostgreSQL regression, rerun the affected rehearsal and query plan                           |
| Backup and separate restore     | Real PostgreSQL plus matching `pg_dump`/`pg_restore`; two distinct databases; operator-protected temp path | `pnpm db:backup`; `pnpm db:restore:verify`                                                                                            | Source/target names without credentials, timestamps, dump size, migration/count/hash manifests, restore duration, one complete identity→learning lineage query    | Custom dump restores into an empty distinct database; manifest and representative lineage match                                                                                                       | Fix only the observed backup/restore or manifest defect, add a regression where practical, create a fresh dump, and rerun a separate restore                                          |
| HTTPS cookie and proxy boundary | Built production Compose stack with Caddy internal TLS                                                     | Compose `build`/`up`; HTTPS requests through Caddy; browser login/reload/logout                                                       | Caddy/runtime versions, sanitized response headers, cookie attributes, Origin/CORS/security headers, browser network/console results                              | TLS proxy works; production `__Host-` cookie is Secure/HttpOnly/SameSite=Lax/Path=/ with no Domain; exact Origin accepted and foreign Origin rejected; no mixed content                               | Diagnose the deployed proxy/config/application boundary, make the smallest fix, add configuration/HTTP regression coverage, rebuild, and repeat the HTTPS flow                        |
| Browser security matrix         | Four independent OWNER/ADMIN/COACH/STUDENT accounts in the clean stack                                     | In-app browser plus direct HTTPS API requests through the same boundary                                                               | Allowed/denied flow matrix, direct-ID substitutions, same-Player/two-Academy result, audit/request IDs                                                            | Each role has only documented capabilities; cross-tenant and foreign-resource access fail closed; Coach creates zero Student attempts/evidence                                                        | Reproduce with independent sessions, repair the narrow authorization/tenant predicate, add integration regression, and rerun the role plus attack matrix                              |
| SMTP end to end                 | Compose Mailpit and real application SMTP adapter                                                          | Invitation and reset flows through HTTPS; Mailpit UI/API only as acceptance transport                                                 | Recipient/subject/link behavior with tokens redacted from evidence, delivery state, acceptance/reset/reuse/session-revocation results, sanitized failure/recovery | Invitation and reset mail are received and usable; membership identity is preserved; reset is generic and single-use; tokens are absent from persistence/logs/audit; outage is sanitized and recovers | Fix the observed adapter/application defect, add provider-boundary regression, restart Mailpit/SMTP, and rerun delivery plus outage flows                                             |
| Academy load benchmark          | Explicit disposable PostgreSQL benchmark database                                                          | `pnpm benchmark:academy` with deterministic seed and 20 samples                                                                       | Exact dataset counts, median/p95, plans, buffers, relation/index sizes, hardware/runtime                                                                          | Existing 1,000-Student scale runs without pathological auth/tenant queries; any learning-scale claim uses valid immutable lineage only                                                                | Repair only measured query/schema issues without weakening predicates; show before/after plans and rerun. Report exact lower valid learning scale if 10k/50k is not safely achievable |
| Real Stockfish deployment       | Compatible executable mounted behind the existing Worker UCI process boundary and real PostgreSQL          | Production Worker, Worker health command, enqueue one real analysis job, then a disposable invalid-path failure run                   | Binary/version/hash/profile/options/search budget, persisted AnalysisRun/job outcome, health/failure behavior                                                     | UCI handshake succeeds; one exact-history job persists compatible engine provenance and is readable; invalid executable fails safely while API/Web remain available                                   | Diagnose configuration/process adapter only; preserve engine-neutral contracts and GPL process-boundary documentation; add regression and rerun real and failure smokes               |

## Execution order and safety

1. Record host, Docker, PostgreSQL clients/server, browser, Caddy, SMTP, and
   Stockfish availability and versions. Attempt to start the supported Docker
   runtime if installed but stopped.
2. Use clean, upgrade, restore, and benchmark databases created only for this
   gate. Never point guarded commands at a developer or production database.
3. Build production artifacts, start PostgreSQL/Mailpit, migrate once, then
   start API, Worker, Web, and Caddy. Do not use development servers or
   automatic production migration.
4. Execute database correctness and recovery before relying on the application
   stack. Capture only sanitized evidence; raw cookies, invitation/reset tokens,
   passwords, SMTP credentials, and database URLs never enter reports or logs.
5. Execute four independent browser sessions and direct-ID attacks through the
   deployed HTTPS boundary, followed by email, failure, Stockfish, benchmark,
   and complete learning-loop smokes.
6. For each observed defect: reproduce, identify the root cause, make the
   smallest fix, add a regression, rerun the targeted gate, then rerun affected
   repository checks.
7. Update the 85-item release checklist and Task 014 report with only observed
   `PASS`, `FAIL`, or `NOT_RUN` evidence. The final decision is exactly one of
   `PRODUCTION_GATE_PASSED`, `PRODUCTION_GATE_PASSED_WITH_NON_BLOCKING_RISKS`,
   or `PRODUCTION_GATE_BLOCKED`.

## Release-decision boundary

The gate cannot pass without real PostgreSQL core operation, a separately
verified restore, deployed HTTPS/cookie and browser authorization evidence,
real invitation/reset delivery, a non-pathological benchmark, a full Academy
learning smoke, and one real Stockfish job in the intended process topology.
Unavailable infrastructure remains `NOT_RUN`; it is never inferred from
configuration or substituted with PGlite.
