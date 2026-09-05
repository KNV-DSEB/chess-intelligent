# Task 015 production topology and browser gate report

Evidence window: 2026-09-04 through 2026-09-05 (Asia/Bangkok).

## Decision

```text
PRODUCTION_GATE_PASSED_WITH_NON_BLOCKING_RISKS
```

The two blockers carried from Task 014 are closed. The production Compose
topology ran end to end, including a real Stockfish 18 job, and the complete
OWNER/ADMIN/COACH/STUDENT matrix ran through the deployed HTTPS browser
boundary with independent cookie contexts. Task 016 was not started.

## Runtime

| Component     | Observed value                                                     |
| ------------- | ------------------------------------------------------------------ |
| Host          | Windows 11 / WSL 2 Docker Desktop acceptance host                  |
| Docker engine | 29.2.1, Linux amd64                                                |
| PostgreSQL    | 17.11                                                              |
| Browser       | Chrome 136.0.7103.93, headless CDP                                 |
| Proxy         | Caddy 2.10 Alpine with internal TLS for `https://localhost`        |
| Mail boundary | Mailpit 1.27 inside the Compose networks; no host mail port        |
| Engine        | Stockfish 18, Alpine-compatible Linux binary mounted read-only     |
| Ontology      | `1.0.0`, PUBLISHED, 64 concepts                                    |
| Ontology hash | `1aa76c4f20f17d9e5ce7d07012e2d66ae15137a97846fc8e166cf1f496df2d8e` |

Docker Desktop hit its known local stale AF_UNIX listener failure while the
gate was running. Recovery stopped Desktop, retained the stale `run` and
`docker-secrets-engine` directories as timestamped backups, shut down WSL, and
restarted Desktop. No factory reset, prune, image deletion, or volume deletion
was used. The database and all acceptance evidence survived.

## Compose topology

`docker-compose.production.yml` rendered eight services:

- `postgres`;
- one-shot `migrate`;
- one-shot `ontology`;
- `api`;
- `worker`;
- `web`;
- `mailpit`;
- `proxy`.

Only `proxy` publishes host ports (`80` and `443`). PostgreSQL, API, Web,
Worker, and Mailpit remain internal. Final state showed migration and ontology
containers exited `0`; PostgreSQL, API, Worker, Web, and Mailpit were healthy.
The proxy was running and HTTPS readiness returned `200`.

The production commands are compiled artifacts, not development runners:

| Service              | Command                                      |
| -------------------- | -------------------------------------------- |
| API                  | `node apps/api/dist/server.js`               |
| Worker               | `node apps/worker/dist/worker.js`            |
| Web                  | `node apps/web/server.js`                    |
| Migration            | `node packages/db/dist/migrate-cli.js`       |
| Ontology publication | `node packages/db/dist/ontology-sync-cli.js` |

Clean boot applied migrations `001` through `014`, published ontology `1.0.0`,
and rejected unresolved or missing required environment values. The API and
Worker start only after the one-shot schema and ontology boundaries succeed.

## Gate results

| Gate                         | Result  | Evidence                                                                                                                                                      |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static topology              | PASS    | Rendered config; only proxy has published ports                                                                                                               |
| Production images            | PASS    | API/Worker/Web and one-shot images built; compiled commands inspected                                                                                         |
| Clean Compose boot           | PASS    | Empty project-scoped data volume booted; migrations/ontology exited 0                                                                                         |
| PostgreSQL failure semantics | PASS    | readiness 503, liveness 200, login 500 fail-closed, API/Worker same process IDs and restart count 0                                                           |
| PostgreSQL recovery          | PASS    | readiness returned 200 and Worker returned healthy                                                                                                            |
| Process restart              | PASS    | API/Worker/Web/proxy restarted; persistence snapshot unchanged                                                                                                |
| Compose recreation           | PASS    | `down` without `-v`, then `up -d`; persistence snapshot unchanged                                                                                             |
| SMTP failure                 | PASS    | readiness remained 200 because mail is non-critical; public reset stayed enumeration-safe 202; invitation failed 503 `EMAIL_DELIVERY_FAILED`; recovery passed |
| Invalid Stockfish boundary   | PASS    | incompatible Linux binary produced an immutable failed job without corrupting engine truth                                                                    |
| Real Stockfish job           | PASS    | immutable Stockfish 18 run succeeded with four exact-history states                                                                                           |
| Owner bootstrap              | PASS    | supported production CLI created distinct User, Academy, and OWNER membership identities                                                                      |
| Four-role browser matrix     | PASS    | five independent role/tenant contexts plus six auth lifecycle contexts                                                                                        |
| Responsive/browser quality   | PASS    | 1440 px and 390 px; no overflow, mixed content, unlabeled primary input, exception, or console error                                                          |
| Security provenance          | PASS    | 128 audit rows, 30 denials, exact training lineage, zero secret findings                                                                                      |
| Repository checks            | PASS    | `pnpm check` and `pnpm build`                                                                                                                                 |
| Dependency audit             | NOT_RUN | External registry manifest disclosure was not authorized                                                                                                      |

