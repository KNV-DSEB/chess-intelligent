import { randomUUID } from 'node:crypto';

import type {
  ClassificationRunSummary,
  ClassificationRunView,
  ClassificationRuleFacts,
  Color,
  ConceptDifficulty,
  ConceptEvidenceProjection,
  ConceptEvidenceView,
  ConceptKind,
  ConceptStatus,
  EvidencePolarity,
  EvidenceRole,
  MateOutcome,
  ResolvedConceptEvidence,
} from '@chess-intelligent/domain';

import type { Database, QueryClient } from './database';

export type ClassificationRepositoryErrorCode =
  | 'GAME_NOT_FOUND'
  | 'MOVES_REQUIRED'
  | 'ONTOLOGY_NOT_FOUND'
  | 'ANALYSIS_RUN_NOT_FOUND'
  | 'INCOMPATIBLE_ANALYSIS_RUN'
  | 'CLASSIFICATION_RUN_NOT_FOUND';

export class ClassificationRepositoryError extends Error {
  constructor(
    readonly code: ClassificationRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClassificationRepositoryError';
  }
}

interface GameRow {
  id: string;
  initial_fen: string | null;
  content_status: string;
}

interface OccurrenceRow {
  id: string;
  ply: number;
  position_id: string;
  resulting_position_id: string;
  side_to_move: Color;
  played_move_uci: string;
  played_move_san: string;
  subject_player_id: string;
}

interface AnalysisSelectionRow {
  id: string;
  game_id: string;
  profile: string;
  profile_version: number;
}

interface EngineContextRow {
  occurrence_ply: number;
  normalized_position_id: string;
  initial_fen: string;
  history_uci: string[] | string;
  history_sha256: string;
  side_to_move: Color;
  played_move_uci: string;
  best_move_uci: string;
  centipawn_loss: number | null;
  mate_outcome: MateOutcome;
}

interface OntologyVersionIdRow {
  id: string;
}

interface RunRow {
  id: string;
  game_id: string;
  ontology_version: string;
  classifier_bundle_version: string;
  classifier_config_sha256: string;
  selected_analysis_run_id: string | null;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  evidence_count: number;
  started_at: string | Date;
  completed_at: string | Date | null;
}

interface EvidenceRow {
  id: string;
  classification_run_id: string;
  ontology_version: string;
  concept_stable_id: string;
  display_name: string;
  short_description: string;
  kind: ConceptKind;
  difficulty: ConceptDifficulty;
  concept_status: ConceptStatus;
  evidence_type_stable_id: string;
  evidence_type_display_name: string;
  evidence_role: EvidenceRole;
  polarity: EvidencePolarity;
  game_id: string;
  position_occurrence_id: string;
  occurrence_ply: number;
  decision_ply: number;
  subject_kind: 'POSITION' | 'DECISION';
  subject_player_id: string | null;
  subject_color: Color;
  classifier_id: string;
  classifier_version: string;
  rule_id: string;
  exact_history_sha256: string;
  analysis_run_id: string | null;
  facts: ClassificationRuleFacts | string;
  played_move_san: string;
  played_move_uci: string;
  created_at: string | Date;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function json<Value>(value: Value | string): Value {
  return typeof value === 'string' ? (JSON.parse(value) as Value) : value;
}

function runSummary(row: RunRow): ClassificationRunSummary {
  return {
    id: row.id,
    gameId: row.game_id,
    ontologyVersion: row.ontology_version,
    classifierBundleVersion: row.classifier_bundle_version,
    classifierConfigSha256: row.classifier_config_sha256,
    selectedAnalysisRunId: row.selected_analysis_run_id,
    status: row.status,
    evidenceCount: row.evidence_count,
    engineEvidenceAvailable: row.selected_analysis_run_id !== null,
    startedAt: iso(row.started_at)!,
    completedAt: iso(row.completed_at),
  };
}

function evidenceView(row: EvidenceRow): ConceptEvidenceView {
  return {
    id: row.id,
    gameId: row.game_id,
    ontologyVersion: row.ontology_version,
    occurrencePly: row.occurrence_ply,
    decisionPly: row.decision_ply,
    positionOccurrenceId: row.position_occurrence_id,
    exactHistorySha256: row.exact_history_sha256,
    conceptStableId: row.concept_stable_id,
    concept: {
      stableId: row.concept_stable_id,
      displayName: row.display_name,
      kind: row.kind,
      difficulty: row.difficulty,
      status: row.concept_status,
    },
    conceptDescription: row.short_description,
    evidenceTypeStableId: row.evidence_type_stable_id,
    evidenceTypeDisplayName: row.evidence_type_display_name,
    evidenceRole: row.evidence_role,
    polarity: row.polarity,
    subjectKind: row.subject_kind,
    subjectPlayerId: row.subject_player_id,
    subjectColor: row.subject_color,
    classifierId: row.classifier_id,
    classifierVersion: row.classifier_version,
    ruleId: row.rule_id,
    analysisRunId: row.analysis_run_id,
    facts: json(row.facts),
    playedMoveSan: row.played_move_san,
    playedMoveUci: row.played_move_uci,
    createdAt: iso(row.created_at)!,
  };
}

export interface ClassificationGameOccurrenceInput {
  id: string;
  ply: number;
  normalizedPositionId: string;
  resultingPositionId: string;
  sideToMove: Color;
  playedMoveUci: string;
  playedMoveSan: string;
  subjectPlayerId: string;
}

export interface ClassificationEngineOccurrenceInput {
  occurrencePly: number;
  normalizedPositionId: string;
  initialFen: string;
  historyUci: string[];
  historySha256: string;
  sideToMove: Color;
  playedMoveUci: string;
  bestMoveUci: string;
  centipawnLoss: number | null;
  mateOutcome: MateOutcome;
}

export interface ClassificationGameInput {
  gameId: string;
  initialFen: string;
  occurrences: ClassificationGameOccurrenceInput[];
  selectedAnalysisRunId: string | null;
  engineOccurrences: ClassificationEngineOccurrenceInput[];
}

export interface PersistClassificationInput {
  gameId: string;
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  selectedAnalysisRunId: string | null;
  evidence: readonly ResolvedConceptEvidence[];
}

export class ClassificationRepository {
  constructor(private readonly database: Database) {}

