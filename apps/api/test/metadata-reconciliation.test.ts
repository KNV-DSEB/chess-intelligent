import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations, type Database } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';

import { buildApp } from '../src/app';

interface CountRow {
  count: string | number;
}

interface MetadataResponse {
  gameId: string;
  contentStatus: 'METADATA_ONLY';
}

interface ReconciliationResponse {
  candidates: Array<{
    gameId: string;
    classification: string;
    matchedFields: string[];
    conflictingFields: string[];
    reasons: string[];
  }>;
}

const fixtureUrl = new URL('./fixtures/metadata-match.pgn', import.meta.url);

function metadataPayload(
  input: {
    whiteName?: string;
    whiteFideId?: string | null;
    blackName?: string;
    blackFideId?: string | null;
    result?: string;
    externalGameId?: string | null;
  } = {},
) {
  return {
    sourceType: 'USER_UPLOAD',
    event: 'Bangkok Open 2026',
    site: 'Bangkok, Thailand',
    round: '4',
    boardNumber: 18,
    playedAt: '2026-04-15',
    result: input.result ?? '1-0',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    white: {
      displayName: input.whiteName ?? 'Nguyen Van A',
      rating: 2185,
      fideId: input.whiteFideId === undefined ? '12456789' : input.whiteFideId,
    },
    black: {
      displayName: input.blackName ?? 'Player B',
      rating: 2241,
      fideId: input.blackFideId === undefined ? '98765432' : input.blackFideId,
    },
    externalTournamentId: 'bangkok-open-2026',
    externalGameId: input.externalGameId ?? null,
  };
}

