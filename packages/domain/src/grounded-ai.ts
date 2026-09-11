import { deterministicSha256, type SkillEvidenceConfidence } from './player-skill-graph';

export const GROUNDED_BRIEF_CONTEXT_VERSION = 'GROUNDED_BRIEF_CONTEXT_V1';
export const GROUNDED_BRIEF_PROMPT_VERSION = 'GROUNDED_BRIEF_PROMPT_V1';
export const GROUNDED_BRIEF_ARTIFACT_VERSION = 'GROUNDED_BRIEF_ARTIFACT_V1';
export const GROUNDED_BRIEF_AUDIENCES = ['COACH', 'STUDENT'] as const;
export type GroundedBriefAudience = (typeof GROUNDED_BRIEF_AUDIENCES)[number];
export const GROUNDED_BRIEF_CLAIM_TYPES = [
  'CURRENT_PRIORITY',
  'EVIDENCE_LIMITATION',
  'RECENT_CHANGE',
  'NEXT_ACTION',
] as const;
export type GroundedBriefClaimType = (typeof GROUNDED_BRIEF_CLAIM_TYPES)[number];
export const GROUNDED_BRIEF_CONFIDENCE = ['INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH'] as const;
export type GroundedBriefConfidence = (typeof GROUNDED_BRIEF_CONFIDENCE)[number];

export interface GroundedBriefConceptContext {
  stableId: string;
  displayName: string;
  supportState: 'SYSTEM_UNSUPPORTED' | 'NO_EVIDENCE' | 'INSUFFICIENT_EVIDENCE' | 'ESTIMATED';
  masteryBand: string | null;
  evidenceConfidence: SkillEvidenceConfidence;
  posteriorMean: number | null;
  directEvidenceCount: number;
  effectiveEvidenceMass: number;
  evidenceRefs: string[];
  trainingSupported: boolean;
}

export interface GroundedBriefContext {
  contextVersion: typeof GROUNDED_BRIEF_CONTEXT_VERSION;
  audience: GroundedBriefAudience;
  academyId: string;
  studentProfileId: string;
  player: { id: string };
  source: {
    skillGraphRunId: string;
    trainingPlanRunId: string | null;
    ontologyVersion: string;
    classifierBundleVersion: string;
    skillGraphPolicyVersion: string;
    asOfDate: string;
  };
  coverage: {
    reportVersion: string;
    classifierSupported: number;
    trainable: number;
    decisionOccurrences: number;
    classifiedDecisions: number;
    engineBackedDecisions: number;
    masteryEligibleEvidence: number;
  };
  concepts: GroundedBriefConceptContext[];
  permittedEvidenceRefs: Array<{
    ref: string;
    kind:
      | 'SKILL_GRAPH_RUN'
      | 'CONCEPT_EVIDENCE'
      | 'TRAINING_EVIDENCE'
      | 'TRAINING_PLAN'
      | 'COVERAGE_REPORT';
  }>;
}

export interface GroundedBriefClaim {
  id: string;
  type: GroundedBriefClaimType;
  conceptStableId: string | null;
  statement: string;
  confidence: GroundedBriefConfidence;
  evidenceRefs: string[];
}

export interface GroundedBriefOutput {
  headline: string;
  summary: string;
  claims: GroundedBriefClaim[];
  limitations: string[];
}

