import { describe, expect, it } from 'vitest';

import type { OntologyConceptDetail } from './ontology';
import type {
  PlayerConceptStateComputation,
  SkillGraphAggregationInput,
  SkillGraphEvidenceInput,
} from './player-skill-graph';
import {
  SKILL_GRAPH_POLICY_V2_VERSION,
  aggregateTrainingAugmentedSkillGraph,
  classifySkillEvidenceConfidenceV2,
  selectFirstTrainingEvidencePerItem,
  selectTrainingCandidates,
  skillGraphV2EvidenceSnapshotSha256,
  type TrainingEvidenceForMastery,
  type TrainingSourceCandidate,
} from './adaptive-training';

const playerId = '10000000-0000-4000-8000-000000000001';
const opponentId = '10000000-0000-4000-8000-000000000002';
const gameId = '20000000-0000-4000-8000-000000000001';
const classificationRunId = '30000000-0000-4000-8000-000000000001';
const analysisRunId = '40000000-0000-4000-8000-000000000001';

function state(
  conceptStableId: string,
  overrides: Partial<PlayerConceptStateComputation> = {},
): PlayerConceptStateComputation {
  return {
    conceptStableId,
    status: 'NO_EVIDENCE',
    posteriorAlpha: 2,
    posteriorBeta: 2,
    posteriorMean: null,
    positiveEvidenceMass: 0,
    negativeEvidenceMass: 0,
    effectiveEvidenceMass: 0,
    rawPositiveCount: 0,
    rawNegativeCount: 0,
    neutralExposureCount: 0,
    neutralExposureGameCount: 0,
    contextualEvidenceCount: 0,
    canonicalGameCount: 0,
    firstEvidenceAt: null,
    lastEvidenceAt: null,
    evidenceConfidence: 'INSUFFICIENT',
    masteryBand: null,
    ...overrides,
  };
}

function detail(
  stableId: string,
  prerequisites: OntologyConceptDetail['prerequisites'] = [],
  withTrainingPolicy = true,
): OntologyConceptDetail {
  return {
    stableId,
    displayName: stableId,
    shortDescription: stableId,
    kind: 'MOTIF',
    difficulty: 'BASIC',
    status: 'ACTIVE',
    aliases: [],
    replacementConceptIds: [],
    ontologyVersion: '1.0.0',
    parent: null,
    children: [],
    prerequisites,
    dependents: [],
    allowedEvidence: withTrainingPolicy
      ? [
          {
            stableId: 'training.attempt',
            displayName: 'Training attempt',
            description: 'Scored attempt',
            sourceClass: 'TRAINING',
            allowedPolarities: ['POSITIVE', 'NEGATIVE'],
            role: 'DIRECT',
            rationale: 'Targeted assessment.',
          },
        ]
      : [],
  };
}

function source(
  conceptStableId: string,
  polarity: 'POSITIVE' | 'NEGATIVE',
  subjectPlayerId = playerId,
): TrainingSourceCandidate {
  return {
    evidenceInstanceId: `${conceptStableId}-${polarity}`,
    conceptStableId,
    polarity,
    subjectPlayerId,
    evidenceDate: '2026-08-26',
    sourceGameId: gameId,
    sourceOccurrenceId: '50000000-0000-4000-8000-000000000001',
    sourceClassificationRunId: classificationRunId,
    sourceAnalysisRunId: analysisRunId,
    exactHistorySha256: 'a'.repeat(64),
  };
}

