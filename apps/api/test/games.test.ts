import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations, type Database } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';

import { buildApp } from '../src/app';

const fixtureUrl = new URL('./fixtures/successful.pgn', import.meta.url);

interface CountRow {
  count: string | number;
}

interface ImportResponse {
  status: 'created' | 'already_exists';
  gameId: string;
  importJobId: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    importJobId?: string;
  };
}

describe('games API', () => {
  let database: Database;
  let app: FastifyInstance;
  let validPgn: string;

  beforeEach(async () => {
    validPgn = await readFile(fixtureUrl, 'utf8');
    database = await PGliteDatabase.create();
    await runMigrations(database);
    app = await buildApp({ database });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  it('imports and retrieves a legal PGN with provenance and normalized moves', async () => {
    const imported = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn: validPgn, sourceType: 'USER_UPLOAD' },
    });

    expect(imported.statusCode).toBe(201);
    const importBody = imported.json<ImportResponse>();
    expect(importBody.status).toBe('created');

    const retrieved = await app.inject({ method: 'GET', url: `/games/${importBody.gameId}` });
    expect(retrieved.statusCode).toBe(200);
    const game = retrieved.json<{
      pgnStatus: string;
      result: string;
      players: Array<{
        id: string;
        color: string;
        displayName: string;
        rating: number | null;
      }>;
      provenance: Array<{ sourceType: string; rawPgn: string; permissionBasis: string }>;
      moves: Array<{ ply: number; san: string; uci: string; fenAfter: string; positionId: string }>;
    }>();

    expect(game.pgnStatus).toBe('PGN_IMPORTED');
    expect(game.result).toBe('1-0');
    expect(game.players).toEqual([
      {
        color: 'WHITE',
        displayName: 'Student, Ada',
        id: expect.any(String),
        rating: 1725,
        fideId: null,
        fideVerificationStatus: null,
      },
      {
        color: 'BLACK',
        displayName: 'Coach, Grace',
        id: expect.any(String),
        rating: 2210,
        fideId: null,
        fideVerificationStatus: null,
      },
    ]);
    expect(game.provenance[0]).toMatchObject({
      sourceType: 'USER_UPLOAD',
      rawPgn: validPgn,
      permissionBasis: 'USER_SUPPLIED',
    });
    expect(game.moves).toHaveLength(20);
    expect(game.moves[0]).toMatchObject({ ply: 1, san: 'e4', uci: 'e2e4' });
    expect(game.moves[0]?.fenAfter).toContain(' b KQkq ');
    expect(game.moves[0]?.positionId).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('returns a useful 4xx error for an illegal move and leaves no canonical data', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: {
        pgn: '[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 2. Bh6 *',
        sourceType: 'USER_UPLOAD',
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<ErrorResponse>().error).toMatchObject({
      code: 'INVALID_PGN',
      importJobId: expect.any(String),
    });
    expect(response.json<ErrorResponse>().error.message).toContain('illegal move');

    const games = await database.query<CountRow>('SELECT count(*) AS count FROM games');
    const moves = await database.query<CountRow>('SELECT count(*) AS count FROM moves');
    expect(Number(games.rows[0]?.count)).toBe(0);
    expect(Number(moves.rows[0]?.count)).toBe(0);
  });

  it('returns the canonical game when the same PGN is imported twice', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn: validPgn, sourceType: 'USER_UPLOAD' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn: validPgn, sourceType: 'USER_UPLOAD' },
    });

    const firstBody = first.json<ImportResponse>();
    const secondBody = second.json<ImportResponse>();
    expect(second.statusCode).toBe(200);
    expect(secondBody.status).toBe('already_exists');
    expect(secondBody.gameId).toBe(firstBody.gameId);

    const games = await database.query<CountRow>('SELECT count(*) AS count FROM games');
    const sources = await database.query<CountRow>(
      'SELECT count(*) AS count FROM game_source_records',
    );
    expect(Number(games.rows[0]?.count)).toBe(1);
    expect(Number(sources.rows[0]?.count)).toBe(2);
  });

  it('rolls back game, players, positions, and moves when persistence fails mid-import', async () => {
    await database.execute(
      'ALTER TABLE moves ADD CONSTRAINT reject_second_ply_for_test CHECK (ply <> 2)',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn: validPgn, sourceType: 'USER_UPLOAD' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json<ErrorResponse>().error.code).toBe('PERSISTENCE_FAILED');

    const canonicalTables = [
      'games',
      'players',
      'game_players',
      'positions',
      'moves',
      'position_occurrences',
      'game_source_records',
    ];
    for (const table of canonicalTables) {
      const result = await database.query<CountRow>(`SELECT count(*) AS count FROM ${table}`);
      expect(Number(result.rows[0]?.count), table).toBe(0);
    }

    const failedJobs = await database.query<CountRow>(
      "SELECT count(*) AS count FROM import_jobs WHERE status = 'FAILED'",
    );
    expect(Number(failedJobs.rows[0]?.count)).toBe(1);
  });
});
