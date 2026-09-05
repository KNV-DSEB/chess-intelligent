import type {
  PlayerConceptStateStatus,
  PlayerSkillGraphScope,
  SkillEvidenceConfidence,
  MasteryBand,
} from './player-skill-graph';
import type { TrainingAttemptResult, TrainingCandidateType } from './adaptive-training';

export const STUDENT_PROGRESS_COMPARISON_VERSION = 'STUDENT_PROGRESS_COMPARISON_V1';
export const COACH_ATTENTION_SIGNAL_VERSION = 'COACH_ATTENTION_SIGNAL_V1';
export const TRAINING_ASSIGNMENT_POLICY_VERSION = 'TRAINING_ASSIGNMENT_POLICY_V1';

export const COACH_ATTENTION_SIGNAL_V1 = {
  version: COACH_ATTENTION_SIGNAL_VERSION,
  inactivityDays: 7,
  signals: [
    'NO_COMPATIBLE_SKILL_GRAPH',
    'SKILL_GRAPH_REFRESH_AVAILABLE',
    'ACTIVE_ASSIGNMENT_OVERDUE',
    'ACTIVE_ASSIGNMENT_NO_RECENT_ACTIVITY',
    'ASSIGNMENT_COMPLETED_REVIEW_AVAILABLE',
  ],
} as const;

export const TRAINING_ASSIGNMENT_POLICY_V1 = {
  version: TRAINING_ASSIGNMENT_POLICY_VERSION,
  diagnosticReplay: 'REJECT_ALREADY_MEASURED',
  remediationReplay: 'PRACTICE_ONLY_ALREADY_MEASURED',
  completion: 'FIRST_SCORED_ATTEMPT_ON_OR_AFTER_ASSIGNED_AT',
  correctnessRequiredForCompletion: false,
  assignmentCreatesEvidence: false,
  coachNoteCreatesEvidence: false,
} as const;

export const STUDENT_PROGRESS_COMPARISON_V1 = {
  version: STUDENT_PROGRESS_COMPARISON_VERSION,
  requiredEqualFields: [
    'playerId',
    'ontologyVersion',
    'skillGraphPolicyVersion',
    'policyConfigSha256',
    'evidenceScopeSha256',
    'classifierBundleVersion',
    'classifierConfigSha256',
    'classificationSelectionPolicyVersion',
  ],
  evidenceSnapshotMayDiffer: true,
  requiresNonDecreasingAsOfDate: true,
  interpretation: 'NEUTRAL_EVIDENCE_AND_STATE_DELTAS_ONLY',
} as const;

export type SkillGraphFreshness = 'CURRENT' | 'REFRESH_AVAILABLE' | 'NO_COMPATIBLE_GRAPH';

export type CoachAttentionSignal =
  | 'NO_COMPATIBLE_SKILL_GRAPH'
  | 'SKILL_GRAPH_REFRESH_AVAILABLE'
  | 'ACTIVE_ASSIGNMENT_OVERDUE'
  | 'ACTIVE_ASSIGNMENT_NO_RECENT_ACTIVITY'
  | 'ASSIGNMENT_COMPLETED_REVIEW_AVAILABLE';

export type AssignmentMeasurementStatus = 'MEASUREMENT_ELIGIBLE' | 'PRACTICE_ONLY_ALREADY_MEASURED';

export type AssignmentMeasurementRejection = 'DIAGNOSTIC_ITEM_ALREADY_MEASURED';

export type TrainingAssignmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type ProgressComparabilityReason =
  | 'DIFFERENT_PLAYER'
  | 'DIFFERENT_ONTOLOGY'
  | 'DIFFERENT_SKILL_GRAPH_POLICY'
  | 'DIFFERENT_POLICY_CONFIG'
  | 'DIFFERENT_EVIDENCE_SCOPE'
  | 'INCOMPATIBLE_CLASSIFIER_SEMANTICS'
  | 'REVERSED_AS_OF_DATE';

export interface StudentIntelligenceProfile {
  ontologyVersion: string;
  skillGraphPolicyVersion: string;
  policyConfigSha256: string;
  evidenceScope: PlayerSkillGraphScope;
  evidenceScopeSha256: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  classificationSelectionPolicyVersion: string;
}

export interface ProgressCoverage {
  canonicalGames: number;
  decisionOccurrences: number;
  classifiedDecisions: number;
  engineBackedDecisions: number;
  masteryEligibleEvidence: number;
  trainingIndependentUnits: number;
}

export interface ProgressConceptState {
  conceptStableId: string;
  status: PlayerConceptStateStatus;
  posteriorMean: number | null;
  effectiveEvidenceMass: number;
  positiveEvidenceMass: number;
  negativeEvidenceMass: number;
  independentEvidenceUnitCount: number;
  evidenceConfidence: SkillEvidenceConfidence;
  masteryBand: MasteryBand | null;
}

