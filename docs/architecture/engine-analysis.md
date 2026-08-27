# Engine analysis architecture

Task 004 adds engine intelligence without mixing it with canonical game truth or Task 003 historical observations.

## Runtime boundary

The Fastify API validates a named application-owned profile and inserts an `analysis_jobs` row. It never starts Stockfish. `apps/worker` claims pending rows with PostgreSQL `FOR UPDATE SKIP LOCKED`, runs the engine outside database transactions, and persists one occurrence result at a time. No external queue is required in V1.

`ChessEngine` is the engine-neutral contract. It accepts an exact root (`initialFen` plus ordered UCI move history), an application-owned search configuration, and optional allowed root moves. `StockfishUciEngine` is the UCI process adapter; played-move evaluation uses `go searchmoves` through the neutral `allowedRootMoves` field.

The adapter performs `uci`/`uciok`, applies bounded options, waits for `readyok`, sends `ucinewgame`, reconstructs each position, parses `info`/`bestmove`, enforces timeouts, and terminates the child process. `QUICK_V1` is version 1:

- Threads: 1
- Hash: 32 MB
- MultiPV: 2
- search: depth 10
- per-search timeout: 20 seconds
- maximum game length: 240 plies

Clients cannot send arbitrary UCI options. Profile changes require a new application version/profile version and therefore a different configuration hash.

## Engine-state identity

A normalized position identifies board, side, castling, and legal en-passant state for corpus traversal. It is not sufficient to reproduce all engine-relevant game history. Every analyzed occurrence therefore stores:

```text
analysis run + canonical game + occurrence ply
initial FEN
ordered UCI history before the played move
SHA-256(initial FEN + ordered history)
side to move
normalized position ID (query metadata only)
```

The UCI command is either `position startpos moves ...` or `position fen <initial> moves ...`. Transpositions or repetitions with equal normalized position IDs remain separate occurrence states when their histories differ.

## Score and loss semantics

Persisted scores are explicitly White-relative and structurally discriminated:

```text
CENTIPAWN { centipawns }
MATE       { mateIn }
```

Positive mate means White has the forced mate; negative mate means Black has it. The UCI adapter converts root-side-to-move output at its boundary.

Centipawn loss is mover-relative. For White it is `best - played`; for Black it is `played - best` when both inputs are White-relative. Search variance is clamped at zero. If either value is mate, numeric loss is `null` and the domain records `MATE_MISSED`, `MATE_ALLOWED`, `MATE_PRESERVED`, or `MATE_CHANGED` as applicable. Mate is never converted to a sentinel centipawn number.

Unrestricted MultiPV and a forced played-root search are separate immutable evaluation records. This avoids assuming that a small MultiPV contains the move actually played.

## Critical Position Detector V1

`CriticalPositionDetector` consumes structured evaluation evidence and never calls an engine or an LLM. Output is persisted with `CRITICAL_DETECTOR_V1`. Thresholds are inclusive:

| Reason                      | Deterministic rule                                           | Severity |
| --------------------------- | ------------------------------------------------------------ | -------- |
| `EVAL_LOSS`                 | mover-relative loss >= 75 cp                                 | MEDIUM   |
| `SEVERE_EVAL_LOSS`          | mover-relative loss >= 200 cp                                | HIGH     |
| `ADVANTAGE_DROPPED`         | best mover score >= +100 cp and played mover score < +40 cp  | HIGH     |
| `MATE_MISSED`               | best preserves a forced mate for mover, played move does not | CRITICAL |
| `MATE_ALLOWED`              | best avoids opponent forced mate, played move permits it     | CRITICAL |
| `HIGH_DECISION_SENSITIVITY` | mover-relative MultiPV #1 minus MultiPV #2 >= 120 cp         | MEDIUM   |

One critical occurrence may retain several reasons; its severity is the deterministic maximum. V1 makes no tactical motif, strategic concept, weakness, or recommendation claim.

## Lifecycle and failure semantics

Jobs transition `PENDING -> RUNNING -> SUCCEEDED|FAILED`. An identical active profile request returns the existing job. A later request after success creates a new job and immutable run, preserving previous evidence.

The worker heartbeats after each persisted occurrence. A startup recovery pass requeues a stale transient attempt when its two-attempt budget remains, otherwise it fails the job. UCI process failures are retryable; deterministic game/configuration failures are not. Failed attempts and partial evaluation rows remain auditable internally but normal run APIs expose only `SUCCEEDED` runs.

Database transactions cover claiming, one-position persistence, and final lifecycle changes only. Stockfish is never running inside a long database transaction.

## Licensing boundary

The repository does not contain a Stockfish executable, source archive, or NNUE file. `STOCKFISH_PATH` points at a separately installed executable. The worker hashes the binary for run provenance but never stores its local path. Distribution of Stockfish must independently satisfy GPLv3 obligations; see `THIRD_PARTY_LICENSES.md`.
