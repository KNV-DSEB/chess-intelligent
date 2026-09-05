export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ACADEMY_MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'COACH', 'STUDENT'] as const;
export type AcademyMembershipRoleV1 = (typeof ACADEMY_MEMBERSHIP_ROLES)[number];

export const ACADEMY_MEMBERSHIP_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type AcademyMembershipStatus = (typeof ACADEMY_MEMBERSHIP_STATUSES)[number];

export const ACADEMY_CAPABILITIES = [
  'ACADEMY_MANAGE',
  'MEMBERSHIP_MANAGE',
  'INVITATION_MANAGE',
  'ROSTER_READ',
  'STUDENT_INTELLIGENCE_READ',
  'ASSIGNMENT_READ',
  'ASSIGNMENT_WRITE',
  'CONSENT_MANAGE',
  'AUDIT_READ',
  'STUDENT_SELF_READ',
  'TRAINING_SELF_SUBMIT',
] as const;
export type AcademyCapability = (typeof ACADEMY_CAPABILITIES)[number];

const OWNER_CAPABILITIES = [...ACADEMY_CAPABILITIES] as const;
const ADMIN_CAPABILITIES = [
  'MEMBERSHIP_MANAGE',
  'INVITATION_MANAGE',
  'ROSTER_READ',
  'STUDENT_INTELLIGENCE_READ',
  'ASSIGNMENT_READ',
  'ASSIGNMENT_WRITE',
  'CONSENT_MANAGE',
  'AUDIT_READ',
] as const;
const COACH_CAPABILITIES = [
  'ROSTER_READ',
  'STUDENT_INTELLIGENCE_READ',
  'ASSIGNMENT_READ',
  'ASSIGNMENT_WRITE',
] as const;
const STUDENT_CAPABILITIES = ['STUDENT_SELF_READ', 'TRAINING_SELF_SUBMIT'] as const;

export const ACADEMY_RBAC_V1: Readonly<
  Record<AcademyMembershipRoleV1, readonly AcademyCapability[]>
> = {
  OWNER: OWNER_CAPABILITIES,
  ADMIN: ADMIN_CAPABILITIES,
  COACH: COACH_CAPABILITIES,
  STUDENT: STUDENT_CAPABILITIES,
};

export const PASSWORD_POLICY_V1 = {
  version: 'PASSWORD_POLICY_V1',
  minimumLength: 12,
  maximumLength: 256,
} as const;

export const SESSION_POLICY_V1 = {
  version: 'SESSION_POLICY_V1',
  absoluteLifetimeSeconds: 7 * 24 * 60 * 60,
  developmentCookieName: 'chess_session',
  productionCookieName: '__Host-chess_session',
  sameSite: 'lax',
  path: '/',
} as const;

export const AUTH_RATE_LIMIT_V1 = {
  version: 'AUTH_RATE_LIMIT_V1',
  maximumFailures: 5,
  windowSeconds: 15 * 60,
} as const;

export const ACADEMY_INVITATION_POLICY_V1 = {
  version: 'ACADEMY_INVITATION_POLICY_V1',
  lifetimeSeconds: 7 * 24 * 60 * 60,
} as const;

export const PASSWORD_RESET_POLICY_V1 = {
  version: 'PASSWORD_RESET_POLICY_V1',
  lifetimeSeconds: 60 * 60,
  maximumRequests: 3,
  requestWindowSeconds: 60 * 60,
} as const;

export const CSRF_ORIGIN_POLICY_V1 = {
  version: 'CSRF_ORIGIN_POLICY_V1',
  safeMethods: ['GET', 'HEAD', 'OPTIONS'],
} as const;

export const STUDENT_ACCESS_CONSENT_STATUSES = [
  'NOT_REQUIRED',
  'PENDING',
  'GRANTED',
  'REVOKED',
] as const;
export type StudentAccessConsentStatus = (typeof STUDENT_ACCESS_CONSENT_STATUSES)[number];

export const SECURITY_AUDIT_ACTIONS = [
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILURE',
  'AUTH_LOGOUT',
  'AUTH_PASSWORD_CHANGED',
  'AUTH_SESSIONS_REVOKED',
  'USER_DISABLED',
  'INVITATION_CREATED',
  'INVITATION_ACCEPTED',
  'INVITATION_REVOKED',
  'INVITATION_DELIVERY_REQUESTED',
  'INVITATION_DELIVERY_SUCCEEDED',
  'INVITATION_DELIVERY_FAILED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_DELIVERY_SUCCEEDED',
  'PASSWORD_RESET_DELIVERY_FAILED',
  'PASSWORD_RESET_COMPLETED',
  'MEMBERSHIP_ROLE_CHANGED',
  'MEMBERSHIP_DISABLED',
  'MEMBERSHIP_ENABLED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_CANCELLED',
  'GUARDIAN_CONSENT_RECORDED',
  'GUARDIAN_CONSENT_REVOKED',
  'CROSS_TENANT_ACCESS_DENIED',
  'PERMISSION_DENIED',
] as const;
export type SecurityAuditAction = (typeof SECURITY_AUDIT_ACTIONS)[number];

export type SecurityAuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}

