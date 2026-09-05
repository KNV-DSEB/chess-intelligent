import { randomUUID } from 'node:crypto';

import {
  deriveStudentAccessConsentStatus,
  type AcademyMembershipRoleV1,
  type AcademyMembershipStatus,
  type StudentAccessConsentStatus,
} from '@chess-intelligent/domain';

import type { Database } from './database';
import { appendSecurityAuditEvent } from './security-audit-repository';

export interface AcademyActorRecord {
  userId: string;
  membershipId: string;
  academyId: string;
  academyName: string;
  role: AcademyMembershipRoleV1;
  status: AcademyMembershipStatus;
}

export interface StudentActorContext extends AcademyActorRecord {
  role: 'STUDENT';
  studentProfileId: string;
  playerId: string;
  requiresGuardianConsent: boolean;
  consentStatus: StudentAccessConsentStatus;
}

export interface AssignedStudentItemContext extends StudentActorContext {
  assignmentId: string;
  trainingItemId: string;
}

export interface ManagedMembershipRecord {
  id: string;
  academyId: string;
  userId: string | null;
  role: AcademyMembershipRoleV1;
  status: AcademyMembershipStatus;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface ActorRow {
  user_id: string;
  membership_id: string;
  academy_id: string;
  academy_name: string;
  role: AcademyMembershipRoleV1;
  status: AcademyMembershipStatus;
}

interface StudentActorRow extends ActorRow {
  student_profile_id: string;
  player_id: string;
  requires_guardian_consent: boolean;
  consent_status: 'PENDING' | 'GRANTED' | 'REVOKED' | null;
}

interface MembershipRow {
  id: string;
  academy_id: string;
  user_id: string | null;
  role: AcademyMembershipRoleV1;
  status: AcademyMembershipStatus;
  display_name: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class AcademyAccessRepositoryError extends Error {
  constructor(
    readonly code:
      | 'ACADEMY_MEMBERSHIP_REQUIRED'
      | 'STUDENT_SELF_CONTEXT_REQUIRED'
      | 'TRAINING_ITEM_NOT_ASSIGNED_TO_STUDENT'
      | 'MEMBERSHIP_NOT_FOUND'
      | 'LAST_OWNER_PROTECTED'
      | 'STUDENT_MEMBERSHIP_ROLE_IMMUTABLE'
      | 'STUDENT_PROFILE_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AcademyAccessRepositoryError';
  }
}

export class AcademyAccessRepository {
  constructor(private readonly database: Database) {}

  async resolveAcademyActor(userId: string, academyId: string): Promise<AcademyActorRecord | null> {
    const result = await this.database.query<ActorRow>(
      `SELECT membership.user_id, membership.id AS membership_id,
              membership.academy_id, academy.name AS academy_name,
              membership.role, membership.status
       FROM academy_memberships membership
       JOIN academies academy ON academy.id = membership.academy_id
       JOIN users account ON account.id = membership.user_id
       WHERE membership.user_id = $1 AND membership.academy_id = $2
         AND membership.status = 'ACTIVE' AND account.status = 'ACTIVE'`,
      [userId, academyId],
    );
    return result.rows[0] ? this.actor(result.rows[0]) : null;
  }

  async resolveStudentActor(
    userId: string,
    academyId: string,
  ): Promise<StudentActorContext | null> {
    const result = await this.database.query<StudentActorRow>(
      `SELECT membership.user_id, membership.id AS membership_id,
              membership.academy_id, academy.name AS academy_name,
              membership.role, membership.status, student.id AS student_profile_id,
              student.player_id, student.requires_guardian_consent,
              consent.status_change AS consent_status
       FROM academy_memberships membership
       JOIN academies academy ON academy.id = membership.academy_id
       JOIN users account ON account.id = membership.user_id
       JOIN student_profiles student
         ON student.academy_membership_id = membership.id
        AND student.academy_id = membership.academy_id
       LEFT JOIN LATERAL (
         SELECT record.status_change
         FROM student_access_consent_records record
         WHERE record.academy_id = student.academy_id
           AND record.student_profile_id = student.id
         ORDER BY record.recorded_at DESC, record.id DESC LIMIT 1
       ) consent ON true
       WHERE membership.user_id = $1 AND membership.academy_id = $2
         AND membership.role = 'STUDENT' AND membership.status = 'ACTIVE'
         AND account.status = 'ACTIVE'`,
      [userId, academyId],
    );
    return result.rows[0] ? this.studentActor(result.rows[0]) : null;
  }

