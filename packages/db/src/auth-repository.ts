import { randomUUID } from 'node:crypto';

import type {
  AcademyMembershipRoleV1,
  AcademyMembershipStatus,
  StudentAccessConsentStatus,
  UserStatus,
} from '@chess-intelligent/domain';

import type { Database } from './database';
import { appendSecurityAuditEvent } from './security-audit-repository';

export interface LoginAccountRecord {
  userId: string;
  email: string;
  normalizedEmail: string;
  displayName: string | null;
  status: UserStatus;
  passwordHash: string;
  passwordAlgorithm: 'ARGON2ID_V1';
}

export interface AuthenticatedPrincipalRecord {
  userId: string;
  sessionId: string;
  expiresAt: string;
}

export interface CurrentUserMembershipRecord {
  id: string;
  academyId: string;
  academyName: string;
  role: AcademyMembershipRoleV1;
  status: AcademyMembershipStatus;
  studentProfileId: string | null;
  playerId: string | null;
  requiresGuardianConsent: boolean | null;
  consentStatus: StudentAccessConsentStatus | null;
}

export interface CurrentUserRecord {
  id: string;
  email: string;
  normalizedEmail: string;
  displayName: string | null;
  status: UserStatus;
  memberships: CurrentUserMembershipRecord[];
}

interface AccountRow {
  user_id: string;
  email: string;
  normalized_email: string;
  display_name: string | null;
  status: UserStatus;
  password_hash: string;
  password_algorithm: 'ARGON2ID_V1';
}

interface MembershipRow {
  id: string;
  academy_id: string;
  academy_name: string;
  role: AcademyMembershipRoleV1;
  status: AcademyMembershipStatus;
  student_profile_id: string | null;
  player_id: string | null;
  requires_guardian_consent: boolean | null;
  consent_status: 'PENDING' | 'GRANTED' | 'REVOKED' | null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class AuthRepositoryError extends Error {
  constructor(
    readonly code:
      | 'BOOTSTRAP_ACADEMY_NOT_FOUND'
      | 'BOOTSTRAP_USER_CONFLICT'
      | 'BOOTSTRAP_MEMBERSHIP_CONFLICT'
      | 'USER_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AuthRepositoryError';
  }
}

export class AuthRepository {
  constructor(private readonly database: Database) {}

  async getLoginAccount(normalizedEmail: string): Promise<LoginAccountRecord | null> {
    const result = await this.database.query<AccountRow>(
      `SELECT account.id AS user_id, account.email, account.normalized_email, account.display_name,
              account.status, credential.password_hash, credential.password_algorithm
       FROM users account
       JOIN user_credentials credential ON credential.user_id = account.id
       WHERE account.normalized_email = $1`,
      [normalizedEmail],
    );
    const row = result.rows[0];
    return row
      ? {
          userId: row.user_id,
          email: row.email,
          normalizedEmail: row.normalized_email,
          displayName: row.display_name,
          status: row.status,
          passwordHash: row.password_hash,
          passwordAlgorithm: row.password_algorithm,
        }
      : null;
  }

  async getRecentFailedAttemptDates(identifierSha256: string, since: Date): Promise<Date[]> {
    const result = await this.database.query<{ attempted_at: string | Date }>(
      `SELECT attempted_at FROM auth_login_attempts
       WHERE identifier_sha256 = $1 AND success = false AND attempted_at >= $2
       ORDER BY attempted_at`,
      [identifierSha256, since.toISOString()],
    );
    return result.rows.map((row) => new Date(row.attempted_at));
  }

