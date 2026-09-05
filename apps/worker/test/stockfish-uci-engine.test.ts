import { describe, expect, it } from 'vitest';

import { ANALYSIS_PROFILE_CONFIGURATIONS } from '@chess-intelligent/domain';

import {
  StockfishUciEngine,
  buildUciGoCommand,
  buildUciPositionCommand,
  parseUciInfoLine,
} from '../src/stockfish-uci-engine';

describe('Stockfish UCI adapter', () => {
  it('builds exact-history position commands for standard and custom roots', () => {
    expect(
      buildUciPositionCommand('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [
        'g1f3',
        'g8f6',
        'f3g1',
        'f6g8',
      ]),
    ).toBe('position startpos moves g1f3 g8f6 f3g1 f6g8');
    expect(buildUciPositionCommand('8/8/8/8/8/8/K6k/8 w - - 0 1', [])).toBe(
      'position fen 8/8/8/8/8/8/K6k/8 w - - 0 1',
    );
  });

  it('places the search budget before forced root moves in the UCI go command', () => {
    expect(
      buildUciGoCommand({
        position: {
          initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          moves: [],
          sideToMove: 'WHITE',
        },
        configuration: ANALYSIS_PROFILE_CONFIGURATIONS.QUICK_V1.engine,
        allowedRootMoves: ['e2e4'],
      }),
    ).toBe('go depth 10 searchmoves e2e4');
  });

  it('parses metrics and normalizes Black-to-move UCI scores to White perspective', () => {
    expect(
      parseUciInfoLine(
        'info depth 10 seldepth 13 multipv 2 score cp 42 nodes 1000 nps 50000 hashfull 3 time 20 pv e7e5 g1f3',
        'BLACK',
      ),
    ).toMatchObject({
      pvRank: 2,
      rootMoveUci: 'e7e5',
      score: { kind: 'CENTIPAWN', centipawns: -42 },
      depth: 10,
      nodes: 1000,
    });
  });

  it.skipIf(!process.env.STOCKFISH_PATH)(
    'performs an opt-in real Stockfish handshake and forced-root search',
    async () => {
      const engine = new StockfishUciEngine(process.env.STOCKFISH_PATH!);
      try {
        const identity = await engine.identify();
        expect(identity).toMatchObject({
          family: 'STOCKFISH',
          binarySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        });
        const profile = ANALYSIS_PROFILE_CONFIGURATIONS.QUICK_V1;
        await engine.newGame(profile.engine);
        const result = await engine.analyze({
          position: {
            initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            moves: [],
            sideToMove: 'WHITE',
          },
          configuration: profile.engine,
          allowedRootMoves: ['e2e4'],
        });
        expect(result.lines[0]?.rootMoveUci).toBe('e2e4');
      } finally {
        await engine.close();
      }
    },
  );
});
