import type {
  AcademyActorRecord,
  AcademyRepository,
  GroundedAiRepository,
  PilotActorInput,
  PilotRepository,
  PlayerSkillGraphRepository,
} from '@chess-intelligent/db';
import {
  derivePilotStudentReadiness,
  validateAiClaimFeedback,
  type AiClaimFeedbackValue,
  type AiNotUsefulReason,
  type CoachReviewFeedbackValue,
  type PilotEventType,
} from '@chess-intelligent/domain';

import type { AuthenticatedPrincipal } from './auth-application';

const COACH_CLIENT_EVENTS = new Set<PilotEventType>([
  'COACH_OPENED_STUDENT_INTELLIGENCE',
  'COACH_OPENED_CONCEPT_EVIDENCE',
  'COACH_OPENED_AI_CLAIM_EVIDENCE',
  'COACH_OPENED_PROGRESS_REVIEW',
  'COACH_RETURNED_TO_STUDENT',
]);

export type PilotApplicationErrorCode =
  | 'PILOT_EVENT_NOT_CLIENT_OBSERVABLE'
  | 'PILOT_EVENT_SCOPE_INVALID'
  | 'PILOT_FEEDBACK_SCOPE_INVALID';

export class PilotApplicationError extends Error {
  constructor(
    readonly code: PilotApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PilotApplicationError';
  }
}

export function pilotActor(
  principal: AuthenticatedPrincipal,
  actor: AcademyActorRecord,
): PilotActorInput {
  return {
    userId: principal.userId,
    membershipId: actor.membershipId,
    role: actor.role,
    sessionId: principal.sessionId,
  };
}

export class PilotApplicationService {
  constructor(
    private readonly pilot: PilotRepository,
    private readonly academies: AcademyRepository,
    private readonly skillGraphs: PlayerSkillGraphRepository,
    private readonly artifacts: GroundedAiRepository,
  ) {}

  async studentReadiness(input: {
    academyId: string;
    studentProfileId: string;
    compatibleSkillGraphRunId: string | null;
  }) {
    const signals = await this.pilot.getStudentReadinessSignals(
      input.academyId,
      input.studentProfileId,
    );
    if (!signals) {
      throw new PilotApplicationError(
        'PILOT_EVENT_SCOPE_INVALID',
        'The StudentProfile does not belong to the requested Academy.',
      );
    }
    const graph = input.compatibleSkillGraphRunId
      ? await this.skillGraphs.getRun(input.compatibleSkillGraphRunId)
      : null;
    const compatibleGraph = graph?.playerId === signals.playerId ? graph : null;
    return derivePilotStudentReadiness({
      canonicalGameCount: signals.canonicalGameCount,
      analyzedGameCount: signals.analyzedGameCount,
      hasCompatibleSkillGraph: compatibleGraph !== null,
      masteryEligibleEvidenceCount: compatibleGraph?.coverage.masteryEligibleEvidence ?? 0,
    });
  }

