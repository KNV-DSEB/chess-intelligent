import { describe, expect, it } from 'vitest';

import {
  checkSkillGraphComparability,
  classifyAssignmentMeasurement,
  compareStudentProgress,
  deriveCoachAttentionSignals,
  deriveTrainingAssignmentProgress,
  projectSkillGraphFreshness,
  type ComparableSkillGraphRun,
} from './coach-student-intelligence';

const hash = (character: string) => character.repeat(64);

function graph(overrides: Partial<ComparableSkillGraphRun> = {}): ComparableSkillGraphRun {
  return {
    id: 'from',
    playerId: 'player-a',
    ontologyVersion: '1.0.0',
    classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V1',
    classifierConfigSha256: hash('a'),
    classificationSelectionPolicyVersion: 'CLASSIFICATION_SELECTION_V1',
    skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
    policyConfigSha256: hash('b'),
    evidenceScopeSha256: hash('c'),
    evidenceSnapshotSha256: hash('d'),
    asOfDate: '2026-08-01',
    coverage: {
      canonicalGames: 2,
      decisionOccurrences: 20,
      classifiedDecisions: 10,
      engineBackedDecisions: 8,
      masteryEligibleEvidence: 4,
      trainingIndependentUnits: 0,
    },
    concepts: [
      {
        conceptStableId: 'tactics.fork',
        status: 'NO_EVIDENCE',
        posteriorMean: null,
        effectiveEvidenceMass: 0,
        positiveEvidenceMass: 0,
        negativeEvidenceMass: 0,
        independentEvidenceUnitCount: 0,
        evidenceConfidence: 'INSUFFICIENT',
        masteryBand: null,
      },
    ],
    ...overrides,
  };
}