export function validatePassword(password: string): {
  valid: boolean;
  reasons: Array<'TOO_SHORT' | 'TOO_LONG'>;
} {
  const length = [...password].length;
  const reasons: Array<'TOO_SHORT' | 'TOO_LONG'> = [];
  if (length < PASSWORD_POLICY_V1.minimumLength) reasons.push('TOO_SHORT');
  if (length > PASSWORD_POLICY_V1.maximumLength) reasons.push('TOO_LONG');
  return { valid: reasons.length === 0, reasons };
}

export function hasAcademyCapability(
  role: AcademyMembershipRoleV1,
  capability: AcademyCapability,
): boolean {
  return ACADEMY_RBAC_V1[role].includes(capability);
}

export function canManageMembershipRole(
  actorRole: AcademyMembershipRoleV1,
  targetCurrentRole: AcademyMembershipRoleV1,
  targetNextRole: AcademyMembershipRoleV1,
): boolean {
  if (!hasAcademyCapability(actorRole, 'MEMBERSHIP_MANAGE')) return false;
  if (actorRole === 'OWNER') return true;
  return targetCurrentRole !== 'OWNER' && targetNextRole !== 'OWNER';
}

export function loginRateLimitState(
  failedAttemptDates: readonly Date[],
  now: Date,
): { throttled: boolean; retryAfterSeconds: number } {
  const windowStart = now.getTime() - AUTH_RATE_LIMIT_V1.windowSeconds * 1000;
  const recent = failedAttemptDates
    .map((date) => date.getTime())
    .filter((timestamp) => timestamp >= windowStart && timestamp <= now.getTime())
    .sort((left, right) => left - right);
  if (recent.length < AUTH_RATE_LIMIT_V1.maximumFailures) {
    return { throttled: false, retryAfterSeconds: 0 };
  }
  const retryAt =
    recent.at(-AUTH_RATE_LIMIT_V1.maximumFailures)! + AUTH_RATE_LIMIT_V1.windowSeconds * 1000;
  return {
    throttled: retryAt > now.getTime(),
    retryAfterSeconds: Math.max(0, Math.ceil((retryAt - now.getTime()) / 1000)),
  };
}

export function invitationExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ACADEMY_INVITATION_POLICY_V1.lifetimeSeconds * 1000);
}

export function passwordResetExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PASSWORD_RESET_POLICY_V1.lifetimeSeconds * 1000);
}

export function passwordResetRateLimitState(
  requestDates: readonly Date[],
  now: Date,
): { throttled: boolean; retryAfterSeconds: number } {
  const windowStart = now.getTime() - PASSWORD_RESET_POLICY_V1.requestWindowSeconds * 1000;
  const recent = requestDates
    .map((date) => date.getTime())
    .filter((timestamp) => timestamp >= windowStart && timestamp <= now.getTime())
    .sort((left, right) => left - right);
  if (recent.length < PASSWORD_RESET_POLICY_V1.maximumRequests) {
    return { throttled: false, retryAfterSeconds: 0 };
  }
  const retryAt =
    recent.at(-PASSWORD_RESET_POLICY_V1.maximumRequests)! +
    PASSWORD_RESET_POLICY_V1.requestWindowSeconds * 1000;
  return {
    throttled: retryAt > now.getTime(),
    retryAfterSeconds: Math.max(0, Math.ceil((retryAt - now.getTime()) / 1000)),
  };
}

export function isAllowedMutationOrigin(input: {
  method: string;
  origin: string | undefined;
  allowedOrigins: readonly string[];
  hasSessionCookie: boolean;
}): boolean {
  if (CSRF_ORIGIN_POLICY_V1.safeMethods.some((method) => method === input.method.toUpperCase())) {
    return true;
  }
  if (!input.origin) return !input.hasSessionCookie;
  return input.allowedOrigins.includes(input.origin);
}

export function deriveStudentAccessConsentStatus(
  requiresGuardianConsent: boolean,
  latestRecordedStatus: 'PENDING' | 'GRANTED' | 'REVOKED' | null,
): StudentAccessConsentStatus {
  if (!requiresGuardianConsent) return 'NOT_REQUIRED';
  return latestRecordedStatus ?? 'PENDING';
}

export function studentSelfServiceAllowed(status: StudentAccessConsentStatus): boolean {
  return status === 'NOT_REQUIRED' || status === 'GRANTED';
}

const SECRET_METADATA_KEY =
  /(password|credential|authorization|cookie|session.*token|invitation.*token|token.*hash|secret)/iu;

export function assertSafeAuditMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const inspect = (value: unknown, path: string): void => {
    if (typeof value === 'string' && value.length > 500) {
      throw new Error(`Audit metadata string is too long at ${path}.`);
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => inspect(entry, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (SECRET_METADATA_KEY.test(key)) {
          throw new Error(`Secret-bearing audit metadata key is forbidden at ${path}.${key}.`);
        }
        inspect(entry, `${path}.${key}`);
      }
    }
  };
  inspect(metadata, 'metadata');
  if (JSON.stringify(metadata).length > 4096) throw new Error('Audit metadata is too large.');
  return metadata;
}
