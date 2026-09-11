import {
  applyUciMove,
  detectTacticalMoveFacts,
  normalizePositionFen,
  PositionStructureClassifier,
  TacticalMotifClassifier,
} from '@chess-intelligent/chess-core';
import type {
  ClassificationGameInput,
  ClassificationRepository,
  OntologyRepository,
} from '@chess-intelligent/db';
import {
  CONCEPT_CLASSIFIER_BUNDLE_VERSION,
  conceptClassifierConfigurationSha256,
  exactHistorySha256,
  OntologyRegistry,
  resolveAndNormalizeConceptEvidence,
  tacticalDecisionEvidenceCandidates,
  type ClassificationContext,
  type ClassificationRunView,
  type ConceptEvidenceCandidate,
  type ConceptEvidenceProjection,
  type ConceptClassifierBundleVersion,
} from '@chess-intelligent/domain';

export type ConceptClassificationApplicationErrorCode =
  'ONTOLOGY_NOT_FOUND' | 'GAME_HISTORY_MISMATCH' | 'EXACT_HISTORY_MISMATCH';

export class ConceptClassificationApplicationError extends Error {
  constructor(
    readonly code: ConceptClassificationApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConceptClassificationApplicationError';
  }
}

export interface ClassifyGameRequest {
  gameId: string;
  ontologyVersion: string;
  analysisRunId?: string | undefined;
  classifierBundleVersion?: ConceptClassifierBundleVersion | undefined;
}

export interface ClassifyGameResult {
  classificationRunId: string;
  status: 'SUCCEEDED';
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  selectedAnalysisRunId: string | null;
  evidenceCount: number;
  deduplicated: boolean;
}

function historyMismatch(message: string): never {
  throw new ConceptClassificationApplicationError('GAME_HISTORY_MISMATCH', message);
}

function exactHistoryMismatch(message: string): never {
  throw new ConceptClassificationApplicationError('EXACT_HISTORY_MISMATCH', message);
}

function verifyEngineContext(
  game: ClassificationGameInput,
  occurrenceIndex: number,
  currentFen: string,
  historyUci: readonly string[],
): ClassificationContext['engine'] {
  if (!game.selectedAnalysisRunId) return null;
  const occurrence = game.occurrences[occurrenceIndex]!;
  const engine = game.engineOccurrences[occurrenceIndex];
  if (!engine || engine.occurrencePly !== occurrence.ply) {
    return exactHistoryMismatch(
      `Analysis run ${game.selectedAnalysisRunId} has no exact engine state for occurrence ply ${occurrence.ply}.`,
    );
  }
  const exactHash = exactHistorySha256(game.initialFen, historyUci);
  const compatible =
    engine.initialFen === game.initialFen &&
    engine.normalizedPositionId === occurrence.normalizedPositionId &&
    engine.historySha256 === exactHash &&
    JSON.stringify(engine.historyUci) === JSON.stringify(historyUci) &&
    engine.sideToMove === occurrence.sideToMove &&
    engine.playedMoveUci === occurrence.playedMoveUci &&
    normalizePositionFen(currentFen).id === occurrence.normalizedPositionId;
  if (!compatible) {
    return exactHistoryMismatch(
      `Analysis run ${game.selectedAnalysisRunId} is not compatible with the exact history at occurrence ply ${occurrence.ply}.`,
    );
  }
  return {
    analysisRunId: game.selectedAnalysisRunId,
    historySha256: engine.historySha256,
    playedMoveUci: engine.playedMoveUci,
    bestMoveUci: engine.bestMoveUci,
    centipawnLoss: engine.centipawnLoss,
    mateOutcome: engine.mateOutcome,
  };
}

export class ConceptClassificationApplicationService {
  constructor(
    private readonly classifications: ClassificationRepository,
    private readonly ontologies: OntologyRepository,
  ) {}

