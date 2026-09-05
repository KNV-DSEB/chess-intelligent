# Task 015 production release checklist

Evidence window: 2026-09-03 through 2026-09-05 (Asia/Bangkok).

`PASS` means the gate was observed through its qualifying automated, real
PostgreSQL, HTTPS, browser, SMTP, Worker, or engine boundary. `NOT_RUN` means
the complete qualifying boundary was not executed; partial evidence is stated
but is not promoted. `FAIL` would mean an observed defect remains unresolved.
All observed defects were remediated and rerun, so there are no unresolved
`FAIL` rows.

|   # | Gate                                  | Result  | Task 015 evidence / limitation                                                                                       |
| --: | ------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
|   1 | Prettier                              | PASS    | final `pnpm check`                                                                                                   |
|   2 | ESLint                                | PASS    | final `pnpm check`                                                                                                   |
|   3 | strict TypeScript                     | PASS    | all eight workspace projects                                                                                         |
|   4 | full regression                       | PASS    | 37 files / 185 tests passed; 5 files / 6 opt-in tests skipped                                                        |
|   5 | production build                      | PASS    | optimized Next.js build plus API/Worker/package builds                                                               |
|   6 | clean real PostgreSQL migration       | PASS    | PostgreSQL 17.11, migrations 001–014, latest schema and critical tables verified                                     |
|   7 | upgrade migration                     | PASS    | separate 001–013 fixture upgraded to 014 with identity and learning lineage preserved                                |
|   8 | backup                                | PASS    | custom-format dump, 289,241 bytes, explicit disposable source                                                        |
|   9 | restore                               | PASS    | restored into distinct empty `task014_learning_restore_20260903` database                                            |
|  10 | restore integrity                     | PASS    | migration/count/stable-ID manifests and representative full lineage matched                                          |
|  11 | failed-migration rehearsal            | PASS    | failed transaction left no object or successful migration row                                                        |
|  12 | PostgreSQL query plans                | PASS    | benchmark plans plus compatible SkillGraph and TrainingItem ownership plans reviewed                                 |
|  13 | PostgreSQL connection pool            | PASS    | bounded API 10 / Worker 5 pools; idle error handling verified                                                        |
|  14 | transaction failure rollback          | PASS    | real PostgreSQL transaction rollback verified                                                                        |
|  15 | invitation concurrency                | PASS    | one 201, one 409, exactly one accepted identity claim                                                                |
|  16 | TrainingAttempt concurrency           | PASS    | distinct immutable attempt numbers/evidence; retry correlation retained                                              |
|  17 | last-owner concurrency                | PASS    | concurrent demotions both 409; one active Owner remained                                                             |
|  18 | password-reset concurrency            | PASS    | one 200 and one 400 for the same fresh token                                                                         |
|  19 | HTTPS deployment                      | PASS    | built Web/API behind Caddy 2.11.4 internal TLS; not public-certificate proof                                         |
|  20 | Secure cookie real header             | PASS    | real `Set-Cookie` contained Secure                                                                                   |
|  21 | HttpOnly                              | PASS    | real `Set-Cookie` and Chrome cookie store                                                                            |
|  22 | SameSite                              | PASS    | SameSite=Lax observed                                                                                                |
|  23 | `__Host-` semantics                   | PASS    | `__Host-chess_session`, Path=/, no Domain                                                                            |
|  24 | allowed Origin                        | PASS    | exact configured HTTPS Origin accepted                                                                               |
|  25 | denied Origin                         | PASS    | foreign Origin mutation returned 403                                                                                 |
|  26 | CORS                                  | PASS    | exact ACAO with credentials; no credentialed wildcard                                                                |
|  27 | security headers                      | PASS    | nosniff, Referrer-Policy, and frame/CSP behavior observed                                                            |
|  28 | mixed-content check                   | PASS    | Chrome recorded no HTTP API request or mixed-content failure                                                         |
|  29 | Owner browser flow                    | PASS    | isolated Chrome context: roster/detail, invitation, assignment, membership, last-Owner, reload/logout                |
|  30 | Admin browser flow                    | PASS    | isolated Chrome context: roster/detail, invitation, assignment, membership lifecycle, Owner denial                   |
|  31 | Coach browser flow                    | PASS    | isolated Chrome context: roster/detail/progress, assignment/cancel, management and impersonation denials             |
|  32 | Student browser flow                  | PASS    | isolated Chrome context: own assignment/item/attempt; accepted move hidden before scoring; all foreign access denied |
|  33 | Student self ownership                | PASS    | own item/attempt allowed; other Student and Academy resources denied                                                 |
|  34 | Coach impersonation denial            | PASS    | direct Student-attempt attack returned 403 and created zero measurement rows                                         |
|  35 | cross-tenant IDOR denial              | PASS    | foreign Academy/Student/resource identifiers failed closed                                                           |
|  36 | same-Player/two-Academy isolation     | PASS    | one Player linked into two Academies without tenancy collapse                                                        |
|  37 | session persistence                   | PASS    | real Chrome login and reload remained authenticated                                                                  |
|  38 | logout                                | PASS    | Chrome removed cookie and `auth/me` returned 401 after remediation                                                   |
|  39 | session revocation                    | PASS    | password reset revoked old session; old cookie denied                                                                |
|  40 | password change                       | PASS    | credential replacement accepted new password and rejected old password                                               |
|  41 | consent pending                       | PASS    | real Student attempt blocked                                                                                         |
|  42 | consent grant                         | PASS    | real Student attempt allowed                                                                                         |
|  43 | consent revoke                        | PASS    | future attempt blocked; historical evidence retained                                                                 |
|  44 | invitation email                      | PASS    | Mailpit 1.30.0 received real application message                                                                     |
|  45 | invitation acceptance                 | PASS    | token worked once; membership identity preserved; concurrent reuse rejected                                          |
|  46 | invitation token redaction            | PASS    | raw token absent from response, database, logs, and audit metadata                                                   |
|  47 | password reset request                | PASS    | known/unknown accounts returned identical generic 202                                                                |
|  48 | password reset email                  | PASS    | Mailpit delivered correct known-account reset message                                                                |
|  49 | password reset completion             | PASS    | fresh token changed Argon2id credential                                                                              |
|  50 | password reset reuse rejection        | PASS    | concurrent and subsequent reuse rejected                                                                             |
|  51 | password reset old-session revocation | PASS    | old session/password denied; new login passed                                                                        |
|  52 | SMTP failure behavior                 | PASS    | sanitized invitation 503, enumeration-safe reset, FAILED state, recovery verified                                    |
|  53 | audit events                          | PASS    | 128 runtime rows include 30 denials, 3 cross-tenant denials, auth, invitation, reset, assignment, and consent        |
|  54 | audit secret redaction                | PASS    | secret scan found zero raw password/token/cookie values                                                              |
|  55 | `/livez`                              | PASS    | 200 during normal service and PostgreSQL outage                                                                      |
|  56 | `/readyz`                             | PASS    | 200 current, 503 during outage, 200 after recovery                                                                   |
|  57 | PostgreSQL outage readiness           | PASS    | API stayed alive after remediation; protected request failed closed                                                  |
|  58 | structured logging                    | PASS    | sanitized pool/SMTP/engine failures and redacted request fields                                                      |
|  59 | request IDs                           | PASS    | deployed response headers and request-linked runtime audit events; non-HTTP bootstrap events remain explicit         |
|  60 | config validation                     | PASS    | insecure production cookie/routes/origin/database combinations rejected by focused suite                             |
|  61 | production internal-route rejection   | PASS    | deployed `/api/analysis/jobs` returned 404                                                                           |
|  62 | secret audit                          | PASS    | application/Caddy logs, audit metadata, and database scanned                                                         |
|  63 | dependency security audit             | NOT_RUN | fresh npm audit would disclose the private dependency manifest externally and was not authorized                     |
|  64 | benchmark 1,000 Students              | PASS    | real PostgreSQL: 1,000 Students, 50 staff, sessions/invitations/reset/audit scale                                    |
|  65 | roster query behavior                 | PASS    | first-page p95 0.777 ms; offset-900 p95 1.371 ms; no N+1                                                             |
|  66 | Student Intelligence query behavior   | PASS    | indexed identity p95 0.695 ms plus deployed Student/Coach reads                                                      |
|  67 | session lookup behavior               | PASS    | token-hash index, p95 0.745 ms                                                                                       |
|  68 | audit query behavior                  | PASS    | Academy audit index, p95 0.416 ms                                                                                    |
|  69 | Training/Assignment smoke             | PASS    | production-like HTTPS Assignment→Attempt→Evidence loop                                                               |
|  70 | SkillGraph refresh smoke              | PASS    | explicit V2 refresh selected three item-correlated training contributions                                            |
|  71 | Task 010 regression                   | PASS    | final full suite                                                                                                     |
|  72 | Task 011 regression                   | PASS    | final full suite and date-stable assignment fixture                                                                  |
|  73 | Task 012 security regression          | PASS    | final full suite plus deployed HTTPS attacks                                                                         |
|  74 | real Stockfish smoke if available     | PASS    | Compose Worker Stockfish 18 run, 4/4 exact-history states, immutable binary/profile provenance                       |
|  75 | Worker smoke                          | PASS    | real PostgreSQL claim/analysis, invalid-engine failure, and outage retry with restart count zero                     |
|  76 | Graphify update if possible           | PASS    | code-only update: 2,516 nodes / 5,375 edges / 137 communities; 37 docs skipped without an LLM key                    |
|  77 | route-access catalog review           | PASS    | production routes and reset/health boundaries retained                                                               |
|  78 | threat model update                   | PASS    | Task 013 controls validated by Task 014 runtime attacks; remaining gaps recorded                                     |
|  79 | deployment runbook                    | PASS    | host acceptance followed documented built-service boundary; Compose limitation recorded                              |
|  80 | migration runbook                     | PASS    | clean/upgrade/failure/backup/restore workflows executed                                                              |
|  81 | incident runbook                      | PASS    | PostgreSQL, SMTP, and Stockfish failure/recovery paths exercised                                                     |
|  82 | release checklist                     | PASS    | this observed-status document                                                                                        |
|  83 | production gate report                | PASS    | Task 015 report closes the Task 014 Compose and four-role browser blockers                                           |
|  84 | `PROJECT_CONTEXT.md`                  | PASS    | exact final status, evidence, and non-blocking risks updated                                                         |
|  85 | `AGENTS.md`                           | PASS    | compiled-image, explicit ontology startup, and engine binary compatibility invariants added                          |
|  86 | production Compose topology           | PASS    | eight-service topology booted; only proxy published ports; migration/ontology exited 0; long-lived services healthy  |

The checklist is intentionally not converted into a percentage. The only
`NOT_RUN` row is dependency audit row 63 because external manifest disclosure
was not authorized. The production Compose and four-role browser blockers are
closed. The exact decision is:

```text
PRODUCTION_GATE_PASSED_WITH_NON_BLOCKING_RISKS
```

The remaining Docker Desktop host issue, public-certificate/provider evidence,
and dependency-audit authorization are documented as non-blocking risks in the
Task 015 report rather than silently promoted to evidence.
