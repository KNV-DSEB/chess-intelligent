CREATE TABLE pilot_events (
  id UUID PRIMARY KEY,
  event_version TEXT NOT NULL CHECK (event_version = 'PILOT_EVENT_V1'),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'COACH_OPENED_STUDENT_INTELLIGENCE',
    'COACH_OPENED_CONCEPT_EVIDENCE',
    'COACH_GENERATED_AI_BRIEF',
    'COACH_OPENED_AI_CLAIM_EVIDENCE',
    'COACH_CREATED_TRAINING_PLAN',
    'COACH_CREATED_ASSIGNMENT',
    'STUDENT_OPENED_ASSIGNMENT',
    'STUDENT_STARTED_TRAINING_ITEM',
    'STUDENT_SUBMITTED_FIRST_ATTEMPT',
    'STUDENT_COMPLETED_TRAINING_ITEM',
    'STUDENT_COMPLETED_ASSIGNMENT',
    'SKILL_GRAPH_REFRESHED',
    'COACH_OPENED_PROGRESS_REVIEW',
    'COACH_RETURNED_TO_STUDENT'
  )),
  event_source TEXT NOT NULL CHECK (event_source IN ('SERVER', 'CLIENT')),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'SUCCESS', 'AI_UNAVAILABLE', 'AI_PROVIDER_FAILED', 'AI_OUTPUT_INVALID'
  )),
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_membership_id UUID NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('OWNER', 'ADMIN', 'COACH', 'STUDENT')),
  session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE RESTRICT,
  student_profile_id UUID,
  player_id UUID REFERENCES players(id) ON DELETE RESTRICT,
  skill_graph_run_id UUID REFERENCES player_skill_graph_runs(id) ON DELETE RESTRICT,
  concept_stable_id TEXT REFERENCES concept_identities(stable_id) ON DELETE RESTRICT,
  grounded_ai_artifact_id UUID,
  grounded_ai_claim_id TEXT CHECK (
    grounded_ai_claim_id IS NULL OR char_length(grounded_ai_claim_id) BETWEEN 1 AND 100
  ),
  evidence_reference TEXT CHECK (
    evidence_reference IS NULL OR char_length(evidence_reference) BETWEEN 1 AND 300
  ),
  training_plan_run_id UUID REFERENCES training_plan_runs(id) ON DELETE RESTRICT,
  assignment_id UUID REFERENCES training_assignments(id) ON DELETE RESTRICT,
  training_item_id UUID REFERENCES training_items(id) ON DELETE RESTRICT,
  attempt_result TEXT CHECK (attempt_result IS NULL OR attempt_result IN ('CORRECT', 'INCORRECT')),
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 1 AND 200),
  deduplication_sha256 CHAR(64) NOT NULL CHECK (deduplication_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_membership_id, academy_id, actor_role)
    REFERENCES academy_memberships(id, academy_id, role) ON DELETE RESTRICT,
  FOREIGN KEY (student_profile_id, academy_id, player_id)
    REFERENCES student_profiles(id, academy_id, player_id) ON DELETE RESTRICT,
  FOREIGN KEY (grounded_ai_artifact_id, academy_id, student_profile_id, player_id)
    REFERENCES grounded_ai_artifacts(id, academy_id, student_profile_id, player_id)
    ON DELETE RESTRICT,
  UNIQUE (academy_id, actor_user_id, event_type, deduplication_sha256),
  CHECK ((student_profile_id IS NULL) = (player_id IS NULL)),
  CHECK (
    (event_type LIKE 'COACH_%' AND actor_role IN ('OWNER', 'ADMIN', 'COACH')) OR
    (event_type LIKE 'STUDENT_%' AND actor_role = 'STUDENT') OR
    (event_type = 'SKILL_GRAPH_REFRESHED' AND actor_role IN ('OWNER', 'ADMIN', 'COACH'))
  )
);

CREATE INDEX pilot_events_academy_time_idx
  ON pilot_events (academy_id, occurred_at, event_type, id);
CREATE INDEX pilot_events_actor_time_idx
  ON pilot_events (academy_id, actor_user_id, occurred_at, id);
CREATE INDEX pilot_events_student_time_idx
  ON pilot_events (academy_id, student_profile_id, occurred_at, id)
  WHERE student_profile_id IS NOT NULL;