describe('Task 011 coach/student domain policies', () => {
  it('accepts different evidence snapshots under identical measurement semantics', () => {
    const from = graph();
    const to = graph({ id: 'to', asOfDate: '2026-08-10', evidenceSnapshotSha256: hash('e') });
    expect(checkSkillGraphComparability(from, to)).toEqual([]);
  });

  it('rejects each incompatible progress dimension and never emits deltas', () => {
    const from = graph();
    const to = graph({
      id: 'to',
      playerId: 'player-b',
      ontologyVersion: '2.0.0',
      skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V1',
      policyConfigSha256: hash('1'),
      evidenceScopeSha256: hash('2'),
      classifierConfigSha256: hash('3'),
      asOfDate: '2026-07-01',
    });
    const result = compareStudentProgress(from, to);
    expect(result.comparisonStatus).toBe('NOT_COMPARABLE');
    expect(result.comparabilityReasons).toEqual([
      'DIFFERENT_PLAYER',
      'DIFFERENT_ONTOLOGY',
      'DIFFERENT_SKILL_GRAPH_POLICY',
      'DIFFERENT_POLICY_CONFIG',
      'DIFFERENT_EVIDENCE_SCOPE',
      'INCOMPATIBLE_CLASSIFIER_SEMANTICS',
      'REVERSED_AS_OF_DATE',
    ]);
    expect(result.coverageDelta).toBeNull();
    expect(result.conceptTransitions).toEqual([]);
  });

  it('reports evidence and state transitions without an improvement label', () => {
    const from = graph();
    const to = graph({
      id: 'to',
      asOfDate: '2026-08-10',
      evidenceSnapshotSha256: hash('e'),
      coverage: {
        canonicalGames: 2,
        decisionOccurrences: 20,
        classifiedDecisions: 10,
        engineBackedDecisions: 8,
        masteryEligibleEvidence: 4,
        trainingIndependentUnits: 1,
      },
      concepts: [
        {
          conceptStableId: 'tactics.fork',
          status: 'INSUFFICIENT_EVIDENCE',
          posteriorMean: 0.6,
          effectiveEvidenceMass: 1,
          positiveEvidenceMass: 1,
          negativeEvidenceMass: 0,
          independentEvidenceUnitCount: 1,
          evidenceConfidence: 'INSUFFICIENT',
          masteryBand: null,
        },
      ],
    });
    const result = compareStudentProgress(from, to);
    expect(result.comparisonStatus).toBe('COMPARABLE');
    expect(result.coverageDelta?.trainingIndependentUnitDelta).toBe(1);
    expect(result.conceptTransitions[0]).toMatchObject({
      transition: 'NO_EVIDENCE_TO_INSUFFICIENT_EVIDENCE',
      fromPosteriorMean: null,
      toPosteriorMean: 0.6,
      posteriorDelta: null,
      effectiveEvidenceMassDelta: 1,
    });
    expect(result).not.toHaveProperty('improved');
  });

  it('keeps diagnostic replay out of assignment and remediation replay practice-only', () => {
    expect(classifyAssignmentMeasurement('DIAGNOSTIC', true)).toEqual({
      measurementStatus: null,
      rejection: 'DIAGNOSTIC_ITEM_ALREADY_MEASURED',
    });
    expect(classifyAssignmentMeasurement('REMEDIATION', true)).toEqual({
      measurementStatus: 'PRACTICE_ONLY_ALREADY_MEASURED',
      rejection: null,
    });
    expect(classifyAssignmentMeasurement('DIAGNOSTIC', false)).toEqual({
      measurementStatus: 'MEASUREMENT_ELIGIBLE',
      rejection: null,
    });
  });

  it('ignores pre-assignment attempts and completes on correct or incorrect post attempts', () => {
    const progress = deriveTrainingAssignmentProgress({
      playerId: 'player-a',
      assignedAt: '2026-08-10T10:00:00.000Z',
      dueAt: '2026-08-12',
      cancelledAt: null,
      asOfDate: '2026-08-13',
      items: [
        {
          assignmentItemId: 'assignment-item-1',
          trainingItemId: 'item-1',
          measurementStatus: 'MEASUREMENT_ELIGIBLE',
          attempts: [
            {
              id: 'before',
              trainingItemId: 'item-1',
              playerId: 'player-a',
              submittedAt: '2026-08-09T10:00:00.000Z',
              result: 'CORRECT',
              attemptNumber: 1,
            },
            {
              id: 'after',
              trainingItemId: 'item-1',
              playerId: 'player-a',
              submittedAt: '2026-08-11T10:00:00.000Z',
              result: 'INCORRECT',
              attemptNumber: 2,
            },
            {
              id: 'retry',
              trainingItemId: 'item-1',
              playerId: 'player-a',
              submittedAt: '2026-08-11T11:00:00.000Z',
              result: 'CORRECT',
              attemptNumber: 3,
            },
          ],
        },
      ],
    });
    expect(progress).toMatchObject({
      status: 'COMPLETED',
      overdue: false,
      completedItemCount: 1,
      firstScoredCorrectItems: 0,
      firstScoredIncorrectItems: 1,
    });
    expect(progress.items[0]).toMatchObject({
      firstPostAssignmentAttempt: { id: 'after' },
      retryCountAfterCompletion: 1,
    });
  });

  it('cancellation overrides workflow state without deleting item history', () => {
    const progress = deriveTrainingAssignmentProgress({
      playerId: 'player-a',
      assignedAt: '2026-08-10T10:00:00.000Z',
      dueAt: null,
      cancelledAt: '2026-08-11T00:00:00.000Z',
      asOfDate: '2026-08-12',
      items: [
        {
          assignmentItemId: 'assignment-item-1',
          trainingItemId: 'item-1',
          measurementStatus: 'MEASUREMENT_ELIGIBLE',
          attempts: [],
        },
      ],
    });
    expect(progress.status).toBe('CANCELLED');
    expect(progress.items).toHaveLength(1);
  });

  it('projects freshness only from eligible evidence outside the compatible graph', () => {
    expect(
      projectSkillGraphFreshness({ hasCompatibleGraph: false, newTrainingEvidenceCount: 3 }),
    ).toBe('NO_COMPATIBLE_GRAPH');
    expect(
      projectSkillGraphFreshness({ hasCompatibleGraph: true, newTrainingEvidenceCount: 0 }),
    ).toBe('CURRENT');
    expect(
      projectSkillGraphFreshness({ hasCompatibleGraph: true, newTrainingEvidenceCount: 1 }),
    ).toBe('REFRESH_AVAILABLE');
  });

  it('emits only deterministic operational attention signals', () => {
    expect(
      deriveCoachAttentionSignals({
        freshness: 'REFRESH_AVAILABLE',
        activeAssignments: [{ overdue: true }],
        latestActiveAssignmentAt: '2026-08-01T00:00:00.000Z',
        lastTrainingAt: null,
        completedAssignmentReviewAvailable: true,
        asOfDate: '2026-08-10',
      }),
    ).toEqual([
      'SKILL_GRAPH_REFRESH_AVAILABLE',
      'ACTIVE_ASSIGNMENT_OVERDUE',
      'ACTIVE_ASSIGNMENT_NO_RECENT_ACTIVITY',
      'ASSIGNMENT_COMPLETED_REVIEW_AVAILABLE',
    ]);
  });
});