  async loadGameForClassification(
    gameId: string,
    requestedAnalysisRunId?: string | undefined,
  ): Promise<ClassificationGameInput> {
    const gameResult = await this.database.query<GameRow>(
      `SELECT id, initial_fen, content_status FROM games WHERE id = $1`,
      [gameId],
    );
    const game = gameResult.rows[0];
    if (!game) {
      throw new ClassificationRepositoryError('GAME_NOT_FOUND', 'No game was found for that ID.');
    }
    if (game.content_status !== 'MOVES_AVAILABLE' || !game.initial_fen) {
      throw new ClassificationRepositoryError(
        'MOVES_REQUIRED',
        'Concept classification requires a canonical game with legal moves.',
      );
    }
    const occurrences = await this.database.query<OccurrenceRow>(
      `SELECT occurrence.id, occurrence.ply, occurrence.position_id,
              occurrence.resulting_position_id, position.side_to_move,
              move.uci AS played_move_uci, move.san AS played_move_san,
              game_player.player_id AS subject_player_id
       FROM position_occurrences occurrence
       JOIN positions position ON position.id = occurrence.position_id
       JOIN moves move ON move.id = occurrence.next_move_id
       JOIN game_players game_player
         ON game_player.game_id = occurrence.game_id
        AND game_player.color = position.side_to_move
       WHERE occurrence.game_id = $1
       ORDER BY occurrence.ply`,
      [gameId],
    );
    if (occurrences.rows.length === 0) {
      throw new ClassificationRepositoryError(
        'MOVES_REQUIRED',
        'Concept classification requires at least one position occurrence.',
      );
    }

    const selected = await this.selectAnalysisRun(gameId, requestedAnalysisRunId);
    const engineOccurrences = selected
      ? await this.database.query<EngineContextRow>(
          `SELECT state.occurrence_ply, state.normalized_position_id,
                  state.initial_fen, state.history_uci,
                  state.history_sha256, state.side_to_move,
                  assessment.played_move_uci, assessment.best_move_uci,
                  assessment.centipawn_loss, assessment.mate_outcome
           FROM engine_position_states state
           JOIN move_engine_assessments assessment
             ON assessment.analysis_run_id = state.analysis_run_id
            AND assessment.engine_position_state_id = state.id
           WHERE state.analysis_run_id = $1 AND state.game_id = $2
           ORDER BY state.occurrence_ply`,
          [selected.id, gameId],
        )
      : { rows: [], rowCount: 0 };

    return {
      gameId,
      initialFen: game.initial_fen,
      occurrences: occurrences.rows.map((row) => ({
        id: row.id,
        ply: row.ply,
        normalizedPositionId: row.position_id,
        resultingPositionId: row.resulting_position_id,
        sideToMove: row.side_to_move,
        playedMoveUci: row.played_move_uci,
        playedMoveSan: row.played_move_san,
        subjectPlayerId: row.subject_player_id,
      })),
      selectedAnalysisRunId: selected?.id ?? null,
      engineOccurrences: engineOccurrences.rows.map((row) => ({
        occurrencePly: row.occurrence_ply,
        normalizedPositionId: row.normalized_position_id,
        initialFen: row.initial_fen,
        historyUci: json(row.history_uci),
        historySha256: row.history_sha256,
        sideToMove: row.side_to_move,
        playedMoveUci: row.played_move_uci,
        bestMoveUci: row.best_move_uci,
        centipawnLoss: row.centipawn_loss,
        mateOutcome: row.mate_outcome,
      })),
    };
  }

