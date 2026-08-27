import { describe, expect, it } from 'vitest';

import {
  calculateCentipawnLoss,
  classifyMateOutcome,
  CriticalPositionDetector,
  normalizeScoreToWhitePerspective,
  type EngineScore,
} from './engine-analysis';

const cp = (centipawns: number): EngineScore => ({ kind: 'CENTIPAWN', centipawns });
const mate = (mateIn: number): EngineScore => ({ kind: 'MATE', mateIn });

describe('engine score semantics', () => {
  it('normalizes side-to-move scores to the White perspective', () => {
    expect(normalizeScoreToWhitePerspective(cp(42), 'WHITE')).toEqual(cp(42));
    expect(normalizeScoreToWhitePerspective(cp(42), 'BLACK')).toEqual(cp(-42));
    expect(normalizeScoreToWhitePerspective(mate(3), 'BLACK')).toEqual(mate(-3));
  });

  it('calculates mover-centric loss for White and Black and clamps search variance', () => {
    expect(calculateCentipawnLoss(cp(120), cp(30), 'WHITE')).toBe(90);
    expect(calculateCentipawnLoss(cp(-100), cp(-20), 'BLACK')).toBe(80);
    expect(calculateCentipawnLoss(cp(30), cp(31), 'WHITE')).toBe(0);
  });

  it('keeps mate preserved, missed, and allowed structurally distinct from centipawns', () => {
    expect(classifyMateOutcome(mate(4), mate(7), 'WHITE')).toBe('MATE_PRESERVED');
    expect(classifyMateOutcome(mate(4), cp(500), 'WHITE')).toBe('MATE_MISSED');
    expect(classifyMateOutcome(cp(0), mate(-3), 'WHITE')).toBe('MATE_ALLOWED');
    expect(calculateCentipawnLoss(mate(4), cp(500), 'WHITE')).toBeNull();
  });
});

describe('CriticalPositionDetector', () => {
  const detector = new CriticalPositionDetector();

  it('uses inclusive, deterministic evaluation-loss boundaries', () => {
    expect(
      detector.detect({
        mover: 'WHITE',
        bestScore: cp(90),
        playedScore: cp(16),
        multiPvScores: [],
      }),
    ).toBeNull();
    expect(
      detector.detect({ mover: 'WHITE', bestScore: cp(90), playedScore: cp(15), multiPvScores: [] })
        ?.reasons,
    ).toContain('EVAL_LOSS');
  });

  it('detects severe loss, dropped advantage, and takes the highest severity', () => {
    const result = detector.detect({
      mover: 'WHITE',
      bestScore: cp(250),
      playedScore: cp(20),
      multiPvScores: [],
    });
    expect(result).toMatchObject({
      severity: 'HIGH',
      reasons: ['EVAL_LOSS', 'SEVERE_EVAL_LOSS', 'ADVANTAGE_DROPPED'],
      centipawnLoss: 230,
    });
  });

  it('detects decision sensitivity independently of the played move', () => {
    const result = detector.detect({
      mover: 'BLACK',
      bestScore: cp(-80),
      playedScore: cp(-80),
      multiPvScores: [cp(-80), cp(50)],
    });
    expect(result?.reasons).toEqual(['HIGH_DECISION_SENSITIVITY']);
  });

  it('emits mate reasons with critical severity', () => {
    expect(
      detector.detect({
        mover: 'WHITE',
        bestScore: mate(3),
        playedScore: cp(400),
        multiPvScores: [],
      }),
    ).toMatchObject({ reasons: ['MATE_MISSED'], severity: 'CRITICAL', centipawnLoss: null });
    expect(
      detector.detect({
        mover: 'BLACK',
        bestScore: cp(-10),
        playedScore: mate(2),
        multiPvScores: [],
      }),
    ).toMatchObject({ reasons: ['MATE_ALLOWED'], severity: 'CRITICAL', centipawnLoss: null });
  });
});
