import { describe, expect, it } from 'vitest';

import { applyUciMove } from './position';

describe('UCI position transition', () => {
  it('keeps legal move truth and resulting position identity in chess-core', () => {
    const result = applyUciMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4');
    expect(result).toMatchObject({ san: 'e4', uci: 'e2e4' });
    expect(result.resultingPosition).toMatchObject({ sideToMove: 'BLACK' });
  });

  it('rejects malformed or illegal engine moves', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(() => applyUciMove(fen, 'e9e4')).toThrow(/UCI notation/u);
    expect(() => applyUciMove(fen, 'e2e5')).toThrow(/not legal/u);
  });
});
