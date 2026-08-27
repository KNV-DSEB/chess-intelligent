import { randomUUID } from 'node:crypto';

import type {
  Color,
  EvidencePolarity,
  EvidenceRole,
  PlayerConceptGameContributionComputation,
  PlayerConceptStateComputation,
  PlayerSkillGraphScope,
  SkillGraphAggregationResult,
  SkillGraphDecisionInput,
  SkillGraphEvidenceInput,
  SkillGraphGameInput,
  SkillGraphRunStatus,
  SkillGraphSelectedRunInput,
} from '@chess-intelligent/domain';

import type { Database, QueryClient } from './database';
import { dateOnly } from './date-values';

interface BuiltScope {
  cte: string;
  parameters: unknown[];
}

interface GameRow {
  game_id: string;
  focal_color: Color;
  content_status: 'METADATA_ONLY' | 'MOVES_AVAILABLE';
  played_at: string | Date | null;
}

interface DecisionRow {
  game_id: string;
  position_occurrence_id: string;
  occurrence_ply: number;
  classified: boolean;
  engine_backed: boolean;
}

interface SelectedRunRow {
  game_id: string;
  classification_run_id: string;
  selected_analysis_run_id: string | null;
  completed_at: string | Date;
}

interface EvidenceRow {
  id: string;
  classification_run_id: string;
  game_id: string;
  concept_stable_id: string;
  evidence_type_stable_id: string;
  evidence_role: EvidenceRole;
  polarity: EvidencePolarity;
  subject_kind: 'POSITION' | 'DECISION';
  subject_player_id: string | null;
  subject_color: Color;
  analysis_run_id: string | null;
  position_occurrence_id: string;
  occurrence_ply: number;
  evidence_date: string | Date;
  created_at: string | Date;
}

interface OntologyVersionRow {
  id: string;
}

interface SkillGraphRunRow {
  id: string;
  player_id: string;
  ontology_version: string;
  classifier_bundle_version: string;
  classifier_config_sha256: string;
  classification_selection_policy_version: string;
  skill_graph_policy_version: string;
  policy_config_sha256: string;
  input_snapshot_sha256: string;
  evidence_scope: PlayerSkillGraphScope | string;
  as_of_date: string | Date;
  status: SkillGraphRunStatus;
  selected_canonical_game_count: number;
  games_with_moves_count: number;
  selected_classification_run_count: number;
  decision_occurrence_count: number;
  classified_decision_count: number;
  engine_backed_decision_count: number;
  eligible_evidence_count: number;
  mastery_eligible_evidence_count: number;
  positive_mastery_evidence_count: number;
  negative_mastery_evidence_count: number;
  neutral_exposure_evidence_count: number;
  concept_state_count: number;
  started_at: string | Date;
  completed_at: string | Date | null;
}

interface ConceptStateRow {
  concept_stable_id: string;
  status: PlayerConceptStateComputation['status'];
  posterior_alpha: string | number;
  posterior_beta: string | number;
  posterior_mean: string | number | null;
  positive_evidence_mass: string | number;
  negative_evidence_mass: string | number;
  effective_evidence_mass: string | number;
  raw_positive_count: number;
  raw_negative_count: number;
  neutral_exposure_count: number;
  neutral_exposure_game_count: number;
  contextual_evidence_count: number;
  canonical_game_count: number;
  first_evidence_at: string | Date | null;
  last_evidence_at: string | Date | null;
  evidence_confidence: PlayerConceptStateComputation['evidenceConfidence'];
  mastery_band: PlayerConceptStateComputation['masteryBand'];
}

