import { randomUUID } from 'node:crypto';

import type { AcademyMembershipRoleV1 } from '@chess-intelligent/domain';

import type { AcademyActorRecord } from './academy-access-repository';
import type { Database, QueryClient } from './database';
import { appendSecurityAuditEvent } from './security-audit-repository';

export type AcademyInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
export type AcademyInvitationDeliveryStatus =
  'NOT_REQUESTED' | 'REQUESTED' | 'DELIVERED' | 'FAILED';

export interface AcademyInvitationRecord {
  id: string;
  academyId: string;
  academyName: string;
  normalizedEmail: string;
  role: AcademyMembershipRoleV1;
  existingMembershipId: string | null;
  createdByMembershipId: string;
  status: AcademyInvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  acceptedByUserId: string | null;
  deliveryStatus: AcademyInvitationDeliveryStatus;
  deliveryRequestedAt: string | null;
  deliveredAt: string | null;
  deliveryFailedAt: string | null;
}

interface InvitationRow {
  id: string;
  academy_id: string;
  academy_name: string;
  normalized_email: string;
  role: AcademyMembershipRoleV1;
  existing_membership_id: string | null;
  created_by_membership_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  created_at: string | Date;
  expires_at: string | Date;
  accepted_at: string | Date | null;
  revoked_at: string | Date | null;
  accepted_by_user_id: string | null;
  delivery_status: AcademyInvitationDeliveryStatus;
  delivery_requested_at: string | Date | null;
  delivered_at: string | Date | null;
  delivery_failed_at: string | Date | null;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class AcademyInvitationRepositoryError extends Error {
  constructor(
    readonly code:
      | 'INVITATION_INVALID'
      | 'INVITATION_EXPIRED'
      | 'INVITATION_REVOKED'
      | 'INVITATION_ALREADY_ACCEPTED'
      | 'INVITATION_WRONG_EMAIL'
      | 'INVITATION_ACCOUNT_EXISTS_LOGIN_REQUIRED'
      | 'INVITATION_MEMBERSHIP_REQUIRED'
      | 'INVITATION_MEMBERSHIP_INVALID'
      | 'INVITATION_MEMBERSHIP_ALREADY_CLAIMED'
      | 'INVITATION_ACADEMY_MEMBERSHIP_CONFLICT'
      | 'INVITATION_NOT_FOUND'
      | 'INVITATION_NOT_PENDING',
    message: string,
  ) {
    super(message);
    this.name = 'AcademyInvitationRepositoryError';
  }
}

export class AcademyInvitationRepository {
  constructor(private readonly database: Database) {}

