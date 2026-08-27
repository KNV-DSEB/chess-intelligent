# Data provenance and provider policy

Every external observation must be attributable and auditable. The canonical game is the reconciled chess event; a `GameSourceRecord` is evidence from one source and is explicitly typed `METADATA` or `PGN`. Several observations may point at one game, and reimporting or reviewed attachment may add provenance without adding another canonical game.

## Future source topology

```text
                   Player
                     │
              Identity Graph
                     │
       ┌─────────────┼─────────────┐
       │             │             │
     FIDE      Chess-Results    Online IDs
       │             │             │
    rating       tournaments       │
    title        pairings          │
                results            │
                PGNs               │
                     │             │
                     └──────┬──────┘
                            ↓
                    Canonical Game Corpus
```

- **FIDE** is primarily a high-value identity, title, and rating source. A FIDE ID belongs in `ExternalIdentity`, not in a player-name field.
- **Chess-Results** is intended to become an OTB tournament/game source only after its permitted access method and license are documented. Its status is `PENDING_LICENSE_REVIEW`; Task 001 makes no requests to it.
- **Lichess** may later provide online games through a documented API or CC0 dataset boundary.
- **User PGNs** are a first-class source. Task 001 records `USER_SUPPLIED` as the permission basis and retains the original raw PGN.
- The **canonical game corpus** must reconcile duplicate observations from multiple providers. Matching names alone is never sufficient identity proof, and Task 001's fingerprint is duplicate protection rather than a complete cross-provider entity-resolution system.

## Required evidence for an external observation

Each provider adapter must capture, when applicable:

- source/provider and retrieval method;
- license, API agreement, user authorization, or other permission basis;
- provider external tournament/game/identity ID;
- legally appropriate source URL or reference;
- retrieved and imported timestamps;
- raw PGN or raw source metadata required to reproduce normalization;
- confidence and any reconciliation evidence.

`DataSource.default_license_id` can reference a reviewed `DataLicense`; a source record can override it for observation-specific permission. Unknown facts remain null/`UNKNOWN` rather than inferred.

## Metadata-only OTB records

`Game.content_status` distinguishes `METADATA_ONLY` from `MOVES_AVAILABLE`; verification is tracked independently. A metadata-only tournament result can retain players, ratings, event, round, board, date, result, provider game/tournament IDs through source metadata, and provenance without fabricating moves or raw PGN. A later reviewed PGN becomes a new source record; it never rewrites the raw metadata observation. Future `Tournament`, `TournamentSection`, `TournamentParticipant`, `TournamentRound`, `Pairing`, and `Standing` tables will reference games rather than own duplicate move data.

## Corpus filters and coverage

The schema preserves dimensions needed to filter by provider source, OTB/online context, time category, rated state, date, color, event, opponent rating, and PGN availability. Source, game, player-observation, and move indexes provide the initial query paths.

Completeness must be measured, never implied. A future coverage model should record source, date range, records discovered, games with moves, metadata-only games, and last synchronization time. Coverage is provider- and period-specific; it is not a property inferred from a player's current game count.

## Access prohibition

No external chess site may be scraped, crawled, reverse-engineered, or bulk-downloaded without explicit repository documentation of valid authorization. A future `ChessResultsProvider` interface must remain disabled until an approved API, export, licensed Swiss-Manager feed, or other permitted method is established.
