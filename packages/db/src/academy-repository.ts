import { randomUUID } from 'node:crypto';

import {
  TRAINING_ASSIGNMENT_POLICY_VERSION,
  classifyAssignmentMeasurement,
  type AcademyMembershipRoleV1,
  type AcademyMembershipStatus,
  type AssignmentMeasurementStatus,
  type StudentIntelligenceProfile,
  type TrainingCandidateType,
} from '@chess-intelligent/domain';

import type { Database, QueryClient } from './database';
import { dateOnly } from './date-values';
import { appendSecurityAuditEvent } from './security-audit-repository';

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export type AcademyMembershipRole = AcademyMembershipRoleV1;

export interface AcademyRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface AcademyMembershipRecord {
  id: string;
  academyId: string;
  userId: string | null;
  role: AcademyMembershipRole;
  status: AcademyMembershipStatus;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentProfileRecord {
  id: string;
  academyId: string;
  academyMembershipId: string;
  displayName: string;
  playerId: string;
  playerDisplayName: string;
  fideId: string | null;
  requiresGuardianConsent: boolean;
  createdAt: string;
}

export interface RosterProjectionRow {
  student: StudentProfileRecord;
  totalStudents: number;
  skillGraph: {
    id: string;
    ontologyVersion: string;
    skillGraphPolicyVersion: string;
    policyConfigSha256: string;
    evidenceScopeSha256: string;
    asOfDate: string;
    completedAt: string | null;
    coverage: {
      canonicalGames: number;
      decisionOccurrences: number;
      classifiedDecisions: number;
      engineBackedDecisions: number;
      masteryEligibleEvidence: number;
      trainingMeasurementUnits: number;
      estimatedConcepts: number;
      insufficientConcepts: number;
      noEvidenceConcepts: number;
    };
  } | null;
  newTrainingEvidenceCount: number;
  lastTrainingAt: string | null;
  activeAssignment: {
    id: string;
    assignedAt: string;
    dueAt: string | null;
    itemCount: number;
    completedItemCount: number;
  } | null;
  completedAssignmentReviewAvailable: boolean;
}

export interface StudentTrainingSummary {
  trainingPlans: number;
  trainingItemsSeen: number;
  distinctScoredItems: number;
  attemptCount: number;
  firstAttemptCorrect: number;
  firstAttemptIncorrect: number;
  diagnosticItems: number;
  remediationItems: number;
  lastTrainingAt: string | null;
}

export interface AssignableTrainingPlan {
  id: string;
  playerId: string;
  skillGraphRunId: string;
  ontologyVersion: string;
  createdAt: string;
  items: Array<{
    id: string;
    conceptStableId: string;
    trainingMode: TrainingCandidateType;
    itemType: 'FIND_BEST_MOVE';
    previouslyScored: boolean;
    assignmentMeasurementStatus: AssignmentMeasurementStatus | null;
    assignmentRejection: 'DIAGNOSTIC_ITEM_ALREADY_MEASURED' | null;
  }>;
}

export interface TrainingAssignmentItemRecord {
  id: string;
  trainingItemId: string;
  conceptStableId: string;
  trainingMode: TrainingCandidateType;
  measurementStatus: AssignmentMeasurementStatus;
  ordinal: number;
  firstPostAssignmentAttempt: {
    id: string;
    result: 'CORRECT' | 'INCORRECT';
    submittedAt: string;
    attemptNumber: number;
  } | null;
  postAssignmentAttemptCount: number;
}

export interface TrainingAssignmentRecord {
  id: string;
  academyId: string;
  studentProfileId: string;
  studentDisplayName: string;
  playerId: string;
  assignedByCoachMembershipId: string;
  coachDisplayName: string;
  trainingPlanRunId: string;
  baselineSkillGraphRunId: string;
  assignmentPolicyVersion: string;
  assignedAt: string;
  dueAt: string | null;
  cancelledAt: string | null;
  note: string | null;
  createdAt: string;
  items: TrainingAssignmentItemRecord[];
}

export interface CreateTrainingAssignmentInput {
  academyId: string;
  studentProfileId: string;
  coachMembershipId: string;
  trainingPlanRunId: string;
  baselineSkillGraphRunId: string;
  trainingItemIds: readonly string[];
  dueAt?: string | null | undefined;
  note?: string | null | undefined;
}

export type AcademyRepositoryErrorCode =
  | 'ACADEMY_NOT_FOUND'
  | 'ACADEMY_MEMBERSHIP_NOT_FOUND'
  | 'COACH_MEMBERSHIP_REQUIRED'
  | 'STUDENT_MEMBERSHIP_REQUIRED'
  | 'STUDENT_PROFILE_NOT_FOUND'
  | 'PLAYER_NOT_FOUND'
  | 'TRAINING_PLAN_NOT_FOUND'
  | 'TRAINING_PLAN_PLAYER_MISMATCH'
  | 'ASSIGNMENT_BASELINE_MISMATCH'
  | 'TRAINING_ITEM_NOT_IN_PLAN'
  | 'DIAGNOSTIC_ITEM_ALREADY_MEASURED'
  | 'TRAINING_ASSIGNMENT_NOT_FOUND'
  | 'TRAINING_ASSIGNMENT_NOT_ACTIVE';

export class AcademyRepositoryError extends Error {
  constructor(
    readonly code: AcademyRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AcademyRepositoryError';
  }
}

interface AcademyRow {
  id: string;
  name: string;
  created_at: string | Date;
}

interface MembershipRow {
  id: string;
  academy_id: string;
  user_id: string | null;
  role: AcademyMembershipRole;
  status: AcademyMembershipStatus;
  display_name: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface StudentRow {
  id: string;
  academy_id: string;
  academy_membership_id: string;
  display_name: string;
  player_id: string;
  player_display_name: string;
  fide_id: string | null;
  requires_guardian_consent: boolean;
  created_at: string | Date;
}

interface RosterRow extends StudentRow {
  total_students: number;
  graph_id: string | null;
  ontology_version: string | null;
  skill_graph_policy_version: string | null;
  policy_config_sha256: string | null;
  evidence_scope_sha256: string | null;
  as_of_date: string | Date | null;
  graph_completed_at: string | Date | null;
  canonical_games: number | null;
  decision_occurrences: number | null;
  classified_decisions: number | null;
  engine_backed_decisions: number | null;
  mastery_eligible_evidence: number | null;
  training_measurement_units: number | null;
  estimated_concepts: number | null;
  insufficient_concepts: number | null;
  no_evidence_concepts: number | null;
  new_training_evidence_count: number | null;
  last_training_at: string | Date | null;
  active_assignment_id: string | null;
  active_assignment_assigned_at: string | Date | null;
  active_assignment_due_at: string | Date | null;
  active_assignment_item_count: number | null;
  active_assignment_completed_count: number | null;
  completed_review_available: boolean;
}

interface AssignmentRow {
  assignment_id: string;
  academy_id: string;
  student_profile_id: string;
  student_display_name: string;
  player_id: string;
  assigned_by_coach_membership_id: string;
  coach_display_name: string;
  training_plan_run_id: string;
  baseline_skill_graph_run_id: string;
  assignment_policy_version: string;
  assigned_at: string | Date;
  due_at: string | Date | null;
  cancelled_at: string | Date | null;
  note: string | null;
  assignment_created_at: string | Date;
  assignment_item_id: string | null;
  training_item_id: string | null;
  concept_stable_id: string | null;
  training_mode: TrainingCandidateType | null;
  measurement_status: AssignmentMeasurementStatus | null;
  ordinal: number | null;
  first_attempt_id: string | null;
  first_attempt_result: 'CORRECT' | 'INCORRECT' | null;
  first_attempt_submitted_at: string | Date | null;
  first_attempt_number: number | null;
  post_assignment_attempt_count: number;
}

interface PlanItemRow {
  plan_id: string;
  player_id: string;
  skill_graph_run_id: string;
  ontology_version: string;
  plan_created_at: string | Date;
  item_id: string;
  concept_stable_id: string;
  training_mode: TrainingCandidateType;
  item_type: 'FIND_BEST_MOVE';
  previously_scored: boolean;
}

export class AcademyRepository {
  constructor(private readonly database: Database) {}

