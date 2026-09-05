import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Database } from './database';

const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../migrations/', import.meta.url));
export const LATEST_MIGRATION_NAME = '014_production_verification_foundation.sql';

interface AppliedMigrationRow {
  name: string;
}

export async function runMigrations(
  database: Database,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
): Promise<string[]> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const entries = (await readdir(migrationsDirectory))
    .filter((entry) => entry.endsWith('.sql'))
    .sort();
  const applied = await database.query<AppliedMigrationRow>('SELECT name FROM schema_migrations');
  const appliedNames = new Set(applied.rows.map((row) => row.name));
  const newlyApplied: string[] = [];

  for (const entry of entries) {
    if (appliedNames.has(entry)) {
      continue;
    }

    const migration = await readFile(`${migrationsDirectory}/${entry}`, 'utf8');
    await database.transaction(async (client) => {
      await client.execute(migration);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [entry]);
    });
    newlyApplied.push(entry);
  }

  return newlyApplied;
}

export async function isSchemaCurrent(database: Database): Promise<boolean> {
  const result = await database.query<{ name: string }>(
    'SELECT name FROM schema_migrations WHERE name = $1',
    [LATEST_MIGRATION_NAME],
  );
  return result.rows[0]?.name === LATEST_MIGRATION_NAME;
}
