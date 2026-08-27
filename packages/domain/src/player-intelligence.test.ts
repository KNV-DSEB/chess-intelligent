import { describe, expect, it } from 'vitest';

import type { OpponentBehavior, PlayerEngineObservation, PlayerGameFact } from './index';
import {
  calculateAdvantageConversion,
  calculateCriticalPatterns,
  calculateDecisionQuality,
  calculateDisadvantageRecovery,
  calculateEvidenceQuality,
  calculatePerformanceSummary,
  calculateRepertoireBreadth,
  classifyCentipawnLoss,
  classifyOpponentRating,
  median,
} from './player-intelligence';

const run = {
  id: '00000000-0000-4000-8000-000000000001',
  gameId: '00000000-0000-4000-8000-000000000010',
  completedAt: '2026-08-20T00:00:00.000Z',
  engineFamily: 'FAKE' as const,
  engineReportedName: 'Fixture Engine',
  engineReportedVersion: '1',
  binarySha256: 'a'.repeat(64),
  profile: 'QUICK_V1' as const,
  profileVersion: 1,
  engineOptions: {},
  searchLimit: { type: 'DEPTH' as const, value: 10 },
  multiPv: 2,
  detectorVersion: 'CRITICAL_DETECTOR_V1',
  startedAt: '2026-08-20T00:00:00.000Z',
};

function observation(overrides: Partial<PlayerEngineObservation> = {}): PlayerEngineObservation {
  return {
    run,
    gameId: run.gameId,
    focalColor: 'WHITE',
    opponentName: 'Opponent',
    opponentRating: 2100,
    event: 'Fixture',
    playedAt: '2026-08-01',
    result: '1-0',
    occurrencePly: 0,
    mover: 'WHITE',
    phase: 'OPENING',
    centipawnLoss: 0,
    mateOutcome: 'NOT_APPLICABLE',
    bestScoreWhite: { kind: 'CENTIPAWN', centipawns: 0 },
    criticalReasons: [],
    ...overrides,
  };
}

function game(overrides: Partial<PlayerGameFact> = {}): PlayerGameFact {
  return {
    gameId: crypto.randomUUID(),
    focalColor: 'WHITE',
    focalRating: 2000,
    opponentName: 'Opponent',
    opponentRating: 2100,
    event: 'Fixture',
    playedAt: '2026-08-01',
    result: '1-0',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    contentStatus: 'MOVES_AVAILABLE',
    moveCount: 60,
    castling: 'KING_SIDE',
    queenTradePly: 24,
    sourceTypes: ['USER_UPLOAD'],
    ...overrides,
  };
}

describe('player intelligence boundaries', () => {
  it('keeps rating and centipawn-loss boundaries centralized and exact', () => {
    expect(
      [1799, 1800, 1999, 2000, 2199, 2200, 2399, 2400, null].map(classifyOpponentRating),
    ).toEqual([
      'UNDER_1800',
      '1800_1999',
      '1800_1999',
      '2000_2199',
      '2000_2199',
      '2200_2399',
      '2200_2399',
      '2400_PLUS',
      'UNKNOWN',
    ]);
    expect([0, 19, 20, 74, 75, 199, 200].map(classifyCentipawnLoss)).toEqual([
      'CP_0_19',
      'CP_0_19',
      'CP_20_74',
      'CP_20_74',
      'CP_75_199',
      'CP_75_199',
      'CP_200_PLUS',
    ]);
  });

  it('calculates odd/even medians and focal Black results without reversing draws', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const summary = calculatePerformanceSummary([
      game({ focalColor: 'BLACK', result: '0-1' }),
      game({ focalColor: 'BLACK', result: '1-0' }),
      game({ focalColor: 'BLACK', result: '1/2-1/2' }),
      game({ result: '*' }),
    ]);
    expect(summary.overall).toMatchObject({
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      unresolvedResults: 1,
      score: 0.5,
    });
  });

  it('bands evidence sufficiency without treating it as player quality', () => {
    const insufficient = calculateEvidenceQuality({
      canonicalGames: 4,
      usableGames: 4,
      compatibleAnalyzedGames: 4,
      opponentRatingKnownGames: 4,
      latestKnownGame: '2026-08-01',
      asOf: new Date('2026-08-21T00:00:00Z'),
    });
    const high = calculateEvidenceQuality({
      canonicalGames: 30,
      usableGames: 30,
      compatibleAnalyzedGames: 20,
      opponentRatingKnownGames: 27,
      latestKnownGame: '2026-08-01',
      asOf: new Date('2026-08-21T00:00:00Z'),
    });
    expect(insufficient.band).toBe('INSUFFICIENT');
    expect(high).toMatchObject({
      band: 'HIGH',
      points: 6,
      meaning: 'EVIDENCE_COVERAGE_NOT_PLAYER_QUALITY',
    });
  });

  it('uses Shannon entropy and effective branch count for repertoire breadth', () => {
    const behavior: OpponentBehavior = {
      sampleGames: 4,
      recentSampleGames: 2,
      predictability: {
        version: 'REPERTOIRE_PREDICTABILITY_V1',
        sampleGames: 4,
        topMoveShare: 0.25,
        band: 'LOW',
      },
      moves: ['a', 'b', 'c', 'd'].map((uci) => ({
        san: uci,
        uci,
        games: 1,
        frequency: 0.25,
        recentGames: 0,
        recentFrequency: 0,
        whiteWins: 0,
        draws: 1,
        blackWins: 0,
        opponentScore: 0.5,
        scorePerspective: 'FOCAL_OPPONENT' as const,
        lastSeen: null,
        resultingPositionId: uci,
        resultingFen: uci,
        trend: {
          version: 'REPERTOIRE_TREND_V1',
          label: 'INSUFFICIENT_DATA' as const,
          historical: { moveGames: 1, positionGames: 4, frequency: 0.25 },
          recent: { moveGames: 0, positionGames: 0, frequency: 0 },
          frequencyDelta: null,
        },
        representativeGames: [],
      })),
    };
    const breadth = calculateRepertoireBreadth(behavior);
    expect(breadth.band).toBe('BROAD');
    expect(breadth.effectiveBranchCount).toBeCloseTo(4);
    expect(calculateRepertoireBreadth({ ...behavior, sampleGames: 2 }).band).toBe(
      'INSUFFICIENT_SAMPLE',
    );
  });
});

