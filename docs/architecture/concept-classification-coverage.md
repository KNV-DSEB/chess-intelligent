# Concept classification coverage

## Version boundary

CONCEPT_CLASSIFIER_BUNDLE_V1 remains selectable and resolves the original V1 position,
tactical-motif, and decision classifiers. CONCEPT_CLASSIFIER_BUNDLE_V2 is the default for new
runs and resolves V2 classifier identities plus a distinct configuration hash.

The bundle is explicit on classification and Skill Graph requests. Classification selection,
Skill Graph identity, TrainingPlan identity, and item materialization all retain the bundle and
configuration hash. Historical rows are never rewritten.

## V2 deterministic facts

- Removal of defender requires capture of the target's sole defender, continued opponent attack,
  and zero remaining defenders.
- Interference requires an empty destination placed strictly between a sole enemy slider defender
  and a meaningful attacked target.
- Overload requires one enemy piece to be the sole defender of at least two attacked meaningful
  targets, with the played piece creating at least one attack.
- Back rank requires actual checkmate, a rook/queen rank check, a king on its home rank, and at
  least two friendly pieces blocking the forward escape band.
- Hanging pawns require exactly one c-pawn and one d-pawn with no b- or e-pawn for that side.

All new rules prefer false negatives. Positive/negative decision evidence still requires an
independently detected motif and exact-history-compatible engine state. Neutral motif and
structure rows never prove mastery.

## Coverage semantics

Decision coverage counts occurrences, classified decisions, exact engine-backed decisions, and
mastery-eligible evidence separately. Evidence-row count is never substituted for decision
coverage. CONCEPT_COVERAGE_REPORT_V1 reports system capability, not Player observations.
