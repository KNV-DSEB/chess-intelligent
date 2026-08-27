# Opponent opening intelligence

Task 005 synthesizes two trusted but independent layers into a preparation workflow:

```text
verified local identity
        ↓
opponent historical observation ─┐
strong local reference corpus ───┼─▶ preparation candidate
compatible completed engine run ─┘
```

A candidate is a branch worth studying under explicit V1 rules. It is not a best move, guaranteed counter, weakness claim, or psychological inference.

## Identity and color semantics

Preparation starts from a verified local `ExternalIdentity`; the UI resolves exact FIDE IDs. Names do not participate in resolution, and no FIDE, Chess-Results, Lichess, Chess.com, or other external request occurs.

`opponentColor` is deliberately concrete:

- `WHITE`: query only games where the opponent was White; the preparing side is Black.
- `BLACK`: query only games where the opponent was Black; the preparing side is White.

Outcomes in opponent observations use `FOCAL_OPPONENT`: White score when the opponent was White and Black score when the opponent was Black. Reference and soundness evidence use the preparation-side perspective.

## Position tree and corpus scope

The tree traverses persisted normalized pre-move positions and resulting positions. At an opponent-to-move node, it returns observed choices. At a preparation-side node, it returns candidates sourced only from the strong reference corpus or directly compatible completed MultiPV evidence. Chess Core derives SAN and resulting identity for engine-only moves; HTTP and UI code do not calculate chess state.

Queries select one occurrence per canonical game. Repeated positions and multiple provenance observations cannot inflate samples. FIDE identity, opponent color, context, time category, inclusive dates, historical opponent rating, and source filters apply before aggregation. Missing historical ratings do not pass a minimum. The default is OTB plus Classical; empty/expanded filter arrays must be sent explicitly to broaden the corpus.

Task 005 computes reports from live canonical data. It adds no opening copy and no report snapshot. The API returns `generatedAt`, effective filters, and rule/profile versions so the result remains interpretable; immutable snapshots can be added later if there is a concrete audit requirement.

## Recency and repertoire trends

The recent window is centralized as the 12 calendar months ending on the injected application clock date. All-available observations remain visible. For trend comparison, historical means dated games before the recent boundary; games with an unknown date remain in all-available totals but cannot be assigned to either time window.

`REPERTOIRE_TREND_V1` uses these rules in order:

1. Fewer than 3 recent position games is `INSUFFICIENT_DATA`.
2. At least 2 recent move games and zero historical move games is `NEW`.
3. At least 2 historical move games and zero recent move games is `DORMANT`.
4. Fewer than 3 historical position games is `INSUFFICIENT_DATA`.
5. Recent minus historical frequency of at least `+0.15` is `INCREASING`; at most `-0.15` is `DECREASING`; otherwise it is `STABLE`.

Counts, denominators, frequencies, and the delta remain available alongside the label.

## Familiarity and predictability

`OPPONENT_FAMILIARITY_V1` measures only exposure observed in the selected opponent corpus:

```text
0.60 × all frequency
+ 0.25 × recent frequency
+ 0.15 × min(games seen / 5, 1)
```

The result is clamped to `[0, 1]`. Raw games seen, position denominators, recent counts, last-seen date, W/D/L, and focal-opponent score remain visible. Zero games means never observed in the selected corpus; it does not prove real-world unfamiliarity.

`REPERTOIRE_PREDICTABILITY_V1` exposes top-move share. Samples below 3 are `INSUFFICIENT_SAMPLE`; otherwise at least 70% is `HIGH`, at least 45% is `MEDIUM`, and lower is `LOW`. This is statistical concentration, not personality analysis.

## Strong-player reference corpus

`STRONG_REFERENCE_V1` uses local OTB/Classical games where both historical game-recorded ratings are at least 2400. Unknown ratings do not qualify. Results use the side-to-move/preparation perspective.

Raw games, W/D/L and score are returned. A symmetric four-game/two-point prior gives the conservative adjusted score:

```text
(wins + 0.5 × draws + 2) / (games + 4)
```

Reference evidence below 3 games is explicitly `INSUFFICIENT_SAMPLE`. Representative games rank by higher minimum rating, higher average rating, newer date, metadata presence, then stable game ID. Provenance is summarized without joining it into the statistical unit.

## Engine compatibility and soundness

Only `SUCCEEDED` Task 004 runs contribute. Evidence must join a filtered focal game occurrence by exact `(game_id, occurrence_ply)` to its run-specific `engine_position_state`; equality of normalized position IDs alone is insufficient. If successful evidence exists only for another occurrence/history, the status is `INCOMPATIBLE_ENGINE_STATE`. If none exists, it is `NOT_AVAILABLE`. Pending, running, failed, and partial runs never contribute.

Available evidence retains run ID, occurrence and history hash, engine identity and binary hash, profile/version, search budget, White-relative structured score, PV rank, PV, and search measurements.

`ENGINE_SOUNDNESS_V1` first converts White-relative scores to the preparation-side perspective. Centipawn scores at least -50 are `SOUND`, at least -150 `PLAYABLE`, at least -300 `RISKY`, and lower `ENGINE_DISFAVORED`. A winning mate is `SOUND`; a losing mate is `ENGINE_DISFAVORED`. Mate remains structurally distinct. This classification is configured-search evidence, not practical value.

## Candidate evidence and ordering

Each candidate keeps three independently queryable panels:

- opponent observation/familiarity;
- strong-reference availability, raw and adjusted statistics, and games;
- engine availability, soundness, evaluation, and reproducibility provenance.

`PREPARATION_INTEREST_V1` is a visible ordinal study-priority heuristic. Unfamiliarity contributes 2 points below 0.20 and 1 below 0.50; reference support contributes 2 for 10+ games and 1 for 3+; engine evidence contributes 2 for `SOUND`, 1 for `PLAYABLE`, 0 for missing/risky, and -2 for `ENGINE_DISFAVORED`. Totals at least 5 are `HIGH`, at least 2 `MEDIUM`, otherwise `LOW`.

Candidates sort by interest band, reference sample, lower observed familiarity, then UCI. Every component is returned. The heuristic is not statistically validated chess truth and never produces a `BEST_MOVE` label.

## API and performance

- `GET /players/:id/opening-profile` returns usable coverage, White root behavior, and grouped Black replies.
- `POST /preparation/opponent` returns selected-color coverage, the root node, and deterministic early-ply hotspots.
- `POST /preparation/opponent/position` returns one node, avoiding an unbounded tree response.

PostgreSQL performs canonical filtering, grouping, representatives, and exact engine joins. PGNs are not reparsed. Queries are constant in count per node rather than one query per candidate. Migration 006 adds only player/color/game, game/position/ply, compatible state, and MultiPV-root indexes.
