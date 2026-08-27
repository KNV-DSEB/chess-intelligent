import { loadRootEnvironment, readApiEnvironment } from '@chess-intelligent/config';
import { PgDatabase, runMigrations } from '@chess-intelligent/db';

import { buildApp } from './app';

loadRootEnvironment();
const environment = readApiEnvironment();
const database = new PgDatabase(environment.DATABASE_URL);

try {
  await runMigrations(database);
  const app = await buildApp({
    database,
    webOrigin: environment.WEB_ORIGIN,
    logger: true,
    manageDatabaseLifecycle: true,
  });
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error) {
  await database.close();
  throw error;
}
