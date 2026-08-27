ALTER TABLE games
  ADD COLUMN content_status TEXT NOT NULL DEFAULT 'METADATA_ONLY'
    CHECK (content_status IN ('METADATA_ONLY', 'MOVES_AVAILABLE')),
  ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'CONFLICTED')),
  ADD COLUMN metadata_candidate_key TEXT;

UPDATE games
SET content_status = CASE
      WHEN pgn_status = 'METADATA_ONLY' THEN 'METADATA_ONLY'
      ELSE 'MOVES_AVAILABLE'
    END,
    verification_status = CASE
      WHEN pgn_status = 'PGN_VERIFIED' THEN 'VERIFIED'
      ELSE 'UNVERIFIED'
    END;

ALTER TABLE game_source_records
  ADD COLUMN observation_kind TEXT NOT NULL DEFAULT 'PGN'
    CHECK (observation_kind IN ('METADATA', 'PGN')),
  ADD COLUMN external_tournament_id TEXT;

CREATE INDEX games_reconciliation_lookup_idx
  ON games (content_status, played_at, result);
CREATE INDEX games_metadata_candidate_key_idx
  ON games (metadata_candidate_key)
  WHERE metadata_candidate_key IS NOT NULL;
CREATE INDEX external_identities_reconciliation_idx
  ON external_identities (provider, external_id, verification_status, player_id);
CREATE INDEX game_source_external_tournament_idx
  ON game_source_records (data_source_id, external_tournament_id)
  WHERE external_tournament_id IS NOT NULL;

-- Candidate keys are intentionally not unique. They help discover records for deterministic review;
-- they are never proof that two observations describe one real-world game.
