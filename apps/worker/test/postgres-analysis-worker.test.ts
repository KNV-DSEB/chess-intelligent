import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { buildApp } from '../../api/src/app';
import { AnalysisRepository, PgDatabase, runMigrations } from '@chess-intelligent/db';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EnginePrincipalVariation,
} from '@chess-intelligent/domain';

import { AnalysisWorker } from '../src/analysis-worker';

const connectionString = process.env.TEST_DATABASE_URL;
const integrationDescribe = connectionString ? describe : describe.skip;

function evaluation(rootMoveUci: string, centipawns: number): EnginePrincipalVariation {
  return {
    pvRank: 1,
    rootMoveUci,
    moves: [rootMoveUci],
    score: { kind: 'CENTIPAWN', centipawns },
    depth: 10,
    seldepth: 12,
    nodes: 500,
    nps: 25_000,
    timeMs: 20,
    hashfull: 1,
  };
}

class PostgreSqlVerificationEngine implements ChessEngine {
  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'PostgreSQL Verification Engine',
      reportedVersion: '1',
      binarySha256: 'e'.repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest) {
    const forced = request.allowedRootMoves?.[0];
    const move = forced ?? (request.position.sideToMove === 'WHITE' ? 'a2a3' : 'a7a6');
    return {
      bestMoveUci: move,
      lines: [evaluation(move, forced && request.position.moves.length === 0 ? 0 : 100)],
    };
  }

  async close(): Promise<void> {}
}

integrationDescribe('real PostgreSQL analysis lifecycle', () => {
  it('runs an HTTP-requested job to an immutable successful run', async () => {
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
    const database = new PgDatabase(connectionString);
    await runMigrations(database);
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
      const gameId = imported.json<{ gameId: string }>().gameId;
      const requested = await app.inject({
        method: 'POST',
        url: '/analysis/jobs',
        payload: { gameId, profile: 'QUICK_V1' },
      });
      expect(requested.statusCode).toBe(202);
      const jobId = requested.json<{ id: string }>().id;
      await new AnalysisWorker(
        new AnalysisRepository(database),
        () => new PostgreSqlVerificationEngine(),
        'postgres-verification-worker',
      ).runNext();
      const job = await app.inject({ method: 'GET', url: `/analysis/jobs/${jobId}` });
      expect(job.json()).toMatchObject({
        status: 'SUCCEEDED',
        progress: { processed: 20, total: 20 },
        runId: expect.any(String),
      });
      const run = await app.inject({
        method: 'GET',
        url: `/analysis/runs/${job.json<{ runId: string }>().runId}`,
      });
      expect(run.statusCode).toBe(200);
      expect(run.json<{ positions: unknown[] }>().positions).toHaveLength(20);
    } finally {
      await app.close();
      await database.close();
    }
  });
});
