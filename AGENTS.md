# Coding agent guide

## Structure

- `apps/web`: Next.js developer interface.
- `apps/api`: Fastify HTTP boundary and ingestion orchestration.
- `apps/worker`: asynchronous analysis orchestration and the Stockfish UCI process adapter.
- `packages/domain`: shared domain contracts and source/status vocabulary.
- `packages/chess-core`: chess truth: PGN parsing, legal moves, FEN, position and game hashes.
- `packages/db`: PostgreSQL migration, transaction abstraction, and game persistence.
- `packages/config`: validated environment access.
- `docs`: plans and architecture decisions.

## Commands

- `pnpm dev`: start PostgreSQL/Redis, migrate, and run API + web + analysis worker.
- `pnpm db:migrate`: apply PostgreSQL migrations.
- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`: required checks.
- `pnpm check`: run all non-build checks.

## Boundaries and invariants

- Keep chess-rule calculations in `packages/chess-core`; HTTP and UI code must not fabricate chess truth.
- Keep engine-specific work behind `apps/worker` and the engine-neutral `ChessEngine` contract. Core game/position tables must remain engine-independent.
- An LLM may later explain verified structured facts, but chess truth must never be delegated to an LLM.
- Provenance is mandatory. Every imported game observation needs a `GameSourceRecord`, its source, permission/license basis, timestamps, external identifier when present, and raw source material/metadata.
- A canonical `Game` may have several source records. Do not add a single source column to `games`.
- Do not merge players by name alone. External identity links require explicit verification status, confidence, and link reason.
- Prefer `UNKNOWN` to inferred OTB/online or time-category metadata when evidence is absent.
- Review and record dependency licenses in `THIRD_PARTY_LICENSES.md` before adding chess-specific packages.
- No authentication, provider integration, engine, or AI functionality belongs in Task 001.
- Game reconciliation must prefer false negatives over false-positive merges. If the system is uncertain whether two observations represent the same real-world game, preserve them separately or require explicit review.
- Never attach from `AMBIGUOUS_MATCH`; names and similar fixture metadata do not prove that two observations are the same game.
- Preserve canonical metadata when attaching a sparse PGN, and append a PGN provenance observation instead of modifying historical metadata provenance.
- Corpus statistics describe observed historical data. Do not label a move as "best", "recommended", or "stronger" based solely on frequency or raw historical score.
- Count canonical games, not provenance observations or repeated occurrences, in corpus statistics. Exact external identity filters must never fall back to fuzzy names.
- Engine evaluations must retain engine family/name/version, binary hash, options, search budget, profile/version, and timestamps.
- A normalized Position ID must never be the sole identity of an engine state; retain the canonical game occurrence and exact initial-FEN/move history.
- Persisted Task 004 engine scores use an explicit White perspective. Convert mover-relative loss in the domain layer, not API/UI.
- Mate scores must remain structurally distinct from centipawn scores.
- LLMs must never generate, alter, or override engine evaluations.
- Historical corpus observations and engine evaluations are separate evidence sources and must not be conflated.
- Player Intelligence must expose evidence coverage and denominators before derived metrics.
- Multiple immutable engine runs for the same canonical game are not independent samples; select a documented compatible run policy.
- Every engine-derived player metric must identify its engine aggregation profile and version.
- Observed recurrence is not a weakness label, and objective recorded behavior is not psychology.
- Player-facing engine scores use the focal-player perspective; persisted engine truth remains explicitly White-relative.
- AI narrative must never replace or override the structured evidence in a Player Intelligence dossier.
- Opponent preparation must distinguish historical observation, engine evidence, and heuristic study-priority ranking.
- Raw historical win rate must never be labeled as chess strength or move quality.
- Absence of engine evidence is unknown, not zero.
- Engine evidence from one game-history state must not be reused solely because normalized position IDs match.
- Opponent analysis must not infer psychological traits or weaknesses from small samples.
- Preparation candidates are study priorities, not guaranteed best moves.
- Persist analytical concept references by stable ID plus ontology version, never by display label alone.
- Published ontology versions are immutable. Any definition, relationship, or evidence-policy change requires a new semantic version and canonical hash.
- A display-name or description edit must not rename a stable ID. Incompatible meaning requires a new ID plus explicit deprecation/replacement metadata.
- Ontology hierarchy and prerequisite graphs must remain acyclic; every non-domain concept has exactly one primary parent reachable from a top-level domain.
- Ontology difficulty is pedagogical metadata, never an Elo range or a player-mastery estimate.
- Generic engine evaluation loss is contextual evidence and must never directly prove a specific chess concept.
- Ontology definitions and policies must not store player evidence, mastery, weakness, psychology, lesson, or recommendation state.
- New concepts are source-controlled and published in a new ontology version; never create ad hoc concepts at runtime.
- Concept classifiers must prefer no classification over uncertain classification.
- Every persisted concept evidence instance must reference a stable concept ID and explicit immutable ontology version.
- Resolve evidence roles from the selected ontology policy; classifiers may not choose or override `DIRECT`, `SUPPORTING`, or `CONTEXTUAL`.
- Position facts and player decision evidence are not interchangeable. Neutral evidence must never be interpreted as positive player mastery.
- Positive/negative concept decisions require an independently detected motif plus one exact-history-compatible engine run; engine loss alone never identifies a concept.
- Classifier or threshold changes require explicit version changes and new immutable runs; never rewrite historical evidence.
- Task 008 evidence must not add mastery, weakness, confidence, weighting, lesson, recommendation, or training state.
- Skill Graph aggregation consumes immutable Task 008 evidence and must not reclassify chess data.
- Skill Graph computation requires an explicit ontology version and must never use `latest`.
- Historical evidence roles remain authoritative under the ontology version where they were persisted; Task 009 role weights are separately versioned.
- Only focal-player `DECISION` evidence may update mastery. `POSITION`, `NEUTRAL`, and V1 `CONTEXTUAL` evidence add zero mastery mass.
- One canonical Game is the V1 Skill Graph correlation unit. Multiple evidence events and immutable classification reruns for that Game are not independent samples.
- Missing classification or engine evidence is `UNKNOWN`, never negative mastery evidence.
- Mastery recency requires an explicit date-only `asOfDate`; policy changes create new immutable SkillGraphRuns rather than rewriting history.
- Every effective mastery contribution must retain exact `concept_evidence_instances.id` lineage.
- Skill Graph output must not infer weakness, strength, psychology, or training priority.
- Training must distinguish remediation from diagnosis; unknown or insufficient evidence is not a weakness label.
- Every TrainingPlan consumes an explicit immutable SkillGraphRun; persistence must never resolve a latest graph implicitly.
- Training targets must originate from ontology-valid Task 008 concept evidence and compatible exact-history Task 004 evidence, never generic engine loss.
- Correctness is server-validated against immutable private TrainingItem truth; normal pre-attempt APIs must not leak accepted moves.
- TrainingAttempts are immutable, and their evidence role comes from the exact pinned ontology policy.
- Training evidence is a separate origin and must not be inserted into Game/classification-scoped concept evidence tables.
- Retries on one TrainingItem are correlated and must not become independent mastery samples.
- Completed SkillGraphRuns are never mutated after training; training-augmented mastery uses a new explicit policy version and evidence snapshot.
- Every training-derived mastery contribution must trace to the exact attempt, item, source concept evidence, Game, and occurrence.
- Never conflate StudentProfile, canonical Player, Academy membership, and future User identity.
- Academy queries must remain Academy-scoped. Production actors come from an authenticated User session and an active same-Academy membership; browser-supplied membership IDs are never authorization.
- Student progress must not compare SkillGraphRuns with incompatible Player, ontology, policy configuration, classifier semantics, or evidence scope.
- Assignment content must reference immutable Task 010 TrainingPlan and TrainingItem artifacts and the plan's exact baseline SkillGraphRun.
- Assignment creation must not generate TrainingEvidence, and operational coach notes must not generate concept evidence.
- TrainingAttempts before assignment creation do not satisfy assignment completion; retries do not add another completion.
- Previously measured remediation items are practice-only when reassigned; previously measured diagnostic items are not clean V1 measurements.
- Student dashboards must not convert missing evidence into weaknesses or rank Students by mastery.
- Read requests must not silently create SkillGraphRuns or TrainingPlans.
- Keep User, AcademyMembership, StudentProfile, and Player identities separate. Player identity never authenticates a caller.
- Persist only Argon2id password hashes and SHA-256 digests of high-entropy session/invitation tokens; raw tokens and credentials never enter persistence, logs, or audit metadata.
- Student training writes derive User → active STUDENT membership → StudentProfile → Player and exact active assignment. Operational roles cannot impersonate Student measurement.
- `ACADEMY_RBAC_V1` is the canonical capability map. Membership disable takes effect immediately, and the last active Owner cannot be disabled or demoted.
- Cookie-authenticated mutations require the configured exact Origin. Production requires Secure `__Host-` cookies and must reject internal development routes.
- Security audit events are append-only security provenance, never chess, concept, mastery, or training evidence.
- Guardian-consent records are Academy attestations and a product access gate, never verified guardian identity or a legal-compliance claim.
- Do not claim production verification from PGlite; production conclusions require a real PostgreSQL run.
- Do not claim backup success without restoring into a separate database and verifying integrity.
- Production migration rollback is backup/restore based unless an explicitly safe reversible migration exists.
- Never weaken Academy tenant, Student ownership, or evidence-lineage predicates for benchmark speed.
- Production authentication, cookie, Origin/CORS, and role authorization behavior must be verified through the deployed HTTPS browser/API boundary.
- Password-reset and invitation raw tokens must never be logged or persisted; production invitation APIs must not return them.
- Deployment, backup/restore, verification, and benchmark scripts must require explicit targets and acknowledgement and must not operate on developer databases accidentally.
- Production images must run compiled artifacts, carry their bundle-relative migrations and ontology assets, and complete explicit migration plus ontology publication boundaries before API/Worker startup.
- An operator-supplied Stockfish executable must match the Worker image architecture and libc; preserve its immutable binary hash and reported version in every engine run.
- Readiness must fail when critical database/schema dependencies are unavailable, and authorization dependency failures must fail closed.
- Idle PostgreSQL pool errors must be handled so an outage does not terminate API/Worker processes; liveness remains process-level while readiness and protected requests fail closed.
- Production gate failures must be reported honestly; do not downgrade blockers to warnings merely to finish a task.
- New classification runs must pin CONCEPT_CLASSIFIER_BUNDLE_V1 or
  CONCEPT_CLASSIFIER_BUNDLE_V2; never reinterpret a V1 run with V2 rules.
- CONCEPT_COVERAGE_REPORT_V1 is system capability, not Player evidence. Keep
  SYSTEM_UNSUPPORTED, NO_EVIDENCE, and INSUFFICIENT_EVIDENCE distinct.
- Training Generator V2 may materialize only the eight registry-supported tactical concepts from
  exact Task 008 + Task 004 evidence under the same classifier bundle/configuration.
- Grounded AI receives only a compact exact structured snapshot and may emit only server-validated
  claim types with permitted evidence references. Invalid/provider-failed output persists nothing.
- Grounded AI artifacts are append-only explanation provenance. They never create or alter chess
  truth, concept evidence, mastery, training, assignments, identity, consent, or security state.
- Coach and Student AI routes remain Academy-scoped; Student scope is derived from the authenticated
  membership and consent gate. AI is optional and the platform must operate without a provider.
- `PILOT_EVENT_V1` events and Pilot feedback are append-only Academy-scoped operational
  observations. They must never enter chess truth, concept/training evidence, mastery, identity,
  consent, assignments, or security-audit state.
- Browsers may record only approved open/navigation Pilot events. Successful state-changing Pilot
  workflow events must come from the authenticated server boundary and preserve exact artifact IDs.
- Pilot metrics must expose explicit numerators and denominators. Usage, assignment completion, and
  first-attempt correctness must never be presented as learning effectiveness.
- Pilot Student readiness is operational only. Missing games, engine analysis, compatible Skill
  Graph, or mastery-eligible coverage is an availability/unknown state, never negative mastery.
- Real-provider Pilot smoke tests use synthetic non-PII contexts. Provider output remains subject to
  the same server grounding validator, and `store: false` is required where supported.
- A private Pilot launch requires evidence from the actual tagged deployment: public trusted HTTPS,
  transactional email, four-role tenant boundaries, full Coach/Student loop, and a separate verified
  database restore. Source checks or internal TLS/Mailpit do not satisfy those gates.
- During the Pilot release freeze, permit only production blockers, tenant/auth/security fixes,
  evidence or measurement corrections, core workflow breakage, and operational-documentation fixes.
  Do not start Task 017 before real Pilot evidence is reviewed.
- Vercel serves the Pilot Web only. Fastify API, Worker, and Stockfish remain long-lived container
  workloads; managed PostgreSQL remains server-side.
- Production CORS trusts only the exact approved Web Origin. The `__Host-chess_session` cookie
  remains API-host-only, and Vercel Preview origins are never implicitly trusted.
- Vercel Pilot builds must pin the exact release SHA, and every `NEXT_PUBLIC_` variable must be
  safe for browser disclosure.
- Primary product UI uses Coach/Student language rather than implementation terminology; advanced
  provenance remains available through progressive disclosure.
- Unknown, unsupported, and insufficient-evidence states must never be presented as weakness.
- Coach UX prioritizes evidence → action, while Student UX remains materially simpler and focused
  on the current learning task.

## External data rule

External chess websites must never be scraped, crawled, reverse-engineered, or bulk-downloaded unless the repository contains explicit documentation that such access is permitted by the provider's terms, license, API agreement, or another valid authorization.

`ChessResultsProvider` must remain disabled until a permitted access method is documented. Never implement an external-provider request merely because a source type or placeholder exists.