  async resolveAssignedStudentItem(
    userId: string,
    trainingItemId: string,
  ): Promise<AssignedStudentItemContext | null> {
    const result = await this.database.query<StudentActorRow & { assignment_id: string }>(
      `SELECT membership.user_id, membership.id AS membership_id,
              membership.academy_id, academy.name AS academy_name,
              membership.role, membership.status, student.id AS student_profile_id,
              student.player_id, student.requires_guardian_consent,
              consent.status_change AS consent_status, assignment.id AS assignment_id
       FROM academy_memberships membership
       JOIN users account ON account.id = membership.user_id
       JOIN academies academy ON academy.id = membership.academy_id
       JOIN student_profiles student
         ON student.academy_membership_id = membership.id
        AND student.academy_id = membership.academy_id
       JOIN training_assignments assignment
         ON assignment.academy_id = student.academy_id
        AND assignment.student_profile_id = student.id
        AND assignment.player_id = student.player_id
        AND assignment.cancelled_at IS NULL
       JOIN training_assignment_items assignment_item
         ON assignment_item.assignment_id = assignment.id
        AND assignment_item.training_item_id = $2
       LEFT JOIN LATERAL (
         SELECT record.status_change
         FROM student_access_consent_records record
         WHERE record.academy_id = student.academy_id
           AND record.student_profile_id = student.id
         ORDER BY record.recorded_at DESC, record.id DESC LIMIT 1
       ) consent ON true
       WHERE membership.user_id = $1 AND membership.role = 'STUDENT'
         AND membership.status = 'ACTIVE' AND account.status = 'ACTIVE'
       ORDER BY assignment.assigned_at DESC, assignment.id DESC LIMIT 1`,
      [userId, trainingItemId],
    );
    const row = result.rows[0];
    return row
      ? {
          ...this.studentActor(row),
          assignmentId: row.assignment_id,
          trainingItemId,
        }
      : null;
  }

  async listAcademyMemberships(academyId: string): Promise<ManagedMembershipRecord[]> {
    const result = await this.database.query<MembershipRow>(
      `SELECT * FROM academy_memberships
       WHERE academy_id = $1 ORDER BY display_name, id`,
      [academyId],
    );
    return result.rows.map((row) => this.membership(row));
  }

  async getMembership(
    academyId: string,
    membershipId: string,
  ): Promise<ManagedMembershipRecord | null> {
    const result = await this.database.query<MembershipRow>(
      `SELECT * FROM academy_memberships WHERE academy_id = $1 AND id = $2`,
      [academyId, membershipId],
    );
    return result.rows[0] ? this.membership(result.rows[0]) : null;
  }

  async updateMembership(input: {
    academyId: string;
    membershipId: string;
    actor: AcademyActorRecord;
    role: AcademyMembershipRoleV1;
    status: AcademyMembershipStatus;
    sessionId: string;
    requestId?: string | null | undefined;
    now: Date;
  }): Promise<ManagedMembershipRecord> {
    return this.database.transaction(async (client) => {
      const owners = await client.query<{ id: string }>(
        `SELECT id FROM academy_memberships
         WHERE academy_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'
         FOR UPDATE`,
        [input.academyId],
      );
      const target = await client.query<MembershipRow>(
        `SELECT * FROM academy_memberships
         WHERE academy_id = $1 AND id = $2 FOR UPDATE`,
        [input.academyId, input.membershipId],
      );
      const row = target.rows[0];
      if (!row) {
        throw new AcademyAccessRepositoryError(
          'MEMBERSHIP_NOT_FOUND',
          'The membership does not belong to the requested Academy.',
        );
      }
      const removesActiveOwner =
        row.role === 'OWNER' &&
        row.status === 'ACTIVE' &&
        (input.role !== 'OWNER' || input.status !== 'ACTIVE');
      if (removesActiveOwner && owners.rows.length <= 1) {
        throw new AcademyAccessRepositoryError(
          'LAST_OWNER_PROTECTED',
          'The last active OWNER cannot be disabled or demoted.',
        );
      }
      if (row.role === 'STUDENT' && input.role !== 'STUDENT') {
        const linked = await client.query<{ id: string }>(
          `SELECT id FROM student_profiles WHERE academy_membership_id = $1`,
          [row.id],
        );
        if (linked.rows[0]) {
          throw new AcademyAccessRepositoryError(
            'STUDENT_MEMBERSHIP_ROLE_IMMUTABLE',
            'A membership linked to a StudentProfile must remain STUDENT.',
          );
        }
      }
      const updated = await client.query<MembershipRow>(
        `UPDATE academy_memberships
         SET role = $3, status = $4, updated_at = $5
         WHERE academy_id = $1 AND id = $2 RETURNING *`,
        [input.academyId, input.membershipId, input.role, input.status, input.now.toISOString()],
      );
      if (row.role !== input.role) {
        await appendSecurityAuditEvent(client, {
          academyId: input.academyId,
          actorUserId: input.actor.userId,
          actorMembershipId: input.actor.membershipId,
          sessionId: input.sessionId,
          action: 'MEMBERSHIP_ROLE_CHANGED',
          targetType: 'ACADEMY_MEMBERSHIP',
          targetId: row.id,
          outcome: 'SUCCESS',
          requestId: input.requestId,
          occurredAt: input.now,
          metadata: { fromRole: row.role, toRole: input.role },
        });
      }
      if (row.status !== input.status) {
        await appendSecurityAuditEvent(client, {
          academyId: input.academyId,
          actorUserId: input.actor.userId,
          actorMembershipId: input.actor.membershipId,
          sessionId: input.sessionId,
          action: input.status === 'DISABLED' ? 'MEMBERSHIP_DISABLED' : 'MEMBERSHIP_ENABLED',
          targetType: 'ACADEMY_MEMBERSHIP',
          targetId: row.id,
          outcome: 'SUCCESS',
          requestId: input.requestId,
          occurredAt: input.now,
          metadata: { fromStatus: row.status, toStatus: input.status },
        });
      }
      return this.membership(updated.rows[0]!);
    });
  }

