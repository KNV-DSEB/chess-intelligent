import type { EvidencePolarity, EvidenceRole, OntologyConceptDetail } from './ontology';
import {
  EVIDENCE_RECENCY_VERSION,
  MASTERY_BAND_VERSION,
  SKILL_GRAPH_POLICY_V1,
  aggregatePlayerSkillGraph,
  applyEvidenceRoleWeight,
  calculateBetaPosterior,
  calculateRecencyWeight,
  classifyMasteryBand,
  deterministicSha256,
  type MasteryBand,
  type PlayerConceptStateComputation,
  type SkillEvidenceConfidence,
  type SkillGraphAggregationInput,
  type SkillGraphAggregationResult,
} from './player-skill-graph';

export const TRAINING_CANDIDATE_POLICY_VERSION = 'TRAINING_CANDIDATE_POLICY_V2';
export const TRAINING_ITEM_SOURCE_POLICY_VERSION = 'TRAINING_ITEM_SOURCE_POLICY_V1';
export const TRAINING_ITEM_GENERATOR_VERSION = 'TACTICAL_TRAINING_ITEM_GENERATOR_V2';
export const TRAINING_REVEAL_POLICY_VERSION = 'TRAINING_REVEAL_POLICY_V1';
export const TRAINING_COOLDOWN_VERSION = 'TRAINING_COOLDOWN_V1';
export const TRAINING_EVIDENCE_SELECTION_VERSION = 'TRAINING_EVIDENCE_SELECTION_V1';
export const TRAINING_SOURCE_WEIGHT_VERSION = 'TRAINING_SOURCE_WEIGHT_V1';
export const SKILL_EVIDENCE_CONFIDENCE_V2_VERSION = 'SKILL_EVIDENCE_CONFIDENCE_V2';
export const SKILL_GRAPH_POLICY_V2_VERSION = 'SKILL_GRAPH_POLICY_V2';

export const TRAINING_PLAN_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type TrainingPlanStatus = (typeof TRAINING_PLAN_STATUSES)[number];

export const TRAINING_CANDIDATE_TYPES = ['REMEDIATION', 'DIAGNOSTIC'] as const;
export type TrainingCandidateType = (typeof TRAINING_CANDIDATE_TYPES)[number];

export const TRAINING_CANDIDATE_DISPOSITIONS = [
  'ELIGIBLE',
  'NO_ITEM_SOURCE',
  'UNSUPPORTED_CONCEPT_V1',
  'ONTOLOGY_POLICY_UNSUPPORTED',
  'PREREQUISITE_OBSERVED_NOT_READY',
  'RECENTLY_ATTEMPTED',
] as const;
export type TrainingCandidateDisposition = (typeof TRAINING_CANDIDATE_DISPOSITIONS)[number];

export const TRAINING_CANDIDATE_REASON_CODES = [
  'SUFFICIENT_NEGATIVE_MASTERY_EVIDENCE',
  'NEEDS_MORE_DIRECT_EVIDENCE',
  'OBSERVED_PREREQUISITE_GAP',
  'PREREQUISITE_UNVERIFIED',
  'NO_COMPATIBLE_POSITION',
  'ONTOLOGY_TRAINING_POLICY_MISSING',
  'UNSUPPORTED_ITEM_TYPE',
  'SOURCE_IN_COOLDOWN',
] as const;
export type TrainingCandidateReasonCode = (typeof TRAINING_CANDIDATE_REASON_CODES)[number];

export const PREREQUISITE_READINESS_STATES = [
  'READY',
  'OBSERVED_NOT_READY',
  'UNVERIFIED',
  'NOT_APPLICABLE',
] as const;
export type PrerequisiteReadiness = (typeof PREREQUISITE_READINESS_STATES)[number];

export const TRAINING_ITEM_TYPES = ['FIND_BEST_MOVE'] as const;
export type TrainingItemType = (typeof TRAINING_ITEM_TYPES)[number];

export const TRAINING_ATTEMPT_RESULTS = ['CORRECT', 'INCORRECT'] as const;
export type TrainingAttemptResult = (typeof TRAINING_ATTEMPT_RESULTS)[number];

