import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parsePgn } from '@chess-intelligent/chess-core';
import { PgDatabase, runMigrations, type Database } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';
import type { PlayerCorpusSummary, PositionExploreResult } from '@chess-intelligent/domain';

import { buildApp } from '../src/app';
import { CORPUS_FIXTURE_GAMES, FOCAL_FIDE_ID } from './fixtures/corpus-games';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface ImportResponse {
  status: 'created' | 'already_exists';
  gameId: string;
}

interface ResolvedPlayerResponse {
  playerId: string;
  displayName: string;
  identity: { provider: string; externalId: string };
}

describe.sequential('position corpus explorer', () => {
  let database: Database;
  let app: FastifyInstance;
  let focalPlayer: ResolvedPlayerResponse;
  const gameIds = new Map<string, string>();

  beforeAll(async () => {
    database = process.env.TEST_CORPUS_DATABASE_URL
      ? new PgDatabase(process.env.TEST_CORPUS_DATABASE_URL)
      : await PGliteDatabase.create();
    await runMigrations(database);
    app = await buildApp({ database });

    for (const fixture of CORPUS_FIXTURE_GAMES) {
      const response = await app.inject({
        method: 'POST',
        url: '/games/import-pgn',
        payload: { pgn: fixture.pgn, sourceType: 'USER_UPLOAD' },
      });
      expect(response.statusCode, response.body).toBe(201);
      const imported = response.json<ImportResponse>();
      gameIds.set(fixture.key, imported.gameId);
      await database.query(`UPDATE games SET game_context = $2, time_category = $3 WHERE id = $1`, [
        imported.gameId,
        fixture.gameContext,
        fixture.timeCategory,
      ]);
    }

    const duplicate = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn: CORPUS_FIXTURE_GAMES[0]?.pgn, sourceType: 'USER_UPLOAD' },
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json<ImportResponse>().status).toBe('already_exists');

    const metadata = await app.inject({
      method: 'POST',
      url: '/games/import-metadata',
      payload: {
        sourceType: 'USER_UPLOAD',
        event: 'Known game without moves',
        playedAt: '2026-10-01',
        round: '1',
        boardNumber: 1,
        result: '1-0',
        gameContext: 'OTB',
        timeCategory: 'CLASSICAL',
        white: { displayName: 'Nguyen Van A', fideId: FOCAL_FIDE_ID, rating: 2250 },
        black: { displayName: 'Metadata Opponent', fideId: '99990000', rating: 2300 },
      },
    });
    expect(metadata.statusCode, metadata.body).toBe(201);

    const resolved = await app.inject({
      method: 'GET',
      url: `/players/resolve?provider=FIDE&externalId=${FOCAL_FIDE_ID}`,
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    focalPlayer = resolved.json<ResolvedPlayerResponse>();
  }, 20_000);

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  async function explore(
    filters: Record<string, unknown> = {},
    position: { fen?: string; positionId?: string } = { fen: INITIAL_FEN },
  ): Promise<PositionExploreResult> {
    const response = await app.inject({
      method: 'POST',
      url: '/positions/explore',
      payload: { ...position, filters },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PositionExploreResult>();
  }

  it('explores the initial position with canonical-game counts and transparent statistics', async () => {
    const result = await explore();

    expect(result.position.sideToMove).toBe('WHITE');
    expect(result.sample.games).toBe(9);
    expect(result.nextMoves.reduce((total, move) => total + move.frequency, 0)).toBeCloseTo(1, 10);
    expect(result.scorePerspective).toBe('SIDE_TO_MOVE');
    expect(result.nextMoves.map((move) => [move.san, move.gameCount])).toEqual([
      ['e4', 4],
      ['d4', 2],
      ['Nf3', 1],
      ['c4', 1],
      ['g3', 1],
    ]);

    const e4 = result.nextMoves[0];
    expect(e4).toMatchObject({
      san: 'e4',
      whiteWins: 3,
      draws: 1,
      blackWins: 0,
      scorePerspective: 'SIDE_TO_MOVE',
    });
    expect(e4?.frequency).toBeCloseTo(4 / 9, 10);
    expect(e4?.score).toBeCloseTo(0.875, 10);
    expect(e4?.representativeGames[0]).toMatchObject({
      gameId: expect.any(String),
      sourceTypes: ['USER_UPLOAD'],
    });
  });

  it('resolves exact FIDE identity and applies color, context, category, date, and opponent Elo', async () => {
    expect(focalPlayer).toMatchObject({
      displayName: 'Nguyen Van A',
      identity: { provider: 'FIDE', externalId: FOCAL_FIDE_ID },
    });

    const filtered = await explore({
      externalIdentity: { provider: 'FIDE', externalId: FOCAL_FIDE_ID },
      playerColor: 'WHITE',
      gameContexts: ['OTB'],
      timeCategories: ['CLASSICAL'],
      playedFrom: '2024-01-01',
      minimumOpponentRating: 2200,
    });
    expect(filtered.sample.games).toBe(2);
    expect(filtered.nextMoves).toHaveLength(1);
    expect(filtered.nextMoves[0]).toMatchObject({ san: 'e4', gameCount: 2 });
    expect(filtered.scorePerspective).toBe('FOCAL_PLAYER');

    const withoutEloMinimum = await explore({
      playerId: focalPlayer.playerId,
      playerColor: 'WHITE',
      gameContexts: ['OTB'],
      timeCategories: ['CLASSICAL'],
    });
    expect(withoutEloMinimum.sample.games).toBe(4);
    expect(filtered.sample.games).toBeLessThan(withoutEloMinimum.sample.games);
  });

  it('does not include a same-name unrelated Player in exact-identity results', async () => {
    const exact = await explore({ playerId: focalPlayer.playerId });
    expect(exact.sample.games).toBe(7);

    const unknown = await app.inject({
      method: 'GET',
      url: '/players/resolve?provider=FIDE&externalId=00009999',
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: { code: 'IDENTITY_NOT_FOUND' } });
  });

  it('uses historical opponent ratings and excludes unknown ratings from minimum filters', async () => {
    const atLeast2200 = await explore({
      playerId: focalPlayer.playerId,
      playerColor: 'WHITE',
      gameContexts: ['OTB'],
      timeCategories: ['CLASSICAL'],
      minimumOpponentRating: 2200,
    });
    expect(atLeast2200.sample.games).toBe(2);

    const atLeast2199 = await explore({
      playerId: focalPlayer.playerId,
      playerColor: 'WHITE',
      gameContexts: ['OTB'],
      timeCategories: ['CLASSICAL'],
      minimumOpponentRating: 2199,
    });
    expect(atLeast2199.sample.games).toBe(3);
  });

  it('keeps FOCAL_PLAYER score distinct from SIDE_TO_MOVE score', async () => {
    const focalBlack = await explore({ playerId: focalPlayer.playerId, playerColor: 'BLACK' });
    expect(focalBlack).toMatchObject({
      sample: { games: 1 },
      scorePerspective: 'FOCAL_PLAYER',
    });
    expect(focalBlack.nextMoves[0]).toMatchObject({ san: 'c4', score: 1 });

    const global = await explore();
    const globalC4 = global.nextMoves.find((move) => move.san === 'c4');
    expect(globalC4).toMatchObject({ scorePerspective: 'SIDE_TO_MOVE', score: 0 });
  });

  it('groups transpositions and exposes both observed continuations', async () => {
    const knightFirst = CORPUS_FIXTURE_GAMES.find(
      (game) => game.key === 'focal-nf3-online-transposition',
    );
    const pawnFirst = CORPUS_FIXTURE_GAMES.find((game) => game.key === 'global-g3-transposition');
    expect(knightFirst).toBeDefined();
    expect(pawnFirst).toBeDefined();
    const knightPosition = parsePgn(knightFirst?.pgn ?? '').moves[7];
    const pawnPosition = parsePgn(pawnFirst?.pgn ?? '').moves[7];
    if (!knightPosition || !pawnPosition) {
      throw new Error('The transposition fixtures did not reach their expected position.');
    }
    expect(knightPosition?.positionId).toBe(pawnPosition?.positionId);

    const transposition = await explore({}, { positionId: knightPosition.positionId });
    expect(transposition.sample.games).toBe(2);
    expect(transposition.nextMoves.map((move) => [move.san, move.gameCount])).toEqual([
      ['c4', 1],
      ['d3', 1],
    ]);
  });

  it('navigates through resulting persisted positions without reparsing PGNs', async () => {
    let result = await explore();
    for (const uci of ['e2e4', 'c7c5', 'g1f3', 'd7d6']) {
      const move = result.nextMoves.find((candidate) => candidate.uci === uci);
      expect(move, uci).toBeDefined();
      if (!move) {
        throw new Error(`The navigation fixture is missing ${uci}.`);
      }
      result = await explore({}, { positionId: move.resultingPositionId });
    }
    expect(result.nextMoves.map((move) => move.san)).toContain('d4');
  });

  it('excludes metadata-only games and never multiplies a game by provenance observations', async () => {
    const result = await explore({ sourceTypes: ['USER_UPLOAD'] });
    expect(result.sample.games).toBe(9);

    const duplicateGameId = gameIds.get('focal-e4-win');
    const sources = await database.query<{ count: string | number }>(
      'SELECT count(*) AS count FROM game_source_records WHERE game_id = $1',
      [duplicateGameId],
    );
    expect(Number(sources.rows[0]?.count)).toBe(2);

    const metadataGames = await database.query<{ count: string | number }>(
      "SELECT count(*) AS count FROM games WHERE content_status = 'METADATA_ONLY'",
    );
    expect(Number(metadataGames.rows[0]?.count)).toBe(1);
  });

  it('supports minimum samples, valid empty results, and explicit invalid-FEN errors', async () => {
    const minimumSample = await explore({ minimumSampleSize: 3 });
    expect(minimumSample.sample.games).toBe(9);
    expect(minimumSample.nextMoves.map((move) => move.san)).toEqual(['e4']);

    const empty = await explore({ playedFrom: '2030-01-01' });
    expect(empty).toMatchObject({ sample: { games: 0 }, nextMoves: [] });

    const invalid = await app.inject({
      method: 'POST',
      url: '/positions/explore',
      payload: { fen: 'not a fen', filters: {} },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json()).toMatchObject({ error: { code: 'INVALID_FEN' } });
  });

  it('returns a canonical, non-inflated Player corpus summary', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/players/${focalPlayer.playerId}/corpus-summary`,
    });
    expect(response.statusCode, response.body).toBe(200);
    const summary = response.json<PlayerCorpusSummary>();
    expect(summary).toMatchObject({
      totalCanonicalGames: 8,
      gamesWithMoves: 7,
      metadataOnlyGames: 1,
      whiteGames: 7,
      blackGames: 1,
      otbGames: 7,
      onlineGames: 1,
      classicalGames: 6,
      rapidGames: 1,
      blitzGames: 1,
      earliestKnownGame: '2024-01-10',
      latestKnownGame: '2026-10-01',
    });
    expect(summary.sourceCoverage).toEqual([
      { sourceType: 'USER_UPLOAD', canonicalGames: 8, observations: 9 },
    ]);
  });
});
