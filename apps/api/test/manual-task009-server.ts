import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  AnalysisRepository,
  OntologyRepository,
  readOntologySourceFile,
  runMigrations,
} from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EnginePrincipalVariation,
} from '@chess-intelligent/domain';
import { AnalysisWorker } from '../../worker/src/analysis-worker';

import { buildApp } from '../src/app';

const fideId = '12456789';

function line(rootMoveUci: string, centipawns: number): EnginePrincipalVariation {
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

class ManualSkillGraphEngine implements ChessEngine {
  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'Task 009 Manual Evidence Engine',
      reportedVersion: '1',
      binarySha256: '9'.repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest) {
    const ply = request.position.moves.length;
    const bestMoves = ['e4g5', 'e8f8', 'f3e5', 'b6c4'];
    const bestScores = [100, -50, 100, -150];
    const playedScores = [95, -50, 90, -20];
    const rootMove = request.allowedRootMoves?.[0] ?? bestMoves[ply]!;
    const score = request.allowedRootMoves ? playedScores[ply]! : bestScores[ply]!;
    return { bestMoveUci: rootMove, lines: [line(rootMove, score)] };
  }

  async close(): Promise<void> {}
}

const database = await PGliteDatabase.create();
await runMigrations(database);
await new OntologyRepository(database).sync(await readOntologySourceFile());
const app = await buildApp({ database, now: () => new Date('2026-08-27T12:00:00Z') });

async function importFixture(name: string): Promise<string> {
  const pgn = await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  const imported = await app.inject({
    method: 'POST',
    url: '/games/import-pgn',
    payload: { pgn, sourceType: 'USER_UPLOAD' },
  });
  return imported.json<{ gameId: string }>().gameId;
}

const conceptGameId = await importFixture('concept-evidence.pgn');
await database.query(
  `UPDATE games
   SET game_context = 'OTB', time_category = 'CLASSICAL', played_at = '2026-08-22'::date
   WHERE id = $1`,
  [conceptGameId],
);
const focal = await database.query<{ player_id: string }>(
  `SELECT player_id FROM game_players WHERE game_id = $1 AND color = 'WHITE'`,
  [conceptGameId],
);
const focalPlayerId = focal.rows[0]!.player_id;
await database.query(
  `INSERT INTO external_identities (
     id, player_id, provider, external_id, verification_status, confidence, link_reason
   ) VALUES ($1, $2, 'FIDE', $3, 'VERIFIED', 1, 'TASK_009_MANUAL_FIXTURE')`,
  [randomUUID(), focalPlayerId, fideId],
);
await app.inject({
  method: 'POST',
  url: '/analysis/jobs',
  payload: { gameId: conceptGameId, profile: 'QUICK_V1' },
});
await new AnalysisWorker(
  new AnalysisRepository(database),
  () => new ManualSkillGraphEngine(),
  'manual-task-009',
).runNext();
await app.inject({
  method: 'POST',
  url: `/classification/games/${conceptGameId}`,
  payload: { ontologyVersion: '1.0.0' },
});

const ordinaryGameId = await importFixture('successful.pgn');
await database.query(
  `UPDATE games
   SET game_context = 'OTB', time_category = 'CLASSICAL', played_at = '2025-08-27'::date
   WHERE id = $1`,
  [ordinaryGameId],
);
await database.query(
  `UPDATE game_players SET player_id = $2, display_name = 'Evidence, White'
   WHERE game_id = $1 AND color = 'WHITE'`,
  [ordinaryGameId, focalPlayerId],
);
await app.inject({
  method: 'POST',
  url: `/classification/games/${ordinaryGameId}`,
  payload: { ontologyVersion: '1.0.0' },
});

await app.listen({ host: '127.0.0.1', port: 4000 });
process.stdout.write(
  `Task 009 manual API ready on http://127.0.0.1:4000; Skill Graph FIDE ID ${fideId}\n`,
);

async function shutdown(): Promise<void> {
  await app.close();
  await database.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
