# Player Skill Graph and mastery estimation

Task 009 is an immutable interpretation layer over Task 008 evidence. It answers what the currently selected evidence suggests about competence on each concept. It does not derive chess facts, classify moves, infer weaknesses, select training, or generate narrative.

## Trusted boundary

```text
Task 008 immutable ConceptEvidenceInstance
        ↓ explicit compatible-run selection
focal-player decision/evidence projection
        ↓ versioned Task 009 policies
immutable PlayerSkillGraphRun
```

Generation requires an explicit published ontology version. `PlayerSkillGraphApplicationService` depends on the narrow `PublishedOntologySnapshotReader` contract, calls `OntologyRepository.getPublishedVersion(version)` once, creates one `OntologyRegistry`, and reuses its in-memory graph. It never calls an ontology `latest` path or depends on `OntologyApplication`.

Task 009 uses the historical `evidence_role` persisted by Task 008. It does not reinterpret an old evidence instance through a newer ontology policy. Numeric role weights are separate, versioned Task 009 policy.

## Selection and coverage

`CLASSIFICATION_SELECTION_V1` filters successful classification runs by exact ontology version, classifier bundle, classifier configuration hash, and compatible analysis semantics. V1 prefers an engine-backed compatible run, then the latest completion timestamp and ID. At most one run is selected per canonical Game. The policy version is part of Skill Graph identity.

Coverage begins with all focal-player decisions in selected canonical Games and left-joins the selected run, focal-player `DECISION` evidence, and the selected run's compatible engine states:

- `decisionOccurrences`: distinct focal-player position occurrences;
- `classifiedDecisions`: distinct decisions with at least one compatible persisted focal-player `DECISION` evidence row;
- `engineBackedDecisions`: distinct decisions covered by the selected classification run's exact-history-compatible analysis run;
- `masteryEligibleEvidence`: exact focal-player positive/negative `DECISION` evidence rows with a nonzero V1 role weight and engine provenance.

Missing classification and missing engine context are coverage gaps. They are `UNKNOWN`, never negative mastery evidence. Counts are based on canonical Games and distinct decisions, not evidence-row or provenance-observation counts.

## Evidence interpretation

Only `subjectKind = DECISION` and `subjectPlayerId = focalPlayerId` may update mastery. Opponent evidence is excluded. `POSITION` and `NEUTRAL` evidence can contribute exposure counts but add zero posterior mass. `CONTEXTUAL` evidence also adds zero V1 mastery mass.

Eligible evidence is grouped by canonical Game and concept. Task 009 applies persisted role, role weight, a maximum one-unit contribution per Game while preserving polarity proportions, date-only recency decay, and then a Beta posterior heuristic. Prerequisites, dependents, and hierarchy are exposed for navigation only; no mastery propagates upward or across prerequisite edges.

## Immutable model and lineage

Migration 010 adds:

- `player_skill_graph_runs`: player, explicit ontology/classifier/policy identity, scope, as-of date, deterministic input snapshot hash, and coverage;
- `skill_graph_selected_classification_runs`: exact one-run-per-Game selection provenance;
- `player_concept_states`: posterior inputs, evidence mass, counts, confidence, and descriptive band without copied display labels;
- `player_concept_game_contributions`: raw, capped, recency, and effective Game-level mass;
- `skill_graph_evidence_contributions`: normalized bridge to exact `concept_evidence_instances.id` values with historical role, polarity, and pre-cap weight.

The input snapshot hash covers selected Games, decision coverage states, selected classification runs, evidence IDs, player, and as-of date. Identical configuration and inputs return the existing successful run. Changed evidence, selection, scope, policy, ontology, or as-of date creates a new immutable identity.

The concept detail read path reconstructs effective positive/negative mass and Beta parameters from persisted Game contributions, while every Game contribution reaches its exact Task 008 evidence rows and their position, classifier, history hash, and analysis provenance.

## Status and presentation

`NO_EVIDENCE` means no mastery-eligible positive/negative evidence. The prior mean is not shown as player mastery. `INSUFFICIENT_EVIDENCE` means some eligible evidence exists but minimum mass/game criteria are not met. `ESTIMATED` permits a descriptive mastery band. Evidence confidence describes evidence quantity and independence protection, not player psychology.

The API exposes generation, immutable run retrieval/history, and concept drill-down. `/intelligence/skills` shows coverage before the graph, hides ordinary percentages for no/insufficient evidence, distinguishes neutral exposure, discloses policy, and links exact evidence back to existing Game views.

## Non-goals

Task 009 contains no weakness/strength ranking, training priority, lesson, exercise, adaptive scheduling, player comparison, BKT/IRT, mastery propagation, external provider request, AI summary, or LLM behavior.