export const SUPPORTED_TRAINING_CONCEPT_IDS_V1 = [
  'tactics.discovered_attack',
  'tactics.fork',
  'tactics.pin',
  'tactics.skewer',
] as const;
export const SUPPORTED_TRAINING_CONCEPT_IDS = [
  ...SUPPORTED_TRAINING_CONCEPT_IDS_V1,
  'tactics.back_rank',
  'tactics.interference',
  'tactics.overload',
  'tactics.removal_of_defender',
] as const;
export type SupportedTrainingConceptId = (typeof SUPPORTED_TRAINING_CONCEPT_IDS)[number];

export const TRAINING_CANDIDATE_POLICY_V1 = {
  version: 'TRAINING_CANDIDATE_POLICY_V1',
  remediation: {
    statuses: ['ESTIMATED'],
    minimumEvidenceConfidence: 'MODERATE',
    masteryBands: ['EMERGING', 'DEVELOPING'],
    requiresNegativeDecisionSource: true,
  },
  diagnostic: {
    statuses: ['NO_EVIDENCE', 'INSUFFICIENT_EVIDENCE'],
    includeLowConfidenceEstimated: true,
  },
  supportedConceptStableIds: SUPPORTED_TRAINING_CONCEPT_IDS_V1,
  prerequisite: {
    sufficientConfidence: ['MODERATE', 'HIGH'],
    readyBands: ['ESTABLISHED', 'STRONG_EVIDENCE_OF_MASTERY'],
    observedNotReadyBands: ['EMERGING', 'DEVELOPING'],
  },
  ordering: [
    'OBSERVED_PREREQUISITE_REMEDIATION',
    'DIRECT_REMEDIATION',
    'PREREQUISITE_DIAGNOSTIC',
    'DIRECT_DIAGNOSTIC',
  ],
  cooldownDays: 14,
} as const;

export const TRAINING_CANDIDATE_POLICY_V2 = {
  ...TRAINING_CANDIDATE_POLICY_V1,
  version: TRAINING_CANDIDATE_POLICY_VERSION,
  supportedConceptStableIds: SUPPORTED_TRAINING_CONCEPT_IDS,
} as const;

export const TRAINING_ITEM_SOURCE_POLICY_V1 = {
  version: TRAINING_ITEM_SOURCE_POLICY_VERSION,
  scope: 'FOCAL_PLAYER_SELECTED_CANONICAL_GAMES_ONLY',
  remediation: 'FOCAL_PLAYER_NEGATIVE_DECISION_EVIDENCE',
  diagnostic: 'POSITIVE_DECISION_EVIDENCE_FROM_EITHER_SIDE_IN_SELECTED_GAMES',
  requiresTask008ConceptEvidence: true,
  requiresCompatiblePersistedEngineState: true,
  externalRequests: false,
} as const;

export const TACTICAL_TRAINING_ITEM_GENERATOR_V1 = {
  version: 'TACTICAL_TRAINING_ITEM_GENERATOR_V1',
  itemType: 'FIND_BEST_MOVE',
  acceptedMoveDerivation: {
    REMEDIATION: 'TASK_008_NEGATIVE_FACT_BEST_MOVE_UCI',
    DIAGNOSTIC: 'TASK_008_POSITIVE_FACT_PLAYED_MOVE_UCI',
  },
  requireLegalMove: true,
  requireDetectedTargetMotif: true,
  allowNewEngineSearch: false,
} as const;

export const TACTICAL_TRAINING_ITEM_GENERATOR_V2 = {
  ...TACTICAL_TRAINING_ITEM_GENERATOR_V1,
  version: TRAINING_ITEM_GENERATOR_VERSION,
  supportedConceptStableIds: SUPPORTED_TRAINING_CONCEPT_IDS,
  requiresMatchingClassifierBundle: 'CONCEPT_CLASSIFIER_BUNDLE_V2',
} as const;

export const TRAINING_REVEAL_POLICY_V1 = {
  version: TRAINING_REVEAL_POLICY_VERSION,
  REMEDIATION: { revealConceptBeforeAttempt: true, revealSourceBeforeAttempt: false },
  DIAGNOSTIC: { revealConceptBeforeAttempt: false, revealSourceBeforeAttempt: false },
  revealSolutionAfterAttempt: true,
} as const;

export const TRAINING_SOURCE_WEIGHT_V1: Readonly<Record<TrainingCandidateType, number>> = {
  REMEDIATION: 0.5,
  DIAGNOSTIC: 1,
};

