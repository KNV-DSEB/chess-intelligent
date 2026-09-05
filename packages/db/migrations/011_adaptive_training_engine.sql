ALTER TABLE player_skill_graph_runs
  ADD COLUMN evidence_snapshot_sha256 CHAR(64)
    CHECK (evidence_snapshot_sha256 IS NULL OR evidence_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN selected_training_evidence_count INTEGER NOT NULL DEFAULT 0
    CHECK (selected_training_evidence_count >= 0),
  ADD COLUMN selected_training_item_count INTEGER NOT NULL DEFAULT 0
    CHECK (selected_training_item_count >= 0),
  ADD CONSTRAINT player_skill_graph_runs_training_plan_identity_unique
    UNIQUE (id, player_id, ontology_version_id, ontology_version),
  ADD CONSTRAINT player_skill_graph_runs_v2_snapshot_required CHECK (
    skill_graph_policy_version <> 'SKILL_GRAPH_POLICY_V2' OR evidence_snapshot_sha256 IS NOT NULL
  );

ALTER TABLE player_concept_states
  ADD COLUMN game_positive_evidence_mass NUMERIC(20, 12) NOT NULL DEFAULT 0
    CHECK (game_positive_evidence_mass >= 0),
  ADD COLUMN game_negative_evidence_mass NUMERIC(20, 12) NOT NULL DEFAULT 0
    CHECK (game_negative_evidence_mass >= 0),
  ADD COLUMN training_positive_evidence_mass NUMERIC(20, 12) NOT NULL DEFAULT 0
    CHECK (training_positive_evidence_mass >= 0),
  ADD COLUMN training_negative_evidence_mass NUMERIC(20, 12) NOT NULL DEFAULT 0
    CHECK (training_negative_evidence_mass >= 0),
  ADD COLUMN training_item_count INTEGER NOT NULL DEFAULT 0 CHECK (training_item_count >= 0),
  ADD COLUMN independent_evidence_unit_count INTEGER NOT NULL DEFAULT 0
    CHECK (independent_evidence_unit_count >= 0);

UPDATE player_concept_states
SET game_positive_evidence_mass = positive_evidence_mass,
    game_negative_evidence_mass = negative_evidence_mass,
    independent_evidence_unit_count = canonical_game_count;

ALTER TABLE player_concept_states
  ADD CONSTRAINT player_concept_states_source_mass_check CHECK (
    ABS(positive_evidence_mass - game_positive_evidence_mass
      - training_positive_evidence_mass) < 0.000000001
    AND ABS(negative_evidence_mass - game_negative_evidence_mass
      - training_negative_evidence_mass) < 0.000000001
  );

ALTER TABLE concept_evidence_instances
  ADD CONSTRAINT concept_evidence_instances_training_source_unique UNIQUE (
    id, classification_run_id, game_id, position_occurrence_id,
    concept_stable_id, analysis_run_id, exact_history_sha256
  );

CREATE TABLE training_plan_runs (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL,
  skill_graph_run_id UUID NOT NULL,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  training_candidate_policy_version TEXT NOT NULL,
  candidate_policy_config_sha256 CHAR(64) NOT NULL
    CHECK (candidate_policy_config_sha256 ~ '^[a-f0-9]{64}$'),
  training_item_source_policy_version TEXT NOT NULL,
  training_item_generator_version TEXT NOT NULL,
  item_generator_config_sha256 CHAR(64) NOT NULL
    CHECK (item_generator_config_sha256 ~ '^[a-f0-9]{64}$'),
  reveal_policy_version TEXT NOT NULL,
  cooldown_policy_version TEXT NOT NULL,
  max_items INTEGER NOT NULL CHECK (max_items BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  considered_concept_count INTEGER NOT NULL DEFAULT 0 CHECK (considered_concept_count >= 0),
  eligible_candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_candidate_count >= 0),
  materialized_item_count INTEGER NOT NULL DEFAULT 0 CHECK (materialized_item_count >= 0),
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (id, ontology_version_id, ontology_version),
  UNIQUE (id, player_id, ontology_version_id, ontology_version),
  FOREIGN KEY (skill_graph_run_id, player_id, ontology_version_id, ontology_version)
    REFERENCES player_skill_graph_runs(id, player_id, ontology_version_id, ontology_version)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'RUNNING' AND completed_at IS NULL) OR
    (status = 'SUCCEEDED' AND completed_at IS NOT NULL AND error_code IS NULL
      AND error_message IS NULL) OR
    (status = 'FAILED' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX training_plan_runs_success_identity_idx
  ON training_plan_runs (
    skill_graph_run_id, training_candidate_policy_version,
    candidate_policy_config_sha256, training_item_source_policy_version,
    training_item_generator_version, item_generator_config_sha256,
    reveal_policy_version, cooldown_policy_version, max_items
  ) WHERE status = 'SUCCEEDED';

CREATE INDEX training_plan_runs_player_history_idx
  ON training_plan_runs (player_id, created_at DESC, id DESC)
  WHERE status = 'SUCCEEDED';

CREATE TABLE training_candidates (
  id UUID PRIMARY KEY,
  training_plan_run_id UUID NOT NULL,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  concept_stable_id TEXT NOT NULL,
  candidate_type TEXT NOT NULL CHECK (candidate_type IN ('REMEDIATION', 'DIAGNOSTIC')),
  disposition TEXT NOT NULL CHECK (disposition IN (
    'ELIGIBLE', 'NO_ITEM_SOURCE', 'UNSUPPORTED_CONCEPT_V1',
    'ONTOLOGY_POLICY_UNSUPPORTED', 'PREREQUISITE_OBSERVED_NOT_READY',
    'RECENTLY_ATTEMPTED'
  )),
  skill_state_status TEXT NOT NULL CHECK (skill_state_status IN (
    'NO_EVIDENCE', 'INSUFFICIENT_EVIDENCE', 'ESTIMATED'
  )),
  mastery_band TEXT CHECK (mastery_band IN (
    'EMERGING', 'DEVELOPING', 'ESTABLISHED', 'STRONG_EVIDENCE_OF_MASTERY'
  )),
  evidence_confidence TEXT NOT NULL CHECK (evidence_confidence IN (
    'INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH'
  )),
  prerequisite_status TEXT NOT NULL CHECK (prerequisite_status IN (
    'READY', 'OBSERVED_NOT_READY', 'UNVERIFIED', 'NOT_APPLICABLE'
  )),
  selected_source_evidence_id UUID REFERENCES concept_evidence_instances(id) ON DELETE RESTRICT,
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'SUFFICIENT_NEGATIVE_MASTERY_EVIDENCE', 'NEEDS_MORE_DIRECT_EVIDENCE',
    'OBSERVED_PREREQUISITE_GAP', 'PREREQUISITE_UNVERIFIED',
    'NO_COMPATIBLE_POSITION', 'ONTOLOGY_TRAINING_POLICY_MISSING',
    'UNSUPPORTED_ITEM_TYPE', 'SOURCE_IN_COOLDOWN'
  )),
  rank INTEGER NOT NULL CHECK (rank > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_plan_run_id, concept_stable_id),
  UNIQUE (id, training_plan_run_id, concept_stable_id, candidate_type),
  FOREIGN KEY (training_plan_run_id, ontology_version_id, ontology_version)
    REFERENCES training_plan_runs(id, ontology_version_id, ontology_version) ON DELETE CASCADE,
  FOREIGN KEY (ontology_version_id, concept_stable_id)
    REFERENCES concept_definitions(ontology_version_id, concept_stable_id) ON DELETE RESTRICT
);

