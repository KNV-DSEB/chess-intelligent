import type {
  PersistedConceptLineage,
  PlayerSkillGraphRepository,
  PlayerSkillGraphRunRecord,
  PositionCorpusRepository,
} from '@chess-intelligent/db';
import {
  CLASSIFICATION_SELECTION_VERSION,
  CONCEPT_CLASSIFIER_BUNDLE_VERSION,
  OntologyRegistry,
  SKILL_GRAPH_POLICY_VERSION,
  aggregatePlayerSkillGraph,
  calculateBetaPosterior,
  conceptClassifierConfigurationSha256,
  deterministicSha256,
  normalizeSkillGraphScope,
  skillGraphInputSnapshotSha256,
  skillGraphPolicyConfig,
  skillGraphPolicyConfigSha256,
  type ExactExternalIdentityInput,
  type OntologyConceptDetail,
  type OntologySnapshot,
  type PlayerConceptStateComputation,
  type PlayerSkillGraphScopeInput,
  type ResolvedPlayerIdentity,
} from '@chess-intelligent/domain';

export interface PublishedOntologySnapshotReader {
  getPublishedVersion(version: string): Promise<OntologySnapshot | null>;
}

export type PlayerSkillGraphApplicationErrorCode =
  | 'PLAYER_NOT_FOUND_IN_LOCAL_CORPUS'
  | 'ONTOLOGY_NOT_FOUND'
  | 'SKILL_GRAPH_RUN_NOT_FOUND'
  | 'CONCEPT_NOT_FOUND';

export class PlayerSkillGraphApplicationError extends Error {
  constructor(
    readonly code: PlayerSkillGraphApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlayerSkillGraphApplicationError';
  }
}

export interface GeneratePlayerSkillGraphInput {
  playerId?: string | undefined;
  externalIdentity?: ExactExternalIdentityInput | undefined;
  ontologyVersion: string;
  asOfDate: string;
  scope?: PlayerSkillGraphScopeInput | undefined;
}

export interface PlayerSkillGraphConceptView extends PlayerConceptStateComputation {
  displayName: string;
  shortDescription: string;
  kind: OntologyConceptDetail['kind'];
  difficulty: OntologyConceptDetail['difficulty'];
  ontologyStatus: OntologyConceptDetail['status'];
  parent: OntologyConceptDetail['parent'];
  children: OntologyConceptDetail['children'];
  prerequisites: OntologyConceptDetail['prerequisites'];
  dependents: OntologyConceptDetail['dependents'];
  displayPosteriorMean: number | null;
}

export interface PlayerSkillGraphView {
  run: PlayerSkillGraphRunRecord & { player: ResolvedPlayerIdentity; deduplicated?: boolean };
  coverage: PlayerSkillGraphRunRecord['coverage'];
  policy: ReturnType<typeof skillGraphPolicyConfig>;
  domains: Array<{
    stableId: string;
    displayName: string;
    conceptsWithEvidence: number;
    conceptsEstimated: number;
    conceptsInsufficient: number;
    totalEffectiveEvidenceMass: number;
  }>;
  concepts: PlayerSkillGraphConceptView[];
  selectedClassificationRuns: Awaited<ReturnType<PlayerSkillGraphRepository['getSelectedRuns']>>;
  interpretation: 'BETA_POSTERIOR_HEURISTIC_NOT_BKT_NOT_TRAINING_RECOMMENDATION';
}

export interface PlayerSkillGraphConceptDetailView {
  run: PlayerSkillGraphRunRecord & { player: ResolvedPlayerIdentity };
  ontology: OntologyConceptDetail;
  state: PlayerSkillGraphConceptView;
  contributions: Array<
    PersistedConceptLineage & {
      links: {
        game: string;
        conceptEvidence: string;
        engineAnalysis: string | null;
      };
    }
  >;
  reconstruction: {
    positiveEvidenceMass: number;
    negativeEvidenceMass: number;
    posteriorAlpha: number;
    posteriorBeta: number;
    posteriorMean: number | null;
    matchesPersistedState: boolean;
  };
}

export class PlayerSkillGraphApplicationService {
  constructor(
    private readonly repository: PlayerSkillGraphRepository,
    private readonly corpusRepository: PositionCorpusRepository,
    private readonly ontologies: PublishedOntologySnapshotReader,
  ) {}

