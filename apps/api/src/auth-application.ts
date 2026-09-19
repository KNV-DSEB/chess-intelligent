import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  AuthRepositoryError,
  type AuthenticatedPrincipalRecord,
  type AuthRepository,
  type CurrentUserRecord,
} from '@chess-intelligent/db';
import {
  AUTH_RATE_LIMIT_V1,
  PASSWORD_POLICY_V1,
  SESSION_POLICY_V1,
  SIGNUP_RATE_LIMIT_V1,
  loginRateLimitState,
  normalizeEmail,
  signupRateLimitState,
  validatePassword,
} from '@chess-intelligent/domain';

import type { PasswordHasher } from './password-hasher';

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  expiresAt: string;
}

export interface OpaqueToken {
  raw: string;
  sha256: string;
}

export interface OpaqueTokenFactory {
  create(): OpaqueToken;
  hash(raw: string): string;
}

export class CryptoOpaqueTokenFactory implements OpaqueTokenFactory {
  create(): OpaqueToken {
    const raw = randomBytes(32).toString('base64url');
    return { raw, sha256: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }
}

export type AuthApplicationErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'PASSWORD_POLICY_VIOLATION'
  | 'CURRENT_PASSWORD_INVALID'
  | 'USER_NOT_FOUND';

export class AuthApplicationError extends Error {
  constructor(
    readonly code: AuthApplicationErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AuthApplicationError';
  }
}

export interface LoginResult {
  user: CurrentUserRecord;
  session: { id: string; expiresAt: string };
  rawSessionToken: string;
}

export class AuthApplicationService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: OpaqueTokenFactory = new CryptoOpaqueTokenFactory(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async signup(input: {
    email: string;
    displayName: string;
    password: string;
    networkIdentifier: string;
    userAgent?: string | null | undefined;
    requestId?: string | null | undefined;
  }): Promise<LoginResult> {
    const now = this.now();
    const normalizedEmail = normalizeEmail(input.email);
    const emailIdentifierSha256 = this.tokens.hash(`signup-email:${normalizedEmail}`);
    const networkIdentifierSha256 = this.tokens.hash(`signup-network:${input.networkIdentifier}`);
    const since = new Date(now.getTime() - SIGNUP_RATE_LIMIT_V1.windowSeconds * 1000);
    const [emailFailures, networkFailures] = await Promise.all([
      this.repository.getRecentFailedSignupDates({
        identifierSha256: emailIdentifierSha256,
        kind: 'EMAIL',
        since,
      }),
      this.repository.getRecentFailedSignupDates({
        identifierSha256: networkIdentifierSha256,
        kind: 'NETWORK',
        since,
      }),
    ]);
    const emailRate = signupRateLimitState(
      emailFailures,
      SIGNUP_RATE_LIMIT_V1.maximumEmailFailures,
      now,
    );
    const networkRate = signupRateLimitState(
      networkFailures,
      SIGNUP_RATE_LIMIT_V1.maximumNetworkFailures,
      now,
    );
    const rate = emailRate.throttled ? emailRate : networkRate;
    if (rate.throttled) {
      await this.repository.recordSignupFailure({
        emailIdentifierSha256,
        networkIdentifierSha256,
        reason: 'RATE_LIMITED',
        now,
        requestId: input.requestId,
      });
      throw new AuthApplicationError(
        'RATE_LIMITED',
        'Too many sign-up attempts. Try again later.',
        rate.retryAfterSeconds,
      );
    }
    const policy = validatePassword(input.password);
    if (!policy.valid) {
      throw new AuthApplicationError(
        'PASSWORD_POLICY_VIOLATION',
        `The password must contain ${PASSWORD_POLICY_V1.minimumLength} to ${PASSWORD_POLICY_V1.maximumLength} characters.`,
      );
    }
    if (await this.repository.getLoginAccount(normalizedEmail)) {
      await this.repository.recordSignupFailure({
        emailIdentifierSha256,
        networkIdentifierSha256,
        reason: 'DUPLICATE_EMAIL',
        now,
        requestId: input.requestId,
      });
      throw new AuthApplicationError(
        'EMAIL_ALREADY_REGISTERED',
        'An account already exists for this email address.',
      );
    }
    const passwordHash = await this.passwords.hashPassword(input.password);
    const token = this.tokens.create();
    const sessionId = randomUUID();
    const expiresAt = new Date(now.getTime() + SESSION_POLICY_V1.absoluteLifetimeSeconds * 1000);
    let userId: string;
    try {
      userId = await this.repository.completeSignup({
        email: input.email,
        normalizedEmail,
        displayName: input.displayName,
        passwordHash,
        emailIdentifierSha256,
        networkIdentifierSha256,
        sessionId,
        tokenHash: token.sha256,
        expiresAt,
        userAgent: input.userAgent,
        now,
        requestId: input.requestId,
      });
    } catch (error) {
      if (error instanceof AuthRepositoryError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        await this.repository.recordSignupFailure({
          emailIdentifierSha256,
          networkIdentifierSha256,
          reason: 'DUPLICATE_EMAIL',
          now,
          requestId: input.requestId,
        });
        throw new AuthApplicationError('EMAIL_ALREADY_REGISTERED', error.message);
      }
      throw error;
    }
    const user = await this.repository.getCurrentUser(userId);
    if (!user) throw new AuthApplicationError('USER_NOT_FOUND', 'The new User is missing.');
    return {
      user,
      session: { id: sessionId, expiresAt: expiresAt.toISOString() },
      rawSessionToken: token.raw,
    };
  }

  async login(input: {
    email: string;
    password: string;
    userAgent?: string | null | undefined;
    requestId?: string | null | undefined;
  }): Promise<LoginResult> {
    const now = this.now();
    const normalizedEmail = normalizeEmail(input.email);
    const identifierSha256 = this.tokens.hash(`login:${normalizedEmail}`);
    const since = new Date(now.getTime() - AUTH_RATE_LIMIT_V1.windowSeconds * 1000);
    const rate = loginRateLimitState(
      await this.repository.getRecentFailedAttemptDates(identifierSha256, since),
      now,
    );
    if (rate.throttled) {
      throw new AuthApplicationError(
        'RATE_LIMITED',
        'Too many failed login attempts. Try again later.',
        rate.retryAfterSeconds,
      );
    }
    const account = await this.repository.getLoginAccount(normalizedEmail);
    const passwordMatches = account
      ? await this.passwords.verifyPassword(account.passwordHash, input.password)
      : (await this.passwords.verifyUnknownUser(input.password), false);
    if (!account || !passwordMatches || account.status !== 'ACTIVE') {
      await this.repository.recordLoginFailure({
        identifierSha256,
        now,
        requestId: input.requestId,
      });
      throw new AuthApplicationError('INVALID_CREDENTIALS', 'The email or password is invalid.');
    }
    const token = this.tokens.create();
    const sessionId = randomUUID();
    const expiresAt = new Date(now.getTime() + SESSION_POLICY_V1.absoluteLifetimeSeconds * 1000);
    await this.repository.completeLogin({
      userId: account.userId,
      identifierSha256,
      sessionId,
      tokenHash: token.sha256,
      expiresAt,
      userAgent: input.userAgent,
      now,
      requestId: input.requestId,
    });
    const user = await this.repository.getCurrentUser(account.userId);
    if (!user)
      throw new AuthApplicationError('USER_NOT_FOUND', 'The authenticated User is missing.');
    return {
      user,
      session: { id: sessionId, expiresAt: expiresAt.toISOString() },
      rawSessionToken: token.raw,
    };
  }

  async authenticate(rawSessionToken: string | undefined): Promise<AuthenticatedPrincipal | null> {
    if (!rawSessionToken) return null;
    const principal = await this.repository.authenticateSession(
      this.tokens.hash(rawSessionToken),
      this.now(),
    );
    return principal ? this.principal(principal) : null;
  }

  async requireAuthentication(
    rawSessionToken: string | undefined,
  ): Promise<AuthenticatedPrincipal> {
    const principal = await this.authenticate(rawSessionToken);
    if (!principal) {
      throw new AuthApplicationError(
        'AUTHENTICATION_REQUIRED',
        'A valid authenticated session is required.',
      );
    }
    return principal;
  }

  async me(principal: AuthenticatedPrincipal): Promise<CurrentUserRecord> {
    const user = await this.repository.getCurrentUser(principal.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthApplicationError(
        'AUTHENTICATION_REQUIRED',
        'The authenticated User is no longer active.',
      );
    }
    return user;
  }

  async logout(principal: AuthenticatedPrincipal | null, requestId?: string | null): Promise<void> {
    if (!principal) return;
    await this.repository.revokeSession({
      sessionId: principal.sessionId,
      userId: principal.userId,
      now: this.now(),
      requestId,
    });
  }

  async changePassword(input: {
    principal: AuthenticatedPrincipal;
    currentPassword: string;
    newPassword: string;
    userAgent?: string | null | undefined;
    requestId?: string | null | undefined;
  }): Promise<{ rawSessionToken: string; session: { id: string; expiresAt: string } }> {
    const policy = validatePassword(input.newPassword);
    if (!policy.valid) {
      throw new AuthApplicationError(
        'PASSWORD_POLICY_VIOLATION',
        `The new password must contain ${PASSWORD_POLICY_V1.minimumLength} to ${PASSWORD_POLICY_V1.maximumLength} characters.`,
      );
    }
    const user = await this.me(input.principal);
    const account = await this.repository.getLoginAccount(user.normalizedEmail);
    if (
      !account ||
      !(await this.passwords.verifyPassword(account.passwordHash, input.currentPassword))
    ) {
      throw new AuthApplicationError(
        'CURRENT_PASSWORD_INVALID',
        'The current password is invalid.',
      );
    }
    const passwordHash = await this.passwords.hashPassword(input.newPassword);
    const now = this.now();
    const token = this.tokens.create();
    const sessionId = randomUUID();
    const expiresAt = new Date(now.getTime() + SESSION_POLICY_V1.absoluteLifetimeSeconds * 1000);
    await this.repository.changePassword({
      userId: input.principal.userId,
      currentSessionId: input.principal.sessionId,
      passwordHash,
      replacementSessionId: sessionId,
      replacementTokenHash: token.sha256,
      replacementExpiresAt: expiresAt,
      userAgent: input.userAgent,
      now,
      requestId: input.requestId,
    });
    return {
      rawSessionToken: token.raw,
      session: { id: sessionId, expiresAt: expiresAt.toISOString() },
    };
  }

  async revokeAllSessions(
    principal: AuthenticatedPrincipal,
    requestId?: string | null,
  ): Promise<void> {
    await this.repository.revokeAllSessions({
      userId: principal.userId,
      actorSessionId: principal.sessionId,
      now: this.now(),
      requestId,
    });
  }

  async disableOwnUser(input: {
    principal: AuthenticatedPrincipal;
    currentPassword: string;
    requestId?: string | null | undefined;
  }): Promise<void> {
    const user = await this.me(input.principal);
    const account = await this.repository.getLoginAccount(user.normalizedEmail);
    if (
      !account ||
      !(await this.passwords.verifyPassword(account.passwordHash, input.currentPassword))
    ) {
      throw new AuthApplicationError(
        'CURRENT_PASSWORD_INVALID',
        'The current password is invalid.',
      );
    }
    await this.repository.disableUser({
      userId: input.principal.userId,
      actorSessionId: input.principal.sessionId,
      now: this.now(),
      requestId: input.requestId,
    });
  }

  async hashNewPassword(password: string): Promise<string> {
    const policy = validatePassword(password);
    if (!policy.valid) {
      throw new AuthApplicationError(
        'PASSWORD_POLICY_VIOLATION',
        'The password does not satisfy PASSWORD_POLICY_V1.',
      );
    }
    return this.passwords.hashPassword(password);
  }

  createInvitationToken(): OpaqueToken {
    return this.tokens.create();
  }

  hashOpaqueToken(raw: string): string {
    return this.tokens.hash(raw);
  }

  private principal(record: AuthenticatedPrincipalRecord): AuthenticatedPrincipal {
    return {
      userId: record.userId,
      sessionId: record.sessionId,
      expiresAt: record.expiresAt,
    };
  }
}
