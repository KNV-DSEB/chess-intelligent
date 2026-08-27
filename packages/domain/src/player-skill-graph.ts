import { createHash } from 'node:crypto';

import type {
  Color,
  DataSourceType,
  GameContext,
  ResolvedPlayerIdentity,
  TimeCategory,
} from './index';
import type { EvidencePolarity, EvidenceRole } from './ontology';

export const SKILL_EVIDENCE_WEIGHT_VERSION = 'SKILL_EVIDENCE_WEIGHT_V1';
export const EVIDENCE_INDEPENDENCE_VERSION = 'EVIDENCE_INDEPENDENCE_V1';
export const CLASSIFICATION_SELECTION_VERSION = 'CLASSIFICATION_SELECTION_V1';
export const EVIDENCE_RECENCY_VERSION = 'EVIDENCE_RECENCY_V1';
export const SKILL_MASTERY_VERSION = 'SKILL_MASTERY_V1';
export const SKILL_EVIDENCE_CONFIDENCE_VERSION = 'SKILL_EVIDENCE_CONFIDENCE_V1';
export const MASTERY_BAND_VERSION = 'MASTERY_BAND_V1';
export const SKILL_GRAPH_POLICY_VERSION = 'SKILL_GRAPH_POLICY_V1';

export const SKILL_GRAPH_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type SkillGraphRunStatus = (typeof SKILL_GRAPH_STATUSES)[number];

export const PLAYER_CONCEPT_STATE_STATUSES = [
  'NO_EVIDENCE',
  'INSUFFICIENT_EVIDENCE',
  'ESTIMATED',
] as const;
export type PlayerConceptStateStatus = (typeof PLAYER_CONCEPT_STATE_STATUSES)[number];

export const SKILL_EVIDENCE_CONFIDENCE_BANDS = ['INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH'] as const;
export type SkillEvidenceConfidence = (typeof SKILL_EVIDENCE_CONFIDENCE_BANDS)[number];

export const MASTERY_BANDS = [
  'EMERGING',
  'DEVELOPING',
  'ESTABLISHED',
  'STRONG_EVIDENCE_OF_MASTERY',
] as const;
export type MasteryBand = (typeof MASTERY_BANDS)[number];

export interface PlayerSkillGraphScope {
  gameContexts: GameContext[];
  timeCategories: TimeCategory[];
  playedFrom: string | null;
  playedTo: string | null;
  sourceTypes: DataSourceType[];
}

export interface PlayerSkillGraphScopeInput {
  gameContexts?: GameContext[] | undefined;
  timeCategories?: TimeCategory[] | undefined;
  playedFrom?: string | null | undefined;
  playedTo?: string | null | undefined;
  sourceTypes?: DataSourceType[] | undefined;
}

export const CONSERVATIVE_SKILL_GRAPH_SCOPE: Readonly<PlayerSkillGraphScope> = {
  gameContexts: ['OTB'],
  timeCategories: ['CLASSICAL'],
  playedFrom: null,
  playedTo: null,
  sourceTypes: [],
};

export const SKILL_GRAPH_POLICY_V1 = {
  versions: {
    skillGraph: SKILL_GRAPH_POLICY_VERSION,
    classificationSelection: CLASSIFICATION_SELECTION_VERSION,
    evidenceWeight: SKILL_EVIDENCE_WEIGHT_VERSION,
    independence: EVIDENCE_INDEPENDENCE_VERSION,
    recency: EVIDENCE_RECENCY_VERSION,
    mastery: SKILL_MASTERY_VERSION,
    evidenceConfidence: SKILL_EVIDENCE_CONFIDENCE_VERSION,
    masteryBand: MASTERY_BAND_VERSION,
  },
  classificationSelection: {
    strategy: 'ENGINE_BACKED_THEN_LATEST_COMPLETED_COMPATIBLE_PER_GAME',
    analysisProfile: 'QUICK_V1',
    analysisProfileVersion: 1,
  },
  roleWeights: {
    DIRECT: 1,
    SUPPORTING: 0.5,
    CONTEXTUAL: 0,
  } satisfies Readonly<Record<EvidenceRole, number>>,
  maximumGameContribution: 1,
  recencyHalfLifeDays: 365,
  betaPrior: { alpha: 2, beta: 2 },
  evidenceConfidence: {
    minimumEffectiveMass: 1.5,
    minimumCanonicalGames: 2,
    moderateEffectiveMass: 4,
    highEffectiveMass: 8,
  },
  masteryBands: {
    developingMinimum: 0.4,
    establishedMinimum: 0.65,
    strongEvidenceMinimum: 0.85,
  },
} as const;

