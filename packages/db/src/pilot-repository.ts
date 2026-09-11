import { createHash, randomUUID } from 'node:crypto';

import {
  PILOT_EVENT_VERSION,
  pilotMetric,
  type AiClaimFeedbackValue,
  type AiNotUsefulReason,
  type AcademyMembershipRoleV1,
  type CoachReviewFeedbackValue,
  type PilotEventOutcome,
  type PilotEventSource,
  type PilotEventType,
  type PilotMetricValue,
} from '@chess-intelligent/domain';

import type { Database } from './database';

export interface PilotActorInput {
  userId: string;
  membershipId: string;
  role: AcademyMembershipRoleV1;
  sessionId: string;
}

export interface AppendPilotEventInput {
  academyId: string;
  actor: PilotActorInput;
  eventType: PilotEventType;
  eventSource: PilotEventSource;
  outcome?: PilotEventOutcome | undefined;
  studentProfileId?: string | null | undefined;
  playerId?: string | null | undefined;
  skillGraphRunId?: string | null | undefined;
  conceptStableId?: string | null | undefined;
  groundedAiArtifactId?: string | null | undefined;
  groundedAiClaimId?: string | null | undefined;
  evidenceReference?: string | null | undefined;
  trainingPlanRunId?: string | null | undefined;
  assignmentId?: string | null | undefined;
  trainingItemId?: string | null | undefined;
  attemptResult?: 'CORRECT' | 'INCORRECT' | null | undefined;
  requestId?: string | null | undefined;
  deduplicationKey: string;
  occurredAt?: Date | undefined;
}

export interface PilotEventRecord {
  id: string;
  deduplicated: boolean;
}

export interface PilotReadinessSignals {
  playerId: string;
  canonicalGameCount: number;
  analyzedGameCount: number;
}

export interface PilotMetricsExport {
  version: 'PILOT_METRICS_EXPORT_V1';
  academyId: string;
  fromInclusive: string;
  toExclusive: string;
  generatedAt: string;
  metrics: Record<string, PilotMetricValue>;
  breakdowns: {
    coachFeedbackByConcept: Array<{
      conceptStableId: string;
      agree: number;
      unsure: number;
      disagree: number;
      total: number;
      agreementRate: number | null;
      disagreementRate: number | null;
    }>;
    aiNotUsefulReasons: Record<string, number>;
  };
  eventCounts: Partial<Record<PilotEventType, number>>;
  interpretation: 'USAGE_AND_WORKFLOW_OBSERVATION_NOT_LEARNING_EFFECTIVENESS';
}

interface EventRow {
  event_type: PilotEventType;
  outcome: PilotEventOutcome;
  actor_user_id: string;
  student_profile_id: string | null;
  skill_graph_run_id: string | null;
  concept_stable_id: string | null;
  grounded_ai_artifact_id: string | null;
  assignment_id: string | null;
  training_item_id: string | null;
  attempt_result: 'CORRECT' | 'INCORRECT' | null;
}

interface FeedbackCountRow {
  feedback_value: string;
  count: number | string;
}

interface ConceptFeedbackCountRow extends FeedbackCountRow {
  concept_stable_id: string;
}

interface AiReasonCountRow {
  not_useful_reason: string;
  count: number | string;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function countDistinct(values: Array<string | null>): number {
  return new Set(values.filter((value): value is string => value !== null)).size;
}

function number(value: number | string | undefined): number {
  return value === undefined ? 0 : Number(value);
}

export class PilotRepository {
  constructor(private readonly database: Database) {}

