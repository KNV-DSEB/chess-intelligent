# Task 014 production gate execution report

Evidence window: 2026-09-03 through 2026-09-04, Asia/Bangkok. Repository
working tree under test: `D:\STARTUP\chess-intelligent`.

This report supersedes the runtime conclusions in the Task 013 production gate
report. Task 013 remains the record of the verification infrastructure that
existed before these gates were executed.

## Gate result

```text
PRODUCTION_GATE_BLOCKED
```

Real PostgreSQL, backup/restore, local HTTPS, secure-cookie behavior, SMTP,
tenant attacks, valid learning lineage, benchmark queries, Worker behavior, and
a real Stockfish job all passed their executed gates. The release gate remains
blocked because the planned Docker Compose topology could not be started, the
complete four-role browser UI matrix was not executed, and a fresh dependency
audit was not authorized after the current lockfile changes.

## Execution environment

| Component       | Observed environment                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| OS              | Windows 11 Home Single Language, 10.0.26200 build 26200, x64                                                |
| Node.js         | v24.11.1                                                                                                    |
| pnpm            | 11.19.0                                                                                                     |
| Docker          | client 29.2.1; Desktop daemon unavailable; `desktop-linux` engine pipe absent after repeated start attempts |
| PostgreSQL      | server/client 17.11, portable disposable clusters and distinct databases                                    |
| browser runtime | Google Chrome 136.0.7103.93, headless DevTools Protocol acceptance                                          |
| reverse proxy   | Caddy 2.11.4 using local internal TLS                                                                       |
| SMTP            | Mailpit 1.30.0                                                                                              |
| Stockfish       | Stockfish 18, Windows x86-64 AVX2, external UCI process                                                     |

Docker Compose configuration parsed with explicit production variables earlier
in the execution window, but no container was started. The HTTPS evidence came
from built Web/API processes behind Caddy with real PostgreSQL and Mailpit on
the host. This is useful boundary evidence, but it is not silently treated as
execution of the repository's intended Compose topology.

## Real PostgreSQL

| Gate                       | Result | Evidence                                                                                                                                        |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| clean migration            | PASS   | migrations 001 through 014 applied to a fresh PostgreSQL 17.11 database; latest migration and 12 critical tables verified                       |
| upgrade migration          | PASS   | a separate 001–013 database was seeded, migration 014 applied, and representative identity/provenance rows and relationships remained unchanged |
| failed-migration rehearsal | PASS   | the disposable failing transaction created neither its object nor a successful migration row; documented recovery remained usable               |
| transaction rollback       | PASS   | real PostgreSQL rollback behavior passed                                                                                                        |
| schema constraints/indexes | PASS   | foreign-key/check/unique/index verification passed through the production verifier and real integration suite                                   |
| readiness                  | PASS   | current schema returned 200; unavailable database returned 503; recovery returned 200                                                           |

The representative upgrade included Player, Game, AnalysisRun,
ConceptEvidence, SkillGraphRun, TrainingEvidence, Academy, Assignment, User,
Membership, Session, and Invitation relationships; verification was not limited
to row counts.

### Query plans

The 1,000-Student benchmark ran `EXPLAIN (ANALYZE, BUFFERS)` for session
authentication, membership capability, first/later roster pages, Student
identity, active assignments, invitation listing, audit listing, and
password-reset throttling.

Two supplemental plans were measured on the valid learning fixture:

- compatible SkillGraph selection used
  `player_skill_graph_runs_compatible_profile_idx`, two shared-buffer hits,
  and 0.795 ms execution;
- Student TrainingItem ownership preserved the complete
  User→Membership→Academy→Student→Assignment→item predicates, used the relevant
  indexes, and executed in 2.175 ms.

No measured plan was pathological. No speculative index or weakened tenant or
lineage predicate was introduced.

### Connection pooling

API and Worker construct bounded shared pools rather than one connection per
request:

| Process | max connections | connection timeout | statement timeout |
| ------- | --------------: | -----------------: | ----------------: |
| API     |              10 |           5,000 ms |         30,000 ms |
| Worker  |               5 |           5,000 ms |         60,000 ms |

An outage test exposed and repaired an unhandled idle `pg-pool` error; after
the fix the API process remained alive while readiness and protected requests
failed closed.

### Real concurrency

| Race                                     | Result                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| same invitation accepted twice           | PASS: one 201, one 409, exactly one User/membership claim                                                                                          |
| one fresh reset token completed twice    | PASS: one 200, one 400; token remained single-use                                                                                                  |
| last Owner mutated concurrently          | PASS: both mutations returned 409; one active Owner remained                                                                                       |
| same TrainingItem submitted concurrently | PASS: both immutable attempts succeeded with distinct attempt numbers and matching evidence rows; retry correlation selected one item contribution |