export interface SkillGraphPolicyIdentityInput {
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  classificationSelectionPolicyVersion?: string | undefined;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export function deterministicSha256(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}

export function skillGraphPolicyConfig(input: SkillGraphPolicyIdentityInput) {
  return {
    ...SKILL_GRAPH_POLICY_V1,
    ontologyVersion: input.ontologyVersion,
    classifierBundleVersion: input.classifierBundleVersion,
    classifierConfigSha256: input.classifierConfigSha256,
    classificationSelectionPolicyVersion:
      input.classificationSelectionPolicyVersion ?? CLASSIFICATION_SELECTION_VERSION,
  };
}

export function skillGraphPolicyConfigSha256(input: SkillGraphPolicyIdentityInput): string {
  return deterministicSha256(skillGraphPolicyConfig(input));
}

export function normalizeSkillGraphScope(
  input: PlayerSkillGraphScopeInput | undefined,
): PlayerSkillGraphScope {
  return {
    gameContexts: [...(input?.gameContexts ?? CONSERVATIVE_SKILL_GRAPH_SCOPE.gameContexts)].sort(),
    timeCategories: [
      ...(input?.timeCategories ?? CONSERVATIVE_SKILL_GRAPH_SCOPE.timeCategories),
    ].sort(),
    playedFrom: input?.playedFrom ?? null,
    playedTo: input?.playedTo ?? null,
    sourceTypes: [...(input?.sourceTypes ?? CONSERVATIVE_SKILL_GRAPH_SCOPE.sourceTypes)].sort(),
  };
}

export function applyEvidenceRoleWeight(role: EvidenceRole): number {
  return SKILL_GRAPH_POLICY_V1.roleWeights[role];
}

function dateOnlyEpoch(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new Error(`Expected a date-only value, received ${value}.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(epoch).toISOString().slice(0, 10);
  if (roundTrip !== value) throw new Error(`Invalid date-only value ${value}.`);
  return epoch;
}

export function calculateRecencyWeight(
  evidenceDate: string,
  asOfDate: string,
  halfLifeDays = SKILL_GRAPH_POLICY_V1.recencyHalfLifeDays,
): number {
  if (halfLifeDays <= 0) throw new Error('Recency half-life must be positive.');
  const elapsedDays = Math.max(
    0,
    (dateOnlyEpoch(asOfDate) - dateOnlyEpoch(evidenceDate)) / 86_400_000,
  );
  return 0.5 ** (elapsedDays / halfLifeDays);
}

export function calculateBetaPosterior(
  positiveMass: number,
  negativeMass: number,
): {
  alpha: number;
  beta: number;
  mean: number;
} {
  const alpha = SKILL_GRAPH_POLICY_V1.betaPrior.alpha + positiveMass;
  const beta = SKILL_GRAPH_POLICY_V1.betaPrior.beta + negativeMass;
  return { alpha, beta, mean: alpha / (alpha + beta) };
}

export function classifySkillEvidenceConfidence(
  effectiveEvidenceMass: number,
  canonicalGames: number,
): SkillEvidenceConfidence {
  const policy = SKILL_GRAPH_POLICY_V1.evidenceConfidence;
  if (
    effectiveEvidenceMass < policy.minimumEffectiveMass ||
    canonicalGames < policy.minimumCanonicalGames
  ) {
    return 'INSUFFICIENT';
  }
  if (effectiveEvidenceMass < policy.moderateEffectiveMass) return 'LOW';
  if (effectiveEvidenceMass < policy.highEffectiveMass) return 'MODERATE';
  return 'HIGH';
}

export function classifyMasteryBand(posteriorMean: number): MasteryBand {
  const policy = SKILL_GRAPH_POLICY_V1.masteryBands;
  if (posteriorMean < policy.developingMinimum) return 'EMERGING';
  if (posteriorMean < policy.establishedMinimum) return 'DEVELOPING';
  if (posteriorMean < policy.strongEvidenceMinimum) return 'ESTABLISHED';
  return 'STRONG_EVIDENCE_OF_MASTERY';
}

export interface SkillGraphGameInput {
  gameId: string;
  focalColor: Color;
  contentStatus: 'METADATA_ONLY' | 'MOVES_AVAILABLE';
  playedAt: string | null;
}

export interface SkillGraphDecisionInput {
  gameId: string;
  positionOccurrenceId: string;
  occurrencePly: number;
  classified: boolean;
  engineBacked: boolean;
}

export interface SkillGraphSelectedRunInput {
  gameId: string;
  classificationRunId: string;
  selectedAnalysisRunId: string | null;
  completedAt: string;
}

export interface SkillGraphEvidenceInput {
  id: string;
  classificationRunId: string;
  gameId: string;
  conceptStableId: string;
  evidenceTypeStableId: string;
  evidenceRole: EvidenceRole;
  polarity: EvidencePolarity;
  subjectKind: 'POSITION' | 'DECISION';
  subjectPlayerId: string | null;
  subjectColor: Color;
  analysisRunId: string | null;
  positionOccurrenceId: string;
  occurrencePly: number;
  evidenceDate: string;
  createdAt: string;
}

export interface SkillGraphCoverage {
  canonicalGames: number;
  gamesWithMoves: number;
  decisionOccurrences: number;
  classifiedDecisions: number;
  engineBackedDecisions: number;
  eligibleEvidence: number;
  masteryEligibleEvidence: number;
  positiveMasteryEvidence: number;
  negativeMasteryEvidence: number;
  neutralExposureEvidence: number;
  selectedClassificationRuns: number;
  gamesWithSelectedClassificationRun: number;
}

export interface SkillGraphEvidenceContributionComputation {
  conceptEvidenceInstanceId: string;
  historicalEvidenceRole: EvidenceRole;
  polarity: 'POSITIVE' | 'NEGATIVE';
  roleWeight: number;
  preCapContribution: number;
}

export interface PlayerConceptGameContributionComputation {
  conceptStableId: string;
  gameId: string;
  classificationRunId: string;
  rawPositiveWeight: number;
  rawNegativeWeight: number;
  cappedPositiveWeight: number;
  cappedNegativeWeight: number;
  recencyWeight: number;
  effectivePositiveWeight: number;
  effectiveNegativeWeight: number;
  evidenceDate: string;
  evidence: SkillGraphEvidenceContributionComputation[];
}

export interface PlayerConceptStateComputation {
  conceptStableId: string;
  status: PlayerConceptStateStatus;
  posteriorAlpha: number;
  posteriorBeta: number;
  posteriorMean: number | null;
  positiveEvidenceMass: number;
  negativeEvidenceMass: number;
  effectiveEvidenceMass: number;
  rawPositiveCount: number;
  rawNegativeCount: number;
  neutralExposureCount: number;
  neutralExposureGameCount: number;
  contextualEvidenceCount: number;
  canonicalGameCount: number;
  firstEvidenceAt: string | null;
  lastEvidenceAt: string | null;
  evidenceConfidence: SkillEvidenceConfidence;
  masteryBand: MasteryBand | null;
}

export interface SkillGraphAggregationInput {
  playerId: string;
  conceptStableIds: readonly string[];
  games: readonly SkillGraphGameInput[];
  decisions: readonly SkillGraphDecisionInput[];
  selectedRuns: readonly SkillGraphSelectedRunInput[];
  evidence: readonly SkillGraphEvidenceInput[];
  asOfDate: string;
}

export interface SkillGraphAggregationResult {
  coverage: SkillGraphCoverage;
  conceptStates: PlayerConceptStateComputation[];
  gameContributions: PlayerConceptGameContributionComputation[];
}

function uniqueEvidence(evidence: readonly SkillGraphEvidenceInput[]): SkillGraphEvidenceInput[] {
  const byId = new Map<string, SkillGraphEvidenceInput>();
  for (const item of evidence) {
    const existing = byId.get(item.id);
    if (existing && deterministicSha256(existing) !== deterministicSha256(item)) {
      throw new Error(`Conflicting evidence projection for ${item.id}.`);
    }
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function masteryEligible(
  evidence: SkillGraphEvidenceInput,
  playerId: string,
): evidence is SkillGraphEvidenceInput & { polarity: 'POSITIVE' | 'NEGATIVE' } {
  return (
    evidence.subjectKind === 'DECISION' &&
    evidence.subjectPlayerId === playerId &&
    (evidence.polarity === 'POSITIVE' || evidence.polarity === 'NEGATIVE') &&
    evidence.analysisRunId !== null &&
    applyEvidenceRoleWeight(evidence.evidenceRole) > 0
  );
}

export function aggregatePlayerSkillGraph(
  input: SkillGraphAggregationInput,
): SkillGraphAggregationResult {
  dateOnlyEpoch(input.asOfDate);
  const evidence = uniqueEvidence(input.evidence).filter(
    (entry) =>
      entry.subjectKind === 'POSITION' ||
      (entry.subjectKind === 'DECISION' && entry.subjectPlayerId === input.playerId),
  );
  const eligible = evidence.filter((entry) => masteryEligible(entry, input.playerId));
  const groups = new Map<string, typeof eligible>();
  for (const entry of eligible) {
    const key = `${entry.conceptStableId}|${entry.gameId}`;
    const values = groups.get(key) ?? [];
    values.push(entry);
    groups.set(key, values);
  }

  const gameContributions: PlayerConceptGameContributionComputation[] = [];
  for (const values of groups.values()) {
    const first = values[0]!;
    const rawPositiveWeight = values
      .filter((entry) => entry.polarity === 'POSITIVE')
      .reduce((sum, entry) => sum + applyEvidenceRoleWeight(entry.evidenceRole), 0);
    const rawNegativeWeight = values
      .filter((entry) => entry.polarity === 'NEGATIVE')
      .reduce((sum, entry) => sum + applyEvidenceRoleWeight(entry.evidenceRole), 0);
    const rawTotal = rawPositiveWeight + rawNegativeWeight;
    if (rawTotal <= 0) continue;
    const capScale = Math.min(1, SKILL_GRAPH_POLICY_V1.maximumGameContribution / rawTotal);
    const cappedPositiveWeight = rawPositiveWeight * capScale;
    const cappedNegativeWeight = rawNegativeWeight * capScale;
    const evidenceDate = values
      .map((entry) => entry.evidenceDate)
      .sort()
      .at(-1)!;
    const recencyWeight = calculateRecencyWeight(evidenceDate, input.asOfDate);
    gameContributions.push({
      conceptStableId: first.conceptStableId,
      gameId: first.gameId,
      classificationRunId: first.classificationRunId,
      rawPositiveWeight,
      rawNegativeWeight,
      cappedPositiveWeight,
      cappedNegativeWeight,
      recencyWeight,
      effectivePositiveWeight: cappedPositiveWeight * recencyWeight,
      effectiveNegativeWeight: cappedNegativeWeight * recencyWeight,
      evidenceDate,
      evidence: values
        .map((entry) => ({
          conceptEvidenceInstanceId: entry.id,
          historicalEvidenceRole: entry.evidenceRole,
          polarity: entry.polarity,
          roleWeight: applyEvidenceRoleWeight(entry.evidenceRole),
          preCapContribution: applyEvidenceRoleWeight(entry.evidenceRole),
        }))
        .sort((left, right) =>
          left.conceptEvidenceInstanceId.localeCompare(right.conceptEvidenceInstanceId),
        ),
    });
  }
  gameContributions.sort(
    (left, right) =>
      left.conceptStableId.localeCompare(right.conceptStableId) ||
      left.gameId.localeCompare(right.gameId),
  );

  const conceptIds = [...new Set(input.conceptStableIds)].sort();
  const conceptStates = conceptIds.map((conceptStableId): PlayerConceptStateComputation => {
    const conceptEvidence = evidence.filter((entry) => entry.conceptStableId === conceptStableId);
    const conceptEligible = eligible.filter((entry) => entry.conceptStableId === conceptStableId);
    const contributions = gameContributions.filter(
      (entry) => entry.conceptStableId === conceptStableId,
    );
    const positiveEvidenceMass = contributions.reduce(
      (sum, entry) => sum + entry.effectivePositiveWeight,
      0,
    );
    const negativeEvidenceMass = contributions.reduce(
      (sum, entry) => sum + entry.effectiveNegativeWeight,
      0,
    );
    const effectiveEvidenceMass = positiveEvidenceMass + negativeEvidenceMass;
    const canonicalGameCount = contributions.length;
    const confidence = classifySkillEvidenceConfidence(effectiveEvidenceMass, canonicalGameCount);
    const status: PlayerConceptStateStatus =
      conceptEligible.length === 0
        ? 'NO_EVIDENCE'
        : confidence === 'INSUFFICIENT'
          ? 'INSUFFICIENT_EVIDENCE'
          : 'ESTIMATED';
    const posterior = calculateBetaPosterior(positiveEvidenceMass, negativeEvidenceMass);
    const evidenceDates = conceptEvidence.map((entry) => entry.evidenceDate).sort();
    const neutral = conceptEvidence.filter((entry) => entry.polarity === 'NEUTRAL');
    return {
      conceptStableId,
      status,
      posteriorAlpha: posterior.alpha,
      posteriorBeta: posterior.beta,
      posteriorMean: status === 'NO_EVIDENCE' ? null : posterior.mean,
      positiveEvidenceMass,
      negativeEvidenceMass,
      effectiveEvidenceMass,
      rawPositiveCount: conceptEligible.filter((entry) => entry.polarity === 'POSITIVE').length,
      rawNegativeCount: conceptEligible.filter((entry) => entry.polarity === 'NEGATIVE').length,
      neutralExposureCount: neutral.length,
      neutralExposureGameCount: new Set(neutral.map((entry) => entry.gameId)).size,
      contextualEvidenceCount: conceptEvidence.filter(
        (entry) => entry.evidenceRole === 'CONTEXTUAL',
      ).length,
      canonicalGameCount,
      firstEvidenceAt: evidenceDates[0] ?? null,
      lastEvidenceAt: evidenceDates.at(-1) ?? null,
      evidenceConfidence: confidence,
      masteryBand: status === 'ESTIMATED' ? classifyMasteryBand(posterior.mean) : null,
    };
  });

  return {
    coverage: {
      canonicalGames: new Set(input.games.map((game) => game.gameId)).size,
      gamesWithMoves: new Set(
        input.games
          .filter((game) => game.contentStatus === 'MOVES_AVAILABLE')
          .map((game) => game.gameId),
      ).size,
      decisionOccurrences: new Set(input.decisions.map((entry) => entry.positionOccurrenceId)).size,
      classifiedDecisions: new Set(
        input.decisions
          .filter((entry) => entry.classified)
          .map((entry) => entry.positionOccurrenceId),
      ).size,
      engineBackedDecisions: new Set(
        input.decisions
          .filter((entry) => entry.engineBacked)
          .map((entry) => entry.positionOccurrenceId),
      ).size,
      eligibleEvidence: evidence.length,
      masteryEligibleEvidence: eligible.length,
      positiveMasteryEvidence: eligible.filter((entry) => entry.polarity === 'POSITIVE').length,
      negativeMasteryEvidence: eligible.filter((entry) => entry.polarity === 'NEGATIVE').length,
      neutralExposureEvidence: evidence.filter((entry) => entry.polarity === 'NEUTRAL').length,
      selectedClassificationRuns: new Set(
        input.selectedRuns.map((entry) => entry.classificationRunId),
      ).size,
      gamesWithSelectedClassificationRun: new Set(input.selectedRuns.map((entry) => entry.gameId))
        .size,
    },
    conceptStates,
    gameContributions,
  };
}

export function skillGraphInputSnapshotSha256(input: SkillGraphAggregationInput): string {
  return deterministicSha256({
    playerId: input.playerId,
    asOfDate: input.asOfDate,
    games: [...input.games].sort((left, right) => left.gameId.localeCompare(right.gameId)),
    decisions: [...input.decisions].sort((left, right) =>
      left.positionOccurrenceId.localeCompare(right.positionOccurrenceId),
    ),
    selectedRuns: [...input.selectedRuns].sort((left, right) =>
      left.gameId.localeCompare(right.gameId),
    ),
    evidenceIds: [...new Set(input.evidence.map((entry) => entry.id))].sort(),
  });
}

export interface PlayerSkillGraphRunView {
  id: string;
  player: ResolvedPlayerIdentity;
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  classificationSelectionPolicyVersion: string;
  skillGraphPolicyVersion: string;
  policyConfigSha256: string;
  inputSnapshotSha256: string;
  evidenceScope: PlayerSkillGraphScope;
  asOfDate: string;
  status: SkillGraphRunStatus;
  coverage: SkillGraphCoverage;
  conceptStateCount: number;
  startedAt: string;
  completedAt: string | null;
}