interface ContributionLineageRow {
  contribution_id: string;
  game_id: string;
  classification_run_id: string;
  raw_positive_weight: string | number;
  raw_negative_weight: string | number;
  capped_positive_weight: string | number;
  capped_negative_weight: string | number;
  recency_weight: string | number;
  effective_positive_weight: string | number;
  effective_negative_weight: string | number;
  evidence_date: string | Date;
  game_played_at: string | Date | null;
  game_event: string | null;
  game_result: string;
  opponent_name: string | null;
  concept_evidence_instance_id: string;
  historical_evidence_role: EvidenceRole;
  polarity: 'POSITIVE' | 'NEGATIVE';
  role_weight: string | number;
  pre_cap_contribution: string | number;
  position_occurrence_id: string;
  occurrence_ply: number;
  decision_ply: number;
  subject_player_id: string;
  subject_color: Color;
  classifier_id: string;
  classifier_version: string;
  rule_id: string;
  exact_history_sha256: string;
  analysis_run_id: string;
  evidence_type_stable_id: string;
  evidence_created_at: string | Date;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function json<Value>(value: Value | string): Value {
  return typeof value === 'string' ? (JSON.parse(value) as Value) : value;
}

function number(value: string | number): number {
  return Number(value);
}

export interface PlayerSkillEvidenceProjection {
  games: SkillGraphGameInput[];
  decisions: SkillGraphDecisionInput[];
  selectedRuns: SkillGraphSelectedRunInput[];
  evidence: SkillGraphEvidenceInput[];
}

export interface LoadPlayerSkillEvidenceInput {
  playerId: string;
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  scope: PlayerSkillGraphScope;
}

export interface PersistPlayerSkillGraphInput {
  playerId: string;
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  classificationSelectionPolicyVersion: string;
  skillGraphPolicyVersion: string;
  policyConfigSha256: string;
  inputSnapshotSha256: string;
  evidenceScope: PlayerSkillGraphScope;
  evidenceScopeSha256: string;
  asOfDate: string;
  selectedRuns: readonly SkillGraphSelectedRunInput[];
  aggregation: SkillGraphAggregationResult;
}

export interface PersistPlayerSkillGraphResult {
  runId: string;
  deduplicated: boolean;
}

export interface PlayerSkillGraphRunRecord {
  id: string;
  playerId: string;
  ontologyVersion: string;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  classificationSelectionPolicyVersion: string;
  skillGraphPolicyVersion: string;
  policyConfigSha256: string;
  inputSnapshotSha256: string;
  evidenceScope: PlayerSkillGraphScope;
  asOfDate: string;
  status: SkillGraphRunStatus;
  coverage: SkillGraphAggregationResult['coverage'];
  conceptStateCount: number;
  startedAt: string;
  completedAt: string | null;
}

export interface PersistedConceptLineage {
  contributionId: string;
  gameId: string;
  classificationRunId: string;
  game: {
    playedAt: string | null;
    event: string | null;
    result: string;
    opponentName: string | null;
  };
  weights: {
    rawPositive: number;
    rawNegative: number;
    cappedPositive: number;
    cappedNegative: number;
    recency: number;
    effectivePositive: number;
    effectiveNegative: number;
  };
  evidenceDate: string;
  evidence: Array<{
    conceptEvidenceInstanceId: string;
    evidenceTypeStableId: string;
    historicalEvidenceRole: EvidenceRole;
    polarity: 'POSITIVE' | 'NEGATIVE';
    roleWeight: number;
    preCapContribution: number;
    positionOccurrenceId: string;
    occurrencePly: number;
    decisionPly: number;
    subjectPlayerId: string;
    subjectColor: Color;
    classifierId: string;
    classifierVersion: string;
    ruleId: string;
    exactHistorySha256: string;
    analysisRunId: string;
    createdAt: string;
  }>;
}

export class PlayerSkillGraphRepository {
  constructor(private readonly database: Database) {}