## Browser matrix

### OWNER

- Logged in, reloaded, logged out, and proved a parallel session remained
  independent.
- Viewed roster and Student detail.
- Created invitations and an assignment through the UI.
- Performed a permitted Student membership disable/restore lifecycle.
- Last-active-Owner disable returned `409 LAST_OWNER_PROTECTED`.

### ADMIN

- Logged in and viewed roster and Student detail/intelligence.
- Created an invitation and assignment through the UI.
- Disabled and restored the Coach membership through the UI.
- An attempted Owner mutation returned `403 MEMBERSHIP_MANAGEMENT_DENIED`.

### COACH

- Logged in, viewed roster and Student detail/progress, created an assignment,
  and cancelled it.
- Invitation, membership, audit, and Student-attempt impersonation operations
  returned `403`.
- The cancelled assignment remains visible as history but exposes no actionable
  TrainingItem links.

### STUDENT

- Logged in and viewed only own assignments and assigned item.
- `PENDING` consent denied access, `GRANTED` allowed it, and `REVOKED` denied
  future access without deleting historical evidence.
- The pre-attempt item response did not expose accepted moves. The submitted
  move was scored against private immutable item truth, after which the result
  was visible.
- Roster, Student detail, assignment creation, audit, membership, foreign item,
  and foreign Academy access all returned `403`.

The primary matrix used five BrowserContexts: OWNER, ADMIN, COACH, STUDENT, and
OWNER_B. The auth lifecycle gate used six additional independent contexts, and
the role logout check used separate ADMIN, COACH, and STUDENT contexts. No
shared-cookie shortcut was used.

## Authentication, sessions, consent, and mail

- Production cookie: `__Host-chess_session`, Secure, HttpOnly, SameSite=Lax,
  Path `/`, and no Domain.
- One OWNER logout invalidated only that session; a parallel OWNER session
  remained valid.
- Password reset completed through the browser UI and the Mailpit-delivered
  single-use link. The old session and old password were rejected, token reuse
  was rejected, and the new password logged in.
- Password change kept the replacing session, revoked the parallel session,
  rejected the prior password, and `revoke-all` invalidated the current session.
- OWNER, OWNER parallel, ADMIN, COACH, and STUDENT browser logouts all ended at
  `401 AUTHENTICATION_REQUIRED` for `/auth/me`.
- Membership disable took effect on the next protected request and was then
  restored. A disposable invited account self-disabled; its session and future
  login were rejected.
- Mailpit remained network-internal. During deliberate SMTP loss, an invitation
  failed closed while the public reset endpoint preserved enumeration-safe
  behavior.

## Stockfish and learning evidence

The production Worker completed:

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Game           | `5c8b52c3-7251-4345-80a0-9e33733f4e16`                             |
| Job            | `d7b01eac-0416-4f56-8169-51f477beb937`                             |
| Run            | `a68c17ee-889d-45d7-a36d-37f93457579d`                             |
| Engine         | Stockfish 18 / version 18                                          |
| Binary SHA-256 | `62d10131c6ef904ec6bf72cbd20772fc2aa459a2b35ed0c7c7ef1d21eaa89a8f` |
| Profile        | `QUICK_V1`, version 1                                              |
| States         | 4 persisted, 4 exact-history-compatible                            |

The Student browser attempt preserved this exact chain:

```text
TrainingAttempt a2a76f72-0a86-4521-92a3-bcf0900a1e6c
  -> TrainingEvidence f68af208-3ab8-4a73-959e-8e2122466b17
  -> TrainingItem d1936a54-a790-4639-b262-cacd11a774fa
  -> ConceptEvidence 6c26c0c3-7873-474a-a758-4bbf772d4fee
  -> ClassificationRun 30a7b9fd-fc07-4bcb-8d27-449ee0692ad6
  -> AnalysisRun 1006900a-5bef-4db4-8f64-c915750cc432
  -> Game 9faa21e2-629d-4565-bd33-19c4ef5a4d99
  -> PositionOccurrence bf6ce0e4-f8fb-4fe5-bd37-a32638d6a024
```