  async classifyGame(request: ClassifyGameRequest): Promise<ClassifyGameResult> {
    const classifierBundleVersion =
      request.classifierBundleVersion ?? CONCEPT_CLASSIFIER_BUNDLE_VERSION;
    const positionClassifier = new PositionStructureClassifier(classifierBundleVersion);
    const tacticalClassifier = new TacticalMotifClassifier(classifierBundleVersion);
    const snapshot = await this.ontologies.getPublishedVersion(request.ontologyVersion);
    if (!snapshot) {
      throw new ConceptClassificationApplicationError(
        'ONTOLOGY_NOT_FOUND',
        `Published ontology ${request.ontologyVersion} does not exist.`,
      );
    }
    const registry = new OntologyRegistry(snapshot.source);
    const game = await this.classifications.loadGameForClassification(
      request.gameId,
      request.analysisRunId,
    );
    const candidates: ConceptEvidenceCandidate[] = [];
    const historyUci: string[] = [];
    let currentFen = normalizePositionFen(game.initialFen).fen;

    if (game.selectedAnalysisRunId && game.engineOccurrences.length !== game.occurrences.length) {
      exactHistoryMismatch(
        `Analysis run ${game.selectedAnalysisRunId} is incomplete for the canonical game history.`,
      );
    }

    for (const [index, occurrence] of game.occurrences.entries()) {
      const position = normalizePositionFen(currentFen);
      if (
        occurrence.ply !== index ||
        occurrence.normalizedPositionId !== position.id ||
        occurrence.sideToMove !== position.sideToMove
      ) {
        historyMismatch(
          `Canonical occurrence ${occurrence.ply} does not match its exact game history.`,
        );
      }
      const exactHistorySha = exactHistorySha256(game.initialFen, historyUci);
      const engine = verifyEngineContext(game, index, currentFen, historyUci);
      if (engine && engine.historySha256 !== exactHistorySha) {
        exactHistoryMismatch(`Engine history hash differs at occurrence ply ${occurrence.ply}.`);
      }
      const context: ClassificationContext = {
        occurrencePly: occurrence.ply,
        decisionPly: occurrence.ply + 1,
        positionOccurrenceId: occurrence.id,
        exactHistorySha256: exactHistorySha,
        sideToMove: occurrence.sideToMove,
        preMoveFen: position.fen,
        playedMoveUci: occurrence.playedMoveUci,
        playedMoveSan: occurrence.playedMoveSan,
        subjectPlayerId: occurrence.subjectPlayerId,
        engine,
      };

      candidates.push(...positionClassifier.classify(context));
      const neutralTactical = tacticalClassifier.classify(context);
      candidates.push(...neutralTactical);
      if (engine) {
        const playedMotifs = detectTacticalMoveFacts(
          position.fen,
          occurrence.playedMoveUci,
          classifierBundleVersion,
        );
        const bestMoveMotifs = detectTacticalMoveFacts(
          position.fen,
          engine.bestMoveUci,
          classifierBundleVersion,
        );
        candidates.push(
          ...tacticalDecisionEvidenceCandidates(
            context,
            playedMotifs,
            bestMoveMotifs,
            classifierBundleVersion,
          ),
        );
      }

      const applied = applyUciMove(position.fen, occurrence.playedMoveUci);
      if (applied.resultingPosition.id !== occurrence.resultingPositionId) {
        historyMismatch(`Canonical resulting position differs after decision ply ${index + 1}.`);
      }
      historyUci.push(occurrence.playedMoveUci);
      currentFen = applied.resultingPosition.fen;
    }

    const evidence = resolveAndNormalizeConceptEvidence(registry, candidates);
    const persisted = await this.classifications.persistSuccessfulRun({
      gameId: game.gameId,
      ontologyVersion: snapshot.version,
      classifierBundleVersion,
      classifierConfigSha256: conceptClassifierConfigurationSha256(classifierBundleVersion),
      selectedAnalysisRunId: game.selectedAnalysisRunId,
      evidence,
    });
    return {
      classificationRunId: persisted.run.id,
      status: 'SUCCEEDED',
      ontologyVersion: persisted.run.ontologyVersion,
      classifierBundleVersion: persisted.run.classifierBundleVersion,
      classifierConfigSha256: persisted.run.classifierConfigSha256,
      selectedAnalysisRunId: persisted.run.selectedAnalysisRunId,
      evidenceCount: persisted.run.evidenceCount,
      deduplicated: !persisted.created,
    };
  }

  getRun(runId: string): Promise<ClassificationRunView | null> {
    return this.classifications.getRun(runId);
  }

  getGameEvidence(
    gameId: string,
    classificationRunId?: string | undefined,
    conceptStableId?: string | undefined,
  ): Promise<ConceptEvidenceProjection | null> {
    return this.classifications.getGameEvidence(gameId, classificationRunId, conceptStableId);
  }
}