  async createAcademy(name: string): Promise<AcademyRecord> {
    const result = await this.database.query<AcademyRow>(
      `INSERT INTO academies (id, name) VALUES ($1, $2) RETURNING *`,
      [randomUUID(), name],
    );
    return this.academy(result.rows[0]!);
  }

  async createOwnedAcademy(input: {
    name: string;
    userId: string;
    sessionId: string;
    now: Date;
    requestId?: string | null | undefined;
  }): Promise<{ academy: AcademyRecord; membership: AcademyMembershipRecord }> {
    return this.database.transaction(async (client) => {
      const user = await client.query<{ display_name: string | null; email: string }>(
        `SELECT display_name, email FROM users WHERE id = $1 AND status = 'ACTIVE'`,
        [input.userId],
      );
      if (!user.rows[0]) {
        throw new AcademyRepositoryError(
          'ACADEMY_MEMBERSHIP_NOT_FOUND',
          'The active User required for Academy creation does not exist.',
        );
      }
      const academyId = randomUUID();
      const membershipId = randomUUID();
      const academy = await client.query<AcademyRow>(
        `INSERT INTO academies (id, name, created_at)
         VALUES ($1, $2, $3) RETURNING *`,
        [academyId, input.name, input.now.toISOString()],
      );
      const membership = await client.query<MembershipRow>(
        `INSERT INTO academy_memberships (
           id, academy_id, user_id, role, status, display_name, created_at, updated_at
         ) VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', $4, $5, $5)
         RETURNING *`,
        [
          membershipId,
          academyId,
          input.userId,
          user.rows[0].display_name ?? user.rows[0].email,
          input.now.toISOString(),
        ],
      );
      await appendSecurityAuditEvent(client, {
        academyId,
        actorUserId: input.userId,
        actorMembershipId: membershipId,
        sessionId: input.sessionId,
        action: 'ACADEMY_CREATED',
        targetType: 'ACADEMY',
        targetId: academyId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
      });
      await appendSecurityAuditEvent(client, {
        academyId,
        actorUserId: input.userId,
        actorMembershipId: membershipId,
        sessionId: input.sessionId,
        action: 'MEMBERSHIP_ENABLED',
        targetType: 'ACADEMY_MEMBERSHIP',
        targetId: membershipId,
        outcome: 'SUCCESS',
        requestId: input.requestId,
        occurredAt: input.now,
        metadata: { role: 'OWNER', selfServiceOnboarding: true },
      });
      return {
        academy: this.academy(academy.rows[0]!),
        membership: this.membership(membership.rows[0]!),
      };
    });
  }

