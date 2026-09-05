import { randomUUID } from 'node:crypto';

import {
  assertSafeAuditMetadata,
  type SecurityAuditAction,
  type SecurityAuditOutcome,
} from '@chess-intelligent/domain';

import type { Database, QueryClient } from './database';

export interface AppendSecurityAuditEventInput {
  academyId?: string | null | undefined;
  actorUserId?: string | null | undefined;
  actorMembershipId?: string | null | undefined;
  sessionId?: string | null | undefined;
  action: SecurityAuditAction;
  targetType: string;
  targetId?: string | null | undefined;
  outcome: SecurityAuditOutcome;
  requestId?: string | null | undefined;
  metadata?: Readonly<Record<string, unknown>> | undefined;
  occurredAt?: Date | undefined;
}

export interface SecurityAuditEventRecord {
  id: string;
  occurredAt: string;
  academyId: string | null;
  actorUserId: string | null;
  actorMembershipId: string | null;
  sessionId: string | null;
  action: SecurityAuditAction;
  targetType: string;
  targetId: string | null;
  outcome: SecurityAuditOutcome;
  requestId: string | null;
  metadata: Record<string, unknown>;
}

interface AuditRow {
  id: string;
  occurred_at: string | Date;
  academy_id: string | null;
  actor_user_id: string | null;
  actor_membership_id: string | null;
  session_id: string | null;
  action: SecurityAuditAction;
  target_type: string;
  target_id: string | null;
  outcome: SecurityAuditOutcome;
  request_id: string | null;
  metadata: Record<string, unknown> | string;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function metadata(value: Record<string, unknown> | string): Record<string, unknown> {
  return typeof value === 'string' ? (JSON.parse(value) as Record<string, unknown>) : value;
}

export async function appendSecurityAuditEvent(
  client: QueryClient,
  input: AppendSecurityAuditEventInput,
): Promise<string> {
  const safeMetadata = assertSafeAuditMetadata(input.metadata ?? {});
  const id = randomUUID();
  await client.query(
    `INSERT INTO security_audit_events (
       id, occurred_at, academy_id, actor_user_id, actor_membership_id, session_id,
       action, target_type, target_id, outcome, request_id, metadata
     ) VALUES (
       $1, COALESCE($2::timestamptz, now()), $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12::jsonb
     )`,
    [
      id,
      input.occurredAt?.toISOString() ?? null,
      input.academyId ?? null,
      input.actorUserId ?? null,
      input.actorMembershipId ?? null,
      input.sessionId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.outcome,
      input.requestId ?? null,
      JSON.stringify(safeMetadata),
    ],
  );
  return id;
}

export class SecurityAuditRepository {
  constructor(private readonly database: Database) {}

  async append(input: AppendSecurityAuditEventInput): Promise<string> {
    return appendSecurityAuditEvent(this.database, input);
  }

  async listAcademyEvents(input: {
    academyId: string;
    limit: number;
    offset: number;
    action?: SecurityAuditAction | undefined;
  }): Promise<{ events: SecurityAuditEventRecord[]; total: number }> {
    const result = await this.database.query<AuditRow & { total_count: number }>(
      `SELECT event.*, count(*) OVER ()::int AS total_count
       FROM security_audit_events event
       WHERE event.academy_id = $1 AND ($2::text IS NULL OR event.action = $2)
       ORDER BY event.occurred_at DESC, event.id DESC
       LIMIT $3 OFFSET $4`,
      [input.academyId, input.action ?? null, input.limit, input.offset],
    );
    return {
      total: result.rows[0]?.total_count ?? 0,
      events: result.rows.map((row) => ({
        id: row.id,
        occurredAt: iso(row.occurred_at),
        academyId: row.academy_id,
        actorUserId: row.actor_user_id,
        actorMembershipId: row.actor_membership_id,
        sessionId: row.session_id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        outcome: row.outcome,
        requestId: row.request_id,
        metadata: metadata(row.metadata),
      })),
    };
  }
}
