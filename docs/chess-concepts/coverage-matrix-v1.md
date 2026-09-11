# Chess concept coverage matrix V1

CONCEPT_COVERAGE_REPORT_V1 is the support registry for immutable ontology 1.0.0. The runtime
projection is implemented in packages/domain/src/concept-coverage.ts. Every concept has exactly
one status.

## Counts

| Status                   | Count | Meaning                                                                                 |
| ------------------------ | ----: | --------------------------------------------------------------------------------------- |
| TRAINABLE_V1             |     8 | Deterministic decision motif, exact-history engine-gated mastery, local training source |
| CLASSIFIABLE_DECISION_V1 |     0 | Reserved for supported decisions without a V1 item generator                            |
| OBSERVABLE_CONTEXT_ONLY  |     5 | Neutral position exposure; zero mastery mass                                            |
| DEFERRED                 |    15 | High-value concept with a documented precision blocker                                  |
| ONTOLOGY_ONLY            |    36 | Product vocabulary only; no automated evidence claim                                    |
| Total                    |    64 | All concepts in ontology 1.0.0                                                          |

## Trainable

tactics.fork, tactics.pin, tactics.skewer, tactics.discovered_attack,
tactics.interference, tactics.overload, tactics.removal_of_defender, and tactics.back_rank.

## Context only

pawn_structure.isolated_queen_pawn, pawn_structure.hanging_pawns,
pawn_structure.doubled_pawns, pawn_structure.passed_pawn, and pawn_structure.pawn_majority.

## Deferred

- Sequence evidence required: tactics.deflection, tactics.decoy, tactics.clearance,
  tactics.zwischenzug, tactics.mating_net, pawn_structure.minority_attack,
  calculation.forcing_moves.
- A new conservative positional policy required: pawn_structure.backward_pawn,
  strategy.open_file, strategy.outpost, strategy.weak_squares,
  endgame.king_activity, endgame.opposition, opening.development, opening.king_safety.

## Ontology only

- Domains: all seven domain concepts.
- Calculation: candidate_moves, visualization, calculation_depth, verification,
  opponent_resources.
- Strategy: piece_activity, space, initiative, prophylaxis, exchange_decision,
  pawn_break, king_safety.
- Opening: center_control, tempo, piece_coordination, move_order, premature_queen_activity.
- Endgame: key_squares, triangulation, passed_pawn, rook_activity,
  rook_behind_passed_pawn, lucena, philidor.
- Decision: threat_identification, position_evaluation, plan_selection, reassessment,
  time_management.

The UI must distinguish system unsupported, supported with no evidence, and supported with
insufficient evidence. None of those states is negative mastery evidence.
