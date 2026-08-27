import { describe, expect, it } from 'vitest';

import {
  SKILL_GRAPH_POLICY_V1,
  aggregatePlayerSkillGraph,
  applyEvidenceRoleWeight,
  calculateBetaPosterior,
  calculateRecencyWeight,
  classifyMasteryBand,
  classifySkillEvidenceConfidence,
  skillGraphInputSnapshotSha256,
  skillGraphPolicyConfigSha256,
  type SkillGraphAggregationInput,
  type SkillGraphEvidenceInput,
} from './player-skill-graph';

const playerId = '10000000-0000-4000-8000-000000000001';
const opponentId = '10000000-0000-4000-8000-000000000002';
const runId = '20000000-0000-4000-8000-000000000001';
const analysisRunId = '30000000-0000-4000-8000-000000000001';

function evidence(
  id: number,
  overrides: Partial<SkillGraphEvidenceInput> = {},
): SkillGraphEvidenceInput {
  return {
    id: `40000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    classificationRunId: runId,
    gameId: '50000000-0000-4000-8000-000000000001',
    conceptStableId: 'tactics.fork',
    evidenceTypeStableId: 'decision.classification',
    evidenceRole: 'DIRECT',
    polarity: 'POSITIVE',
    subjectKind: 'DECISION',
    subjectPlayerId: playerId,
    subjectColor: 'WHITE',
    analysisRunId,
    positionOccurrenceId: `60000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    occurrencePly: id,
    evidenceDate: '2026-08-27',
    createdAt: '2026-08-27T10:00:00.000Z',
    ...overrides,
  };
}

function input(evidenceRows: SkillGraphEvidenceInput[]): SkillGraphAggregationInput {
  return {
    playerId,
    conceptStableIds: ['domain.tactics', 'tactics.fork', 'tactics.pin'],
    games: [
      {
        gameId: '50000000-0000-4000-8000-000000000001',
        focalColor: 'WHITE',
        contentStatus: 'MOVES_AVAILABLE',
        playedAt: '2026-08-27',
      },
    ],
    decisions: [
      {
        gameId: '50000000-0000-4000-8000-000000000001',
        positionOccurrenceId: '60000000-0000-4000-8000-000000000001',
        occurrencePly: 1,
        classified: true,
        engineBacked: true,
      },
      {
        gameId: '50000000-0000-4000-8000-000000000001',
        positionOccurrenceId: '60000000-0000-4000-8000-000000000099',
        occurrencePly: 3,
        classified: false,
        engineBacked: false,
      },
    ],
    selectedRuns: [
      {
        gameId: '50000000-0000-4000-8000-000000000001',
        classificationRunId: runId,
        selectedAnalysisRunId: analysisRunId,
        completedAt: '2026-08-27T10:00:00.000Z',
      },
    ],
    evidence: evidenceRows,
    asOfDate: '2026-08-27',
  };
}