  async loadEvidenceProjection(
    input: LoadPlayerSkillEvidenceInput,
  ): Promise<PlayerSkillEvidenceProjection> {
    const built = this.buildScope(input.playerId, input.scope);
    const gameParameters = [...built.parameters];
    const selection = this.selectedRunsCte(built, input);
    const [games, decisions, selectedRuns, evidence] = await Promise.all([
      this.database.query<GameRow>(
        `${built.cte}
         SELECT game_id, focal_color, content_status, played_at
         FROM filtered_games ORDER BY played_at NULLS LAST, game_id`,
        gameParameters,
      ),
      this.database.query<DecisionRow>(
        `${built.cte}, ${selection}
         SELECT filtered_games.game_id, occurrence.id AS position_occurrence_id,
                occurrence.ply AS occurrence_ply,
                EXISTS (
                  SELECT 1
                  FROM selected_runs selected
                  JOIN concept_evidence_instances evidence
                    ON evidence.classification_run_id = selected.classification_run_id
                   AND evidence.position_occurrence_id = occurrence.id
                  WHERE selected.game_id = filtered_games.game_id
                    AND evidence.subject_kind = 'DECISION'
                    AND evidence.subject_player_id = $1
                ) AS classified,
                EXISTS (
                  SELECT 1
                  FROM selected_runs selected
                  JOIN engine_position_states state
                    ON state.analysis_run_id = selected.selected_analysis_run_id
                   AND state.game_id = filtered_games.game_id
                   AND state.occurrence_ply = occurrence.ply
                  WHERE selected.game_id = filtered_games.game_id
                ) AS engine_backed
         FROM filtered_games
         JOIN position_occurrences occurrence ON occurrence.game_id = filtered_games.game_id
         JOIN positions position ON position.id = occurrence.position_id
         WHERE filtered_games.content_status = 'MOVES_AVAILABLE'
           AND position.side_to_move = filtered_games.focal_color
         ORDER BY filtered_games.game_id, occurrence.ply`,
        built.parameters,
      ),
      this.database.query<SelectedRunRow>(
        `${built.cte}, ${selection}
         SELECT game_id, classification_run_id, selected_analysis_run_id, completed_at
         FROM selected_runs ORDER BY game_id`,
        built.parameters,
      ),
      this.database.query<EvidenceRow>(
        `${built.cte}, ${selection}
         SELECT evidence.id, evidence.classification_run_id, evidence.game_id,
                evidence.concept_stable_id, evidence.evidence_type_stable_id,
                evidence.evidence_role, evidence.polarity, evidence.subject_kind,
                evidence.subject_player_id, evidence.subject_color, evidence.analysis_run_id,
                evidence.position_occurrence_id, evidence.occurrence_ply,
                COALESCE(filtered_games.played_at, evidence.created_at::date) AS evidence_date,
                evidence.created_at
         FROM selected_runs selected
         JOIN filtered_games ON filtered_games.game_id = selected.game_id
         JOIN concept_evidence_instances evidence
           ON evidence.classification_run_id = selected.classification_run_id
         WHERE evidence.subject_kind = 'POSITION'
            OR (evidence.subject_kind = 'DECISION' AND evidence.subject_player_id = $1)
         ORDER BY evidence.concept_stable_id, evidence.game_id,
                  evidence.occurrence_ply, evidence.id`,
        built.parameters,
      ),
    ]);

    return {
      games: games.rows.map((row) => ({
        gameId: row.game_id,
        focalColor: row.focal_color,
        contentStatus: row.content_status,
        playedAt: dateOnly(row.played_at),
      })),
      decisions: decisions.rows.map((row) => ({
        gameId: row.game_id,
        positionOccurrenceId: row.position_occurrence_id,
        occurrencePly: row.occurrence_ply,
        classified: row.classified,
        engineBacked: row.engine_backed,
      })),
      selectedRuns: selectedRuns.rows.map((row) => ({
        gameId: row.game_id,
        classificationRunId: row.classification_run_id,
        selectedAnalysisRunId: row.selected_analysis_run_id,
        completedAt: iso(row.completed_at)!,
      })),
      evidence: evidence.rows.map((row) => ({
        id: row.id,
        classificationRunId: row.classification_run_id,
        gameId: row.game_id,
        conceptStableId: row.concept_stable_id,
        evidenceTypeStableId: row.evidence_type_stable_id,
        evidenceRole: row.evidence_role,
        polarity: row.polarity,
        subjectKind: row.subject_kind,
        subjectPlayerId: row.subject_player_id,
        subjectColor: row.subject_color,
        analysisRunId: row.analysis_run_id,
        positionOccurrenceId: row.position_occurrence_id,
        occurrencePly: row.occurrence_ply,
        evidenceDate: dateOnly(row.evidence_date)!,
        createdAt: iso(row.created_at)!,
      })),
    };
  }

