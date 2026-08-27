import { describe, expect, it } from 'vitest';

import { parsePgn } from './parse-pgn';
import { normalizePositionFen } from './position';

describe('position identity', () => {
  it('is identical for the same position reached through a transposition', () => {
    const knightFirst = parsePgn(`
[White "Student"]
[Black "Coach"]
[Result "*"]

1. Nf3 Nf6 2. g3 g6 3. Bg2 Bg7 *
`);
    const fianchettoFirst = parsePgn(`
[White "Student"]
[Black "Coach"]
[Result "*"]

1. g3 g6 2. Bg2 Bg7 3. Nf3 Nf6 *
`);

    expect(knightFirst.moves.at(-1)?.positionId).toBe(fianchettoFirst.moves.at(-1)?.positionId);
    expect(knightFirst.moves.at(-1)?.fenAfter).not.toBe(fianchettoFirst.moves.at(-1)?.fenAfter);
  });

  it('validates FEN and derives the same initial identity used by PGN parsing', () => {
    const game = parsePgn('[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 *');
    const position = normalizePositionFen(game.initialFen);

    expect(position.id).toBe(game.initialPositionId);
    expect(position.sideToMove).toBe('WHITE');
    expect(() => normalizePositionFen('not a fen')).toThrow('valid chess position');
  });
});
