import { describe, expect, it } from 'vitest';

import {
  ACADEMY_CAPABILITIES,
  ACADEMY_RBAC_V1,
  AUTH_RATE_LIMIT_V1,
  PASSWORD_POLICY_V1,
  PASSWORD_RESET_POLICY_V1,
  SIGNUP_RATE_LIMIT_V1,
  assertSafeAuditMetadata,
  canManageMembershipRole,
  deriveStudentAccessConsentStatus,
  hasAcademyCapability,
  invitationExpiresAt,
  isAllowedMutationOrigin,
  loginRateLimitState,
  normalizeEmail,
  passwordResetExpiresAt,
  passwordResetRateLimitState,
  signupRateLimitState,
  studentSelfServiceAllowed,
  validatePassword,
} from './academy-security';

describe('Task 012 Academy security policies', () => {
  it('normalizes email without provider-specific rewriting', () => {
    expect(normalizeEmail('  First.Last+Chess@Example.COM ')).toBe('first.last+chess@example.com');
  });

  it('enforces a length-only passphrase policy', () => {
    expect(validatePassword('short')).toEqual({ valid: false, reasons: ['TOO_SHORT'] });
    expect(validatePassword('a long chess passphrase')).toEqual({ valid: true, reasons: [] });
    expect(validatePassword('x'.repeat(PASSWORD_POLICY_V1.maximumLength + 1))).toEqual({
      valid: false,
      reasons: ['TOO_LONG'],
    });
  });

  it('defines the complete role/capability matrix', () => {
    for (const capability of ACADEMY_CAPABILITIES) {
      expect(hasAcademyCapability('OWNER', capability)).toBe(true);
      expect(hasAcademyCapability('ADMIN', capability)).toBe(
        ACADEMY_RBAC_V1.ADMIN.includes(capability),
      );
      expect(hasAcademyCapability('COACH', capability)).toBe(
        ACADEMY_RBAC_V1.COACH.includes(capability),
      );
      expect(hasAcademyCapability('STUDENT', capability)).toBe(
        ACADEMY_RBAC_V1.STUDENT.includes(capability),
      );
    }
  });

  it('prevents Admin from managing OWNER lifecycle', () => {
    expect(canManageMembershipRole('ADMIN', 'OWNER', 'ADMIN')).toBe(false);
    expect(canManageMembershipRole('ADMIN', 'COACH', 'OWNER')).toBe(false);
    expect(canManageMembershipRole('ADMIN', 'COACH', 'ADMIN')).toBe(true);
    expect(canManageMembershipRole('OWNER', 'OWNER', 'ADMIN')).toBe(true);
  });

  it('throttles exactly at five recent failures and expires the window', () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    const failures = Array.from(
      { length: AUTH_RATE_LIMIT_V1.maximumFailures },
      (_, index) => new Date(now.getTime() - index * 1_000),
    );
    expect(loginRateLimitState(failures.slice(0, 4), now).throttled).toBe(false);
    expect(loginRateLimitState(failures, now).throttled).toBe(true);
    expect(
      loginRateLimitState(
        failures.map(
          (date) => new Date(date.getTime() - AUTH_RATE_LIMIT_V1.windowSeconds * 1000 - 1),
        ),
        now,
      ).throttled,
    ).toBe(false);
  });

  it('keeps public signup email and network throttles explicit', () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    const failures = Array.from(
      { length: SIGNUP_RATE_LIMIT_V1.maximumNetworkFailures },
      (_, index) => new Date(now.getTime() - index * 1_000),
    );
    expect(
      signupRateLimitState(
        failures.slice(0, SIGNUP_RATE_LIMIT_V1.maximumEmailFailures - 1),
        SIGNUP_RATE_LIMIT_V1.maximumEmailFailures,
        now,
      ).throttled,
    ).toBe(false);
    expect(
      signupRateLimitState(
        failures.slice(0, SIGNUP_RATE_LIMIT_V1.maximumEmailFailures),
        SIGNUP_RATE_LIMIT_V1.maximumEmailFailures,
        now,
      ).throttled,
    ).toBe(true);
    expect(
      signupRateLimitState(failures, SIGNUP_RATE_LIMIT_V1.maximumNetworkFailures, now).throttled,
    ).toBe(true);
  });

  it('derives deterministic seven-day invitation expiry', () => {
    expect(invitationExpiresAt(new Date('2026-08-28T12:00:00.000Z')).toISOString()).toBe(
      '2026-09-04T12:00:00.000Z',
    );
  });

  it('uses a centralized one-hour single-use password reset policy and request throttle', () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    expect(passwordResetExpiresAt(now).toISOString()).toBe('2026-08-28T13:00:00.000Z');
    const requests = Array.from(
      { length: PASSWORD_RESET_POLICY_V1.maximumRequests },
      (_, index) => new Date(now.getTime() - index * 1_000),
    );
    expect(passwordResetRateLimitState(requests.slice(0, 2), now).throttled).toBe(false);
    expect(passwordResetRateLimitState(requests, now).throttled).toBe(true);
  });

  it('enforces allowed Origin for cookie-authenticated mutations', () => {
    const allowedOrigins = ['https://academy.example'];
    expect(
      isAllowedMutationOrigin({
        method: 'POST',
        origin: 'https://academy.example',
        allowedOrigins,
        hasSessionCookie: true,
      }),
    ).toBe(true);
    expect(
      isAllowedMutationOrigin({
        method: 'POST',
        origin: 'https://evil.example',
        allowedOrigins,
        hasSessionCookie: true,
      }),
    ).toBe(false);
    expect(
      isAllowedMutationOrigin({
        method: 'POST',
        origin: undefined,
        allowedOrigins,
        hasSessionCookie: false,
      }),
    ).toBe(true);
  });

  it('treats Academy-recorded consent as an access state, not a legal claim', () => {
    expect(deriveStudentAccessConsentStatus(false, null)).toBe('NOT_REQUIRED');
    expect(deriveStudentAccessConsentStatus(true, null)).toBe('PENDING');
    expect(deriveStudentAccessConsentStatus(true, 'GRANTED')).toBe('GRANTED');
    expect(deriveStudentAccessConsentStatus(true, 'REVOKED')).toBe('REVOKED');
    expect(studentSelfServiceAllowed('PENDING')).toBe(false);
    expect(studentSelfServiceAllowed('GRANTED')).toBe(true);
  });

  it('rejects secret-bearing audit metadata', () => {
    expect(assertSafeAuditMetadata({ membershipId: 'm1', role: 'COACH' })).toEqual({
      membershipId: 'm1',
      role: 'COACH',
    });
    expect(() => assertSafeAuditMetadata({ password: 'do-not-log' })).toThrow(/forbidden/u);
    expect(() => assertSafeAuditMetadata({ nested: { invitationTokenHash: 'x' } })).toThrow(
      /forbidden/u,
    );
  });
});