describe('metadata-only ingestion and reviewed PGN reconciliation', () => {
  let database: Database;
  let app: FastifyInstance;
  let matchingPgn: string;

  beforeEach(async () => {
    matchingPgn = await readFile(fixtureUrl, 'utf8');
    database = await PGliteDatabase.create();
    await runMigrations(database);
    app = await buildApp({ database });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  async function createMetadata(payload = metadataPayload()): Promise<MetadataResponse> {
    const response = await app.inject({
      method: 'POST',
      url: '/games/import-metadata',
      payload,
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<MetadataResponse>();
  }

  async function reconcile(pgn = matchingPgn, externalGameId: string | null = null) {
    const response = await app.inject({
      method: 'POST',
      url: '/games/reconcile-pgn',
      payload: {
        pgn,
        sourceType: 'USER_UPLOAD',
        externalGameId,
        externalTournamentId: 'bangkok-open-2026',
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<ReconciliationResponse>();
  }

  async function attach(gameId: string, pgn = matchingPgn, expected = 'HIGH_CONFIDENCE_MATCH') {
    return app.inject({
      method: 'POST',
      url: `/games/${gameId}/attach-pgn`,
      payload: {
        pgn,
        sourceType: 'USER_UPLOAD',
        externalTournamentId: 'bangkok-open-2026',
        expectedReconciliationClassification: expected,
      },
    });
  }

  it('persists a valid metadata-only OTB game with no move or position records', async () => {
    const created = await createMetadata();
    expect(created.contentStatus).toBe('METADATA_ONLY');

    const response = await app.inject({ method: 'GET', url: `/games/${created.gameId}` });
    const game = response.json<{
      contentStatus: string;
      verificationStatus: string;
      event: string;
      gameContext: string;
      timeCategory: string;
      moves: unknown[];
      players: Array<{ fideId: string }>;
      provenance: Array<{
        observationKind: string;
        rawMetadata: { payload: { event: string } };
      }>;
    }>();
    expect(game).toMatchObject({
      contentStatus: 'METADATA_ONLY',
      verificationStatus: 'UNVERIFIED',
      event: 'Bangkok Open 2026',
      gameContext: 'OTB',
      timeCategory: 'CLASSICAL',
      moves: [],
    });
    expect(game.players.map((player) => player.fideId)).toEqual(['12456789', '98765432']);
    expect(game.provenance[0]).toMatchObject({
      observationKind: 'METADATA',
      rawMetadata: { payload: { event: 'Bangkok Open 2026' } },
    });

    for (const table of ['moves', 'positions']) {
      const count = await database.query<CountRow>(`SELECT count(*) AS count FROM ${table}`);
      expect(Number(count.rows[0]?.count), table).toBe(0);
    }
  });

  it('reuses a Player through an existing verified FIDE ExternalIdentity', async () => {
    const first = await createMetadata();
    const second = await createMetadata(
      metadataPayload({ blackName: 'Another Opponent', blackFideId: '11112222' }),
    );
    const players = await database.query<{ game_id: string; player_id: string }>(
      `SELECT game_id, player_id FROM game_players
       WHERE color = 'WHITE' AND game_id IN ($1, $2)
       ORDER BY game_id`,
      [first.gameId, second.gameId],
    );
    expect(players.rows).toHaveLength(2);
    expect(players.rows[0]?.player_id).toBe(players.rows[1]?.player_id);

    const identities = await database.query<CountRow>(
      "SELECT count(*) AS count FROM external_identities WHERE provider = 'FIDE' AND external_id = '12456789'",
    );
    expect(Number(identities.rows[0]?.count)).toBe(1);
  });

  it('does not merge equal names without a shared verified identity', async () => {
    const first = await createMetadata(
      metadataPayload({ whiteName: 'Same Name', whiteFideId: null, blackFideId: null }),
    );
    const second = await createMetadata(
      metadataPayload({ whiteName: 'Same Name', whiteFideId: null, blackFideId: null }),
    );
    const players = await database.query<{ player_id: string }>(
      `SELECT player_id FROM game_players
       WHERE color = 'WHITE' AND game_id IN ($1, $2)`,
      [first.gameId, second.gameId],
    );
    expect(new Set(players.rows.map((player) => player.player_id)).size).toBe(2);
  });

  it('rejects structurally invalid dates, ratings, results, and duplicate color identities', async () => {
    const invalid = metadataPayload();
    const response = await app.inject({
      method: 'POST',
      url: '/games/import-metadata',
      payload: {
        ...invalid,
        playedAt: '2026-02-30',
        result: '2-0',
        white: { ...invalid.white, rating: 9000 },
        black: { ...invalid.black, fideId: invalid.white.fideId },
      },
    });
    expect(response.statusCode).toBe(400);
    const games = await database.query<CountRow>('SELECT count(*) AS count FROM games');
    expect(Number(games.rows[0]?.count)).toBe(0);
  });

  it('returns a high-confidence candidate with deterministic evidence', async () => {
    const created = await createMetadata();
    const report = await reconcile();
    expect(report.candidates[0]).toMatchObject({
      gameId: created.gameId,
      classification: 'HIGH_CONFIDENCE_MATCH',
      conflictingFields: [],
    });
    expect(report.candidates[0]?.matchedFields).toEqual(
      expect.arrayContaining([
        'white.fideId',
        'black.fideId',
        'playedAt',
        'result',
        'event',
        'round',
      ]),
    );
  });

  it('uses same-provider external game ID as exact evidence', async () => {
    const created = await createMetadata(metadataPayload({ externalGameId: 'game-18' }));
    const report = await reconcile(matchingPgn, 'game-18');
    expect(report.candidates[0]).toMatchObject({
      gameId: created.gameId,
      classification: 'EXACT_MATCH',
      matchedFields: expect.arrayContaining(['source.externalGameId']),
    });
  });

  it('marks name-only evidence ambiguous and returns no candidate for unrelated games', async () => {
    const ambiguousGame = await createMetadata(
      metadataPayload({ whiteFideId: null, blackFideId: null }),
    );
    const ambiguous = await reconcile();
    expect(ambiguous.candidates[0]).toMatchObject({
      gameId: ambiguousGame.gameId,
      classification: 'AMBIGUOUS_MATCH',
    });

    const unrelatedPayload = {
      ...metadataPayload({
        whiteName: 'Unrelated White',
        whiteFideId: '33334444',
        blackName: 'Unrelated Black',
        blackFideId: '77778888',
      }),
      event: 'Different Event',
      playedAt: '2025-01-01',
      round: '9',
      boardNumber: '99',
    };
    const separateDatabase = await PGliteDatabase.create();
    await runMigrations(separateDatabase);
    const separateApp = await buildApp({ database: separateDatabase });
    try {
      const created = await separateApp.inject({
        method: 'POST',
        url: '/games/import-metadata',
        payload: unrelatedPayload,
      });
      expect(created.statusCode).toBe(201);
      const none = await separateApp.inject({
        method: 'POST',
        url: '/games/reconcile-pgn',
        payload: { pgn: matchingPgn, sourceType: 'USER_UPLOAD' },
      });
      expect(none.json<ReconciliationResponse>().candidates).toEqual([]);
    } finally {
      await separateApp.close();
      await separateDatabase.close();
    }
  });

  it('reports result and player identity conflicts instead of merging', async () => {
    const created = await createMetadata();
    const resultConflict = await reconcile(matchingPgn.replaceAll('1-0', '0-1'));
    expect(resultConflict.candidates[0]).toMatchObject({
      gameId: created.gameId,
      classification: 'CONFLICT',
      conflictingFields: expect.arrayContaining(['result']),
    });

    const identityConflictPgn = matchingPgn.replace('98765432', '55556666');
    const identityConflict = await reconcile(identityConflictPgn);
    expect(identityConflict.candidates[0]).toMatchObject({
      gameId: created.gameId,
      classification: 'CONFLICT',
      conflictingFields: expect.arrayContaining(['players.fideId']),
    });
  });

  it('attaches reviewed PGN to the same game and preserves both provenance observations', async () => {
    const created = await createMetadata();
    const attached = await attach(created.gameId);
    expect(attached.statusCode, attached.body).toBe(201);
    expect(attached.json()).toMatchObject({
      status: 'attached',
      gameId: created.gameId,
      contentStatus: 'MOVES_AVAILABLE',
      verificationStatus: 'VERIFIED',
    });

    const response = await app.inject({ method: 'GET', url: `/games/${created.gameId}` });
    const game = response.json<{
      id: string;
      contentStatus: string;
      event: string;
      moves: unknown[];
      provenance: Array<{ observationKind: string }>;
    }>();
    expect(game.id).toBe(created.gameId);
    expect(game.contentStatus).toBe('MOVES_AVAILABLE');
    expect(game.event).toBe('Bangkok Open 2026');
    expect(game.moves).toHaveLength(10);
    expect(game.provenance.map((source) => source.observationKind)).toEqual(['METADATA', 'PGN']);

    const games = await database.query<CountRow>('SELECT count(*) AS count FROM games');
    expect(Number(games.rows[0]?.count)).toBe(1);
  });

  it('rolls back every attachment change when move persistence fails', async () => {
    const created = await createMetadata();
    await database.execute(
      'ALTER TABLE moves ADD CONSTRAINT reject_attachment_second_ply CHECK (ply <> 2)',
    );
    const attached = await attach(created.gameId);
    expect(attached.statusCode).toBe(500);

    const response = await app.inject({ method: 'GET', url: `/games/${created.gameId}` });
    const game = response.json<{
      contentStatus: string;
      verificationStatus: string;
      moves: unknown[];
      provenance: unknown[];
    }>();
    expect(game).toMatchObject({
      contentStatus: 'METADATA_ONLY',
      verificationStatus: 'UNVERIFIED',
      moves: [],
    });
    expect(game.provenance).toHaveLength(1);
    const occurrences = await database.query<CountRow>(
      'SELECT count(*) AS count FROM position_occurrences WHERE game_id = $1',
      [created.gameId],
    );
    expect(Number(occurrences.rows[0]?.count)).toBe(0);
  });

  it('is idempotent for the same PGN and rejects a different move sequence safely', async () => {
    const created = await createMetadata();
    expect((await attach(created.gameId)).statusCode).toBe(201);

    const repeated = await attach(created.gameId);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({ status: 'already_attached', gameId: created.gameId });

    const differentPgn = matchingPgn.replace(
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7',
      '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O',
    );
    const different = await attach(created.gameId, differentPgn);
    expect(different.statusCode).toBe(409);
    expect(different.json()).toMatchObject({
      error: { code: 'DIFFERENT_PGN_ALREADY_ATTACHED' },
    });

    const sources = await database.query<CountRow>(
      'SELECT count(*) AS count FROM game_source_records WHERE game_id = $1',
      [created.gameId],
    );
    expect(Number(sources.rows[0]?.count)).toBe(2);
  });
});
