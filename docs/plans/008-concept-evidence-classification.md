# Task 008 — Game Decision → Concept Evidence Classification V1

## Outcome and scope

Create the first immutable bridge from canonical game occurrences to versioned chess-concept evidence. The pipeline reconstructs exact game history, derives deterministic board/move facts in chess-core, produces conservative evidence candidates, resolves admissibility and role against an explicit published ontology version, and transactionally persists a reproducible classification run. It does not estimate mastery, infer weakness, weight evidence, recommend training, or call an LLM.

V1 deliberately targets eight ontology identities that have precise rules and compatible Task 007 policies: `tactics.fork`, `tactics.pin`, `tactics.skewer`, `tactics.discovered_attack`, `pawn_structure.isolated_queen_pawn`, `pawn_structure.doubled_pawns`, `pawn_structure.passed_pawn`, and `pawn_structure.pawn_majority`. Ontology 1.0.0 remains unchanged. Missing identities (`tactics.discovered_check`, `pawn_structure.protected_passed_pawn`, `strategy.semi_open_file`) and the absence of `position.structural_feature` policy for `strategy.open_file` are documented gaps, not silently remapped concepts. Protected passed-pawn squares remain a structured subtype fact of `pawn_structure.passed_pawn`.

## Chess facts and classifier rules

- Add pure, color-aware board geometry to `packages/chess-core` using the existing `chess.js` boundary.
- Position facts operate on exact pre-move FEN and emit one fact per concept, side, and occurrence with compact deterministic square/file/wing metadata.
- Tactical facts operate on an exact legal UCI move. Fork requires the moved piece to attack at least two non-pawn meaningful targets. Pin is absolute only: moved slider → enemy piece → enemy king. Skewer is king-front only: moved slider → enemy king → meaningful piece behind. Discovered attack requires the move to uncover a different friendly slider onto a meaningful target; discovered check is recorded as a subtype under the existing `tactics.discovered_attack` identity.
- Neutral motif occurrence is independent of engine evidence. Positive/negative `decision.classification` is emitted only when a compatible exact-history Task 004 state exists.
- Positive threshold is played motif plus played move = engine best move or centipawn loss ≤20. Negative threshold is independently detected best-move motif, absent from the played move, plus loss ≥75 or `MATE_MISSED`/`MATE_ALLOWED`. Generic loss without a detected best-move motif emits no concept evidence.

## Domain and ontology enforcement

- Add typed classification run, subject, candidate, resolved evidence, engine-context, classifier, and API view contracts in `packages/domain`.
- Version the bundle as `CONCEPT_CLASSIFIER_BUNDLE_V1`, each classifier/rule explicitly, and calculate a deterministic classifier configuration SHA-256.
- A candidate cannot choose its evidence role. `OntologyRegistry` verifies the active concept, evidence definition, allowed polarity, and exact concept/evidence policy, then supplies the historical `DIRECT`, `SUPPORTING`, or `CONTEXTUAL` role.
- Normalize and sort candidates deterministically, then deduplicate on subject, occurrence, concept, evidence type, polarity, rule, and perspective before persistence.

## Exact-history and engine policy

- Move exact-history hashing into the shared domain engine contract so Task 004 and Task 008 use the identical `SHA-256(JSON({initialFen,moves}))` contract.
- Select at most one successful `QUICK_V1` profile-version-1 run: an explicitly requested compatible run, otherwise the newest completed compatible run by completion time and ID.
- Reconstruct every occurrence from the canonical initial FEN and ordered UCI moves. Engine input is usable only when game, occurrence ply, initial FEN, ordered-history hash, side to move, and played move all match.
- Structural and neutral tactical classification proceeds without an engine run; the response makes decision-evidence limitation explicit.

## Persistence and idempotency

- Migration 009 gives `position_occurrences` a durable UUID while preserving its existing `(game_id, ply)` identity.
- Add immutable `concept_classification_runs` and `concept_evidence_instances` with game/occurrence/player/analysis provenance, ontology/version-policy referential integrity, classifier/rule identity, exact-history hash, compact JSON facts, timestamps, and traversal indexes.
- Successful input identity is game + ontology version + bundle + configuration hash + selected analysis run (including the no-engine case). Repeating identical input returns the existing successful run. A different ontology, classifier configuration/version, or selected analysis run creates another immutable run.
- Classify in memory, then insert the run and all evidence in one transaction as `SUCCEEDED`. Validation failure writes no partial successful evidence.

## API and UI

- `POST /classification/games/:gameId` accepts ontology version and an optional explicit analysis run.
- `GET /classification/runs/:id` returns immutable run metadata plus ontology-resolved evidence.
- `GET /games/:id/concept-evidence` selects a requested run or the latest successful run and supports exact concept filtering.
- Add a client-side Concept Evidence panel to the existing PGN-backed game page. It can classify without engine evidence, clearly distinguishes neutral position/motif observations from positive/negative decision evidence, exposes rules/provenance, and contains no mastery or weakness language.

## Verification

- Unit tests cover all tactical geometry, structural color symmetry and rejection cases, deterministic ordering/deduplication, ontology policy rejection/role resolution, engine-supported positive/negative decisions, generic-loss safety, and player attribution.
- PGlite repository/API tests cover migrations 001–009, Task 007 sync, transactional persistence, idempotency, historical ontology lookup, exact-history compatibility, filtering, immutable multiple runs, and no mastery schema.
- Run formatting, lint, strict typecheck, full tests, production build, local browser workflow/responsive QA, and secret/temp audit. Use the established PGlite path and report the real-PostgreSQL gap if credentials remain unavailable.