CREATE INDEX training_candidates_plan_rank_idx
  ON training_candidates (training_plan_run_id, disposition, rank);

CREATE TABLE training_items (
  id UUID PRIMARY KEY,
  training_plan_run_id UUID NOT NULL,
  training_candidate_id UUID NOT NULL,
  player_id UUID NOT NULL,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  concept_stable_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type = 'FIND_BEST_MOVE'),
  training_mode TEXT NOT NULL CHECK (training_mode IN ('REMEDIATION', 'DIAGNOSTIC')),
  source_game_id UUID NOT NULL,
  source_occurrence_id UUID NOT NULL,
  source_occurrence_ply INTEGER NOT NULL CHECK (source_occurrence_ply >= 0),
  source_evidence_instance_id UUID NOT NULL,
  source_classification_run_id UUID NOT NULL,
  source_analysis_run_id UUID NOT NULL,
  exact_history_sha256 CHAR(64) NOT NULL CHECK (exact_history_sha256 ~ '^[a-f0-9]{64}$'),
  initial_fen TEXT NOT NULL,
  history_uci JSONB NOT NULL CHECK (jsonb_typeof(history_uci) = 'array'),
  position_fen TEXT NOT NULL,
  side_to_move TEXT NOT NULL CHECK (side_to_move IN ('WHITE', 'BLACK')),
  accepted_move_ucis JSONB NOT NULL
    CHECK (jsonb_typeof(accepted_move_ucis) = 'array' AND jsonb_array_length(accepted_move_ucis) > 0),
  generator_id TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  generator_config_sha256 CHAR(64) NOT NULL
    CHECK (generator_config_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_plan_run_id, training_candidate_id),
  UNIQUE (id, player_id),
  UNIQUE (id, player_id, ontology_version_id, ontology_version,
          concept_stable_id, training_mode),
  UNIQUE (id, training_plan_run_id, player_id, ontology_version_id, ontology_version,
          concept_stable_id, item_type, training_mode),
  FOREIGN KEY (training_candidate_id, training_plan_run_id, concept_stable_id, training_mode)
    REFERENCES training_candidates(id, training_plan_run_id, concept_stable_id, candidate_type)
    ON DELETE RESTRICT,
  FOREIGN KEY (training_plan_run_id, player_id, ontology_version_id, ontology_version)
    REFERENCES training_plan_runs(id, player_id, ontology_version_id, ontology_version)
    ON DELETE RESTRICT,
  FOREIGN KEY (source_occurrence_id, source_game_id, source_occurrence_ply)
    REFERENCES position_occurrences(id, game_id, ply) ON DELETE RESTRICT,
  FOREIGN KEY (source_analysis_run_id, source_game_id)
    REFERENCES analysis_runs(id, game_id) ON DELETE RESTRICT,
  FOREIGN KEY (
    source_evidence_instance_id, source_classification_run_id, source_game_id,
    source_occurrence_id, concept_stable_id, source_analysis_run_id, exact_history_sha256
  ) REFERENCES concept_evidence_instances(
    id, classification_run_id, game_id, position_occurrence_id,
    concept_stable_id, analysis_run_id, exact_history_sha256
  ) ON DELETE RESTRICT
);

