import { describe, expect, it, vi } from 'vitest';

import type {
  AcademyRepository,
  GroundedAiRepository,
  TrainingRepository,
} from '@chess-intelligent/db';

import type { ConceptCoverageApplicationService } from './concept-coverage-application';
import {
  GroundedAiApplicationService,
  type GroundedLanguageModel,
} from './grounded-ai-application';
import type {
  PlayerSkillGraphApplicationService,
  PlayerSkillGraphView,
} from './player-skill-graph-application';

function harness(output: unknown, providerFailure = false) {
  const create = vi.fn(async (input: Record<string, unknown>) => ({
    id: 'artifact-1',
    ...input,
    createdAt: '2026-09-06T00:00:00.000Z',
  })) as unknown as GroundedAiRepository['create'];
  const artifacts = {
    create,
    getForAcademy: vi.fn(),
  } as unknown as GroundedAiRepository;
  const academies = {
    getStudentProfile: vi.fn(async () => ({
      id: 'student-1',
      academyId: 'academy-1',
      playerId: 'player-1',
    })),
  } as unknown as AcademyRepository;
  const graph = {
    run: {
      id: 'graph-1',
      playerId: 'player-1',
      ontologyVersion: '1.0.0',
      classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V2',
      skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V1',
      asOfDate: '2026-09-06',
    },
    coverage: {
      decisionOccurrences: 12,
      classifiedDecisions: 7,
      engineBackedDecisions: 6,
      masteryEligibleEvidence: 3,
    },
    concepts: [
      {
        conceptStableId: 'tactics.fork',
        displayName: 'Fork',
        status: 'ESTIMATED',
        masteryBand: 'DEVELOPING',
        evidenceConfidence: 'MODERATE',
        posteriorMean: 0.43,
      },
    ],
  } as unknown as PlayerSkillGraphView;
  const skillGraphs = {
    getRun: vi.fn(async () => graph),
    getConcept: vi.fn(async () => ({
      state: {
        ...graph.concepts[0],
        displayPosteriorMean: 0.43,
        rawPositiveCount: 2,
        rawNegativeCount: 1,
        effectiveEvidenceMass: 2.2,
      },
      contributions: [{ evidence: [{ conceptEvidenceInstanceId: 'e1' }] }],
      trainingContributions: [],
    })),
  } as unknown as PlayerSkillGraphApplicationService;
  const coverage = {
    getReport: vi.fn(async () => ({
      version: 'CONCEPT_COVERAGE_REPORT_V1',
      counts: { classifierSupported: 13, trainable: 8 },
      entries: [
        {
          stableId: 'tactics.fork',
          classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V2',
          trainingSupported: true,
        },
      ],
    })),
  } as unknown as ConceptCoverageApplicationService;
  const training = { getPlan: vi.fn() } as unknown as TrainingRepository;
  const generate = vi.fn<GroundedLanguageModel['generate']>(async () => {
    if (providerFailure) throw new Error('provider offline');
    return { provider: 'FAKE', model: 'fixture-v1', output, usage: { outputTokens: 42 } };
  });
  const provider: GroundedLanguageModel = {
    generate,
  };
  const service = new GroundedAiApplicationService(
    artifacts,
    academies,
    skillGraphs,
    training,
    coverage,
    provider,
    () => new Date('2026-09-06T00:00:00.010Z'),
  );
  return { service, create, artifacts, academies, skillGraphs, training, coverage, generate };
}

const validOutput = {
  headline: 'One bounded practice focus',
  summary: 'The current evidence supports a focused review.',
  claims: [
    {
      id: 'claim-1',
      type: 'CURRENT_PRIORITY',
      conceptStableId: 'tactics.fork',
      statement: 'Review the verified fork decisions in the current evidence set.',
      confidence: 'MODERATE',
      evidenceRefs: ['concept-evidence:e1'],
    },
  ],
  limitations: ['The sample remains small.'],
};

describe('GroundedAiApplicationService', () => {
  it('persists only the server-validated exact snapshot and output', async () => {
    const { service, create } = harness(validOutput);
    const result = await service.generate({
      academyId: 'academy-1',
      studentProfileId: 'student-1',
      skillGraphRunId: 'graph-1',
      audience: 'COACH',
    });
    expect(result.id).toBe('artifact-1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        academyId: 'academy-1',
        studentProfileId: 'student-1',
        sourceSkillGraphRunId: 'graph-1',
        artifactVersion: 'GROUNDED_BRIEF_ARTIFACT_V1',
      }),
    );
  });

  it('does not persist invalid provider claims', async () => {
    const { service, create } = harness({
      ...validOutput,
      claims: [{ ...validOutput.claims[0], evidenceRefs: ['concept-evidence:foreign'] }],
    });
    await expect(
      service.generate({
        academyId: 'academy-1',
        studentProfileId: 'student-1',
        skillGraphRunId: 'graph-1',
        audience: 'COACH',
      }),
    ).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
    expect(create).not.toHaveBeenCalled();
  });

  it('does not persist provider failures', async () => {
    const { service, create } = harness(validOutput, true);
    await expect(
      service.generate({
        academyId: 'academy-1',
        studentProfileId: 'student-1',
        skillGraphRunId: 'graph-1',
        audience: 'STUDENT',
      }),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_FAILED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns AI_UNAVAILABLE without weakening the core platform', async () => {
    const { artifacts, academies, skillGraphs, training, coverage } = harness(validOutput);
    const unavailable = new GroundedAiApplicationService(
      artifacts,
      academies,
      skillGraphs,
      training,
      coverage,
      null,
    );
    await expect(
      unavailable.generate({
        academyId: 'academy-1',
        studentProfileId: 'student-1',
        skillGraphRunId: 'graph-1',
        audience: 'COACH',
      }),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('pins the audience in the same structured truth snapshot', async () => {
    const { service, generate } = harness(validOutput);
    await service.generate({
      academyId: 'academy-1',
      studentProfileId: 'student-1',
      skillGraphRunId: 'graph-1',
      audience: 'COACH',
    });
    await service.generate({
      academyId: 'academy-1',
      studentProfileId: 'student-1',
      skillGraphRunId: 'graph-1',
      audience: 'STUDENT',
    });
    expect(generate.mock.calls[0]?.[0].context.audience).toBe('COACH');
    expect(generate.mock.calls[1]?.[0].context.audience).toBe('STUDENT');
    expect(generate.mock.calls[0]?.[0].context.concepts).toEqual(
      generate.mock.calls[1]?.[0].context.concepts,
    );
  });

  it('fails closed before provider or persistence for a foreign Academy scope', async () => {
    const { service, academies, create, generate } = harness(validOutput);
    vi.mocked(academies.getStudentProfile).mockResolvedValueOnce(null);
    await expect(
      service.generate({
        academyId: 'academy-foreign',
        studentProfileId: 'student-1',
        skillGraphRunId: 'graph-1',
        audience: 'COACH',
      }),
    ).rejects.toMatchObject({ code: 'STUDENT_PROFILE_NOT_FOUND' });
    expect(generate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