  async createMembership(input: {
    academyId: string;
    role: AcademyMembershipRole;
    displayName: string;
  }): Promise<AcademyMembershipRecord> {
    await this.requireAcademy(input.academyId);
    const result = await this.database.query<MembershipRow>(
      `INSERT INTO academy_memberships (id, academy_id, role, display_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [randomUUID(), input.academyId, input.role, input.displayName],
    );
    return this.membership(result.rows[0]!);
  }

  async createStudentProfile(input: {
    academyId: string;
    membershipId: string;
    playerId: string;
    requiresGuardianConsent?: boolean | undefined;
  }): Promise<StudentProfileRecord> {
    const membership = await this.database.query<MembershipRow>(
      `SELECT * FROM academy_memberships
       WHERE id = $1 AND academy_id = $2 AND role = 'STUDENT'`,
      [input.membershipId, input.academyId],
    );
    if (!membership.rows[0]) {
      throw new AcademyRepositoryError(
        'STUDENT_MEMBERSHIP_REQUIRED',
        'The StudentProfile requires a STUDENT membership in the same Academy.',
      );
    }
    const player = await this.database.query<{ id: string }>(
      `SELECT id FROM players WHERE id = $1`,
      [input.playerId],
    );
    if (!player.rows[0]) {
      throw new AcademyRepositoryError('PLAYER_NOT_FOUND', 'The canonical Player does not exist.');
    }
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO student_profiles (
         id, academy_id, academy_membership_id, membership_role, player_id,
         requires_guardian_consent
       ) VALUES ($1, $2, $3, 'STUDENT', $4, $5)`,
      [
        id,
        input.academyId,
        input.membershipId,
        input.playerId,
        input.requiresGuardianConsent ?? false,
      ],
    );
    return (await this.getStudentProfile(input.academyId, id))!;
  }

  async requireCoachMembership(
    academyId: string,
    membershipId: string,
  ): Promise<AcademyMembershipRecord> {
    const result = await this.database.query<MembershipRow>(
      `SELECT * FROM academy_memberships
       WHERE id = $1 AND academy_id = $2
         AND role IN ('OWNER', 'ADMIN', 'COACH') AND status = 'ACTIVE'`,
      [membershipId, academyId],
    );
    if (!result.rows[0]) {
      throw new AcademyRepositoryError(
        'COACH_MEMBERSHIP_REQUIRED',
        'An active operational membership in the requested Academy is required.',
      );
    }
    return this.membership(result.rows[0]);
  }

  async getStudentProfile(
    academyId: string,
    studentProfileId: string,
  ): Promise<StudentProfileRecord | null> {
    const result = await this.database.query<StudentRow>(
      `SELECT student.id, student.academy_id, student.academy_membership_id,
              membership.display_name, student.player_id,
              player.display_name AS player_display_name, fide.external_id AS fide_id,
              student.requires_guardian_consent, student.created_at
       FROM student_profiles student
       JOIN academy_memberships membership ON membership.id = student.academy_membership_id
       JOIN players player ON player.id = student.player_id
       LEFT JOIN LATERAL (
         SELECT identity.external_id
         FROM external_identities identity
         WHERE identity.player_id = student.player_id AND identity.provider = 'FIDE'
           AND identity.verification_status = 'VERIFIED'
         ORDER BY identity.created_at, identity.id LIMIT 1
       ) fide ON true
       WHERE student.id = $1 AND student.academy_id = $2`,
      [studentProfileId, academyId],
    );
    return result.rows[0] ? this.student(result.rows[0]) : null;
  }

