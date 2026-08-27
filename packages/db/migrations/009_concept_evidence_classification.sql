ALTER TABLE position_occurrences
  ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD CONSTRAINT position_occurrences_id_unique UNIQUE (id),
  ADD CONSTRAINT position_occurrences_exact_identity_unique UNIQUE (id, game_id, ply);

ALTER TABLE ontology_versions
  ADD CONSTRAINT ontology_versions_id_version_unique UNIQUE (id, version);

ALTER TABLE concept_evidence_policies
  ADD CONSTRAINT concept_evidence_policies_role_unique UNIQUE (
    ontology_version_id, concept_stable_id, evidence_type_stable_id, evidence_role
  );

ALTER TABLE analysis_runs
  ADD CONSTRAINT analysis_runs_id_game_unique UNIQUE (id, game_id);

ALTER TABLE game_players
  ADD CONSTRAINT game_players_game_color_player_unique UNIQUE (game_id, color, player_id);

CREATE TABLE concept_classification_runs (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  classifier_bundle_version TEXT NOT NULL,
  classifier_config_sha256 CHAR(64) NOT NULL
    CHECK (classifier_config_sha256 ~ '^[a-f0-9]{64}$'),
  selected_analysis_run_id UUID,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (ontology_version_id, ontology_version)
    REFERENCES ontology_versions(id, version) ON DELETE RESTRICT,
  FOREIGN KEY (selected_analysis_run_id, game_id)
    REFERENCES analysis_runs(id, game_id) ON DELETE RESTRICT,
  UNIQUE (id, ontology_version_id, game_id),
  CHECK (
    (status = 'RUNNING' AND completed_at IS NULL) OR
    (status = 'SUCCEEDED' AND completed_at IS NOT NULL AND error_code IS NULL AND error_message IS NULL) OR
    (status = 'FAILED' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX concept_classification_runs_success_identity_idx
  ON concept_classification_runs (
    game_id,
    ontology_version,
    classifier_bundle_version,
    classifier_config_sha256,
    COALESCE(selected_analysis_run_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'SUCCEEDED';

CREATE INDEX concept_classification_runs_game_completed_idx
  ON concept_classification_runs (game_id, completed_at DESC, id DESC)
  WHERE status = 'SUCCEEDED';

CREATE TABLE concept_evidence_instances (
  id UUID PRIMARY KEY,
  classification_run_id UUID NOT NULL,
  ontology_version_id UUID NOT NULL,
  concept_stable_id TEXT NOT NULL,
  evidence_type_stable_id TEXT NOT NULL,
  evidence_role TEXT NOT NULL CHECK (evidence_role IN ('DIRECT', 'SUPPORTING', 'CONTEXTUAL')),
  polarity TEXT NOT NULL CHECK (polarity IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL')),
  game_id UUID NOT NULL,
  position_occurrence_id UUID NOT NULL,
  occurrence_ply INTEGER NOT NULL CHECK (occurrence_ply >= 0),
  decision_ply INTEGER NOT NULL CHECK (decision_ply = occurrence_ply + 1),
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('POSITION', 'DECISION')),
  subject_player_id UUID,
  subject_color TEXT NOT NULL CHECK (subject_color IN ('WHITE', 'BLACK')),
  classifier_id TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  exact_history_sha256 CHAR(64) NOT NULL CHECK (exact_history_sha256 ~ '^[a-f0-9]{64}$'),
  analysis_run_id UUID,
  facts JSONB NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (classification_run_id, ontology_version_id, game_id)
    REFERENCES concept_classification_runs(id, ontology_version_id, game_id) ON DELETE CASCADE,
  FOREIGN KEY (ontology_version_id, concept_stable_id)
    REFERENCES concept_definitions(ontology_version_id, concept_stable_id) ON DELETE RESTRICT,
  FOREIGN KEY (
    ontology_version_id, concept_stable_id, evidence_type_stable_id, evidence_role
  ) REFERENCES concept_evidence_policies(
    ontology_version_id, concept_stable_id, evidence_type_stable_id, evidence_role
  ) ON DELETE RESTRICT,
  FOREIGN KEY (position_occurrence_id, game_id, occurrence_ply)
    REFERENCES position_occurrences(id, game_id, ply) ON DELETE RESTRICT,
  FOREIGN KEY (analysis_run_id, game_id)
    REFERENCES analysis_runs(id, game_id) ON DELETE RESTRICT,
  FOREIGN KEY (game_id, subject_color, subject_player_id)
    REFERENCES game_players(game_id, color, player_id) ON DELETE RESTRICT,
  CHECK (
    (subject_kind = 'POSITION' AND subject_player_id IS NULL AND polarity = 'NEUTRAL') OR
    (subject_kind = 'DECISION' AND subject_player_id IS NOT NULL)
  ),
  CHECK (
    polarity = 'NEUTRAL' OR
    (subject_kind = 'DECISION' AND analysis_run_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX concept_evidence_instances_normalized_fact_idx
  ON concept_evidence_instances (
    classification_run_id,
    position_occurrence_id,
    subject_kind,
    COALESCE(subject_player_id, '00000000-0000-0000-0000-000000000000'::uuid),
    subject_color,
    concept_stable_id,
    evidence_type_stable_id,
    polarity,
    rule_id
  );

CREATE INDEX concept_evidence_instances_game_ply_idx
  ON concept_evidence_instances (game_id, occurrence_ply, concept_stable_id);
CREATE INDEX concept_evidence_instances_concept_idx
  ON concept_evidence_instances (ontology_version_id, concept_stable_id, polarity);
CREATE INDEX concept_evidence_instances_player_idx
  ON concept_evidence_instances (subject_player_id, concept_stable_id, created_at DESC)
  WHERE subject_player_id IS NOT NULL;

-- Task 008 stores immutable, occurrence-scoped evidence only. It intentionally adds no player
-- mastery, weakness, skill-score, lesson, recommendation, or evidence-weighting state.
