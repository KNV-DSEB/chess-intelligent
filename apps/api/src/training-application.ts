import type {
  PlayerSkillGraphRepository,
  PlayerSkillGraphRunRecord,
  TrainingAttemptRecord,
  TrainingCandidateRecord,
  TrainingEvidenceRecord,
  TrainingItemRecord,
  TrainingPlanRunRecord,
  TrainingRepository,
  TrainingSourceMaterial,
} from '@chess-intelligent/db';
import {
  TRAINING_COOLDOWN_VERSION,
  TRAINING_ITEM_SOURCE_POLICY_VERSION,
  TRAINING_REVEAL_POLICY_V1,
  TRAINING_REVEAL_POLICY_VERSION,
  OntologyRegistry,
  exactHistorySha256,
  selectTrainingCandidates,
  trainingCandidatePolicyConfigSha256,
  trainingItemGeneratorConfigSha256,
  trainingPolicyForClassifierBundle,
  type OntologyConceptDetail,
  type OntologySnapshot,
  type TrainingCandidateDecision,
} from '@chess-intelligent/domain';
import {
  applyUciMove,
  detectTacticalMoveFacts,
  normalizePositionFen,
  PositionFenError,
} from '@chess-intelligent/chess-core';

import type { PublishedOntologySnapshotReader } from './player-skill-graph-application';

export type TrainingApplicationErrorCode =
  | 'TRAINING_PLAN_NOT_FOUND'
  | 'TRAINING_ITEM_NOT_FOUND'
  | 'TRAINING_ATTEMPT_NOT_FOUND'
  | 'SKILL_GRAPH_RUN_NOT_FOUND'
  | 'PLAYER_SKILL_GRAPH_MISMATCH'
  | 'ONTOLOGY_NOT_FOUND'
  | 'INVALID_TRAINING_SOURCE'
  | 'ILLEGAL_TRAINING_MOVE'
  | 'TRAINING_PLAYER_MISMATCH';

export class TrainingApplicationError extends Error {
  constructor(
    readonly code: TrainingApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TrainingApplicationError';
  }
}

export interface CreateTrainingPlanInput {
  playerId: string;
  skillGraphRunId: string;
  maxItems: number;
}

export interface TrainingCandidateView extends TrainingCandidateRecord {
  concept: Pick<OntologyConceptDetail, 'stableId' | 'displayName' | 'shortDescription'>;
  why: string[];
}

export interface PublicTrainingItemView {
  id: string;
  trainingPlanRunId: string;
  playerId: string;
  itemType: 'FIND_BEST_MOVE';
  trainingMode: TrainingItemRecord['trainingMode'];
  positionFen: string;
  sideToMove: TrainingItemRecord['sideToMove'];
  exactHistorySha256: string;
  instructions: string;
  targetConcept: { stableId: string; displayName: string } | null;
  source: { gameId: string; occurrenceId: string; occurrencePly: number } | null;
  acceptedMoveUcis?: string[];
  attempts: TrainingAttemptRecord[];
  trainingEvidence: TrainingEvidenceRecord[];
}

export interface TrainingPlanView {
  run: TrainingPlanRunRecord & { deduplicated?: boolean };
  coverage: {
    consideredConcepts: number;
    eligibleCandidates: number;
    materializedItems: number;
    unavailableCandidates: number;
  };
  remediationCandidates: TrainingCandidateView[];
  diagnosticCandidates: TrainingCandidateView[];
  unavailableCandidates: TrainingCandidateView[];
  trainingItems: PublicTrainingItemView[];
  policy: {
    candidatePolicyVersion: string;
    candidatePolicyConfigSha256: string;
    sourcePolicyVersion: string;
    generatorVersion: string;
    generatorConfigSha256: string;
    revealPolicyVersion: string;
    cooldownPolicyVersion: string;
  };
}

function why(candidate: TrainingCandidateRecord): string[] {
  if (candidate.candidateType === 'REMEDIATION') {
    return [
      `${candidate.evidenceConfidence.toLowerCase()} evidence confidence`,
      `${(candidate.masteryBand ?? 'estimated').toLowerCase()} mastery estimate`,
      candidate.selectedSourceEvidenceId
        ? 'Recent negative decision evidence is available'
        : 'No compatible negative decision source is available',
    ];
  }
  return [
    candidate.skillStateStatus === 'NO_EVIDENCE'
      ? 'No direct performance evidence is currently available'
      : 'Current direct performance evidence is insufficient',
    'This assessment is intended to gather more direct evidence',
  ];
}

