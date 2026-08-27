import { loadRootEnvironment, readWorkerEnvironment } from '@chess-intelligent/config';
import { AnalysisRepository, PgDatabase, runMigrations } from '@chess-intelligent/db';

import { AnalysisWorker } from './analysis-worker';
import { StockfishUciEngine } from './stockfish-uci-engine';

loadRootEnvironment();
const environment = readWorkerEnvironment();
const database = new PgDatabase(environment.DATABASE_URL);
await runMigrations(database);
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
  await worker.recoverStaleWork();
  do {
    const claimed = await worker.runNext();
    if (environment.WORKER_ONCE) break;
    if (!claimed) {
      await new Promise((resolve) => setTimeout(resolve, environment.WORKER_POLL_INTERVAL_MS));
    }
  } while (!stopping);
} finally {
  await database.close();
}