  async listRoster(input: {
    academyId: string;
    profile: StudentIntelligenceProfile;
    limit: number;
    offset: number;
  }): Promise<RosterProjectionRow[]> {
    const profile = input.profile;
    const result = await this.database.query<RosterRow>(
      `WITH scoped_students AS (
         SELECT student.id, student.academy_id, student.academy_membership_id,
                membership.display_name, student.player_id,
                player.display_name AS player_display_name, fide.external_id AS fide_id,
                student.requires_guardian_consent, student.created_at,
                count(*) OVER ()::int AS total_students
         FROM student_profiles student
         JOIN academy_memberships membership ON membership.id = student.academy_membership_id
         JOIN players player ON player.id = student.player_id
         LEFT JOIN LATERAL (
           SELECT identity.external_id
           FROM external_identities identity
           WHERE identity.player_id = student.player_id AND identity.provider = 'FIDE'
             AND identity.verification_status = 'VERIFIED'
           ORDER BY identity.created_at, identity.id LIMIT 1
         ) fide ON true
         WHERE student.academy_id = $1
         ORDER BY membership.display_name, student.id
         LIMIT $9 OFFSET $10
       ), compatible_graphs AS (
         SELECT graph.*,
                row_number() OVER (
                  PARTITION BY graph.player_id
                  ORDER BY graph.as_of_date DESC, graph.completed_at DESC, graph.id DESC
                ) AS graph_rank
         FROM player_skill_graph_runs graph
         JOIN scoped_students student ON student.player_id = graph.player_id
         WHERE graph.status = 'SUCCEEDED' AND graph.ontology_version = $2
           AND graph.skill_graph_policy_version = $3 AND graph.policy_config_sha256 = $4
           AND graph.evidence_scope_sha256 = $5 AND graph.classifier_bundle_version = $6
           AND graph.classifier_config_sha256 = $7
           AND graph.classification_selection_policy_version = $8
       ), latest_graph AS (
         SELECT * FROM compatible_graphs WHERE graph_rank = 1
       ), state_summary AS (
         SELECT state.skill_graph_run_id,
                count(*) FILTER (WHERE state.status = 'ESTIMATED')::int AS estimated_concepts,
                count(*) FILTER (WHERE state.status = 'INSUFFICIENT_EVIDENCE')::int
                  AS insufficient_concepts,
                count(*) FILTER (WHERE state.status = 'NO_EVIDENCE')::int AS no_evidence_concepts
         FROM player_concept_states state
         JOIN latest_graph graph ON graph.id = state.skill_graph_run_id
         GROUP BY state.skill_graph_run_id
       ), first_training_evidence AS (
         SELECT DISTINCT ON (attempt.player_id, attempt.training_item_id)
                attempt.player_id, attempt.training_item_id, attempt.submitted_at,
                evidence.id AS evidence_id, evidence.ontology_version
         FROM training_attempts attempt
         JOIN training_evidence_instances evidence ON evidence.training_attempt_id = attempt.id
         JOIN scoped_students student ON student.player_id = attempt.player_id
         ORDER BY attempt.player_id, attempt.training_item_id,
                  attempt.attempt_number, attempt.submitted_at, attempt.id
       ), training_activity AS (
         SELECT attempt.player_id, max(attempt.submitted_at) AS last_training_at
         FROM training_attempts attempt
         JOIN scoped_students student ON student.player_id = attempt.player_id
         GROUP BY attempt.player_id
       ), fresh_training AS (
         SELECT graph.id AS skill_graph_run_id, count(first.evidence_id)::int AS evidence_count
         FROM latest_graph graph
         JOIN first_training_evidence first ON first.player_id = graph.player_id
           AND first.ontology_version = graph.ontology_version
         WHERE NOT EXISTS (
           SELECT 1 FROM skill_graph_training_evidence_contributions selected
           WHERE selected.skill_graph_run_id = graph.id
             AND selected.training_evidence_instance_id = first.evidence_id
         )
         GROUP BY graph.id
       ), assignment_progress AS (
         SELECT assignment.id, assignment.student_profile_id, assignment.player_id,
                assignment.assigned_at, assignment.due_at, assignment.cancelled_at,
                count(item.id)::int AS item_count,
                count(item.id) FILTER (WHERE EXISTS (
                  SELECT 1 FROM training_attempts attempt
                  WHERE attempt.player_id = assignment.player_id
                    AND attempt.training_item_id = item.training_item_id
                    AND attempt.submitted_at >= assignment.assigned_at
                ))::int AS completed_item_count
         FROM training_assignments assignment
         JOIN scoped_students student ON student.id = assignment.student_profile_id
         LEFT JOIN training_assignment_items item ON item.assignment_id = assignment.id
         GROUP BY assignment.id
       ), active_assignments AS (
         SELECT progress.*,
                row_number() OVER (
                  PARTITION BY progress.student_profile_id
                  ORDER BY progress.assigned_at DESC, progress.id DESC
                ) AS assignment_rank
         FROM assignment_progress progress
         WHERE progress.cancelled_at IS NULL
           AND progress.completed_item_count < progress.item_count
       ), completed_review AS (
         SELECT DISTINCT progress.student_profile_id
         FROM assignment_progress progress
         JOIN training_assignment_items item ON item.assignment_id = progress.id
         JOIN first_training_evidence first
           ON first.player_id = progress.player_id
          AND first.training_item_id = item.training_item_id
          AND first.submitted_at >= progress.assigned_at
         JOIN latest_graph graph ON graph.player_id = progress.player_id
         WHERE progress.cancelled_at IS NULL
           AND progress.item_count > 0
           AND progress.completed_item_count = progress.item_count
           AND NOT EXISTS (
             SELECT 1 FROM skill_graph_training_evidence_contributions selected
             WHERE selected.skill_graph_run_id = graph.id
               AND selected.training_evidence_instance_id = first.evidence_id
           )
       )
       SELECT student.*, graph.id AS graph_id, graph.ontology_version,
              graph.skill_graph_policy_version, graph.policy_config_sha256,
              graph.evidence_scope_sha256, graph.as_of_date,
              graph.completed_at AS graph_completed_at,
              graph.selected_canonical_game_count AS canonical_games,
              graph.decision_occurrence_count AS decision_occurrences,
              graph.classified_decision_count AS classified_decisions,
              graph.engine_backed_decision_count AS engine_backed_decisions,
              graph.mastery_eligible_evidence_count AS mastery_eligible_evidence,
              graph.selected_training_item_count AS training_measurement_units,
              state.estimated_concepts, state.insufficient_concepts, state.no_evidence_concepts,
              COALESCE(fresh.evidence_count, 0)::int AS new_training_evidence_count,
              activity.last_training_at,
              active.id AS active_assignment_id,
              active.assigned_at AS active_assignment_assigned_at,
              active.due_at AS active_assignment_due_at,
              active.item_count AS active_assignment_item_count,
              active.completed_item_count AS active_assignment_completed_count,
              (review.student_profile_id IS NOT NULL) AS completed_review_available
       FROM scoped_students student
       LEFT JOIN latest_graph graph ON graph.player_id = student.player_id
       LEFT JOIN state_summary state ON state.skill_graph_run_id = graph.id
       LEFT JOIN fresh_training fresh ON fresh.skill_graph_run_id = graph.id
       LEFT JOIN training_activity activity ON activity.player_id = student.player_id
       LEFT JOIN active_assignments active
         ON active.student_profile_id = student.id AND active.assignment_rank = 1
       LEFT JOIN completed_review review ON review.student_profile_id = student.id
       ORDER BY student.display_name, student.id`,
      [
        input.academyId,
        profile.ontologyVersion,
        profile.skillGraphPolicyVersion,
        profile.policyConfigSha256,
        profile.evidenceScopeSha256,
        profile.classifierBundleVersion,
        profile.classifierConfigSha256,
        profile.classificationSelectionPolicyVersion,
        input.limit,
        input.offset,
      ],
    );
    return result.rows.map((row) => this.roster(row));
  }