export class TrainingApplicationService {
  constructor(
    private readonly training: TrainingRepository,
    private readonly skillGraphs: PlayerSkillGraphRepository,
    private readonly ontologies: PublishedOntologySnapshotReader,
  ) {}

  async createPlan(input: CreateTrainingPlanInput): Promise<TrainingPlanView> {
    const graph = await this.requireSkillGraph(input.skillGraphRunId);
    if (graph.playerId !== input.playerId) {
      throw new TrainingApplicationError(
        'PLAYER_SKILL_GRAPH_MISMATCH',
        'The requested Skill Graph belongs to a different Player.',
      );
    }
    const snapshot = await this.requireOntology(graph.ontologyVersion);
    const registry = new OntologyRegistry(snapshot.source);
    const states = await this.skillGraphs.getConceptStates(graph.id);
    const details = new Map(
      snapshot.source.concepts.map((definition) => [
        definition.stableId,
        this.requireConcept(registry, definition.stableId),
      ]),
    );
    const [sources, recentSourceIds] = await Promise.all([
      this.training.loadSourceMaterials({
        skillGraphRunId: graph.id,
        playerId: graph.playerId,
        ontologyVersion: graph.ontologyVersion,
      }),
      this.training.getRecentlyAttemptedSourceEvidenceIds(graph.playerId),
    ]);
    const trainingPolicy = trainingPolicyForClassifierBundle(graph.classifierBundleVersion);
    const candidates = selectTrainingCandidates({
      playerId: graph.playerId,
      asOfDate: graph.asOfDate,
      concepts: states.map((state) => ({ detail: details.get(state.conceptStableId)!, state })),
      sources,
      recentlyAttemptedSourceEvidenceIds: recentSourceIds,
      supportedConceptStableIds: trainingPolicy.supportedConceptStableIds,
    });
    const sourceById = new Map(sources.map((source) => [source.evidenceInstanceId, source]));
    const items = candidates
      .filter((candidate) => candidate.disposition === 'ELIGIBLE')
      .slice(0, input.maxItems)
      .flatMap((candidate) => {
        const source = candidate.selectedSourceEvidenceId
          ? sourceById.get(candidate.selectedSourceEvidenceId)
          : undefined;
        if (!source) return [];
        return [this.materializeItem(graph, candidate, source)];
      });
    const persisted = await this.training.persistSuccessfulPlan({
      playerId: graph.playerId,
      skillGraphRunId: graph.id,
      ontologyVersion: graph.ontologyVersion,
      trainingCandidatePolicyVersion: trainingPolicy.candidatePolicyVersion,
      candidatePolicyConfigSha256: trainingCandidatePolicyConfigSha256(
        graph.classifierBundleVersion,
      ),
      trainingItemSourcePolicyVersion: TRAINING_ITEM_SOURCE_POLICY_VERSION,
      trainingItemGeneratorVersion: trainingPolicy.generatorVersion,
      itemGeneratorConfigSha256: trainingItemGeneratorConfigSha256(graph.classifierBundleVersion),
      revealPolicyVersion: TRAINING_REVEAL_POLICY_VERSION,
      cooldownPolicyVersion: TRAINING_COOLDOWN_VERSION,
      maxItems: input.maxItems,
      consideredConceptCount: states.filter(
        (state) => details.get(state.conceptStableId)?.kind !== 'DOMAIN',
      ).length,
      candidates,
      items,
    });
    const view = await this.getPlan(persisted.planId);
    view.run.deduplicated = persisted.deduplicated;
    return view;
  }

