# Database migration and recovery runbook

## Safety boundary

Production conclusions require real PostgreSQL. PGlite protects deterministic behavior but is not migration, query-plan, concurrency, backup, or restore evidence. Never run a Task 013 command without checking the exact database hostname and database name.

Production has no fabricated down migrations. Rollback is application rollback plus restore from a verified pre-migration backup when the schema cannot safely remain forward-compatible.

## Pre-checks

1. Confirm the release commit, PostgreSQL major version, free storage, application maintenance window, and operator access.
2. Confirm `DATABASE_URL`, `BACKUP_DATABASE_URL`, and `RESTORE_DATABASE_URL` name the intended and distinct databases. Never print these URLs.
3. Run `pnpm check` and `pnpm build` from the release commit.
4. Run the clean rehearsal against an empty disposable database:

   ```text
   TASK013_PRODUCTION_VERIFY_CONFIRM=YES
   TASK013_VERIFY_MODE=CLEAN
   TEST_DATABASE_URL=<disposable PostgreSQL URL>
   pnpm verify:production:database
   ```

5. Run the upgrade rehearsal against a disposable restored pre-release database with
   `TASK013_VERIFY_MODE=UPGRADE`. The verifier also publishes and validates the pinned ontology
   `1.0.0`, its canonical hash, and all 64 definitions.

## Pre-migration backup

Use PostgreSQL client tools from the same major line as the server where practical:

```text
DATABASE_BACKUP_CONFIRM=YES
BACKUP_DATABASE_URL=<explicit source URL>
DATABASE_BACKUP_PATH=<operator-protected path ending .dump>
pnpm db:backup
```

The command uses `pg_dump --format=custom --no-owner --no-privileges` and writes a companion manifest with PostgreSQL version, migration list, critical-table row counts, and stable identifier hashes. It does not print credentials. Backup files and manifests are ignored by Git but still contain sensitive operational information and must be protected by the deployment infrastructure.

## Migration

1. Stop or drain API/Worker writes.
2. Create the pre-migration backup.
3. Run one explicit migration process: `pnpm db:migrate`.
4. Do not let every production replica migrate. Production API/Worker use `AUTO_MIGRATE=false`.
5. Check `schema_migrations`; the current expected tail is
   `017_public_product_entry.sql`.
6. Start API, then verify `/livez` and `/readyz`; start Worker only after database readiness.

Each migration is applied in one database transaction and recorded only after the transaction succeeds. A failed transaction must not create a `schema_migrations` success row.

## Restore verification

Provision a separate empty database and run:

```text
DATABASE_RESTORE_CONFIRM=YES
RESTORE_DATABASE_URL=<separate empty target URL>
DATABASE_BACKUP_PATH=<same .dump path>
pnpm db:restore:verify
```

The command refuses a non-empty target, runs `pg_restore --exit-on-error`, recreates the manifest,
and fails on migration/count/hash differences. It covers representative identity and lineage tables
from Player/Game/exact position history through analysis, classification, evidence, Skill Graph,
Training, Academy, authentication, consent, audit, Grounded AI artifacts, Pilot events, and both
feedback tables.

## Failed migration response

In a disposable rehearsal, inject a failing SQL statement inside a transaction and verify no partial object or migration record survives. For a real release failure:

1. keep traffic drained;
2. capture the failing migration name and request/correlation output without credentials;
3. do not edit an already-released migration in place;
4. roll back application artifacts;
5. restore the verified backup into a separate database;
6. compare manifests and application smoke tests;
7. switch traffic only after integrity is established.

## Backup policy

- Recommended V1 baseline: daily logical backup plus a mandatory pre-migration backup.
- Retention and encryption-at-rest are operator/infrastructure decisions; this repository makes no unsupported claim.
- A backup is not trusted until a separate restore is verified.
- `RPO/RTO NOT CONTRACTUALLY DEFINED`; measured restore time from each rehearsal is the only current recovery evidence.
