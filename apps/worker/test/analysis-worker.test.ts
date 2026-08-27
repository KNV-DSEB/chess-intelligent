import { readFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../api/src/app';
import { AnalysisRepository, runMigrations, type Database } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EngineAnalysisResult,
  EnginePrincipalVariation,
} from '@chess-intelligent/domain';

import { AnalysisWorker } from '../src/analysis-worker';
import { EngineProcessError } from '../src/stockfish-uci-engine';

const fixtureUrl = new URL('../../api/test/fixtures/successful.pgn', import.meta.url);

function line(pvRank: number, rootMoveUci: string, centipawns: number): EnginePrincipalVariation {
  return {
    pvRank,
    rootMoveUci,
    moves: [rootMoveUci],
    score: { kind: 'CENTIPAWN', centipawns },
    depth: 10,
    seldepth: 14,
    nodes: 1_000,
    nps: 50_000,
    timeMs: 20,
    hashfull: 3,
  };
}

class DeterministicFakeEngine implements ChessEngine {
  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'Deterministic Fake Engine',
      reportedVersion: '1',
      binarySha256: 'f'.repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    const ply = request.position.moves.length;
    const forcedMove = request.allowedRootMoves?.[0];
    const whiteToMove = request.position.sideToMove === 'WHITE';
    if (forcedMove) {
      const playedScore = ply === 0 ? 20 : ply === 1 ? -20 : 0;
      return { bestMoveUci: forcedMove, lines: [line(1, forcedMove, playedScore)] };
    }
    const bestMove = whiteToMove ? 'a2a3' : 'a7a6';
    const bestScore = ply === 0 ? 150 : ply === 1 ? -100 : 0;
    const secondScore = ply === 0 ? 0 : bestScore - (whiteToMove ? 10 : -10);
    return {
      bestMoveUci: bestMove,
      lines: [line(2, whiteToMove ? 'b2b3' : 'b7b6', secondScore), line(1, bestMove, bestScore)],
    };
  }

  async close(): Promise<void> {}
}

class FailingFakeEngine extends DeterministicFakeEngine {
  override async newGame(): Promise<void> {
    throw new Error('deterministic configuration failure');
  }
}

class TransientFailingFakeEngine extends DeterministicFakeEngine {
  override async newGame(): Promise<void> {
    throw new EngineProcessError('transient fake process exit');
  }
}

