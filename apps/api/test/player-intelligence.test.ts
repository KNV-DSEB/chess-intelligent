import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AnalysisRepository,
  PgDatabase,
  type Database,
  runMigrations,
} from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EnginePrincipalVariation,
  EngineScore,
  OpponentPreparationDossier,
  PlayerIntelligenceDossier,
} from '@chess-intelligent/domain';
import { AnalysisWorker } from '../../worker/src/analysis-worker';

import { buildApp } from '../src/app';

const FIDE_ID = '13579135';

interface EngineScenario {
  bestWhiteCentipawns: number;
  focalColor: 'WHITE' | 'BLACK';
  focalLoss: number;
  mateAtFirstFocal?: boolean;
  revision: string;
}

function line(pvRank: number, rootMoveUci: string, score: EngineScore): EnginePrincipalVariation {
  return {
    pvRank,
    rootMoveUci,
    moves: [rootMoveUci],
    score,
    depth: 11,
    seldepth: 15,
    nodes: 3_000,
    nps: 60_000,
    timeMs: 40,
    hashfull: 3,
  };
}

class DossierFixtureEngine implements ChessEngine {
  constructor(private readonly scenario: EngineScenario) {}

  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: `Dossier Fixture Engine ${this.scenario.revision}`,
      reportedVersion: this.scenario.revision,
      binarySha256: this.scenario.revision.padEnd(64, '6').slice(0, 64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest) {
    const forced = request.allowedRootMoves?.[0];
    const isFocalMove = request.position.sideToMove === this.scenario.focalColor;
    const firstFocalPly = this.scenario.focalColor === 'WHITE' ? 0 : 1;
    const mate =
      this.scenario.mateAtFirstFocal &&
      isFocalMove &&
      request.position.moves.length === firstFocalPly;
    const bestScore: EngineScore = mate
      ? { kind: 'MATE', mateIn: this.scenario.focalColor === 'WHITE' ? 4 : -4 }
      : { kind: 'CENTIPAWN', centipawns: this.scenario.bestWhiteCentipawns };
    if (forced) {
      const playedScore: EngineScore = mate
        ? { kind: 'CENTIPAWN', centipawns: 0 }
        : {
            kind: 'CENTIPAWN',
            centipawns:
              this.scenario.bestWhiteCentipawns +
              (isFocalMove
                ? this.scenario.focalColor === 'WHITE'
                  ? -this.scenario.focalLoss
                  : this.scenario.focalLoss
                : 0),
          };
      return { bestMoveUci: forced, lines: [line(1, forced, playedScore)] };
    }
    const first = request.position.sideToMove === 'WHITE' ? 'a2a3' : 'a7a6';
    const second = request.position.sideToMove === 'WHITE' ? 'b2b3' : 'b7b6';
    const secondScore: EngineScore =
      bestScore.kind === 'MATE'
        ? { kind: 'CENTIPAWN', centipawns: 0 }
        : {
            kind: 'CENTIPAWN',
            centipawns:
              bestScore.centipawns + (request.position.sideToMove === 'WHITE' ? -140 : 140),
          };
    return {
      bestMoveUci: first,
      lines: [line(1, first, bestScore), line(2, second, secondScore)],
    };
  }

  async close(): Promise<void> {}
}