  async getPlan(planId: string): Promise<TrainingPlanView> {
    const run = await this.training.getPlan(planId);
    if (!run) {
      throw new TrainingApplicationError(
        'TRAINING_PLAN_NOT_FOUND',
        `Training plan ${planId} does not exist.`,
      );
    }
    const snapshot = await this.requireOntology(run.ontologyVersion);
    const registry = new OntologyRegistry(snapshot.source);
    const [candidates, items] = await Promise.all([
      this.training.getCandidates(planId),
      this.training.getPlanItems(planId),
    ]);
    const candidateViews = candidates.map((candidate) => ({
      ...candidate,
      concept: (() => {
        const detail = this.requireConcept(registry, candidate.conceptStableId);
        return {
          stableId: detail.stableId,
          displayName: detail.displayName,
          shortDescription: detail.shortDescription,
        };
      })(),
      why: why(candidate),
    }));
    const publicItems = await Promise.all(items.map((item) => this.publicItem(item, registry)));
    const available = candidateViews.filter((candidate) => candidate.disposition === 'ELIGIBLE');
    return {
      run,
      coverage: {
        consideredConcepts: run.consideredConceptCount,
        eligibleCandidates: run.eligibleCandidateCount,
        materializedItems: run.materializedItemCount,
        unavailableCandidates: candidates.length - available.length,
      },
      remediationCandidates: available.filter(
        (candidate) => candidate.candidateType === 'REMEDIATION',
      ),
      diagnosticCandidates: available.filter(
        (candidate) => candidate.candidateType === 'DIAGNOSTIC',
      ),
      unavailableCandidates: candidateViews.filter(
        (candidate) => candidate.disposition !== 'ELIGIBLE',
      ),
      trainingItems: publicItems,
      policy: {
        candidatePolicyVersion: run.trainingCandidatePolicyVersion,
        candidatePolicyConfigSha256: run.candidatePolicyConfigSha256,
        sourcePolicyVersion: run.trainingItemSourcePolicyVersion,
        generatorVersion: run.trainingItemGeneratorVersion,
        generatorConfigSha256: run.itemGeneratorConfigSha256,
        revealPolicyVersion: run.revealPolicyVersion,
        cooldownPolicyVersion: run.cooldownPolicyVersion,
      },
    };
  }

  async getItem(itemId: string): Promise<PublicTrainingItemView> {
    const item = await this.requireItem(itemId);
    const snapshot = await this.requireOntology(item.ontologyVersion);
    return this.publicItem(item, new OntologyRegistry(snapshot.source));
  }

  async submitAttempt(input: {
    itemId: string;
    playerId: string;
    moveUci: string;
    startedAt?: string | null | undefined;
    durationMs?: number | null | undefined;
  }): Promise<{
    attempt: TrainingAttemptRecord;
    trainingEvidence: TrainingEvidenceRecord;
    item: PublicTrainingItemView;
    message: 'NEW_TRAINING_EVIDENCE_RECORDED_REFRESH_SKILL_GRAPH_TO_INCLUDE_IT';
  }> {
    const item = await this.requireItem(input.itemId);
    if (item.playerId !== input.playerId) {
      throw new TrainingApplicationError(
        'TRAINING_PLAYER_MISMATCH',
        'The submitted Player does not own this training item.',
      );
    }
    try {
      applyUciMove(item.positionFen, input.moveUci);
    } catch (error) {
      if (error instanceof PositionFenError) {
        throw new TrainingApplicationError('ILLEGAL_TRAINING_MOVE', error.message);
      }
      throw error;
    }
    const completed = await this.training.submitAttempt({
      trainingItemId: item.id,
      playerId: input.playerId,
      submittedMoveUci: input.moveUci,
      startedAt: input.startedAt,
      durationMs: input.durationMs,
    });
    return {
      attempt: completed.attempt,
      trainingEvidence: completed.evidence,
      item: await this.getItem(item.id),
      message: 'NEW_TRAINING_EVIDENCE_RECORDED_REFRESH_SKILL_GRAPH_TO_INCLUDE_IT',
    };
  }

  async getAttempt(attemptId: string) {
    const result = await this.training.getAttempt(attemptId);
    if (!result) {
      throw new TrainingApplicationError(
        'TRAINING_ATTEMPT_NOT_FOUND',
        `Training attempt ${attemptId} does not exist.`,
      );
    }
    const snapshot = await this.requireOntology(result.item.ontologyVersion);
    return {
      attempt: result.attempt,
      trainingEvidence: result.evidence,
      item: await this.publicItem(result.item, new OntologyRegistry(snapshot.source)),
    };
  }

