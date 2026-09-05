import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { PgDatabase } from './database';
import {
  createRestoreManifest,
  postgresProcessTarget,
  requireExplicitFilePath,
  runPostgresTool,
} from './database-operations';

if (process.env.DATABASE_BACKUP_CONFIRM !== 'YES') {
  throw new Error('Set DATABASE_BACKUP_CONFIRM=YES for the explicitly named backup target.');
}
const connectionString = process.env.BACKUP_DATABASE_URL;
if (!connectionString) throw new Error('BACKUP_DATABASE_URL is required.');
const outputPath = requireExplicitFilePath(process.env.DATABASE_BACKUP_PATH, '.dump');
const target = postgresProcessTarget(connectionString);
const database = new PgDatabase(connectionString, { applicationName: 'task013-backup' });

try {
  const manifest = await createRestoreManifest(database);
  await mkdir(dirname(outputPath), { recursive: true });
  await runPostgresTool({
    executable: 'pg_dump',
    arguments: [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      outputPath,
      '--dbname',
      target.databaseName,
    ],
    target,
  });
  await writeFile(`${outputPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify({ status: 'BACKUP_CREATED', outputPath, manifestPath: `${outputPath}.manifest.json`, postgresVersion: manifest.postgresVersion, schemaMigrationCount: manifest.schemaMigrations.length })}\n`,
  );
} finally {
  await database.close();
}
