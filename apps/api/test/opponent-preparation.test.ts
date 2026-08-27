import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parsePgn } from '@chess-intelligent/chess-core';
import {
  AnalysisRepository,
  PgDatabase,
  runMigrations,
  type Database,
} from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EnginePrincipalVariation,
  OpponentOpeningProfile,
  OpponentPreparationDossier,
  PreparationPositionResult,
} from '@chess-intelligent/domain';
import { AnalysisWorker } from '../../worker/src/analysis-worker';

import { buildApp } from '../src/app';

const FIDE_ID = '12456789';

function line(pvRank: number, rootMoveUci: string, centipawns: number): EnginePrincipalVariation {
  return {
    pvRank,
    rootMoveUci,
    moves: [rootMoveUci],
    score: { kind: 'CENTIPAWN', centipawns },
    depth: 12,
    seldepth: 16,
    nodes: 4_000,
    nps: 80_000,
    timeMs: 50,
    hashfull: 4,
  };
}

class PreparationFixtureEngine implements ChessEngine {
  constructor(private readonly failAtHistoryLength: number | null = null) {}

  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'Preparation Fixture Engine',
      reportedVersion: '1',
      binarySha256: '5'.repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest) {
    if (request.position.moves.length === this.failAtHistoryLength) {
      throw new Error('deterministic failed-run fixture');
    }
    const forced = request.allowedRootMoves?.[0];
    if (forced) {
      return { bestMoveUci: forced, lines: [line(1, forced, 0)] };
    }
    const history = request.position.moves;
    if (history.length === 1 && history[0] === 'e2e4') {
      return {
        bestMoveUci: 'c7c5',
        lines: [line(1, 'c7c5', -12), line(2, 'e7e5', 18)],
      };
    }
    if (
      history.length === 3 &&
      history[0] === 'e2e4' &&
      history[1] === 'c7c5' &&
      history[2] === 'g1f3'
    ) {
      return {
        bestMoveUci: 'b7b5',
        lines: [line(1, 'b7b5', -8), line(2, 'd7d6', 32)],
      };
    }
    const white = request.position.sideToMove === 'WHITE';
    const first = white ? 'a2a3' : 'a7a6';
    const second = white ? 'b2b3' : 'b7b6';
    return { bestMoveUci: first, lines: [line(1, first, 0), line(2, second, -20)] };
  }

  async close(): Promise<void> {}
}

function opponentWhitePgn(index: number): string {
  const isE4 = index < 18;
  const isD4 = index >= 18 && index < 23;
  const recent = (isE4 && index >= 10) || index >= 23;
  const year = recent ? 2026 : 2024;
  const month = recent ? ((index % 8) + 1).toString().padStart(2, '0') : '03';
  const day = ((index % 25) + 1).toString().padStart(2, '0');
  let moves: string;
  if (isE4) {
    if (index < 14) moves = '1. e4 c5 2. Nf3 d6 3. d4 cxd4';
    else if (index < 16) moves = '1. e4 c5 2. Nc3 Nc6 3. g3 g6';
    else if (index === 16) moves = '1. e4 c5 2. c3 d5 3. exd5 Qxd5';
    else moves = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6';
  } else if (isD4) {
    moves = '1. d4 d5 2. c4 e6 3. Nc3 Nf6';
  } else {
    moves = '1. Nf3 d5 2. g3 Nf6 3. Bg2 g6';
  }
  const result = index % 3 === 0 ? '1-0' : index % 3 === 1 ? '1/2-1/2' : '0-1';
  return `[Event "Opponent White ${index}"]
[Date "${year}.${month}.${day}"]
[White "Nguyen Van A"]
[WhiteFideId "${FIDE_ID}"]
[WhiteElo "2320"]
[Black "Local Opponent ${index}"]
[BlackFideId "${31_000_000 + index}"]
[BlackElo "${2200 + index}"]
[Result "${result}"]

${moves} ${result}`;
}