export const SKILL_GRAPH_POLICY_V2 = {
  version: SKILL_GRAPH_POLICY_V2_VERSION,
  baseGamePolicyVersion: SKILL_GRAPH_POLICY_V1.versions.skillGraph,
  trainingEvidenceSelectionVersion: TRAINING_EVIDENCE_SELECTION_VERSION,
  trainingSourceWeightVersion: TRAINING_SOURCE_WEIGHT_VERSION,
  recencyVersion: EVIDENCE_RECENCY_VERSION,
  evidenceConfidenceVersion: SKILL_EVIDENCE_CONFIDENCE_V2_VERSION,
  masteryBandVersion: MASTERY_BAND_VERSION,
  betaPrior: SKILL_GRAPH_POLICY_V1.betaPrior,
  recencyHalfLifeDays: SKILL_GRAPH_POLICY_V1.recencyHalfLifeDays,
  sourceWeights: TRAINING_SOURCE_WEIGHT_V1,
  independenceUnits: {
    game: 'CANONICAL_GAME',
    training: 'TRAINING_ITEM_FIRST_SCORED_ATTEMPT',
  },
} as const;

export function trainingPolicyForClassifierBundle(classifierBundleVersion: string) {
  return classifierBundleVersion === 'CONCEPT_CLASSIFIER_BUNDLE_V1'
    ? {
        candidatePolicyVersion: 'TRAINING_CANDIDATE_POLICY_V1',
        candidatePolicy: TRAINING_CANDIDATE_POLICY_V1,
        generatorVersion: 'TACTICAL_TRAINING_ITEM_GENERATOR_V1',
        generator: TACTICAL_TRAINING_ITEM_GENERATOR_V1,
        supportedConceptStableIds: SUPPORTED_TRAINING_CONCEPT_IDS_V1 as readonly string[],
      }
    : {
        candidatePolicyVersion: TRAINING_CANDIDATE_POLICY_VERSION,
        candidatePolicy: TRAINING_CANDIDATE_POLICY_V2,
        generatorVersion: TRAINING_ITEM_GENERATOR_VERSION,
        generator: TACTICAL_TRAINING_ITEM_GENERATOR_V2,
        supportedConceptStableIds: SUPPORTED_TRAINING_CONCEPT_IDS as readonly string[],
      };
}

export function trainingCandidatePolicyConfigSha256(classifierBundleVersion?: string): string {
  return deterministicSha256(
    trainingPolicyForClassifierBundle(classifierBundleVersion ?? 'CONCEPT_CLASSIFIER_BUNDLE_V2')
      .candidatePolicy,
  );
}

export function trainingItemGeneratorConfigSha256(classifierBundleVersion?: string): string {
  return deterministicSha256(
    trainingPolicyForClassifierBundle(classifierBundleVersion ?? 'CONCEPT_CLASSIFIER_BUNDLE_V2')
      .generator,
  );
}

export function skillGraphV2PolicyConfigSha256(input: {
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  classificationSelectionPolicyVersion: string;
}): string {
  return deterministicSha256({ ...SKILL_GRAPH_POLICY_V2, ...input });
}

export interface TrainingSourceCandidate {
  evidenceInstanceId: string;
  conceptStableId: string;
  polarity: 'POSITIVE' | 'NEGATIVE';
  subjectPlayerId: string;
  evidenceDate: string;
  sourceGameId: string;
  sourceOccurrenceId: string;
  sourceClassificationRunId: string;
  sourceAnalysisRunId: string;
  exactHistorySha256: string;
}

export interface TrainingCandidateSelectionInput {
  playerId: string;
  asOfDate: string;
  concepts: ReadonlyArray<{
    detail: OntologyConceptDetail;
    state: PlayerConceptStateComputation;
  }>;
  sources: readonly TrainingSourceCandidate[];
  recentlyAttemptedSourceEvidenceIds?: readonly string[] | undefined;
  supportedConceptStableIds?: readonly string[] | undefined;
}

export interface TrainingCandidateDecision {
  conceptStableId: string;
  candidateType: TrainingCandidateType;
  disposition: TrainingCandidateDisposition;
  skillStateStatus: PlayerConceptStateComputation['status'];
  masteryBand: MasteryBand | null;
  evidenceConfidence: SkillEvidenceConfidence;
  prerequisiteStatus: PrerequisiteReadiness;
  selectedSourceEvidenceId: string | null;
  reasonCode: TrainingCandidateReasonCode;
  rank: number;
}