## Backup / restore

| Observation               | Result                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| backup                    | PASS: PostgreSQL custom-format dump from `task014_host_stack_20260903`                                                                                                                              |
| migration version         | 014                                                                                                                                                                                                 |
| dump size                 | 289,241 bytes                                                                                                                                                                                       |
| restore target            | distinct empty `task014_learning_restore_20260903` database                                                                                                                                         |
| restore                   | PASS                                                                                                                                                                                                |
| observed restore duration | 1,579.592 ms                                                                                                                                                                                        |
| manifest comparison       | PASS: migrations, counts, and stable-ID hashes matched                                                                                                                                              |
| full lineage              | PASS: six restored TrainingEvidence rows joined through Attempt, Item, source ConceptEvidence, ClassificationRun, AnalysisRun, and Game; Academy/User/Student/Player/Assignment links also verified |

The source and restore counts matched exactly:

```text
Games 2
AnalysisRuns 2
ClassificationRuns 2
ConceptEvidence 63
SkillGraphRuns 2
TrainingPlans 1
TrainingItems 3
Assignments 2
TrainingAttempts 6
TrainingEvidence 6
training mastery contributions 3
```

The dump remains ignored and is not committed. The observed duration is not a
contractual RTO, and no RPO claim is made.

## HTTPS / cookies

| Gate               | Result                 | Observed evidence                                                                    |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------ |
| TLS/proxy          | PASS                   | `https://localhost:8443` through Caddy local internal TLS to built Web/API processes |
| session cookie     | PASS                   | `__Host-chess_session`; Secure; HttpOnly; SameSite=Lax; Path=/; no Domain            |
| cookie persistence | PASS                   | browser login → `/my` → reload stayed authenticated                                  |
| logout             | PASS after remediation | browser logout returned to `/login`; cookie removed; `auth/me` returned 401          |
| allowed Origin     | PASS                   | exact configured HTTPS Origin accepted                                               |
| foreign Origin     | PASS                   | mutation rejected with 403                                                           |
| CORS               | PASS                   | exact ACAO plus credentials; no credentialed wildcard                                |
| security headers   | PASS                   | nosniff, Referrer-Policy, and frame/CSP protection observed on deployed responses    |
| mixed content      | PASS                   | no HTTP API requests or browser mixed-content failures                               |
| internal routes    | PASS                   | production `/api/analysis/jobs` returned 404                                         |

Caddy internal TLS is local acceptance evidence, not proof of a public
certificate. Some defense-in-depth headers are emitted by both Caddy and the
application; the duplicate values were non-blocking in the observed browser.

## Browser role matrix

The complete role matrix was exercised through four independent authenticated
sessions at the deployed HTTPS API boundary. Only the authentication,
reload/logout, responsive layout, accessibility names, console, and
mixed-content subset was automated in Chrome UI. Therefore the full browser UI
gate remains `NOT_RUN`.

| Role    | Browser gate | Deployed HTTPS evidence                                                                                                                                                  |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OWNER   | NOT_RUN      | Chrome login/reload/logout passed; invitation, membership, roster, and assignment operations passed through its independent HTTPS session                                |
| ADMIN   | NOT_RUN      | roster, Student intelligence, invitation/assignment and permitted membership operations passed through an independent HTTPS session; denied boundaries remained enforced |
| COACH   | NOT_RUN      | roster/detail/progress/create/cancel passed through an independent HTTPS session; invitation, membership mutation, and Student-attempt impersonation were denied         |
| STUDENT | NOT_RUN      | own intelligence/assignment/item/attempt/evidence passed through an independent HTTPS session; roster, other Student, assignment creation, and audit access were denied  |

Chrome also verified a 375-pixel viewport without horizontal overflow,
accessible Email/Password/Sign-in names, zero console exceptions/errors, and no
mixed-content failure.

## Tenant security attacks

Result: `PASS`.

- Academy IDs and Student IDs from another tenant returned 403 in both
  directions.
- One canonical Player was intentionally linked to one StudentProfile in each
  of two Academies; each roster contained only its own Student and the shared
  Player did not collapse tenancy.
- Foreign Academy, StudentProfile, Player, Assignment, plan/item, and
  SkillGraph identifiers failed closed along the exercised API paths.
- Runtime audit data includes four `CROSS_TENANT_ACCESS_DENIED` events and 11
  additional `PERMISSION_DENIED` events.

## Coach impersonation

Result: `PASS`.

An authenticated COACH directly called the Student TrainingAttempt endpoint
with a Student item. The request returned 403
`TRAINING_ITEM_NOT_ASSIGNED_TO_STUDENT`; TrainingAttempt and TrainingEvidence
counts remained unchanged at zero for the attack fixture.

## Invitation / SMTP

Result: `PASS`.

