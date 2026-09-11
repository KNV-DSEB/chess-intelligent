import { describe, expect, it } from 'vitest';

import { derivePilotStudentReadiness, pilotMetric, validateAiClaimFeedback } from './pilot';

describe('Pilot 001 domain policy', () => {
  it('keeps missing upstream evidence operationally not ready rather than negative mastery', () => {
    expect(
      derivePilotStudentReadiness({
        canonicalGameCount: 0,
        analyzedGameCount: 0,
        hasCompatibleSkillGraph: false,
        masteryEligibleEvidenceCount: 0,
      }).state,
    ).toBe('NOT_READY_NO_GAMES');
    expect(
      derivePilotStudentReadiness({
        canonicalGameCount: 3,
        analyzedGameCount: 0,
        hasCompatibleSkillGraph: false,
        masteryEligibleEvidenceCount: 0,
      }).state,
    ).toBe('NOT_READY_NO_ANALYSIS');
    expect(
      derivePilotStudentReadiness({
        canonicalGameCount: 3,
        analyzedGameCount: 2,
        hasCompatibleSkillGraph: false,
        masteryEligibleEvidenceCount: 0,
      }).state,
    ).toBe('NOT_READY_NO_SKILL_GRAPH');
  });

  it('distinguishes low coverage and exposes metric denominators', () => {
    expect(
      derivePilotStudentReadiness({
        canonicalGameCount: 3,
        analyzedGameCount: 2,
        hasCompatibleSkillGraph: true,
        masteryEligibleEvidenceCount: 1,
      }).state,
    ).toBe('READY_WITH_LOW_COVERAGE');
    expect(pilotMetric(2, 8, 'completed assignments / assigned cohort')).toEqual({
      numerator: 2,
      denominator: 8,
      rate: 0.25,
      definition: 'completed assignments / assigned cohort',
    });
  });

  it('requires a controlled reason only for not-useful AI feedback', () => {
    expect(() => validateAiClaimFeedback('NOT_USEFUL', null)).toThrow();
    expect(() => validateAiClaimFeedback('USEFUL', 'TOO_VAGUE')).toThrow();
    expect(() => validateAiClaimFeedback('NOT_USEFUL', 'TOO_VAGUE')).not.toThrow();
  });
});