  async recordLoginFailure(input: {
    identifierSha256: string;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO auth_login_attempts (id, identifier_sha256, success, attempted_at)
         VALUES ($1, $2, false, $3)`,
        [randomUUID(), input.identifierSha256, input.now.toISOString()],
      );
      await appendSecurityAuditEvent(client, {
        action: 'AUTH_LOGIN_FAILURE',
        targetType: 'AUTH_IDENTIFIER',
        outcome: 'FAILURE',
        requestId: input.requestId,
        occurredAt: input.now,
        metadata: { identifierSha256Prefix: input.identifierSha256.slice(0, 12) },
      });
    });
  }

  async completeLogin(input: {
    userId: string;
    identifierSha256: string;
    sessionId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null | undefined;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO auth_login_attempts (id, identifier_sha256, success, attempted_at)
         VALUES ($1, $2, true, $3)`,
        [randomUUID(), input.identifierSha256, input.now.toISOString()],
      );
      await client.query(
        `INSERT INTO auth_sessions (
           id, user_id, token_hash, created_at, expires_at, created_user_agent
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.sessionId,
          input.userId,
          input.tokenHash,
          input.now.toISOString(),
          input.expiresAt.toISOString(),
          input.userAgent?.slice(0, 500) ?? null,
        ],
      );
      await appendSecurityAuditEvent(client, {
        actorUserId: input.userId,
        sessionId: input.sessionId,
        action: 'AUTH_LOGIN_SUCCESS',
        targetType: 'USER',
        targetId: input.userId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
      });
    });
  }

  async authenticateSession(
    tokenHash: string,
    now: Date,
  ): Promise<AuthenticatedPrincipalRecord | null> {
    const result = await this.database.query<{
      session_id: string;
      user_id: string;
      expires_at: string | Date;
    }>(
      `SELECT session.id AS session_id, session.user_id, session.expires_at
       FROM auth_sessions session
       JOIN users account ON account.id = session.user_id
       WHERE session.token_hash = $1 AND session.revoked_at IS NULL
         AND session.expires_at > $2 AND account.status = 'ACTIVE'`,
      [tokenHash, now.toISOString()],
    );
    const row = result.rows[0];
    return row
      ? { userId: row.user_id, sessionId: row.session_id, expiresAt: iso(row.expires_at) }
      : null;
  }

  async getCurrentUser(userId: string): Promise<CurrentUserRecord | null> {
    const user = await this.database.query<{
      id: string;
      email: string;
      normalized_email: string;
      display_name: string | null;
      status: UserStatus;
    }>(`SELECT id, email, normalized_email, display_name, status FROM users WHERE id = $1`, [
      userId,
    ]);
    if (!user.rows[0]) return null;
    const memberships = await this.database.query<MembershipRow>(
      `SELECT membership.id, membership.academy_id, academy.name AS academy_name,
              membership.role, membership.status, student.id AS student_profile_id,
              student.player_id, student.requires_guardian_consent,
              consent.status_change AS consent_status
       FROM academy_memberships membership
       JOIN academies academy ON academy.id = membership.academy_id
       LEFT JOIN student_profiles student
         ON student.academy_membership_id = membership.id AND membership.role = 'STUDENT'
       LEFT JOIN LATERAL (
         SELECT record.status_change
         FROM student_access_consent_records record
         WHERE record.academy_id = membership.academy_id
           AND record.student_profile_id = student.id
         ORDER BY record.recorded_at DESC, record.id DESC LIMIT 1
       ) consent ON true
       WHERE membership.user_id = $1
       ORDER BY academy.name, membership.id`,
      [userId],
    );
    const row = user.rows[0];
    return {
      id: row.id,
      email: row.email,
      normalizedEmail: row.normalized_email,
      displayName: row.display_name,
      status: row.status,
      memberships: memberships.rows.map((membership) => ({
        id: membership.id,
        academyId: membership.academy_id,
        academyName: membership.academy_name,
        role: membership.role,
        status: membership.status,
        studentProfileId: membership.student_profile_id,
        playerId: membership.player_id,
        requiresGuardianConsent: membership.requires_guardian_consent,
        consentStatus:
          membership.role !== 'STUDENT'
            ? null
            : membership.requires_guardian_consent
              ? (membership.consent_status ?? 'PENDING')
              : 'NOT_REQUIRED',
      })),
    };
  }

  async revokeSession(input: {
    sessionId: string;
    userId: string;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $3)
         WHERE id = $1 AND user_id = $2`,
        [input.sessionId, input.userId, input.now.toISOString()],
      );
      await appendSecurityAuditEvent(client, {
        actorUserId: input.userId,
        sessionId: input.sessionId,
        action: 'AUTH_LOGOUT',
        targetType: 'SESSION',
        targetId: input.sessionId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
      });
    });
  }

  async changePassword(input: {
    userId: string;
    currentSessionId: string;
    passwordHash: string;
    replacementSessionId: string;
    replacementTokenHash: string;
    replacementExpiresAt: Date;
    userAgent?: string | null | undefined;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE user_credentials
         SET password_hash = $2, password_algorithm = 'ARGON2ID_V1', password_updated_at = $3
         WHERE user_id = $1`,
        [input.userId, input.passwordHash, input.now.toISOString()],
      );
      await client.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $2)
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [input.userId, input.now.toISOString()],
      );
      await client.query(
        `INSERT INTO auth_sessions (
           id, user_id, token_hash, created_at, expires_at, created_user_agent
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.replacementSessionId,
          input.userId,
          input.replacementTokenHash,
          input.now.toISOString(),
          input.replacementExpiresAt.toISOString(),
          input.userAgent?.slice(0, 500) ?? null,
        ],
      );
      await appendSecurityAuditEvent(client, {
        actorUserId: input.userId,
        sessionId: input.replacementSessionId,
        action: 'AUTH_PASSWORD_CHANGED',
        targetType: 'USER',
        targetId: input.userId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
        metadata: { previousSessionId: input.currentSessionId },
      });
    });
  }

  async revokeAllSessions(input: {
    userId: string;
    actorSessionId: string;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $2)
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [input.userId, input.now.toISOString()],
      );
      await appendSecurityAuditEvent(client, {
        actorUserId: input.userId,
        sessionId: input.actorSessionId,
        action: 'AUTH_SESSIONS_REVOKED',
        targetType: 'USER',
        targetId: input.userId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
      });
    });
  }

  async disableUser(input: {
    userId: string;
    actorSessionId: string;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE users SET status = 'DISABLED', updated_at = $2
         WHERE id = $1 AND status = 'ACTIVE' RETURNING id`,
        [input.userId, input.now.toISOString()],
      );
      if (!updated.rows[0]) {
        throw new AuthRepositoryError('USER_NOT_FOUND', 'The active User does not exist.');
      }
      await client.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $2)
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [input.userId, input.now.toISOString()],
      );
      await appendSecurityAuditEvent(client, {
        actorUserId: input.userId,
        sessionId: input.actorSessionId,
        action: 'USER_DISABLED',
        targetType: 'USER',
        targetId: input.userId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
      });
    });
  }

  async bootstrapOwner(input: {
    academyId?: string | undefined;
    academyName?: string | undefined;
    email: string;
    normalizedEmail: string;
    displayName: string;
    passwordHash: string;
    now: Date;
  }): Promise<{ academyId: string; userId: string; membershipId: string }> {
    return this.database.transaction(async (client) => {
      const existingUser = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE normalized_email = $1`,
        [input.normalizedEmail],
      );
      if (existingUser.rows[0]) {
        throw new AuthRepositoryError(
          'BOOTSTRAP_USER_CONFLICT',
          'The bootstrap email is already attached to a User.',
        );
      }
      let academyId = input.academyId;
      if (academyId) {
        const academy = await client.query<{ id: string }>(
          `SELECT id FROM academies WHERE id = $1`,
          [academyId],
        );
        if (!academy.rows[0]) {
          throw new AuthRepositoryError(
            'BOOTSTRAP_ACADEMY_NOT_FOUND',
            'The requested bootstrap Academy does not exist.',
          );
        }
      } else {
        academyId = randomUUID();
        await client.query(`INSERT INTO academies (id, name) VALUES ($1, $2)`, [
          academyId,
          input.academyName ?? 'Academy',
        ]);
      }
      const existingOwner = await client.query<{ id: string }>(
        `SELECT id FROM academy_memberships
         WHERE academy_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'`,
        [academyId],
      );
      if (existingOwner.rows[0]) {
        throw new AuthRepositoryError(
          'BOOTSTRAP_MEMBERSHIP_CONFLICT',
          'The Academy already has an active OWNER.',
        );
      }
      const userId = randomUUID();
      const membershipId = randomUUID();
      await client.query(
        `INSERT INTO users (
           id, email, normalized_email, display_name, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)`,
        [
          userId,
          input.email.trim(),
          input.normalizedEmail,
          input.displayName,
          input.now.toISOString(),
        ],
      );
      await client.query(
        `INSERT INTO user_credentials (
           user_id, password_hash, password_algorithm, password_updated_at, created_at
         ) VALUES ($1, $2, 'ARGON2ID_V1', $3, $3)`,
        [userId, input.passwordHash, input.now.toISOString()],
      );
      await client.query(
        `INSERT INTO academy_memberships (
           id, academy_id, user_id, role, status, display_name, created_at, updated_at
         ) VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', $4, $5, $5)`,
        [membershipId, academyId, userId, input.displayName, input.now.toISOString()],
      );
      await appendSecurityAuditEvent(client, {
        academyId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        action: 'MEMBERSHIP_ENABLED',
        targetType: 'ACADEMY_MEMBERSHIP',
        targetId: membershipId,
        outcome: 'SUCCESS',
        occurredAt: input.now,
        metadata: { bootstrap: true, role: 'OWNER' },
      });
      return { academyId, userId, membershipId };
    });
  }
}