  async setGuardianConsentRequirement(input: {
    academyId: string;
    studentProfileId: string;
    requiresGuardianConsent: boolean;
    actor: AcademyActorRecord;
    sessionId: string;
    requestId?: string | null | undefined;
    now: Date;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE student_profiles SET requires_guardian_consent = $3
         WHERE academy_id = $1 AND id = $2 RETURNING id`,
        [input.academyId, input.studentProfileId, input.requiresGuardianConsent],
      );
      if (!updated.rows[0]) {
        throw new AcademyAccessRepositoryError(
          'STUDENT_PROFILE_NOT_FOUND',
          'The StudentProfile does not belong to the requested Academy.',
        );
      }
      await appendSecurityAuditEvent(client, {
        academyId: input.academyId,
        actorUserId: input.actor.userId,
        actorMembershipId: input.actor.membershipId,
        sessionId: input.sessionId,
        action: 'GUARDIAN_CONSENT_RECORDED',
        targetType: 'STUDENT_PROFILE',
        targetId: input.studentProfileId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
        metadata: { requiresGuardianConsent: input.requiresGuardianConsent },
      });
    });
  }

  async recordGuardianConsent(input: {
    academyId: string;
    studentProfileId: string;
    status: 'PENDING' | 'GRANTED' | 'REVOKED';
    externalReference?: string | null | undefined;
    actor: AcademyActorRecord;
    sessionId: string;
    requestId?: string | null | undefined;
    now: Date;
  }): Promise<string> {
    return this.database.transaction(async (client) => {
      const student = await client.query<{ id: string }>(
        `SELECT id FROM student_profiles WHERE academy_id = $1 AND id = $2 FOR UPDATE`,
        [input.academyId, input.studentProfileId],
      );
      if (!student.rows[0]) {
        throw new AcademyAccessRepositoryError(
          'STUDENT_PROFILE_NOT_FOUND',
          'The StudentProfile does not belong to the requested Academy.',
        );
      }
      const latest = await client.query<{ recorded_at: string | Date }>(
        `SELECT recorded_at FROM student_access_consent_records
         WHERE academy_id = $1 AND student_profile_id = $2
         ORDER BY recorded_at DESC, id DESC LIMIT 1 FOR UPDATE`,
        [input.academyId, input.studentProfileId],
      );
      const latestTime = latest.rows[0]
        ? new Date(latest.rows[0].recorded_at).getTime()
        : Number.NEGATIVE_INFINITY;
      const recordedAt = latestTime >= input.now.getTime() ? new Date(latestTime + 1) : input.now;
      const id = randomUUID();
      await client.query(
        `INSERT INTO student_access_consent_records (
           id, academy_id, student_profile_id, status_change, recorded_at,
           recorded_by_user_id, recorded_by_membership_id, method, external_reference
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACADEMY_RECORDED', $8)`,
        [
          id,
          input.academyId,
          input.studentProfileId,
          input.status,
          recordedAt.toISOString(),
          input.actor.userId,
          input.actor.membershipId,
          input.externalReference ?? null,
        ],
      );
      await appendSecurityAuditEvent(client, {
        academyId: input.academyId,
        actorUserId: input.actor.userId,
        actorMembershipId: input.actor.membershipId,
        sessionId: input.sessionId,
        action:
          input.status === 'REVOKED' ? 'GUARDIAN_CONSENT_REVOKED' : 'GUARDIAN_CONSENT_RECORDED',
        targetType: 'STUDENT_PROFILE',
        targetId: input.studentProfileId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
        metadata: { status: input.status, method: 'ACADEMY_RECORDED' },
      });
      return id;
    });
  }

  private actor(row: ActorRow): AcademyActorRecord {
    return {
      userId: row.user_id,
      membershipId: row.membership_id,
      academyId: row.academy_id,
      academyName: row.academy_name,
      role: row.role,
      status: row.status,
    };
  }

  private studentActor(row: StudentActorRow): StudentActorContext {
    return {
      ...this.actor(row),
      role: 'STUDENT',
      studentProfileId: row.student_profile_id,
      playerId: row.player_id,
      requiresGuardianConsent: row.requires_guardian_consent,
      consentStatus: deriveStudentAccessConsentStatus(
        row.requires_guardian_consent,
        row.consent_status,
      ),
    };
  }

  private membership(row: MembershipRow): ManagedMembershipRecord {
    return {
      id: row.id,
      academyId: row.academy_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      displayName: row.display_name,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }
}
