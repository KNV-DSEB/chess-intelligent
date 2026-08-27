# Concept evidence classification

Task 008 turns exact canonical game decisions into conservative, machine-readable evidence against an immutable Task 007 ontology version. It records observable chess facts; it does not estimate mastery, weakness, confidence, psychology, or training priority.

## Fact, evidence, and mastery

- A **fact** is deterministic classifier output, such as a knight attacking two meaningful targets or White having two pawns on the b-file.
- An **evidence instance** is a fact admitted by the selected ontology's exact concept/evidence policy and attached to one canonical game occurrence.
- **Mastery** is a future aggregation over evidence. Task 008 has no mastery schema, score, weight, threshold, or UI.

Neutral structural and tactical evidence means only that a feature or motif occurred. It is not evidence that a player understood the concept. Positive or negative `decision.classification` evidence requires a compatible Task 004 run plus an independently detected tactical motif.

## Classification path

```text
Canonical Game + PositionOccurrence
        │ exact initial FEN + ordered UCI history
        ▼
chess-core deterministic classifiers
        │ concept stable ID + evidence type + polarity + facts
        ▼
domain ontology-policy resolver
        │ active concept + allowed evidence + allowed polarity + resolved role
        ▼
transactional immutable classification run and evidence instances
        │
        ├── versioned read API
        └── game Concept Evidence UI
```

Classifiers cannot write to PostgreSQL. `packages/chess-core` owns board geometry and legal move reconstruction, `packages/domain` owns classifier contracts and ontology-policy enforcement, the API application service orchestrates the exact history, and `packages/db` persists and projects immutable results.

## Subject and polarity semantics

`POSITION` evidence is occurrence-scoped, has no player subject, and is always `NEUTRAL`. V1 structural facts use this form.

`DECISION` evidence names the player and color that moved. Objective move-created tactical motifs are still `NEUTRAL`. `POSITIVE` and `NEGATIVE` decisions additionally reference the one selected compatible analysis run.

Evidence roles are never chosen by a classifier. The domain resolver looks up the exact `(ontology version, concept stable ID, evidence type)` policy and supplies `DIRECT`, `SUPPORTING`, or `CONTEXTUAL`. The database repeats this rule with a composite foreign key. Unknown concepts/evidence types, inactive concepts, disallowed pairings, and invalid polarities fail the whole transaction.

## Engine selection and exact history

Pure position and motif classification works without Stockfish. For decision evidence, an explicitly requested successful `QUICK_V1` profile-version-1 run is used, or the newest compatible successful run is selected deterministically. A classification uses at most one analysis run.

Before engine facts are accepted, every occurrence must match:

- canonical game ID and occurrence ply;
- canonical initial FEN;
- ordered UCI history and `exactHistorySha256`;
- normalized pre-move position ID and side to move;
- played move.

A normalized Position ID is not sufficient. Missing, partial, illegal, or history-incompatible engine state rejects decision classification instead of silently falling back. Neutral classification remains possible by running without an explicit incompatible engine selection.

## Runs, idempotency, and immutability

`CONCEPT_CLASSIFIER_BUNDLE_V1` has a SHA-256 hash over its centralized configuration. A successful run is uniquely identified by game, ontology version, classifier bundle, classifier configuration hash, and selected analysis run (including the no-engine case). Repeating that input returns the existing run.

Evidence is inserted in the same transaction as the completed run. The application has no update or delete path. New rules require a new classifier/bundle/config version and a new immutable run; historical evidence keeps its original ontology version and renders by joining that exact version's definition.

## API

- `POST /classification/games/:gameId` accepts `ontologyVersion` and optional `analysisRunId`.
- `GET /classification/runs/:id` returns run metadata and ordered evidence.
- `GET /games/:id/concept-evidence` returns the latest successful run by default; `classificationRunId` selects one run and `concept` filters one exact stable ID.

The projection includes ontology-resolved display metadata, exact classifier/rule provenance, history hash, and engine run ID when used. The no-engine limitation is explicit.

## Ontology 1.0.0 gaps

The published ontology is immutable and was not changed for Task 008. It has no distinct `tactics.discovered_check`, `pawn_structure.protected_passed_pawn`, or `strategy.semi_open_file` stable ID. Therefore:

- discovered checks are high-confidence facts under `tactics.discovered_attack` with `discoveredCheck: true`;
- protected passed-pawn squares are compact subtype facts under `pawn_structure.passed_pawn`;
- semi-open files are detectable chess-core facts but not persisted as concept evidence;
- `strategy.open_file` is not persisted because ontology 1.0.0 does not admit `position.structural_feature` for it.

Adding distinct concepts or policies requires a future ontology semantic version, never an in-place edit.

## Precision boundary

V1 prefers no classification over uncertainty. It deliberately defers semantic and counterfactual concepts such as deflection, decoy, overload, interference, removal of defender, zwischenzug, mating net, piece activity, king safety, prophylaxis, exchange decisions, pawn breaks, and position evaluation. A generic centipawn or mate event never identifies a chess concept by itself.
