# Pilot 001C information architecture

## Product loop

```text
Game
→ Decision
→ Pattern
→ Skill evidence
→ Player model
→ Priority
→ Training
→ Attempt
→ New evidence
→ Updated player model
```

The Web experience follows this order. Internal artifacts remain accessible as provenance but do
not define the primary navigation or headline hierarchy.

## Coach navigation

```text
Home        actionable student signals and recent verified activity
Students    searchable academy roster and per-student evidence state
Training    active assignments and training activity
Progress    neutral completion plus links to compatible snapshot comparison
```

Opponent preparation, import, ontology, coverage, and academy administration are secondary
Academy tools. Coach routes remain Academy-scoped and authorization continues to derive from the
authenticated membership, never a browser-supplied membership ID.

## Student navigation

```text
Today       current assignment and next exercise
Training    assigned diagnostic/practice positions
Progress    verified learning picture and evidence states
```

There is no Student Games destination in V2 because the existing Student API does not expose a
supported Academy-scoped game list. The interface does not invent one.

## Screen hierarchy

- **Coach Home:** attention ledger → roster → training in motion → neutral progress → advanced
  academy settings.
- **Student Intelligence:** identity → readiness and next action → evidence coverage → 3–5
  evidence-backed priorities → grouped Skill Map → evidence drilldown → training choice →
  assignments → compatible progress.
- **Evidence:** exact position → move sequence → classification meaning → engine provenance → all
  contribution lineage.
- **Student Today:** current assignment → positions → learning picture → optional AI explanation.
- **TrainingItem:** position → move commitment → result/retry context → advanced evidence.

## Route compatibility

The reconstruction reuses the existing `/academy`, Academy Student Intelligence, assignment,
Student self-service, game, analysis, and training-item boundaries. No API route, persistence
model, policy, classifier, ontology, or Pilot event name changes in Pilot 001C.