describe('engine-derived player metrics', () => {
  it('separates mate semantics and places every CPL boundary in the correct band', () => {
    const losses = [0, 19, 20, 74, 75, 199, 200];
    const observations = losses.map((loss, index) =>
      observation({ occurrencePly: index * 2, centipawnLoss: loss }),
    );
    observations.push(
      observation({
        occurrencePly: 20,
        centipawnLoss: null,
        mateOutcome: 'MATE_MISSED',
        bestScoreWhite: { kind: 'MATE', mateIn: 4 },
      }),
    );
    const result = calculateDecisionQuality(observations);
    expect(result.centipawnLossBands.map((band) => band.moves)).toEqual([2, 2, 2, 1]);
    expect(result.centipawnAssessedMoves).toBe(7);
    expect(result.mateAssessments).toMatchObject({ assessedMoves: 1 });
    expect(result.medianCentipawnLoss).toBe(74);
  });

  it('counts at most one conversion and recovery opportunity per game with focal perspective', () => {
    const whiteAdvantage = [
      observation({ occurrencePly: 0, bestScoreWhite: { kind: 'CENTIPAWN', centipawns: 160 } }),
      observation({
        occurrencePly: 1,
        mover: 'BLACK',
        bestScoreWhite: { kind: 'CENTIPAWN', centipawns: 300 },
      }),
    ];
    const blackRecovery = [
      observation({
        run: {
          ...run,
          id: '00000000-0000-4000-8000-000000000002',
          gameId: '00000000-0000-4000-8000-000000000020',
        },
        gameId: '00000000-0000-4000-8000-000000000020',
        focalColor: 'BLACK',
        mover: 'WHITE',
        result: '1/2-1/2',
        bestScoreWhite: { kind: 'CENTIPAWN', centipawns: 180 },
      }),
      observation({
        run: {
          ...run,
          id: '00000000-0000-4000-8000-000000000002',
          gameId: '00000000-0000-4000-8000-000000000020',
        },
        gameId: '00000000-0000-4000-8000-000000000020',
        focalColor: 'BLACK',
        mover: 'BLACK',
        occurrencePly: 1,
        result: '1/2-1/2',
        bestScoreWhite: { kind: 'MATE', mateIn: 5 },
      }),
    ];
    const conversion = calculateAdvantageConversion([...whiteAdvantage, ...blackRecovery]);
    const recovery = calculateDisadvantageRecovery([...whiteAdvantage, ...blackRecovery]);
    expect(conversion).toMatchObject({ opportunities: 1, successfulOutcomes: 1, rate: 1 });
    expect(recovery).toMatchObject({ opportunities: 1, successfulOutcomes: 1, rate: 1 });
    expect(conversion.evidence[0]?.firstOpportunityPly).toBe(0);
    expect(recovery.evidence[0]?.scoreAtOpportunity).toMatchObject({
      kind: 'CENTIPAWN',
      centipawns: -180,
    });
  });

  it('keeps high decision sensitivity separate from focal decision events', () => {
    const patterns = calculateCriticalPatterns(
      [
        observation({ criticalReasons: ['EVAL_LOSS', 'HIGH_DECISION_SENSITIVITY'] }),
        observation({ occurrencePly: 1, mover: 'BLACK', criticalReasons: ['SEVERE_EVAL_LOSS'] }),
      ],
      new Date('2026-08-21T00:00:00Z'),
    );
    expect(
      patterns.playerDecisionEvents.find((event) => event.reason === 'EVAL_LOSS')?.events,
    ).toBe(1);
    expect(
      patterns.playerDecisionEvents.find((event) => event.reason === 'SEVERE_EVAL_LOSS')?.events,
    ).toBe(0);
    expect(patterns.positionComplexityEvents[0]?.events).toBe(1);
  });
});