  async appendEvent(input: AppendPilotEventInput): Promise<PilotEventRecord> {
    const id = randomUUID();
    const deduplicationSha256 = digest(input.deduplicationKey);
    const inserted = await this.database.query<{ id: string }>(
      `INSERT INTO pilot_events (
         id, event_version, event_type, event_source, outcome,
         academy_id, actor_user_id, actor_membership_id, actor_role, session_id,
         student_profile_id, player_id, skill_graph_run_id, concept_stable_id,
         grounded_ai_artifact_id, grounded_ai_claim_id, evidence_reference,
         training_plan_run_id, assignment_id, training_item_id, attempt_result,
         request_id, deduplication_sha256, occurred_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17,
         $18, $19, $20, $21,
         $22, $23, $24
       )
       ON CONFLICT (academy_id, actor_user_id, event_type, deduplication_sha256)
       DO NOTHING RETURNING id`,
      [
        id,
        PILOT_EVENT_VERSION,
        input.eventType,
        input.eventSource,
        input.outcome ?? 'SUCCESS',
        input.academyId,
        input.actor.userId,
        input.actor.membershipId,
        input.actor.role,
        input.actor.sessionId,
        input.studentProfileId ?? null,
        input.playerId ?? null,
        input.skillGraphRunId ?? null,
        input.conceptStableId ?? null,
        input.groundedAiArtifactId ?? null,
        input.groundedAiClaimId ?? null,
        input.evidenceReference ?? null,
        input.trainingPlanRunId ?? null,
        input.assignmentId ?? null,
        input.trainingItemId ?? null,
        input.attemptResult ?? null,
        input.requestId ?? null,
        deduplicationSha256,
        (input.occurredAt ?? new Date()).toISOString(),
      ],
    );
    if (inserted.rows[0]) return { id: inserted.rows[0].id, deduplicated: false };
    const existing = await this.database.query<{ id: string }>(
      `SELECT id FROM pilot_events
       WHERE academy_id = $1 AND actor_user_id = $2
         AND event_type = $3 AND deduplication_sha256 = $4`,
      [input.academyId, input.actor.userId, input.eventType, deduplicationSha256],
    );
    return { id: existing.rows[0]!.id, deduplicated: true };
  }

  async appendCoachReviewFeedback(input: {
    academyId: string;
    actor: PilotActorInput;
    studentProfileId: string;
    playerId: string;
    skillGraphRunId: string;
    conceptStableId: string;
    feedbackValue: CoachReviewFeedbackValue;
    requestId?: string | null | undefined;
    deduplicationKey: string;
    createdAt?: Date | undefined;
  }): Promise<PilotEventRecord> {
    const id = randomUUID();
    const key = digest(input.deduplicationKey);
    const inserted = await this.database.query<{ id: string }>(
      `INSERT INTO coach_review_feedback (
         id, academy_id, actor_user_id, actor_membership_id, actor_role, session_id,
         student_profile_id, player_id, skill_graph_run_id,
         ontology_version_id, ontology_version, concept_stable_id,
         feedback_value, request_id, deduplication_sha256, created_at
       )
       SELECT $1, $2, $3, $4, $5, $6,
              student.id, student.player_id, graph.id,
              ontology.id, graph.ontology_version, concept.concept_stable_id,
              $10, $11, $12, $13
       FROM student_profiles student
       JOIN player_skill_graph_runs graph
         ON graph.id = $8 AND graph.player_id = student.player_id AND graph.status = 'SUCCEEDED'
       JOIN ontology_versions ontology
         ON ontology.version = graph.ontology_version AND ontology.status = 'PUBLISHED'
       JOIN concept_definitions concept
         ON concept.ontology_version_id = ontology.id AND concept.concept_stable_id = $9
       WHERE student.academy_id = $2 AND student.id = $7 AND student.player_id = $14
       ON CONFLICT (
         academy_id, actor_user_id, skill_graph_run_id, concept_stable_id, deduplication_sha256
       ) DO NOTHING RETURNING id`,
      [
        id,
        input.academyId,
        input.actor.userId,
        input.actor.membershipId,
        input.actor.role,
        input.actor.sessionId,
        input.studentProfileId,
        input.skillGraphRunId,
        input.conceptStableId,
        input.feedbackValue,
        input.requestId ?? null,
        key,
        (input.createdAt ?? new Date()).toISOString(),
        input.playerId,
      ],
    );
    if (inserted.rows[0]) return { id: inserted.rows[0].id, deduplicated: false };
    const existing = await this.database.query<{ id: string }>(
      `SELECT id FROM coach_review_feedback
       WHERE academy_id = $1 AND actor_user_id = $2 AND skill_graph_run_id = $3
         AND concept_stable_id = $4 AND deduplication_sha256 = $5`,
      [input.academyId, input.actor.userId, input.skillGraphRunId, input.conceptStableId, key],
    );
    if (!existing.rows[0]) throw new Error('Coach feedback scope or concept lineage is invalid.');
    return { id: existing.rows[0].id, deduplicated: true };
  }

