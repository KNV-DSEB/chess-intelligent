import { describe, expect, it } from 'vitest';

import { classifyGamePhase, GAME_PHASE_VERSION } from './game-phase';

describe('GAME_PHASE_V1', () => {
  it('uses exact material state together with ply for opening and middlegame', () => {
    const initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(GAME_PHASE_VERSION).toBe('GAME_PHASE_V1');
    expect(classifyGamePhase(initial, 0)).toBe('OPENING');
    expect(classifyGamePhase(initial, 20)).toBe('MIDDLEGAME');
  });

  it('gives low-material endgames priority over move number', () => {
    const kingAndPawn = '8/8/8/8/8/4k3/4P3/4K3 w - - 0 1';
    expect(classifyGamePhase(kingAndPawn, 4)).toBe('ENDGAME');
  });

  it('classifies a developed, materially rich later state as middlegame', () => {
    const middlegame = 'r2q1rk1/ppp1bppp/2npbn2/8/2BPP3/2N2N2/PPP2PPP/R1BQ1RK1 w - - 2 10';
    expect(classifyGamePhase(middlegame, 24)).toBe('MIDDLEGAME');
  });
});
