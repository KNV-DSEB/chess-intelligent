import { loadRootEnvironment, readWorkerEnvironment } from '@chess-intelligent/config';
import { AnalysisRepository, PgDatabase, runMigrations } from '@chess-intelligent/db';

import { AnalysisWorker } from './analysis-worker';
import { StockfishUciEngine } from './stockfish-uci-engine';
import { runWorkerLoop } from './worker-loop';

loadRootEnvironment();
const environment = readWorkerEnvironment();
const database = new PgDatabase(environment.DATABASE_URL, {
  maxConnections: environment.DB_POOL_MAX,
  connectionTimeoutMillis: environment.DB_CONNECTION_TIMEOUT_MS,
  statementTimeoutMillis: environment.DB_STATEMENT_TIMEOUT_MS,
  applicationName: 'chess-intelligent-worker',
});
if (environment.AUTO_MIGRATE) await runMigrations(database);
const repository = new AnalysisRepository(database);
const worker = new AnalysisWorker(
  repository,
  () => new StockfishUciEngine(environment.STOCKFISH_PATH),
  environment.WORKER_ID,
);

let stopping = false;
process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});

try {
  await runWorkerLoop(worker, {
    once: environment.WORKER_ONCE,
    pollIntervalMs: environment.WORKER_POLL_INTERVAL_MS,
    shouldStop: () => stopping,
    onDependencyError: () => {
      process.stderr.write('Analysis Worker dependency unavailable; retrying.\n');
    },
  });
} finally {
  await database.close();
}
