export const PILOT_EVENT_VERSION = 'PILOT_EVENT_V1' as const;

export const PILOT_EVENT_TYPES = [
  'COACH_OPENED_STUDENT_INTELLIGENCE',
  'COACH_OPENED_CONCEPT_EVIDENCE',
  'COACH_GENERATED_AI_BRIEF',
  'COACH_OPENED_AI_CLAIM_EVIDENCE',
  'COACH_CREATED_TRAINING_PLAN',
  'COACH_CREATED_ASSIGNMENT',
  'STUDENT_OPENED_ASSIGNMENT',
  'STUDENT_STARTED_TRAINING_ITEM',
  'STUDENT_SUBMITTED_FIRST_ATTEMPT',
  'STUDENT_COMPLETED_TRAINING_ITEM',
  'STUDENT_COMPLETED_ASSIGNMENT',
  'SKILL_GRAPH_REFRESHED',
  'COACH_OPENED_PROGRESS_REVIEW',
  'COACH_RETURNED_TO_STUDENT',
] as const;
export type PilotEventType = (typeof PILOT_EVENT_TYPES)[number];

export const PILOT_EVENT_OUTCOMES = [
  'SUCCESS',
  'AI_UNAVAILABLE',
  'AI_PROVIDER_FAILED',
  'AI_OUTPUT_INVALID',
] as const;
export type PilotEventOutcome = (typeof PILOT_EVENT_OUTCOMES)[number];

export const PILOT_EVENT_SOURCES = ['SERVER', 'CLIENT'] as const;
export type PilotEventSource = (typeof PILOT_EVENT_SOURCES)[number];

export const COACH_REVIEW_FEEDBACK_VALUES = ['AGREE', 'UNSURE', 'DISAGREE'] as const;
export type CoachReviewFeedbackValue = (typeof COACH_REVIEW_FEEDBACK_VALUES)[number];

export const AI_CLAIM_FEEDBACK_VALUES = ['USEFUL', 'NOT_USEFUL'] as const;
export type AiClaimFeedbackValue = (typeof AI_CLAIM_FEEDBACK_VALUES)[number];

export const AI_NOT_USEFUL_REASONS = [
  'INCORRECT',
  'TOO_VAGUE',
  'NOT_ACTIONABLE',
  'ALREADY_KNOWN',
  'OTHER',
] as const;
export type AiNotUsefulReason = (typeof AI_NOT_USEFUL_REASONS)[number];

export const PILOT_STUDENT_READINESS_STATES = [
  'READY',
  'READY_WITH_LOW_COVERAGE',
  'NOT_READY_NO_GAMES',
  'NOT_READY_NO_ANALYSIS',
  'NOT_READY_NO_SKILL_GRAPH',
] as const;
export type PilotStudentReadinessState = (typeof PILOT_STUDENT_READINESS_STATES)[number];

export interface PilotStudentReadinessInput {
  canonicalGameCount: number;
  analyzedGameCount: number;
  hasCompatibleSkillGraph: boolean;
  masteryEligibleEvidenceCount: number;
}

export interface PilotStudentReadiness {
  state: PilotStudentReadinessState;
  operationalOnly: true;
  reason:
    | 'READY_FOR_PILOT_WORKFLOW'
    | 'LOW_MASTERY_ELIGIBLE_COVERAGE'
    | 'NO_CANONICAL_GAMES'
    | 'NO_SUCCEEDED_ENGINE_ANALYSIS'
    | 'NO_COMPATIBLE_SKILL_GRAPH';
  signals: PilotStudentReadinessInput;
}

export function derivePilotStudentReadiness(
  input: PilotStudentReadinessInput,
): PilotStudentReadiness {
  let state: PilotStudentReadinessState;
  let reason: PilotStudentReadiness['reason'];
  if (input.canonicalGameCount === 0) {
    state = 'NOT_READY_NO_GAMES';
    reason = 'NO_CANONICAL_GAMES';
  } else if (input.analyzedGameCount === 0) {
    state = 'NOT_READY_NO_ANALYSIS';
    reason = 'NO_SUCCEEDED_ENGINE_ANALYSIS';
  } else if (!input.hasCompatibleSkillGraph) {
    state = 'NOT_READY_NO_SKILL_GRAPH';
    reason = 'NO_COMPATIBLE_SKILL_GRAPH';
  } else if (input.masteryEligibleEvidenceCount < 3) {
    state = 'READY_WITH_LOW_COVERAGE';
    reason = 'LOW_MASTERY_ELIGIBLE_COVERAGE';
  } else {
    state = 'READY';
    reason = 'READY_FOR_PILOT_WORKFLOW';
  }
  return { state, operationalOnly: true, reason, signals: input };
}

export interface PilotMetricValue {
  numerator: number;
  denominator: number | null;
  rate: number | null;
  definition: string;
}

export function pilotMetric(
  numerator: number,
  denominator: number | null,
  definition: string,
): PilotMetricValue {
  return {
    numerator,
    denominator,
    rate: denominator === null || denominator === 0 ? null : numerator / denominator,
    definition,
  };
}

export function validateAiClaimFeedback(
  value: AiClaimFeedbackValue,
  reason: AiNotUsefulReason | null,
): void {
  if ((value === 'USEFUL' && reason !== null) || (value === 'NOT_USEFUL' && reason === null)) {
    throw new Error('NOT_USEFUL requires one controlled reason; USEFUL must not include one.');
  }
}