const CONFIDENCE_RANK: Readonly<Record<SkillEvidenceConfidence, number>> = {
  INSUFFICIENT: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
};

function isSupportedConcept(stableId: string, supported: readonly string[]): boolean {
  return supported.includes(stableId);
}

function prerequisiteReadiness(
  detail: OntologyConceptDetail,
  stateById: ReadonlyMap<string, PlayerConceptStateComputation>,
): PrerequisiteReadiness {
  if (detail.prerequisites.length === 0) return 'NOT_APPLICABLE';
  const prerequisiteStates = detail.prerequisites.map((entry) => stateById.get(entry.stableId));
  if (
    prerequisiteStates.some(
      (state) =>
        state?.status === 'ESTIMATED' &&
        (state.evidenceConfidence === 'MODERATE' || state.evidenceConfidence === 'HIGH') &&
        (state.masteryBand === 'EMERGING' || state.masteryBand === 'DEVELOPING'),
    )
  ) {
    return 'OBSERVED_NOT_READY';
  }
  if (
    prerequisiteStates.some(
      (state) =>
        !state ||
        state.status !== 'ESTIMATED' ||
        state.evidenceConfidence === 'INSUFFICIENT' ||
        state.evidenceConfidence === 'LOW',
    )
  ) {
    return 'UNVERIFIED';
  }
  return prerequisiteStates.every(
    (state) =>
      state?.masteryBand === 'ESTABLISHED' || state?.masteryBand === 'STRONG_EVIDENCE_OF_MASTERY',
  )
    ? 'READY'
    : 'UNVERIFIED';
}

function remediationEligible(state: PlayerConceptStateComputation): boolean {
  return (
    state.status === 'ESTIMATED' &&
    (state.evidenceConfidence === 'MODERATE' || state.evidenceConfidence === 'HIGH') &&
    (state.masteryBand === 'EMERGING' || state.masteryBand === 'DEVELOPING')
  );
}

function diagnosticEligible(state: PlayerConceptStateComputation): boolean {
  return (
    state.status === 'NO_EVIDENCE' ||
    state.status === 'INSUFFICIENT_EVIDENCE' ||
    (state.status === 'ESTIMATED' && state.evidenceConfidence === 'LOW')
  );
}

function sourceFor(
  sources: readonly TrainingSourceCandidate[],
  conceptStableId: string,
  candidateType: TrainingCandidateType,
  playerId: string,
): TrainingSourceCandidate | null {
  return (
    sources
      .filter(
        (source) =>
          source.conceptStableId === conceptStableId &&
          (candidateType === 'REMEDIATION'
            ? source.polarity === 'NEGATIVE' && source.subjectPlayerId === playerId
            : source.polarity === 'POSITIVE'),
      )
      .sort(
        (left, right) =>
          right.evidenceDate.localeCompare(left.evidenceDate) ||
          left.evidenceInstanceId.localeCompare(right.evidenceInstanceId),
      )[0] ?? null
  );
}

