import { loadRootEnvironment, requireDatabaseUrl } from '@chess-intelligent/config';

import { PgDatabase } from './database';
import { runMigrations } from './migrations';

loadRootEnvironment();
const database = new PgDatabase(requireDatabaseUrl());

try {
  const applied = await runMigrations(database);
  process.stdout.write(
    applied.length > 0 ? `Applied migrations: ${applied.join(', ')}\n` : 'Database is current.\n',
  );
} finally {
  await database.close();
}