  private async selectAnalysisRun(
    gameId: string,
    requestedAnalysisRunId?: string | undefined,
  ): Promise<AnalysisSelectionRow | null> {
    const result = await this.database.query<AnalysisSelectionRow>(
      requestedAnalysisRunId
        ? `SELECT id, game_id, profile, profile_version FROM analysis_runs
           WHERE id = $1 AND game_id = $2 AND status = 'SUCCEEDED'`
        : `SELECT id, game_id, profile, profile_version FROM analysis_runs
           WHERE game_id = $1 AND status = 'SUCCEEDED'
             AND profile = 'QUICK_V1' AND profile_version = 1
           ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1`,
      requestedAnalysisRunId ? [requestedAnalysisRunId, gameId] : [gameId],
    );
    const selected = result.rows[0];
    if (requestedAnalysisRunId && !selected) {
      throw new ClassificationRepositoryError(
        'ANALYSIS_RUN_NOT_FOUND',
        'The requested completed analysis run does not exist for this game.',
      );
    }
    if (selected && (selected.profile !== 'QUICK_V1' || selected.profile_version !== 1)) {
      throw new ClassificationRepositoryError(
        'INCOMPATIBLE_ANALYSIS_RUN',
        'Task 008 V1 requires a successful QUICK_V1 profile-version-1 analysis run.',
      );
    }
    return selected ?? null;
  }

