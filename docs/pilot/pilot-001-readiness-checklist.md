# Pilot 001 readiness checklist

Overall result: `PILOT_BLOCKED`

## Gate matrix

| Gate                                         | Status  | Evidence / next action                                                                                                                                                                     |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release frozen                               | PASS    | Pilot change policy is documented; only readiness, security, measurement, workflow-blocker, and operations changes are in scope.                                                           |
| Source control clean                         | PASS    | The release commit was created from the inspected staged set; no unintended release-eligible files remained after the final amend.                                                         |
| Build                                        | PASS    | `pnpm build` passed on 2026-09-11.                                                                                                                                                         |
| Migration 016 source/deterministic apply     | PASS    | PGlite applied migrations 001–016; this is not production PostgreSQL proof.                                                                                                                |
| Real PostgreSQL migration/query verification | NOT_RUN | No explicit disposable `TEST_DATABASE_URL`; the unknown native database was not touched.                                                                                                   |
| Tagged-deployment Stockfish                  | NOT_RUN | Task 015 historical evidence is not evidence for the Pilot release deployment.                                                                                                             |
| Public/local Pilot HTTPS topology            | NOT_RUN | Public ACME configuration exists; no actual Pilot hostname/certificate was exercised.                                                                                                      |
| Invitation/login                             | NOT_RUN | Requires designated accounts through the tagged HTTPS deployment.                                                                                                                          |
| Password reset if applicable                 | NOT_RUN | Requires the real transactional email boundary and tagged deployment.                                                                                                                      |
| Academy RBAC / tenant regression             | PASS    | Targeted authenticated integration tests reject foreign Academy and client-authoritative Pilot writes.                                                                                     |
| Pilot Academy provisioned                    | NOT_RUN | One real Pilot Academy has not been created.                                                                                                                                               |
| Two Coach accounts                           | NOT_RUN | Cohort has not been provisioned.                                                                                                                                                           |
| Six–ten Student accounts                     | NOT_RUN | Cohort has not been provisioned.                                                                                                                                                           |
| StudentProfile → Player links                | NOT_RUN | Real cohort links have not been reviewed.                                                                                                                                                  |
| Pilot game data                              | NOT_RUN | Real cohort data has not been imported.                                                                                                                                                    |
| Pilot analysis jobs                          | NOT_RUN | Real cohort analysis has not run.                                                                                                                                                          |
| Classification V2                            | NOT_RUN | Real cohort classifications have not run.                                                                                                                                                  |
| Compatible SkillGraphs                       | NOT_RUN | Real cohort explicit SkillGraph runs do not exist yet.                                                                                                                                     |
| Training candidate availability              | NOT_RUN | Real cohort TrainingPlan candidates have not been inspected.                                                                                                                               |
| Real AI provider                             | NOT_RUN | No provider key/configuration; no billable smoke was attempted.                                                                                                                            |
| AI fallback                                  | PASS    | Provider-disabled/provider-failed paths retain structured intelligence and training; invalid output persists nothing.                                                                      |
| Pilot instrumentation                        | PASS    | `PILOT_EVENT_V1`, server/client authority checks, deduplication, and append-only triggers are tested.                                                                                      |
| Coach feedback                               | PASS    | Controlled feedback persists with exact graph/ontology/concept lineage and no learning writes.                                                                                             |
| AI feedback                                  | PASS    | Exact Academy/Student/audience/artifact/claim scope and controlled reasons are tested.                                                                                                     |
| Event/metric export                          | PASS    | Guarded JSON/CSV aggregate export has explicit denominators, per-concept Coach feedback, and controlled AI reason breakdowns.                                                              |
| Backup and separate restore                  | NOT_RUN | Exact Pilot database and distinct restore target do not exist.                                                                                                                             |
| Incident process and owners                  | NOT_RUN | Runbook/templates exist; named release/security/support/backup owners are still required.                                                                                                  |
| Coach guide                                  | PASS    | `pilot-001-coach-guide.md`.                                                                                                                                                                |
| Student guide                                | PASS    | `pilot-001-student-guide.md`.                                                                                                                                                              |
| Authenticated browser smoke                  | NOT_RUN | Local Web shell rendered; four-role tagged HTTPS workflow remains required.                                                                                                                |
| Authenticated mobile smoke                   | NOT_RUN | Mobile Web shell rendered; signed-in Pilot workflow remains required.                                                                                                                      |
| Secret scan                                  | PASS    | 333 release-eligible files scanned. Four hits were one explicitly marked non-secret Task 015 placeholder and its three generated Graphify copies; local test private keys are Git-ignored. |
| Production dependency audit                  | NOT_RUN | Public npm-registry manifest disclosure was not specifically authorized; no workaround was attempted.                                                                                      |

## Verified in source

- [x] Task 016 checkpoint is immutable and recorded.
- [x] Pilot event/feedback tables are append-only and Academy-scoped.
- [x] Browser events are limited to approved open/navigation observations.
- [x] State-changing workflow events are emitted by authenticated server handlers.
- [x] feedback has controlled values and exact Skill Graph/concept or artifact/claim lineage.
- [x] Pilot metrics expose explicit denominators and do not claim learning effectiveness.
- [x] Student readiness distinguishes no games, no analysis, no graph, low coverage, and ready.
- [x] AI is optional; invalid/provider-failed output persists no artifact.
- [x] local checks/build and migration verification are part of the release gate.

## Local release-candidate evidence — 2026-09-11

- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`: passed.
- `pnpm test -- --maxWorkers=4 --reporter=dot`: 44 files passed, 223 tests passed; 5 files
  and 6 tests skipped behind explicit external/real-runtime prerequisites.
- `pnpm build`: passed, including the production Next.js build and API/Worker type builds.
- migration 016 applied in deterministic PGlite migration tests. This is source verification only.
- `pnpm test:postgres`: skipped because no explicit disposable `TEST_DATABASE_URL` was configured;
  no unknown local database was migrated.
- production Compose configuration rendered with explicit placeholders, but Docker Engine was
  unavailable. No Pilot image or deployment success is claimed.
- Impeccable detector found only the incumbent global font and pre-existing security-note border;
  headless Chrome produced desktop/mobile Web-shell screenshots. Authenticated Pilot browser
  workflow verification remains a deployment gate.
- Graphify incremental update produced 3,237 nodes and 6,835 edges. Verified paths include
  `recordClientEvent → buildApp → PilotRepository`,
  `OpenAiGroundedLanguageModel → GroundedLanguageModel → app.ts → GroundedAiRepository`, and
  `buildApp → studentReadiness → derivePilotStudentReadiness` (undirected architecture view;
  extracted/inferred edge labels are retained in `graphify-out`).

## Hard launch blockers

- [ ] build immutable production images from the release tag and record digests.
- [ ] deploy to the actual Pilot hostname with publicly trusted HTTPS.
- [ ] verify production cookie, Origin/CORS, and four-role boundaries through that browser/API edge.
- [ ] configure and verify transactional email; Mailpit is not a Pilot transport.
- [ ] run and approve the 20–50 case real-provider synthetic AI smoke, or explicitly launch with AI
      disabled.
- [ ] provision the real Pilot Academy/accounts/StudentProfiles and consent states.
- [ ] run the full synthetic Coach and Student loop on the deployed topology.
- [ ] create a backup from the exact Pilot database, restore into a separate database, and verify.
- [ ] name operational owners and incident/escalation channels.

## Launch rule

Do not invite Pilot users until every hard blocker is checked with a dated evidence artifact. Risks
that do not affect tenant isolation, authentication, data recovery, evidence integrity, or core loop
completion may be accepted only by a named release owner.
