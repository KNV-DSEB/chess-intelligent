import { Chess } from 'chess.js';

import type { GamePhase } from '@chess-intelligent/domain';

export const GAME_PHASE_VERSION = 'GAME_PHASE_V1';

const MATERIAL_VALUE: Readonly<Record<string, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/**
 * V1 is a deterministic heuristic over the exact pre-move state. Endgame material takes
 * priority. Opening additionally requires both high material and an early ply, so move number
 * alone can never classify a position.
 */
export function classifyGamePhase(fen: string, occurrencePly: number): GamePhase {
  const chess = new Chess(fen);
  const pieces = chess.board().flatMap((rank) => rank.filter((piece) => piece !== null));
  const queens = pieces.filter((piece) => piece.type === 'q').length;
  const nonPawnNonKingPieces = pieces.filter(
    (piece) => piece.type !== 'p' && piece.type !== 'k',
  ).length;
  const nonPawnMaterial = pieces.reduce(
    (total, piece) =>
      piece.type === 'p' || piece.type === 'k' ? total : total + MATERIAL_VALUE[piece.type]!,
    0,
  );

  if ((queens === 0 && nonPawnNonKingPieces <= 8) || nonPawnMaterial <= 20) {
    return 'ENDGAME';
  }
  if (occurrencePly < 20 && queens === 2 && nonPawnNonKingPieces >= 12) {
    return 'OPENING';
  }
  return 'MIDDLEGAME';
}
