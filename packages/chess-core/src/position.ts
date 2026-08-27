import { Chess } from 'chess.js';

import type { Color } from '@chess-intelligent/domain';

import { PositionFenError } from './errors';
import { normalizedPositionKey, positionIdentity } from './hash';

export interface NormalizedChessPosition {
  id: string;
  fen: string;
  normalizedFenKey: string;
  sideToMove: Color;
}

export interface AppliedUciMove {
  san: string;
  uci: string;
  resultingPosition: NormalizedChessPosition;
}

export function normalizePositionFen(fen: string): NormalizedChessPosition {
  const input = fen.trim();
  if (!input) {
    throw new PositionFenError('FEN must not be empty.');
  }

  let chess: Chess;
  try {
    chess = new Chess(input);
  } catch (error) {
    throw new PositionFenError(
      `The FEN does not describe a valid chess position: ${error instanceof Error ? error.message : 'unknown validation failure'}`,
      { cause: error },
    );
  }

  const canonicalFen = chess.fen();
  const normalizedFenKey = normalizedPositionKey(canonicalFen);
  return {
    id: positionIdentity(canonicalFen),
    fen: canonicalFen,
    normalizedFenKey,
    sideToMove: chess.turn() === 'w' ? 'WHITE' : 'BLACK',
  };
}

export function applyUciMove(fen: string, uci: string): AppliedUciMove {
  const normalized = normalizePositionFen(fen);
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/u.exec(uci);
  if (!match) {
    throw new PositionFenError(`The engine move is not valid UCI notation: ${uci}`);
  }
  const chess = new Chess(normalized.fen);
  let move;
  try {
    move = chess.move(
      match[3]
        ? { from: match[1]!, to: match[2]!, promotion: match[3] }
        : { from: match[1]!, to: match[2]! },
    );
  } catch (error) {
    throw new PositionFenError(`The engine move ${uci} is not legal in the supplied position.`, {
      cause: error,
    });
  }
  if (!move) {
    throw new PositionFenError(`The engine move ${uci} is not legal in the supplied position.`);
  }
  return {
    san: move.san,
    uci,
    resultingPosition: normalizePositionFen(chess.fen()),
  };
}
