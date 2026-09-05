import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { buildApp } from '../../api/src/app';
import { AnalysisRepository, PgDatabase, runMigrations } from '@chess-intelligent/db';

import { AnalysisWorker } from '../src/analysis-worker';
import { StockfishUciEngine } from '../src/stockfish-uci-engine';

const connectionString = process.env.TEST_DATABASE_URL;
const stockfishPath = process.env.STOCKFISH_PATH;
const integrationDescribe = connectionString && stockfishPath ? describe : describe.skip;

integrationDescribe('real Stockfish PostgreSQL lifecycle', () => {
  it('persists complete engine provenance and fails an invalid executable without affecting API liveness', async () => {
    if (!connectionString || !stockfishPath) {
      throw new Error('TEST_DATABASE_URL and STOCKFISH_PATH are required.');
    }
    const database = new PgDatabase(connectionString);
    await runMigrations(database);
    const repository = new AnalysisRepository(database);
    const app = await buildApp({ database, internalDevRoutes: true });
    try {
      const pgn = await readFile(
        new URL('../../api/test/fixtures/successful.pgn', import.meta.url),
        'utf8',
      );
      const imported = await app.inject({
        method: 'POST',
        url: '/games/import-pgn',
        payload: { pgn, sourceType: 'USER_UPLOAD' },
      });
      expect(imported.statusCode, imported.body).toBe(201);
      const gameId = imported.json<{ gameId: string }>().gameId;

      const requested = await app.inject({
        method: 'POST',
        url: '/analysis/jobs',
        payload: { gameId, profile: 'QUICK_V1' },
      });
      expect(requested.statusCode, requested.body).toBe(202);
      const jobId = requested.json<{ id: string }>().id;
      await new AnalysisWorker(
        repository,
        () => new StockfishUciEngine(stockfishPath),
        'task014-real-stockfish-worker',
      ).runNext();

      const completed = await app.inject({ method: 'GET', url: `/analysis/jobs/${jobId}` });
      expect(completed.json()).toMatchObject({
        status: 'SUCCEEDED',
        progress: { processed: 20, total: 20 },
        runId: expect.any(String),
      });
      const runId = completed.json<{ runId: string }>().runId;
      const run = await app.inject({ method: 'GET', url: `/analysis/runs/${runId}` });
      expect(run.statusCode, run.body).toBe(200);
      expect(run.json()).toMatchObject({
        engineFamily: 'STOCKFISH',
        engineReportedName: expect.stringMatching(/Stockfish/iu),
        engineReportedVersion: expect.any(String),
        binarySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        profile: 'QUICK_V1',
        profileVersion: 1,
        positions: expect.arrayContaining([
          expect.objectContaining({
            engineState: expect.objectContaining({ historySha256: expect.any(String) }),
          }),
        ]),
      });
      expect(run.json<{ positions: unknown[] }>().positions).toHaveLength(20);

      const retry = await app.inject({
        method: 'POST',
        url: '/analysis/jobs',
        payload: { gameId, profile: 'QUICK_V1' },
      });
      expect(retry.statusCode, retry.body).toBe(202);
      const failedJobId = retry.json<{ id: string }>().id;
      const invalidPath = join(dirname(stockfishPath), 'task014-missing-stockfish');
      const failingWorker = new AnalysisWorker(
        repository,
        () => new StockfishUciEngine(invalidPath),
        'task014-invalid-stockfish-worker',
      );
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await failingWorker.runNext();
      }
      const failed = await app.inject({
        method: 'GET',
        url: `/analysis/jobs/${failedJobId}`,
      });
      expect(failed.json()).toMatchObject({
        status: 'FAILED',
        error: {
          code: 'ENGINE_PROCESS_FAILURE',
          message: expect.stringContaining('[path]'),
        },
      });
      expect(failed.body).not.toContain(invalidPath);
      expect(await app.inject({ method: 'GET', url: '/livez' })).toMatchObject({
        statusCode: 200,
      });
      expect(await app.inject({ method: 'GET', url: `/games/${gameId}` })).toMatchObject({
        statusCode: 200,
      });
    } finally {
      await app.close();
      await database.close();
    }
  }, 180_000);
});
