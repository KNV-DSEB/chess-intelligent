# Task 001 implementation plan

1. Establish a pnpm TypeScript monorepo with a Next.js web app, Fastify API, worker boundary, shared domain/chess/database/config packages, PostgreSQL and Redis-ready local infrastructure.
2. Add a PostgreSQL migration for players and external identities, provider sources and licenses, import jobs, canonical games, repeatable game source records, game players, positions, and moves. Keep games compatible with metadata-only OTB observations and multiple providers.
3. Build a permissively licensed `chess.js` parsing layer that validates a single PGN main line, normalizes headers, reconstructs legal moves, derives SAN/UCI/FEN, hashes normalized positions, and fingerprints games.
4. Implement transactional PGN ingestion and retrieval behind `POST /games/import-pgn` and `GET /games/:id`, including clear validation errors, duplicate handling, raw-source preservation, and atomic persistence.
5. Add a minimal `/import` page and imported-game detail page that exercise the API without introducing product UI complexity.
6. Add fixtures and automated coverage for success, invalid/illegal PGN, duplicates, rollback safety, and transposition-stable position identities.
7. Document setup, architecture, provenance/provider constraints, dependency licenses, and future-agent rules; then install, format, lint, type-check, test, migrate a clean database where available, and manually exercise both endpoints.
