CREATE TABLE academies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE academy_memberships (
  id UUID PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('COACH', 'STUDENT')),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, academy_id, role)
);

CREATE INDEX academy_memberships_roster_idx
  ON academy_memberships (academy_id, role, display_name, id);

CREATE TABLE student_profiles (
  id UUID PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  academy_membership_id UUID NOT NULL,
  membership_role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (membership_role = 'STUDENT'),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academy_membership_id),
  UNIQUE (id, academy_id, player_id),
  FOREIGN KEY (academy_membership_id, academy_id, membership_role)
    REFERENCES academy_memberships(id, academy_id, role) ON DELETE RESTRICT
);

CREATE INDEX student_profiles_academy_roster_idx
  ON student_profiles (academy_id, created_at, id);
CREATE INDEX student_profiles_player_idx
  ON student_profiles (player_id, academy_id, id);

ALTER TABLE training_plan_runs
  ADD CONSTRAINT training_plan_runs_assignment_identity_unique
    UNIQUE (id, player_id, skill_graph_run_id);

ALTER TABLE training_items
  ADD CONSTRAINT training_items_assignment_identity_unique
    UNIQUE (id, training_plan_run_id, player_id, training_mode);

CREATE TABLE training_assignments (
  id UUID PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  student_profile_id UUID NOT NULL,
  player_id UUID NOT NULL,
  assigned_by_coach_membership_id UUID NOT NULL,
  coach_membership_role TEXT NOT NULL DEFAULT 'COACH' CHECK (coach_membership_role = 'COACH'),
  training_plan_run_id UUID NOT NULL,
  baseline_skill_graph_run_id UUID NOT NULL,
  assignment_policy_version TEXT NOT NULL CHECK (
    assignment_policy_version = 'TRAINING_ASSIGNMENT_POLICY_V1'
  ),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at DATE,
  cancelled_at TIMESTAMPTZ,
  note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, academy_id, player_id, training_plan_run_id),
  FOREIGN KEY (student_profile_id, academy_id, player_id)
    REFERENCES student_profiles(id, academy_id, player_id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_by_coach_membership_id, academy_id, coach_membership_role)
    REFERENCES academy_memberships(id, academy_id, role) ON DELETE RESTRICT,
  FOREIGN KEY (training_plan_run_id, player_id, baseline_skill_graph_run_id)
    REFERENCES training_plan_runs(id, player_id, skill_graph_run_id) ON DELETE RESTRICT,
  CHECK (due_at IS NULL OR due_at >= assigned_at::date),
  CHECK (cancelled_at IS NULL OR cancelled_at >= assigned_at)
);

CREATE INDEX training_assignments_student_history_idx
  ON training_assignments (academy_id, student_profile_id, assigned_at DESC, id DESC);
CREATE INDEX training_assignments_active_idx
  ON training_assignments (academy_id, student_profile_id, due_at, assigned_at DESC)
  WHERE cancelled_at IS NULL;

CREATE TABLE training_assignment_items (
  id UUID PRIMARY KEY,
  assignment_id UUID NOT NULL,
  academy_id UUID NOT NULL,
  training_plan_run_id UUID NOT NULL,
  training_item_id UUID NOT NULL,
  player_id UUID NOT NULL,
  training_mode TEXT NOT NULL CHECK (training_mode IN ('REMEDIATION', 'DIAGNOSTIC')),
  measurement_status TEXT NOT NULL CHECK (measurement_status IN (
    'MEASUREMENT_ELIGIBLE', 'PRACTICE_ONLY_ALREADY_MEASURED'
  )),
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, training_item_id),
  UNIQUE (assignment_id, ordinal),
  FOREIGN KEY (assignment_id, academy_id, player_id, training_plan_run_id)
    REFERENCES training_assignments(id, academy_id, player_id, training_plan_run_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (training_item_id, training_plan_run_id, player_id, training_mode)
    REFERENCES training_items(id, training_plan_run_id, player_id, training_mode)
    ON DELETE RESTRICT
);

CREATE INDEX training_assignment_items_assignment_idx
  ON training_assignment_items (assignment_id, ordinal);
CREATE INDEX training_assignment_items_training_item_idx
  ON training_assignment_items (training_item_id, assignment_id);

CREATE INDEX player_skill_graph_runs_compatible_profile_idx
  ON player_skill_graph_runs (
    player_id, ontology_version, skill_graph_policy_version, policy_config_sha256,
    evidence_scope_sha256, classifier_bundle_version, classifier_config_sha256,
    classification_selection_policy_version, as_of_date DESC, completed_at DESC, id DESC
  ) WHERE status = 'SUCCEEDED';

CREATE INDEX training_attempts_player_item_time_idx
  ON training_attempts (player_id, training_item_id, submitted_at, attempt_number, id);
CREATE INDEX training_evidence_first_measurement_idx
  ON training_evidence_instances (
    player_id, ontology_version, training_item_id, attempt_number, created_at, id
  );

-- Task 011 is a scoped workflow/read-model layer. StudentProfile remains separate from Player,
-- assignments reference immutable Task 010 artifacts, and no assignment or coach-note table has
-- any route to concept_evidence_instances or training_evidence_instances.
