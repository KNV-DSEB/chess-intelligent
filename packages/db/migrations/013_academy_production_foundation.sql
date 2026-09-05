CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  normalized_email TEXT NOT NULL UNIQUE CHECK (
    normalized_email = lower(btrim(normalized_email)) AND char_length(normalized_email) BETWEEN 3 AND 320
  ),
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 300),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_status_idx ON users (status, id);

CREATE TABLE user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  password_hash TEXT NOT NULL CHECK (char_length(password_hash) BETWEEN 40 AND 1000),
  password_algorithm TEXT NOT NULL CHECK (password_algorithm = 'ARGON2ID_V1'),
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE academy_memberships
  DROP CONSTRAINT academy_memberships_role_check,
  ADD CONSTRAINT academy_memberships_role_check
    CHECK (role IN ('OWNER', 'ADMIN', 'COACH', 'STUDENT')),
  ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISABLED')),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD CONSTRAINT academy_memberships_id_academy_unique UNIQUE (id, academy_id);

CREATE UNIQUE INDEX academy_memberships_active_user_academy_unique
  ON academy_memberships (academy_id, user_id)
  WHERE user_id IS NOT NULL AND status = 'ACTIVE';
CREATE INDEX academy_memberships_user_lookup_idx
  ON academy_memberships (user_id, status, academy_id, role)
  WHERE user_id IS NOT NULL;

ALTER TABLE training_assignments
  DROP CONSTRAINT training_assignments_assigned_by_coach_membership_id_acade_fkey,
  DROP CONSTRAINT training_assignments_coach_membership_role_check,
  ADD CONSTRAINT training_assignments_coach_membership_role_check
    CHECK (coach_membership_role IN ('OWNER', 'ADMIN', 'COACH')),
  ADD CONSTRAINT training_assignments_actor_membership_academy_fkey
    FOREIGN KEY (assigned_by_coach_membership_id, academy_id)
    REFERENCES academy_memberships(id, academy_id) ON DELETE RESTRICT;

ALTER TABLE student_profiles
  ADD COLUMN requires_guardian_consent BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT student_profiles_id_academy_unique UNIQUE (id, academy_id);

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_user_agent TEXT CHECK (
    created_user_agent IS NULL OR char_length(created_user_agent) BETWEEN 1 AND 500
  ),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX auth_sessions_active_user_idx
  ON auth_sessions (user_id, expires_at DESC, id)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_token_lookup_idx
  ON auth_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE auth_login_attempts (
  id UUID PRIMARY KEY,
  identifier_sha256 CHAR(64) NOT NULL CHECK (identifier_sha256 ~ '^[a-f0-9]{64}$'),
  success BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_login_attempts_throttle_idx
  ON auth_login_attempts (identifier_sha256, attempted_at DESC)
  WHERE success = false;

CREATE TABLE academy_invitations (
  id UUID PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  normalized_email TEXT NOT NULL CHECK (
    normalized_email = lower(btrim(normalized_email)) AND char_length(normalized_email) BETWEEN 3 AND 320
  ),
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'COACH', 'STUDENT')),
  existing_membership_id UUID,
  created_by_membership_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, academy_id)
    REFERENCES academy_memberships(id, academy_id) ON DELETE RESTRICT,
  FOREIGN KEY (existing_membership_id, academy_id)
    REFERENCES academy_memberships(id, academy_id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK ((status = 'ACCEPTED') = (accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL)),
  CHECK (accepted_at IS NULL OR accepted_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX academy_invitations_academy_list_idx
  ON academy_invitations (academy_id, status, created_at DESC, id DESC);
CREATE INDEX academy_invitations_pending_email_idx
  ON academy_invitations (normalized_email, expires_at, id)
  WHERE status = 'PENDING';

CREATE TABLE security_audit_events (
  id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  academy_id UUID REFERENCES academies(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  actor_membership_id UUID,
  session_id UUID REFERENCES auth_sessions(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_LOGOUT',
    'AUTH_PASSWORD_CHANGED', 'AUTH_SESSIONS_REVOKED',
    'USER_DISABLED',
    'INVITATION_CREATED', 'INVITATION_ACCEPTED', 'INVITATION_REVOKED',
    'MEMBERSHIP_ROLE_CHANGED', 'MEMBERSHIP_DISABLED', 'MEMBERSHIP_ENABLED',
    'ASSIGNMENT_CREATED', 'ASSIGNMENT_CANCELLED',
    'GUARDIAN_CONSENT_RECORDED', 'GUARDIAN_CONSENT_REVOKED',
    'CROSS_TENANT_ACCESS_DENIED', 'PERMISSION_DENIED'
  )),
  target_type TEXT NOT NULL CHECK (char_length(target_type) BETWEEN 1 AND 100),
  target_id UUID,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILURE')),
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 1 AND 200),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  FOREIGN KEY (actor_membership_id, academy_id)
    REFERENCES academy_memberships(id, academy_id) ON DELETE RESTRICT,
  CHECK ((actor_membership_id IS NULL) OR (academy_id IS NOT NULL))
);

CREATE INDEX security_audit_events_academy_list_idx
  ON security_audit_events (academy_id, occurred_at DESC, id DESC);
CREATE INDEX security_audit_events_actor_idx
  ON security_audit_events (actor_user_id, occurred_at DESC, id DESC);

CREATE FUNCTION reject_security_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_events is append-only';
END;
$$;

CREATE TRIGGER security_audit_events_append_only
BEFORE UPDATE OR DELETE ON security_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_security_audit_mutation();

CREATE TABLE student_access_consent_records (
  id UUID PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  student_profile_id UUID NOT NULL,
  status_change TEXT NOT NULL CHECK (status_change IN ('PENDING', 'GRANTED', 'REVOKED')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_by_membership_id UUID NOT NULL,
  method TEXT NOT NULL CHECK (method = 'ACADEMY_RECORDED'),
  external_reference TEXT CHECK (
    external_reference IS NULL OR char_length(external_reference) BETWEEN 1 AND 500
  ),
  FOREIGN KEY (student_profile_id, academy_id)
    REFERENCES student_profiles(id, academy_id) ON DELETE RESTRICT,
  FOREIGN KEY (recorded_by_membership_id, academy_id)
    REFERENCES academy_memberships(id, academy_id) ON DELETE RESTRICT
);

CREATE INDEX student_access_consent_current_idx
  ON student_access_consent_records (academy_id, student_profile_id, recorded_at DESC, id DESC);

-- Existing Task 011 memberships deliberately remain unclaimed (user_id NULL). Their IDs,
-- StudentProfile links, and assignment actor lineage are preserved until bootstrap/invitation.
-- Authentication and consent state are access-control provenance, never chess evidence.