  async findLatestCompatibleSkillGraphRunId(
    playerId: string,
    profile: StudentIntelligenceProfile,
  ): Promise<string | null> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM player_skill_graph_runs
       WHERE player_id = $1 AND status = 'SUCCEEDED' AND ontology_version = $2
         AND skill_graph_policy_version = $3 AND policy_config_sha256 = $4
         AND evidence_scope_sha256 = $5 AND classifier_bundle_version = $6
         AND classifier_config_sha256 = $7
         AND classification_selection_policy_version = $8
       ORDER BY as_of_date DESC, completed_at DESC, id DESC LIMIT 1`,
      [
        playerId,
        profile.ontologyVersion,
        profile.skillGraphPolicyVersion,
        profile.policyConfigSha256,
        profile.evidenceScopeSha256,
        profile.classifierBundleVersion,
        profile.classifierConfigSha256,
        profile.classificationSelectionPolicyVersion,
      ],
    );
    return result.rows[0]?.id ?? null;
  }

  async countNewTrainingEvidence(input: {
    skillGraphRunId: string;
    playerId: string;
    ontologyVersion: string;
  }): Promise<number> {
    const result = await this.database.query<{ count: number }>(
      `WITH first_training_evidence AS (
         SELECT DISTINCT ON (attempt.training_item_id)
                evidence.id AS evidence_id
         FROM training_attempts attempt
         JOIN training_evidence_instances evidence ON evidence.training_attempt_id = attempt.id
         WHERE attempt.player_id = $2 AND evidence.ontology_version = $3
         ORDER BY attempt.training_item_id, attempt.attempt_number, attempt.submitted_at, attempt.id
       )
       SELECT count(*)::int AS count FROM first_training_evidence first
       WHERE NOT EXISTS (
         SELECT 1 FROM skill_graph_training_evidence_contributions selected
         WHERE selected.skill_graph_run_id = $1
           AND selected.training_evidence_instance_id = first.evidence_id
       )`,
      [input.skillGraphRunId, input.playerId, input.ontologyVersion],
    );
    return result.rows[0]?.count ?? 0;
  }

  async getTrainingSummary(playerId: string): Promise<StudentTrainingSummary> {
    const result = await this.database.query<{
      training_plans: number;
      training_items_seen: number;
      distinct_scored_items: number;
      attempt_count: number;
      first_attempt_correct: number;
      first_attempt_incorrect: number;
      diagnostic_items: number;
      remediation_items: number;
      last_training_at: string | Date | null;
    }>(
      `WITH first_attempts AS (
         SELECT DISTINCT ON (attempt.training_item_id)
                attempt.training_item_id, attempt.result, attempt.submitted_at,
                item.training_mode
         FROM training_attempts attempt
         JOIN training_items item ON item.id = attempt.training_item_id
         WHERE attempt.player_id = $1
         ORDER BY attempt.training_item_id, attempt.attempt_number,
                  attempt.submitted_at, attempt.id
       )
       SELECT
         (SELECT count(*)::int FROM training_plan_runs plan
          WHERE plan.player_id = $1 AND plan.status = 'SUCCEEDED') AS training_plans,
         (SELECT count(DISTINCT attempt.training_item_id)::int
          FROM training_attempts attempt WHERE attempt.player_id = $1) AS training_items_seen,
         count(first.training_item_id)::int AS distinct_scored_items,
         (SELECT count(*)::int FROM training_attempts attempt
          WHERE attempt.player_id = $1) AS attempt_count,
         count(*) FILTER (WHERE first.result = 'CORRECT')::int AS first_attempt_correct,
         count(*) FILTER (WHERE first.result = 'INCORRECT')::int AS first_attempt_incorrect,
         count(*) FILTER (WHERE first.training_mode = 'DIAGNOSTIC')::int AS diagnostic_items,
         count(*) FILTER (WHERE first.training_mode = 'REMEDIATION')::int AS remediation_items,
         max(first.submitted_at) AS last_training_at
       FROM first_attempts first`,
      [playerId],
    );
    const row = result.rows[0]!;
    return {
      trainingPlans: row.training_plans,
      trainingItemsSeen: row.training_items_seen,
      distinctScoredItems: row.distinct_scored_items,
      attemptCount: row.attempt_count,
      firstAttemptCorrect: row.first_attempt_correct,
      firstAttemptIncorrect: row.first_attempt_incorrect,
      diagnosticItems: row.diagnostic_items,
      remediationItems: row.remediation_items,
      lastTrainingAt: iso(row.last_training_at),
    };
  }

  async listAssignableTrainingPlans(playerId: string): Promise<AssignableTrainingPlan[]> {
    const result = await this.database.query<PlanItemRow>(
      `SELECT plan.id AS plan_id, plan.player_id, plan.skill_graph_run_id,
              plan.ontology_version, plan.created_at AS plan_created_at,
              item.id AS item_id, item.concept_stable_id, item.training_mode, item.item_type,
              EXISTS (
                SELECT 1 FROM training_attempts attempt
                WHERE attempt.player_id = plan.player_id AND attempt.training_item_id = item.id
              ) AS previously_scored
       FROM training_plan_runs plan
       JOIN training_items item ON item.training_plan_run_id = plan.id
       WHERE plan.player_id = $1 AND plan.status = 'SUCCEEDED'
       ORDER BY plan.created_at DESC, plan.id DESC, item.created_at, item.id`,
      [playerId],
    );
    const plans = new Map<string, AssignableTrainingPlan>();
    for (const row of result.rows) {
      let plan = plans.get(row.plan_id);
      if (!plan) {
        plan = {
          id: row.plan_id,
          playerId: row.player_id,
          skillGraphRunId: row.skill_graph_run_id,
          ontologyVersion: row.ontology_version,
          createdAt: iso(row.plan_created_at)!,
          items: [],
        };
        plans.set(row.plan_id, plan);
      }
      const measurement = classifyAssignmentMeasurement(row.training_mode, row.previously_scored);
      plan.items.push({
        id: row.item_id,
        conceptStableId: row.concept_stable_id,
        trainingMode: row.training_mode,
        itemType: row.item_type,
        previouslyScored: row.previously_scored,
        assignmentMeasurementStatus: measurement.measurementStatus,
        assignmentRejection: measurement.rejection,
      });
    }
    return [...plans.values()];
  }

  async createTrainingAssignment(
    input: CreateTrainingAssignmentInput,
  ): Promise<TrainingAssignmentRecord> {
    const assignmentId = await this.database.transaction(async (client) => {
      const actorRole = await this.requireAssignmentActor(
        client,
        input.academyId,
        input.coachMembershipId,
      );
      const student = await client.query<{ player_id: string }>(
        `SELECT player_id FROM student_profiles
         WHERE id = $1 AND academy_id = $2`,
        [input.studentProfileId, input.academyId],
      );
      const playerId = student.rows[0]?.player_id;
      if (!playerId) {
        throw new AcademyRepositoryError(
          'STUDENT_PROFILE_NOT_FOUND',
          'The StudentProfile does not belong to the requested Academy.',
        );
      }
      const plan = await client.query<{
        player_id: string;
        skill_graph_run_id: string;
      }>(
        `SELECT player_id, skill_graph_run_id FROM training_plan_runs
         WHERE id = $1 AND status = 'SUCCEEDED'`,
        [input.trainingPlanRunId],
      );
      if (!plan.rows[0]) {
        throw new AcademyRepositoryError(
          'TRAINING_PLAN_NOT_FOUND',
          'The successful TrainingPlanRun does not exist.',
        );
      }
      if (plan.rows[0].player_id !== playerId) {
        throw new AcademyRepositoryError(
          'TRAINING_PLAN_PLAYER_MISMATCH',
          'The TrainingPlan belongs to a different canonical Player.',
        );
      }
      if (plan.rows[0].skill_graph_run_id !== input.baselineSkillGraphRunId) {
        throw new AcademyRepositoryError(
          'ASSIGNMENT_BASELINE_MISMATCH',
          'The assignment baseline must be the TrainingPlan Skill Graph run.',
        );
      }
      const uniqueItemIds = [...new Set(input.trainingItemIds)];
      const items = await client.query<{
        id: string;
        training_mode: TrainingCandidateType;
        previously_scored: boolean;
      }>(
        `SELECT item.id, item.training_mode,
                EXISTS (
                  SELECT 1 FROM training_attempts attempt
                  WHERE attempt.player_id = $2 AND attempt.training_item_id = item.id
                ) AS previously_scored
         FROM training_items item
         WHERE item.id = ANY($1::uuid[]) AND item.training_plan_run_id = $3
           AND item.player_id = $2
         ORDER BY item.created_at, item.id`,
        [uniqueItemIds, playerId, input.trainingPlanRunId],
      );
      if (items.rows.length !== uniqueItemIds.length) {
        throw new AcademyRepositoryError(
          'TRAINING_ITEM_NOT_IN_PLAN',
          'Every assigned TrainingItem must belong to the selected Student Player and plan.',
        );
      }
      const interpreted = items.rows.map((item) => ({
        item,
        measurement: classifyAssignmentMeasurement(item.training_mode, item.previously_scored),
      }));
      if (interpreted.some((entry) => entry.measurement.rejection)) {
        throw new AcademyRepositoryError(
          'DIAGNOSTIC_ITEM_ALREADY_MEASURED',
          'A previously scored diagnostic item cannot be assigned as a clean V1 measurement.',
        );
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO training_assignments (
           id, academy_id, student_profile_id, player_id,
           assigned_by_coach_membership_id, coach_membership_role,
           training_plan_run_id, baseline_skill_graph_run_id,
           assignment_policy_version, due_at, note
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11)`,
        [
          id,
          input.academyId,
          input.studentProfileId,
          playerId,
          input.coachMembershipId,
          actorRole,
          input.trainingPlanRunId,
          input.baselineSkillGraphRunId,
          TRAINING_ASSIGNMENT_POLICY_VERSION,
          input.dueAt ?? null,
          input.note ?? null,
        ],
      );
      for (const [index, entry] of interpreted.entries()) {
        await client.query(
          `INSERT INTO training_assignment_items (
             id, assignment_id, academy_id, training_plan_run_id,
             training_item_id, player_id, training_mode, measurement_status, ordinal
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            id,
            input.academyId,
            input.trainingPlanRunId,
            entry.item.id,
            playerId,
            entry.item.training_mode,
            entry.measurement.measurementStatus!,
            index + 1,
          ],
        );
      }
      return id;
    });
    return (await this.getTrainingAssignment(input.academyId, assignmentId))!;
  }

  async listStudentAssignments(
    academyId: string,
    studentProfileId: string,
  ): Promise<TrainingAssignmentRecord[]> {
    return this.loadAssignments(academyId, { studentProfileId });
  }

  async getTrainingAssignment(
    academyId: string,
    assignmentId: string,
  ): Promise<TrainingAssignmentRecord | null> {
    return (await this.loadAssignments(academyId, { assignmentId }))[0] ?? null;
  }

  async cancelTrainingAssignment(input: {
    academyId: string;
    assignmentId: string;
    coachMembershipId: string;
  }): Promise<TrainingAssignmentRecord> {
    await this.database.transaction(async (client) => {
      await this.requireAssignmentActor(client, input.academyId, input.coachMembershipId);
      const updated = await client.query<{ id: string }>(
        `UPDATE training_assignments assignment
         SET cancelled_at = now()
         WHERE assignment.id = $1 AND assignment.academy_id = $2
           AND assignment.cancelled_at IS NULL
           AND EXISTS (
             SELECT 1 FROM training_assignment_items item
             WHERE item.assignment_id = assignment.id
               AND NOT EXISTS (
                 SELECT 1 FROM training_attempts attempt
                 WHERE attempt.player_id = assignment.player_id
                   AND attempt.training_item_id = item.training_item_id
                   AND attempt.submitted_at >= assignment.assigned_at
               )
           )
         RETURNING assignment.id`,
        [input.assignmentId, input.academyId],
      );
      if (!updated.rows[0]) {
        const exists = await client.query<{ cancelled_at: string | Date | null }>(
          `SELECT cancelled_at FROM training_assignments WHERE id = $1 AND academy_id = $2`,
          [input.assignmentId, input.academyId],
        );
        if (!exists.rows[0]) {
          throw new AcademyRepositoryError(
            'TRAINING_ASSIGNMENT_NOT_FOUND',
            'The assignment does not belong to the requested Academy.',
          );
        }
        throw new AcademyRepositoryError(
          'TRAINING_ASSIGNMENT_NOT_ACTIVE',
          'Only an incomplete active assignment can be cancelled.',
        );
      }
    });
    return (await this.getTrainingAssignment(input.academyId, input.assignmentId))!;
  }

  private async loadAssignments(
    academyId: string,
    filter: { assignmentId?: string; studentProfileId?: string },
  ): Promise<TrainingAssignmentRecord[]> {
    const result = await this.database.query<AssignmentRow>(
      `SELECT assignment.id AS assignment_id, assignment.academy_id,
              assignment.student_profile_id, student_member.display_name AS student_display_name,
              assignment.player_id, assignment.assigned_by_coach_membership_id,
              coach.display_name AS coach_display_name, assignment.training_plan_run_id,
              assignment.baseline_skill_graph_run_id, assignment.assignment_policy_version,
              assignment.assigned_at, assignment.due_at, assignment.cancelled_at,
              assignment.note, assignment.created_at AS assignment_created_at,
              assignment_item.id AS assignment_item_id,
              assignment_item.training_item_id, training_item.concept_stable_id,
              assignment_item.training_mode, assignment_item.measurement_status,
              assignment_item.ordinal,
              first_attempt.id AS first_attempt_id,
              first_attempt.result AS first_attempt_result,
              first_attempt.submitted_at AS first_attempt_submitted_at,
              first_attempt.attempt_number AS first_attempt_number,
              COALESCE(attempt_count.count, 0)::int AS post_assignment_attempt_count
       FROM training_assignments assignment
       JOIN student_profiles student ON student.id = assignment.student_profile_id
       JOIN academy_memberships student_member ON student_member.id = student.academy_membership_id
       JOIN academy_memberships coach ON coach.id = assignment.assigned_by_coach_membership_id
       LEFT JOIN training_assignment_items assignment_item
         ON assignment_item.assignment_id = assignment.id
       LEFT JOIN training_items training_item ON training_item.id = assignment_item.training_item_id
       LEFT JOIN LATERAL (
         SELECT attempt.* FROM training_attempts attempt
         WHERE attempt.player_id = assignment.player_id
           AND attempt.training_item_id = assignment_item.training_item_id
           AND attempt.submitted_at >= assignment.assigned_at
         ORDER BY attempt.submitted_at, attempt.attempt_number, attempt.id LIMIT 1
       ) first_attempt ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS count FROM training_attempts attempt
         WHERE attempt.player_id = assignment.player_id
           AND attempt.training_item_id = assignment_item.training_item_id
           AND attempt.submitted_at >= assignment.assigned_at
       ) attempt_count ON true
       WHERE assignment.academy_id = $1
         AND ($2::uuid IS NULL OR assignment.id = $2)
         AND ($3::uuid IS NULL OR assignment.student_profile_id = $3)
       ORDER BY assignment.assigned_at DESC, assignment.id DESC, assignment_item.ordinal`,
      [academyId, filter.assignmentId ?? null, filter.studentProfileId ?? null],
    );
    const assignments = new Map<string, TrainingAssignmentRecord>();
    for (const row of result.rows) {
      let assignment = assignments.get(row.assignment_id);
      if (!assignment) {
        assignment = {
          id: row.assignment_id,
          academyId: row.academy_id,
          studentProfileId: row.student_profile_id,
          studentDisplayName: row.student_display_name,
          playerId: row.player_id,
          assignedByCoachMembershipId: row.assigned_by_coach_membership_id,
          coachDisplayName: row.coach_display_name,
          trainingPlanRunId: row.training_plan_run_id,
          baselineSkillGraphRunId: row.baseline_skill_graph_run_id,
          assignmentPolicyVersion: row.assignment_policy_version,
          assignedAt: iso(row.assigned_at)!,
          dueAt: dateOnly(row.due_at),
          cancelledAt: iso(row.cancelled_at),
          note: row.note,
          createdAt: iso(row.assignment_created_at)!,
          items: [],
        };
        assignments.set(row.assignment_id, assignment);
      }
      if (
        row.assignment_item_id &&
        row.training_item_id &&
        row.training_mode &&
        row.measurement_status
      ) {
        assignment.items.push({
          id: row.assignment_item_id,
          trainingItemId: row.training_item_id,
          conceptStableId: row.concept_stable_id!,
          trainingMode: row.training_mode,
          measurementStatus: row.measurement_status,
          ordinal: row.ordinal!,
          firstPostAssignmentAttempt: row.first_attempt_id
            ? {
                id: row.first_attempt_id,
                result: row.first_attempt_result!,
                submittedAt: iso(row.first_attempt_submitted_at)!,
                attemptNumber: row.first_attempt_number!,
              }
            : null,
          postAssignmentAttemptCount: row.post_assignment_attempt_count,
        });
      }
    }
    return [...assignments.values()];
  }

  private async requireAcademy(academyId: string): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM academies WHERE id = $1`,
      [academyId],
    );
    if (!result.rows[0]) {
      throw new AcademyRepositoryError('ACADEMY_NOT_FOUND', 'The Academy does not exist.');
    }
  }