const fixtures = [
  {
    event: 'White conversion win',
    date: '2024.01.10',
    color: 'WHITE' as const,
    opponentRating: 1750,
    result: '1-0',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4',
    engine: {
      bestWhiteCentipawns: 200,
      focalColor: 'WHITE' as const,
      focalLoss: 220,
      revision: 'old',
    },
  },
  {
    event: 'White conversion draw',
    date: '2025.02.10',
    color: 'WHITE' as const,
    opponentRating: 1800,
    result: '1/2-1/2',
    moves: '1. d4 d5 2. c4 e6 3. Nc3 Nf6',
    engine: {
      bestWhiteCentipawns: 180,
      focalColor: 'WHITE' as const,
      focalLoss: 80,
      revision: '1',
    },
  },
  {
    event: 'White failed recovery',
    date: '2025.04.10',
    color: 'WHITE' as const,
    opponentRating: 2000,
    result: '0-1',
    moves: '1. Nf3 d5 2. g3 Nf6 3. Bg2 g6',
    engine: {
      bestWhiteCentipawns: -200,
      focalColor: 'WHITE' as const,
      focalLoss: 75,
      revision: '1',
    },
  },
  {
    event: 'White recovery draw',
    date: '2026.03.10',
    color: 'WHITE' as const,
    opponentRating: 2200,
    result: '1/2-1/2',
    moves: '1. c4 e5 2. Nc3 Nf6 3. g3 d5',
    engine: {
      bestWhiteCentipawns: -250,
      focalColor: 'WHITE' as const,
      focalLoss: 199,
      revision: '1',
    },
  },
  {
    event: 'Black conversion win',
    date: '2026.05.10',
    color: 'BLACK' as const,
    opponentRating: 2400,
    result: '0-1',
    moves: '1. e4 c6 2. d4 d5 3. Nc3 dxe4',
    engine: {
      bestWhiteCentipawns: -200,
      focalColor: 'BLACK' as const,
      focalLoss: 20,
      revision: '1',
    },
  },
  {
    event: 'Black failed recovery',
    date: '2026.07.10',
    color: 'BLACK' as const,
    opponentRating: null,
    result: '1-0',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7',
    engine: {
      bestWhiteCentipawns: 220,
      focalColor: 'BLACK' as const,
      focalLoss: 200,
      revision: '1',
    },
  },
];

function fixturePgn(index: number): string {
  const fixture = fixtures[index]!;
  const focal =
    `[${fixture.color === 'WHITE' ? 'White' : 'Black'} "Dossier Player"]\n` +
    `[${fixture.color === 'WHITE' ? 'White' : 'Black'}FideId "${FIDE_ID}"]\n` +
    `[${fixture.color === 'WHITE' ? 'White' : 'Black'}Elo "2120"]`;
  const opponentColor = fixture.color === 'WHITE' ? 'Black' : 'White';
  const opponent =
    `[${opponentColor} "Dossier Opponent ${index}"]\n` +
    `[${opponentColor}FideId "${70_000_000 + index}"]` +
    (fixture.opponentRating === null ? '' : `\n[${opponentColor}Elo "${fixture.opponentRating}"]`);
  return `[Event "${fixture.event}"]
[Date "${fixture.date}"]
${focal}
${opponent}
[Result "${fixture.result}"]

${fixture.moves} ${fixture.result}`;
}