  async persistSuccessfulRun(
    input: PersistPlayerSkillGraphInput,
  ): Promise<PersistPlayerSkillGraphResult> {
    return this.database.transaction(async (client) => {
      const ontology = await client.query<OntologyVersionRow>(
        `SELECT id FROM ontology_versions WHERE version = $1 AND status = 'PUBLISHED'`,
        [input.ontologyVersion],
      );
      const ontologyVersionId = ontology.rows[0]?.id;
      if (!ontologyVersionId)
        throw new Error(`Published ontology ${input.ontologyVersion} not found.`);

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM player_skill_graph_runs
         WHERE player_id = $1 AND ontology_version = $2
           AND classifier_bundle_version = $3 AND classifier_config_sha256 = $4
           AND classification_selection_policy_version = $5
           AND skill_graph_policy_version = $6 AND policy_config_sha256 = $7
           AND evidence_scope_sha256 = $8 AND as_of_date = $9::date
           AND input_snapshot_sha256 = $10 AND status = 'SUCCEEDED'
         ORDER BY completed_at DESC, id DESC LIMIT 1`,
        [
          input.playerId,
          input.ontologyVersion,
          input.classifierBundleVersion,
          input.classifierConfigSha256,
          input.classificationSelectionPolicyVersion,
          input.skillGraphPolicyVersion,
          input.policyConfigSha256,
          input.evidenceScopeSha256,
          input.asOfDate,
          input.inputSnapshotSha256,
        ],
      );
      if (existing.rows[0]) return { runId: existing.rows[0].id, deduplicated: true };

      const runId = randomUUID();
      const coverage = input.aggregation.coverage;
      await client.query(
        `INSERT INTO player_skill_graph_runs (
           id, player_id, ontology_version_id, ontology_version,
           classifier_bundle_version, classifier_config_sha256,
           classification_selection_policy_version, skill_graph_policy_version,
           policy_config_sha256, input_snapshot_sha256,
           evidence_scope, evidence_scope_sha256, as_of_date, status,
           selected_canonical_game_count, games_with_moves_count,
           selected_classification_run_count, decision_occurrence_count,
           classified_decision_count, engine_backed_decision_count,
           eligible_evidence_count, mastery_eligible_evidence_count,
           positive_mastery_evidence_count, negative_mastery_evidence_count,
           neutral_exposure_evidence_count, concept_state_count, completed_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11::jsonb, $12, $13::date, 'SUCCEEDED', $14, $15, $16, $17, $18, $19,
           $20, $21, $22, $23, $24, $25, now()
         )`,
        [
          runId,
          input.playerId,
          ontologyVersionId,
          input.ontologyVersion,
          input.classifierBundleVersion,
          input.classifierConfigSha256,
          input.classificationSelectionPolicyVersion,
          input.skillGraphPolicyVersion,
          input.policyConfigSha256,
          input.inputSnapshotSha256,
          JSON.stringify(input.evidenceScope),
          input.evidenceScopeSha256,
          input.asOfDate,
          coverage.canonicalGames,
          coverage.gamesWithMoves,
          coverage.selectedClassificationRuns,
          coverage.decisionOccurrences,
          coverage.classifiedDecisions,
          coverage.engineBackedDecisions,
          coverage.eligibleEvidence,
          coverage.masteryEligibleEvidence,
          coverage.positiveMasteryEvidence,
          coverage.negativeMasteryEvidence,
          coverage.neutralExposureEvidence,
          input.aggregation.conceptStates.length,
        ],
      );

      for (const selected of input.selectedRuns) {
        await client.query(
          `INSERT INTO skill_graph_selected_classification_runs (
             skill_graph_run_id, game_id, classification_run_id, selected_analysis_run_id
           ) VALUES ($1, $2, $3, $4)`,
          [runId, selected.gameId, selected.classificationRunId, selected.selectedAnalysisRunId],
        );
      }
      for (const state of input.aggregation.conceptStates) {
        await this.insertState(client, runId, ontologyVersionId, state);
      }
      for (const contribution of input.aggregation.gameContributions) {
        await this.insertContribution(client, runId, contribution);
      }
      return { runId, deduplicated: false };
    });
  }

  async getRun(runId: string): Promise<PlayerSkillGraphRunRecord | null> {
    const result = await this.database.query<SkillGraphRunRow>(
      `SELECT * FROM player_skill_graph_runs WHERE id = $1 AND status = 'SUCCEEDED'`,
      [runId],
    );
    return result.rows[0] ? this.runRecord(result.rows[0]) : null;
  }

  async listPlayerRuns(playerId: string): Promise<PlayerSkillGraphRunRecord[]> {
    const result = await this.database.query<SkillGraphRunRow>(
      `SELECT * FROM player_skill_graph_runs
       WHERE player_id = $1 AND status = 'SUCCEEDED'
       ORDER BY as_of_date DESC, completed_at DESC, id DESC`,
      [playerId],
    );
    return result.rows.map((row) => this.runRecord(row));
  }

  async getConceptStates(runId: string): Promise<PlayerConceptStateComputation[]> {
    const result = await this.database.query<ConceptStateRow>(
      `SELECT * FROM player_concept_states
       WHERE skill_graph_run_id = $1 ORDER BY concept_stable_id`,
      [runId],
    );
    return result.rows.map((row) => this.conceptState(row));
  }

  async getSelectedRuns(runId: string): Promise<SkillGraphSelectedRunInput[]> {
    const result = await this.database.query<SelectedRunRow>(
      `SELECT selected.game_id, selected.classification_run_id,
              selected.selected_analysis_run_id, run.completed_at
       FROM skill_graph_selected_classification_runs selected
       JOIN concept_classification_runs run ON run.id = selected.classification_run_id
       WHERE selected.skill_graph_run_id = $1 ORDER BY selected.game_id`,
      [runId],
    );
    return result.rows.map((row) => ({
      gameId: row.game_id,
      classificationRunId: row.classification_run_id,
      selectedAnalysisRunId: row.selected_analysis_run_id,
      completedAt: iso(row.completed_at)!,
    }));
  }

  async getConceptLineage(
    runId: string,
    conceptStableId: string,
  ): Promise<PersistedConceptLineage[]> {
    const result = await this.database.query<ContributionLineageRow>(
      `SELECT contribution.id AS contribution_id, contribution.game_id,
              contribution.classification_run_id, contribution.raw_positive_weight,
              contribution.raw_negative_weight, contribution.capped_positive_weight,
              contribution.capped_negative_weight, contribution.recency_weight,
              contribution.effective_positive_weight, contribution.effective_negative_weight,
              contribution.evidence_date, game.played_at AS game_played_at,
              game.event AS game_event, game.result AS game_result,
              opponent.display_name AS opponent_name,
              lineage.concept_evidence_instance_id, lineage.historical_evidence_role,
              lineage.polarity, lineage.role_weight, lineage.pre_cap_contribution,
              evidence.position_occurrence_id, evidence.occurrence_ply, evidence.decision_ply,
              evidence.subject_player_id, evidence.subject_color, evidence.classifier_id,
              evidence.classifier_version, evidence.rule_id, evidence.exact_history_sha256,
              evidence.analysis_run_id, evidence.evidence_type_stable_id,
              evidence.created_at AS evidence_created_at
       FROM player_concept_game_contributions contribution
       JOIN player_skill_graph_runs graph ON graph.id = contribution.skill_graph_run_id
       JOIN games game ON game.id = contribution.game_id
       LEFT JOIN game_players opponent
         ON opponent.game_id = contribution.game_id AND opponent.player_id <> graph.player_id
       JOIN skill_graph_evidence_contributions lineage
         ON lineage.player_concept_game_contribution_id = contribution.id
       JOIN concept_evidence_instances evidence
         ON evidence.id = lineage.concept_evidence_instance_id
       WHERE contribution.skill_graph_run_id = $1
         AND contribution.concept_stable_id = $2
       ORDER BY contribution.evidence_date DESC, contribution.game_id,
                evidence.occurrence_ply, evidence.id`,
      [runId, conceptStableId],
    );
    const grouped = new Map<string, PersistedConceptLineage>();
    for (const row of result.rows) {
      let contribution = grouped.get(row.contribution_id);
      if (!contribution) {
        contribution = {
          contributionId: row.contribution_id,
          gameId: row.game_id,
          classificationRunId: row.classification_run_id,
          game: {
            playedAt: dateOnly(row.game_played_at),
            event: row.game_event,
            result: row.game_result,
            opponentName: row.opponent_name,
          },
          weights: {
            rawPositive: number(row.raw_positive_weight),
            rawNegative: number(row.raw_negative_weight),
            cappedPositive: number(row.capped_positive_weight),
            cappedNegative: number(row.capped_negative_weight),
            recency: number(row.recency_weight),
            effectivePositive: number(row.effective_positive_weight),
            effectiveNegative: number(row.effective_negative_weight),
          },
          evidenceDate: dateOnly(row.evidence_date)!,
          evidence: [],
        };
        grouped.set(row.contribution_id, contribution);
      }
      contribution.evidence.push({
        conceptEvidenceInstanceId: row.concept_evidence_instance_id,
        evidenceTypeStableId: row.evidence_type_stable_id,
        historicalEvidenceRole: row.historical_evidence_role,
        polarity: row.polarity,
        roleWeight: number(row.role_weight),
        preCapContribution: number(row.pre_cap_contribution),
        positionOccurrenceId: row.position_occurrence_id,
        occurrencePly: row.occurrence_ply,
        decisionPly: row.decision_ply,
        subjectPlayerId: row.subject_player_id,
        subjectColor: row.subject_color,
        classifierId: row.classifier_id,
        classifierVersion: row.classifier_version,
        ruleId: row.rule_id,
        exactHistorySha256: row.exact_history_sha256,
        analysisRunId: row.analysis_run_id,
        createdAt: iso(row.evidence_created_at)!,
      });
    }
    return [...grouped.values()];
  }

  private selectedRunsCte(built: BuiltScope, input: LoadPlayerSkillEvidenceInput): string {
    const ontology = this.addParameter(built, input.ontologyVersion);
    const bundle = this.addParameter(built, input.classifierBundleVersion);
    const config = this.addParameter(built, input.classifierConfigSha256);
    return `compatible_runs AS (
      SELECT run.id AS classification_run_id, run.game_id,
             run.selected_analysis_run_id, run.completed_at
      FROM concept_classification_runs run
      JOIN filtered_games ON filtered_games.game_id = run.game_id
      LEFT JOIN analysis_runs analysis ON analysis.id = run.selected_analysis_run_id
      WHERE run.status = 'SUCCEEDED'
        AND run.ontology_version = ${ontology}
        AND run.classifier_bundle_version = ${bundle}
        AND run.classifier_config_sha256 = ${config}
        AND (
          run.selected_analysis_run_id IS NULL OR
          (analysis.status = 'SUCCEEDED' AND analysis.profile = 'QUICK_V1'
            AND analysis.profile_version = 1)
        )
    ), selected_runs AS (
      SELECT DISTINCT ON (game_id)
             classification_run_id, game_id, selected_analysis_run_id, completed_at
      FROM compatible_runs
      ORDER BY game_id, (selected_analysis_run_id IS NOT NULL) DESC,
               completed_at DESC NULLS LAST, classification_run_id DESC
    )`;
  }

  private buildScope(playerId: string, scope: PlayerSkillGraphScope): BuiltScope {
    const built: BuiltScope = { cte: '', parameters: [] };
    const conditions = [`focal.player_id = ${this.addParameter(built, playerId)}`];
    this.addListCondition(built, conditions, 'game.game_context', scope.gameContexts);
    this.addListCondition(built, conditions, 'game.time_category', scope.timeCategories);
    if (scope.playedFrom) {
      conditions.push(`game.played_at >= ${this.addParameter(built, scope.playedFrom)}::date`);
    }
    if (scope.playedTo) {
      conditions.push(`game.played_at <= ${this.addParameter(built, scope.playedTo)}::date`);
    }
    if (scope.sourceTypes.length > 0) {
      const values = scope.sourceTypes.map((value) => this.addParameter(built, value)).join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM game_source_records source_record
        JOIN data_sources source ON source.id = source_record.data_source_id
        WHERE source_record.game_id = game.id AND source.type IN (${values})
      )`);
    }
    built.cte = `WITH filtered_games AS (
      SELECT game.id AS game_id, game.content_status, game.played_at,
             focal.color AS focal_color
      FROM game_players focal
      JOIN games game ON game.id = focal.game_id
      WHERE ${conditions.join('\n        AND ')}
    )`;
    return built;
  }

