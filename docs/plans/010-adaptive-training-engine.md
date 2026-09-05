# Task 010 — Adaptive Training Engine V1

## Outcome

Close the first deterministic learning loop without mutating any earlier truth:

```text
immutable PlayerSkillGraphRun
  → immutable TrainingPlanRun and auditable candidates
  → exact-state FIND_BEST_MOVE TrainingItem
  → immutable scored TrainingAttempt
  → ontology-governed TrainingEvidenceInstance
  → explicitly requested SKILL_GRAPH_POLICY_V2 run
```

Task 010 never reclassifies a Game, creates a concept from engine loss, launches a new engine job, changes ontology `1.0.0`, or rewrites a completed Task 008/009 artifact.

## Inspected boundaries

- `PlayerSkillGraphApplicationService` resolves one explicit published ontology through the narrow `PublishedOntologySnapshotReader` contract and never calls `latest`.
- Migration 010 and `PlayerSkillGraphRepository` already persist exact Game/evidence lineage and an `input_snapshot_sha256` containing selected immutable evidence IDs. This identity can distinguish same-day inputs after new evidence arrives.
- Task 008 negative decision facts retain `bestMoveUci`; positive decision facts retain the sound `playedMoveUci`; both retain exact occurrence, classification, analysis, concept, and history provenance.
- Task 004 `engine_position_states` retain `initial_fen`, ordered `history_uci`, history SHA-256, side to move, and exact occurrence. A normalized Position ID is not used as exercise identity.
- Ontology `1.0.0` defines `training.attempt` with positive/negative polarity and a `DIRECT` policy for the four V1 tactical targets: fork, pin, skewer, and discovered attack.
- Existing provenance has a permission basis but no explicit global derived-training-reuse grant. V1 therefore restricts diagnostic source search to the focal Player's selected canonical-Game corpus.

## Domain policy

- `TRAINING_CANDIDATE_POLICY_V1` separates `REMEDIATION` from `DIAGNOSTIC`, uses ordinal tuple ordering, models prerequisite readiness as `READY`, `OBSERVED_NOT_READY`, `UNVERIFIED`, or `NOT_APPLICABLE`, and applies a versioned 14-day source cooldown.
- Remediation requires `ESTIMATED`, `MODERATE` or `HIGH` confidence, an `EMERGING` or `DEVELOPING` band, and eligible focal-player negative decision evidence.
- Diagnostic covers `NO_EVIDENCE`, `INSUFFICIENT_EVIDENCE`, and V1 `LOW` confidence only when verifiable local source material exists. No source produces an explicit unavailable disposition, never a fabricated item.
- Only the four deterministically verifiable V1 tactical concepts can materialize items. Other concepts remain visible with an explicit unsupported/policy/no-source reason.

## Persistence and orchestration

- Migration 011 adds plan, candidate, item, attempt, and separate training-evidence tables with cross-player, cross-ontology, concept, exact-source, and ontology-policy foreign keys.
- Plan identity pins the exact Skill Graph run, all training policy/generator versions and hashes, and `maxItems`; identical successful inputs deduplicate.
- Item creation rechecks exact history, move legality, motif identity, persisted engine compatibility, and ontology policy before inserting immutable answer truth.
- Attempt submission validates a legal UCI move server-side in one transaction and persists both the immutable attempt and ontology-resolved evidence. Public item reads never return accepted moves before a scored submission.

## Skill Graph V2

- `SKILL_GRAPH_POLICY_V1` and its persisted runs remain unchanged.
- V2 reuses V1 Game selection, role weights, Game correlation cap, recency, Beta(2,2), and mastery bands.
- `TRAINING_EVIDENCE_SELECTION_V1` selects only the first scored attempt for each Player + TrainingItem. Retries remain visible but add zero independent mastery mass.
- Training items are their own independence units. V2 exposes Game mass/counts and training mass/counts separately, applies versioned source weights (`0.5` personal remediation replay, `1.0` diagnostic), and computes confidence from the combined independent-unit count.
- The exact sorted Task 008 and selected training-evidence IDs plus selection-policy metadata form the V2 evidence snapshot. Every training contribution persists exact lineage to evidence, attempt, item, Task 008 source evidence, Game, and occurrence.

## Product surfaces

- Add plan create/read, item read, attempt create/read, and explicit Skill Graph V2 generation through repository-consistent Fastify routes.
- Add `/training` for exact Player and Skill Graph-run selection, candidate explanation, exact-position display, UCI submission, solution reveal after scoring, retry history, and training-evidence disclosure.
- Language uses Practice, Assessment, Need more evidence, and Prerequisite not yet verified; it never labels unknown evidence as weakness.

## Verification

- Pure domain tests cover candidate eligibility, sparse/unknown semantics, prerequisite readiness and ordering, cooldown, first-attempt selection, source weighting, V1 regression, V2 posterior/confidence, and snapshot determinism.
- PGlite tests cover migrations 001–011, plan idempotency, source/answer validation, solution hiding, legal/illegal attempts, immutable retries, ontology role persistence, V2 selection and full lineage, and player/ontology isolation.
- Run Prettier, ESLint, strict TypeScript, the full regression suite, production Next.js build, Graphify incremental inspection, and browser QA when runtime support is available. Record real PostgreSQL and optional Stockfish gaps honestly.