  private materializeItem(
    graph: PlayerSkillGraphRunRecord,
    candidate: TrainingCandidateDecision,
    source: TrainingSourceMaterial,
  ) {
    if (
      source.classifierBundleVersion !== graph.classifierBundleVersion ||
      source.classifierConfigSha256 !== graph.classifierConfigSha256 ||
      source.analysisProfile !== 'QUICK_V1' ||
      source.analysisProfileVersion !== 1 ||
      source.conceptStableId !== candidate.conceptStableId ||
      exactHistorySha256(source.initialFen, source.historyUci) !== source.exactHistorySha256
    ) {
      throw new TrainingApplicationError(
        'INVALID_TRAINING_SOURCE',
        `Source evidence ${source.evidenceInstanceId} is not compatible with the pinned Skill Graph.`,
      );
    }
    let positionFen = normalizePositionFen(source.initialFen).fen;
    for (const move of source.historyUci)
      positionFen = applyUciMove(positionFen, move).resultingPosition.fen;
    if (normalizePositionFen(positionFen).id !== normalizePositionFen(source.positionFen).id) {
      throw new TrainingApplicationError(
        'INVALID_TRAINING_SOURCE',
        `Source evidence ${source.evidenceInstanceId} does not reconstruct its occurrence position.`,
      );
    }
    const acceptedMoveUci =
      candidate.candidateType === 'REMEDIATION' ? source.bestMoveUci : source.playedMoveUci;
    const factMove =
      candidate.candidateType === 'REMEDIATION'
        ? source.facts.bestMoveUci
        : source.facts.playedMoveUci;
    const classifierBundle =
      graph.classifierBundleVersion === 'CONCEPT_CLASSIFIER_BUNDLE_V1'
        ? 'CONCEPT_CLASSIFIER_BUNDLE_V1'
        : 'CONCEPT_CLASSIFIER_BUNDLE_V2';
    const validMotif = detectTacticalMoveFacts(positionFen, acceptedMoveUci, classifierBundle).some(
      (fact) => fact.conceptStableId === candidate.conceptStableId,
    );
    if (factMove !== acceptedMoveUci || !validMotif) {
      throw new TrainingApplicationError(
        'INVALID_TRAINING_SOURCE',
        `Source evidence ${source.evidenceInstanceId} no longer validates the target motif.`,
      );
    }
    applyUciMove(positionFen, acceptedMoveUci);
    return {
      candidateConceptStableId: candidate.conceptStableId,
      source: { ...source, positionFen },
      acceptedMoveUcis: [acceptedMoveUci],
    };
  }

  private async publicItem(
    item: TrainingItemRecord,
    registry: OntologyRegistry,
  ): Promise<PublicTrainingItemView> {
    const attempts = await this.training.getItemAttempts(item.id);
    const completed = attempts.length > 0;
    const concept = this.requireConcept(registry, item.conceptStableId);
    const evidence = await Promise.all(
      attempts.map(async (attempt) => (await this.training.getAttempt(attempt.id))!.evidence),
    );
    const revealConcept =
      completed || TRAINING_REVEAL_POLICY_V1[item.trainingMode].revealConceptBeforeAttempt;
    return {
      id: item.id,
      trainingPlanRunId: item.trainingPlanRunId,
      playerId: item.playerId,
      itemType: item.itemType,
      trainingMode: item.trainingMode,
      positionFen: item.positionFen,
      sideToMove: item.sideToMove,
      exactHistorySha256: item.exactHistorySha256,
      instructions: 'Find the best move. Submit one legal move in UCI notation.',
      targetConcept: revealConcept
        ? { stableId: concept.stableId, displayName: concept.displayName }
        : null,
      source: completed
        ? {
            gameId: item.sourceGameId,
            occurrenceId: item.sourceOccurrenceId,
            occurrencePly: item.sourceOccurrencePly,
          }
        : null,
      ...(completed ? { acceptedMoveUcis: item.acceptedMoveUcis } : {}),
      attempts,
      trainingEvidence: evidence,
    };
  }

  private async requireSkillGraph(runId: string): Promise<PlayerSkillGraphRunRecord> {
    const run = await this.skillGraphs.getRun(runId);
    if (!run) {
      throw new TrainingApplicationError(
        'SKILL_GRAPH_RUN_NOT_FOUND',
        `Successful Skill Graph run ${runId} does not exist.`,
      );
    }
    return run;
  }

  private async requireItem(itemId: string): Promise<TrainingItemRecord> {
    const item = await this.training.getItem(itemId);
    if (!item) {
      throw new TrainingApplicationError(
        'TRAINING_ITEM_NOT_FOUND',
        `Training item ${itemId} does not exist.`,
      );
    }
    return item;
  }

  private async requireOntology(version: string): Promise<OntologySnapshot> {
    const snapshot = await this.ontologies.getPublishedVersion(version);
    if (!snapshot) {
      throw new TrainingApplicationError(
        'ONTOLOGY_NOT_FOUND',
        `Published ontology ${version} does not exist.`,
      );
    }
    return snapshot;
  }

  private requireConcept(registry: OntologyRegistry, stableId: string): OntologyConceptDetail {
    const detail = registry.getConceptDetail(stableId);
    if (!detail) throw new Error(`Pinned ontology concept ${stableId} is missing.`);
    return detail;
  }
}
