# Architecture overview

Chess Intelligent is a modular monolith at this stage. Boundaries are explicit in code and data, but they are not separate deployed services without a scaling or security reason.

## Current request path

```text
Next.js Web ── JSON/HTTP ──▶ Fastify API
                              │
                              ├── Ingestion / Reconciliation / Corpus Queries
                              ├── Opponent Preparation Evidence Synthesis
                              ├── Player Intelligence Dossier Aggregation
                              ├── Versioned Concept Ontology Reads
                              ├── Exact-history Concept Evidence Classification
                              └── enqueue/read analysis jobs
                                          │
                                          ▼
PostgreSQL ◀── occurrence results ── Analysis Worker ── UCI ──▶ external Stockfish
```

- **Web** is a developer-facing import and inspection interface. It contains no chess rules.
- **API** owns transport validation and invokes application operations. It does not calculate engine facts.
- **Chess Core** is the replaceable, deterministic chess-rules boundary. `chess.js` is isolated here.
- **Game Ingestion** can persist metadata-only facts or parse a PGN completely before canonical persistence. Both paths preserve raw provenance transactionally.
- **Reviewed Reconciliation** discovers candidates without mutation and reruns deterministic rules before an explicit PGN attachment. It never fuzzy-merges names.
- **Position Corpus Explorer** queries persisted pre-move occurrences by normalized position and exact local identity. It reports canonical-game frequency and observed score without claiming move quality.
- **Analysis Worker** claims PostgreSQL jobs and owns the external UCI process. It persists versioned engine evidence and deterministic critical-position output without changing canonical games.
- **Engine Analysis** evaluates an exact game occurrence and history. Normalized position identity remains query metadata and is never the sole engine-state key.
- **Opponent Opening Intelligence** combines exact-player historical behavior, local strong-reference observations, and only directly compatible successful engine evidence. The three sources remain distinct, and candidate ordering is a versioned study-priority heuristic rather than move truth.
- **Player Intelligence** produces a coverage-first factual dossier from exact local identity, canonical game results, the shared Task 005 repertoire read model, and one compatible Task 004 run per game. It reports recurrence and objective behavior without converting them into weakness or psychology labels.
- **Chess Concept Ontology** publishes stable, versioned academy vocabulary, a hierarchy, prerequisite DAG, and explicit evidence admissibility policies. It contains no player state and treats generic engine loss as context rather than concept proof.
- **Concept Evidence Classification** reconstructs every canonical pre-move state, runs conservative deterministic motif/structure rules, enforces the selected ontology's evidence policy, and persists immutable occurrence-scoped evidence. Engine-supported decision polarity is optional and exact-history-safe.
- **Database** stores source-neutral canonical entities. A `GameSourceRecord` represents each observation; source is not a column on `Game`.

## Intended future boundaries

- **Data Providers** will translate explicitly authorized provider data into source observations. Provider adapters cannot bypass permission and provenance checks. Chess-Results remains disabled pending license review.
- **Player Skill Graph** may later aggregate immutable concept evidence under separately versioned weighting rules; neutral observations must not be treated as mastery.
- **Opening Intelligence** will use normalized position identity and transpositions as its primary substrate; ECO labels are optional metadata.
- **Learning Engine** will derive training activities from verified game and analysis data without changing canonical chess facts.
- **AI Orchestration** may explain or synthesize structured truth from other boundaries. It must never invent moves, positions, evaluations, identities, or provider permissions.

These can remain packages/modules in the monorepo until operational requirements justify another process.

## Data-model extension points

`Game.content_status` separates missing moves from available moves, while `verification_status` separately records review state. The compatibility `pgn_status` remains during migration. `game_context` and `time_category` deliberately default to `UNKNOWN`. Future tournament tables can link canonical games through a pairing or nullable tournament relationship without changing move/provenance ownership. External identities remain separate from players and carry verification evidence rather than using names as identity keys. See [canonical game reconciliation](./game-reconciliation.md).

`position_occurrences` links a normalized pre-move position to the persisted next move and resulting position, including ply zero. This supports transposition-aware traversal without PGN reparsing. See [position corpus explorer](./position-corpus-explorer.md).

Engine evidence is run- and occurrence-scoped in `engine_position_states`, `engine_evaluations`, `move_engine_assessments`, and `critical_positions`. See [engine analysis](./engine-analysis.md).

Opponent preparation is computed from these canonical and immutable records without copying an opening database. See [opponent opening intelligence](./opponent-opening-intelligence.md).

Player dossiers are live read models with explicit denominators and profile-aware engine provenance. See [player intelligence dossier](./player-intelligence-dossier.md).

Ontology identity, versioned definitions, relationships, and evidence policies are relationally persisted from one canonical JSON source. See [chess concept ontology](./chess-concept-ontology.md).

Concept classification runs and evidence instances retain the exact ontology, classifier bundle/configuration, game occurrence, history hash, player/color subject where applicable, and one compatible engine run where decision consequence contributed. See [concept evidence classification](./concept-evidence-classification.md).
