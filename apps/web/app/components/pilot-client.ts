export type PilotClientEventType =
  | 'COACH_OPENED_STUDENT_INTELLIGENCE'
  | 'COACH_OPENED_CONCEPT_EVIDENCE'
  | 'COACH_OPENED_AI_CLAIM_EVIDENCE'
  | 'COACH_RETURNED_TO_STUDENT'
  | 'STUDENT_OPENED_ASSIGNMENT';

export async function recordPilotClientEvent(
  apiUrl: string,
  academyId: string,
  input: {
    eventType: PilotClientEventType;
    studentProfileId: string;
    skillGraphRunId?: string | undefined;
    conceptStableId?: string | undefined;
    groundedAiArtifactId?: string | undefined;
    groundedAiClaimId?: string | undefined;
    evidenceReference?: string | undefined;
    assignmentId?: string | undefined;
    interactionId?: string | undefined;
  },
): Promise<void> {
  try {
    await fetch(`${apiUrl}/academies/${academyId}/pilot/events`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, interactionId: input.interactionId ?? crypto.randomUUID() }),
    });
  } catch {
    // Pilot observation is deliberately non-blocking; domain workflows remain available.
  }
}