  async appendAiClaimFeedback(input: {
    academyId: string;
    actor: PilotActorInput;
    studentProfileId: string;
    playerId: string;
    artifactId: string;
    claimId: string;
    feedbackValue: AiClaimFeedbackValue;
    notUsefulReason: AiNotUsefulReason | null;
    requestId?: string | null | undefined;
    deduplicationKey: string;
    createdAt?: Date | undefined;
  }): Promise<PilotEventRecord> {
    const id = randomUUID();
    const key = digest(input.deduplicationKey);
    const inserted = await this.database.query<{ id: string }>(
      `INSERT INTO ai_claim_feedback (
         id, academy_id, actor_user_id, actor_membership_id, actor_role, session_id,
         student_profile_id, player_id, grounded_ai_artifact_id, grounded_ai_claim_id,
         feedback_value, not_useful_reason, request_id, deduplication_sha256, created_at
       )
       SELECT $1, artifact.academy_id, $3, $4, $5, $6,
              artifact.student_profile_id, artifact.player_id, artifact.id, $9,
              $10, $11, $12, $13, $14
       FROM grounded_ai_artifacts artifact
       WHERE artifact.id = $8 AND artifact.academy_id = $2
         AND artifact.student_profile_id = $7 AND artifact.player_id = $15
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(artifact.validated_output -> 'claims') claim
           WHERE claim ->> 'id' = $9
         )
       ON CONFLICT (grounded_ai_artifact_id, grounded_ai_claim_id, actor_user_id, deduplication_sha256)
       DO NOTHING RETURNING id`,
      [
        id,
        input.academyId,
        input.actor.userId,
        input.actor.membershipId,
        input.actor.role,
        input.actor.sessionId,
        input.studentProfileId,
        input.artifactId,
        input.claimId,
        input.feedbackValue,
        input.notUsefulReason,
        input.requestId ?? null,
        key,
        (input.createdAt ?? new Date()).toISOString(),
        input.playerId,
      ],
    );
    if (inserted.rows[0]) return { id: inserted.rows[0].id, deduplicated: false };
    const existing = await this.database.query<{ id: string }>(
      `SELECT id FROM ai_claim_feedback
       WHERE grounded_ai_artifact_id = $1 AND grounded_ai_claim_id = $2
         AND actor_user_id = $3 AND deduplication_sha256 = $4`,
      [input.artifactId, input.claimId, input.actor.userId, key],
    );
    if (!existing.rows[0]) throw new Error('AI feedback scope or claim lineage is invalid.');
    return { id: existing.rows[0].id, deduplicated: true };
  }

  async getStudentReadinessSignals(
    academyId: string,
    studentProfileId: string,
  ): Promise<PilotReadinessSignals | null> {
    const result = await this.database.query<{
      player_id: string;
      canonical_game_count: number | string;
      analyzed_game_count: number | string;
    }>(
      `SELECT student.player_id,
              COUNT(DISTINCT game_player.game_id) AS canonical_game_count,
              COUNT(DISTINCT run.game_id) FILTER (WHERE run.status = 'SUCCEEDED') AS analyzed_game_count
       FROM student_profiles student
       LEFT JOIN game_players game_player ON game_player.player_id = student.player_id
       LEFT JOIN analysis_runs run
         ON run.game_id = game_player.game_id AND run.status = 'SUCCEEDED'
       WHERE student.academy_id = $1 AND student.id = $2
       GROUP BY student.player_id`,
      [academyId, studentProfileId],
    );
    const row = result.rows[0];
    return row
      ? {
          playerId: row.player_id,
          canonicalGameCount: Number(row.canonical_game_count),
          analyzedGameCount: Number(row.analyzed_game_count),
        }
      : null;
  }

