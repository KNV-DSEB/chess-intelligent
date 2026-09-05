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

class ManualConceptEngine implements ChessEngine {
  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'Task 008 Manual Evidence Engine',
      reportedVersion: '1',
      binarySha256: '8'.repeat(64),
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
const app = await buildApp({ database, internalDevRoutes: true });
const pgn = await readFile(new URL('./fixtures/concept-evidence.pgn', import.meta.url), 'utf8');
const imported = await app.inject({
  method: 'POST',
  url: '/games/import-pgn',
  payload: { pgn, sourceType: 'USER_UPLOAD' },
});
const gameId = imported.json<{ gameId: string }>().gameId;
await app.inject({
  method: 'POST',
  url: '/analysis/jobs',
  payload: { gameId, profile: 'QUICK_V1' },
});
await new AnalysisWorker(
  new AnalysisRepository(database),
  () => new ManualConceptEngine(),
  'manual-task-008',
).runNext();
await app.inject({
  method: 'POST',
  url: `/classification/games/${gameId}`,
  payload: { ontologyVersion: '1.0.0' },
});

await app.listen({ host: '127.0.0.1', port: 4000 });
process.stdout.write(`Task 008 manual API ready; game URL http://localhost:3000/games/${gameId}\n`);

async function shutdown(): Promise<void> {
  await app.close();
  await database.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
