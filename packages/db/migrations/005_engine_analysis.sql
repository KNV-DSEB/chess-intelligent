CREATE TABLE analysis_jobs (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  profile TEXT NOT NULL CHECK (profile IN ('QUICK_V1')),
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  configuration_sha256 CHAR(64) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  maximum_attempts INTEGER NOT NULL DEFAULT 2 CHECK (maximum_attempts BETWEEN 1 AND 5),
  claimed_by TEXT,
  requested_reanalysis BOOLEAN NOT NULL DEFAULT FALSE,
  total_occurrences INTEGER NOT NULL CHECK (total_occurrences > 0),
  processed_occurrences INTEGER NOT NULL DEFAULT 0 CHECK (processed_occurrences >= 0),
  successful_run_id UUID,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX analysis_jobs_one_active_configuration_idx
  ON analysis_jobs (game_id, profile, profile_version, configuration_sha256)
  WHERE status IN ('PENDING', 'RUNNING');
CREATE INDEX analysis_jobs_claim_idx ON analysis_jobs (status, created_at, id);
CREATE INDEX analysis_jobs_game_idx ON analysis_jobs (game_id, created_at DESC);

CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  engine_family TEXT NOT NULL CHECK (engine_family IN ('STOCKFISH', 'FAKE')),
  engine_reported_name TEXT NOT NULL,
  engine_reported_version TEXT,
  binary_sha256 CHAR(64) NOT NULL,
  profile TEXT NOT NULL CHECK (profile IN ('QUICK_V1')),
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  engine_options JSONB NOT NULL,
  search_limit_type TEXT NOT NULL CHECK (search_limit_type IN ('DEPTH', 'NODES', 'MOVETIME')),
  search_limit_value BIGINT NOT NULL CHECK (search_limit_value > 0),
  multipv INTEGER NOT NULL CHECK (multipv > 0),
  detector_version TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  UNIQUE (job_id, attempt_number)
);

ALTER TABLE analysis_jobs
  ADD CONSTRAINT analysis_jobs_successful_run_id_fkey
  FOREIGN KEY (successful_run_id) REFERENCES analysis_runs(id);

CREATE INDEX analysis_runs_game_completed_idx
  ON analysis_runs (game_id, completed_at DESC)
  WHERE status = 'SUCCEEDED';

CREATE TABLE engine_position_states (
  id UUID PRIMARY KEY,
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  game_id UUID NOT NULL,
  occurrence_ply INTEGER NOT NULL CHECK (occurrence_ply >= 0),
  normalized_position_id CHAR(64) NOT NULL REFERENCES positions(id),
  initial_fen TEXT NOT NULL,
  history_uci JSONB NOT NULL CHECK (jsonb_typeof(history_uci) = 'array'),
  history_sha256 CHAR(64) NOT NULL,
  side_to_move TEXT NOT NULL CHECK (side_to_move IN ('WHITE', 'BLACK')),
  FOREIGN KEY (game_id, occurrence_ply)
    REFERENCES position_occurrences(game_id, ply) ON DELETE CASCADE,
  UNIQUE (analysis_run_id, game_id, occurrence_ply)
);

CREATE INDEX engine_position_states_normalized_position_idx
  ON engine_position_states (normalized_position_id);
CREATE INDEX engine_position_states_exact_history_idx
  ON engine_position_states (history_sha256, analysis_run_id);

CREATE TABLE engine_evaluations (
  id UUID PRIMARY KEY,
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  engine_position_state_id UUID NOT NULL REFERENCES engine_position_states(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('MULTIPV', 'PLAYED_MOVE')),
  pv_rank INTEGER CHECK (pv_rank IS NULL OR pv_rank > 0),
  score_kind TEXT NOT NULL CHECK (score_kind IN ('CENTIPAWN', 'MATE')),
  centipawns INTEGER,
  mate_in INTEGER,
  score_perspective TEXT NOT NULL DEFAULT 'WHITE' CHECK (score_perspective = 'WHITE'),
  root_move_uci TEXT NOT NULL CHECK (length(root_move_uci) BETWEEN 4 AND 5),
  pv_uci JSONB NOT NULL CHECK (jsonb_typeof(pv_uci) = 'array'),
  depth INTEGER,
  seldepth INTEGER,
  nodes BIGINT,
  nps BIGINT,
  time_ms BIGINT,
  hashfull INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (score_kind = 'CENTIPAWN' AND centipawns IS NOT NULL AND mate_in IS NULL) OR
    (score_kind = 'MATE' AND mate_in IS NOT NULL AND centipawns IS NULL)
  ),
  CHECK (
    (role = 'MULTIPV' AND pv_rank IS NOT NULL) OR
    (role = 'PLAYED_MOVE' AND pv_rank IS NULL)
  )
);

CREATE UNIQUE INDEX engine_evaluations_multipv_rank_idx
  ON engine_evaluations (analysis_run_id, engine_position_state_id, pv_rank)
  WHERE role = 'MULTIPV';
CREATE UNIQUE INDEX engine_evaluations_played_move_idx
  ON engine_evaluations (analysis_run_id, engine_position_state_id)
  WHERE role = 'PLAYED_MOVE';

CREATE TABLE move_engine_assessments (
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  engine_position_state_id UUID NOT NULL REFERENCES engine_position_states(id) ON DELETE CASCADE,
  game_id UUID NOT NULL,
  occurrence_ply INTEGER NOT NULL CHECK (occurrence_ply >= 0),
  mover TEXT NOT NULL CHECK (mover IN ('WHITE', 'BLACK')),
  played_move_uci TEXT NOT NULL CHECK (length(played_move_uci) BETWEEN 4 AND 5),
  best_move_uci TEXT NOT NULL CHECK (length(best_move_uci) BETWEEN 4 AND 5),
  best_evaluation_id UUID NOT NULL REFERENCES engine_evaluations(id),
  played_evaluation_id UUID NOT NULL REFERENCES engine_evaluations(id),
  centipawn_loss INTEGER CHECK (centipawn_loss IS NULL OR centipawn_loss >= 0),
  mate_outcome TEXT NOT NULL CHECK (mate_outcome IN (
    'NOT_APPLICABLE', 'MATE_MISSED', 'MATE_ALLOWED', 'MATE_PRESERVED', 'MATE_CHANGED'
  )),
  PRIMARY KEY (analysis_run_id, game_id, occurrence_ply),
  FOREIGN KEY (game_id, occurrence_ply)
    REFERENCES position_occurrences(game_id, ply) ON DELETE CASCADE
);

CREATE TABLE critical_positions (
  id UUID PRIMARY KEY,
  analysis_run_id UUID NOT NULL,
  game_id UUID NOT NULL,
  occurrence_ply INTEGER NOT NULL CHECK (occurrence_ply >= 0),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  reasons JSONB NOT NULL CHECK (jsonb_typeof(reasons) = 'array'),
  detector_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (analysis_run_id, game_id, occurrence_ply)
    REFERENCES move_engine_assessments(analysis_run_id, game_id, occurrence_ply)
    ON DELETE CASCADE,
  UNIQUE (analysis_run_id, game_id, occurrence_ply)
);

CREATE INDEX critical_positions_run_ply_idx
  ON critical_positions (analysis_run_id, occurrence_ply);

-- Engine evidence is deliberately attached to a run-specific occurrence state. The normalized
-- position ID remains query metadata; initial_fen + ordered history_uci is the reproducible UCI
-- engine state and prevents transpositions with different legal histories from being collapsed.