  async create(input: {
    academyId: string;
    normalizedEmail: string;
    role: AcademyMembershipRoleV1;
    existingMembershipId?: string | null | undefined;
    actor: AcademyActorRecord;
    sessionId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<AcademyInvitationRecord> {
    return this.database.transaction(async (client) => {
      if (input.role === 'STUDENT' && !input.existingMembershipId) {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_MEMBERSHIP_REQUIRED',
          'A STUDENT invitation must claim an existing StudentProfile membership.',
        );
      }
      if (input.existingMembershipId) {
        const membership = await client.query<{
          role: AcademyMembershipRoleV1;
          user_id: string | null;
          status: string;
        }>(
          `SELECT role, user_id, status FROM academy_memberships
           WHERE academy_id = $1 AND id = $2 FOR UPDATE`,
          [input.academyId, input.existingMembershipId],
        );
        const target = membership.rows[0];
        if (!target || target.role !== input.role || target.status !== 'ACTIVE') {
          throw new AcademyInvitationRepositoryError(
            'INVITATION_MEMBERSHIP_INVALID',
            'The invitation target must be an active same-Academy membership with the requested role.',
          );
        }
        if (target.user_id) {
          throw new AcademyInvitationRepositoryError(
            'INVITATION_MEMBERSHIP_ALREADY_CLAIMED',
            'The target membership is already bound to a User.',
          );
        }
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO academy_invitations (
           id, academy_id, normalized_email, role, existing_membership_id,
           created_by_membership_id, token_hash, status, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9)`,
        [
          id,
          input.academyId,
          input.normalizedEmail,
          input.role,
          input.existingMembershipId ?? null,
          input.actor.membershipId,
          input.tokenHash,
          input.now.toISOString(),
          input.expiresAt.toISOString(),
        ],
      );
      await appendSecurityAuditEvent(client, {
        academyId: input.academyId,
        actorUserId: input.actor.userId,
        actorMembershipId: input.actor.membershipId,
        sessionId: input.sessionId,
        action: 'INVITATION_CREATED',
        targetType: 'ACADEMY_INVITATION',
        targetId: id,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
        metadata: { role: input.role, existingMembershipId: input.existingMembershipId ?? null },
      });
      return (await this.getByIdWithClient(client, input.academyId, id, input.now))!;
    });
  }

  async inspect(tokenHash: string, now: Date): Promise<AcademyInvitationRecord> {
    const invitation = await this.getByTokenHash(this.database, tokenHash, now);
    if (!invitation) {
      throw new AcademyInvitationRepositoryError(
        'INVITATION_INVALID',
        'The invitation token is invalid.',
      );
    }
    return invitation;
  }

  async beginDelivery(input: {
    academyId: string;
    invitationId: string;
    actor: AcademyActorRecord;
    sessionId: string;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE academy_invitations
         SET delivery_status = 'REQUESTED', delivery_requested_at = $3,
             delivered_at = NULL, delivery_failed_at = NULL
         WHERE academy_id = $1 AND id = $2 AND delivery_status IN ('NOT_REQUESTED', 'FAILED')
         RETURNING id`,
        [input.academyId, input.invitationId, input.now.toISOString()],
      );
      if (!updated.rows[0]) {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_NOT_PENDING',
          'The invitation delivery state cannot be started.',
        );
      }
      await appendSecurityAuditEvent(client, {
        academyId: input.academyId,
        actorUserId: input.actor.userId,
        actorMembershipId: input.actor.membershipId,
        sessionId: input.sessionId,
        action: 'INVITATION_DELIVERY_REQUESTED',
        targetType: 'ACADEMY_INVITATION',
        targetId: input.invitationId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
      });
    });
  }

