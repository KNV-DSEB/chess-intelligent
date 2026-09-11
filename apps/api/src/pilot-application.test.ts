import { describe, expect, it, vi } from 'vitest';

import type {
  AcademyRepository,
  GroundedAiRepository,
  PilotRepository,
  PlayerSkillGraphRepository,
} from '@chess-intelligent/db';

import { PilotApplicationService } from './pilot-application';

function harness() {
  const pilot = {
    appendEvent: vi.fn(async () => ({ id: 'event-1', deduplicated: false })),
    appendCoachReviewFeedback: vi.fn(async () => ({ id: 'feedback-1', deduplicated: false })),
    appendAiClaimFeedback: vi.fn(async () => ({ id: 'feedback-2', deduplicated: false })),
    getStudentReadinessSignals: vi.fn(async () => ({
      playerId: 'player-1',
      canonicalGameCount: 4,
      analyzedGameCount: 3,
    })),
  } as unknown as PilotRepository;
  const academies = {
    getStudentProfile: vi.fn(async () => ({
      id: 'student-1',
      academyId: 'academy-1',
      playerId: 'player-1',
    })),
    getTrainingAssignment: vi.fn(async () => ({
      id: 'assignment-1',
      studentProfileId: 'student-1',
    })),
  } as unknown as AcademyRepository;
  const skillGraphs = {
    getRun: vi.fn(async () => ({
      id: 'graph-1',
      playerId: 'player-1',
      coverage: { masteryEligibleEvidence: 4 },
    })),
    getConceptStates: vi.fn(async () => [{ conceptStableId: 'tactics.fork' }]),
  } as unknown as PlayerSkillGraphRepository;
  const artifacts = {
    getForAcademy: vi.fn(async () => ({
      id: 'artifact-1',
      audience: 'COACH',
      validatedOutput: { claims: [{ id: 'claim-1' }] },
    })),
  } as unknown as GroundedAiRepository;
  return {
    pilot,
    academies,
    skillGraphs,
    artifacts,
    service: new PilotApplicationService(pilot, academies, skillGraphs, artifacts),
  };
}

const coach = {
  userId: 'user-1',
  membershipId: 'member-1',
  role: 'COACH' as const,
  sessionId: 'session-1',
};

describe('PilotApplicationService', () => {
  it('derives readiness without treating missing coverage as negative mastery', async () => {
    const { service, pilot } = harness();
    vi.mocked(pilot.getStudentReadinessSignals).mockResolvedValueOnce({
      playerId: 'player-1',
      canonicalGameCount: 0,
      analyzedGameCount: 0,
    });
    await expect(
      service.studentReadiness({
        academyId: 'academy-1',
        studentProfileId: 'student-1',
        compatibleSkillGraphRunId: null,
      }),
    ).resolves.toMatchObject({ state: 'NOT_READY_NO_GAMES', operationalOnly: true });
  });

  it('rejects browser attempts to report authoritative domain actions', async () => {
    const { service, pilot } = harness();
    await expect(
      service.recordClientEvent({
        academyId: 'academy-1',
        actor: coach,
        eventType: 'COACH_CREATED_ASSIGNMENT',
        studentProfileId: 'student-1',
        deduplicationKey: 'interaction-1',
      }),
    ).rejects.toMatchObject({ code: 'PILOT_EVENT_NOT_CLIENT_OBSERVABLE' });
    expect(pilot.appendEvent).not.toHaveBeenCalled();
  });

  it('fails closed for a foreign Student resource before appending telemetry', async () => {
    const { service, pilot, academies } = harness();
    vi.mocked(academies.getStudentProfile).mockResolvedValueOnce(null);
    await expect(
      service.recordClientEvent({
        academyId: 'academy-foreign',
        actor: coach,
        eventType: 'COACH_OPENED_STUDENT_INTELLIGENCE',
        studentProfileId: 'student-1',
        deduplicationKey: 'interaction-2',
      }),
    ).rejects.toMatchObject({ code: 'PILOT_EVENT_SCOPE_INVALID' });
    expect(pilot.appendEvent).not.toHaveBeenCalled();
  });

  it('requires exact resource lineage for browser evidence and assignment opens', async () => {
    const { service, pilot } = harness();
    await expect(
      service.recordClientEvent({
        academyId: 'academy-1',
        actor: coach,
        eventType: 'COACH_OPENED_CONCEPT_EVIDENCE',
        studentProfileId: 'student-1',
        deduplicationKey: 'interaction-missing-concept',
      }),
    ).rejects.toMatchObject({ code: 'PILOT_EVENT_SCOPE_INVALID' });
    expect(pilot.appendEvent).not.toHaveBeenCalled();
  });

  it('pins Coach feedback to the resolved Student Player lineage', async () => {
    const { service, pilot } = harness();
    await service.recordCoachFeedback({
      academyId: 'academy-1',
      actor: coach,
      studentProfileId: 'student-1',
      skillGraphRunId: 'graph-1',
      conceptStableId: 'tactics.fork',
      feedbackValue: 'AGREE',
      interactionId: 'interaction-3',
    });
    expect(pilot.appendCoachReviewFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'player-1', deduplicationKey: 'interaction-3' }),
    );
  });

  it('rejects incomplete not-useful feedback before persistence', async () => {
    const { service, pilot } = harness();
    await expect(
      service.recordAiFeedback({
        academyId: 'academy-1',
        actor: coach,
        studentProfileId: 'student-1',
        artifactId: 'artifact-1',
        claimId: 'claim-1',
        feedbackValue: 'NOT_USEFUL',
        notUsefulReason: null,
        interactionId: 'interaction-4',
      }),
    ).rejects.toThrow(/requires one controlled reason/u);
    expect(pilot.appendAiClaimFeedback).not.toHaveBeenCalled();
  });

  it('fails closed when AI feedback targets an artifact for another audience', async () => {
    const { service, pilot, artifacts } = harness();
    vi.mocked(artifacts.getForAcademy).mockResolvedValueOnce({
      id: 'artifact-1',
      audience: 'STUDENT',
      validatedOutput: { claims: [{ id: 'claim-1' }] },
    } as never);
    await expect(
      service.recordAiFeedback({
        academyId: 'academy-1',
        actor: coach,
        studentProfileId: 'student-1',
        artifactId: 'artifact-1',
        claimId: 'claim-1',
        feedbackValue: 'USEFUL',
        notUsefulReason: null,
        interactionId: 'interaction-audience-mismatch',
      }),
    ).rejects.toMatchObject({ code: 'PILOT_FEEDBACK_SCOPE_INVALID' });
    expect(pilot.appendAiClaimFeedback).not.toHaveBeenCalled();
  });
});
