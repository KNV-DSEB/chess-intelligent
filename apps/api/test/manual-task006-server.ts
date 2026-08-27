import { AnalysisRepository, runMigrations } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EnginePrincipalVariation,
} from '@chess-intelligent/domain';
import { AnalysisWorker } from '../../worker/src/analysis-worker';

import { buildApp } from '../src/app';

const fideId = '13579135';

function line(rank: number, move: string, centipawns: number): EnginePrincipalVariation {
  return {
    pvRank: rank,
    rootMoveUci: move,
    moves: [move],
    score: { kind: 'CENTIPAWN', centipawns },
    depth: 11,
    seldepth: 15,
    nodes: 3_000,
    nps: 60_000,
    timeMs: 40,
    hashfull: 3,
  };
}

class ManualDossierEngine implements ChessEngine {
  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'Manual Dossier Fixture Engine',
      reportedVersion: '1',
      binarySha256: '6'.repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest) {
    const forced = request.allowedRootMoves?.[0];
    if (forced) {
      const score = request.position.sideToMove === 'WHITE' ? 80 : 280;
      return { bestMoveUci: forced, lines: [line(1, forced, score)] };
    }
    const first = request.position.sideToMove === 'WHITE' ? 'a2a3' : 'a7a6';
    const second = request.position.sideToMove === 'WHITE' ? 'b2b3' : 'b7b6';
    return {
      bestMoveUci: first,
      lines: [
        line(1, first, 180),
        line(2, second, request.position.sideToMove === 'WHITE' ? 20 : 320),
      ],
    };
  }

  async close(): Promise<void> {}
}

const database = await PGliteDatabase.create();
await runMigrations(database);
const app = await buildApp({ database, now: () => new Date('2026-08-21T08:00:00Z') });

const pgns = [
  `[Event "Manual dossier White"]
[Date "2026.06.10"]
[White "Dossier Player"]
[WhiteFideId "${fideId}"]
[WhiteElo "2120"]
[Black "Manual Opponent A"]
[BlackFideId "70000101"]
[BlackElo "2200"]
[Result "1-0"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 1-0`,
  `[Event "Manual dossier Black"]
[Date "2025.05.10"]
[White "Manual Opponent B"]
[WhiteFideId "70000102"]
[WhiteElo "2350"]
[Black "Dossier Player"]
[BlackFideId "${fideId}"]
[BlackElo "2110"]
[Result "1/2-1/2"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 1/2-1/2`,
];

for (const pgn of pgns) {
  const imported = await app.inject({
    method: 'POST',
    url: '/games/import-pgn',
    payload: { pgn, sourceType: 'USER_UPLOAD' },
  });
  const game = imported.json<{ gameId: string }>();
  await database.query(
    `UPDATE games SET game_context = 'OTB', time_category = 'CLASSICAL' WHERE id = $1`,
    [game.gameId],
  );
  await app.inject({
    method: 'POST',
    url: '/analysis/jobs',
    payload: { gameId: game.gameId, profile: 'QUICK_V1' },
  });
  await new AnalysisWorker(
    new AnalysisRepository(database),
    () => new ManualDossierEngine(),
    `manual-task006-${game.gameId}`,
  ).runNext();
}

await app.inject({
  method: 'POST',
  url: '/games/import-metadata',
  payload: {
    sourceType: 'USER_UPLOAD',
    event: 'Manual metadata coverage',
    playedAt: '2026-08-01',
    result: '*',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    white: { displayName: 'Dossier Player', fideId, rating: 2130 },
    black: { displayName: 'Manual Metadata Opponent', fideId: '70000103', rating: 2300 },
  },
});

await app.listen({ host: '127.0.0.1', port: 4000 });
process.stdout.write(`Task 006 manual API ready on http://127.0.0.1:4000; FIDE ID ${fideId}\n`);

async function shutdown(): Promise<void> {
  await app.close();
  await database.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