  private async requireAssignmentActor(
    client: QueryClient,
    academyId: string,
    membershipId: string,
  ): Promise<'OWNER' | 'ADMIN' | 'COACH'> {
    const result = await client.query<{ role: 'OWNER' | 'ADMIN' | 'COACH' }>(
      `SELECT role FROM academy_memberships
       WHERE id = $1 AND academy_id = $2
         AND role IN ('OWNER', 'ADMIN', 'COACH') AND status = 'ACTIVE'`,
      [membershipId, academyId],
    );
    if (!result.rows[0]) {
      throw new AcademyRepositoryError(
        'COACH_MEMBERSHIP_REQUIRED',
        'A COACH membership in the requested Academy is required.',
      );
    }
    return result.rows[0].role;
  }

  private academy(row: AcademyRow): AcademyRecord {
    return { id: row.id, name: row.name, createdAt: iso(row.created_at)! };
  }

  private membership(row: MembershipRow): AcademyMembershipRecord {
    return {
      id: row.id,
      academyId: row.academy_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      displayName: row.display_name,
      createdAt: iso(row.created_at)!,
      updatedAt: iso(row.updated_at)!,
    };
  }

  private student(row: StudentRow): StudentProfileRecord {
    return {
      id: row.id,
      academyId: row.academy_id,
      academyMembershipId: row.academy_membership_id,
      displayName: row.display_name,
      playerId: row.player_id,
      playerDisplayName: row.player_display_name,
      fideId: row.fide_id,
      requiresGuardianConsent: row.requires_guardian_consent,
      createdAt: iso(row.created_at)!,
    };
  }