  async generate(input: GeneratePlayerSkillGraphInput): Promise<PlayerSkillGraphView> {
    const player = await this.resolvePlayer(input.playerId, input.externalIdentity);
    const snapshot = await this.requireOntology(input.ontologyVersion);
    const registry = new OntologyRegistry(snapshot.source);
    const scope = normalizeSkillGraphScope(input.scope);
    const classifierConfigSha256 = conceptClassifierConfigurationSha256();
    const projection = await this.repository.loadEvidenceProjection({
      playerId: player.playerId,
      ontologyVersion: snapshot.version,
      classifierBundleVersion: CONCEPT_CLASSIFIER_BUNDLE_VERSION,
      classifierConfigSha256,
      scope,
    });
    const aggregationInput = {
      playerId: player.playerId,
      conceptStableIds: registry.source.concepts.map((concept) => concept.stableId),
      ...projection,
      asOfDate: input.asOfDate,
    };
    const aggregation = aggregatePlayerSkillGraph(aggregationInput);
    const policyConfigSha256 = skillGraphPolicyConfigSha256({
      ontologyVersion: snapshot.version,
      classifierBundleVersion: CONCEPT_CLASSIFIER_BUNDLE_VERSION,
      classifierConfigSha256,
      classificationSelectionPolicyVersion: CLASSIFICATION_SELECTION_VERSION,
    });
    const persisted = await this.repository.persistSuccessfulRun({
      playerId: player.playerId,
      ontologyVersion: snapshot.version,
      classifierBundleVersion: CONCEPT_CLASSIFIER_BUNDLE_VERSION,
      classifierConfigSha256,
      classificationSelectionPolicyVersion: CLASSIFICATION_SELECTION_VERSION,
      skillGraphPolicyVersion: SKILL_GRAPH_POLICY_VERSION,
      policyConfigSha256,
      inputSnapshotSha256: skillGraphInputSnapshotSha256(aggregationInput),
      evidenceScope: scope,
      evidenceScopeSha256: deterministicSha256(scope),
      asOfDate: input.asOfDate,
      selectedRuns: projection.selectedRuns,
      aggregation,
    });
    const view = await this.getRun(persisted.runId);
    view.run.deduplicated = persisted.deduplicated;
    return view;
  }

  async getRun(runId: string): Promise<PlayerSkillGraphView> {
    const run = await this.requireRun(runId);
    const player = await this.resolvePlayer(run.playerId, undefined);
    const snapshot = await this.requireOntology(run.ontologyVersion);
    const registry = new OntologyRegistry(snapshot.source);
    const states = await this.repository.getConceptStates(runId);
    const concepts = states.map((state) => this.conceptView(registry, state));
    const domains = registry.source.concepts
      .filter((concept) => concept.kind === 'DOMAIN')
      .map((domain) => {
        const descendantIds = new Set(registry.graph.getDescendantIds(domain.stableId));
        const descendantStates = states.filter((state) => descendantIds.has(state.conceptStableId));
        return {
          stableId: domain.stableId,
          displayName: domain.displayName,
          conceptsWithEvidence: descendantStates.filter((state) => state.status !== 'NO_EVIDENCE')
            .length,
          conceptsEstimated: descendantStates.filter((state) => state.status === 'ESTIMATED')
            .length,
          conceptsInsufficient: descendantStates.filter(
            (state) => state.status === 'INSUFFICIENT_EVIDENCE',
          ).length,
          totalEffectiveEvidenceMass: descendantStates.reduce(
            (sum, state) => sum + state.effectiveEvidenceMass,
            0,
          ),
        };
      });
    return {
      run: { ...run, player },
      coverage: run.coverage,
      policy: skillGraphPolicyConfig({
        ontologyVersion: run.ontologyVersion,
        classifierBundleVersion: run.classifierBundleVersion,
        classifierConfigSha256: run.classifierConfigSha256,
        classificationSelectionPolicyVersion: run.classificationSelectionPolicyVersion,
      }),
      domains,
      concepts,
      selectedClassificationRuns: await this.repository.getSelectedRuns(runId),
      interpretation: 'BETA_POSTERIOR_HEURISTIC_NOT_BKT_NOT_TRAINING_RECOMMENDATION',
    };
  }

  async listPlayerRuns(playerId: string): Promise<{
    player: ResolvedPlayerIdentity;
    runs: PlayerSkillGraphRunRecord[];
  }> {
    const player = await this.resolvePlayer(playerId, undefined);
    return { player, runs: await this.repository.listPlayerRuns(player.playerId) };
  }

