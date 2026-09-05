---
type: "query"
date: "2026-08-29T11:01:26.284191+00:00"
question: "Trace Task 013 production security, database, migration, worker, session, invitation, password reset, and audit paths"
contributor: "graphify"
outcome: "useful"
source_nodes: ["worker", "database", "Player", "migrations.ts", "buildApp"]
---

# Q: Trace Task 013 production security, database, migration, worker, session, invitation, password reset, and audit paths

## Answer

Expanded from original query via graph vocab: [player, database, migration, worker]. The stale graph traces worker through apps/worker/src/worker.ts to PgDatabase, runMigrations, AnalysisRepository, AnalysisWorker and StockfishUciEngine; API composition reaches buildApp in apps/api/src/app.ts and the database abstraction in packages/db/src/database.ts. The graph lacks Task 012 session, membership, invitation, reset, and audit vocabulary, so direct source inspection is authoritative for those security paths.

## Outcome

- Signal: useful

## Source Nodes

- worker
- database
- Player
- migrations.ts
- buildApp