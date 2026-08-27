import { expect, it } from 'vitest';

import { parsePgn } from '@chess-intelligent/chess-core';
import { runMigrations } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';
import type { PositionExploreResult } from '@chess-intelligent/domain';

import { buildApp } from '../src/app';
import { CORPUS_FIXTURE_GAMES, FOCAL_FIDE_ID } from './fixtures/corpus-games';

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

it('manually exercises exact Player filtering and four-ply corpus navigation over HTTP', async () => {
  const database = await PGliteDatabase.create();
  const migrations = await runMigrations(database);
  const app = await buildApp({ database });

  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const fixtures = CORPUS_FIXTURE_GAMES.filter((fixture) =>
      [
        'focal-e4-win',
        'focal-e4-draw',
        'focal-d4-low-opponent',
        'focal-nf3-online-transposition',
        'global-g3-transposition',
      ].includes(fixture.key),
    );
    const importedIds = new Map<string, string>();
    for (const fixture of fixtures) {
      const response = await fetch(`${address}/games/import-pgn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pgn: fixture.pgn, sourceType: 'USER_UPLOAD' }),
      });
      const body = (await response.json()) as { gameId: string };
      importedIds.set(fixture.key, body.gameId);
      await database.query('UPDATE games SET game_context = $2, time_category = $3 WHERE id = $1', [
        body.gameId,
        fixture.gameContext,
        fixture.timeCategory,
      ]);
    }

    await fetch(`${address}/games/import-pgn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pgn: fixtures[0]?.pgn, sourceType: 'USER_UPLOAD' }),
    });
    await fetch(`${address}/games/import-metadata`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'USER_UPLOAD',
        event: 'Moves unavailable',
        playedAt: '2026-10-01',
        result: '*',
        gameContext: 'OTB',
        timeCategory: 'CLASSICAL',
        white: { displayName: 'Nguyen Van A', fideId: FOCAL_FIDE_ID, rating: 2250 },
        black: { displayName: 'Metadata Opponent', fideId: '99990000', rating: 2300 },
      }),
    });

    const identityResponse = await fetch(
      `${address}/players/resolve?provider=FIDE&externalId=${FOCAL_FIDE_ID}`,
    );
    const identity = (await identityResponse.json()) as { playerId: string };
    const filters = {
      playerId: identity.playerId,
      playerColor: 'WHITE',
      gameContexts: ['OTB'],
      timeCategories: ['CLASSICAL'],
      minimumOpponentRating: 2200,
    };

    async function explore(payload: Record<string, unknown>): Promise<PositionExploreResult> {
      const response = await fetch(`${address}/positions/explore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(200);
      return (await response.json()) as PositionExploreResult;
    }

    let position = await explore({ fen: initialFen, filters });
    const firstMoveSample = position.nextMoves.map((move) => ({
      san: move.san,
      games: move.gameCount,
      frequency: move.frequency,
    }));
    for (const uci of ['e2e4', 'c7c5', 'g1f3', 'd7d6']) {
      const move = position.nextMoves.find((candidate) => candidate.uci === uci);
      if (!move) {
        throw new Error(`The HTTP navigation fixture is missing ${uci}.`);
      }
      position = await explore({ positionId: move.resultingPositionId, filters });
    }

    const transpositionFixture = fixtures.find(
      (fixture) => fixture.key === 'focal-nf3-online-transposition',
    );
    const transpositionId = parsePgn(transpositionFixture?.pgn ?? '').moves[7]?.positionId;
    if (!transpositionId) {
      throw new Error('The HTTP transposition fixture did not reach its expected position.');
    }
    const transposition = await explore({ positionId: transpositionId, filters: {} });
    const duplicateSources = await database.query<{ count: string | number }>(
      'SELECT count(*) AS count FROM game_source_records WHERE game_id = $1',
      [importedIds.get('focal-e4-win')],
    );

    const evidence = {
      migrations,
      identityHttpStatus: identityResponse.status,
      resolvedPlayerId: identity.playerId,
      filteredInitialGames: firstMoveSample.reduce((total, move) => total + move.games, 0),
      firstMoveSample,
      fourPlyNextMoves: position.nextMoves.map((move) => move.san),
      transpositionGames: transposition.sample.games,
      transpositionMoves: transposition.nextMoves.map((move) => move.san),
      duplicateProvenanceObservations: Number(duplicateSources.rows[0]?.count),
    };
    process.stdout.write(`${JSON.stringify(evidence)}\n`);

    expect(evidence).toMatchObject({
      identityHttpStatus: 200,
      filteredInitialGames: 2,
      firstMoveSample: [{ san: 'e4', games: 2, frequency: 1 }],
      fourPlyNextMoves: ['d4'],
      transpositionGames: 2,
      transpositionMoves: ['c4', 'd3'],
      duplicateProvenanceObservations: 2,
    });
  } finally {
    await app.close();
    await database.close();
  }
});
