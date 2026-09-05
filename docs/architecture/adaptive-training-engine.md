# Adaptive Training Engine

Task 010 adds the first intervention and measurement loop over immutable Task 009 diagnosis:

```text
PlayerSkillGraphRun
  → TrainingPlanRun
  → TrainingCandidate
  → TrainingItem
  → TrainingAttempt
  → TrainingEvidenceInstance
  → explicitly requested PlayerSkillGraphRun V2
```

No step mutates the Skill Graph that produced the plan. A later training-augmented graph is a new immutable artifact with a new evidence snapshot.

## Diagnosis boundary

Every plan pins one exact `skillGraphRunId`; the database enforces matching Player and ontology version. Training persistence never resolves a latest graph.

`REMEDIATION` means sufficiently supported evidence justifies practice: an `ESTIMATED` state with `MODERATE` or `HIGH` confidence, an `EMERGING` or `DEVELOPING` band, and exact focal-player negative decision evidence. It is not a weakness label.

`DIAGNOSTIC` means more direct performance evidence is needed. `NO_EVIDENCE`, `INSUFFICIENT_EVIDENCE`, and V1 `LOW` confidence may receive an assessment only when a verifiable local item source exists. No source produces an explicit unavailable disposition; absence never produces negative mastery evidence.

## Prerequisites

Task 010 reads the pinned prerequisite DAG only for sequencing:

- `READY`: every prerequisite has sufficiently supported `ESTABLISHED` or stronger evidence;
- `OBSERVED_NOT_READY`: a prerequisite has sufficiently supported `EMERGING`/`DEVELOPING` evidence, so the dependent is deferred;
- `UNVERIFIED`: prerequisite evidence is absent, insufficient, or low-confidence; the dependent is annotated but not blocked solely by absence;
- `NOT_APPLICABLE`: no prerequisite exists.

No mastery mass propagates through prerequisite or hierarchy edges.

## Exact local source truth

V1 supports only `FIND_BEST_MOVE` for fork, pin, skewer, and discovered attack. These are the concepts Task 008 verifies deterministically and ontology `1.0.0` admits for `training.attempt`. Structural concepts remain explicitly unsupported.

Remediation uses an exact negative Task 008 contribution in the pinned Skill Graph lineage and the persisted engine-supported concept move. Diagnostic source search stays inside the focal Player's selected canonical Games and may use a positive decision by either side; its accepted move is the sound played move persisted by Task 008. Opponent evidence is source material, never focal-player Game mastery evidence.

Materialization reconstructs the position from `initialFen + ordered historyUci`, verifies `exactHistorySha256`, compatible successful `QUICK_V1` analysis, legal accepted move, persisted fact move, and the existing chess-core tactical motif. A normalized Position ID or generic engine loss cannot create an item. No network request, engine job, classifier expansion, synthetic position, or LLM is involved.

## Reveal, attempts, and evidence

Accepted UCI moves are immutable private item truth. Normal pre-attempt reads never expose them or source Game/ply. Guided remediation may reveal the concept; diagnostic items hide it until the first scored submission.

The server verifies submitted UCI legality from the exact position and compares it with private accepted moves. Illegal moves create no record. Every scored submission appends one immutable `TrainingAttempt`; retries never overwrite history. Timing is retained but has zero V1 mastery effect.

In the same transaction, the service resolves `training.attempt` against the exact published ontology version and concept. The ontology supplies the historical role. `CORRECT` maps to `POSITIVE`; `INCORRECT` maps to `NEGATIVE`. Training evidence has its own table because Game/classification/occurrence semantics do not apply.

## Training-augmented Skill Graph

`SKILL_GRAPH_POLICY_V1` remains unchanged. `SKILL_GRAPH_POLICY_V2` reuses V1 Game selection, historical roles, one-canonical-Game cap, 365-day recency, Beta(2,2), and mastery bands. It additively selects Task 010 evidence under `TRAINING_EVIDENCE_SELECTION_V1`:

- only the first scored attempt for one Player + TrainingItem contributes;
- the TrainingItem is the training independence unit;
- personal remediation replay has source multiplier `0.5`;
- diagnostic assessment has source multiplier `1.0`;
- role × source × recency produces effective training mass.

Concept states expose Game/training positive and negative mass, canonical Game count, TrainingItem count, and combined independent-unit count separately. Confidence V2 uses the combined denominator with V1 mass thresholds.

The evidence snapshot hashes sorted selected classification-run IDs, Task 008 evidence IDs, first-attempt training evidence IDs, selection policy versions, Player, ontology, and `asOfDate`. A newly selected scored item produces a new same-day run; an ignored retry leaves the snapshot unchanged.

## Lineage and immutability

Every V2 training contribution reaches:

```text
PlayerConceptState
  → player_concept_training_contributions
  → TrainingEvidenceInstance
  → TrainingAttempt
  → TrainingItem
  → TrainingCandidate
  → TrainingPlanRun
  → source ConceptEvidenceInstance
  → canonical Game + PositionOccurrence + AnalysisRun
```

Completed plans, items, attempts, evidence, V1 runs, and V2 runs have no normal update/delete path. Policy changes create new immutable artifacts.

## Non-goals

Task 010 contains no weakness prose, LLM coaching, new classifier, new engine analysis, external puzzle corpus, global training pool, structural exercise, hints, lessons, coach assignment, spaced repetition, BKT/IRT, ranking, rewards, or notifications.