describe('Task 010 training candidate policy', () => {
  it('creates remediation only from sufficiently supported low-band evidence plus a negative source', () => {
    const fork = state('tactics.fork', {
      status: 'ESTIMATED',
      posteriorAlpha: 4,
      posteriorBeta: 6,
      posteriorMean: 0.4,
      positiveEvidenceMass: 2,
      negativeEvidenceMass: 4,
      effectiveEvidenceMass: 6,
      rawPositiveCount: 2,
      rawNegativeCount: 4,
      canonicalGameCount: 6,
      evidenceConfidence: 'MODERATE',
      masteryBand: 'DEVELOPING',
    });
    const decisions = selectTrainingCandidates({
      playerId,
      asOfDate: '2026-08-27',
      concepts: [{ detail: detail('tactics.fork'), state: fork }],
      sources: [source('tactics.fork', 'NEGATIVE')],
    });
    expect(decisions).toEqual([
      expect.objectContaining({
        candidateType: 'REMEDIATION',
        disposition: 'ELIGIBLE',
        reasonCode: 'SUFFICIENT_NEGATIVE_MASTERY_EVIDENCE',
        selectedSourceEvidenceId: 'tactics.fork-NEGATIVE',
      }),
    ]);
  });

  it('never turns one insufficient negative event into remediation', () => {
    const decisions = selectTrainingCandidates({
      playerId,
      asOfDate: '2026-08-27',
      concepts: [
        {
          detail: detail('tactics.fork'),
          state: state('tactics.fork', {
            status: 'INSUFFICIENT_EVIDENCE',
            posteriorMean: 0.4,
            negativeEvidenceMass: 1,
            effectiveEvidenceMass: 1,
            rawNegativeCount: 1,
            canonicalGameCount: 1,
          }),
        },
      ],
      sources: [source('tactics.fork', 'NEGATIVE')],
    });
    expect(decisions[0]).toMatchObject({
      candidateType: 'DIAGNOSTIC',
      disposition: 'NO_ITEM_SOURCE',
      reasonCode: 'NO_COMPATIBLE_POSITION',
    });
  });

  it('uses opponent positive evidence only as diagnostic source material', () => {
    const decisions = selectTrainingCandidates({
      playerId,
      asOfDate: '2026-08-27',
      concepts: [{ detail: detail('tactics.pin'), state: state('tactics.pin') }],
      sources: [source('tactics.pin', 'POSITIVE', opponentId)],
    });
    expect(decisions[0]).toMatchObject({
      candidateType: 'DIAGNOSTIC',
      disposition: 'ELIGIBLE',
      selectedSourceEvidenceId: 'tactics.pin-POSITIVE',
    });
  });

  it('keeps unknown prerequisites distinct from observed-not-ready prerequisites', () => {
    const prerequisite = {
      stableId: 'tactics.pin',
      displayName: 'Pin',
      kind: 'MOTIF' as const,
      difficulty: 'BASIC' as const,
      status: 'ACTIVE' as const,
    };
    const unknown = selectTrainingCandidates({
      playerId,
      asOfDate: '2026-08-27',
      concepts: [
        { detail: detail('tactics.pin'), state: state('tactics.pin') },
        {
          detail: detail('tactics.skewer', [prerequisite]),
          state: state('tactics.skewer'),
        },
      ],
      sources: [source('tactics.skewer', 'POSITIVE')],
    });
    expect(unknown.find((entry) => entry.conceptStableId === 'tactics.skewer')).toMatchObject({
      prerequisiteStatus: 'UNVERIFIED',
      disposition: 'ELIGIBLE',
      reasonCode: 'PREREQUISITE_UNVERIFIED',
    });

    const observed = selectTrainingCandidates({
      playerId,
      asOfDate: '2026-08-27',
      concepts: [
        {
          detail: detail('tactics.pin'),
          state: state('tactics.pin', {
            status: 'ESTIMATED',
            posteriorMean: 0.3,
            effectiveEvidenceMass: 4,
            canonicalGameCount: 4,
            evidenceConfidence: 'MODERATE',
            masteryBand: 'EMERGING',
          }),
        },
        {
          detail: detail('tactics.skewer', [prerequisite]),
          state: state('tactics.skewer'),
        },
      ],
      sources: [source('tactics.skewer', 'POSITIVE')],
    });
    expect(observed.find((entry) => entry.conceptStableId === 'tactics.skewer')).toMatchObject({
      prerequisiteStatus: 'OBSERVED_NOT_READY',
      disposition: 'PREREQUISITE_OBSERVED_NOT_READY',
      reasonCode: 'OBSERVED_PREREQUISITE_GAP',
    });
  });

  it('surfaces unsupported concepts and cooldown explicitly', () => {
    const decisions = selectTrainingCandidates({
      playerId,
      asOfDate: '2026-08-27',
      concepts: [
        {
          detail: detail('pawn_structure.passed_pawn'),
          state: state('pawn_structure.passed_pawn'),
        },
        { detail: detail('tactics.fork'), state: state('tactics.fork') },
      ],
      sources: [source('tactics.fork', 'POSITIVE')],
      recentlyAttemptedSourceEvidenceIds: ['tactics.fork-POSITIVE'],
    });
    expect(
      decisions.find((entry) => entry.conceptStableId === 'pawn_structure.passed_pawn'),
    ).toMatchObject({
      disposition: 'UNSUPPORTED_CONCEPT_V1',
    });
    expect(decisions.find((entry) => entry.conceptStableId === 'tactics.fork')).toMatchObject({
      disposition: 'RECENTLY_ATTEMPTED',
      reasonCode: 'SOURCE_IN_COOLDOWN',
    });
  });
});

function gameEvidence(): SkillGraphEvidenceInput {
  return {
    id: '60000000-0000-4000-8000-000000000001',
    classificationRunId,
    gameId,
    conceptStableId: 'tactics.fork',
    evidenceTypeStableId: 'decision.classification',
    evidenceRole: 'DIRECT',
    polarity: 'POSITIVE',
    subjectKind: 'DECISION',
    subjectPlayerId: playerId,
    subjectColor: 'WHITE',
    analysisRunId,
    positionOccurrenceId: '50000000-0000-4000-8000-000000000001',
    occurrencePly: 0,
    evidenceDate: '2026-08-27',
    createdAt: '2026-08-27T08:00:00.000Z',
  };
}