CREATE TABLE coach_review_feedback (
  id UUID PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_membership_id UUID NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('OWNER', 'ADMIN', 'COACH')),
  session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE RESTRICT,
  student_profile_id UUID NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  skill_graph_run_id UUID NOT NULL REFERENCES player_skill_graph_runs(id) ON DELETE RESTRICT,
  ontology_version_id UUID NOT NULL,
  ontology_version TEXT NOT NULL,
  concept_stable_id TEXT NOT NULL,
  feedback_value TEXT NOT NULL CHECK (feedback_value IN ('AGREE', 'UNSURE', 'DISAGREE')),
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 1 AND 200),
  deduplication_sha256 CHAR(64) NOT NULL CHECK (deduplication_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_membership_id, academy_id, actor_role)
    REFERENCES academy_memberships(id, academy_id, role) ON DELETE RESTRICT,
  FOREIGN KEY (student_profile_id, academy_id, player_id)
    REFERENCES student_profiles(id, academy_id, player_id) ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, ontology_version)
    REFERENCES ontology_versions(id, version) ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, concept_stable_id)
    REFERENCES concept_definitions(ontology_version_id, concept_stable_id) ON DELETE RESTRICT,
  UNIQUE (academy_id, actor_user_id, skill_graph_run_id, concept_stable_id, deduplication_sha256)
);

CREATE INDEX coach_review_feedback_academy_time_idx
  ON coach_review_feedback (academy_id, created_at, feedback_value, id);
CREATE INDEX coach_review_feedback_student_idx
  ON coach_review_feedback (academy_id, student_profile_id, skill_graph_run_id, concept_stable_id);

CREATE TABLE ai_claim_feedback (
  id UUID PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_membership_id UUID NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('OWNER', 'ADMIN', 'COACH', 'STUDENT')),
  session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE RESTRICT,
  student_profile_id UUID NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  grounded_ai_artifact_id UUID NOT NULL,
  grounded_ai_claim_id TEXT NOT NULL CHECK (char_length(grounded_ai_claim_id) BETWEEN 1 AND 100),
  feedback_value TEXT NOT NULL CHECK (feedback_value IN ('USEFUL', 'NOT_USEFUL')),
  not_useful_reason TEXT CHECK (
    not_useful_reason IS NULL OR not_useful_reason IN (
      'INCORRECT', 'TOO_VAGUE', 'NOT_ACTIONABLE', 'ALREADY_KNOWN', 'OTHER'
    )
  ),
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 1 AND 200),
  deduplication_sha256 CHAR(64) NOT NULL CHECK (deduplication_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_membership_id, academy_id, actor_role)
    REFERENCES academy_memberships(id, academy_id, role) ON DELETE RESTRICT,
  FOREIGN KEY (student_profile_id, academy_id, player_id)
    REFERENCES student_profiles(id, academy_id, player_id) ON DELETE RESTRICT,
  FOREIGN KEY (grounded_ai_artifact_id, academy_id, student_profile_id, player_id)
    REFERENCES grounded_ai_artifacts(id, academy_id, student_profile_id, player_id)
    ON DELETE RESTRICT,
  UNIQUE (grounded_ai_artifact_id, grounded_ai_claim_id, actor_user_id, deduplication_sha256),
  CHECK (
    (feedback_value = 'USEFUL' AND not_useful_reason IS NULL) OR
    (feedback_value = 'NOT_USEFUL' AND not_useful_reason IS NOT NULL)
  )
);

CREATE INDEX ai_claim_feedback_academy_time_idx
  ON ai_claim_feedback (academy_id, created_at, feedback_value, id);
CREATE INDEX ai_claim_feedback_artifact_idx
  ON ai_claim_feedback (grounded_ai_artifact_id, grounded_ai_claim_id, created_at, id);

CREATE FUNCTION reject_pilot_observation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Pilot observations and feedback are append-only';
END;
$$;

CREATE TRIGGER pilot_events_append_only
BEFORE UPDATE OR DELETE ON pilot_events
FOR EACH ROW EXECUTE FUNCTION reject_pilot_observation_mutation();

CREATE TRIGGER coach_review_feedback_append_only
BEFORE UPDATE OR DELETE ON coach_review_feedback
FOR EACH ROW EXECUTE FUNCTION reject_pilot_observation_mutation();

CREATE TRIGGER ai_claim_feedback_append_only
BEFORE UPDATE OR DELETE ON ai_claim_feedback
FOR EACH ROW EXECUTE FUNCTION reject_pilot_observation_mutation();

-- Pilot observations and human feedback are operational records. No trigger or foreign key path
-- writes chess truth, concept evidence, training evidence, mastery, or Skill Graph state.