export function selectTrainingCandidates(
  input: TrainingCandidateSelectionInput,
): TrainingCandidateDecision[] {
  const stateById = new Map(
    input.concepts.map((entry) => [entry.state.conceptStableId, entry.state]),
  );
  const cooldown = new Set(input.recentlyAttemptedSourceEvidenceIds ?? []);
  const supported = input.supportedConceptStableIds ?? SUPPORTED_TRAINING_CONCEPT_IDS;
  const decisions: Array<TrainingCandidateDecision & { posterior: number; evidenceDate: string }> =
    [];

  for (const { detail, state } of input.concepts) {
    if (detail.kind === 'DOMAIN' || detail.status !== 'ACTIVE') continue;
    const candidateType: TrainingCandidateType | null = remediationEligible(state)
      ? 'REMEDIATION'
      : diagnosticEligible(state)
        ? 'DIAGNOSTIC'
        : null;
    if (!candidateType) continue;
    const readiness = prerequisiteReadiness(detail, stateById);
    const source = sourceFor(input.sources, detail.stableId, candidateType, input.playerId);
    const trainingPolicy = detail.allowedEvidence.find(
      (entry) =>
        entry.stableId === 'training.attempt' && entry.allowedPolarities.includes('POSITIVE'),
    );
    let disposition: TrainingCandidateDisposition = 'ELIGIBLE';
    let reasonCode: TrainingCandidateReasonCode =
      candidateType === 'REMEDIATION'
        ? 'SUFFICIENT_NEGATIVE_MASTERY_EVIDENCE'
        : 'NEEDS_MORE_DIRECT_EVIDENCE';

    if (!isSupportedConcept(detail.stableId, supported)) {
      disposition = 'UNSUPPORTED_CONCEPT_V1';
      reasonCode = 'UNSUPPORTED_ITEM_TYPE';
    } else if (!trainingPolicy) {
      disposition = 'ONTOLOGY_POLICY_UNSUPPORTED';
      reasonCode = 'ONTOLOGY_TRAINING_POLICY_MISSING';
    } else if (readiness === 'OBSERVED_NOT_READY') {
      disposition = 'PREREQUISITE_OBSERVED_NOT_READY';
      reasonCode = 'OBSERVED_PREREQUISITE_GAP';
    } else if (!source) {
      disposition = 'NO_ITEM_SOURCE';
      reasonCode = 'NO_COMPATIBLE_POSITION';
    } else if (cooldown.has(source.evidenceInstanceId)) {
      disposition = 'RECENTLY_ATTEMPTED';
      reasonCode = 'SOURCE_IN_COOLDOWN';
    } else if (readiness === 'UNVERIFIED') {
      // Unknown prerequisite evidence annotates, but does not block, a verifiable target item.
      reasonCode = 'PREREQUISITE_UNVERIFIED';
    }

    decisions.push({
      conceptStableId: detail.stableId,
      candidateType,
      disposition,
      skillStateStatus: state.status,
      masteryBand: state.masteryBand,
      evidenceConfidence: state.evidenceConfidence,
      prerequisiteStatus: readiness,
      selectedSourceEvidenceId: source?.evidenceInstanceId ?? null,
      reasonCode,
      rank: 0,
      posterior: state.posteriorMean ?? 1,
      evidenceDate: source?.evidenceDate ?? '',
    });
  }

  decisions.sort((left, right) => {
    const eligibleOrder =
      Number(right.disposition === 'ELIGIBLE') - Number(left.disposition === 'ELIGIBLE');
    if (eligibleOrder !== 0) return eligibleOrder;
    const typeOrder =
      Number(left.candidateType === 'DIAGNOSTIC') - Number(right.candidateType === 'DIAGNOSTIC');
    if (typeOrder !== 0) return typeOrder;
    if (left.candidateType === 'REMEDIATION') {
      return (
        CONFIDENCE_RANK[right.evidenceConfidence] - CONFIDENCE_RANK[left.evidenceConfidence] ||
        left.posterior - right.posterior ||
        right.evidenceDate.localeCompare(left.evidenceDate) ||
        left.conceptStableId.localeCompare(right.conceptStableId)
      );
    }
    return (
      Number(right.selectedSourceEvidenceId !== null) -
        Number(left.selectedSourceEvidenceId !== null) ||
      left.prerequisiteStatus.localeCompare(right.prerequisiteStatus) ||
      CONFIDENCE_RANK[left.evidenceConfidence] - CONFIDENCE_RANK[right.evidenceConfidence] ||
      left.conceptStableId.localeCompare(right.conceptStableId)
    );
  });
  return decisions.map((decision, index) => ({
    conceptStableId: decision.conceptStableId,
    candidateType: decision.candidateType,
    disposition: decision.disposition,
    skillStateStatus: decision.skillStateStatus,
    masteryBand: decision.masteryBand,
    evidenceConfidence: decision.evidenceConfidence,
    prerequisiteStatus: decision.prerequisiteStatus,
    selectedSourceEvidenceId: decision.selectedSourceEvidenceId,
    reasonCode: decision.reasonCode,
    rank: index + 1,
  }));
}

export function evaluateTrainingAttempt(
  normalizedSubmittedMoveUci: string,
  acceptedMoveUcis: readonly string[],
): TrainingAttemptResult {
  return acceptedMoveUcis.includes(normalizedSubmittedMoveUci) ? 'CORRECT' : 'INCORRECT';
}

export interface TrainingEvidenceForMastery {
  id: string;
  trainingAttemptId: string;
  trainingItemId: string;
  playerId: string;
  ontologyVersion: string;
  conceptStableId: string;
  evidenceRole: EvidenceRole;
  polarity: Exclude<EvidencePolarity, 'NEUTRAL'>;
  trainingMode: TrainingCandidateType;
  attemptNumber: number;
  submittedAt: string;
}

