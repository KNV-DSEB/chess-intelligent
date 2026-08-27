import { describe, expect, it } from 'vitest';

import {
  calculateOpponentFamiliarity,
  calculatePredictability,
  calculatePreparationInterest,
  calculateRecentRepertoireWindow,
  calculateReferenceStatistics,
  classifyEngineSoundness,
  classifyRepertoireTrend,
} from './preparation';

describe('opponent preparation V1 domain rules', () => {
  it('centralizes the rolling recent window including month-end clamping', () => {
    expect(calculateRecentRepertoireWindow(new Date('2026-08-21T16:00:00Z'))).toEqual({
      months: 12,
      from: '2025-08-21',
      through: '2026-08-21',
    });
    expect(calculateRecentRepertoireWindow(new Date('2024-02-29T00:00:00Z')).from).toBe(
      '2023-02-28',
    );
  });

  it('classifies recent adoption, dormant lines, deltas, and tiny samples deterministically', () => {
    expect(
      classifyRepertoireTrend({
        historicalMoveGames: 0,
        historicalPositionGames: 12,
        recentMoveGames: 2,
        recentPositionGames: 4,
      }).label,
    ).toBe('NEW');
    expect(
      classifyRepertoireTrend({
        historicalMoveGames: 3,
        historicalPositionGames: 8,
        recentMoveGames: 0,
        recentPositionGames: 4,
      }).label,
    ).toBe('DORMANT');
    expect(
      classifyRepertoireTrend({
        historicalMoveGames: 2,
        historicalPositionGames: 10,
        recentMoveGames: 3,
        recentPositionGames: 5,
      }).label,
    ).toBe('INCREASING');
    expect(
      classifyRepertoireTrend({
        historicalMoveGames: 1,
        historicalPositionGames: 10,
        recentMoveGames: 1,
        recentPositionGames: 2,
      }).label,
    ).toBe('INSUFFICIENT_DATA');
  });

  it('retains raw familiarity inputs and represents never-seen exposure explicitly', () => {
    const familiar = calculateOpponentFamiliarity({
      gamesSeen: 2,
      positionGames: 10,
      recentGamesSeen: 1,
      recentPositionGames: 4,
      lastSeen: '2026-05-01',
      whiteWins: 1,
      draws: 1,
      blackWins: 0,
      opponentWins: 1,
    });
    expect(familiar).toMatchObject({ gamesSeen: 2, frequency: 0.2, opponentScore: 0.75 });
    expect(familiar.familiarityScore).toBeCloseTo(0.2425, 10);

    const unseen = calculateOpponentFamiliarity({
      gamesSeen: 0,
      positionGames: 10,
      recentGamesSeen: 0,
      recentPositionGames: 4,
      lastSeen: null,
      whiteWins: 0,
      draws: 0,
      blackWins: 0,
      opponentWins: 0,
    });
    expect(unseen).toMatchObject({ gamesSeen: 0, familiarityScore: 0, opponentScore: null });
  });

  it('uses transparent concentration bands', () => {
    expect(calculatePredictability(10, 7)).toMatchObject({ topMoveShare: 0.7, band: 'HIGH' });
    expect(calculatePredictability(9, 3).band).toBe('LOW');
    expect(calculatePredictability(2, 2).band).toBe('INSUFFICIENT_SAMPLE');
  });

  it('shrinks small reference samples while preserving raw results', () => {
    const small = calculateReferenceStatistics({
      games: 3,
      wins: 3,
      draws: 0,
      losses: 0,
      whiteWins: 3,
      blackWins: 0,
    });
    const large = calculateReferenceStatistics({
      games: 500,
      wins: 250,
      draws: 100,
      losses: 150,
      whiteWins: 250,
      blackWins: 150,
    });
    expect(small).toMatchObject({ rawScore: 1, adjustedScore: 5 / 7 });
    expect(large.adjustedScore).toBeCloseTo(302 / 504, 10);
  });

  it('classifies centipawn and mate scores from either preparation color', () => {
    expect(classifyEngineSoundness({ kind: 'CENTIPAWN', centipawns: -40 }, 'WHITE')).toBe('SOUND');
    expect(classifyEngineSoundness({ kind: 'CENTIPAWN', centipawns: 120 }, 'BLACK')).toBe(
      'PLAYABLE',
    );
    expect(classifyEngineSoundness({ kind: 'MATE', mateIn: -4 }, 'BLACK')).toBe('SOUND');
    expect(classifyEngineSoundness({ kind: 'MATE', mateIn: 3 }, 'BLACK')).toBe('ENGINE_DISFAVORED');
  });

  it('keeps interest components visible and applies deterministic ordinal bands', () => {
    expect(
      calculatePreparationInterest({
        familiarityScore: 0.1,
        referenceGames: 12,
        engineSoundness: 'SOUND',
      }),
    ).toMatchObject({
      band: 'HIGH',
      points: 6,
      components: { opponentUnfamiliarity: 2, referenceSupport: 2, engineSoundness: 2 },
    });
    expect(
      calculatePreparationInterest({
        familiarityScore: 0.1,
        referenceGames: null,
        engineSoundness: null,
      }).band,
    ).toBe('MEDIUM');
  });
});