export interface ComparableSkillGraphRun {
  id: string;
  playerId: string;
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  classificationSelectionPolicyVersion: string;
  skillGraphPolicyVersion: string;
  policyConfigSha256: string;
  evidenceScopeSha256: string;
  evidenceSnapshotSha256: string | null;
  asOfDate: string;
  coverage: ProgressCoverage;
  concepts: readonly ProgressConceptState[];
}

export interface ConceptProgressTransition {
  conceptStableId: string;
  fromStatus: PlayerConceptStateStatus | null;
  toStatus: PlayerConceptStateStatus | null;
  fromPosteriorMean: number | null;
  toPosteriorMean: number | null;
  posteriorDelta: number | null;
  effectiveEvidenceMassDelta: number;
  positiveMassDelta: number;
  negativeMassDelta: number;
  independentEvidenceUnitDelta: number;
  fromEvidenceConfidence: SkillEvidenceConfidence | null;
  toEvidenceConfidence: SkillEvidenceConfidence | null;
  fromMasteryBand: MasteryBand | null;
  toMasteryBand: MasteryBand | null;
  transition:
    | 'UNCHANGED'
    | 'NO_EVIDENCE_TO_INSUFFICIENT_EVIDENCE'
    | 'BECAME_ESTIMABLE'
    | 'EVIDENCE_STATE_CHANGED'
    | 'ESTIMATE_AVAILABLE_BOTH';
}

export interface StudentProgressComparison {
  comparisonPolicyVersion: typeof STUDENT_PROGRESS_COMPARISON_VERSION;
  comparisonStatus: 'COMPARABLE' | 'NOT_COMPARABLE';
  comparabilityReasons: ProgressComparabilityReason[];
  fromSkillGraphRunId: string;
  toSkillGraphRunId: string;
  coverageDelta: {
    canonicalGameDelta: number;
    decisionOccurrenceDelta: number;
    classifiedDecisionDelta: number;
    engineBackedDecisionDelta: number;
    masteryEligibleEvidenceDelta: number;
    trainingIndependentUnitDelta: number;
  } | null;
  conceptTransitions: ConceptProgressTransition[];
}

function roundedDelta(to: number, from: number): number {
  return Number((to - from).toFixed(12));
}

export function checkSkillGraphComparability(
  from: ComparableSkillGraphRun,
  to: ComparableSkillGraphRun,
): ProgressComparabilityReason[] {
  const reasons: ProgressComparabilityReason[] = [];
  if (from.playerId !== to.playerId) reasons.push('DIFFERENT_PLAYER');
  if (from.ontologyVersion !== to.ontologyVersion) reasons.push('DIFFERENT_ONTOLOGY');
  if (from.skillGraphPolicyVersion !== to.skillGraphPolicyVersion) {
    reasons.push('DIFFERENT_SKILL_GRAPH_POLICY');
  }
  if (from.policyConfigSha256 !== to.policyConfigSha256) reasons.push('DIFFERENT_POLICY_CONFIG');
  if (from.evidenceScopeSha256 !== to.evidenceScopeSha256) {
    reasons.push('DIFFERENT_EVIDENCE_SCOPE');
  }
  if (
    from.classifierBundleVersion !== to.classifierBundleVersion ||
    from.classifierConfigSha256 !== to.classifierConfigSha256 ||
    from.classificationSelectionPolicyVersion !== to.classificationSelectionPolicyVersion
  ) {
    reasons.push('INCOMPATIBLE_CLASSIFIER_SEMANTICS');
  }
  if (to.asOfDate < from.asOfDate) reasons.push('REVERSED_AS_OF_DATE');
  return reasons;
}

function classifyConceptTransition(
  from: ProgressConceptState | undefined,
  to: ProgressConceptState | undefined,
): ConceptProgressTransition['transition'] {
  if (from?.status === 'NO_EVIDENCE' && to?.status === 'INSUFFICIENT_EVIDENCE') {
    return 'NO_EVIDENCE_TO_INSUFFICIENT_EVIDENCE';
  }
  if (from?.status !== 'ESTIMATED' && to?.status === 'ESTIMATED') return 'BECAME_ESTIMABLE';
  if (from?.status !== to?.status) return 'EVIDENCE_STATE_CHANGED';
  if (from?.posteriorMean !== null && to?.posteriorMean !== null) {
    return 'ESTIMATE_AVAILABLE_BOTH';
  }
  return 'UNCHANGED';
}