export function selectFirstTrainingEvidencePerItem(
  evidence: readonly TrainingEvidenceForMastery[],
): TrainingEvidenceForMastery[] {
  const selected = new Map<string, TrainingEvidenceForMastery>();
  for (const row of [...evidence].sort(
    (left, right) =>
      left.attemptNumber - right.attemptNumber ||
      left.submittedAt.localeCompare(right.submittedAt) ||
      left.id.localeCompare(right.id),
  )) {
    const key = `${row.playerId}|${row.trainingItemId}`;
    if (!selected.has(key)) selected.set(key, row);
  }
  return [...selected.values()].sort(
    (left, right) =>
      left.conceptStableId.localeCompare(right.conceptStableId) ||
      left.trainingItemId.localeCompare(right.trainingItemId),
  );
}

export interface TrainingMasteryContributionComputation {
  conceptStableId: string;
  trainingEvidenceInstanceId: string;
  trainingAttemptId: string;
  trainingItemId: string;
  historicalEvidenceRole: EvidenceRole;
  polarity: 'POSITIVE' | 'NEGATIVE';
  roleWeight: number;
  sourceWeight: number;
  recencyWeight: number;
  effectivePositiveWeight: number;
  effectiveNegativeWeight: number;
  evidenceDate: string;
}

export interface TrainingAugmentedConceptState extends PlayerConceptStateComputation {
  gamePositiveMass: number;
  gameNegativeMass: number;
  trainingPositiveMass: number;
  trainingNegativeMass: number;
  totalPositiveMass: number;
  totalNegativeMass: number;
  trainingItemCount: number;
  independentEvidenceUnitCount: number;
}

export interface TrainingAugmentedSkillGraphResult extends SkillGraphAggregationResult {
  conceptStates: TrainingAugmentedConceptState[];
  trainingContributions: TrainingMasteryContributionComputation[];
  selectedTrainingEvidence: TrainingEvidenceForMastery[];
}

export function classifySkillEvidenceConfidenceV2(
  effectiveEvidenceMass: number,
  independentEvidenceUnitCount: number,
): SkillEvidenceConfidence {
  const policy = SKILL_GRAPH_POLICY_V1.evidenceConfidence;
  if (
    effectiveEvidenceMass < policy.minimumEffectiveMass ||
    independentEvidenceUnitCount < policy.minimumCanonicalGames
  ) {
    return 'INSUFFICIENT';
  }
  if (effectiveEvidenceMass < policy.moderateEffectiveMass) return 'LOW';
  if (effectiveEvidenceMass < policy.highEffectiveMass) return 'MODERATE';
  return 'HIGH';
}

