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

## External data rule

External chess websites must never be scraped, crawled, reverse-engineered, or bulk-downloaded unless the repository contains explicit documentation that such access is permitted by the provider's terms, license, API agreement, or another valid authorization.

`ChessResultsProvider` must remain disabled until a permitted access method is documented. Never implement an external-provider request merely because a source type or placeholder exists.