function opponentBlackPgn(index: number): string {
  const e4 = index < 4;
  const moves = e4
    ? index < 3
      ? '1. e4 c5 2. Nf3 d6 3. d4 cxd4'
      : '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'
    : '1. d4 d5 2. c4 e6 3. Nc3 Nf6';
  return `[Event "Opponent Black ${index}"]
[Date "2025.0${index + 1}.10"]
[White "Black Repertoire Opponent ${index}"]
[WhiteFideId "${32_000_000 + index}"]
[WhiteElo "2280"]
[Black "Nguyen Van A"]
[BlackFideId "${FIDE_ID}"]
[BlackElo "2325"]
[Result "1/2-1/2"]

${moves} 1/2-1/2`;
}

function strongReferencePgn(index: number): string {
  const move = index < 8 ? 'd6' : index < 11 ? 'e6' : index < 21 ? 'b5' : 'd6';
  const opening =
    index === 21 ? '1. d4 d5 2. c4 e6 3. Nc3 Nf6' : `1. e4 c5 2. Nf3 ${move} 3. d4 cxd4`;
  const result = index % 2 === 0 ? '1-0' : '0-1';
  return `[Event "Strong Reference ${index}"]
[Date "2025.${((index % 12) + 1).toString().padStart(2, '0')}.20"]
[White "Strong White ${index}"]
[WhiteFideId "${41_000_000 + index}"]
[WhiteElo "${2500 + index}"]
[Black "Strong Black ${index}"]
[BlackFideId "${42_000_000 + index}"]
[BlackElo "${2520 + index}"]
[Result "${result}"]

${opening} ${result}`;
}

