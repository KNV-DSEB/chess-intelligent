CREATE TABLE grounded_ai_artifacts (
  id UUID PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  student_profile_id UUID NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type = 'PLAYER_GROUNDED_BRIEF'),
  artifact_version TEXT NOT NULL CHECK (artifact_version = 'GROUNDED_BRIEF_ARTIFACT_V1'),
  audience TEXT NOT NULL CHECK (audience IN ('COACH', 'STUDENT')),
  source_skill_graph_run_id UUID NOT NULL REFERENCES player_skill_graph_runs(id) ON DELETE RESTRICT,
  source_training_plan_run_id UUID REFERENCES training_plan_runs(id) ON DELETE RESTRICT,
  context_version TEXT NOT NULL CHECK (context_version = 'GROUNDED_BRIEF_CONTEXT_V1'),
  prompt_version TEXT NOT NULL CHECK (prompt_version = 'GROUNDED_BRIEF_PROMPT_V1'),
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 100),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 200),
  input_snapshot_sha256 CHAR(64) NOT NULL CHECK (input_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  input_snapshot JSONB NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  validated_output JSONB NOT NULL CHECK (jsonb_typeof(validated_output) = 'object'),
  usage JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage) = 'object'),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (student_profile_id, academy_id, player_id)
    REFERENCES student_profiles(id, academy_id, player_id) ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, ontology_version)
    REFERENCES ontology_versions(id, version) ON DELETE RESTRICT,
  UNIQUE (id, academy_id, student_profile_id, player_id)
);

CREATE INDEX grounded_ai_artifacts_academy_student_history_idx
  ON grounded_ai_artifacts (academy_id, student_profile_id, created_at DESC, id DESC);
CREATE INDEX grounded_ai_artifacts_source_graph_idx
  ON grounded_ai_artifacts (source_skill_graph_run_id, audience, created_at DESC);

CREATE FUNCTION reject_grounded_ai_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'grounded_ai_artifacts is append-only';
END;
$$;

CREATE TRIGGER grounded_ai_artifacts_append_only
BEFORE UPDATE OR DELETE ON grounded_ai_artifacts
FOR EACH ROW EXECUTE FUNCTION reject_grounded_ai_artifact_mutation();

-- AI artifacts are explanation records over exact structured snapshots. They never write
-- chess truth, concept evidence, mastery, training attempts, assignments, or security state.
