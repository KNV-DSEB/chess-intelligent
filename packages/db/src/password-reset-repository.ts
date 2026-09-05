import { randomUUID } from 'node:crypto';

import type { Database } from './database';
import { appendSecurityAuditEvent } from './security-audit-repository';

export interface PasswordResetDeliveryRecord {
  requestId: string;
  userId: string;
  email: string;
  displayName: string | null;
}

export class PasswordResetRepository {
  constructor(private readonly database: Database) {}

  async getRecentRequestDates(identifierSha256: string, since: Date): Promise<Date[]> {
    const result = await this.database.query<{ requested_at: string | Date }>(
      `SELECT requested_at FROM password_reset_requests
       WHERE identifier_sha256 = $1 AND requested_at >= $2
       ORDER BY requested_at`,
      [identifierSha256, since.toISOString()],
    );
    return result.rows.map((row) => new Date(row.requested_at));
  }

  async createRequest(input: {
    identifierSha256: string;
    normalizedEmail: string;
    tokenId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<PasswordResetDeliveryRecord | null> {
    return this.database.transaction(async (client) => {
      const account = await client.query<{
        id: string;
        email: string;
        display_name: string | null;
      }>(
        `SELECT id, email, display_name FROM users
         WHERE normalized_email = $1 AND status = 'ACTIVE' FOR UPDATE`,
        [input.normalizedEmail],
      );
      const user = account.rows[0];
      const resetRequestId = randomUUID();
      await client.query(
        `INSERT INTO password_reset_requests (
           id, identifier_sha256, user_id, requested_at, delivery_status, delivery_attempted_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          resetRequestId,
          input.identifierSha256,
          user?.id ?? null,
          input.now.toISOString(),
          user ? 'REQUESTED' : 'NOT_APPLICABLE',
          user ? input.now.toISOString() : null,
        ],
      );
      if (user) {
        await client.query(
          `UPDATE password_reset_tokens SET revoked_at = $2
           WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
          [user.id, input.now.toISOString()],
        );
        await client.query(
          `INSERT INTO password_reset_tokens (
             id, request_id, user_id, token_hash, created_at, expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            input.tokenId,
            resetRequestId,
            user.id,
            input.tokenHash,
            input.now.toISOString(),
            input.expiresAt.toISOString(),
          ],
        );
      }
      await appendSecurityAuditEvent(client, {
        actorUserId: user?.id ?? null,
        action: 'PASSWORD_RESET_REQUESTED',
        targetType: user ? 'USER' : 'AUTH_IDENTIFIER',
        targetId: user?.id ?? null,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
        metadata: { identifierSha256Prefix: input.identifierSha256.slice(0, 12) },
      });
      return user
        ? {
            requestId: resetRequestId,
            userId: user.id,
            email: user.email,
            displayName: user.display_name,
          }
        : null;
    });
  }

  async recordDelivery(input: {
    requestId: string;
    userId: string;
    delivered: boolean;
    now: Date;
    correlationRequestId?: string | null | undefined;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        input.delivered
          ? `UPDATE password_reset_requests
             SET delivery_status = 'DELIVERED', delivered_at = $3, delivery_failed_at = NULL
             WHERE id = $1 AND user_id = $2 AND delivery_status = 'REQUESTED'`
          : `UPDATE password_reset_requests
             SET delivery_status = 'FAILED', delivered_at = NULL, delivery_failed_at = $3
             WHERE id = $1 AND user_id = $2 AND delivery_status = 'REQUESTED'`,
        [input.requestId, input.userId, input.now.toISOString()],
      );
      await appendSecurityAuditEvent(client, {
        actorUserId: input.userId,
        action: input.delivered
          ? 'PASSWORD_RESET_DELIVERY_SUCCEEDED'
          : 'PASSWORD_RESET_DELIVERY_FAILED',
        targetType: 'PASSWORD_RESET_REQUEST',
        targetId: input.requestId,
        outcome: input.delivered ? 'SUCCESS' : 'FAILURE',
        requestId: input.correlationRequestId,
        occurredAt: input.now,
      });
    });
  }

  async complete(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const consumed = await client.query<{ id: string; user_id: string }>(
        `UPDATE password_reset_tokens
         SET used_at = $2
         WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $2
         RETURNING id, user_id`,
        [input.tokenHash, input.now.toISOString()],
      );
      const token = consumed.rows[0];
      if (!token) return false;
      await client.query(
        `UPDATE user_credentials
         SET password_hash = $2, password_algorithm = 'ARGON2ID_V1', password_updated_at = $3
         WHERE user_id = $1`,
        [token.user_id, input.passwordHash, input.now.toISOString()],
      );
      await client.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $2)
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [token.user_id, input.now.toISOString()],
      );
      await client.query(
        `UPDATE password_reset_tokens SET revoked_at = $2
         WHERE user_id = $1 AND id <> $3 AND used_at IS NULL AND revoked_at IS NULL`,
        [token.user_id, input.now.toISOString(), token.id],
      );
      await appendSecurityAuditEvent(client, {
        actorUserId: token.user_id,
        action: 'PASSWORD_RESET_COMPLETED',
        targetType: 'USER',
        targetId: token.user_id,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
      });
      return true;
    });
  }
}
