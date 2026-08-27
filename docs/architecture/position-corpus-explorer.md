# Position corpus explorer

## Historical-intelligence boundary

The explorer answers what canonical games in the permitted local corpus actually contained. It does not evaluate move quality. Terms such as **most played**, **observed score**, and **observed in N games** are deliberate; frequency and raw score are evidence, not recommendations or chess truth.

Task 003 performs no engine, AI, network-provider, fuzzy identity, or opening-name work. A later engine pipeline may add objective evaluation beside these observations without rewriting them.

## Normalized position identity

Chess Core retains Task 001's `position:v1` identity: SHA-256 over the first four FEN fields (piece placement, active color, castling rights, and en-passant square). Halfmove and fullmove counters are excluded, so positions reached by different move orders share an identity. Castling rights and en-passant state remain significant because they can change legal moves.

The current identity deliberately does not encode repetition history or the fifty-move counter. It is suitable for legal next-move corpus aggregation, but it is not a complete game-theoretic state for future draw-claim analysis. Changing this version requires a migration and explicit compatibility decision.

FEN queries are validated and canonicalized by Chess Core. Position-ID queries resolve only against the local `positions` catalog.

## Position occurrences

`moves.position_id` identifies the position after a move. Task 003 adds `position_occurrences` to make the inverse analytical question efficient:

```text
canonical game + pre-move ply + position
                ↓
             next move
                ↓
        resulting position
```

The first occurrence is ply `0`, so the initial position is queryable. PGN import and reviewed attachment write positions, moves, and occurrences in the same transaction. Migration `004` backfills initial positions and occurrences for existing PGN-backed games. Metadata-only games have no moves or occurrences and are naturally absent from position statistics.

If one game repeats the queried position, the query uses its earliest occurrence. This keeps the statistical unit one canonical game rather than allowing a repetition or provenance count to inflate the sample.

## Filters and identity

The query layer supports:

- internal `playerId` or one exact verified external identity;
- focal-player color;
- game context and time category arrays;
- inclusive played-date bounds;
- minimum historical opponent rating;
- source-type arrays;
- minimum displayed move sample.

Exact FIDE resolution is local: `ExternalIdentity(provider = FIDE, external_id)` resolves to a `Player` only when verified. Names never participate in identity lookup. An unknown FIDE ID returns not found and makes no external request.

`minimumOpponentRating` requires a focal player and uses the opponent's `game_players.rating` observation from that game. A missing historical rating does not satisfy a minimum. Source filtering uses `EXISTS`, so several provenance observations never multiply a game.

## Statistical semantics

The query first selects at most one occurrence per canonical game. For each observed next move:

```text
frequency = move game count / all matching game count
score     = (perspective wins + 0.5 × perspective draws) / move game count
```

W/D/L columns always report White wins, draws, and Black wins. `scorePerspective` is explicit:

- `FOCAL_PLAYER` when a player filter is active, even if that player was Black;
- `SIDE_TO_MOVE` for global corpus queries.

Underlying values are unrounded; presentation rounds percentages. `minimumSampleSize` hides move rows below the threshold without pretending the underlying position sample is smaller. Raw score is not sample-adjusted and is never used to produce a recommendation.

## Representative games

Representative games are selected deterministically, favoring higher average game-recorded ratings, then newer dates, then stable game ID. Up to three are returned per move and five for the overall position. Missing ratings sort below recorded ratings. Each representative is a canonical game with player observations, event/date/result, and a distinct source summary.

## Query and navigation architecture

```text
Fastify HTTP
    ↓
PositionExplorerApplicationService
    ↓
PositionCorpusRepository
    ↓
PostgreSQL normalized positions, occurrences, games, players, provenance
```

Aggregates and representative games are computed from persisted normalized rows; PGNs are not loaded or reparsed. Every move exposes its resulting position ID and representative FEN, allowing repeated position → move → position traversal.

Focused indexes cover position/game occurrence lookup and the existing player, corpus-dimension, date, and provenance paths. PostgreSQL remains the only analytical store for this milestone.

## Relationship to future intelligence

Task 003 establishes historical intelligence: **what did players actually play?** Task 004 may add versioned Stockfish analysis and critical-position detection: **what is objectively happening?** A later opponent-opening feature can combine both evidence classes, sample-aware inference, and repertoire constraints. Neither layer should overwrite canonical games or mislabel historical popularity as engine truth.