The stable concept is `tactics.discovered_attack`; ontology version identity and
exact-history SHA-256 matched at every foreign-key boundary. There was exactly
one TrainingAttempt and one TrainingEvidence instance for the measured item.
The same canonical Player has exactly two StudentProfiles in two distinct
Academies, and cross-tenant access remained denied.

## Persistence and secret audit

The following snapshot was identical before outage, after recovery, after
process restart, and after Compose recreation:

| Data                                               |      Count |
| -------------------------------------------------- | ---------: |
| schema migrations                                  |         14 |
| published ontology versions / definitions          |     1 / 64 |
| users / memberships / StudentProfiles              |  6 / 7 / 2 |
| games / analysis runs / concept evidence           | 4 / 3 / 63 |
| SkillGraph runs / exact evidence contribution rows |      2 / 6 |
| TrainingPlans / TrainingItems                      |      2 / 6 |
| TrainingAttempts / TrainingEvidence                |      1 / 1 |
| assignments                                        |          3 |

All credential hashes matched Argon2id. All session, invitation, and reset
digests were 64-character SHA-256 values. No raw-secret persistence column was
present. Security audit metadata had zero suspicious secret keys. A scan of
253,620 Compose log characters found zero known passwords, raw invitation/reset
paths, or raw session cookies.

## Defects remediated

1. Production images previously depended on TypeScript development runners.
   They now run compiled JavaScript artifacts.
2. Bundle-relative migrations and ontology assets were absent from production
   images. Images now include both, and explicit ontology publication is a
   one-shot startup dependency.
3. Academy administration UI was insufficient for the four-role gate. OWNER and
   ADMIN now have invitation, membership, Student-link, and audit workflows.
4. Mailpit exposed a host port. It is now internal-only.
5. The official prebuilt Stockfish executable was libc-incompatible with the
   Alpine Worker. An official-source Alpine-compatible Stockfish 18 binary was
   built, hashed, and mounted read-only.
6. Cancelled assignments still projected actionable item links. The API now
   returns no item links for cancelled assignments, with regression coverage.
7. A PostgreSQL outage terminated the Worker poll process. The Worker now
   retries dependency failures in-process with bounded delay; unit and deployed
   outage gates show restart count zero.
8. Acceptance scripts were added to ESLint and TypeScript project checking;
   browser synchronization and stateful reruns are explicit.

## Repository verification

- `pnpm check`: PASS — 37 test files and 185 tests passed; 5 files and 6
  explicitly opt-in PostgreSQL tests skipped.
- `pnpm build`: PASS — optimized Next.js production build plus all package, API,
  and Worker builds.
- Worker dependency retry regression: 2/2 tests passed.
- Cancelled-assignment projection regression: passed in the focused API suite
  and the full suite.
- Graphify code-only incremental update: PASS — 2,516 nodes, 5,375 edges, and
  137 communities. Thirty-seven changed documents require an LLM key for a
  future semantic refresh; code paths were updated locally.

Runtime secrets and acceptance JSON artifacts remain ignored and are not part
of the repository deliverables.

## Residual non-blocking risks

1. The dependency registry audit remains `NOT_RUN` because authorization to
   disclose the dependency manifest to an external audit endpoint was not given.
2. Docker Desktop 4.64 on this Windows acceptance host repeatedly encountered a
   stale local AF_UNIX listener in optional inference/secrets components. The
   application topology survived non-destructive recovery, but pilot operations
   should prefer a supported Linux host or a Docker Desktop release where this
   host defect is resolved.
3. Caddy internal TLS proves HTTPS behavior but not public DNS/certificate
   issuance. Pilot deployment still needs its real hostname and certificate.
4. Mailpit proves SMTP protocol and failure behavior; it is not proof of a real
   transactional-email provider account or deliverability.
5. The ignored Stockfish binary is an operator artifact. Production operators
   must supply a Linux binary compatible with the Worker image architecture and
   libc while retaining its hash and version provenance.

## Next task

Task 016 may expand deterministic chess concept and training coverage. A private
academy pilot should follow that milestone before further speculative analytics
or AI work.