export function compareStudentProgress(
  from: ComparableSkillGraphRun,
  to: ComparableSkillGraphRun,
): StudentProgressComparison {
  const reasons = checkSkillGraphComparability(from, to);
  const base = {
    comparisonPolicyVersion: STUDENT_PROGRESS_COMPARISON_VERSION,
    fromSkillGraphRunId: from.id,
    toSkillGraphRunId: to.id,
  } as const;
  if (reasons.length > 0) {
    return {
      ...base,
      comparisonStatus: 'NOT_COMPARABLE',
      comparabilityReasons: reasons,
      coverageDelta: null,
      conceptTransitions: [],
    };
  }
  const fromByConcept = new Map(from.concepts.map((state) => [state.conceptStableId, state]));
  const toByConcept = new Map(to.concepts.map((state) => [state.conceptStableId, state]));
  const conceptIds = [...new Set([...fromByConcept.keys(), ...toByConcept.keys()])].sort();
  const conceptTransitions = conceptIds.map((conceptStableId): ConceptProgressTransition => {
    const previous = fromByConcept.get(conceptStableId);
    const current = toByConcept.get(conceptStableId);
    return {
      conceptStableId,
      fromStatus: previous?.status ?? null,
      toStatus: current?.status ?? null,
      fromPosteriorMean: previous?.posteriorMean ?? null,
      toPosteriorMean: current?.posteriorMean ?? null,
      posteriorDelta:
        previous?.posteriorMean === null ||
        previous?.posteriorMean === undefined ||
        current?.posteriorMean === null ||
        current?.posteriorMean === undefined
          ? null
          : roundedDelta(current.posteriorMean, previous.posteriorMean),
      effectiveEvidenceMassDelta: roundedDelta(
        current?.effectiveEvidenceMass ?? 0,
        previous?.effectiveEvidenceMass ?? 0,
      ),
      positiveMassDelta: roundedDelta(
        current?.positiveEvidenceMass ?? 0,
        previous?.positiveEvidenceMass ?? 0,
      ),
      negativeMassDelta: roundedDelta(
        current?.negativeEvidenceMass ?? 0,
        previous?.negativeEvidenceMass ?? 0,
      ),
      independentEvidenceUnitDelta:
        (current?.independentEvidenceUnitCount ?? 0) -
        (previous?.independentEvidenceUnitCount ?? 0),
      fromEvidenceConfidence: previous?.evidenceConfidence ?? null,
      toEvidenceConfidence: current?.evidenceConfidence ?? null,
      fromMasteryBand: previous?.masteryBand ?? null,
      toMasteryBand: current?.masteryBand ?? null,
      transition: classifyConceptTransition(previous, current),
    };
  });
  return {
    ...base,
    comparisonStatus: 'COMPARABLE',
    comparabilityReasons: [],
    coverageDelta: {
      canonicalGameDelta: to.coverage.canonicalGames - from.coverage.canonicalGames,
      decisionOccurrenceDelta: to.coverage.decisionOccurrences - from.coverage.decisionOccurrences,
      classifiedDecisionDelta: to.coverage.classifiedDecisions - from.coverage.classifiedDecisions,
      engineBackedDecisionDelta:
        to.coverage.engineBackedDecisions - from.coverage.engineBackedDecisions,
      masteryEligibleEvidenceDelta:
        to.coverage.masteryEligibleEvidence - from.coverage.masteryEligibleEvidence,
      trainingIndependentUnitDelta:
        to.coverage.trainingIndependentUnits - from.coverage.trainingIndependentUnits,
    },
    conceptTransitions,
  };
}

export function classifyAssignmentMeasurement(
  trainingMode: TrainingCandidateType,
  hasPriorScoredAttempt: boolean,
): {
  measurementStatus: AssignmentMeasurementStatus | null;
  rejection: AssignmentMeasurementRejection | null;
} {
  if (!hasPriorScoredAttempt) {
    return { measurementStatus: 'MEASUREMENT_ELIGIBLE', rejection: null };
  }
  if (trainingMode === 'DIAGNOSTIC') {
    return { measurementStatus: null, rejection: 'DIAGNOSTIC_ITEM_ALREADY_MEASURED' };
  }
  return { measurementStatus: 'PRACTICE_ONLY_ALREADY_MEASURED', rejection: null };
}

export interface AssignmentAttemptInput {
  id: string;
  trainingItemId: string;
  playerId: string;
  submittedAt: string;
  result: TrainingAttemptResult;
  attemptNumber: number;
}

export interface AssignmentItemProgressInput {
  assignmentItemId: string;
  trainingItemId: string;
  measurementStatus: AssignmentMeasurementStatus;
  attempts: readonly AssignmentAttemptInput[];
}

