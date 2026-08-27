-- Task 006 remains a live read model. These indexes make the immutable-run selection and focal
-- decision joins deterministic without introducing a mutable dossier snapshot.
CREATE INDEX analysis_runs_dossier_selection_idx
  ON analysis_runs (game_id, profile, profile_version, completed_at DESC, id DESC)
  WHERE status = 'SUCCEEDED';

CREATE INDEX move_engine_assessments_run_mover_ply_idx
  ON move_engine_assessments (analysis_run_id, mover, occurrence_ply);

CREATE INDEX game_players_dossier_player_game_idx
  ON game_players (player_id, game_id, color, rating);
