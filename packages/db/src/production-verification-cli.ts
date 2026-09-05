import { isSchemaCurrent, runMigrations } from './migrations';
import { PgDatabase } from './database';

if (process.env.TASK013_PRODUCTION_VERIFY_CONFIRM !== 'YES') {
  throw new Error(
    'Set TASK013_PRODUCTION_VERIFY_CONFIRM=YES only for an explicitly provisioned disposable PostgreSQL database.',
  );
}
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
const mode = process.env.TASK013_VERIFY_MODE;
if (mode !== 'CLEAN' && mode !== 'UPGRADE') {
  throw new Error('TASK013_VERIFY_MODE must be CLEAN or UPGRADE.');
}
const database = new PgDatabase(connectionString, {
  maxConnections: 5,
  connectionTimeoutMillis: 5_000,
  statementTimeoutMillis: 60_000,
  applicationName: 'task013-production-verification',
});

try {
  const version = await database.query<{ server_version: string }>('SHOW server_version');
  const existing = await database.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM information_schema.tables
     WHERE table_schema = 'public'`,
  );
  if (mode === 'CLEAN' && (existing.rows[0]?.count ?? 0) !== 0) {
    throw new Error('CLEAN verification requires an empty disposable database.');
  }
  const applied = await runMigrations(database);
  if (!(await isSchemaCurrent(database))) throw new Error('The latest schema migration is absent.');

  await database.execute('CREATE TEMP TABLE task013_rollback_probe (id integer PRIMARY KEY)');
  try {
    await database.transaction(async (client) => {
      await client.query('INSERT INTO task013_rollback_probe (id) VALUES (1)');
      throw new Error('TASK013_EXPECTED_ROLLBACK');
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'TASK013_EXPECTED_ROLLBACK') throw error;
  }
  const rollback = await database.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM task013_rollback_probe',
  );
  if ((rollback.rows[0]?.count ?? -1) !== 0) throw new Error('Transaction rollback failed.');

  const failedMigrationName = 'task013_expected_failed_rehearsal.sql';
  try {
    await database.transaction(async (client) => {
      await client.query('CREATE TABLE task013_failed_migration_probe (id integer PRIMARY KEY)');
      await client.query('INSERT INTO schema_migrations (name, applied_at) VALUES ($1, now())', [
        failedMigrationName,
      ]);
      await client.query('SELECT task013_intentionally_missing_function()');
    });
    throw new Error('The failed-migration rehearsal unexpectedly succeeded.');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'The failed-migration rehearsal unexpectedly succeeded.'
    ) {
      throw error;
    }
  }
  const failedMigrationState = await database.query<{
    probe_table: string | null;
    migration_count: number;
  }>(
    `SELECT to_regclass('public.task013_failed_migration_probe')::text AS probe_table,
            (SELECT count(*)::int FROM schema_migrations WHERE name = $1) AS migration_count`,
    [failedMigrationName],
  );
  if (
    failedMigrationState.rows[0]?.probe_table !== null ||
    failedMigrationState.rows[0]?.migration_count !== 0
  ) {
    throw new Error('Failed migration state was partially persisted.');
  }

  const criticalTables = await database.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN (
       'games', 'analysis_runs', 'concept_evidence_instances', 'player_skill_graph_runs',
       'training_attempts', 'training_evidence_instances', 'academies', 'users',
       'auth_sessions', 'academy_invitations', 'password_reset_tokens',
       'security_audit_events'
     ) ORDER BY table_name`,
  );
  if (criticalTables.rowCount !== 12) throw new Error('One or more critical tables are absent.');
  process.stdout.write(
    `${JSON.stringify({ status: 'REAL_POSTGRESQL_SCHEMA_VERIFIED', mode, postgresVersion: version.rows[0]?.server_version ?? 'UNKNOWN', appliedMigrations: applied, rollbackVerified: true, failedMigrationRollbackVerified: true, criticalTableCount: criticalTables.rowCount })}\n`,
  );
} finally {
  await database.close();
}
