import { createHash } from 'node:crypto';

import type {
  ChessConceptOntologySource,
  EvidencePolarity,
  EvidenceRole,
  OntologyConceptSummary,
  OntologyRegistry,
} from './ontology';
import type { Color } from './index';

export const CLASSIFICATION_RUN_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type ClassificationRunStatus = (typeof CLASSIFICATION_RUN_STATUSES)[number];

export const EVIDENCE_SUBJECT_KINDS = ['POSITION', 'DECISION'] as const;
export type EvidenceSubjectKind = (typeof EVIDENCE_SUBJECT_KINDS)[number];

export const CONCEPT_CLASSIFIER_BUNDLE_VERSION = 'CONCEPT_CLASSIFIER_BUNDLE_V1';
export const POSITION_STRUCTURE_CLASSIFIER_ID = 'POSITION_STRUCTURE_CLASSIFIER';
export const POSITION_STRUCTURE_CLASSIFIER_VERSION = 'V1';
export const TACTICAL_MOTIF_CLASSIFIER_ID = 'TACTICAL_MOTIF_CLASSIFIER';
export const TACTICAL_MOTIF_CLASSIFIER_VERSION = 'V1';
export const TACTICAL_DECISION_CLASSIFIER_ID = 'TACTICAL_DECISION_CLASSIFIER';
export const TACTICAL_DECISION_CLASSIFIER_VERSION = 'V1';

export const CONCEPT_CLASSIFIER_V1_CONFIGURATION = {
  engineSelection: { profile: 'QUICK_V1', profileVersion: 1 },
  decisionEvidence: {
    positiveDecisionMaximumLossCp: 20,
    negativeDecisionMinimumLossCp: 75,
    negativeMateOutcomes: ['MATE_MISSED', 'MATE_ALLOWED'],
  },
  geometry: {
    pieceValues: { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 },
    meaningfulTargetMinimumValue: 3,
    forkMinimumTargets: 2,
    forkMinimumSurplusValue: 3,
    skewerFrontTarget: 'king',
    pinBackTarget: 'king',
  },
  structures: {
    majorityWings: {
      queenside: ['a', 'b', 'c'],
      kingside: ['f', 'g', 'h'],
    },
  },
} as const;

export function conceptClassifierConfigurationSha256(): string {
  return createHash('sha256')
    .update(JSON.stringify(CONCEPT_CLASSIFIER_V1_CONFIGURATION), 'utf8')
    .digest('hex');
}

export type ClassificationFactValue = string | number | boolean | readonly string[];
export type ClassificationRuleFacts = Readonly<Record<string, ClassificationFactValue>>;

export interface DetectedConceptFact {
  conceptStableId: string;
  ruleId: string;
  subjectColor: Color;
  facts: ClassificationRuleFacts;
}

export interface ClassificationEngineContext {
  analysisRunId: string;
  historySha256: string;
  playedMoveUci: string;
  bestMoveUci: string;
  centipawnLoss: number | null;
  mateOutcome:
    'NOT_APPLICABLE' | 'MATE_MISSED' | 'MATE_ALLOWED' | 'MATE_PRESERVED' | 'MATE_CHANGED';
}

export interface ClassificationContext {
  occurrencePly: number;
  decisionPly: number;
  positionOccurrenceId: string;
  exactHistorySha256: string;
  sideToMove: Color;
  preMoveFen: string;
  playedMoveUci: string;
  playedMoveSan: string;
  subjectPlayerId: string;
  engine: ClassificationEngineContext | null;
}

export interface ConceptEvidenceCandidate {
  occurrencePly: number;
  decisionPly: number;
  positionOccurrenceId: string;
  exactHistorySha256: string;
  conceptStableId: string;
  evidenceTypeStableId: string;
  polarity: EvidencePolarity;
  subjectKind: EvidenceSubjectKind;
  subjectPlayerId: string | null;
  subjectColor: Color;
  classifierId: string;
  classifierVersion: string;
  ruleId: string;
  facts: ClassificationRuleFacts;
  analysisRunId: string | null;
}

export interface ResolvedConceptEvidence extends ConceptEvidenceCandidate {
  evidenceRole: EvidenceRole;
}

export interface ConceptEvidenceClassifier {
  readonly classifierId: string;
  readonly classifierVersion: string;
  classify(context: ClassificationContext): ConceptEvidenceCandidate[];
}

