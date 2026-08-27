CREATE TABLE data_licenses (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  permission_basis TEXT NOT NULL,
  terms_reference TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE data_sources (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL UNIQUE CHECK (type IN (
    'USER_UPLOAD', 'LICHESS_API', 'LICHESS_CC0', 'CHESS_RESULTS', 'FIDE',
    'CHESSCOM_AUTHORIZED', 'TOURNAMENT_FEED', 'LICENSED_PROVIDER', 'OTHER'
  )),
  display_name TEXT NOT NULL,
  integration_status TEXT NOT NULL CHECK (integration_status IN (
    'ACTIVE', 'DISABLED', 'PENDING_LICENSE_REVIEW'
  )),
  default_license_id UUID REFERENCES data_licenses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO data_sources (id, type, display_name, integration_status) VALUES
  ('00000000-0000-4000-8000-000000000001', 'USER_UPLOAD', 'Direct user upload', 'ACTIVE'),
  ('00000000-0000-4000-8000-000000000002', 'LICHESS_API', 'Lichess API', 'DISABLED'),
  ('00000000-0000-4000-8000-000000000003', 'LICHESS_CC0', 'Lichess CC0 database', 'DISABLED'),
  ('00000000-0000-4000-8000-000000000004', 'CHESS_RESULTS', 'Chess-Results / authorized Swiss-Manager source', 'PENDING_LICENSE_REVIEW'),
  ('00000000-0000-4000-8000-000000000005', 'FIDE', 'FIDE', 'DISABLED'),
  ('00000000-0000-4000-8000-000000000006', 'CHESSCOM_AUTHORIZED', 'Chess.com authorized access', 'DISABLED'),
  ('00000000-0000-4000-8000-000000000007', 'TOURNAMENT_FEED', 'Authorized tournament feed', 'DISABLED'),
  ('00000000-0000-4000-8000-000000000008', 'LICENSED_PROVIDER', 'Licensed provider', 'DISABLED'),
  ('00000000-0000-4000-8000-000000000009', 'OTHER', 'Other documented source', 'DISABLED');

CREATE TABLE players (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  identity_resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED'
    CHECK (identity_resolution_status IN ('UNRESOLVED', 'PARTIAL', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX players_normalized_name_idx ON players (normalized_name);

CREATE TABLE external_identities (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('FIDE', 'LICHESS', 'CHESSCOM', 'CHESS_RESULTS', 'OTHER')),
  external_id TEXT NOT NULL,
  display_handle TEXT,
  verification_status TEXT NOT NULL CHECK (verification_status IN (
    'UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'
  )),
  confidence NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  link_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE import_jobs (
  id UUID PRIMARY KEY,
  data_source_id UUID NOT NULL REFERENCES data_sources(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  result_status TEXT CHECK (result_status IN ('CREATED', 'ALREADY_EXISTS')),
  external_id TEXT,
  raw_pgn_sha256 CHAR(64) NOT NULL,
  game_id UUID,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE games (
  id UUID PRIMARY KEY,
  fingerprint CHAR(64) UNIQUE,
  pgn_status TEXT NOT NULL CHECK (pgn_status IN (
    'METADATA_ONLY', 'PGN_AVAILABLE', 'PGN_IMPORTED', 'PGN_VERIFIED'
  )),
  event TEXT,
  site TEXT,
  played_at DATE,
  played_date_text TEXT,
  round TEXT,
  result TEXT NOT NULL DEFAULT '*',
  termination TEXT,
  time_control TEXT,
  rated BOOLEAN,
  board_number TEXT,
  game_context TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (game_context IN ('OTB', 'ONLINE', 'UNKNOWN')),
  time_category TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (time_category IN (
    'CLASSICAL', 'RAPID', 'BLITZ', 'BULLET', 'CORRESPONDENCE', 'UNKNOWN'
  )),
  initial_fen TEXT,
  normalized_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pgn_status = 'METADATA_ONLY' OR fingerprint IS NOT NULL)
);

ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id);

CREATE TABLE game_players (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  color TEXT NOT NULL CHECK (color IN ('WHITE', 'BLACK')),
  player_id UUID NOT NULL REFERENCES players(id),
  display_name TEXT NOT NULL,
  rating INTEGER CHECK (rating IS NULL OR rating > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, color)
);

CREATE INDEX game_players_player_id_idx ON game_players (player_id, color);

CREATE TABLE positions (
  id CHAR(64) PRIMARY KEY,
  normalized_fen_key TEXT NOT NULL UNIQUE,
  side_to_move TEXT NOT NULL CHECK (side_to_move IN ('WHITE', 'BLACK')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_source_records (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES data_sources(id),
  import_job_id UUID UNIQUE REFERENCES import_jobs(id),
  data_license_id UUID REFERENCES data_licenses(id),
  external_id TEXT,
  source_reference TEXT,
  permission_basis TEXT NOT NULL,
  raw_pgn TEXT,
  original_pgn_sha256 CHAR(64),
  raw_source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  retrieved_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX game_source_external_id_unique_idx
  ON game_source_records (data_source_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX game_source_game_id_idx ON game_source_records (game_id, imported_at);
CREATE INDEX game_source_source_id_idx ON game_source_records (data_source_id, imported_at);

CREATE TABLE moves (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply INTEGER NOT NULL CHECK (ply > 0),
  san TEXT NOT NULL,
  uci TEXT NOT NULL CHECK (length(uci) BETWEEN 4 AND 5),
  from_square CHAR(2) NOT NULL,
  to_square CHAR(2) NOT NULL,
  promotion CHAR(1),
  fen_after TEXT NOT NULL,
  position_id CHAR(64) NOT NULL REFERENCES positions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, ply)
);

CREATE INDEX moves_position_id_idx ON moves (position_id);
CREATE INDEX games_corpus_filter_idx
  ON games (game_context, time_category, pgn_status, played_at);

-- Tournament, section, participant, round, pairing, standing, and coverage tables are intentionally
-- deferred. A future migration can link games through pairing/tournament IDs without rewriting these
-- canonical game, player, or provenance records.
