ALTER TABLE concept_classification_runs
  ADD CONSTRAINT concept_classification_runs_id_game_unique UNIQUE (id, game_id);

ALTER TABLE concept_evidence_instances
  ADD CONSTRAINT concept_evidence_instances_lineage_unique UNIQUE (
    id, classification_run_id, game_id, concept_stable_id, evidence_role, polarity
  );

CREATE TABLE player_skill_graph_runs (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  classifier_bundle_version TEXT NOT NULL,
  classifier_config_sha256 CHAR(64) NOT NULL
    CHECK (classifier_config_sha256 ~ '^[a-f0-9]{64}$'),
  classification_selection_policy_version TEXT NOT NULL,
  skill_graph_policy_version TEXT NOT NULL,
  policy_config_sha256 CHAR(64) NOT NULL CHECK (policy_config_sha256 ~ '^[a-f0-9]{64}$'),
  input_snapshot_sha256 CHAR(64) NOT NULL CHECK (input_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_scope JSONB NOT NULL CHECK (jsonb_typeof(evidence_scope) = 'object'),
  evidence_scope_sha256 CHAR(64) NOT NULL CHECK (evidence_scope_sha256 ~ '^[a-f0-9]{64}$'),
  as_of_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  selected_canonical_game_count INTEGER NOT NULL DEFAULT 0 CHECK (selected_canonical_game_count >= 0),
  games_with_moves_count INTEGER NOT NULL DEFAULT 0 CHECK (games_with_moves_count >= 0),
  selected_classification_run_count INTEGER NOT NULL DEFAULT 0
    CHECK (selected_classification_run_count >= 0),
  decision_occurrence_count INTEGER NOT NULL DEFAULT 0 CHECK (decision_occurrence_count >= 0),
  classified_decision_count INTEGER NOT NULL DEFAULT 0 CHECK (classified_decision_count >= 0),
  engine_backed_decision_count INTEGER NOT NULL DEFAULT 0 CHECK (engine_backed_decision_count >= 0),
  eligible_evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_evidence_count >= 0),
  mastery_eligible_evidence_count INTEGER NOT NULL DEFAULT 0
    CHECK (mastery_eligible_evidence_count >= 0),
  positive_mastery_evidence_count INTEGER NOT NULL DEFAULT 0
    CHECK (positive_mastery_evidence_count >= 0),
  negative_mastery_evidence_count INTEGER NOT NULL DEFAULT 0
    CHECK (negative_mastery_evidence_count >= 0),
  neutral_exposure_evidence_count INTEGER NOT NULL DEFAULT 0
    CHECK (neutral_exposure_evidence_count >= 0),
  concept_state_count INTEGER NOT NULL DEFAULT 0 CHECK (concept_state_count >= 0),
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (ontology_version_id, ontology_version)
    REFERENCES ontology_versions(id, version) ON DELETE RESTRICT,
  UNIQUE (id, ontology_version_id),
  CHECK (
    (status = 'RUNNING' AND completed_at IS NULL) OR
    (status = 'SUCCEEDED' AND completed_at IS NOT NULL AND error_code IS NULL AND error_message IS NULL) OR
    (status = 'FAILED' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX player_skill_graph_runs_success_identity_idx
  ON player_skill_graph_runs (
    player_id,
    ontology_version,
    classifier_bundle_version,
    classifier_config_sha256,
    classification_selection_policy_version,
    skill_graph_policy_version,
    policy_config_sha256,
    evidence_scope_sha256,
    as_of_date,
    input_snapshot_sha256
  )
  WHERE status = 'SUCCEEDED';

CREATE INDEX player_skill_graph_runs_player_history_idx
  ON player_skill_graph_runs (player_id, completed_at DESC, id DESC)
  WHERE status = 'SUCCEEDED';

CREATE TABLE skill_graph_selected_classification_runs (
  skill_graph_run_id UUID NOT NULL REFERENCES player_skill_graph_runs(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  classification_run_id UUID NOT NULL,
  selected_analysis_run_id UUID,
  PRIMARY KEY (skill_graph_run_id, game_id),
  UNIQUE (skill_graph_run_id, game_id, classification_run_id),
  FOREIGN KEY (classification_run_id, game_id)
    REFERENCES concept_classification_runs(id, game_id) ON DELETE RESTRICT,
  FOREIGN KEY (selected_analysis_run_id, game_id)
    REFERENCES analysis_runs(id, game_id) ON DELETE RESTRICT
);

CREATE TABLE player_concept_states (
  skill_graph_run_id UUID NOT NULL,
  ontology_version_id UUID NOT NULL,
  concept_stable_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NO_EVIDENCE', 'INSUFFICIENT_EVIDENCE', 'ESTIMATED')),
  posterior_alpha NUMERIC(20, 12) NOT NULL CHECK (posterior_alpha > 0),
  posterior_beta NUMERIC(20, 12) NOT NULL CHECK (posterior_beta > 0),
  posterior_mean NUMERIC(16, 12) CHECK (posterior_mean >= 0 AND posterior_mean <= 1),
  positive_evidence_mass NUMERIC(20, 12) NOT NULL CHECK (positive_evidence_mass >= 0),
  negative_evidence_mass NUMERIC(20, 12) NOT NULL CHECK (negative_evidence_mass >= 0),
  effective_evidence_mass NUMERIC(20, 12) NOT NULL CHECK (effective_evidence_mass >= 0),
  raw_positive_count INTEGER NOT NULL CHECK (raw_positive_count >= 0),
  raw_negative_count INTEGER NOT NULL CHECK (raw_negative_count >= 0),
  neutral_exposure_count INTEGER NOT NULL CHECK (neutral_exposure_count >= 0),
  neutral_exposure_game_count INTEGER NOT NULL CHECK (neutral_exposure_game_count >= 0),
  contextual_evidence_count INTEGER NOT NULL CHECK (contextual_evidence_count >= 0),
  canonical_game_count INTEGER NOT NULL CHECK (canonical_game_count >= 0),
  first_evidence_at DATE,
  last_evidence_at DATE,
  evidence_confidence TEXT NOT NULL CHECK (evidence_confidence IN (
    'INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH'
  )),
  mastery_band TEXT CHECK (mastery_band IN (
    'EMERGING', 'DEVELOPING', 'ESTABLISHED', 'STRONG_EVIDENCE_OF_MASTERY'
  )),
  PRIMARY KEY (skill_graph_run_id, concept_stable_id),
  FOREIGN KEY (skill_graph_run_id, ontology_version_id)
    REFERENCES player_skill_graph_runs(id, ontology_version_id) ON DELETE CASCADE,
  FOREIGN KEY (ontology_version_id, concept_stable_id)
    REFERENCES concept_definitions(ontology_version_id, concept_stable_id) ON DELETE RESTRICT,
  CHECK (
    ABS(effective_evidence_mass - positive_evidence_mass - negative_evidence_mass) < 0.000000001
  ),
  CHECK (
    (status = 'NO_EVIDENCE' AND posterior_mean IS NULL AND mastery_band IS NULL
      AND evidence_confidence = 'INSUFFICIENT') OR
    (status = 'INSUFFICIENT_EVIDENCE' AND posterior_mean IS NOT NULL AND mastery_band IS NULL
      AND evidence_confidence = 'INSUFFICIENT') OR
    (status = 'ESTIMATED' AND posterior_mean IS NOT NULL AND mastery_band IS NOT NULL
      AND evidence_confidence <> 'INSUFFICIENT')
  ),
  CHECK (
    (first_evidence_at IS NULL AND last_evidence_at IS NULL) OR
    (first_evidence_at IS NOT NULL AND last_evidence_at IS NOT NULL
      AND first_evidence_at <= last_evidence_at)
  )
);

CREATE TABLE player_concept_game_contributions (
  id UUID PRIMARY KEY,
  skill_graph_run_id UUID NOT NULL,
  concept_stable_id TEXT NOT NULL,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  classification_run_id UUID NOT NULL,
  raw_positive_weight NUMERIC(20, 12) NOT NULL CHECK (raw_positive_weight >= 0),
  raw_negative_weight NUMERIC(20, 12) NOT NULL CHECK (raw_negative_weight >= 0),
  capped_positive_weight NUMERIC(20, 12) NOT NULL CHECK (capped_positive_weight >= 0),
  capped_negative_weight NUMERIC(20, 12) NOT NULL CHECK (capped_negative_weight >= 0),
  recency_weight NUMERIC(16, 12) NOT NULL CHECK (recency_weight > 0 AND recency_weight <= 1),
  effective_positive_weight NUMERIC(20, 12) NOT NULL CHECK (effective_positive_weight >= 0),
  effective_negative_weight NUMERIC(20, 12) NOT NULL CHECK (effective_negative_weight >= 0),
  evidence_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (skill_graph_run_id, concept_stable_id, game_id),
  UNIQUE (id, skill_graph_run_id, concept_stable_id, game_id, classification_run_id),
  FOREIGN KEY (skill_graph_run_id, concept_stable_id)
    REFERENCES player_concept_states(skill_graph_run_id, concept_stable_id) ON DELETE CASCADE,
  FOREIGN KEY (skill_graph_run_id, game_id, classification_run_id)
    REFERENCES skill_graph_selected_classification_runs(
      skill_graph_run_id, game_id, classification_run_id
    ) ON DELETE RESTRICT,
  CHECK (capped_positive_weight + capped_negative_weight <= 1.000000000001),
  CHECK (
    ABS(effective_positive_weight - capped_positive_weight * recency_weight) < 0.000000001
  ),
  CHECK (
    ABS(effective_negative_weight - capped_negative_weight * recency_weight) < 0.000000001
  )
);

CREATE INDEX player_concept_game_contributions_state_idx
  ON player_concept_game_contributions (skill_graph_run_id, concept_stable_id, evidence_date DESC);

CREATE TABLE skill_graph_evidence_contributions (
  id UUID PRIMARY KEY,
  skill_graph_run_id UUID NOT NULL,
  player_concept_game_contribution_id UUID NOT NULL,
  concept_evidence_instance_id UUID NOT NULL,
  classification_run_id UUID NOT NULL,
  concept_stable_id TEXT NOT NULL,
  game_id UUID NOT NULL,
  historical_evidence_role TEXT NOT NULL CHECK (historical_evidence_role IN (
    'DIRECT', 'SUPPORTING', 'CONTEXTUAL'
  )),
  polarity TEXT NOT NULL CHECK (polarity IN ('POSITIVE', 'NEGATIVE')),
  role_weight NUMERIC(16, 12) NOT NULL CHECK (role_weight > 0),
  pre_cap_contribution NUMERIC(16, 12) NOT NULL CHECK (pre_cap_contribution > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (skill_graph_run_id, concept_evidence_instance_id),
  FOREIGN KEY (
    player_concept_game_contribution_id,
    skill_graph_run_id,
    concept_stable_id,
    game_id,
    classification_run_id
  ) REFERENCES player_concept_game_contributions(
    id, skill_graph_run_id, concept_stable_id, game_id, classification_run_id
  ) ON DELETE CASCADE,
  FOREIGN KEY (
    concept_evidence_instance_id,
    classification_run_id,
    game_id,
    concept_stable_id,
    historical_evidence_role,
    polarity
  ) REFERENCES concept_evidence_instances(
    id, classification_run_id, game_id, concept_stable_id, evidence_role, polarity
  ) ON DELETE RESTRICT
);

CREATE INDEX skill_graph_evidence_contributions_contribution_idx
  ON skill_graph_evidence_contributions (player_concept_game_contribution_id);
CREATE INDEX skill_graph_evidence_contributions_evidence_idx
  ON skill_graph_evidence_contributions (concept_evidence_instance_id, skill_graph_run_id);

CREATE INDEX concept_classification_runs_skill_graph_selection_idx
  ON concept_classification_runs (
    ontology_version, classifier_bundle_version, classifier_config_sha256,
    game_id, completed_at DESC, id DESC
  )
  WHERE status = 'SUCCEEDED';

CREATE INDEX concept_evidence_instances_skill_graph_projection_idx
  ON concept_evidence_instances (
    classification_run_id, subject_player_id, position_occurrence_id, concept_stable_id
  );

-- Task 009 persists immutable evidence interpretation only. It never updates Task 008 rows and
-- deliberately contains no weakness, strength, training-priority, lesson, or recommendation state.
