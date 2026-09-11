import { describe, expect, it } from 'vitest';

import {
  PILOT_AI_SMOKE_SCENARIOS,
  buildPilotAiSmokeContext,
  pilotAiSmokeSystemPrompt,
} from './pilot-grounded-ai-smoke-corpus';

describe('Pilot grounded AI smoke corpus', () => {
  it('covers every required evidence, audience, action, progress, and language boundary', () => {
    expect(new Set(PILOT_AI_SMOKE_SCENARIOS.map((entry) => entry.audience))).toEqual(
      new Set(['COACH', 'STUDENT']),
    );
    expect(new Set(PILOT_AI_SMOKE_SCENARIOS.map((entry) => entry.responseLanguage))).toEqual(
      new Set(['EN', 'VI']),
    );
    expect(new Set(PILOT_AI_SMOKE_SCENARIOS.map((entry) => entry.supportState))).toEqual(
      new Set(['ESTIMATED', 'INSUFFICIENT_EVIDENCE', 'NO_EVIDENCE']),
    );
    expect(PILOT_AI_SMOKE_SCENARIOS.some((entry) => entry.conceptCount === 2)).toBe(true);
    expect(PILOT_AI_SMOKE_SCENARIOS.some((entry) => entry.withTrainingPlan)).toBe(true);
    expect(PILOT_AI_SMOKE_SCENARIOS.some((entry) => !entry.trainingSupported)).toBe(true);
    expect(new Set(PILOT_AI_SMOKE_SCENARIOS.map((entry) => entry.progressEvidence))).toEqual(
      new Set(['RECENT_COMPATIBLE', 'NO_COMPARABLE_PROGRESS', 'NONE']),
    );
  });

  it('builds a 24-case deterministic non-PII matrix with valid reference boundaries', () => {
    const cases = Array.from({ length: 24 }, (_, index) => {
      const scenario = PILOT_AI_SMOKE_SCENARIOS[index % PILOT_AI_SMOKE_SCENARIOS.length]!;
      return { scenario, context: buildPilotAiSmokeContext(index, scenario) };
    });
    expect(cases).toHaveLength(24);
    expect(cases.filter(({ scenario }) => scenario.responseLanguage === 'VI')).toHaveLength(14);
    for (const { scenario, context } of cases) {
      const permitted = new Set(context.permittedEvidenceRefs.map((entry) => entry.ref));
      expect(
        context.concepts
          .flatMap((concept) => concept.evidenceRefs)
          .every((ref) => permitted.has(ref)),
      ).toBe(true);
      expect(pilotAiSmokeSystemPrompt(scenario)).toContain('Return the required JSON only.');
    }
  });
});
