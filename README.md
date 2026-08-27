# Chess Intelligent

Academy-first chess intelligence foundation. It supports historical position-corpus observations, reproducible engine analysis of exact game histories, opponent preparation, evidence-first player dossiers, a versioned chess-concept ontology, deterministic occurrence-scoped concept evidence, and immutable Player Skill Graph estimates while keeping those layers separate.

## Prerequisites

- Node.js 22 or newer
- pnpm 11
- Docker with Compose (for local PostgreSQL and Redis)
- A separately installed Stockfish executable for the analysis worker

## Start locally

```bash
cp .env.example .env
# Set STOCKFISH_PATH in .env to your local Stockfish executable.
pnpm install
pnpm dev
```

The PGN importer is at `http://localhost:3000/import`, metadata entry at `http://localhost:3000/games/new-metadata`, and the API at `http://localhost:4000`.

The historical position explorer is at `http://localhost:3000/explorer`.

The opponent opening-intelligence workspace is at `http://localhost:3000/preparation`.

The Player Intelligence dossier is at `http://localhost:3000/intelligence/player`.

The Player Skill Graph is at `http://localhost:3000/intelligence/skills`.

The Chess Concept Ontology explorer is at `http://localhost:3000/ontology`.

If infrastructure is already running, use `pnpm db:migrate` followed by `pnpm dev:apps`.

Validate the canonical ontology without a database using `pnpm ontology:validate`. `pnpm dev` synchronizes the immutable published ontology after migrations; for an already-running database use `pnpm ontology:sync` before `pnpm dev:apps`.

## API

```bash
curl -X POST http://localhost:4000/games/import-pgn \
  -H "content-type: application/json" \
  --data '{"sourceType":"USER_UPLOAD","pgn":"[Event \\"Example\\"]\\n[White \\"White\\"]\\n[Black \\"Black\\"]\\n[Result \\"*\\"]\\n\\n1. e4 e5 *"}'
```

Retrieve the returned ID with `GET /games/:id`. Reimporting the same PGN returns `status: "already_exists"` and the canonical game ID.

### Metadata-only OTB workflow

1. `POST /games/import-metadata` creates a canonical game with `contentStatus: "METADATA_ONLY"` and a preserved metadata observation.
2. `POST /games/reconcile-pgn` parses a candidate without mutation and returns deterministic evidence and conflicts.
3. `POST /games/:id/attach-pgn` explicitly approves an `EXACT_MATCH` or `HIGH_CONFIDENCE_MATCH`; the server reruns matching and transactionally attaches moves plus a second provenance observation.

The game detail page treats missing moves as an expected state and links to `/games/:id/attach-pgn` for review.

### Position corpus workflow

- `POST /positions/explore` accepts a validated FEN or stored position ID plus optional exact-player, color, context, time-category, date, opponent-rating, source, and sample filters.
- `GET /players/resolve?provider=FIDE&externalId=...` performs exact verified local identity resolution only.
- `GET /players/:id/corpus-summary` reports canonical-game coverage without provenance double counting.

Move rows expose observed games, frequency, White/draw/Black outcomes, an explicit score perspective, resulting positions, and representative games. Selecting a resulting position supports opening-tree traversal from persisted normalized data. These statistics do not identify a best or recommended move.

### Engine analysis workflow

- `POST /analysis/jobs` accepts a canonical game ID and the bounded `QUICK_V1` profile, then returns HTTP 202 without running Stockfish in the request.
- `GET /analysis/jobs/:id` exposes pending/running progress and terminal status.
- `GET /analysis/runs/:id` returns only completed immutable engine evidence.
- `GET /games/:id/analysis-runs` lists completed historical runs for reanalysis comparison.

The worker is included in `pnpm dev` and can be run independently with `pnpm --filter @chess-intelligent/worker start`. Scores are persisted from White's perspective; UI loss is mover-centric. Mate values stay structurally distinct from centipawns. See [engine analysis architecture](docs/architecture/engine-analysis.md).

### Opponent preparation workflow

- Resolve a FIDE ID with the existing exact local resolver; no provider request or fuzzy match occurs.
- `GET /players/:id/opening-profile` reports usable coverage and White/Black opening-root behavior.
- `POST /preparation/opponent` selects the opponent's color and a conservatively defaulted OTB/Classical corpus.
- `POST /preparation/opponent/position` alternates opponent-choice observations with preparation-side candidate evidence.

Candidates originate from `STRONG_REFERENCE_V1` local games and compatible successful Task 004 MultiPV lines. Opponent familiarity, raw/adjusted reference results, and engine evaluation/provenance stay independently visible. Missing engine evidence is explicit and does not invalidate historical evidence. `PREPARATION_INTEREST_V1` is a transparent study-priority band, never a best-counter claim. See [opponent opening intelligence](docs/architecture/opponent-opening-intelligence.md).