  async getConcept(runId: string, stableId: string): Promise<PlayerSkillGraphConceptDetailView> {
    const run = await this.requireRun(runId);
    const player = await this.resolvePlayer(run.playerId, undefined);
    const snapshot = await this.requireOntology(run.ontologyVersion);
    const registry = new OntologyRegistry(snapshot.source);
    const ontology = registry.getConceptDetail(stableId);
    if (!ontology) {
      throw new PlayerSkillGraphApplicationError(
        'CONCEPT_NOT_FOUND',
        `Concept ${stableId} does not exist in ontology ${run.ontologyVersion}.`,
      );
    }
    const states = await this.repository.getConceptStates(runId);
    const rawState = states.find((state) => state.conceptStableId === stableId);
    if (!rawState) {
      throw new PlayerSkillGraphApplicationError(
        'CONCEPT_NOT_FOUND',
        `Concept ${stableId} has no state in Skill Graph run ${runId}.`,
      );
    }
    const contributions = (await this.repository.getConceptLineage(runId, stableId)).map(
      (contribution) => ({
        ...contribution,
        links: {
          game: `/games/${contribution.gameId}`,
          conceptEvidence: `/games/${contribution.gameId}?classificationRunId=${contribution.classificationRunId}&concept=${stableId}#concept-evidence`,
          engineAnalysis: contribution.evidence[0]?.analysisRunId
            ? `/games/${contribution.gameId}#engine-analysis`
            : null,
        },
      }),
    );
    const positiveEvidenceMass = contributions.reduce(
      (sum, contribution) => sum + contribution.weights.effectivePositive,
      0,
    );
    const negativeEvidenceMass = contributions.reduce(
      (sum, contribution) => sum + contribution.weights.effectiveNegative,
      0,
    );
    const posterior = calculateBetaPosterior(positiveEvidenceMass, negativeEvidenceMass);
    const tolerance = 1e-9;
    return {
      run: { ...run, player },
      ontology,
      state: this.conceptView(registry, rawState),
      contributions,
      reconstruction: {
        positiveEvidenceMass,
        negativeEvidenceMass,
        posteriorAlpha: posterior.alpha,
        posteriorBeta: posterior.beta,
        posteriorMean: rawState.status === 'NO_EVIDENCE' ? null : posterior.mean,
        matchesPersistedState:
          Math.abs(positiveEvidenceMass - rawState.positiveEvidenceMass) < tolerance &&
          Math.abs(negativeEvidenceMass - rawState.negativeEvidenceMass) < tolerance &&
          Math.abs(posterior.alpha - rawState.posteriorAlpha) < tolerance &&
          Math.abs(posterior.beta - rawState.posteriorBeta) < tolerance,
      },
    };
  }

  private conceptView(
    registry: OntologyRegistry,
    state: PlayerConceptStateComputation,
  ): PlayerSkillGraphConceptView {
    const detail = registry.getConceptDetail(state.conceptStableId);
    if (!detail) throw new Error(`Pinned ontology concept ${state.conceptStableId} is missing.`);
    return {
      ...state,
      displayName: detail.displayName,
      shortDescription: detail.shortDescription,
      kind: detail.kind,
      difficulty: detail.difficulty,
      ontologyStatus: detail.status,
      parent: detail.parent,
      children: detail.children,
      prerequisites: detail.prerequisites,
      dependents: detail.dependents,
      displayPosteriorMean: state.status === 'ESTIMATED' ? state.posteriorMean : null,
    };
  }

  private async resolvePlayer(
    playerId: string | undefined,
    externalIdentity: ExactExternalIdentityInput | undefined,
  ): Promise<ResolvedPlayerIdentity> {
    const player = playerId
      ? await this.corpusRepository.getPlayer(playerId)
      : externalIdentity
        ? await this.corpusRepository.resolveExactIdentity(externalIdentity)
        : null;
    if (!player) {
      throw new PlayerSkillGraphApplicationError(
        'PLAYER_NOT_FOUND_IN_LOCAL_CORPUS',
        'No exact local Player exists for the requested identity.',
      );
    }
    return player;
  }

  private async requireOntology(version: string): Promise<OntologySnapshot> {
    const snapshot = await this.ontologies.getPublishedVersion(version);
    if (!snapshot) {
      throw new PlayerSkillGraphApplicationError(
        'ONTOLOGY_NOT_FOUND',
        `Published ontology ${version} does not exist.`,
      );
    }
    return snapshot;
  }

  private async requireRun(runId: string): Promise<PlayerSkillGraphRunRecord> {
    const run = await this.repository.getRun(runId);
    if (!run) {
      throw new PlayerSkillGraphApplicationError(
        'SKILL_GRAPH_RUN_NOT_FOUND',
        `Successful Skill Graph run ${runId} does not exist.`,
      );
    }
    return run;
  }
}
