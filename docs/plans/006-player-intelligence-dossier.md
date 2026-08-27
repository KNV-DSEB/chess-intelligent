# Task 006 — Player Intelligence & Opponent Dossier V1

## Outcome

Build an evidence-first player dossier from exact local player identity, canonical games, the Task 005 repertoire read model, and compatible Task 004 engine runs. The response remains structured and factual: it reports observed performance, repertoire choices, engine-backed decisions, conversion/recovery opportunities, and coverage without inventing personality, intent, or chess-concept labels.

## Scope and boundaries

- Accept an exact local `playerId` or an exact verified FIDE identity already stored locally. Never fall back to fuzzy names or provider calls.
- Default to OTB/Classical filters and expose all applied filters and denominators.
- Count canonical games once even when they have multiple provenance observations.
- Reuse Task 005's filtered repertoire aggregation and trend/predictability rules.
- Select the newest successful run for the requested engine profile and profile version per canonical game in SQL. Immutable runs are not independent samples.
- Keep centipawn loss, mate semantics, and position-complexity evidence structurally separate.
- Show all engine scores from the focal player's perspective while retaining the persisted White-perspective truth in storage.
- Keep Task 007 concept ontology and all LLM narrative out of this task.

## Implementation slices

### 1. Domain and chess truth

- Add versioned contracts for dossier filters, coverage, evidence quality, performance, repertoire breadth, engine aggregation, decision quality, critical patterns, conversion/recovery, behavioral indicators, and drill-down evidence.
- Centralize opponent-rating bands, centipawn-loss bands, evidence-quality rules, repertoire entropy/effective branch count, and opportunity thresholds.
- Add `GAME_PHASE_V1` to `chess-core`, using the exact pre-move FEN plus ply and a documented material/queen heuristic.

### 2. Persistence and query model

- Add a migration with indexes for deterministic per-game analysis-run selection and focal move assessment lookup.
- Implement one canonical game-fact query for coverage/performance/behavioral metrics. Source filters use `EXISTS` so provenance multiplicity cannot inflate games.
- Implement an engine-evidence query whose CTE performs `DISTINCT ON (game_id)` before joining assessments, evaluations, positions, and critical reasons.
- Return selected run provenance alongside every engine-derived section.

### 3. Application and API

- Expose a reusable filtered repertoire-summary method from the Task 005 application service.
- Build `PlayerDossierApplicationService` to resolve identity, aggregate factual metrics, apply versioned profiles, and attach supporting game/run evidence.
- Add `POST /intelligence/player-dossier` with explicit validation and stable domain errors.

### 4. Web experience

- Add `/intelligence/player` with FIDE lookup, conservative filters, and coverage-first results.
- Present performance, repertoire, decision quality, critical patterns, conversion/recovery, and objective behavior as progressively disclosed structured sections.
- Link representative/drill-down evidence to canonical game pages and display profile/version/denominator labels near derived metrics.

### 5. Verification

- Unit-test rating and CPL boundaries, median handling, evidence-quality bands, entropy/breadth, focal score conversion, mate separation, phase classification, and one-opportunity-per-game rules.
- Add integration fixtures spanning White/Black games, years, rating bands, metadata-only records, multiple immutable engine runs, and mate scores.
- Verify Task 005/006 repertoire consistency under identical filters, canonical counting with multiple provenance, SQL query plans, clean PostgreSQL migrations, all repository checks, the production web build, and the browser workflow.

## Versioned V1 policies

- `DOSSIER_EVIDENCE_QUALITY_V1`: evidence sufficiency is based only on usable games, compatible engine coverage, opponent-rating completeness, and date recency. It never scores player strength.
- `REPERTOIRE_BREADTH_V1`: Shannon entropy, effective branch count, and top-move share; samples below three games are insufficient.
- `ENGINE_AGGREGATION_V1`: latest successful `QUICK_V1` profile version 1 run per game.
- `DECISION_QUALITY_V1`: focal-player centipawn losses use `0–19`, `20–74`, `75–199`, and `200+`; mate outcomes remain separate.
- `ADVANTAGE_CONVERSION_V1` / `DISADVANTAGE_RECOVERY_V1`: the first compatible state reaching an absolute 150 cp advantage/disadvantage (or a directional mate score) creates at most one opportunity per game.
- `GAME_PHASE_V1`: endgame material/queen conditions take priority; otherwise a high-material position in the first 20 plies is opening, and the remainder is middlegame.
- `QUEEN_TRADE_TIMING_V1`: the first persisted post-move position without either queen is recorded; ply 20 or earlier is the V1 early-trade boundary.