describe('Task 004 analysis application and worker', () => {
  let database: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let pgn: string;

  beforeEach(async () => {
    database = await PGliteDatabase.create();
    await runMigrations(database);
    app = await buildApp({ database });
    pgn = await readFile(fixtureUrl, 'utf8');
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  async function importGame(inputPgn = pgn): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn: inputPgn, sourceType: 'USER_UPLOAD' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ gameId: string }>().gameId;
  }

  async function requestJob(gameId: string) {
    return app.inject({
      method: 'POST',
      url: '/analysis/jobs',
      payload: { gameId, profile: 'QUICK_V1' },
    });
  }

  it('rejects metadata-only games and deduplicates an active configuration', async () => {
    const metadata = await app.inject({
      method: 'POST',
      url: '/games/import-metadata',
      payload: {
        sourceType: 'USER_UPLOAD',
        result: '*',
        white: { displayName: 'Metadata White' },
        black: { displayName: 'Metadata Black' },
      },
    });
    const rejected = await requestJob(metadata.json<{ gameId: string }>().gameId);
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json<{ error: { code: string } }>().error.code).toBe('MOVES_REQUIRED');

    const gameId = await importGame();
    const first = await requestJob(gameId);
    const second = await requestJob(gameId);
    expect(first.statusCode).toBe(202);
    expect(first.json<{ status: string }>().status).toBe('PENDING');
    expect(second.json<{ id: string; deduplicated: boolean }>()).toMatchObject({
      id: first.json<{ id: string }>().id,
      deduplicated: true,
    });
  });

  it('persists a complete fake-engine run with ordered MultiPV and mover-centric loss', async () => {
    const gameId = await importGame();
    const requested = await requestJob(gameId);
    const jobId = requested.json<{ id: string }>().id;
    const repository = new AnalysisRepository(database);
    const worker = new AnalysisWorker(
      repository,
      () => new DeterministicFakeEngine(),
      'test-worker',
    );
    await worker.runNext();

    const job = await app.inject({ method: 'GET', url: `/analysis/jobs/${jobId}` });
    expect(job.json<{ status: string; runId: string; progress: unknown }>()).toMatchObject({
      status: 'SUCCEEDED',
      runId: expect.any(String),
      progress: { processed: 20, total: 20 },
    });
    const runId = job.json<{ runId: string }>().runId;
    const runResponse = await app.inject({ method: 'GET', url: `/analysis/runs/${runId}` });
    expect(runResponse.statusCode).toBe(200);
    const run = runResponse.json<{
      positions: Array<{
        centipawnLoss: number | null;
        multiPv: Array<{ pvRank: number }>;
        critical: { reasons: string[] } | null;
      }>;
    }>();
    expect(run.positions).toHaveLength(20);
    expect(run.positions[0]).toMatchObject({
      centipawnLoss: 130,
      multiPv: [{ pvRank: 1 }, { pvRank: 2 }],
    });
    expect(run.positions[0]?.critical?.reasons).toEqual([
      'EVAL_LOSS',
      'ADVANTAGE_DROPPED',
      'HIGH_DECISION_SENSITIVITY',
    ]);
    expect(run.positions[1]?.centipawnLoss).toBe(80);

    const repeated = await requestJob(gameId);
    expect(repeated.json<{ id: string; requestedReanalysis: boolean }>()).toMatchObject({
      id: expect.not.stringMatching(jobId),
      requestedReanalysis: true,
    });
    await worker.runNext();
    const history = await app.inject({ method: 'GET', url: `/games/${gameId}/analysis-runs` });
    expect(history.json<{ runs: unknown[] }>().runs).toHaveLength(2);
  });

  it('keeps equal normalized positions separate when exact histories differ', async () => {
    const repetitionPgn = `[Event "History identity"]
[Site "Local"]
[Date "2026.08.20"]
[Round "1"]
[White "History, White"]
[Black "History, Black"]
[Result "*"]

1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 *`;
    const gameId = await importGame(repetitionPgn);
    await requestJob(gameId);
    const repository = new AnalysisRepository(database);
    await new AnalysisWorker(
      repository,
      () => new DeterministicFakeEngine(),
      'history-worker',
    ).runNext();
    const runs = await repository.listSuccessfulRuns(gameId);
    const run = await repository.getSuccessfulRun(runs[0]!.id);
    expect(run?.positions[0]?.normalizedPositionId).toBe(run?.positions[4]?.normalizedPositionId);
    expect(run?.positions[0]?.engineState.historyUci).toEqual([]);
    expect(run?.positions[4]?.engineState.historyUci).toHaveLength(4);
    expect(run?.positions[0]?.engineState.historySha256).not.toBe(
      run?.positions[4]?.engineState.historySha256,
    );
  });

  it('marks deterministic engine failures failed and hides partial runs', async () => {
    const gameId = await importGame();
    const requested = await requestJob(gameId);
    const repository = new AnalysisRepository(database);
    await new AnalysisWorker(repository, () => new FailingFakeEngine(), 'failure-worker').runNext();
    const job = await repository.getJob(requested.json<{ id: string }>().id);
    expect(job).toMatchObject({ status: 'FAILED', error: { code: 'ANALYSIS_FAILURE' } });
    const internal = await database.query<{ id: string }>(
      `SELECT id FROM analysis_runs WHERE job_id = $1`,
      [job!.id],
    );
    expect(internal.rows).toHaveLength(1);
    expect(await repository.getSuccessfulRun(internal.rows[0]!.id)).toBeNull();
  });

  it('retries a transient engine-process failure once within the bounded attempt budget', async () => {
    const gameId = await importGame();
    const requested = await requestJob(gameId);
    const repository = new AnalysisRepository(database);
    let engineAttempt = 0;
    const worker = new AnalysisWorker(
      repository,
      () =>
        ++engineAttempt === 1 ? new TransientFailingFakeEngine() : new DeterministicFakeEngine(),
      'retry-worker',
    );
    await worker.runNext();
    expect(await repository.getJob(requested.json<{ id: string }>().id)).toMatchObject({
      status: 'PENDING',
      attemptCount: 1,
      maximumAttempts: 2,
      error: { code: 'ENGINE_PROCESS_FAILURE' },
    });
    await worker.runNext();
    expect(await repository.getJob(requested.json<{ id: string }>().id)).toMatchObject({
      status: 'SUCCEEDED',
      attemptCount: 2,
      runId: expect.any(String),
    });
    const attempts = await database.query<{ status: string }>(
      `SELECT status FROM analysis_runs WHERE job_id = $1 ORDER BY attempt_number`,
      [requested.json<{ id: string }>().id],
    );
    expect(attempts.rows).toEqual([{ status: 'FAILED' }, { status: 'SUCCEEDED' }]);
  });
});
