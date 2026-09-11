import { describe, expect, it } from 'vitest';

import {
  validateGroundedBriefOutput,
  type GroundedBriefContext,
  type GroundedBriefValidationError,
} from './grounded-ai';

const context: GroundedBriefContext = {
  contextVersion: 'GROUNDED_BRIEF_CONTEXT_V1',
  audience: 'COACH',
  academyId: 'academy-1',
  studentProfileId: 'student-1',
  player: { id: 'player-1' },
  source: {
    skillGraphRunId: 'graph-1',
    trainingPlanRunId: null,
    ontologyVersion: '1.0.0',
    classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V2',
    skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V1',
    asOfDate: '2026-09-06',
  },
  coverage: {
    reportVersion: 'CONCEPT_COVERAGE_REPORT_V1',
    classifierSupported: 13,
    trainable: 8,
    decisionOccurrences: 12,
    classifiedDecisions: 7,
    engineBackedDecisions: 6,
    masteryEligibleEvidence: 3,
  },
  concepts: [
    {
      stableId: 'tactics.fork',
      displayName: 'Fork',
      supportState: 'ESTIMATED',
      masteryBand: 'DEVELOPING',
      evidenceConfidence: 'MODERATE',
      posteriorMean: 0.43,
      directEvidenceCount: 3,
      effectiveEvidenceMass: 2.2,
      evidenceRefs: ['concept-evidence:e1'],
      trainingSupported: true,
    },
  ],
  permittedEvidenceRefs: [
    { ref: 'skill-graph:graph-1', kind: 'SKILL_GRAPH_RUN' },
    { ref: 'concept-evidence:e1', kind: 'CONCEPT_EVIDENCE' },
    { ref: 'coverage:CONCEPT_COVERAGE_REPORT_V1', kind: 'COVERAGE_REPORT' },
  ],
};

const valid = {
  headline: 'A focused next step',
  summary: 'The current evidence supports one bounded training focus.',
  claims: [
    {
      id: 'claim-1',
      type: 'CURRENT_PRIORITY',
      conceptStableId: 'tactics.fork',
      statement: 'Use the verified fork positions as the current practice focus.',
      confidence: 'MODERATE',
      evidenceRefs: ['concept-evidence:e1'],
    },
  ],
  limitations: ['Only three mastery-eligible observations are available.'],
};

describe('GROUNDED_BRIEF_ARTIFACT_V1 validation', () => {
  it('accepts bounded claims grounded in the exact snapshot', () => {
    expect(validateGroundedBriefOutput(context, valid)).toMatchObject(valid);
  });

  it.each([
    [
      'foreign evidence',
      { ...valid, claims: [{ ...valid.claims[0], evidenceRefs: ['concept-evidence:foreign'] }] },
      'FOREIGN_EVIDENCE_REFERENCE',
    ],
    [
      'inflated confidence',
      { ...valid, claims: [{ ...valid.claims[0], confidence: 'HIGH' }] },
      'INFLATED_CONFIDENCE',
    ],
    [
      'psychology',
      { ...valid, claims: [{ ...valid.claims[0], statement: 'The player is nervous.' }] },
      'PROHIBITED_INFERENCE',
    ],
    [
      'move authority',
      { ...valid, claims: [{ ...valid.claims[0], statement: 'This is the best move.' }] },
      'PROHIBITED_INFERENCE',
    ],
  ] as const)('rejects %s', (_label, output, code) => {
    expect(() => validateGroundedBriefOutput(context, output)).toThrowError(
      expect.objectContaining<Partial<GroundedBriefValidationError>>({ code }),
    );
  });
});