  async persistSuccessfulRun(
    input: PersistClassificationInput,
  ): Promise<{ created: boolean; run: ClassificationRunSummary }> {
    return this.database.transaction(async (client) => {
      const ontologyVersion = await client.query<OntologyVersionIdRow>(
        `SELECT id FROM ontology_versions WHERE version = $1 AND status = 'PUBLISHED'`,
        [input.ontologyVersion],
      );
      const ontologyVersionId = ontologyVersion.rows[0]?.id;
      if (!ontologyVersionId) {
        throw new ClassificationRepositoryError(
          'ONTOLOGY_NOT_FOUND',
          `Published ontology ${input.ontologyVersion} does not exist.`,
        );
      }
      const existing = await client.query<RunRow>(
        `SELECT * FROM concept_classification_runs
         WHERE game_id = $1 AND ontology_version = $2
           AND classifier_bundle_version = $3 AND classifier_config_sha256 = $4
           AND selected_analysis_run_id IS NOT DISTINCT FROM $5
           AND status = 'SUCCEEDED'
         ORDER BY completed_at DESC, id DESC LIMIT 1`,
        [
          input.gameId,
          input.ontologyVersion,
          input.classifierBundleVersion,
          input.classifierConfigSha256,
          input.selectedAnalysisRunId,
        ],
      );
      if (existing.rows[0]) return { created: false, run: runSummary(existing.rows[0]) };

      const runId = randomUUID();
      const inserted = await client.query<RunRow>(
        `INSERT INTO concept_classification_runs (
           id, game_id, ontology_version_id, ontology_version,
           classifier_bundle_version, classifier_config_sha256,
           selected_analysis_run_id, status, evidence_count, completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUCCEEDED', $8, now())
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          runId,
          input.gameId,
          ontologyVersionId,
          input.ontologyVersion,
          input.classifierBundleVersion,
          input.classifierConfigSha256,
          input.selectedAnalysisRunId,
          input.evidence.length,
        ],
      );
      if (!inserted.rows[0]) {
        const concurrent = await client.query<RunRow>(
          `SELECT * FROM concept_classification_runs
           WHERE game_id = $1 AND ontology_version = $2
             AND classifier_bundle_version = $3 AND classifier_config_sha256 = $4
             AND selected_analysis_run_id IS NOT DISTINCT FROM $5
             AND status = 'SUCCEEDED'
           ORDER BY completed_at DESC, id DESC LIMIT 1`,
          [
            input.gameId,
            input.ontologyVersion,
            input.classifierBundleVersion,
            input.classifierConfigSha256,
            input.selectedAnalysisRunId,
          ],
        );
        if (!concurrent.rows[0]) {
          throw new Error('The concurrent classification run could not be resolved.');
        }
        return { created: false, run: runSummary(concurrent.rows[0]) };
      }
      for (const evidence of input.evidence) {
        await this.insertEvidence(client, runId, ontologyVersionId, input.gameId, evidence);
      }
      return { created: true, run: runSummary(inserted.rows[0]) };
    });
  }

  private async insertEvidence(
    client: QueryClient,
    runId: string,
    ontologyVersionId: string,
    gameId: string,
    evidence: ResolvedConceptEvidence,
  ): Promise<void> {
    await client.query(
      `INSERT INTO concept_evidence_instances (
         id, classification_run_id, ontology_version_id,
         concept_stable_id, evidence_type_stable_id, evidence_role, polarity,
         game_id, position_occurrence_id, occurrence_ply, decision_ply,
         subject_kind, subject_player_id, subject_color,
         classifier_id, classifier_version, rule_id, exact_history_sha256,
         analysis_run_id, facts
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb
       )`,
      [
        randomUUID(),
        runId,
        ontologyVersionId,
        evidence.conceptStableId,
        evidence.evidenceTypeStableId,
        evidence.evidenceRole,
        evidence.polarity,
        gameId,
        evidence.positionOccurrenceId,
        evidence.occurrencePly,
        evidence.decisionPly,
        evidence.subjectKind,
        evidence.subjectPlayerId,
        evidence.subjectColor,
        evidence.classifierId,
        evidence.classifierVersion,
        evidence.ruleId,
        evidence.exactHistorySha256,
        evidence.analysisRunId,
        JSON.stringify(evidence.facts),
      ],
    );
  }

  async getRun(runId: string): Promise<ClassificationRunView | null> {
    const run = await this.database.query<RunRow>(
      `SELECT * FROM concept_classification_runs WHERE id = $1 AND status = 'SUCCEEDED'`,
      [runId],
    );
    if (!run.rows[0]) return null;
    const evidence = await this.loadEvidence(runId);
    const classifiers = [
      ...new Map(
        evidence.map((entry) => [
          `${entry.classifierId}:${entry.classifierVersion}`,
          { classifierId: entry.classifierId, classifierVersion: entry.classifierVersion },
        ]),
      ).values(),
    ].sort(
      (left, right) =>
        left.classifierId.localeCompare(right.classifierId) ||
        left.classifierVersion.localeCompare(right.classifierVersion),
    );
    return { ...runSummary(run.rows[0]), classifiers, evidence };
  }

  async getGameEvidence(
    gameId: string,
    classificationRunId?: string | undefined,
    conceptStableId?: string | undefined,
  ): Promise<ConceptEvidenceProjection | null> {
    const runResult = await this.database.query<RunRow>(
      classificationRunId
        ? `SELECT * FROM concept_classification_runs
           WHERE id = $1 AND game_id = $2 AND status = 'SUCCEEDED'`
        : `SELECT * FROM concept_classification_runs
           WHERE game_id = $1 AND status = 'SUCCEEDED'
           ORDER BY completed_at DESC, id DESC LIMIT 1`,
      classificationRunId ? [classificationRunId, gameId] : [gameId],
    );
    const run = runResult.rows[0];
    if (!run) return null;
    const summary = runSummary(run);
    return {
      run: summary,
      evidence: await this.loadEvidence(run.id, conceptStableId),
      limitations: {
        decisionQualityEvidenceLimited: !summary.engineEvidenceAvailable,
        message: summary.engineEvidenceAvailable
          ? 'Compatible QUICK_V1 evidence supported conservative decision classification.'
          : 'Structural and neutral tactical observations are available; positive/negative decision evidence is limited without compatible engine analysis.',
      },
    };
  }

  private async loadEvidence(
    runId: string,
    conceptStableId?: string | undefined,
  ): Promise<ConceptEvidenceView[]> {
    const result = await this.database.query<EvidenceRow>(
      `SELECT evidence.*, run.ontology_version,
              definition.display_name, definition.short_description,
              definition.kind, definition.difficulty, definition.status AS concept_status,
              evidence_type.display_name AS evidence_type_display_name,
              move.san AS played_move_san, move.uci AS played_move_uci
       FROM concept_evidence_instances evidence
       JOIN concept_classification_runs run ON run.id = evidence.classification_run_id
       JOIN concept_definitions definition
         ON definition.ontology_version_id = evidence.ontology_version_id
        AND definition.concept_stable_id = evidence.concept_stable_id
       JOIN evidence_type_definitions evidence_type
         ON evidence_type.ontology_version_id = evidence.ontology_version_id
        AND evidence_type.stable_id = evidence.evidence_type_stable_id
       JOIN position_occurrences occurrence ON occurrence.id = evidence.position_occurrence_id
       JOIN moves move ON move.id = occurrence.next_move_id
       WHERE evidence.classification_run_id = $1
         AND ($2::text IS NULL OR evidence.concept_stable_id = $2)
       ORDER BY evidence.occurrence_ply, evidence.subject_kind,
                evidence.concept_stable_id, evidence.evidence_type_stable_id,
                evidence.polarity, evidence.rule_id, evidence.id`,
      [runId, conceptStableId ?? null],
    );
    return result.rows.map(evidenceView);
  }
}