describe('Task 009 Player Skill Graph policy', () => {
  it('centralizes role weights and date-only half-life decay', () => {
    expect(applyEvidenceRoleWeight('DIRECT')).toBe(1);
    expect(applyEvidenceRoleWeight('SUPPORTING')).toBe(0.5);
    expect(applyEvidenceRoleWeight('CONTEXTUAL')).toBe(0);
    expect(calculateRecencyWeight('2026-08-27', '2026-08-27')).toBe(1);
    expect(calculateRecencyWeight('2025-08-27', '2026-08-27')).toBeCloseTo(0.5, 12);
    expect(calculateRecencyWeight('2024-08-27', '2026-08-27')).toBeCloseTo(0.25, 2);
  });

  it('caps correlated same-game evidence while preserving polarity and exact lineage', () => {
    const result = aggregatePlayerSkillGraph(
      input([evidence(1), evidence(2), evidence(3), evidence(4, { polarity: 'NEGATIVE' })]),
    );
    expect(result.gameContributions).toHaveLength(1);
    expect(result.gameContributions[0]).toMatchObject({
      rawPositiveWeight: 3,
      rawNegativeWeight: 1,
      cappedPositiveWeight: 0.75,
      cappedNegativeWeight: 0.25,
      effectivePositiveWeight: 0.75,
      effectiveNegativeWeight: 0.25,
    });
    expect(
      result.gameContributions[0]?.evidence.map((entry) => entry.conceptEvidenceInstanceId),
    ).toEqual([evidence(1).id, evidence(2).id, evidence(3).id, evidence(4).id]);
    expect(result.coverage).toMatchObject({
      decisionOccurrences: 2,
      classifiedDecisions: 1,
      engineBackedDecisions: 1,
      masteryEligibleEvidence: 4,
      positiveMasteryEvidence: 3,
      negativeMasteryEvidence: 1,
    });
  });

  it('keeps supporting fractional and excludes contextual, neutral, POSITION, and opponent evidence', () => {
    const result = aggregatePlayerSkillGraph(
      input([
        evidence(1, { evidenceRole: 'SUPPORTING' }),
        evidence(2, { evidenceRole: 'CONTEXTUAL' }),
        evidence(3, { polarity: 'NEUTRAL', analysisRunId: null }),
        evidence(4, {
          subjectKind: 'POSITION',
          subjectPlayerId: null,
          polarity: 'NEUTRAL',
          analysisRunId: null,
        }),
        evidence(5, { subjectPlayerId: opponentId, subjectColor: 'BLACK' }),
      ]),
    );
    const fork = result.conceptStates.find((state) => state.conceptStableId === 'tactics.fork')!;
    expect(result.gameContributions[0]).toMatchObject({
      rawPositiveWeight: 0.5,
      cappedPositiveWeight: 0.5,
      effectivePositiveWeight: 0.5,
    });
    expect(fork).toMatchObject({
      status: 'INSUFFICIENT_EVIDENCE',
      positiveEvidenceMass: 0.5,
      negativeEvidenceMass: 0,
      rawPositiveCount: 1,
      neutralExposureCount: 2,
      contextualEvidenceCount: 1,
      canonicalGameCount: 1,
    });
    expect(result.coverage.masteryEligibleEvidence).toBe(1);
    expect(result.coverage.neutralExposureEvidence).toBe(2);
  });

  it('treats missing classifications and engine evidence as coverage gaps, never negative mass', () => {
    const result = aggregatePlayerSkillGraph(input([]));
    const fork = result.conceptStates.find((state) => state.conceptStableId === 'tactics.fork')!;
    expect(result.coverage).toMatchObject({
      decisionOccurrences: 2,
      classifiedDecisions: 1,
      engineBackedDecisions: 1,
      masteryEligibleEvidence: 0,
      negativeMasteryEvidence: 0,
    });
    expect(fork).toMatchObject({
      status: 'NO_EVIDENCE',
      posteriorMean: null,
      positiveEvidenceMass: 0,
      negativeEvidenceMass: 0,
      masteryBand: null,
    });
  });

  it('uses transparent posterior, confidence, and mastery-band boundaries', () => {
    expect(calculateBetaPosterior(1, 0)).toEqual({ alpha: 3, beta: 2, mean: 0.6 });
    expect(classifySkillEvidenceConfidence(1.49, 10)).toBe('INSUFFICIENT');
    expect(classifySkillEvidenceConfidence(100, 1)).toBe('INSUFFICIENT');
    expect(classifySkillEvidenceConfidence(1.5, 2)).toBe('LOW');
    expect(classifySkillEvidenceConfidence(4, 2)).toBe('MODERATE');
    expect(classifySkillEvidenceConfidence(8, 2)).toBe('HIGH');
    expect(classifyMasteryBand(0.399999)).toBe('EMERGING');
    expect(classifyMasteryBand(0.4)).toBe('DEVELOPING');
    expect(classifyMasteryBand(0.65)).toBe('ESTABLISHED');
    expect(classifyMasteryBand(0.85)).toBe('STRONG_EVIDENCE_OF_MASTERY');
  });

  it('is deterministic and changes only recency-weighted mass when as-of advances', () => {
    const original = input([evidence(1, { evidenceDate: '2025-08-27' })]);
    const repeated = aggregatePlayerSkillGraph(original);
    expect(aggregatePlayerSkillGraph(original)).toEqual(repeated);
    expect(skillGraphInputSnapshotSha256(original)).toBe(skillGraphInputSnapshotSha256(original));

    const later = { ...original, asOfDate: '2027-08-27' };
    const earlierState = repeated.conceptStates.find(
      (state) => state.conceptStableId === 'tactics.fork',
    )!;
    const laterState = aggregatePlayerSkillGraph(later).conceptStates.find(
      (state) => state.conceptStableId === 'tactics.fork',
    )!;
    expect(earlierState.rawPositiveCount).toBe(laterState.rawPositiveCount);
    expect(laterState.positiveEvidenceMass).toBeLessThan(earlierState.positiveEvidenceMass);
    expect(skillGraphInputSnapshotSha256(later)).not.toBe(skillGraphInputSnapshotSha256(original));
    expect(SKILL_GRAPH_POLICY_V1.recencyHalfLifeDays).toBe(365);
  });

  it('keeps canonical Games independent and versions classification selection identity', () => {
    const secondGameId = '50000000-0000-4000-8000-000000000002';
    const secondRunId = '20000000-0000-4000-8000-000000000002';
    const first = input([evidence(1), evidence(2)]);
    const expanded: SkillGraphAggregationInput = {
      ...first,
      games: [
        ...first.games,
        {
          gameId: secondGameId,
          focalColor: 'WHITE',
          contentStatus: 'MOVES_AVAILABLE',
          playedAt: '2026-08-27',
        },
      ],
      selectedRuns: [
        ...first.selectedRuns,
        {
          gameId: secondGameId,
          classificationRunId: secondRunId,
          selectedAnalysisRunId: analysisRunId,
          completedAt: '2026-08-27T11:00:00.000Z',
        },
      ],
      evidence: [
        ...first.evidence,
        evidence(3, { gameId: secondGameId, classificationRunId: secondRunId }),
      ],
    };
    const result = aggregatePlayerSkillGraph(expanded);
    const fork = result.conceptStates.find((state) => state.conceptStableId === 'tactics.fork')!;
    expect(result.gameContributions).toHaveLength(2);
    expect(fork).toMatchObject({
      canonicalGameCount: 2,
      positiveEvidenceMass: 2,
      effectiveEvidenceMass: 2,
      status: 'ESTIMATED',
      evidenceConfidence: 'LOW',
    });

    const identity = {
      ontologyVersion: '1.0.0',
      classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V1',
      classifierConfigSha256: 'a'.repeat(64),
    };
    expect(skillGraphPolicyConfigSha256(identity)).not.toBe(
      skillGraphPolicyConfigSha256({
        ...identity,
        classificationSelectionPolicyVersion: 'CLASSIFICATION_SELECTION_V2',
      }),
    );
  });
});
