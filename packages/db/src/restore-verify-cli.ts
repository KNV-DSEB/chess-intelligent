import { readFile } from 'node:fs/promises';

import { PgDatabase } from './database';
import {
  compareRestoreManifests,
  createRestoreManifest,
  postgresProcessTarget,
  requireExplicitFilePath,
  runPostgresTool,
  type RestoreManifest,
} from './database-operations';

if (process.env.DATABASE_RESTORE_CONFIRM !== 'YES') {
  throw new Error(
    'Set DATABASE_RESTORE_CONFIRM=YES for the explicitly named empty restore target.',
  );
}
const connectionString = process.env.RESTORE_DATABASE_URL;
if (!connectionString) throw new Error('RESTORE_DATABASE_URL is required.');
if (connectionString === process.env.BACKUP_DATABASE_URL) {
  throw new Error('Restore verification must use a database different from the backup source.');
}
const backupPath = requireExplicitFilePath(process.env.DATABASE_BACKUP_PATH, '.dump');
const expected = JSON.parse(
  await readFile(`${backupPath}.manifest.json`, 'utf8'),
) as RestoreManifest;
const target = postgresProcessTarget(connectionString);
const database = new PgDatabase(connectionString, {
  applicationName: 'task013-restore-verification',
});

try {
  const existing = await database.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM information_schema.tables
     WHERE table_schema = 'public'`,
  );
  if ((existing.rows[0]?.count ?? 0) !== 0) {
    throw new Error('The restore target must be a separate empty PostgreSQL database.');
  }
  const startedAt = performance.now();
  await runPostgresTool({
    executable: 'pg_restore',
    arguments: [
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      target.databaseName,
      backupPath,
    ],
    target,
  });
  const restoreMilliseconds = Number((performance.now() - startedAt).toFixed(3));
  const actual = await createRestoreManifest(database);
  const differences = compareRestoreManifests(expected, actual);
  if (differences.length > 0) {
    throw new Error(`Restore integrity differs for: ${differences.join(', ')}.`);
  }
  process.stdout.write(
    `${JSON.stringify({ status: 'RESTORE_VERIFIED', restoreMilliseconds, postgresVersion: actual.postgresVersion, checkedTables: Object.keys(actual.tables).length })}\n`,
  );
} finally {
  await database.close();
}
