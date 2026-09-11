import { describe, expect, it, vi } from 'vitest';

import type { Database } from './database';
import { PilotRepository } from './pilot-repository';

describe('PilotRepository metrics', () => {
  it('exports explicit denominators without creating a learning-effectiveness claim', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM pilot_events')) {
        return {
          rows: [
            {
              event_type: 'COACH_OPENED_STUDENT_INTELLIGENCE',
              outcome: 'SUCCESS',
              actor_user_id: 'coach-1',
              student_profile_id: 'student-1',
              skill_graph_run_id: 'graph-1',
              concept_stable_id: null,
              grounded_ai_artifact_id: null,
              assignment_id: null,
              training_item_id: null,
              attempt_result: null,
            },
            {
              event_type: 'COACH_OPENED_CONCEPT_EVIDENCE',
              outcome: 'SUCCESS',
              actor_user_id: 'coach-1',
              student_profile_id: 'student-1',
              skill_graph_run_id: 'graph-1',
              concept_stable_id: 'TACTICS.FORK',
              grounded_ai_artifact_id: null,
              assignment_id: null,
              training_item_id: null,
              attempt_result: null,
            },
            {
              event_type: 'COACH_CREATED_ASSIGNMENT',
              outcome: 'SUCCESS',
              actor_user_id: 'coach-1',
              student_profile_id: 'student-1',
              grounded_ai_artifact_id: null,
              assignment_id: 'assignment-1',
              training_item_id: null,
              attempt_result: null,
            },
            {
              event_type: 'STUDENT_OPENED_ASSIGNMENT',
              outcome: 'SUCCESS',
              actor_user_id: 'student-user-1',
              student_profile_id: 'student-1',
              grounded_ai_artifact_id: null,
              assignment_id: 'assignment-1',
              training_item_id: null,
              attempt_result: null,
            },
            {
              event_type: 'STUDENT_SUBMITTED_FIRST_ATTEMPT',
              outcome: 'SUCCESS',
              actor_user_id: 'student-user-1',
              student_profile_id: 'student-1',
              grounded_ai_artifact_id: null,
              assignment_id: 'assignment-1',
              training_item_id: 'item-1',
              attempt_result: 'CORRECT',
            },
            {
              event_type: 'COACH_GENERATED_AI_BRIEF',
              outcome: 'SUCCESS',
              actor_user_id: 'coach-1',
              student_profile_id: 'student-1',
              grounded_ai_artifact_id: 'artifact-1',
              assignment_id: null,
              training_item_id: null,
              attempt_result: null,
            },
            {
              event_type: 'COACH_GENERATED_AI_BRIEF',
              outcome: 'AI_OUTPUT_INVALID',
              actor_user_id: 'coach-1',
              student_profile_id: 'student-1',
              grounded_ai_artifact_id: null,
              assignment_id: null,
              training_item_id: null,
              attempt_result: null,
            },
            {
              event_type: 'COACH_OPENED_AI_CLAIM_EVIDENCE',
              outcome: 'SUCCESS',
              actor_user_id: 'coach-1',
              student_profile_id: 'student-1',
              grounded_ai_artifact_id: 'artifact-1',
              assignment_id: null,
              training_item_id: null,
              attempt_result: null,
            },
          ],
        };
      }
      if (sql.includes('FROM coach_review_feedback') && sql.includes('concept_stable_id')) {
        return {
          rows: [
            { concept_stable_id: 'tactics.fork', feedback_value: 'AGREE', count: 2 },
            { concept_stable_id: 'tactics.fork', feedback_value: 'DISAGREE', count: 1 },
          ],
        };
      }
      if (sql.includes('FROM coach_review_feedback')) {
        return { rows: [{ feedback_value: 'AGREE', count: 2 }] };
      }
      if (sql.includes('FROM ai_claim_feedback') && sql.includes('not_useful_reason')) {
        return { rows: [{ not_useful_reason: 'TOO_VAGUE', count: 1 }] };
      }
      if (sql.includes('FROM ai_claim_feedback')) {
        return { rows: [{ feedback_value: 'USEFUL', count: 1 }] };
      }
      if (sql.includes('FROM academy_memberships')) {
        return { rows: [{ coach_denominator: 2, student_denominator: 8 }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const database = { query } as unknown as Database;
    const report = await new PilotRepository(database).exportMetrics({
      academyId: 'academy-1',
      fromInclusive: new Date('2026-09-01T00:00:00.000Z'),
      toExclusive: new Date('2026-09-08T00:00:00.000Z'),
      generatedAt: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(report.metrics.coachWeeklyUsage).toMatchObject({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(report.metrics.studentWeeklyUsage).toMatchObject({
      numerator: 1,
      denominator: 8,
      rate: 0.125,
    });
    expect(report.metrics.assignmentStartRate).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
    expect(report.metrics.firstAttemptCorrectRate).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
    expect(report.metrics.aiGenerationSuccessRate).toMatchObject({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(report.metrics.aiValidationRejectionRate).toMatchObject({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(report.metrics.conceptEvidenceClickthroughRate).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
    expect(report.breakdowns.coachFeedbackByConcept).toEqual([
      {
        conceptStableId: 'tactics.fork',
        agree: 2,
        unsure: 0,
        disagree: 1,
        total: 3,
        agreementRate: 2 / 3,
        disagreementRate: 1 / 3,
      },
    ]);
    expect(report.breakdowns.aiNotUsefulReasons).toEqual({ TOO_VAGUE: 1 });
    expect(report.interpretation).toBe('USAGE_AND_WORKFLOW_OBSERVATION_NOT_LEARNING_EFFECTIVENESS');
  });
});