export function aggregateTrainingAugmentedSkillGraph(input: {
  ontologyVersion: string;
  gameEvidence: SkillGraphAggregationInput;
  trainingEvidence: readonly TrainingEvidenceForMastery[];
}): TrainingAugmentedSkillGraphResult {
  const game = aggregatePlayerSkillGraph(input.gameEvidence);
  const selectedTrainingEvidence = selectFirstTrainingEvidencePerItem(
    input.trainingEvidence,
  ).filter(
    (row) =>
      row.playerId === input.gameEvidence.playerId && row.ontologyVersion === input.ontologyVersion,
  );
  const trainingContributions = selectedTrainingEvidence
    .map((row): TrainingMasteryContributionComputation | null => {
      const roleWeight = applyEvidenceRoleWeight(row.evidenceRole);
      if (roleWeight <= 0) return null;
      const evidenceDate = row.submittedAt.slice(0, 10);
      const sourceWeight = TRAINING_SOURCE_WEIGHT_V1[row.trainingMode];
      const recencyWeight = calculateRecencyWeight(evidenceDate, input.gameEvidence.asOfDate);
      const effective = roleWeight * sourceWeight * recencyWeight;
      return {
        conceptStableId: row.conceptStableId,
        trainingEvidenceInstanceId: row.id,
        trainingAttemptId: row.trainingAttemptId,
        trainingItemId: row.trainingItemId,
        historicalEvidenceRole: row.evidenceRole,
        polarity: row.polarity,
        roleWeight,
        sourceWeight,
        recencyWeight,
        effectivePositiveWeight: row.polarity === 'POSITIVE' ? effective : 0,
        effectiveNegativeWeight: row.polarity === 'NEGATIVE' ? effective : 0,
        evidenceDate,
      };
    })
    .filter((row): row is TrainingMasteryContributionComputation => row !== null)
    .sort(
      (left, right) =>
        left.conceptStableId.localeCompare(right.conceptStableId) ||
        left.trainingItemId.localeCompare(right.trainingItemId),
    );

  const conceptStates = game.conceptStates.map((state): TrainingAugmentedConceptState => {
    const training = trainingContributions.filter(
      (entry) => entry.conceptStableId === state.conceptStableId,
    );
    const trainingPositiveMass = training.reduce(
      (sum, entry) => sum + entry.effectivePositiveWeight,
      0,
    );
    const trainingNegativeMass = training.reduce(
      (sum, entry) => sum + entry.effectiveNegativeWeight,
      0,
    );
    const totalPositiveMass = state.positiveEvidenceMass + trainingPositiveMass;
    const totalNegativeMass = state.negativeEvidenceMass + trainingNegativeMass;
    const effectiveEvidenceMass = totalPositiveMass + totalNegativeMass;
    const trainingItemCount = new Set(training.map((entry) => entry.trainingItemId)).size;
    const independentEvidenceUnitCount = state.canonicalGameCount + trainingItemCount;
    const evidenceConfidence = classifySkillEvidenceConfidenceV2(
      effectiveEvidenceMass,
      independentEvidenceUnitCount,
    );
    const hasEvidence = state.rawPositiveCount + state.rawNegativeCount + training.length > 0;
    const status: PlayerConceptStateComputation['status'] = !hasEvidence
      ? 'NO_EVIDENCE'
      : evidenceConfidence === 'INSUFFICIENT'
        ? 'INSUFFICIENT_EVIDENCE'
        : 'ESTIMATED';
    const posterior = calculateBetaPosterior(totalPositiveMass, totalNegativeMass);
    const dates = [
      ...(state.firstEvidenceAt ? [state.firstEvidenceAt] : []),
      ...(state.lastEvidenceAt ? [state.lastEvidenceAt] : []),
      ...training.map((entry) => entry.evidenceDate),
    ].sort();
    return {
      ...state,
      status,
      posteriorAlpha: posterior.alpha,
      posteriorBeta: posterior.beta,
      posteriorMean: status === 'NO_EVIDENCE' ? null : posterior.mean,
      positiveEvidenceMass: totalPositiveMass,
      negativeEvidenceMass: totalNegativeMass,
      effectiveEvidenceMass,
      rawPositiveCount:
        state.rawPositiveCount + training.filter((entry) => entry.polarity === 'POSITIVE').length,
      rawNegativeCount:
        state.rawNegativeCount + training.filter((entry) => entry.polarity === 'NEGATIVE').length,
      firstEvidenceAt: dates[0] ?? null,
      lastEvidenceAt: dates.at(-1) ?? null,
      evidenceConfidence,
      masteryBand: status === 'ESTIMATED' ? classifyMasteryBand(posterior.mean) : null,
      gamePositiveMass: state.positiveEvidenceMass,
      gameNegativeMass: state.negativeEvidenceMass,
      trainingPositiveMass,
      trainingNegativeMass,
      totalPositiveMass,
      totalNegativeMass,
      trainingItemCount,
      independentEvidenceUnitCount,
    };
  });
  return {
    ...game,
    conceptStates,
    trainingContributions,
    selectedTrainingEvidence,
  };
}

export function skillGraphV2EvidenceSnapshotSha256(input: {
  playerId: string;
  ontologyVersion: string;
  asOfDate: string;
  selectedClassificationRunIds: readonly string[];
  selectedGameEvidenceIds: readonly string[];
  selectedTrainingEvidenceIds: readonly string[];
}): string {
  return deterministicSha256({
    playerId: input.playerId,
    ontologyVersion: input.ontologyVersion,
    asOfDate: input.asOfDate,
    classificationSelectionPolicyVersion: SKILL_GRAPH_POLICY_V1.versions.classificationSelection,
    trainingEvidenceSelectionPolicyVersion: TRAINING_EVIDENCE_SELECTION_VERSION,
    selectedClassificationRunIds: [...new Set(input.selectedClassificationRunIds)].sort(),
    selectedGameEvidenceIds: [...new Set(input.selectedGameEvidenceIds)].sort(),
    selectedTrainingEvidenceIds: [...new Set(input.selectedTrainingEvidenceIds)].sort(),
  });
}
