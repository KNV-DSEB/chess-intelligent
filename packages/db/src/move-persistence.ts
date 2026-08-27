import { randomUUID } from 'node:crypto';

import type { ParsedGame } from '@chess-intelligent/domain';

import type { QueryClient } from './database';

export async function insertParsedGameMoves(
  client: QueryClient,
  gameId: string,
  parsed: ParsedGame,
): Promise<void> {
  await client.query(
    `INSERT INTO positions (
       id, normalized_fen_key, side_to_move, representative_fen
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [
      parsed.initialPositionId,
      parsed.normalizedInitialPosition,
      parsed.initialSideToMove,
      parsed.initialFen,
    ],
  );

  let positionBeforeMove = parsed.initialPositionId;
  for (const move of parsed.moves) {
    await client.query(
      `INSERT INTO positions (
         id, normalized_fen_key, side_to_move, representative_fen
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [move.positionId, move.normalizedPosition, move.sideToMove, move.fenAfter],
    );

    const moveId = randomUUID();
    await client.query(
      `INSERT INTO moves (
         id, game_id, ply, san, uci, from_square, to_square, promotion, fen_after, position_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        moveId,
        gameId,
        move.ply,
        move.san,
        move.uci,
        move.from,
        move.to,
        move.promotion,
        move.fenAfter,
        move.positionId,
      ],
    );
    await client.query(
      `INSERT INTO position_occurrences (
         game_id, ply, position_id, next_move_id, resulting_position_id
       ) VALUES ($1, $2, $3, $4, $5)`,
      [gameId, move.ply - 1, positionBeforeMove, moveId, move.positionId],
    );
    positionBeforeMove = move.positionId;
  }
}