  async recordClientEvent(input: {
    academyId: string;
    actor: PilotActorInput;
    eventType: PilotEventType;
    studentProfileId: string;
    skillGraphRunId?: string | null | undefined;
    conceptStableId?: string | null | undefined;
    groundedAiArtifactId?: string | null | undefined;
    groundedAiClaimId?: string | null | undefined;
    evidenceReference?: string | null | undefined;
    assignmentId?: string | null | undefined;
    deduplicationKey: string;
    requestId?: string | null | undefined;
  }) {
    const coachEvent = COACH_CLIENT_EVENTS.has(input.eventType);
    const studentEvent = input.eventType === 'STUDENT_OPENED_ASSIGNMENT';
    if ((!coachEvent && !studentEvent) || (coachEvent && input.actor.role === 'STUDENT')) {
      throw new PilotApplicationError(
        'PILOT_EVENT_NOT_CLIENT_OBSERVABLE',
        'Only approved navigation/open events may be submitted by a browser.',
      );
    }
    if (studentEvent && input.actor.role !== 'STUDENT') {
      throw new PilotApplicationError(
        'PILOT_EVENT_NOT_CLIENT_OBSERVABLE',
        'Student assignment-open events require the authenticated Student.',
      );
    }
    if (
      (input.eventType === 'COACH_OPENED_CONCEPT_EVIDENCE' &&
        (!input.skillGraphRunId || !input.conceptStableId)) ||
      (input.eventType === 'COACH_OPENED_AI_CLAIM_EVIDENCE' &&
        (!input.groundedAiArtifactId || !input.groundedAiClaimId || !input.evidenceReference)) ||
      (input.eventType === 'COACH_OPENED_PROGRESS_REVIEW' && !input.skillGraphRunId) ||
      (input.eventType === 'STUDENT_OPENED_ASSIGNMENT' && !input.assignmentId)
    ) {
      this.invalidScope();
    }
    const student = await this.academies.getStudentProfile(input.academyId, input.studentProfileId);
    if (!student) this.invalidScope();
    if (input.skillGraphRunId) {
      const graph = await this.skillGraphs.getRun(input.skillGraphRunId);
      if (!graph || graph.playerId !== student.playerId) this.invalidScope();
      if (input.conceptStableId) {
        const states = await this.skillGraphs.getConceptStates(graph.id);
        if (!states.some((state) => state.conceptStableId === input.conceptStableId)) {
          this.invalidScope();
        }
      }
    }
    if (input.groundedAiArtifactId) {
      const artifact = await this.artifacts.getForAcademy(
        input.academyId,
        student.id,
        input.groundedAiArtifactId,
      );
      const claim = input.groundedAiClaimId
        ? artifact?.validatedOutput.claims.find(
            (candidate) => candidate.id === input.groundedAiClaimId,
          )
        : null;
      if (
        !artifact ||
        artifact.audience !== 'COACH' ||
        (input.groundedAiClaimId && !claim) ||
        (input.evidenceReference && !claim?.evidenceRefs.includes(input.evidenceReference))
      ) {
        this.invalidScope();
      }
    }
    if (input.assignmentId) {
      const assignment = await this.academies.getTrainingAssignment(
        input.academyId,
        input.assignmentId,
      );
      if (!assignment || assignment.studentProfileId !== student.id) this.invalidScope();
    }
    return this.pilot.appendEvent({
      ...input,
      eventSource: 'CLIENT',
      playerId: student.playerId,
    });
  }

  async recordCoachFeedback(input: {
    academyId: string;
    actor: PilotActorInput;
    studentProfileId: string;
    skillGraphRunId: string;
    conceptStableId: string;
    feedbackValue: CoachReviewFeedbackValue;
    interactionId: string;
    requestId?: string | null | undefined;
  }) {
    if (input.actor.role === 'STUDENT') {
      throw new PilotApplicationError(
        'PILOT_FEEDBACK_SCOPE_INVALID',
        'Coach review feedback requires an operational Academy role.',
      );
    }
    const student = await this.academies.getStudentProfile(input.academyId, input.studentProfileId);
    if (!student) this.invalidFeedback();
    return this.pilot.appendCoachReviewFeedback({
      ...input,
      playerId: student.playerId,
      deduplicationKey: input.interactionId,
    });
  }

  async recordAiFeedback(input: {
    academyId: string;
    actor: PilotActorInput;
    studentProfileId: string;
    artifactId: string;
    claimId: string;
    feedbackValue: AiClaimFeedbackValue;
    notUsefulReason: AiNotUsefulReason | null;
    interactionId: string;
    requestId?: string | null | undefined;
  }) {
    validateAiClaimFeedback(input.feedbackValue, input.notUsefulReason);
    const student = await this.academies.getStudentProfile(input.academyId, input.studentProfileId);
    if (!student) this.invalidFeedback();
    const artifact = await this.artifacts.getForAcademy(
      input.academyId,
      student.id,
      input.artifactId,
    );
    const expectedAudience = input.actor.role === 'STUDENT' ? 'STUDENT' : 'COACH';
    if (
      !artifact ||
      artifact.audience !== expectedAudience ||
      !artifact.validatedOutput.claims.some((claim) => claim.id === input.claimId)
    ) {
      this.invalidFeedback();
    }
    return this.pilot.appendAiClaimFeedback({
      ...input,
      playerId: student.playerId,
      deduplicationKey: input.interactionId,
    });
  }

  private invalidScope(): never {
    throw new PilotApplicationError(
      'PILOT_EVENT_SCOPE_INVALID',
      'The Pilot event resource is outside the authenticated Academy Student scope.',
    );
  }

  private invalidFeedback(): never {
    throw new PilotApplicationError(
      'PILOT_FEEDBACK_SCOPE_INVALID',
      'The Pilot feedback resource is outside the authenticated Academy Student scope.',
    );
  }
}
