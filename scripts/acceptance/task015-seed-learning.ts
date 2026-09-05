import { readFile } from 'node:fs/promises';

import {
  AnalysisRepository,
  OntologyRepository,
  PgDatabase,
  TrainingRepository,
} from '@chess-intelligent/db';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EngineAnalysisResult,
  EnginePrincipalVariation,
} from '@chess-intelligent/domain';

import { buildApp } from '../../apps/api/src/app';
import { AnalysisWorker } from '../../apps/worker/src/analysis-worker';

function principalVariation(rootMoveUci: string, centipawns: number): EnginePrincipalVariation {
  return {
    pvRank: 1,
    rootMoveUci,
    moves: [rootMoveUci],
    score: { kind: 'CENTIPAWN', centipawns },
    depth: 10,
    seldepth: 12,
    nodes: 800,
    nps: 40_000,
    timeMs: 20,
    hashfull: 2,
  };
}

class FixtureEngine implements ChessEngine {
  constructor(private readonly mode: 'FORK_MISS' | 'PIN_SOUND') {}

  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: `Task 015 ${this.mode}`,
      reportedVersion: '1',
      binarySha256: (this.mode === 'FORK_MISS' ? '8' : '7').repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    const ply = request.position.moves.length;
    const forkMoves = ['e4g5', 'e8f8', 'f3e5', 'b6c4'];
    const bestMoves = this.mode === 'PIN_SOUND' ? [...forkMoves.slice(0, 3), 'c5b4'] : forkMoves;
    const bestScores = [100, -50, 100, this.mode === 'PIN_SOUND' ? -20 : -150];
    const playedScores = [95, -50, 90, -20];
    const rootMove = request.allowedRootMoves?.[0] ?? bestMoves[ply]!;
    const score = request.allowedRootMoves ? playedScores[ply]! : bestScores[ply]!;
    return { bestMoveUci: rootMove, lines: [principalVariation(rootMove, score)] };
  }

  async close(): Promise<void> {}
}

const connectionString = process.env.DATABASE_URL;
const fixturePath = process.env.TASK015_FIXTURE_PATH;
if (!connectionString) throw new Error('DATABASE_URL is required.');
if (!fixturePath) throw new Error('TASK015_FIXTURE_PATH is required.');

const database = new PgDatabase(connectionString, { applicationName: 'task015-learning-seed' });
const ontology = await new OntologyRepository(database).getPublishedVersion('1.0.0');
if (!ontology) throw new Error('Published ontology 1.0.0 is required before acceptance seeding.');

const app = await buildApp({ database, internalDevRoutes: true });

try {
  const fixture = await readFile(fixturePath, 'utf8');

  async function importGame(date: string): Promise<string> {
    const pgn = fixture.replace('[Date "2026.08.22"]', `[Date "${date.replaceAll('-', '.')}"]`);
    const response = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn, sourceType: 'USER_UPLOAD' },
    });
    if (response.statusCode !== 201) throw new Error(`Import failed: ${response.body}`);
    const gameId = response.json<{ gameId: string }>().gameId;
    await database.query(
      `UPDATE games SET game_context = 'OTB', time_category = 'CLASSICAL', played_at = $2::date
       WHERE id = $1`,
      [gameId, date],
    );
    return gameId;
  }

  async function analyzeWithFixture(
    gameId: string,
    mode: 'FORK_MISS' | 'PIN_SOUND',
  ): Promise<string> {
    const requested = await new AnalysisRepository(database).requestJob({
      gameId,
      profile: 'QUICK_V1',
    });
    await new AnalysisWorker(
      new AnalysisRepository(database),
      () => new FixtureEngine(mode),
      `task-015-${mode}`,
    ).runNext();
    const completed = await new AnalysisRepository(database).getJob(requested.job.id);
    if (completed?.status !== 'SUCCEEDED' || !completed.runId) {
      throw new Error(`Fixture analysis ${requested.job.id} did not succeed.`);
    }
    return completed.runId;
  }

  async function classify(gameId: string, analysisRunId: string): Promise<void> {
    const response = await app.inject({
      method: 'POST',
      url: `/classification/games/${gameId}`,
      payload: { ontologyVersion: '1.0.0', analysisRunId },
    });
    if (response.statusCode !== 201) throw new Error(`Classification failed: ${response.body}`);
  }

  const forkGameId = await importGame('2026-09-01');
  const pinGameId = await importGame('2026-09-02');
  const focal = await database.query<{ player_id: string }>(
    `SELECT player_id FROM game_players WHERE game_id = $1 AND color = 'BLACK'`,
    [forkGameId],
  );
  const playerId = focal.rows[0]?.player_id;
  if (!playerId) throw new Error('Fixture focal Player was not persisted.');
  await database.query(
    `UPDATE game_players SET player_id = $2, display_name = 'Evidence, Black'
     WHERE game_id = $1 AND color = 'BLACK'`,
    [pinGameId, playerId],
  );

  await classify(forkGameId, await analyzeWithFixture(forkGameId, 'FORK_MISS'));
  await classify(pinGameId, await analyzeWithFixture(pinGameId, 'PIN_SOUND'));

  const graphResponse = await app.inject({
    method: 'POST',
    url: '/intelligence/player-skill-graph',
    payload: {
      playerId,
      ontologyVersion: '1.0.0',
      asOfDate: '2026-09-03',
      scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
    },
  });
  if (graphResponse.statusCode !== 201)
    throw new Error(`Skill Graph failed: ${graphResponse.body}`);
  const baselineSkillGraphRunId = graphResponse.json<{ run: { id: string } }>().run.id;

  const planResponse = await app.inject({
    method: 'POST',
    url: '/training/plans',
    payload: { playerId, skillGraphRunId: baselineSkillGraphRunId, maxItems: 10 },
  });
  if (planResponse.statusCode !== 201)
    throw new Error(`Training plan failed: ${planResponse.body}`);
  const plan = planResponse.json<{
    run: { id: string };
    trainingItems: Array<{ id: string; trainingMode: string }>;
  }>();
  if (plan.trainingItems.length === 0) throw new Error('No valid training item was materialized.');

  const training = new TrainingRepository(database);
  const privateTrainingItems = await Promise.all(
    plan.trainingItems.map(async (item) => {
      const record = await training.getItem(item.id);
      if (!record) throw new Error(`Training item ${item.id} was not persisted.`);
      return {
        id: item.id,
        trainingMode: item.trainingMode,
        acceptedMoveUci: record.acceptedMoveUcis[0],
      };
    }),
  );

  const realGameId = await importGame('2026-09-03');
  const realJob = await new AnalysisRepository(database).requestJob({
    gameId: realGameId,
    profile: 'QUICK_V1',
  });

  process.stdout.write(
    `${JSON.stringify({
      playerId,
      forkGameId,
      pinGameId,
      baselineSkillGraphRunId,
      trainingPlanRunId: plan.run.id,
      trainingItems: privateTrainingItems,
      realStockfish: { gameId: realGameId, jobId: realJob.job.id },
    })}\n`,
  );
} finally {
  await app.close();
  await database.close();
}
