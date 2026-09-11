# Training coverage V1

## Generator identities

TACTICAL_TRAINING_ITEM_GENERATOR_V1 supports the four original tactical concepts and remains
selected for a V1 classifier graph. TACTICAL_TRAINING_ITEM_GENERATOR_V2 supports eight tactical
concepts and is selected only for a V2 classifier graph.

## Supported targets

Fork, pin, skewer, discovered attack, interference, overload, removal of defender, and back rank
can produce FIND_BEST_MOVE items.

Materialization still requires:

- an explicit immutable SkillGraphRun;
- ontology-valid Task 008 decision evidence;
- the exact compatible classifier bundle/configuration;
- one exact-history-compatible QUICK_V1 Task 004 engine state;
- legal accepted move reconstruction;
- re-detection of the same target motif under the pinned classifier bundle.

No new engine search, external puzzle, LLM-generated move, generic engine loss, neutral position
fact, or unsupported ontology concept can create an item. Remediation and diagnosis remain
distinct; missing evidence remains unknown.
