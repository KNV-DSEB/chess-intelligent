import { access, constants } from 'node:fs/promises';

import { loadRootEnvironment, readWorkerEnvironment } from '@chess-intelligent/config';
import { isSchemaCurrent, PgDatabase } from '@chess-intelligent/db';

loadRootEnvironment();
const environment = readWorkerEnvironment();
const database = new PgDatabase(environment.DATABASE_URL, {
  maxConnections: 1,
  connectionTimeoutMillis: environment.DB_CONNECTION_TIMEOUT_MS,
  statementTimeoutMillis: 5_000,
  applicationName: 'chess-intelligent-worker-health',
});

try {
  await database.query('SELECT 1');
  if (!(await isSchemaCurrent(database))) throw new Error('Worker schema is not current.');
  await access(environment.STOCKFISH_PATH, constants.X_OK);
  process.stdout.write('WORKER_READY\n');
} finally {
  await database.close();
}