describe.sequential('Task 006 Player Intelligence dossier', () => {
  let database: Database;
  let app: FastifyInstance;
  let playerId: string;
  const gameIds: string[] = [];

  beforeAll(async () => {
    database = process.env.TEST_PLAYER_INTELLIGENCE_DATABASE_URL
      ? new PgDatabase(process.env.TEST_PLAYER_INTELLIGENCE_DATABASE_URL)
      : await PGliteDatabase.create();
    await runMigrations(database);
    app = await buildApp({ database, now: () => new Date('2026-08-21T08:00:00Z') });

    for (let index = 0; index < fixtures.length; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/games/import-pgn',
        payload: { pgn: fixturePgn(index), sourceType: 'USER_UPLOAD' },
      });
      expect(response.statusCode, response.body).toBe(201);
      const imported = response.json<{ gameId: string }>();
      gameIds.push(imported.gameId);
      await database.query(
        `UPDATE games SET game_context = 'OTB', time_category = 'CLASSICAL' WHERE id = $1`,
        [imported.gameId],
      );
    }

    const metadata = await app.inject({
      method: 'POST',
      url: '/games/import-metadata',
      payload: {
        sourceType: 'USER_UPLOAD',
        event: 'Metadata coverage only',
        playedAt: '2026-08-01',
        result: '*',
        gameContext: 'OTB',
        timeCategory: 'CLASSICAL',
        white: { displayName: 'Dossier Player', fideId: FIDE_ID, rating: 2130 },
        black: { displayName: 'Metadata Opponent', fideId: '79999999', rating: 2300 },
      },
    });
    expect(metadata.statusCode, metadata.body).toBe(201);

    const resolved = await app.inject({
      method: 'GET',
      url: `/players/resolve?provider=FIDE&externalId=${FIDE_ID}`,
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    playerId = resolved.json<{ playerId: string }>().playerId;

    await database.query(
      `INSERT INTO game_source_records (
         id, game_id, data_source_id, permission_basis, raw_source_metadata
       ) VALUES (
         gen_random_uuid(), $1, '00000000-0000-4000-8000-000000000001',
         'Additional reviewed provenance fixture', '{}'::jsonb
       )`,
      [gameIds[0]],
    );

    const analyze = async (gameId: string, scenario: EngineScenario): Promise<string> => {
      const requested = await app.inject({
        method: 'POST',
        url: '/analysis/jobs',
        payload: { gameId, profile: 'QUICK_V1' },
      });
      expect(requested.statusCode, requested.body).toBe(202);
      await new AnalysisWorker(
        new AnalysisRepository(database),
        () => new DossierFixtureEngine(scenario),
        `task006-${scenario.revision}-${gameId}`,
      ).runNext();
      const runs = await new AnalysisRepository(database).listSuccessfulRuns(gameId);
      expect(runs.length).toBeGreaterThan(0);
      return runs[0]!.id;
    };

    const firstRun = await analyze(gameIds[0]!, fixtures[0]!.engine);
    await database.query(
      `UPDATE analysis_runs SET completed_at = '2026-08-01T00:00:00Z' WHERE id = $1`,
      [firstRun],
    );
    await analyze(gameIds[0]!, {
      bestWhiteCentipawns: 200,
      focalColor: 'WHITE',
      focalLoss: 20,
      mateAtFirstFocal: true,
      revision: 'new',
    });
    for (let index = 1; index < fixtures.length; index += 1) {
      await analyze(gameIds[index]!, fixtures[index]!.engine);
    }
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  async function dossier(): Promise<PlayerIntelligenceDossier> {
    const response = await app.inject({
      method: 'POST',
      url: '/intelligence/player-dossier',
      payload: {
        externalIdentity: { provider: 'FIDE', externalId: FIDE_ID },
        filters: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PlayerIntelligenceDossier>();
  }

  it('exposes coverage, performance denominators, rating bands, and no provenance inflation', async () => {
    const result = await dossier();
    expect(result.coverage).toMatchObject({
      canonicalGames: 7,
      gamesWithMoves: 6,
      metadataOnlyGames: 1,
      whiteGames: 5,
      blackGames: 2,
      engineEligibleGames: 6,
      compatibleAnalyzedGames: 6,
      engineCoverageRatio: 1,
    });
    expect(result.performance.overall).toMatchObject({
      games: 6,
      wins: 2,
      draws: 2,
      losses: 2,
      unresolvedResults: 1,
      score: 0.5,
    });
    expect(
      result.performance.byOpponentRatingBand.map((row) => [row.band, row.performance.games]),
    ).toEqual([
      ['UNDER_1800', 1],
      ['1800_1999', 1],
      ['2000_2199', 1],
      ['2200_2399', 1],
      ['2400_PLUS', 1],
      ['UNKNOWN', 1],
    ]);
    expect(result.evidenceQuality.meaning).toBe('EVIDENCE_COVERAGE_NOT_PLAYER_QUALITY');
  });

  it('selects only the latest compatible immutable run per canonical game', async () => {
    const result = await dossier();
    expect(result.engine.aggregation).toMatchObject({
      version: 'ENGINE_AGGREGATION_V1',
      selectedAnalyzedGames: 6,
      requestedProfile: { name: 'QUICK_V1', version: 1 },
    });
    expect(result.engine.aggregation.selectedRuns).toHaveLength(6);
    expect(
      result.engine.aggregation.selectedRuns.find((run) => run.gameId === gameIds[0])
        ?.engineReportedVersion,
    ).toBe('new');
    const storedRuns = await database.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM analysis_runs WHERE game_id = $1 AND status = 'SUCCEEDED'`,
      [gameIds[0]],
    );
    expect(Number(storedRuns.rows[0]?.count)).toBe(2);
  });

  it('keeps focal decision CPL, mate semantics, critical recurrence, and complexity separate', async () => {
    const result = await dossier();
    expect(result.engine.decisionQuality).toMatchObject({
      scorePerspective: 'FOCAL_PLAYER',
      analyzedGames: 6,
      analyzedMoves: 18,
      centipawnAssessedMoves: 17,
    });
    expect(result.engine.decisionQuality.mateAssessments.assessedMoves).toBe(1);
    expect(
      result.engine.decisionQuality.mateAssessments.outcomes.find(
        (item) => item.outcome === 'MATE_MISSED',
      )?.moves,
    ).toBe(1);
    expect(
      result.engine.criticalPatterns.playerDecisionEvents.find(
        (item) => item.reason === 'MATE_MISSED',
      )?.events,
    ).toBe(1);
    expect(result.engine.criticalPatterns.positionComplexityEvents[0]?.reason).toBe(
      'HIGH_DECISION_SENSITIVITY',
    );
    expect(result.engine.criticalPatterns.interpretation).toContain(
      'NOT_A_SKILL_OR_PSYCHOLOGY_LABEL',
    );
  });

  it('counts one conversion/recovery opportunity per game and handles Black perspective', async () => {
    const result = await dossier();
    expect(result.engine.advantageConversion).toMatchObject({
      version: 'ADVANTAGE_CONVERSION_V1',
      opportunities: 3,
      wins: 2,
      draws: 1,
      losses: 0,
      successfulOutcomes: 2,
    });
    expect(result.engine.advantageConversion.rate).toBeCloseTo(2 / 3);
    expect(result.engine.disadvantageRecovery).toMatchObject({
      version: 'DISADVANTAGE_RECOVERY_V1',
      opportunities: 3,
      wins: 0,
      draws: 1,
      losses: 2,
      successfulOutcomes: 1,
    });
    expect(result.engine.disadvantageRecovery.rate).toBeCloseTo(1 / 3);
    expect(
      new Set(result.engine.advantageConversion.evidence.map((item) => item.gameId)).size,
    ).toBe(3);
  });

  it('reuses Task 005 repertoire calculations under the same filters', async () => {
    const result = await dossier();
    const preparation = await app.inject({
      method: 'POST',
      url: '/preparation/opponent',
      payload: {
        opponentPlayerId: playerId,
        opponentColor: 'WHITE',
        filters: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(preparation.statusCode, preparation.body).toBe(200);
    const historical = preparation.json<OpponentPreparationDossier>();
    expect(result.repertoire.asWhite.behavior).toEqual(historical.root.opponentBehavior);
    expect(result.repertoire.asWhite.breadth.version).toBe('REPERTOIRE_BREADTH_V1');
  });

  it('rejects missing/fuzzy identity inputs and never broadens to a name match', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/intelligence/player-dossier',
      payload: { playerName: 'Dossier Player' },
    });
    expect(invalid.statusCode).toBe(400);
    const missing = await app.inject({
      method: 'POST',
      url: '/intelligence/player-dossier',
      payload: { externalIdentity: { provider: 'FIDE', externalId: '99999999' } },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'PLAYER_NOT_FOUND_IN_LOCAL_CORPUS' } });
  });
});