export interface TrainingAssignmentProgress {
  status: TrainingAssignmentStatus;
  overdue: boolean;
  itemCount: number;
  completedItemCount: number;
  firstScoredCorrectItems: number;
  firstScoredIncorrectItems: number;
  completedAt: string | null;
  items: Array<{
    assignmentItemId: string;
    trainingItemId: string;
    measurementStatus: AssignmentMeasurementStatus;
    completed: boolean;
    firstPostAssignmentAttempt: AssignmentAttemptInput | null;
    retryCountAfterCompletion: number;
  }>;
}

export function deriveTrainingAssignmentProgress(input: {
  playerId: string;
  assignedAt: string;
  dueAt: string | null;
  cancelledAt: string | null;
  asOfDate: string;
  items: readonly AssignmentItemProgressInput[];
}): TrainingAssignmentProgress {
  const items = input.items.map((item) => {
    const attempts = item.attempts
      .filter(
        (attempt) =>
          attempt.playerId === input.playerId &&
          attempt.trainingItemId === item.trainingItemId &&
          attempt.submittedAt >= input.assignedAt,
      )
      .sort(
        (left, right) =>
          left.submittedAt.localeCompare(right.submittedAt) ||
          left.attemptNumber - right.attemptNumber ||
          left.id.localeCompare(right.id),
      );
    return {
      assignmentItemId: item.assignmentItemId,
      trainingItemId: item.trainingItemId,
      measurementStatus: item.measurementStatus,
      completed: Boolean(attempts[0]),
      firstPostAssignmentAttempt: attempts[0] ?? null,
      retryCountAfterCompletion: Math.max(0, attempts.length - 1),
    };
  });
  const completed = items.filter((item) => item.completed);
  const allCompleted = items.length > 0 && completed.length === items.length;
  const status: TrainingAssignmentStatus = input.cancelledAt
    ? 'CANCELLED'
    : allCompleted
      ? 'COMPLETED'
      : 'ACTIVE';
  const completionTimes = completed
    .map((item) => item.firstPostAssignmentAttempt!.submittedAt)
    .sort();
  return {
    status,
    overdue: status === 'ACTIVE' && input.dueAt !== null && input.asOfDate > input.dueAt,
    itemCount: items.length,
    completedItemCount: completed.length,
    firstScoredCorrectItems: completed.filter(
      (item) => item.firstPostAssignmentAttempt?.result === 'CORRECT',
    ).length,
    firstScoredIncorrectItems: completed.filter(
      (item) => item.firstPostAssignmentAttempt?.result === 'INCORRECT',
    ).length,
    completedAt: allCompleted ? (completionTimes.at(-1) ?? null) : null,
    items,
  };
}

export function projectSkillGraphFreshness(input: {
  hasCompatibleGraph: boolean;
  newTrainingEvidenceCount: number;
  newGameEvidenceCount?: number | null | undefined;
}): SkillGraphFreshness {
  if (!input.hasCompatibleGraph) return 'NO_COMPATIBLE_GRAPH';
  return input.newTrainingEvidenceCount > 0 || (input.newGameEvidenceCount ?? 0) > 0
    ? 'REFRESH_AVAILABLE'
    : 'CURRENT';
}

function epochDay(value: string): number {
  return Math.floor(new Date(value).valueOf() / 86_400_000);
}

export function deriveCoachAttentionSignals(input: {
  freshness: SkillGraphFreshness;
  activeAssignments: ReadonlyArray<{ overdue: boolean }>;
  latestActiveAssignmentAt: string | null;
  lastTrainingAt: string | null;
  completedAssignmentReviewAvailable: boolean;
  asOfDate: string;
}): CoachAttentionSignal[] {
  const signals: CoachAttentionSignal[] = [];
  if (input.freshness === 'NO_COMPATIBLE_GRAPH') {
    signals.push('NO_COMPATIBLE_SKILL_GRAPH');
  }
  if (input.freshness === 'REFRESH_AVAILABLE') {
    signals.push('SKILL_GRAPH_REFRESH_AVAILABLE');
  }
  if (input.activeAssignments.some((assignment) => assignment.overdue)) {
    signals.push('ACTIVE_ASSIGNMENT_OVERDUE');
  }
  if (input.activeAssignments.length > 0 && input.latestActiveAssignmentAt) {
    const latestRelevantActivity = [input.latestActiveAssignmentAt, input.lastTrainingAt]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1)!;
    if (epochDay(input.asOfDate) - epochDay(latestRelevantActivity) >= 7) {
      signals.push('ACTIVE_ASSIGNMENT_NO_RECENT_ACTIVITY');
    }
  }
  if (input.completedAssignmentReviewAvailable) {
    signals.push('ASSIGNMENT_COMPLETED_REVIEW_AVAILABLE');
  }
  return signals;
}
