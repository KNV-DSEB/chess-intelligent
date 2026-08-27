# Task 003 implementation plan

1. Preserve Task 001 position hashing and add an explicit position occurrence for every persisted move, including the pre-move position at ply zero, with a migration that backfills existing PGN-backed games.
2. Add shared corpus contracts and centralized observed-frequency/score calculations whose perspective is always explicit and which never label historical popularity or score as chess quality.
3. Implement a dedicated PostgreSQL query layer for canonical-game position aggregation, exact verified identity resolution, representative games, player corpus summaries, and provenance-safe filters.
4. Add a thin application service that validates or resolves FEN/position identities through Chess Core, resolves exact local player identities, and assembles deterministic statistics and empty-state context.
5. Expose position exploration, exact identity resolution, and player corpus-summary APIs with strict validation and structured query logs.
6. Build a minimal `/explorer` interface for FEN input, local FIDE/player filters, transparent samples, observed move statistics, representative games, and repeated resulting-position navigation.
7. Add a small human-readable fixture corpus and tests for initial positions, aggregation, score perspectives, transpositions, identity/color/context/date/rating filters, metadata exclusion, provenance duplicate safety, navigation, summaries, and empty results.
8. Document position/occurrence semantics, historical-rating and canonical-game counting rules, performance boundaries, and the separation between historical evidence in Task 003 and engine truth in Task 004; then run all repository, migration, PostgreSQL, query-plan, build, and artifact checks.
