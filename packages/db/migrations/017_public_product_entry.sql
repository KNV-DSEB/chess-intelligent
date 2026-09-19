CREATE TABLE auth_signup_attempts (
  id UUID PRIMARY KEY,
  email_identifier_sha256 CHAR(64) NOT NULL CHECK (email_identifier_sha256 ~ '^[a-f0-9]{64}$'),
  network_identifier_sha256 CHAR(64) NOT NULL CHECK (network_identifier_sha256 ~ '^[a-f0-9]{64}$'),
  success BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_signup_attempts_email_throttle_idx
  ON auth_signup_attempts (email_identifier_sha256, attempted_at DESC)
  WHERE success = false;

CREATE INDEX auth_signup_attempts_network_throttle_idx
  ON auth_signup_attempts (network_identifier_sha256, attempted_at DESC)
  WHERE success = false;

ALTER TABLE security_audit_events
  DROP CONSTRAINT security_audit_events_action_check,
  ADD CONSTRAINT security_audit_events_action_check CHECK (action IN (
    'AUTH_SIGNUP_SUCCESS', 'AUTH_SIGNUP_FAILURE',
    'AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_LOGOUT',
    'AUTH_PASSWORD_CHANGED', 'AUTH_SESSIONS_REVOKED',
    'USER_DISABLED', 'ACADEMY_CREATED',
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

-- Public product entry creates only account/session state. Academy ownership is
-- created later through the explicit authenticated onboarding transaction.
