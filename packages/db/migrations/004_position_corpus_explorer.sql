ALTER TABLE positions
  ADD COLUMN representative_fen TEXT;

UPDATE positions p
SET representative_fen = source.fen_after
FROM (
  SELECT DISTINCT ON (position_id) position_id, fen_after
  FROM moves
  ORDER BY position_id, game_id, ply
) source
WHERE source.position_id = p.id;

WITH normalized_initial_positions AS (
  SELECT
    initial_fen,
    split_part(initial_fen, ' ', 1) || ' ' ||
      split_part(initial_fen, ' ', 2) || ' ' ||
      split_part(initial_fen, ' ', 3) || ' ' ||
      lower(split_part(initial_fen, ' ', 4)) AS normalized_fen_key
  FROM games
  WHERE initial_fen IS NOT NULL
),
initial_positions AS (
  SELECT DISTINCT ON (normalized_fen_key) initial_fen, normalized_fen_key
  FROM normalized_initial_positions
  ORDER BY normalized_fen_key, initial_fen
)
INSERT INTO positions (id, normalized_fen_key, side_to_move, representative_fen)
SELECT
  encode(sha256(convert_to('position:v1:' || normalized_fen_key, 'UTF8')), 'hex'),
  normalized_fen_key,
  CASE split_part(initial_fen, ' ', 2) WHEN 'w' THEN 'WHITE' ELSE 'BLACK' END,
  initial_fen
FROM initial_positions
ON CONFLICT (id) DO UPDATE
SET representative_fen = COALESCE(positions.representative_fen, EXCLUDED.representative_fen);

UPDATE positions
SET representative_fen = normalized_fen_key || ' 0 1'
WHERE representative_fen IS NULL;

ALTER TABLE positions
  ALTER COLUMN representative_fen SET NOT NULL;

CREATE TABLE position_occurrences (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply INTEGER NOT NULL CHECK (ply >= 0),
  position_id CHAR(64) NOT NULL REFERENCES positions(id),
  next_move_id UUID NOT NULL UNIQUE REFERENCES moves(id) ON DELETE CASCADE,
  resulting_position_id CHAR(64) NOT NULL REFERENCES positions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, ply)
);

WITH initial_positions AS (
  SELECT
    id AS game_id,
    encode(
      sha256(
        convert_to(
          'position:v1:' ||
            split_part(initial_fen, ' ', 1) || ' ' ||
            split_part(initial_fen, ' ', 2) || ' ' ||
            split_part(initial_fen, ' ', 3) || ' ' ||
            lower(split_part(initial_fen, ' ', 4)),
          'UTF8'
        )
      ),
      'hex'
    ) AS position_id
  FROM games
  WHERE initial_fen IS NOT NULL
)
INSERT INTO position_occurrences (
  game_id, ply, position_id, next_move_id, resulting_position_id
)
SELECT
  move.game_id,
  move.ply - 1,
  CASE WHEN move.ply = 1 THEN initial.position_id ELSE previous.position_id END,
  move.id,
  move.position_id
FROM moves move
LEFT JOIN moves previous
  ON previous.game_id = move.game_id AND previous.ply = move.ply - 1
LEFT JOIN initial_positions initial
  ON initial.game_id = move.game_id
WHERE (move.ply = 1 AND initial.position_id IS NOT NULL)
   OR (move.ply > 1 AND previous.position_id IS NOT NULL);

CREATE INDEX position_occurrences_position_game_idx
  ON position_occurrences (position_id, game_id, ply);
CREATE INDEX position_occurrences_resulting_position_idx
  ON position_occurrences (resulting_position_id);
CREATE INDEX games_corpus_explorer_filter_idx
  ON games (content_status, game_context, time_category, played_at);

-- Each row represents the earliest analytical primitive: a canonical game at a normalized
-- pre-move position and the move that followed. Query-time DISTINCT ON (game_id) prevents a game
-- that repeats a position from being counted more than once for that position.