  private addParameter(built: BuiltScope, value: unknown): string {
    built.parameters.push(value);
    return `$${built.parameters.length}`;
  }

  private addListCondition(
    built: BuiltScope,
    conditions: string[],
    column: string,
    values: readonly string[],
  ): void {
    if (values.length === 0) return;
    conditions.push(
      `${column} IN (${values.map((value) => this.addParameter(built, value)).join(', ')})`,
    );
  }

  private async insertState(
    client: QueryClient,
    runId: string,
    ontologyVersionId: string,
    state: PlayerConceptStateComputation,
  ): Promise<void> {
    await client.query(
      `INSERT INTO player_concept_states (
         skill_graph_run_id, ontology_version_id, concept_stable_id, status,
         posterior_alpha, posterior_beta, posterior_mean,
         positive_evidence_mass, negative_evidence_mass, effective_evidence_mass,
         raw_positive_count, raw_negative_count, neutral_exposure_count,
         neutral_exposure_game_count, contextual_evidence_count, canonical_game_count,
         first_evidence_at, last_evidence_at, evidence_confidence, mastery_band
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17::date, $18::date, $19, $20
       )`,
      [
        runId,
        ontologyVersionId,
        state.conceptStableId,
        state.status,
        state.posteriorAlpha,
        state.posteriorBeta,
        state.posteriorMean,
        state.positiveEvidenceMass,
        state.negativeEvidenceMass,
        state.effectiveEvidenceMass,
        state.rawPositiveCount,
        state.rawNegativeCount,
        state.neutralExposureCount,
        state.neutralExposureGameCount,
        state.contextualEvidenceCount,
        state.canonicalGameCount,
        state.firstEvidenceAt,
        state.lastEvidenceAt,
        state.evidenceConfidence,
        state.masteryBand,
      ],
    );
  }