function graphInput(): SkillGraphAggregationInput {
  return {
    playerId,
    conceptStableIds: ['tactics.fork', 'tactics.pin'],
    games: [
      { gameId, focalColor: 'WHITE', contentStatus: 'MOVES_AVAILABLE', playedAt: '2026-08-27' },
    ],
    decisions: [
      {
        gameId,
        positionOccurrenceId: '50000000-0000-4000-8000-000000000001',
        occurrencePly: 0,
        classified: true,
        engineBacked: true,
      },
    ],
    selectedRuns: [
      {
        gameId,
        classificationRunId,
        selectedAnalysisRunId: analysisRunId,
        completedAt: '2026-08-27T08:00:00.000Z',
      },
    ],
    evidence: [gameEvidence()],
    asOfDate: '2026-08-27',
  };
}

function trainingEvidence(
  id: number,
  overrides: Partial<TrainingEvidenceForMastery> = {},
): TrainingEvidenceForMastery {
  return {
    id: `70000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    trainingAttemptId: `71000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    trainingItemId: '72000000-0000-4000-8000-000000000001',
    playerId,
    ontologyVersion: '1.0.0',
    conceptStableId: 'tactics.fork',
    evidenceRole: 'DIRECT',
    polarity: 'NEGATIVE',
    trainingMode: 'REMEDIATION',
    attemptNumber: id,
    submittedAt: `2026-08-27T0${id}:00:00.000Z`,
    ...overrides,
  };
}

describe('Task 010 Skill Graph V2 policy', () => {
  it('selects only the first scored attempt per item while retaining deterministic identity', () => {
    const first = trainingEvidence(1);
    const retry = trainingEvidence(2, { polarity: 'POSITIVE' });
    expect(selectFirstTrainingEvidencePerItem([retry, first])).toEqual([first]);
    const original = skillGraphV2EvidenceSnapshotSha256({
      playerId,
      ontologyVersion: '1.0.0',
      asOfDate: '2026-08-27',
      selectedClassificationRunIds: [classificationRunId],
      selectedGameEvidenceIds: [gameEvidence().id],
      selectedTrainingEvidenceIds: [first.id],
    });
    const reordered = skillGraphV2EvidenceSnapshotSha256({
      playerId,
      ontologyVersion: '1.0.0',
      asOfDate: '2026-08-27',
      selectedClassificationRunIds: [classificationRunId, classificationRunId],
      selectedGameEvidenceIds: [gameEvidence().id],
      selectedTrainingEvidenceIds: [first.id],
    });
    expect(reordered).toBe(original);
    expect(
      skillGraphV2EvidenceSnapshotSha256({
        playerId,
        ontologyVersion: '1.0.0',
        asOfDate: '2026-08-27',
        selectedClassificationRunIds: [classificationRunId],
        selectedGameEvidenceIds: [gameEvidence().id],
        selectedTrainingEvidenceIds: [retry.id],
      }),
    ).not.toBe(original);
  });

  it('keeps Game and TrainingItem units and masses separate in the combined posterior', () => {
    const result = aggregateTrainingAugmentedSkillGraph({
      ontologyVersion: '1.0.0',
      gameEvidence: graphInput(),
      trainingEvidence: [trainingEvidence(1, { trainingMode: 'DIAGNOSTIC', polarity: 'POSITIVE' })],
    });
    const fork = result.conceptStates.find((entry) => entry.conceptStableId === 'tactics.fork')!;
    expect(fork).toMatchObject({
      gamePositiveMass: 1,
      gameNegativeMass: 0,
      trainingPositiveMass: 1,
      trainingNegativeMass: 0,
      totalPositiveMass: 2,
      totalNegativeMass: 0,
      canonicalGameCount: 1,
      trainingItemCount: 1,
      independentEvidenceUnitCount: 2,
      posteriorAlpha: 4,
      posteriorBeta: 2,
      posteriorMean: 4 / 6,
      status: 'ESTIMATED',
      evidenceConfidence: 'LOW',
    });
    expect(result.trainingContributions[0]).toMatchObject({
      roleWeight: 1,
      sourceWeight: 1,
      recencyWeight: 1,
      effectivePositiveWeight: 1,
    });
    expect(SKILL_GRAPH_POLICY_V2_VERSION).toBe('SKILL_GRAPH_POLICY_V2');
  });

  it('applies the conservative personal remediation replay weight and cross-player isolation', () => {
    const result = aggregateTrainingAugmentedSkillGraph({
      ontologyVersion: '1.0.0',
      gameEvidence: graphInput(),
      trainingEvidence: [
        trainingEvidence(1),
        trainingEvidence(2, {
          trainingItemId: '72000000-0000-4000-8000-000000000002',
          playerId: opponentId,
        }),
      ],
    });
    expect(result.trainingContributions).toHaveLength(1);
    expect(result.trainingContributions[0]).toMatchObject({
      sourceWeight: 0.5,
      effectiveNegativeWeight: 0.5,
    });
    expect(classifySkillEvidenceConfidenceV2(100, 1)).toBe('INSUFFICIENT');
  });
});