  async getAssignmentAttemptState(input: {
    assignmentId: string;
    trainingItemId: string;
    attemptId: string;
  }): Promise<{ firstPostAssignment: boolean; assignmentComplete: boolean } | null> {
    const result = await this.database.query<{
      first_post_assignment: boolean;
      assignment_complete: boolean;
    }>(
      `SELECT
         (SELECT attempt.id
          FROM training_attempts attempt
          JOIN training_assignments assignment ON assignment.id = $1
          WHERE attempt.training_item_id = $2
            AND attempt.player_id = assignment.player_id
            AND attempt.submitted_at >= assignment.assigned_at
          ORDER BY attempt.submitted_at, attempt.attempt_number, attempt.id LIMIT 1) = $3
           AS first_post_assignment,
         NOT EXISTS (
           SELECT 1 FROM training_assignment_items assigned
           JOIN training_assignments assignment ON assignment.id = assigned.assignment_id
           WHERE assigned.assignment_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM training_attempts attempt
               WHERE attempt.training_item_id = assigned.training_item_id
                 AND attempt.player_id = assignment.player_id
                 AND attempt.submitted_at >= assignment.assigned_at
             )
         ) AS assignment_complete
       WHERE EXISTS (
         SELECT 1 FROM training_assignment_items
         WHERE assignment_id = $1 AND training_item_id = $2
       )`,
      [input.assignmentId, input.trainingItemId, input.attemptId],
    );
    return result.rows[0]
      ? {
          firstPostAssignment: result.rows[0].first_post_assignment,
          assignmentComplete: result.rows[0].assignment_complete,
        }
      : null;
  }

