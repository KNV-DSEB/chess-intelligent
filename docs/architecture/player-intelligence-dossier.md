# Player Intelligence dossier

Task 006 adds a live, evidence-first read model over canonical games, Task 005 repertoire observations, and Task 004 engine evidence. A dossier is not persisted as a snapshot and contains no generated narrative. Every derived section retains its coverage, denominator, metric version, and supporting game or run identity where applicable.

## Exact identity semantics

`POST /intelligence/player-dossier` accepts exactly one local `playerId` or exact verified FIDE identity. FIDE resolution is a local database lookup. Names, handles, other accounts, and external provider requests are never fallback identity mechanisms. An exact local player ID may represent a player without a verified external identity; the ID itself is the explicit identity key.

## Evidence model and coverage

The repository first selects canonical games through `game_players`. Source filters use `EXISTS`, so several `GameSourceRecord` observations cannot multiply a game. The dossier reports canonical games, games with moves, metadata-only games, color/context/time-category splits, the known date range, engine-eligible games, compatible selected analysis games, and the engine-coverage ratio.

`DOSSIER_EVIDENCE_QUALITY_V1` measures evidence sufficiency, not player quality. Its transparent inputs are usable game count, compatible engine coverage, opponent-rating completeness, and whether the latest known game is within 18 months. Fewer than five games with moves is always `INSUFFICIENT`.

## Focal-player performance

W/D/L and score are converted from stored game results into the focal player's perspective. Unresolved results remain a separate count. Historical opponent ratings are placed into fixed V1 bands: under 1800, 1800–1999, 2000–2199, 2200–2399, 2400+, and unknown. Missing ratings remain unknown. Yearly summaries and the recorded rating timeline describe stored game observations; the timeline is not an inferred or official rating history.

## Repertoire evidence

The dossier calls the filtered Task 005 repertoire read model, so root frequency, recent-window frequency, trends, predictability, and Black responses use the same filters and algorithms as opponent preparation. Task 006 adds `REPERTOIRE_BREADTH_V1`: Shannon entropy, effective branch count, and top-move share. The result remains descriptive historical intelligence and never labels a move best or recommended.

## Engine-run selection and decision quality

`ENGINE_AGGREGATION_V1` selects the newest completed successful run for `QUICK_V1` profile version 1 per canonical game. Selection happens in PostgreSQL with `DISTINCT ON (game_id)` before assessment joins. Older immutable runs remain stored but are not counted as independent player evidence.

Every engine section exposes selected run IDs, engine family/name/version, binary hash, engine options, search limit, MultiPV, detector version, profile/version, and timestamps. Persisted evaluations remain White-relative. Player-facing opportunity scores and loss semantics use the focal-player perspective.

`DECISION_QUALITY_V1` includes only plies played by the focal player. Centipawn-valid assessments report mean, median, and fixed bands of 0–19, 20–74, 75–199, and 200+. Mate outcomes remain structural `MATE_*` events and never enter centipawn aggregates. `GAME_PHASE_V1` classifies the exact pre-move FEN with a versioned material/queen heuristic plus an early-ply condition; it is not a pure move-number label.

## Conversion and recovery

`ADVANTAGE_CONVERSION_V1` creates at most one opportunity per game: the first selected-run state where the focal score reaches +150 cp or a winning mate. A win is a successful conversion.

`DISADVANTAGE_RECOVERY_V1` similarly uses the first state at −150 cp or a losing mate. A draw or win is a successful non-loss recovery. Both metrics expose wins, draws, losses, unresolved results, rates, the first opportunity ply/phase/score, canonical game, and selected analysis run. They are QUICK_V1-dependent heuristics and not absolute ability scores.

## Critical patterns

Only focal-player decision occurrences contribute player-decision events: `EVAL_LOSS`, `SEVERE_EVAL_LOSS`, `ADVANTAGE_DROPPED`, `MATE_MISSED`, and `MATE_ALLOWED`. `HIGH_DECISION_SENSITIVITY` is reported separately as position complexity, not an error. Aggregates expose event count, games affected, per-analyzed-game and per-100-analyzed-move rates, phase, recent/all raw comparison, and drill-down evidence.

Repeated events are observed recurrence. Task 006 deliberately does not call them weaknesses, skills, concepts, motives, or personality traits. Concept classification and prerequisites belong to Task 007's future ontology.

## Objective behavior and drill-down

Objective V1 indicators are game length, draw/decisive rates, recorded king-side/queen-side/no-castling-move counts by focal color, repertoire concentration/breadth, and `QUEEN_TRADE_TIMING_V1` based on the first persisted post-move state without either queen. These are recorded actions, not psychological interpretations.

Critical, conversion, recovery, representative repertoire, and selected-run sections retain canonical game/run IDs. The web UI keeps coverage first and places the evidence tables behind progressive disclosure so a coach can move from an aggregate to the supporting game.

## Query shape

The game-fact query produces one row per canonical focal game and aggregates move count, castling, queen-trade timing, and source types without N+1 reads. The engine query filters the same canonical corpus, performs profile/version-aware latest-run selection, then joins only those selected runs to assessments, evaluations, exact occurrence positions, and critical reasons. Migration 007 adds partial/run and focal-assessment indexes; no duplicate dossier or opening-statistics tables are introduced.
