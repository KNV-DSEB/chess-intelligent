-- Task 005 reports are computed from canonical games and immutable analysis evidence. These indexes
-- support the exact-player/color corpus, early repertoire traversal, and compatible engine lookup;
-- no duplicate opening database or mutable preparation snapshot is introduced in V1.
CREATE INDEX game_players_player_color_game_idx
  ON game_players (player_id, color, game_id);

CREATE INDEX position_occurrences_game_position_ply_idx
  ON position_occurrences (game_id, position_id, ply);

CREATE INDEX engine_position_states_compatible_occurrence_idx
  ON engine_position_states (normalized_position_id, game_id, occurrence_ply, analysis_run_id);

CREATE INDEX engine_evaluations_candidate_root_idx
  ON engine_evaluations (engine_position_state_id, root_move_uci, pv_rank)
  WHERE role = 'MULTIPV';