export class ConceptEvidencePolicyError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_CONCEPT'
      | 'INACTIVE_CONCEPT'
      | 'UNKNOWN_EVIDENCE_TYPE'
      | 'EVIDENCE_NOT_ALLOWED'
      | 'POLARITY_NOT_ALLOWED',
    message: string,
  ) {
    super(message);
    this.name = 'ConceptEvidencePolicyError';
  }
}

function stableJson(value: ClassificationRuleFacts): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, Array.isArray(entry) ? [...entry].sort() : entry]),
    ),
  );
}

function evidenceKey(candidate: ConceptEvidenceCandidate): string {
  return [
    candidate.occurrencePly,
    candidate.subjectKind,
    candidate.subjectPlayerId ?? '-',
    candidate.subjectColor,
    candidate.conceptStableId,
    candidate.evidenceTypeStableId,
    candidate.polarity,
    candidate.ruleId,
    stableJson(candidate.facts),
  ].join('|');
}

export function resolveAndNormalizeConceptEvidence(
  registry: OntologyRegistry,
  candidates: readonly ConceptEvidenceCandidate[],
): ResolvedConceptEvidence[] {
  const resolved = new Map<string, ResolvedConceptEvidence>();
  for (const candidate of candidates) {
    const concept = registry.graph.getConcept(candidate.conceptStableId);
    if (!concept) {
      throw new ConceptEvidencePolicyError(
        'UNKNOWN_CONCEPT',
        `Concept ${candidate.conceptStableId} does not exist in ontology ${registry.source.version}.`,
      );
    }
    if (concept.status !== 'ACTIVE') {
      throw new ConceptEvidencePolicyError(
        'INACTIVE_CONCEPT',
        `Concept ${candidate.conceptStableId} is not active in ontology ${registry.source.version}.`,
      );
    }
    const evidenceType = registry.source.evidenceTypes.find(
      (entry) => entry.stableId === candidate.evidenceTypeStableId,
    );
    if (!evidenceType) {
      throw new ConceptEvidencePolicyError(
        'UNKNOWN_EVIDENCE_TYPE',
        `Evidence type ${candidate.evidenceTypeStableId} does not exist in ontology ${registry.source.version}.`,
      );
    }
    if (!evidenceType.allowedPolarities.includes(candidate.polarity)) {
      throw new ConceptEvidencePolicyError(
        'POLARITY_NOT_ALLOWED',
        `${candidate.polarity} is not allowed for evidence type ${candidate.evidenceTypeStableId}.`,
      );
    }
    const policy = registry.source.evidencePolicies.find(
      (entry) =>
        entry.conceptStableId === candidate.conceptStableId &&
        entry.evidenceTypeStableId === candidate.evidenceTypeStableId,
    );
    if (!policy) {
      throw new ConceptEvidencePolicyError(
        'EVIDENCE_NOT_ALLOWED',
        `${candidate.evidenceTypeStableId} is not allowed for ${candidate.conceptStableId} in ontology ${registry.source.version}.`,
      );
    }
    const normalized = { ...candidate, evidenceRole: policy.role };
    resolved.set(evidenceKey(candidate), normalized);
  }
  return [...resolved.values()].sort(
    (left, right) =>
      left.occurrencePly - right.occurrencePly ||
      left.subjectKind.localeCompare(right.subjectKind) ||
      left.subjectColor.localeCompare(right.subjectColor) ||
      left.conceptStableId.localeCompare(right.conceptStableId) ||
      left.evidenceTypeStableId.localeCompare(right.evidenceTypeStableId) ||
      left.polarity.localeCompare(right.polarity) ||
      left.ruleId.localeCompare(right.ruleId) ||
      stableJson(left.facts).localeCompare(stableJson(right.facts)),
  );
}