Mailpit received real invitation email from the production-configured SMTP
adapter. Recipient and invite URL were verified, the token claimed the existing
invitation/membership identity, and concurrent acceptance produced one success
and one conflict. Production API responses did not return the raw token.
Database rows contain SHA-256 token digests only; application/Caddy log scans
found no invitation token.

## Password reset

Result: `PASS`.

- known and unknown email requests returned the same generic 202 response;
- exactly one Mailpit message was delivered for the known account;
- the fresh link changed the Argon2id credential and returned 200;
- reuse returned 400, old sessions returned 401, the old password failed, and
  the new password logged in;
- a concurrent fresh-token race produced one 200 and one 400;
- API responses, logs, audit metadata, and database persistence contained no raw
  reset token.

## Health / failure behavior

| Failure gate      | Result                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/livez`          | PASS: 200 during normal service and PostgreSQL outage                                                                                  |
| `/readyz`         | PASS: 200 when current, 503 while PostgreSQL was stopped, 200 after restart                                                            |
| PostgreSQL outage | PASS after remediation: protected request failed closed; API stayed alive; recovery succeeded                                          |
| SMTP outage       | PASS: reset remained enumeration-safe; invitation failed with sanitized 503; FAILED delivery state persisted; recovery delivered again |
| Stockfish failure | PASS: invalid executable path exhausted bounded retries, recorded a sanitized failure, and left API/game reads available               |

`/readyz` reports database/schema readiness. It does not currently probe SMTP;
the observed SMTP failure behavior is documented separately.

Runtime audit rows cover login, logout, invitation, password reset, assignment,
consent, permission denial, and cross-tenant denial. Of 120 acceptance audit
rows, 118 retained HTTP request IDs; the two without IDs came from non-HTTP
operator fixture actions.

## Stockfish / Worker

Result: `PASS` for the real engine/Worker boundary; `NOT_RUN` in the planned
Docker Compose topology.

- Stockfish 18 completed a real UCI handshake and one depth-10, MultiPV-2
  `QUICK_V1` analysis through the Worker against PostgreSQL;
- immutable run `659deff5-0654-4960-9354-b70320f1291e` succeeded with 20 exact
  engine position states;
- engine family/name/version, options, search budget/profile, timestamps, and
  binary SHA-256
  `c86215fa1977d53b82ed854540a4c7b025be4cd042276c85ba3de53fb9118911`
  were persisted;
- Worker health reported ready with real PostgreSQL and Stockfish;
- the invalid-path rehearsal failed safely with bounded retries;
- Stockfish remained an external process and no engine binary was added to the
  repository.

The real UCI run exposed and repaired an argument-order bug in the `go`
command. The remaining product-core blocker is proof of this path inside the
repository's intended production Compose topology.

## Academy benchmark

Result: `PASS` at the existing valid operational scale.

The real PostgreSQL harness seeded 1,000 Students, 50 staff, 1,050 sessions,
2,000 invitations, 2,000 reset observations, and 10,000 audit events. All nine
20-sample query families completed with p95 values from 0.330 ms to 1.371 ms.
Session lookup used the unique token-hash index after `ANALYZE`; no N+1,
unbounded result, multi-second authentication, or unexpected high-cardinality
identity scan appeared.

The benchmark contains zero Assignments/Attempts by design. A separate valid
learning fixture reached two Assignments, six Attempts, and six TrainingEvidence
rows with complete immutable lineage. The 10,000/50,000 learning target was not
fabricated and remains a non-blocking capacity uncertainty. Full numbers and
plans are in `docs/operations/academy-benchmark-v1.md`.

## Full learning smoke

Result: `PASS` on the built host production-like HTTPS topology.

```text
Academy
→ StudentProfile/Player
→ explicit SkillGraph baseline
→ TrainingPlan
→ Assignment
→ Student TrainingAttempt
→ TrainingEvidence
→ explicit SkillGraph V2 refresh
→ Coach comparable progress
```

Assignment creation produced no measurement evidence. Three diagnostic items
did not expose accepted moves before attempt. Three correct attempts produced
three TrainingEvidence rows and a completed Assignment. A later retry/consent
exercise raised the immutable totals to six Attempts/evidence rows, while the
refreshed SkillGraph selected three TrainingItems rather than treating retries
as independent mastery samples. All three selected training contributions trace
through exact attempts, items, source ConceptEvidence, Game occurrences, and
engine/classification runs.

Consent was also executed on a real TrainingItem: PENDING blocked, GRANTED
allowed, REVOKED blocked future attempts without deleting historical evidence,
and a later GRANT restored access.

## Blockers discovered

Four real defects were found during execution. All were remediated and rerun:

1. Stockfish searches did not terminate because UCI `go` arguments were in an
   invalid order.
2. Stopping PostgreSQL emitted an unhandled idle-pool error that terminated the
   API process.
3. Web logout sent an empty body with JSON content type, causing Fastify to
   return 500.
4. The benchmark's first seeded run had stale planner statistics, so session
   lookup did not demonstrate its token index.

A desktop-width navigation overflow and a date-sensitive Academy test fixture
were also corrected during the gate.

## Remediations applied

| Problem                     | Root cause                                                                | Fix                                                               | Regression / rerun                                                    |
| --------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Stockfish search hung       | `searchmoves` preceded `depth`, so Stockfish parsed later tokens as moves | emit `go depth 10 searchmoves ...`                                | command-order unit regression plus real Stockfish/PostgreSQL job PASS |
| API died on database stop   | idle `pg-pool` error had no listener                                      | always attach a pool error handler; API logs sanitized code only  | pool error unit regression; real outage/recovery PASS                 |
| browser logout returned 500 | empty request advertised `application/json`                               | remove the content type, check response, redirect only on success | Web build plus real Chrome logout/reload PASS                         |
| benchmark token scan        | seed statistics were not refreshed                                        | run `ANALYZE` after deterministic seed                            | rerun used `auth_sessions_token_hash_key` and passed                  |
| desktop overflow            | header/navigation flex row could not wrap                                 | wrap and constrain responsive navigation                          | Chrome desktop/mobile overflow checks PASS                            |
| date-sensitive test         | fixed assignment dates aged past domain constraints                       | derive dates relative to the test clock                           | full regression suite PASS                                            |

No migration 015 or speculative infrastructure was introduced.

## Remaining blockers

1. **Production Compose topology — NOT_RUN.** Docker Desktop client 29.2.1 is
   installed, but its Linux engine never became reachable; repeated supported
   start attempts left `Server: null` and the engine pipe absent. Therefore
   Caddy/Web/API/Worker/PostgreSQL/Mailpit and the real Stockfish job were not
   proven together through `docker-compose.production.yml`.
2. **Complete four-role browser UI matrix — NOT_RUN.** Four independent role
   sessions and authorization attacks passed over the deployed HTTPS API, and
   Chrome covered the critical cookie/navigation subset, but OWNER, ADMIN,
   COACH, and STUDENT were not each driven through every specified UI workflow.
3. **Fresh dependency security audit — NOT_RUN.** `pnpm audit --prod` was not
   executed because sending the current private dependency manifest to the npm
   audit service was not authorized. The older Task 013 audit result is not
   promoted to fresh Task 014 evidence.

The first blocker also leaves the product-core Stockfish gate incomplete in the
intended deployment architecture. The production gate is therefore blocked
even though the separately executed engine job passed.

## Remaining non-blocking risks

- no MFA or SSO;
- no formal penetration test;
- Academy-attested guardian consent is not verified guardian identity or a
  legal-compliance claim;
- no public-certificate verification;
- no durable asynchronous email queue/provider retry;
- runtime and migrations use the same database owner in the current Compose
  profile;
- no contractual RPO/RTO or repository-managed backup encryption;
- benchmark learning lineage is far below 10,000 Assignments / 50,000 Attempts;
- limited deterministic concept/training coverage;
- no advanced observability stack;
- duplicate defense-in-depth security headers may warrant cleanup.

## Graphify

The first `graphify . --update` attempt reported 12 changed code files and 35
changed documents, then stopped because no semantic LLM key was configured.
`graphify . --update --code-only` and `graphify cluster-only .` subsequently
completed: 2,362 nodes, 5,180 edges, and 126 communities.

The refreshed graph traces:

- API startup through `server.ts → config/db/buildApp/SMTP`;
- browser logout through
  `layout.tsx → SessionNavigation → logout`;
- engine execution through
  `Worker/AnalysisWorker → StockfishUciEngine.analyze → buildUciGoCommand`,
  with the command-order and real-PostgreSQL tests attached.

The 35 Markdown files were not semantically refreshed. Code/security/Worker
paths are current; the document limitation is not a production blocker.

## Project Context

`PROJECT_CONTEXT.md`, the production checklist, and the benchmark report are
updated to retain `PRODUCTION_GATE_BLOCKED` with the exact remaining blockers.
`AGENTS.md` adds only the newly observed idle-pool/liveness invariant.

## Suggested Task 015

Because the gate remains blocked, the next milestone should be the smallest
closure milestone:

> **TASK 015 — Production Topology & Four-Role Browser Gate Closure**

It should restore the Docker engine, run the existing Compose deployment, repeat
the real Stockfish job in that topology, execute the full OWNER/ADMIN/COACH/
STUDENT browser UI matrix, and run the dependency audit only after explicit
authorization. Do not start Chess Concept & Training Coverage Expansion or an
AI Coach until this release gate is closed.