  async exportMetrics(input: {
    academyId: string;
    fromInclusive: Date;
    toExclusive: Date;
    generatedAt?: Date | undefined;
  }): Promise<PilotMetricsExport> {
    const [
      eventsResult,
      coachFeedbackResult,
      aiFeedbackResult,
      membershipResult,
      coachConceptFeedbackResult,
      aiReasonResult,
    ] = await Promise.all([
      this.database.query<EventRow>(
        `SELECT event_type, outcome, actor_user_id, student_profile_id,
                  skill_graph_run_id, concept_stable_id,
                  grounded_ai_artifact_id, assignment_id, training_item_id, attempt_result
           FROM pilot_events
           WHERE academy_id = $1 AND occurred_at >= $2 AND occurred_at < $3
           ORDER BY occurred_at, id`,
        [input.academyId, input.fromInclusive.toISOString(), input.toExclusive.toISOString()],
      ),
      this.database.query<FeedbackCountRow>(
        `SELECT feedback_value, COUNT(*) AS count FROM coach_review_feedback
           WHERE academy_id = $1 AND created_at >= $2 AND created_at < $3
           GROUP BY feedback_value`,
        [input.academyId, input.fromInclusive.toISOString(), input.toExclusive.toISOString()],
      ),
      this.database.query<FeedbackCountRow>(
        `SELECT feedback_value, COUNT(*) AS count FROM ai_claim_feedback
           WHERE academy_id = $1 AND created_at >= $2 AND created_at < $3
           GROUP BY feedback_value`,
        [input.academyId, input.fromInclusive.toISOString(), input.toExclusive.toISOString()],
      ),
      this.database.query<{
        coach_denominator: number | string;
        student_denominator: number | string;
      }>(
        `SELECT
             COUNT(*) FILTER (WHERE membership.role IN ('OWNER', 'ADMIN', 'COACH'))
               AS coach_denominator,
             COUNT(*) FILTER (
               WHERE membership.role = 'STUDENT' AND student.id IS NOT NULL
             ) AS student_denominator
           FROM academy_memberships membership
           LEFT JOIN student_profiles student
             ON student.academy_membership_id = membership.id
            AND student.academy_id = membership.academy_id
           WHERE membership.academy_id = $1 AND membership.status = 'ACTIVE'`,
        [input.academyId],
      ),
      this.database.query<ConceptFeedbackCountRow>(
        `SELECT concept_stable_id, feedback_value, COUNT(*) AS count
           FROM coach_review_feedback
           WHERE academy_id = $1 AND created_at >= $2 AND created_at < $3
           GROUP BY concept_stable_id, feedback_value
           ORDER BY concept_stable_id, feedback_value`,
        [input.academyId, input.fromInclusive.toISOString(), input.toExclusive.toISOString()],
      ),
      this.database.query<AiReasonCountRow>(
        `SELECT not_useful_reason, COUNT(*) AS count
           FROM ai_claim_feedback
           WHERE academy_id = $1 AND created_at >= $2 AND created_at < $3
             AND feedback_value = 'NOT_USEFUL'
           GROUP BY not_useful_reason
           ORDER BY not_useful_reason`,
        [input.academyId, input.fromInclusive.toISOString(), input.toExclusive.toISOString()],
      ),
    ]);
    const events = eventsResult.rows;
    const eventCounts: Partial<Record<PilotEventType, number>> = {};
    for (const event of events)
      eventCounts[event.event_type] = (eventCounts[event.event_type] ?? 0) + 1;
    const coachEvents = events.filter((event) => event.event_type.startsWith('COACH_'));
    const studentEvents = events.filter((event) => event.event_type.startsWith('STUDENT_'));
    const reviewedPairs = new Set(
      events
        .filter((event) => event.event_type === 'COACH_OPENED_STUDENT_INTELLIGENCE')
        .map((event) => `${event.actor_user_id}:${event.student_profile_id}`),
    );
    const reviewedGraphContexts = new Set(
      events
        .filter(
          (event) =>
            event.event_type === 'COACH_OPENED_STUDENT_INTELLIGENCE' &&
            event.student_profile_id !== null &&
            event.skill_graph_run_id !== null,
        )
        .map(
          (event) =>
            `${event.actor_user_id}:${event.student_profile_id}:${event.skill_graph_run_id}`,
        ),
    );
    const conceptEvidenceClickContexts = new Set(
      events
        .filter(
          (event) =>
            event.event_type === 'COACH_OPENED_CONCEPT_EVIDENCE' &&
            event.student_profile_id !== null &&
            event.skill_graph_run_id !== null &&
            event.concept_stable_id !== null,
        )
        .map(
          (event) =>
            `${event.actor_user_id}:${event.student_profile_id}:${event.skill_graph_run_id}`,
        )
        .filter((context) => reviewedGraphContexts.has(context)),
    );
    const createdAssignments = new Set(
      events
        .filter((event) => event.event_type === 'COACH_CREATED_ASSIGNMENT')
        .map((event) => event.assignment_id)
        .filter((value): value is string => value !== null),
    );
    const openedAssignments = new Set(
      events
        .filter(
          (event) =>
            event.event_type === 'STUDENT_OPENED_ASSIGNMENT' &&
            event.assignment_id !== null &&
            createdAssignments.has(event.assignment_id),
        )
        .map((event) => event.assignment_id!),
    );
    const completedAssignments = new Set(
      events
        .filter(
          (event) =>
            event.event_type === 'STUDENT_COMPLETED_ASSIGNMENT' &&
            event.assignment_id !== null &&
            createdAssignments.has(event.assignment_id),
        )
        .map((event) => event.assignment_id!),
    );
    const firstAttempts = events.filter(
      (event) => event.event_type === 'STUDENT_SUBMITTED_FIRST_ATTEMPT',
    );
    const aiAttempts = events.filter((event) => event.event_type === 'COACH_GENERATED_AI_BRIEF');
    const successfulArtifacts = new Set(
      aiAttempts
        .filter((event) => event.outcome === 'SUCCESS')
        .map((event) => event.grounded_ai_artifact_id)
        .filter((value): value is string => value !== null),
    );
    const clickedArtifacts = new Set(
      events
        .filter(
          (event) =>
            event.event_type === 'COACH_OPENED_AI_CLAIM_EVIDENCE' &&
            event.grounded_ai_artifact_id !== null &&
            successfulArtifacts.has(event.grounded_ai_artifact_id),
        )
        .map((event) => event.grounded_ai_artifact_id!),
    );
    const coachFeedback = Object.fromEntries(
      coachFeedbackResult.rows.map((row) => [row.feedback_value, number(row.count)]),
    );
    const aiFeedback = Object.fromEntries(
      aiFeedbackResult.rows.map((row) => [row.feedback_value, number(row.count)]),
    );
    const coachFeedbackTotal = Object.values(coachFeedback).reduce((sum, value) => sum + value, 0);
    const aiFeedbackTotal = Object.values(aiFeedback).reduce((sum, value) => sum + value, 0);
    const conceptFeedback = new Map<string, { agree: number; unsure: number; disagree: number }>();
    for (const row of coachConceptFeedbackResult.rows) {
      const counts = conceptFeedback.get(row.concept_stable_id) ?? {
        agree: 0,
        unsure: 0,
        disagree: 0,
      };
      const count = number(row.count);
      if (row.feedback_value === 'AGREE') counts.agree += count;
      if (row.feedback_value === 'UNSURE') counts.unsure += count;
      if (row.feedback_value === 'DISAGREE') counts.disagree += count;
      conceptFeedback.set(row.concept_stable_id, counts);
    }
    const membership = membershipResult.rows[0];
    const coachActors = countDistinct(coachEvents.map((event) => event.actor_user_id));
    return {
      version: 'PILOT_METRICS_EXPORT_V1',
      academyId: input.academyId,
      fromInclusive: input.fromInclusive.toISOString(),
      toExclusive: input.toExclusive.toISOString(),
      generatedAt: (input.generatedAt ?? new Date()).toISOString(),
      metrics: {
        coachWeeklyUsage: pilotMetric(
          coachActors,
          number(membership?.coach_denominator),
          'distinct operational actors with Coach events / active OWNER+ADMIN+COACH memberships',
        ),
        studentWeeklyUsage: pilotMetric(
          countDistinct(studentEvents.map((event) => event.actor_user_id)),
          number(membership?.student_denominator),
          'distinct Student actors with Student events / active linked Student memberships',
        ),
        studentsReviewedPerCoach: pilotMetric(
          reviewedPairs.size,
          coachActors,
          'distinct Coach-Student review pairs / active Coach-event actors',
        ),
        assignmentsCreated: pilotMetric(
          createdAssignments.size,
          null,
          'distinct assignments created in the export window',
        ),
        assignmentStartRate: pilotMetric(
          openedAssignments.size,
          createdAssignments.size,
          'created-window assignments opened by the assigned Student / created-window assignments',
        ),
        assignmentCompletionRate: pilotMetric(
          completedAssignments.size,
          createdAssignments.size,
          'created-window assignments completed / created-window assignments',
        ),
        trainingItemsCompleted: pilotMetric(
          countDistinct(
            events
              .filter((event) => event.event_type === 'STUDENT_COMPLETED_TRAINING_ITEM')
              .map((event) => event.training_item_id),
          ),
          null,
          'distinct assigned TrainingItems completed in the export window',
        ),
        firstAttemptCorrectRate: pilotMetric(
          firstAttempts.filter((event) => event.attempt_result === 'CORRECT').length,
          firstAttempts.length,
          'correct first post-assignment attempts / all first post-assignment attempts',
        ),
        coachAgreementRate: pilotMetric(
          coachFeedback.AGREE ?? 0,
          coachFeedbackTotal,
          'AGREE Coach priority feedback / all Coach priority feedback',
        ),
        coachDisagreementRate: pilotMetric(
          coachFeedback.DISAGREE ?? 0,
          coachFeedbackTotal,
          'DISAGREE Coach priority feedback / all Coach priority feedback',
        ),
        aiGenerationSuccessRate: pilotMetric(
          aiAttempts.filter((event) => event.outcome === 'SUCCESS').length,
          aiAttempts.length,
          'validated persisted Coach AI briefs / all Coach AI generation attempts',
        ),
        aiValidationRejectionRate: pilotMetric(
          aiAttempts.filter((event) => event.outcome === 'AI_OUTPUT_INVALID').length,
          aiAttempts.length,
          'server-rejected AI outputs / all Coach AI generation attempts',
        ),
        aiEvidenceClickthroughRate: pilotMetric(
          clickedArtifacts.size,
          successfulArtifacts.size,
          'successful Coach AI artifacts with an evidence click / successful Coach AI artifacts',
        ),
        conceptEvidenceClickthroughRate: pilotMetric(
          conceptEvidenceClickContexts.size,
          reviewedGraphContexts.size,
          'Coach Student Intelligence graph views with an exact concept-evidence click / Coach Student Intelligence graph views',
        ),
        aiUsefulRate: pilotMetric(
          aiFeedback.USEFUL ?? 0,
          aiFeedbackTotal,
          'USEFUL AI claim feedback / all AI claim feedback',
        ),
        supportIncidents: pilotMetric(
          0,
          null,
          'manual support-log count; merge through the guarded export CLI before weekly review',
        ),
      },
      breakdowns: {
        coachFeedbackByConcept: [...conceptFeedback.entries()].map(([conceptStableId, counts]) => {
          const total = counts.agree + counts.unsure + counts.disagree;
          return {
            conceptStableId,
            ...counts,
            total,
            agreementRate: total === 0 ? null : counts.agree / total,
            disagreementRate: total === 0 ? null : counts.disagree / total,
          };
        }),
        aiNotUsefulReasons: Object.fromEntries(
          aiReasonResult.rows.map((row) => [row.not_useful_reason, number(row.count)]),
        ),
      },
      eventCounts,
      interpretation: 'USAGE_AND_WORKFLOW_OBSERVATION_NOT_LEARNING_EFFECTIVENESS',
    };
  }
}