  private async insertContribution(
    client: QueryClient,
    runId: string,
    contribution: PlayerConceptGameContributionComputation,
  ): Promise<void> {
    if (contribution.evidence.length === 0) {
      throw new Error('An effective Skill Graph contribution must retain evidence lineage.');
    }
    const contributionId = randomUUID();
    await client.query(
      `INSERT INTO player_concept_game_contributions (
         id, skill_graph_run_id, concept_stable_id, game_id, classification_run_id,
         raw_positive_weight, raw_negative_weight, capped_positive_weight,
         capped_negative_weight, recency_weight, effective_positive_weight,
         effective_negative_weight, evidence_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date)`,
      [
        contributionId,
        runId,
        contribution.conceptStableId,
        contribution.gameId,
        contribution.classificationRunId,
        contribution.rawPositiveWeight,
        contribution.rawNegativeWeight,
        contribution.cappedPositiveWeight,
        contribution.cappedNegativeWeight,
        contribution.recencyWeight,
        contribution.effectivePositiveWeight,
        contribution.effectiveNegativeWeight,
        contribution.evidenceDate,
      ],
    );
    for (const evidence of contribution.evidence) {
      await client.query(
        `INSERT INTO skill_graph_evidence_contributions (
           id, skill_graph_run_id, player_concept_game_contribution_id,
           concept_evidence_instance_id, classification_run_id, concept_stable_id,
           game_id, historical_evidence_role, polarity, role_weight, pre_cap_contribution
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          randomUUID(),
          runId,
          contributionId,
          evidence.conceptEvidenceInstanceId,
          contribution.classificationRunId,
          contribution.conceptStableId,
          contribution.gameId,
          evidence.historicalEvidenceRole,
          evidence.polarity,
          evidence.roleWeight,
          evidence.preCapContribution,
        ],
      );
    }
  }

  private runRecord(row: SkillGraphRunRow): PlayerSkillGraphRunRecord {
    return {
      id: row.id,
      playerId: row.player_id,
      ontologyVersion: row.ontology_version,
      classifierBundleVersion: row.classifier_bundle_version,
      classifierConfigSha256: row.classifier_config_sha256,
      classificationSelectionPolicyVersion: row.classification_selection_policy_version,
      skillGraphPolicyVersion: row.skill_graph_policy_version,
      policyConfigSha256: row.policy_config_sha256,
      inputSnapshotSha256: row.input_snapshot_sha256,
      evidenceScope: json(row.evidence_scope),
      asOfDate: dateOnly(row.as_of_date)!,
      status: row.status,
      coverage: {
        canonicalGames: row.selected_canonical_game_count,
        gamesWithMoves: row.games_with_moves_count,
        selectedClassificationRuns: row.selected_classification_run_count,
        gamesWithSelectedClassificationRun: row.selected_classification_run_count,
        decisionOccurrences: row.decision_occurrence_count,
        classifiedDecisions: row.classified_decision_count,
        engineBackedDecisions: row.engine_backed_decision_count,
        eligibleEvidence: row.eligible_evidence_count,
        masteryEligibleEvidence: row.mastery_eligible_evidence_count,
        positiveMasteryEvidence: row.positive_mastery_evidence_count,
        negativeMasteryEvidence: row.negative_mastery_evidence_count,
        neutralExposureEvidence: row.neutral_exposure_evidence_count,
      },
      conceptStateCount: row.concept_state_count,
      startedAt: iso(row.started_at)!,
      completedAt: iso(row.completed_at),
    };
  }

  private conceptState(row: ConceptStateRow): PlayerConceptStateComputation {
    return {
      conceptStableId: row.concept_stable_id,
      status: row.status,
      posteriorAlpha: number(row.posterior_alpha),
      posteriorBeta: number(row.posterior_beta),
      posteriorMean: row.posterior_mean === null ? null : number(row.posterior_mean),
      positiveEvidenceMass: number(row.positive_evidence_mass),
      negativeEvidenceMass: number(row.negative_evidence_mass),
      effectiveEvidenceMass: number(row.effective_evidence_mass),
      rawPositiveCount: row.raw_positive_count,
      rawNegativeCount: row.raw_negative_count,
      neutralExposureCount: row.neutral_exposure_count,
      neutralExposureGameCount: row.neutral_exposure_game_count,
      contextualEvidenceCount: row.contextual_evidence_count,
      canonicalGameCount: row.canonical_game_count,
      firstEvidenceAt: dateOnly(row.first_evidence_at),
      lastEvidenceAt: dateOnly(row.last_evidence_at),
      evidenceConfidence: row.evidence_confidence,
      masteryBand: row.mastery_band,
    };
  }
}