  async completeDelivery(input: {
    academyId: string;
    invitationId: string;
    actor: AcademyActorRecord;
    sessionId: string;
    delivered: boolean;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<AcademyInvitationRecord> {
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        input.delivered
          ? `UPDATE academy_invitations
             SET delivery_status = 'DELIVERED', delivered_at = $3, delivery_failed_at = NULL
             WHERE academy_id = $1 AND id = $2 AND delivery_status = 'REQUESTED'
             RETURNING id`
          : `UPDATE academy_invitations
             SET delivery_status = 'FAILED', delivered_at = NULL, delivery_failed_at = $3
             WHERE academy_id = $1 AND id = $2 AND delivery_status = 'REQUESTED'
             RETURNING id`,
        [input.academyId, input.invitationId, input.now.toISOString()],
      );
      if (!updated.rows[0]) {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_NOT_PENDING',
          'The invitation delivery state cannot be completed.',
        );
      }
      await appendSecurityAuditEvent(client, {
        academyId: input.academyId,
        actorUserId: input.actor.userId,
        actorMembershipId: input.actor.membershipId,
        sessionId: input.sessionId,
        action: input.delivered ? 'INVITATION_DELIVERY_SUCCEEDED' : 'INVITATION_DELIVERY_FAILED',
        targetType: 'ACADEMY_INVITATION',
        targetId: input.invitationId,
        outcome: input.delivered ? 'SUCCESS' : 'FAILURE',
        requestId: input.requestId,
        occurredAt: input.now,
      });
      return (await this.getByIdWithClient(
        client,
        input.academyId,
        input.invitationId,
        input.now,
      ))!;
    });
  }

  async list(academyId: string, now: Date): Promise<AcademyInvitationRecord[]> {
    const result = await this.database.query<InvitationRow>(
      `SELECT invitation.*, academy.name AS academy_name
       FROM academy_invitations invitation
       JOIN academies academy ON academy.id = invitation.academy_id
       WHERE invitation.academy_id = $1
       ORDER BY invitation.created_at DESC, invitation.id DESC`,
      [academyId],
    );
    return result.rows.map((row) => this.invitation(row, now));
  }

  async revoke(input: {
    academyId: string;
    invitationId: string;
    actor: AcademyActorRecord;
    sessionId: string;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<AcademyInvitationRecord> {
    return this.database.transaction(async (client) => {
      const invitation = await this.getByIdWithClient(
        client,
        input.academyId,
        input.invitationId,
        input.now,
        true,
      );
      if (!invitation) {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_NOT_FOUND',
          'The invitation does not belong to the requested Academy.',
        );
      }
      if (invitation.status !== 'PENDING') {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_NOT_PENDING',
          'Only a pending invitation can be revoked.',
        );
      }
      await client.query(
        `UPDATE academy_invitations
         SET status = 'REVOKED', revoked_at = $3
         WHERE academy_id = $1 AND id = $2`,
        [input.academyId, input.invitationId, input.now.toISOString()],
      );
      await appendSecurityAuditEvent(client, {
        academyId: input.academyId,
        actorUserId: input.actor.userId,
        actorMembershipId: input.actor.membershipId,
        sessionId: input.sessionId,
        action: 'INVITATION_REVOKED',
        targetType: 'ACADEMY_INVITATION',
        targetId: input.invitationId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
      });
      return (await this.getByIdWithClient(
        client,
        input.academyId,
        input.invitationId,
        input.now,
      ))!;
    });
  }

  async accept(input: {
    tokenHash: string;
    normalizedEmail: string;
    email: string;
    displayName: string;
    passwordHash?: string | undefined;
    existingUserId?: string | undefined;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<{ invitation: AcademyInvitationRecord; userId: string; membershipId: string }> {
    return this.database.transaction(async (client) => {
      const inviteRow = await client.query<InvitationRow>(
        `SELECT invitation.*, academy.name AS academy_name
         FROM academy_invitations invitation
         JOIN academies academy ON academy.id = invitation.academy_id
         WHERE invitation.token_hash = $1 FOR UPDATE`,
        [input.tokenHash],
      );
      const raw = inviteRow.rows[0];
      if (!raw) {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_INVALID',
          'The invitation token is invalid.',
        );
      }
      const invitation = this.invitation(raw, input.now);
      if (invitation.status === 'EXPIRED') {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_EXPIRED',
          'The invitation has expired.',
        );
      }
      if (invitation.status === 'REVOKED') {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_REVOKED',
          'The invitation has been revoked.',
        );
      }
      if (invitation.status === 'ACCEPTED') {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_ALREADY_ACCEPTED',
          'The invitation has already been accepted.',
        );
      }
      if (invitation.normalizedEmail !== input.normalizedEmail) {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_WRONG_EMAIL',
          'The invitation email does not match the accepting User.',
        );
      }
      const userId = await this.resolveOrCreateUser(client, input);
      const existingAcademyMembership = await client.query<{ id: string }>(
        `SELECT id FROM academy_memberships
         WHERE academy_id = $1 AND user_id = $2 AND status = 'ACTIVE' FOR UPDATE`,
        [invitation.academyId, userId],
      );
      if (
        existingAcademyMembership.rows[0] &&
        existingAcademyMembership.rows[0].id !== invitation.existingMembershipId
      ) {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_ACADEMY_MEMBERSHIP_CONFLICT',
          'The User already has another active membership in this Academy.',
        );
      }
      let membershipId = invitation.existingMembershipId;
      if (membershipId) {
        const membership = await client.query<{
          user_id: string | null;
          role: AcademyMembershipRoleV1;
          status: string;
        }>(
          `SELECT user_id, role, status FROM academy_memberships
           WHERE id = $1 AND academy_id = $2 FOR UPDATE`,
          [membershipId, invitation.academyId],
        );
        const target = membership.rows[0];
        if (!target || target.role !== invitation.role || target.status !== 'ACTIVE') {
          throw new AcademyInvitationRepositoryError(
            'INVITATION_MEMBERSHIP_INVALID',
            'The invitation membership is no longer compatible.',
          );
        }
        if (target.user_id && target.user_id !== userId) {
          throw new AcademyInvitationRepositoryError(
            'INVITATION_MEMBERSHIP_ALREADY_CLAIMED',
            'The invitation membership was claimed by another User.',
          );
        }
        await client.query(
          `UPDATE academy_memberships SET user_id = $2, updated_at = $3 WHERE id = $1`,
          [membershipId, userId, input.now.toISOString()],
        );
      } else {
        if (invitation.role === 'STUDENT') {
          throw new AcademyInvitationRepositoryError(
            'INVITATION_MEMBERSHIP_REQUIRED',
            'A STUDENT invitation must claim an existing membership.',
          );
        }
        membershipId = randomUUID();
        await client.query(
          `INSERT INTO academy_memberships (
             id, academy_id, user_id, role, status, display_name, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $6)`,
          [
            membershipId,
            invitation.academyId,
            userId,
            invitation.role,
            input.displayName,
            input.now.toISOString(),
          ],
        );
      }
      await client.query(
        `UPDATE academy_invitations
         SET status = 'ACCEPTED', accepted_at = $2, accepted_by_user_id = $3
         WHERE id = $1`,
        [invitation.id, input.now.toISOString(), userId],
      );
      await appendSecurityAuditEvent(client, {
        academyId: invitation.academyId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        action: 'INVITATION_ACCEPTED',
        targetType: 'ACADEMY_INVITATION',
        targetId: invitation.id,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
        metadata: { role: invitation.role, membershipId },
      });
      return {
        invitation: (await this.getByIdWithClient(
          client,
          invitation.academyId,
          invitation.id,
          input.now,
        ))!,
        userId,
        membershipId,
      };
    });
  }

  private async resolveOrCreateUser(
    client: QueryClient,
    input: {
      normalizedEmail: string;
      email: string;
      displayName: string;
      passwordHash?: string | undefined;
      existingUserId?: string | undefined;
      now: Date;
    },
  ): Promise<string> {
    if (input.existingUserId) {
      const existing = await client.query<{ id: string; normalized_email: string; status: string }>(
        `SELECT id, normalized_email, status FROM users WHERE id = $1 FOR UPDATE`,
        [input.existingUserId],
      );
      const user = existing.rows[0];
      if (!user || user.status !== 'ACTIVE' || user.normalized_email !== input.normalizedEmail) {
        throw new AcademyInvitationRepositoryError(
          'INVITATION_WRONG_EMAIL',
          'The authenticated User is not eligible to accept this invitation.',
        );
      }
      return user.id;
    }
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE normalized_email = $1 FOR UPDATE`,
      [input.normalizedEmail],
    );
    if (existing.rows[0]) {
      throw new AcademyInvitationRepositoryError(
        'INVITATION_ACCOUNT_EXISTS_LOGIN_REQUIRED',
        'An existing User must authenticate before accepting this invitation.',
      );
    }
    if (!input.passwordHash) {
      throw new AcademyInvitationRepositoryError(
        'INVITATION_INVALID',
        'A new invited User requires a password credential.',
      );
    }
    const userId = randomUUID();
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
    return userId;
  }

  private async getByTokenHash(
    client: QueryClient,
    tokenHash: string,
    now: Date,
  ): Promise<AcademyInvitationRecord | null> {
    const result = await client.query<InvitationRow>(
      `SELECT invitation.*, academy.name AS academy_name
       FROM academy_invitations invitation
       JOIN academies academy ON academy.id = invitation.academy_id
       WHERE invitation.token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? this.invitation(result.rows[0], now) : null;
  }

  private async getByIdWithClient(
    client: QueryClient,
    academyId: string,
    invitationId: string,
    now: Date,
    lock = false,
  ): Promise<AcademyInvitationRecord | null> {
    const result = await client.query<InvitationRow>(
      `SELECT invitation.*, academy.name AS academy_name
       FROM academy_invitations invitation
       JOIN academies academy ON academy.id = invitation.academy_id
       WHERE invitation.academy_id = $1 AND invitation.id = $2${lock ? ' FOR UPDATE' : ''}`,
      [academyId, invitationId],
    );
    return result.rows[0] ? this.invitation(result.rows[0], now) : null;
  }

  private invitation(row: InvitationRow, now: Date): AcademyInvitationRecord {
    const persisted = row.status;
    const status: AcademyInvitationStatus =
      persisted === 'PENDING' && new Date(row.expires_at).getTime() <= now.getTime()
        ? 'EXPIRED'
        : persisted;
    return {
      id: row.id,
      academyId: row.academy_id,
      academyName: row.academy_name,
      normalizedEmail: row.normalized_email,
      role: row.role,
      existingMembershipId: row.existing_membership_id,
      createdByMembershipId: row.created_by_membership_id,
      status,
      createdAt: iso(row.created_at)!,
      expiresAt: iso(row.expires_at)!,
      acceptedAt: iso(row.accepted_at),
      revokedAt: iso(row.revoked_at),
      acceptedByUserId: row.accepted_by_user_id,
      deliveryStatus: row.delivery_status,
      deliveryRequestedAt: iso(row.delivery_requested_at),
      deliveredAt: iso(row.delivered_at),
      deliveryFailedAt: iso(row.delivery_failed_at),
    };
  }
}
