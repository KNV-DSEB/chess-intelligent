# Task 004 — Stockfish analysis pipeline and critical positions V1

## Delivered vertical slice

- Engine-neutral `ChessEngine` contract and bounded `QUICK_V1` profile.
- External Stockfish UCI adapter with identity/version and executable SHA-256 provenance.
- PostgreSQL job claiming, progress heartbeat, bounded retry, stale-work recovery, and immutable runs.
- Exact-history engine occurrence states, MultiPV evaluations, forced played-root evaluations, mover-centric loss, and structured mate outcomes.
- Versioned deterministic Critical Position Detector V1.
- Job/run HTTP endpoints and polling game-detail UI.
- Deterministic fake-engine application coverage plus opt-in real-Stockfish integration coverage.

## Acceptance path

1. Import or attach a legal PGN so the canonical game has `MOVES_AVAILABLE`.
2. `POST /analysis/jobs` with `{ "gameId": "...", "profile": "QUICK_V1" }` returns HTTP 202.
3. The worker claims and moves the job through `PENDING -> RUNNING -> SUCCEEDED`.
4. `GET /analysis/runs/:id` returns engine identity/hash, exact configuration, every pre-move occurrence, ordered MultiPV, forced played evaluation, loss/mate semantics, and critical evidence.
5. Repeating step 2 after completion creates another immutable run. Repeating it while active returns the same active job.

## Explicit exclusions

Task 004 does not combine frequency with engine evaluation, recommend counters, infer opponent weaknesses, label tactical/strategic motifs, call providers, or use an LLM. Those intelligence joins begin in Task 005 only after historical and engine evidence can remain independently auditable.
