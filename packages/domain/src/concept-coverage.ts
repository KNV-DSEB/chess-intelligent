import type { ChessConceptOntologySource, OntologyConceptDefinition } from './ontology';

export const CONCEPT_COVERAGE_REPORT_VERSION = 'CONCEPT_COVERAGE_REPORT_V1';
export const CONCEPT_COVERAGE_STATUSES = [
  'TRAINABLE_V1',
  'CLASSIFIABLE_DECISION_V1',
  'OBSERVABLE_CONTEXT_ONLY',
  'ONTOLOGY_ONLY',
  'DEFERRED',
] as const;
export type ConceptCoverageStatus = (typeof CONCEPT_COVERAGE_STATUSES)[number];

const TRAINABLE = new Set([
  'tactics.fork',
  'tactics.pin',
  'tactics.skewer',
  'tactics.discovered_attack',
  'tactics.interference',
  'tactics.overload',
  'tactics.removal_of_defender',
  'tactics.back_rank',
]);
const CONTEXT_ONLY = new Set([
  'pawn_structure.isolated_queen_pawn',
  'pawn_structure.hanging_pawns',
  'pawn_structure.doubled_pawns',
  'pawn_structure.passed_pawn',
  'pawn_structure.pawn_majority',
]);
const DEFERRED = new Map<string, string>([
  [
    'tactics.deflection',
    'Requires a verified multi-ply forcing sequence, not a single-move label.',
  ],
  ['tactics.decoy', 'Requires a verified response or forced destination.'],
  [
    'tactics.clearance',
    'Current geometry cannot separate purposeful clearance from incidental vacating.',
  ],
  ['tactics.zwischenzug', 'Requires sequence-level forcing-move semantics.'],
  ['tactics.mating_net', 'Requires stable multi-position mate-net semantics beyond one checkmate.'],
  ['pawn_structure.backward_pawn', 'Needs a conservative mobility and attack model.'],
  ['pawn_structure.minority_attack', 'Needs a sequence classifier and plan evidence.'],
  [
    'strategy.open_file',
    'Raw open-file truth exists, but strategic decision attribution is not proven.',
  ],
  ['strategy.outpost', 'Needs a durable-square definition and piece-use attribution.'],
  ['strategy.weak_squares', 'Needs a versioned positional evaluation policy.'],
  ['endgame.king_activity', 'Needs endgame-phase and activity-change evidence.'],
  ['endgame.opposition', 'Needs exact king-and-pawn endgame legality semantics.'],
  ['opening.development', 'Needs phase-aware tempo and piece-development attribution.'],
  [
    'opening.king_safety',
    'Needs castling and center-state context without generic engine inference.',
  ],
  [
    'calculation.forcing_moves',
    'Cannot be inferred from played moves without candidate-search evidence.',
  ],
]);

export interface ConceptCoverageEntry {
  stableId: string;
  displayName: string;
  domainStableId: string;
  status: ConceptCoverageStatus;
  classifierBundleVersion: string | null;
  classifierIds: string[];
  evidenceTypeStableIds: string[];
  polarities: Array<'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'>;
  engineRequiredForMastery: boolean;
  masteryEligible: boolean;
  trainingSupported: boolean;
  trainingGeneratorVersion: string | null;
  falsePositiveRisk: string;
  limitation: string;
}

export interface ConceptCoverageReport {
  version: typeof CONCEPT_COVERAGE_REPORT_VERSION;
  ontologyVersion: string;
  ontologyContentSha256: string;
  counts: {
    total: number;
    classifierSupported: number;
    trainable: number;
    contextOnly: number;
    ontologyOnly: number;
    deferred: number;
  };
  entries: ConceptCoverageEntry[];
}

function domainStableId(concept: OntologyConceptDefinition): string {
  return concept.kind === 'DOMAIN' ? concept.stableId : `domain.${concept.stableId.split('.')[0]}`;
}

export function conceptCoverageStatus(stableId: string): ConceptCoverageStatus {
  if (TRAINABLE.has(stableId)) return 'TRAINABLE_V1';
  if (CONTEXT_ONLY.has(stableId)) return 'OBSERVABLE_CONTEXT_ONLY';
  if (DEFERRED.has(stableId)) return 'DEFERRED';
  return 'ONTOLOGY_ONLY';
}

export function buildConceptCoverageReport(input: {
  ontology: ChessConceptOntologySource;
  ontologyContentSha256: string;
}): ConceptCoverageReport {
  const entries = input.ontology.concepts
    .map((concept): ConceptCoverageEntry => {
      const status = conceptCoverageStatus(concept.stableId);
      const tactical = status === 'TRAINABLE_V1' || status === 'CLASSIFIABLE_DECISION_V1';
      const contextual = status === 'OBSERVABLE_CONTEXT_ONLY';
      return {
        stableId: concept.stableId,
        displayName: concept.displayName,
        domainStableId: domainStableId(concept),
        status,
        classifierBundleVersion: tactical || contextual ? 'CONCEPT_CLASSIFIER_BUNDLE_V2' : null,
        classifierIds: tactical
          ? ['TACTICAL_MOTIF_CLASSIFIER', 'TACTICAL_DECISION_CLASSIFIER']
          : contextual
            ? ['POSITION_STRUCTURE_CLASSIFIER']
            : [],
        evidenceTypeStableIds: tactical
          ? ['position.tactical_motif', 'decision.classification']
          : contextual
            ? ['position.structural_feature']
            : [],
        polarities: tactical ? ['POSITIVE', 'NEGATIVE', 'NEUTRAL'] : contextual ? ['NEUTRAL'] : [],
        engineRequiredForMastery: tactical,
        masteryEligible: tactical,
        trainingSupported: status === 'TRAINABLE_V1',
        trainingGeneratorVersion:
          status === 'TRAINABLE_V1' ? 'TACTICAL_TRAINING_ITEM_GENERATOR_V2' : null,
        falsePositiveRisk:
          status === 'TRAINABLE_V1'
            ? 'Conservative geometry can miss valid motifs; exact-history engine evidence gates mastery.'
            : contextual
              ? 'Repeated positions can create many observations; context never contributes mastery mass.'
              : 'No automated claim is emitted.',
        limitation:
          DEFERRED.get(concept.stableId) ??
          (status === 'ONTOLOGY_ONLY'
            ? 'Defined for product vocabulary but unsupported by deterministic V1 learning evidence.'
            : contextual
              ? 'Position exposure only; never evidence that the Player understood the concept.'
              : 'Only exact local evidence-backed FIND_BEST_MOVE items are supported.'),
      };
    })
    .sort((left, right) => left.stableId.localeCompare(right.stableId));
  return {
    version: CONCEPT_COVERAGE_REPORT_VERSION,
    ontologyVersion: input.ontology.version,
    ontologyContentSha256: input.ontologyContentSha256,
    counts: {
      total: entries.length,
      classifierSupported: entries.filter((entry) => entry.classifierBundleVersion !== null).length,
      trainable: entries.filter((entry) => entry.trainingSupported).length,
      contextOnly: entries.filter((entry) => entry.status === 'OBSERVABLE_CONTEXT_ONLY').length,
      ontologyOnly: entries.filter((entry) => entry.status === 'ONTOLOGY_ONLY').length,
      deferred: entries.filter((entry) => entry.status === 'DEFERRED').length,
    },
    entries,
  };
}
