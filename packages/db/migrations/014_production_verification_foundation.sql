ALTER TABLE academy_invitations
  ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED'
    CHECK (delivery_status IN ('NOT_REQUESTED', 'REQUESTED', 'DELIVERED', 'FAILED')),
  ADD COLUMN delivery_requested_at TIMESTAMPTZ,
  ADD COLUMN delivered_at TIMESTAMPTZ,
  ADD COLUMN delivery_failed_at TIMESTAMPTZ,
  ADD CONSTRAINT academy_invitations_delivery_times_check CHECK (
    (delivery_status = 'NOT_REQUESTED' AND delivery_requested_at IS NULL AND delivered_at IS NULL AND delivery_failed_at IS NULL)
    OR (delivery_status = 'REQUESTED' AND delivery_requested_at IS NOT NULL AND delivered_at IS NULL AND delivery_failed_at IS NULL)
    OR (delivery_status = 'DELIVERED' AND delivery_requested_at IS NOT NULL AND delivered_at IS NOT NULL AND delivery_failed_at IS NULL)
    OR (delivery_status = 'FAILED' AND delivery_requested_at IS NOT NULL AND delivered_at IS NULL AND delivery_failed_at IS NOT NULL)
  );

CREATE TABLE password_reset_requests (
  id UUID PRIMARY KEY,
  identifier_sha256 CHAR(64) NOT NULL CHECK (identifier_sha256 ~ '^[a-f0-9]{64}$'),
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('NOT_APPLICABLE', 'REQUESTED', 'DELIVERED', 'FAILED')),
  delivery_attempted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_failed_at TIMESTAMPTZ,
  CHECK (
    (delivery_status = 'NOT_APPLICABLE' AND user_id IS NULL AND delivery_attempted_at IS NULL AND delivered_at IS NULL AND delivery_failed_at IS NULL)
    OR (delivery_status = 'REQUESTED' AND user_id IS NOT NULL AND delivery_attempted_at IS NOT NULL AND delivered_at IS NULL AND delivery_failed_at IS NULL)
    OR (delivery_status = 'DELIVERED' AND user_id IS NOT NULL AND delivery_attempted_at IS NOT NULL AND delivered_at IS NOT NULL AND delivery_failed_at IS NULL)
    OR (delivery_status = 'FAILED' AND user_id IS NOT NULL AND delivery_attempted_at IS NOT NULL AND delivered_at IS NULL AND delivery_failed_at IS NOT NULL)
  )
);

CREATE INDEX password_reset_requests_throttle_idx
  ON password_reset_requests (identifier_sha256, requested_at DESC);
CREATE INDEX password_reset_requests_user_idx
  ON password_reset_requests (user_id, requested_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE REFERENCES password_reset_requests(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX password_reset_tokens_active_lookup_idx
  ON password_reset_tokens (token_hash, expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX password_reset_tokens_active_user_idx
  ON password_reset_tokens (user_id, expires_at DESC)
  WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE security_audit_events
  DROP CONSTRAINT security_audit_events_action_check,
  ADD CONSTRAINT security_audit_events_action_check CHECK (action IN (
    'AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_LOGOUT',
    'AUTH_PASSWORD_CHANGED', 'AUTH_SESSIONS_REVOKED',
    'USER_DISABLED',
    'INVITATION_CREATED', 'INVITATION_ACCEPTED', 'INVITATION_REVOKED',
    'INVITATION_DELIVERY_REQUESTED', 'INVITATION_DELIVERY_SUCCEEDED',
    'INVITATION_DELIVERY_FAILED',
    'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_DELIVERY_SUCCEEDED',
    'PASSWORD_RESET_DELIVERY_FAILED', 'PASSWORD_RESET_COMPLETED',
    'MEMBERSHIP_ROLE_CHANGED', 'MEMBERSHIP_DISABLED', 'MEMBERSHIP_ENABLED',
    'ASSIGNMENT_CREATED', 'ASSIGNMENT_CANCELLED',
    'GUARDIAN_CONSENT_RECORDED', 'GUARDIAN_CONSENT_REVOKED',
    'CROSS_TENANT_ACCESS_DENIED', 'PERMISSION_DENIED'
  ));

-- Raw invitation/reset/session tokens remain request-local secrets. Only SHA-256
-- digests and non-secret delivery state are persisted.