export class GroundedBriefValidationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_OUTPUT_SHAPE'
      | 'UNSUPPORTED_CLAIM_TYPE'
      | 'UNSUPPORTED_CONCEPT'
      | 'FOREIGN_EVIDENCE_REFERENCE'
      | 'UNGROUNDED_CLAIM'
      | 'INFLATED_CONFIDENCE'
      | 'PROHIBITED_INFERENCE',
    message: string,
  ) {
    super(message);
    this.name = 'GroundedBriefValidationError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CONFIDENCE_RANK: Readonly<Record<GroundedBriefConfidence, number>> = {
  INSUFFICIENT: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
};
const PROHIBITED_LANGUAGE =
  /(?:\b(?:weakness|weak player|strength|lazy|afraid|nervous|psycholog(?:y|ical)|guarantee(?:d)?|always|never understands?|best move|winning move|objectively best|must play)\b|điểm yếu|kỳ thủ yếu|người chơi yếu|lười|sợ hãi|lo lắng|tâm lý|đảm bảo|luôn luôn|không bao giờ hiểu|nước đi tốt nhất|nước thắng|khách quan tốt nhất|phải chơi)/iu;

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function validateGroundedBriefOutput(
  context: GroundedBriefContext,
  value: unknown,
): GroundedBriefOutput {
  if (
    !record(value) ||
    typeof value.headline !== 'string' ||
    typeof value.summary !== 'string' ||
    !Array.isArray(value.claims) ||
    !strings(value.limitations) ||
    value.headline.length < 1 ||
    value.headline.length > 160 ||
    value.summary.length < 1 ||
    value.summary.length > 800 ||
    value.claims.length > 12 ||
    value.limitations.length > 8
  ) {
    throw new GroundedBriefValidationError(
      'INVALID_OUTPUT_SHAPE',
      'The provider output does not match GROUNDED_BRIEF_ARTIFACT_V1.',
    );
  }
  const permittedRefs = new Set(context.permittedEvidenceRefs.map((entry) => entry.ref));
  const concepts = new Map(context.concepts.map((concept) => [concept.stableId, concept]));
  const headline = value.headline;
  const summary = value.summary;
  const limitations = value.limitations;
  const ids = new Set<string>();
  const claims = value.claims.map((claimValue, index): GroundedBriefClaim => {
    if (
      !record(claimValue) ||
      typeof claimValue.id !== 'string' ||
      typeof claimValue.type !== 'string' ||
      !GROUNDED_BRIEF_CLAIM_TYPES.includes(claimValue.type as GroundedBriefClaimType) ||
      (claimValue.conceptStableId !== null && typeof claimValue.conceptStableId !== 'string') ||
      typeof claimValue.statement !== 'string' ||
      typeof claimValue.confidence !== 'string' ||
      !GROUNDED_BRIEF_CONFIDENCE.includes(claimValue.confidence as GroundedBriefConfidence) ||
      !strings(claimValue.evidenceRefs) ||
      claimValue.statement.length < 1 ||
      claimValue.statement.length > 500
    ) {
      throw new GroundedBriefValidationError(
        'INVALID_OUTPUT_SHAPE',
        `Claim ${index + 1} is invalid.`,
      );
    }
    if (ids.has(claimValue.id)) {
      throw new GroundedBriefValidationError('INVALID_OUTPUT_SHAPE', 'Claim IDs must be unique.');
    }
    ids.add(claimValue.id);
    if (
      PROHIBITED_LANGUAGE.test(claimValue.statement) ||
      PROHIBITED_LANGUAGE.test(headline) ||
      PROHIBITED_LANGUAGE.test(summary)
    ) {
      throw new GroundedBriefValidationError(
        'PROHIBITED_INFERENCE',
        'The brief contains psychology, weakness, certainty, or move-authority language.',
      );
    }
    if (
      claimValue.evidenceRefs.length === 0 ||
      claimValue.evidenceRefs.some((ref) => !permittedRefs.has(ref))
    ) {
      throw new GroundedBriefValidationError(
        claimValue.evidenceRefs.length === 0 ? 'UNGROUNDED_CLAIM' : 'FOREIGN_EVIDENCE_REFERENCE',
        'Every claim must cite only evidence in the exact input snapshot.',
      );
    }
    const concept =
      claimValue.conceptStableId === null ? null : concepts.get(claimValue.conceptStableId);
    if (claimValue.conceptStableId !== null && !concept) {
      throw new GroundedBriefValidationError(
        'UNSUPPORTED_CONCEPT',
        `Concept ${claimValue.conceptStableId} is absent from the briefing snapshot.`,
      );
    }
    if (
      concept &&
      CONFIDENCE_RANK[claimValue.confidence as GroundedBriefConfidence] >
        CONFIDENCE_RANK[concept.evidenceConfidence]
    ) {
      throw new GroundedBriefValidationError(
        'INFLATED_CONFIDENCE',
        `Claim confidence exceeds the evidence confidence for ${concept.stableId}.`,
      );
    }
    return {
      id: claimValue.id,
      type: claimValue.type as GroundedBriefClaimType,
      conceptStableId: claimValue.conceptStableId as string | null,
      statement: claimValue.statement,
      confidence: claimValue.confidence as GroundedBriefConfidence,
      evidenceRefs: [...new Set(claimValue.evidenceRefs)].sort(),
    };
  });
  return {
    headline,
    summary,
    claims,
    limitations,
  };
}

export function groundedBriefContextSha256(context: GroundedBriefContext): string {
  return deterministicSha256(context);
}