export function tacticalDecisionEvidenceCandidates(
  context: ClassificationContext,
  playedMotifs: readonly DetectedConceptFact[],
  bestMoveMotifs: readonly DetectedConceptFact[],
): ConceptEvidenceCandidate[] {
  if (!context.engine) return [];
  const result: ConceptEvidenceCandidate[] = [];
  const playedByConcept = new Map(playedMotifs.map((motif) => [motif.conceptStableId, motif]));
  const bestByConcept = new Map(bestMoveMotifs.map((motif) => [motif.conceptStableId, motif]));
  const engine = context.engine;
  const soundPlayedMove =
    engine.playedMoveUci === engine.bestMoveUci ||
    (engine.centipawnLoss !== null &&
      engine.centipawnLoss <=
        CONCEPT_CLASSIFIER_V1_CONFIGURATION.decisionEvidence.positiveDecisionMaximumLossCp);
  if (soundPlayedMove) {
    for (const motif of playedByConcept.values()) {
      result.push({
        ...baseDecisionCandidate(context, motif),
        evidenceTypeStableId: 'decision.classification',
        polarity: 'POSITIVE',
        classifierId: TACTICAL_DECISION_CLASSIFIER_ID,
        classifierVersion: TACTICAL_DECISION_CLASSIFIER_VERSION,
        ruleId: 'TACTICAL_DECISION_SOUND_APPLICATION_V1',
        facts: {
          motifRuleId: motif.ruleId,
          playedMoveUci: engine.playedMoveUci,
          bestMoveUci: engine.bestMoveUci,
          engineCondition:
            engine.playedMoveUci === engine.bestMoveUci ? 'BEST_MOVE_MATCH' : 'LOW_LOSS',
          ...(engine.centipawnLoss === null ? {} : { centipawnLoss: engine.centipawnLoss }),
        },
      });
    }
  }

  const consequentialMiss =
    (engine.centipawnLoss !== null &&
      engine.centipawnLoss >=
        CONCEPT_CLASSIFIER_V1_CONFIGURATION.decisionEvidence.negativeDecisionMinimumLossCp) ||
    CONCEPT_CLASSIFIER_V1_CONFIGURATION.decisionEvidence.negativeMateOutcomes.includes(
      engine.mateOutcome as 'MATE_MISSED' | 'MATE_ALLOWED',
    );
  if (consequentialMiss) {
    for (const motif of bestByConcept.values()) {
      if (playedByConcept.has(motif.conceptStableId)) continue;
      result.push({
        ...baseDecisionCandidate(context, motif),
        evidenceTypeStableId: 'decision.classification',
        polarity: 'NEGATIVE',
        classifierId: TACTICAL_DECISION_CLASSIFIER_ID,
        classifierVersion: TACTICAL_DECISION_CLASSIFIER_VERSION,
        ruleId: 'MISSED_TACTICAL_MOTIF_V1',
        facts: {
          motifRuleId: motif.ruleId,
          bestMoveUci: engine.bestMoveUci,
          playedMoveUci: engine.playedMoveUci,
          mateOutcome: engine.mateOutcome,
          ...(engine.centipawnLoss === null ? {} : { centipawnLoss: engine.centipawnLoss }),
        },
      });
    }
  }
  return result;
}

function baseDecisionCandidate(
  context: ClassificationContext,
  motif: DetectedConceptFact,
): Pick<
  ConceptEvidenceCandidate,
  | 'occurrencePly'
  | 'decisionPly'
  | 'positionOccurrenceId'
  | 'exactHistorySha256'
  | 'conceptStableId'
  | 'subjectKind'
  | 'subjectPlayerId'
  | 'subjectColor'
  | 'analysisRunId'
> {
  return {
    occurrencePly: context.occurrencePly,
    decisionPly: context.decisionPly,
    positionOccurrenceId: context.positionOccurrenceId,
    exactHistorySha256: context.exactHistorySha256,
    conceptStableId: motif.conceptStableId,
    subjectKind: 'DECISION',
    subjectPlayerId: context.subjectPlayerId,
    subjectColor: context.sideToMove,
    analysisRunId: context.engine?.analysisRunId ?? null,
  };
}

export interface ClassificationRunSummary {
  id: string;
  gameId: string;
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  selectedAnalysisRunId: string | null;
  status: ClassificationRunStatus;
  evidenceCount: number;
  engineEvidenceAvailable: boolean;
  startedAt: string;
  completedAt: string | null;
}

export interface ConceptEvidenceView extends ResolvedConceptEvidence {
  id: string;
  gameId: string;
  ontologyVersion: string;
  concept: OntologyConceptSummary;
  conceptDescription: string;
  evidenceTypeDisplayName: string;
  playedMoveSan: string;
  playedMoveUci: string;
  createdAt: string;
}

export interface ClassificationRunView extends ClassificationRunSummary {
  classifiers: Array<{ classifierId: string; classifierVersion: string }>;
  evidence: ConceptEvidenceView[];
}

export interface ConceptEvidenceProjection {
  run: ClassificationRunSummary;
  evidence: ConceptEvidenceView[];
  limitations: {
    decisionQualityEvidenceLimited: boolean;
    message: string;
  };
}

export interface ClassificationSourceSnapshot {
  ontology: ChessConceptOntologySource;
}
