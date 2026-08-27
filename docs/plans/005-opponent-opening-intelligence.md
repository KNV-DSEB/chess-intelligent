# Task 005 — Opponent Opening Intelligence V1

## Goal

Combine the local historical corpus and compatible completed engine runs into an evidence-first opponent-preparation workflow:

`exact FIDE identity → opponent/color corpus → repertoire position → preparation candidates → independent evidence`

This milestone does not claim a best counter. Historical frequency measures observed behavior, engine output measures evaluation under a reproducible search, and the preparation-interest band is only a versioned study-priority heuristic.

## Scope

- Resolve only verified local identities. No provider requests, fuzzy matching, or account inference.
- Add a read-only opening profile, a high-level opponent dossier, and a position preparation endpoint.
- Use normalized positions and canonical games. A repeated occurrence or duplicate provenance observation never multiplies a game.
- Default preparation filters to OTB/Classical and require users to opt into broader contexts or time categories.
- Compare all available games with a centralized rolling 12-month recent window.
- Generate preparation-side candidates from the local strong-player reference corpus and compatible `SUCCEEDED` Task 004 MultiPV evidence.
- Compute results from the preparation-side perspective while retaining raw W/D/L counts and engine scores in their stored White perspective.
- Compute reports on demand. V1 adds no report snapshot or duplicate opening database.

## Domain rules and versions

### `REPERTOIRE_TREND_V1`

The recent window is the 12 months ending on the service's injected clock date. The comparison baseline is games before that window; all-available counts remain visible independently.

- Fewer than 3 recent position games: `INSUFFICIENT_DATA`.
- A move with at least 2 recent games and no historical games: `NEW`.
- A move with at least 2 historical games and no recent games: `DORMANT`.
- Otherwise a recent-minus-historical frequency delta of at least `+0.15` is `INCREASING`; at most `-0.15` is `DECREASING`; otherwise `STABLE`.

### `OPPONENT_FAMILIARITY_V1`

The normalized score is clamped to `[0, 1]`:

`0.60 × allFrequency + 0.25 × recentFrequency + 0.15 × min(gamesSeen / 5, 1)`

Raw games, frequencies, last-seen date, W/D/L, and focal-opponent score remain visible. A never-observed move has zero observed familiarity; this is different from a missing evidence source.

### `REPERTOIRE_PREDICTABILITY_V1`

For at least 3 games at an opponent-to-move node, `topMoveShare >= 0.70` is `HIGH`, `>= 0.45` is `MEDIUM`, and lower is `LOW`. Smaller samples are `INSUFFICIENT_SAMPLE`.

### `STRONG_REFERENCE_V1`

The application-owned reference profile uses local OTB/Classical games in which both recorded historical ratings are at least 2400. Unknown ratings do not qualify. The threshold and profile are centralized.

Results are reported from the preparation side's perspective. The adjusted score uses a symmetric Beta prior over decisive-equivalent score:

`adjustedScore = (wins + 0.5 × draws + 2) / (games + 4)`

The raw game count, W/D/L, and raw score are always returned.

### `ENGINE_SOUNDNESS_V1`

Only `SUCCEEDED` runs from an exact focal game occurrence may contribute engine evidence. A successful evaluation attached only to another occurrence/history is `INCOMPATIBLE_ENGINE_STATE`; absence is `NOT_AVAILABLE`.

After converting the stored White-relative score to the preparation-side perspective:

- centipawns `>= -50`: `SOUND`
- centipawns `>= -150`: `PLAYABLE`
- centipawns `>= -300`: `RISKY`
- lower: `ENGINE_DISFAVORED`
- winning mate: `SOUND`; losing mate: `ENGINE_DISFAVORED`

Scores stay structurally typed as centipawn or mate, and full run/search provenance is returned.

### `PREPARATION_INTEREST_V1`

This is an ordinal V1 heuristic, not chess truth. All points remain visible:

- opponent unfamiliarity: 2 points below 0.20, 1 below 0.50
- reference support: 2 points for 10+ games, 1 for 3+
- engine soundness: 2 for `SOUND`, 1 for `PLAYABLE`, 0 for unavailable/risky, -2 for `ENGINE_DISFAVORED`

Totals `>= 5` are `HIGH`, `>= 2` are `MEDIUM`, otherwise `LOW`. Ordering is band, reference sample, lower familiarity, then UCI for deterministic ties.

## Data and query design

- Reuse `game_players`, `position_occurrences`, `moves`, `positions`, `games`, and provenance existence filters.
- Use one filtered canonical-game CTE for opponent behavior and one for strong-reference aggregation/representatives.
- Build high-level hotspots from distinct canonical game/position pairs in early opening plies.
- Join compatible engine evidence through focal filtered game IDs plus `(game_id, occurrence_ply)`, `engine_position_states`, successful `analysis_runs`, and root `MULTIPV` evaluations.
- Add only supporting indexes in migration 006; no new analytical tables.

## API and UI

- `GET /players/:id/opening-profile`
- `POST /preparation/opponent`
- `POST /preparation/opponent/position`
- `/preparation` resolves a local FIDE identity, makes opponent color explicit, applies conservative defaults, and alternates between opponent behavior and preparation candidate cards while navigating resulting positions.

## Verification

- Domain boundary tests for trend, familiarity, predictability, Bayesian adjustment, soundness including mate/perspective, and deterministic interest ranking.
- API/DB fixtures for exact identity, White/Black repertoire separation, filters, recent/new lines, canonical counting, strong-reference ratings, representatives, engine compatibility/status, and end-to-end navigation.
- Formatting, lint, strict typecheck, unit/integration tests, production build, clean migration and 005→006 upgrade on PostgreSQL, query-plan inspection, and artifact/secret audit.