CREATE INDEX training_items_player_concept_idx
  ON training_items (player_id, concept_stable_id, created_at DESC);
CREATE INDEX training_items_source_cooldown_idx
  ON training_items (player_id, source_evidence_instance_id, created_at DESC);

CREATE TABLE training_attempts (
  id UUID PRIMARY KEY,
  training_item_id UUID NOT NULL,
  player_id UUID NOT NULL,
  submitted_move_uci TEXT NOT NULL CHECK (submitted_move_uci ~ '^[a-h][1-8][a-h][1-8][qrbn]?$'),
  result TEXT NOT NULL CHECK (result IN ('CORRECT', 'INCORRECT')),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  UNIQUE (training_item_id, attempt_number),
  UNIQUE (id, training_item_id, player_id, attempt_number),
  FOREIGN KEY (training_item_id, player_id)
    REFERENCES training_items(id, player_id) ON DELETE RESTRICT,
  CHECK (started_at IS NULL OR started_at <= submitted_at)
);

CREATE INDEX training_attempts_item_history_idx
  ON training_attempts (training_item_id, attempt_number);

CREATE TABLE training_evidence_instances (
  id UUID PRIMARY KEY,
  training_attempt_id UUID NOT NULL,
  training_item_id UUID NOT NULL,
  player_id UUID NOT NULL,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  concept_stable_id TEXT NOT NULL,
  evidence_type_stable_id TEXT NOT NULL CHECK (evidence_type_stable_id = 'training.attempt'),
  resolved_evidence_role TEXT NOT NULL CHECK (resolved_evidence_role IN (
    'DIRECT', 'SUPPORTING', 'CONTEXTUAL'
  )),
  polarity TEXT NOT NULL CHECK (polarity IN ('POSITIVE', 'NEGATIVE')),
  training_mode TEXT NOT NULL CHECK (training_mode IN ('REMEDIATION', 'DIAGNOSTIC')),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  source_item_generator_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_attempt_id),
  UNIQUE (
    id, training_attempt_id, training_item_id, player_id, ontology_version_id,
    concept_stable_id, resolved_evidence_role, polarity
  ),
  FOREIGN KEY (training_attempt_id, training_item_id, player_id, attempt_number)
    REFERENCES training_attempts(id, training_item_id, player_id, attempt_number)
    ON DELETE RESTRICT,
  FOREIGN KEY (
    training_item_id, player_id, ontology_version_id, ontology_version,
    concept_stable_id, training_mode
  ) REFERENCES training_items(
    id, player_id, ontology_version_id, ontology_version, concept_stable_id, training_mode
  ) ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, concept_stable_id)
    REFERENCES concept_definitions(ontology_version_id, concept_stable_id) ON DELETE RESTRICT,
  FOREIGN KEY (
    ontology_version_id, concept_stable_id, evidence_type_stable_id, resolved_evidence_role
  ) REFERENCES concept_evidence_policies(
    ontology_version_id, concept_stable_id, evidence_type_stable_id, evidence_role
  ) ON DELETE RESTRICT
);