  private roster(row: RosterRow): RosterProjectionRow {
    return {
      student: this.student(row),
      totalStudents: row.total_students,
      skillGraph: row.graph_id
        ? {
            id: row.graph_id,
            ontologyVersion: row.ontology_version!,
            skillGraphPolicyVersion: row.skill_graph_policy_version!,
            policyConfigSha256: row.policy_config_sha256!,
            evidenceScopeSha256: row.evidence_scope_sha256!,
            asOfDate: dateOnly(row.as_of_date)!,
            completedAt: iso(row.graph_completed_at),
            coverage: {
              canonicalGames: row.canonical_games ?? 0,
              decisionOccurrences: row.decision_occurrences ?? 0,
              classifiedDecisions: row.classified_decisions ?? 0,
              engineBackedDecisions: row.engine_backed_decisions ?? 0,
              masteryEligibleEvidence: row.mastery_eligible_evidence ?? 0,
              trainingMeasurementUnits: row.training_measurement_units ?? 0,
              estimatedConcepts: row.estimated_concepts ?? 0,
              insufficientConcepts: row.insufficient_concepts ?? 0,
              noEvidenceConcepts: row.no_evidence_concepts ?? 0,
            },
          }
        : null,
      newTrainingEvidenceCount: row.new_training_evidence_count ?? 0,
      lastTrainingAt: iso(row.last_training_at),
      activeAssignment: row.active_assignment_id
        ? {
            id: row.active_assignment_id,
            assignedAt: iso(row.active_assignment_assigned_at)!,
            dueAt: dateOnly(row.active_assignment_due_at),
            itemCount: row.active_assignment_item_count ?? 0,
            completedItemCount: row.active_assignment_completed_count ?? 0,
          }
        : null,
      completedAssignmentReviewAvailable: row.completed_review_available,
    };
  }
}
