# Task 009 — Player Skill Graph & Mastery Estimation V1

## Outcome

Add an immutable, versioned interpretation layer over Task 008 concept evidence. A Skill Graph run pins one published ontology version, one classifier compatibility tuple, one evidence scope, one explicit as-of date, and one Task 009 policy configuration. It never reclassifies chess data and never mutates historical classification runs or evidence instances.

## Boundaries

- Resolve the requested ontology exactly once through `OntologyRepository.getPublishedVersion(version)`, construct one `OntologyRegistry`, and reuse its in-memory graph.
- Select at most one compatible successful classification run per canonical Game under `CLASSIFICATION_SELECTION_V1`; never use an implicit latest-run repository fallback.
- Build coverage from the focal-player decision universe and left-join selected runs, decision evidence, and exact-history engine context. Missing classification or engine data is `UNKNOWN`, never negative evidence.
- Only focal-player `DECISION` evidence with `POSITIVE` or `NEGATIVE` polarity can affect mastery. `POSITION` and `NEUTRAL` evidence are exposure only. `CONTEXTUAL` has zero V1 mastery weight.

## Aggregation

- Apply persisted historical roles using `DIRECT = 1`, `SUPPORTING = 0.5`, `CONTEXTUAL = 0`.
- Group eligible evidence by canonical Game and concept, cap each group at total mass `1`, preserve its positive/negative ratio, then apply a 365-day date-only half-life from the explicit `asOfDate`.
- Use a Beta(2, 2) posterior heuristic. Expose posterior inputs, effective evidence mass, evidence confidence, coverage, and descriptive mastery bands; do not infer weakness, strength, psychology, or training priority.
- Persist exact per-game contributions and a normalized bridge from every effective contribution to each source `concept_evidence_instances.id`.

## Persistence and read surfaces

- Migration 010 adds immutable Skill Graph runs, selected-classification-run lineage, player concept states, per-game contributions, and exact evidence contribution lineage.
- A deterministic input snapshot hash makes an identical run idempotent while allowing a new run when compatible Games, decisions, selected classification runs, or evidence change.
- Add generation, run retrieval/history, and concept drill-down APIs plus `/intelligence/skills` with coverage-first presentation and policy disclosure.

## Verification

- Pure domain tests cover role weights, neutral/contextual exclusion, game correlation, date-only recency, Beta posterior, confidence thresholds, mastery bands, deterministic output, and exact evidence lineage.
- PGlite API/repository tests cover explicit ontology pinning, focal-player color attribution, compatible one-run-per-Game selection, coverage denominators, UNKNOWN gaps, idempotency, persistence reconstruction, scope filters, and cross-version isolation.
- Run formatting, lint, strict typecheck, full tests, production web build, migrations 001–010, and browser QA where the local runtime is available.