-- PostgreSQL cannot express result-to-polarity mapping through a foreign key because their
-- vocabularies intentionally differ. The transactional repository resolves CORRECT/POSITIVE and
-- INCORRECT/NEGATIVE; immutable lineage and ontology-policy FKs protect every other identity.

CREATE INDEX training_evidence_player_concept_idx
  ON training_evidence_instances (player_id, ontology_version, concept_stable_id, created_at, id);

CREATE TABLE player_concept_training_contributions (
  id UUID PRIMARY KEY,
  skill_graph_run_id UUID NOT NULL,
  concept_stable_id TEXT NOT NULL,
  training_item_id UUID NOT NULL,
  training_attempt_id UUID NOT NULL,
  training_evidence_instance_id UUID NOT NULL,
  player_id UUID NOT NULL,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  historical_evidence_role TEXT NOT NULL CHECK (historical_evidence_role IN (
    'DIRECT', 'SUPPORTING', 'CONTEXTUAL'
  )),
  polarity TEXT NOT NULL CHECK (polarity IN ('POSITIVE', 'NEGATIVE')),
  role_weight NUMERIC(16, 12) NOT NULL CHECK (role_weight > 0),
  source_weight NUMERIC(16, 12) NOT NULL CHECK (source_weight > 0 AND source_weight <= 1),
  recency_weight NUMERIC(16, 12) NOT NULL CHECK (recency_weight > 0 AND recency_weight <= 1),
  effective_positive_weight NUMERIC(20, 12) NOT NULL CHECK (effective_positive_weight >= 0),
  effective_negative_weight NUMERIC(20, 12) NOT NULL CHECK (effective_negative_weight >= 0),
  evidence_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (skill_graph_run_id, concept_stable_id, training_item_id),
  UNIQUE (id, skill_graph_run_id, concept_stable_id, training_evidence_instance_id),
  FOREIGN KEY (skill_graph_run_id, concept_stable_id)
    REFERENCES player_concept_states(skill_graph_run_id, concept_stable_id) ON DELETE CASCADE,
  FOREIGN KEY (skill_graph_run_id, player_id, ontology_version_id, ontology_version)
    REFERENCES player_skill_graph_runs(id, player_id, ontology_version_id, ontology_version)
    ON DELETE RESTRICT,
  FOREIGN KEY (
    training_evidence_instance_id, training_attempt_id, training_item_id, player_id,
    ontology_version_id, concept_stable_id, historical_evidence_role, polarity
  ) REFERENCES training_evidence_instances(
    id, training_attempt_id, training_item_id, player_id, ontology_version_id,
    concept_stable_id, resolved_evidence_role, polarity
  ) ON DELETE RESTRICT,
  CHECK ((polarity = 'POSITIVE' AND effective_negative_weight = 0)
      OR (polarity = 'NEGATIVE' AND effective_positive_weight = 0)),
  CHECK (ABS(effective_positive_weight + effective_negative_weight
    - role_weight * source_weight * recency_weight) < 0.000000001)
);

CREATE TABLE skill_graph_training_evidence_contributions (
  id UUID PRIMARY KEY,
  skill_graph_run_id UUID NOT NULL,
  player_concept_training_contribution_id UUID NOT NULL,
  concept_stable_id TEXT NOT NULL,
  training_evidence_instance_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (skill_graph_run_id, training_evidence_instance_id),
  FOREIGN KEY (
    player_concept_training_contribution_id, skill_graph_run_id,
    concept_stable_id, training_evidence_instance_id
  ) REFERENCES player_concept_training_contributions(
    id, skill_graph_run_id, concept_stable_id, training_evidence_instance_id
  ) ON DELETE CASCADE
);

CREATE INDEX player_concept_training_contributions_state_idx
  ON player_concept_training_contributions (skill_graph_run_id, concept_stable_id, evidence_date DESC);
CREATE INDEX skill_graph_training_evidence_lineage_idx
  ON skill_graph_training_evidence_contributions (training_evidence_instance_id, skill_graph_run_id);

-- Task 010 adds a separate ontology-governed training evidence origin. It never writes training
-- attempts into game-scoped concept_evidence_instances and never mutates completed Skill Graphs.