### Player Intelligence workflow

- `POST /intelligence/player-dossier` accepts an exact local Player ID or exact locally verified FIDE identity plus explicit corpus filters.
- Coverage and evidence-quality inputs appear before derived metrics.
- Performance uses focal-player W/D/L with opponent-rating and yearly splits.
- Repertoire frequency/trend/predictability reuses the Task 005 read model; breadth adds transparent Shannon entropy and effective branch count.
- `ENGINE_AGGREGATION_V1` selects one latest successful `QUICK_V1` version 1 run per canonical game before aggregating focal-player CPL, mate events, conversion/recovery, and critical recurrence.
- Critical and behavioral sections retain denominators and drill-down game/run IDs. Recurrence is not labeled a weakness, and recorded behavior is not interpreted as psychology.

See [Player Intelligence dossier architecture](docs/architecture/player-intelligence-dossier.md).

### Concept Evidence Classification workflow

- `POST /classification/games/:gameId` runs `CONCEPT_CLASSIFIER_BUNDLE_V1` against an exact published ontology version; an optional explicit compatible analysis run may be selected.
- `GET /classification/runs/:id` returns immutable run metadata and ordered evidence.
- `GET /games/:id/concept-evidence` returns the latest game projection; filter by exact `classificationRunId` or `concept` stable ID.

Structural and neutral tactical facts work without Stockfish. Positive/negative decision evidence requires one compatible `QUICK_V1` run and an independently detected tactical motif. Every record retains ontology, classifier/rule, exact history hash, occurrence, and engine provenance where used. The game detail page exposes these records without mastery or weakness labels. See [concept evidence classification](docs/architecture/concept-evidence-classification.md) and the [V1 classifier catalog](docs/classifiers/v1.md).

### Player Skill Graph workflow

- `POST /intelligence/player-skill-graph` requires an exact local Player/FIDE identity, explicit ontology version, explicit `asOfDate`, and visible evidence scope.
- `GET /skill-graph/runs/:id` returns the immutable run, coverage denominators, ontology-shaped concept states, policy, and selected classification runs.
- `GET /skill-graph/runs/:runId/concepts/:stableId` reconstructs one concept through per-Game mass and exact Task 008 evidence IDs.
- `GET /players/:id/skill-graph-runs` lists immutable historical runs without progress comparison.

V1 weights persisted historical roles as direct `1.0`, supporting `0.5`, and contextual `0`; neutral evidence adds no mastery mass. Each canonical Game contributes at most one pre-recency unit, evidence decays with a 365-day half-life from the explicit as-of date, and a Beta(2,2) posterior is reported only with evidence mass/confidence. Missing classification or engine data remains unknown. See [Skill Graph architecture](docs/architecture/player-skill-graph.md) and the [reproducible V1 policy](docs/skill-model/v1.md).

### Chess Concept Ontology workflow

- `GET /ontology/versions` lists immutable publications and definition counts.
- `GET /ontology/latest` and `GET /ontology/:version` return the machine-readable vocabulary, relationships, evidence registry, and policy; add `?domain=tactics` for exact domain scope.
- `GET /ontology/:version/concepts/:stableId` resolves hierarchy, prerequisites, dependents, aliases, replacements, and allowed evidence.

The source-controlled V1 contains 64 concepts across seven domains, 24 prerequisite edges, 12 evidence types, and 190 explicit policies. Generic engine evaluation loss is contextual—not direct proof of a specific concept. Published version/hash conflicts are rejected, and there is no runtime editing endpoint or player mastery state. See [ontology architecture](docs/architecture/chess-concept-ontology.md) and the [concept authoring guide](docs/ontology/concept-authoring-guide.md).

## Quality and tests

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests use isolated in-process PGlite databases and apply the same SQL migrations as production, so normal tests do not require Docker or Stockfish. A deterministic fake engine covers orchestration, loss, mate, critical rules, failure, reanalysis, and exact-history identity. The real UCI integration test is opt-in when `STOCKFISH_PATH` is set. The runtime API and worker use PostgreSQL through `pg`. If the Windows C: drive is constrained, point `TEMP` and `TMP` at a disposable directory on D: for tests/builds.

## Database

`pnpm db:migrate` applies every file in `packages/db/migrations` and records it in `schema_migrations`. To verify a clean real-PostgreSQL migration:

```bash
docker compose up -d postgres
pnpm db:migrate
```

Local Docker credentials are intentionally development-only and mirrored in `.env.example`. Do not use them in a deployed environment.

## Scope

There is no external provider access, scraping, authentication, AI call, player mastery or weakness model, evidence weighting, adaptive training, guaranteed opening recommendation, psychological inference, or production deployment. Stockfish is an external GPLv3 process and is not bundled. Chess-Results remains disabled pending an explicitly permitted access method.
