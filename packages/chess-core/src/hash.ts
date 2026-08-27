import { createHash } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeCastling(value: string): string {
  if (value === '-') {
    return value;
  }

  const order = ['K', 'Q', 'k', 'q'];
  const unique = new Set(value.split(''));
  const normalized = order.filter((symbol) => unique.has(symbol)).join('');
  return normalized || '-';
}

/**
 * The first four FEN fields describe repetition-relevant chess state. Move clocks are deliberately
 * excluded so transpositions can share an identity without losing each move's full FEN.
 */
export function normalizedPositionKey(fen: string): string {
  const fields = fen.trim().split(/\s+/u);
  const board = fields[0];
  const activeColor = fields[1];
  const castling = fields[2];
  const enPassant = fields[3];

  if (!board || !activeColor || !castling || !enPassant || !['w', 'b'].includes(activeColor)) {
    throw new Error(`Cannot normalize invalid FEN: ${fen}`);
  }

  return `${board} ${activeColor} ${normalizeCastling(castling)} ${enPassant.toLowerCase()}`;
}

export function positionIdentity(fen: string): string {
  return sha256(`position:v1:${normalizedPositionKey(fen)}`);
}