describe.sequential('Task 005 opponent opening intelligence', () => {
  let database: Database;
  let app: FastifyInstance;
  let opponentPlayerId: string;
  let analyzedE4GameId: string;
  let failedD4GameId: string;

  beforeAll(async () => {
    database = process.env.TEST_PREPARATION_DATABASE_URL
      ? new PgDatabase(process.env.TEST_PREPARATION_DATABASE_URL)
      : await PGliteDatabase.create();
    await runMigrations(database);
    app = await buildApp({ database, now: () => new Date('2026-08-21T08:00:00Z') });

    const importPgn = async (pgn: string): Promise<{ gameId: string; status: string }> => {
      const response = await app.inject({
        method: 'POST',
        url: '/games/import-pgn',
        payload: { pgn, sourceType: 'USER_UPLOAD' },
      });
      expect([200, 201], response.body).toContain(response.statusCode);
      const imported = response.json<{ gameId: string; status: string }>();
      await database.query(
        `UPDATE games SET game_context = 'OTB', time_category = 'CLASSICAL' WHERE id = $1`,
        [imported.gameId],
      );
      return imported;
    };

    for (let index = 0; index < 25; index += 1) {
      const imported = await importPgn(opponentWhitePgn(index));
      if (index === 0) analyzedE4GameId = imported.gameId;
      if (index === 18) failedD4GameId = imported.gameId;
    }
    const oldOpponentGame = await importPgn(`[Event "Opponent historical outside filter"]
[Date "2023.06.01"]
[White "Nguyen Van A"]
[WhiteFideId "${FIDE_ID}"]
[WhiteElo "2290"]
[Black "Historical Opponent"]
[BlackFideId "31999998"]
[BlackElo "2250"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 1/2-1/2`);
    expect(oldOpponentGame.status).toBe('created');
    const onlineOpponentGame = await importPgn(`[Event "Opponent online outside default"]
[Date "2026.05.01"]
[White "Nguyen Van A"]
[WhiteFideId "${FIDE_ID}"]
[WhiteElo "2330"]
[Black "Online Opponent"]
[BlackFideId "31999999"]
[BlackElo "2400"]
[Result "0-1"]

1. Nf3 d5 2. g3 Nf6 0-1`);
    await database.query(
      `UPDATE games SET game_context = 'ONLINE', time_category = 'BLITZ' WHERE id = $1`,
      [onlineOpponentGame.gameId],
    );
    for (let index = 0; index < 6; index += 1) {
      await importPgn(opponentBlackPgn(index));
    }
    let firstReference = '';
    for (let index = 0; index < 22; index += 1) {
      const pgn = strongReferencePgn(index);
      if (index === 0) firstReference = pgn;
      await importPgn(pgn);
    }
    const duplicate = await importPgn(firstReference);
    expect(duplicate.status).toBe('already_exists');

    await importPgn(`[Event "Unknown rating reference"]
[Date "2026.01.02"]
[White "Rated White"]
[WhiteFideId "51000001"]
[WhiteElo "2600"]
[Black "Unknown Rating Black"]
[BlackFideId "51000002"]
[Result "1-0"]

1. e4 c6 2. d4 d5 1-0`);

    for (let index = 0; index < 2; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/games/import-metadata',
        payload: {
          sourceType: 'USER_UPLOAD',
          event: `Known metadata only ${index}`,
          playedAt: `2026-07-0${index + 1}`,
          result: '*',
          gameContext: 'OTB',
          timeCategory: 'CLASSICAL',
          white: { displayName: 'Nguyen Van A', fideId: FIDE_ID, rating: 2330 },
          black: {
            displayName: `Metadata Opponent ${index}`,
            fideId: `${52_000_000 + index}`,
            rating: 2300,
          },
        },
      });
      expect(response.statusCode, response.body).toBe(201);
    }

    const resolved = await app.inject({
      method: 'GET',
      url: `/players/resolve?provider=FIDE&externalId=${FIDE_ID}`,
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    opponentPlayerId = resolved.json<{ playerId: string }>().playerId;

    const requestAnalysis = async (gameId: string): Promise<void> => {
      const response = await app.inject({
        method: 'POST',
        url: '/analysis/jobs',
        payload: { gameId, profile: 'QUICK_V1' },
      });
      expect(response.statusCode, response.body).toBe(202);
    };
    await requestAnalysis(analyzedE4GameId);
    await new AnalysisWorker(
      new AnalysisRepository(database),
      () => new PreparationFixtureEngine(),
      'task005-success-worker',
    ).runNext();
    await requestAnalysis(failedD4GameId);
    await new AnalysisWorker(
      new AnalysisRepository(database),
      () => new PreparationFixtureEngine(2),
      'task005-failed-worker',
    ).runNext();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  async function preparePosition(
    positionId: string,
    filters: Record<string, unknown> = {
      gameContexts: ['OTB'],
      timeCategories: ['CLASSICAL'],
      playedFrom: '2024-01-01',
    },
  ): Promise<PreparationPositionResult> {
    const response = await app.inject({
      method: 'POST',
      url: '/preparation/opponent/position',
      payload: {
        opponentPlayerId,
        opponentColor: 'WHITE',
        positionId,
        filters,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PreparationPositionResult>();
  }

  it('resolves the exact local FIDE identity and exposes complete opening-profile coverage', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/players/${opponentPlayerId}/opening-profile`,
    });
    expect(response.statusCode, response.body).toBe(200);
    const profile = response.json<OpponentOpeningProfile>();
    expect(profile.coverage).toMatchObject({
      gamesWithMoves: 33,
      metadataOnlyGames: 2,
      whiteGamesWithMoves: 27,
      blackGamesWithMoves: 6,
      otbGamesWithMoves: 32,
      onlineGamesWithMoves: 1,
      classicalGamesWithMoves: 32,
      blitzGamesWithMoves: 1,
    });
    expect(profile.whiteRoot.moves.map((move) => [move.san, move.games])).toEqual([
      ['e4', 19],
      ['d4', 5],
      ['Nf3', 3],
    ]);
    const againstE4 = profile.blackResponses.find((group) => group.againstMove.uci === 'e2e4');
    expect(againstE4?.behavior.moves.map((move) => [move.san, move.games])).toEqual([
      ['c5', 3],
      ['e5', 1],
    ]);
  });

  it('returns the conservative dossier, exact root frequencies, recent trends, and hotspots', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/preparation/opponent',
      payload: {
        opponentPlayerId,
        opponentColor: 'WHITE',
        filters: { playedFrom: '2024-01-01' },
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    const dossier = response.json<OpponentPreparationDossier>();
    expect(dossier.filters).toMatchObject({
      gameContexts: ['OTB'],
      timeCategories: ['CLASSICAL'],
      playedFrom: '2024-01-01',
    });
    expect(dossier.coverage).toEqual({
      canonicalGames: 27,
      gamesWithMoves: 25,
      metadataOnlyGames: 2,
    });
    expect(dossier.root.nodeType).toBe('OPPONENT_CHOICE');
    expect(dossier.root.opponentBehavior?.moves.map((move) => [move.san, move.games])).toEqual([
      ['e4', 18],
      ['d4', 5],
      ['Nf3', 2],
    ]);
    const nf3 = dossier.root.opponentBehavior?.moves.find((move) => move.uci === 'g1f3');
    expect(nf3).toMatchObject({ recentGames: 2, trend: { label: 'NEW' } });
    expect(dossier.root.opponentBehavior?.predictability).toMatchObject({ band: 'HIGH' });
    expect(dossier.hotspots[0]).toMatchObject({ reachedGames: 25 });
  });

  it('navigates opponent and preparation nodes with focal-color-correct observations', async () => {
    const dossierResponse = await app.inject({
      method: 'POST',
      url: '/preparation/opponent',
      payload: { opponentPlayerId, opponentColor: 'WHITE', filters: { playedFrom: '2024-01-01' } },
    });
    const dossier = dossierResponse.json<OpponentPreparationDossier>();
    const e4 = dossier.root.opponentBehavior?.moves.find((move) => move.uci === 'e2e4');
    expect(e4).toBeDefined();
    const afterE4 = await preparePosition(e4!.resultingPositionId);
    expect(afterE4.nodeType).toBe('PREPARATION_CHOICE');
    const c5 = afterE4.candidates.find((candidate) => candidate.move.uci === 'c7c5');
    expect(c5).toBeDefined();
    expect(c5?.opponentEvidence).toMatchObject({ gamesSeen: 17, positionGames: 18 });
    expect(c5?.engineEvidence).toMatchObject({
      status: 'AVAILABLE',
      compatibility: 'DIRECT_GAME_OCCURRENCE',
    });

    const afterC5 = await preparePosition(c5!.move.resultingPositionId);
    expect(afterC5.nodeType).toBe('OPPONENT_CHOICE');
    expect(afterC5.opponentBehavior?.moves.map((move) => [move.san, move.games])).toEqual([
      ['Nf3', 14],
      ['Nc3', 2],
      ['c3', 1],
    ]);
    const nf3 = afterC5.opponentBehavior?.moves.find((move) => move.uci === 'g1f3');
    expect(nf3?.scorePerspective).toBe('FOCAL_OPPONENT');
  });

  it('synthesizes candidates while keeping opponent, reference, and engine evidence separate', async () => {
    const analyzed = parsePgn(opponentWhitePgn(0));
    const position = analyzed.moves[2];
    expect(position).toBeDefined();
    const result = await preparePosition(position!.positionId);
    expect(result.nodeType).toBe('PREPARATION_CHOICE');
    const b5 = result.candidates.find((candidate) => candidate.move.uci === 'b7b5');
    expect(b5).toMatchObject({
      sources: ['STRONG_REFERENCE', 'COMPATIBLE_ENGINE'],
      opponentEvidence: { gamesSeen: 0, familiarityScore: 0 },
      referenceEvidence: {
        status: 'AVAILABLE',
        statistics: { games: 10, rawScore: 0.5 },
      },
      engineEvidence: {
        status: 'AVAILABLE',
        classification: 'SOUND',
        evaluation: { score: { kind: 'CENTIPAWN', centipawns: -8, perspective: 'WHITE' } },
        run: {
          profile: 'QUICK_V1',
          binarySha256: '5'.repeat(64),
          engineOptions: { Threads: 1, Hash: 32, MultiPV: 2 },
          multiPv: 2,
          detectorVersion: 'CRITICAL_DETECTOR_V1',
        },
      },
      preparationInterest: { version: 'PREPARATION_INTEREST_V1', band: 'HIGH' },
    });
    if (b5?.referenceEvidence.status !== 'AVAILABLE') {
      throw new Error('The strong reference fixture did not produce available evidence.');
    }
    expect(b5.referenceEvidence.statistics.adjustedScore).toBeCloseTo(0.5, 10);
    expect(b5.referenceEvidence.representativeGames[0]?.white.rating).toBe(2520);
    expect(JSON.stringify(result)).not.toContain('BEST_MOVE');
  });

  it('excludes unknown ratings and duplicate provenance from strong-reference counts', async () => {
    const afterE4 = parsePgn(opponentWhitePgn(0)).moves[0];
    expect(afterE4).toBeDefined();
    const result = await preparePosition(afterE4!.positionId);
    const c5 = result.candidates.find((candidate) => candidate.move.uci === 'c7c5');
    const c6 = result.candidates.find((candidate) => candidate.move.uci === 'c7c6');
    expect(c5?.referenceEvidence).toMatchObject({ statistics: { games: 21 } });
    expect(c6).toBeUndefined();
  });

  it('marks normalized-position-only engine evidence incompatible and missing evidence unknown', async () => {
    const position = parsePgn(opponentWhitePgn(0)).moves[2];
    expect(position).toBeDefined();
    const incompatible = await preparePosition(position!.positionId, {
      gameContexts: ['OTB'],
      timeCategories: ['CLASSICAL'],
      playedFrom: '2026-12-01',
    });
    expect(
      incompatible.candidates.find((candidate) => candidate.move.uci === 'b7b5')?.engineEvidence,
    ).toEqual({ status: 'INCOMPATIBLE_ENGINE_STATE' });

    const afterD4 = parsePgn(opponentWhitePgn(18)).moves[0];
    expect(afterD4).toBeDefined();
    const missing = await preparePosition(afterD4!.positionId);
    expect(missing.candidates.find((candidate) => candidate.move.uci === 'd7d5')).toMatchObject({
      engineEvidence: { status: 'NOT_AVAILABLE' },
      referenceEvidence: { status: 'INSUFFICIENT_SAMPLE', statistics: { games: 1 } },
    });
    const failedRuns = await database.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM analysis_runs WHERE game_id = $1 AND status = 'FAILED'`,
      [failedD4GameId],
    );
    expect(Number(failedRuns.rows[0]?.count)).toBe(1);
  });

  it('keeps Black repertoire separate and uses Black as the focal score perspective', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/preparation/opponent',
      payload: { opponentPlayerId, opponentColor: 'BLACK' },
    });
    expect(response.statusCode, response.body).toBe(200);
    const dossier = response.json<OpponentPreparationDossier>();
    expect(dossier.coverage.gamesWithMoves).toBe(6);
    expect(dossier.root.nodeType).toBe('PREPARATION_CHOICE');
    const e4 = dossier.root.candidates.find((candidate) => candidate.move.uci === 'e2e4');
    expect(e4?.opponentEvidence.gamesSeen).toBe(4);
    const afterE4 = await app.inject({
      method: 'POST',
      url: '/preparation/opponent/position',
      payload: {
        opponentPlayerId,
        opponentColor: 'BLACK',
        positionId: e4?.move.resultingPositionId,
      },
    });
    expect(afterE4.statusCode, afterE4.body).toBe(200);
    const behavior = afterE4.json<PreparationPositionResult>().opponentBehavior;
    expect(behavior?.moves.map((move) => [move.san, move.games])).toEqual([
      ['c5', 3],
      ['e5', 1],
    ]);
    expect(behavior?.moves[0]?.scorePerspective).toBe('FOCAL_OPPONENT');
  });

  it('returns an explicit local-corpus error and makes no provider request', async () => {
    const unresolved = await app.inject({
      method: 'GET',
      url: '/players/resolve?provider=FIDE&externalId=99999999',
    });
    expect(unresolved.statusCode).toBe(404);
    expect(unresolved.json()).toMatchObject({ error: { code: 'IDENTITY_NOT_FOUND' } });
  });
});
