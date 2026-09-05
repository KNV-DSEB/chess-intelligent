import { randomUUID } from 'node:crypto';

import type {
  Color,
  EvidenceRole,
  PlayerConceptStateComputation,
  TrainingAttemptResult,
  TrainingCandidateDecision,
  TrainingCandidateDisposition,
  TrainingCandidateReasonCode,
  TrainingCandidateType,
  TrainingEvidenceForMastery,
  TrainingPlanStatus,
} from '@chess-intelligent/domain';

import type { Database } from './database';
import { dateOnly } from './date-values';

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function json<Value>(value: Value | string): Value {
  return typeof value === 'string' ? (JSON.parse(value) as Value) : value;
}

interface OntologyVersionRow {
  id: string;
}

interface TrainingSourceRow {
  evidence_instance_id: string;
  concept_stable_id: string;
  evidence_role: EvidenceRole;
  polarity: 'POSITIVE' | 'NEGATIVE';
  subject_player_id: string;
  evidence_date: string | Date;
  source_game_id: string;
  source_occurrence_id: string;
  source_occurrence_ply: number;
  source_classification_run_id: string;
  source_analysis_run_id: string;
  exact_history_sha256: string;
  initial_fen: string;
  history_uci: string[] | string;
  position_fen: string;
  side_to_move: Color;
  played_move_uci: string;
  best_move_uci: string;
  facts: Record<string, unknown> | string;
  classifier_bundle_version: string;
  classifier_config_sha256: string;
  analysis_profile: string;
  analysis_profile_version: number;
}

export interface TrainingSourceMaterial {
  evidenceInstanceId: string;
  conceptStableId: string;
  evidenceRole: EvidenceRole;
  polarity: 'POSITIVE' | 'NEGATIVE';
  subjectPlayerId: string;
  evidenceDate: string;
  sourceGameId: string;
  sourceOccurrenceId: string;
  sourceOccurrencePly: number;
  sourceClassificationRunId: string;
  sourceAnalysisRunId: string;
  exactHistorySha256: string;
  initialFen: string;
  historyUci: string[];
  positionFen: string;
  sideToMove: Color;
  playedMoveUci: string;
  bestMoveUci: string;
  facts: Record<string, unknown>;
  classifierBundleVersion: string;
  classifierConfigSha256: string;
  analysisProfile: string;
  analysisProfileVersion: number;
}

interface PlanRow {
  id: string;
  player_id: string;
  skill_graph_run_id: string;
  ontology_version: string;
  training_candidate_policy_version: string;
  candidate_policy_config_sha256: string;
  training_item_source_policy_version: string;
  training_item_generator_version: string;
  item_generator_config_sha256: string;
  reveal_policy_version: string;
  cooldown_policy_version: string;
  max_items: number;
  status: TrainingPlanStatus;
  considered_concept_count: number;
  eligible_candidate_count: number;
  materialized_item_count: number;
  created_at: string | Date;
  completed_at: string | Date | null;
}

interface CandidateRow {
  id: string;
  training_plan_run_id: string;
  concept_stable_id: string;
  candidate_type: TrainingCandidateType;
  disposition: TrainingCandidateDisposition;
  skill_state_status: PlayerConceptStateComputation['status'];
  mastery_band: PlayerConceptStateComputation['masteryBand'];
  evidence_confidence: PlayerConceptStateComputation['evidenceConfidence'];
  prerequisite_status: TrainingCandidateDecision['prerequisiteStatus'];
  selected_source_evidence_id: string | null;
  reason_code: TrainingCandidateReasonCode;
  rank: number;
  created_at: string | Date;
}

interface ItemRow {
  id: string;
  training_plan_run_id: string;
  training_candidate_id: string;
  player_id: string;
  ontology_version: string;
  concept_stable_id: string;
  item_type: 'FIND_BEST_MOVE';
  training_mode: TrainingCandidateType;
  source_game_id: string;
  source_occurrence_id: string;
  source_occurrence_ply: number;
  source_evidence_instance_id: string;
  source_classification_run_id: string;
  source_analysis_run_id: string;
  exact_history_sha256: string;
  initial_fen: string;
  history_uci: string[] | string;
  position_fen: string;
  side_to_move: Color;
  accepted_move_ucis: string[] | string;
  generator_id: string;
  generator_version: string;
  generator_config_sha256: string;
  created_at: string | Date;
}

interface AttemptRow {
  id: string;
  training_item_id: string;
  player_id: string;
  submitted_move_uci: string;
  result: TrainingAttemptResult;
  started_at: string | Date | null;
  submitted_at: string | Date;
  duration_ms: number | null;
  attempt_number: number;
}

interface TrainingEvidenceRow {
  id: string;
  training_attempt_id: string;
  training_item_id: string;
  player_id: string;
  ontology_version: string;
  concept_stable_id: string;
  evidence_type_stable_id: 'training.attempt';
  resolved_evidence_role: EvidenceRole;
  polarity: 'POSITIVE' | 'NEGATIVE';
  training_mode: TrainingCandidateType;
  attempt_number: number;
  source_item_generator_version: string;
  created_at: string | Date;
}

export interface TrainingPlanRunRecord {
  id: string;
  playerId: string;
  skillGraphRunId: string;
  ontologyVersion: string;
  trainingCandidatePolicyVersion: string;
  candidatePolicyConfigSha256: string;
  trainingItemSourcePolicyVersion: string;
  trainingItemGeneratorVersion: string;
  itemGeneratorConfigSha256: string;
  revealPolicyVersion: string;
  cooldownPolicyVersion: string;
  maxItems: number;
  status: TrainingPlanStatus;
  consideredConceptCount: number;
  eligibleCandidateCount: number;
  materializedItemCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface TrainingCandidateRecord extends TrainingCandidateDecision {
  id: string;
  trainingPlanRunId: string;
  createdAt: string;
}

export interface TrainingItemRecord {
  id: string;
  trainingPlanRunId: string;
  trainingCandidateId: string;
  playerId: string;
  ontologyVersion: string;
  conceptStableId: string;
  itemType: 'FIND_BEST_MOVE';
  trainingMode: TrainingCandidateType;
  sourceGameId: string;
  sourceOccurrenceId: string;
  sourceOccurrencePly: number;
  sourceEvidenceInstanceId: string;
  sourceClassificationRunId: string;
  sourceAnalysisRunId: string;
  exactHistorySha256: string;
  initialFen: string;
  historyUci: string[];
  positionFen: string;
  sideToMove: Color;
  acceptedMoveUcis: string[];
  generatorId: string;
  generatorVersion: string;
  generatorConfigSha256: string;
  createdAt: string;
}

export interface TrainingAttemptRecord {
  id: string;
  trainingItemId: string;
  playerId: string;
  submittedMoveUci: string;
  result: TrainingAttemptResult;
  startedAt: string | null;
  submittedAt: string;
  durationMs: number | null;
  attemptNumber: number;
}

export interface TrainingEvidenceRecord {
  id: string;
  trainingAttemptId: string;
  trainingItemId: string;
  playerId: string;
  ontologyVersion: string;
  conceptStableId: string;
  evidenceTypeStableId: 'training.attempt';
  resolvedEvidenceRole: EvidenceRole;
  polarity: 'POSITIVE' | 'NEGATIVE';
  trainingMode: TrainingCandidateType;
  attemptNumber: number;
  sourceItemGeneratorVersion: string;
  createdAt: string;
}

export interface MaterializedTrainingItemInput {
  candidateConceptStableId: string;
  source: TrainingSourceMaterial;
  acceptedMoveUcis: string[];
}

export interface PersistTrainingPlanInput {
  playerId: string;
  skillGraphRunId: string;
  ontologyVersion: string;
  trainingCandidatePolicyVersion: string;
  candidatePolicyConfigSha256: string;
  trainingItemSourcePolicyVersion: string;
  trainingItemGeneratorVersion: string;
  itemGeneratorConfigSha256: string;
  revealPolicyVersion: string;
  cooldownPolicyVersion: string;
  maxItems: number;
  consideredConceptCount: number;
  candidates: readonly TrainingCandidateDecision[];
  items: readonly MaterializedTrainingItemInput[];
}

export interface PersistTrainingPlanResult {
  planId: string;
  deduplicated: boolean;
}

export class TrainingRepositoryError extends Error {
  constructor(
    readonly code:
      'TRAINING_ITEM_NOT_FOUND' | 'TRAINING_PLAYER_MISMATCH' | 'ONTOLOGY_TRAINING_POLICY_MISSING',
    message: string,
  ) {
    super(message);
    this.name = 'TrainingRepositoryError';
  }
}

export class TrainingRepository {
  constructor(private readonly database: Database) {}

  async loadSourceMaterials(input: {
    skillGraphRunId: string;
    playerId: string;
    ontologyVersion: string;
  }): Promise<TrainingSourceMaterial[]> {
    const result = await this.database.query<TrainingSourceRow>(
      `SELECT evidence.id AS evidence_instance_id, evidence.concept_stable_id,
              evidence.evidence_role, evidence.polarity, evidence.subject_player_id,
              COALESCE(game.played_at, evidence.created_at::date) AS evidence_date,
              evidence.game_id AS source_game_id,
              evidence.position_occurrence_id AS source_occurrence_id,
              evidence.occurrence_ply AS source_occurrence_ply,
              evidence.classification_run_id AS source_classification_run_id,
              evidence.analysis_run_id AS source_analysis_run_id,
              evidence.exact_history_sha256, state.initial_fen, state.history_uci,
              position.representative_fen AS position_fen, state.side_to_move,
              assessment.played_move_uci, assessment.best_move_uci, evidence.facts,
              classification.classifier_bundle_version,
              classification.classifier_config_sha256,
              analysis.profile AS analysis_profile,
              analysis.profile_version AS analysis_profile_version
       FROM skill_graph_selected_classification_runs selected
       JOIN player_skill_graph_runs graph ON graph.id = selected.skill_graph_run_id
       JOIN concept_classification_runs classification
         ON classification.id = selected.classification_run_id
       JOIN concept_evidence_instances evidence
         ON evidence.classification_run_id = selected.classification_run_id
        AND evidence.game_id = selected.game_id
       JOIN games game ON game.id = evidence.game_id
       JOIN position_occurrences occurrence ON occurrence.id = evidence.position_occurrence_id
       JOIN positions position ON position.id = occurrence.position_id
       JOIN analysis_runs analysis
         ON analysis.id = evidence.analysis_run_id AND analysis.game_id = evidence.game_id
        AND analysis.status = 'SUCCEEDED' AND analysis.profile = 'QUICK_V1'
        AND analysis.profile_version = 1
       JOIN engine_position_states state
         ON state.analysis_run_id = evidence.analysis_run_id
        AND state.game_id = evidence.game_id
        AND state.occurrence_ply = evidence.occurrence_ply
        AND state.history_sha256 = evidence.exact_history_sha256
       JOIN move_engine_assessments assessment
         ON assessment.analysis_run_id = state.analysis_run_id
        AND assessment.engine_position_state_id = state.id
       WHERE selected.skill_graph_run_id = $1
         AND graph.player_id = $2
         AND graph.ontology_version = $3
         AND evidence.ontology_version_id = graph.ontology_version_id
         AND evidence.subject_kind = 'DECISION'
         AND evidence.evidence_type_stable_id = 'decision.classification'
         AND evidence.polarity IN ('POSITIVE', 'NEGATIVE')
         AND (
           evidence.polarity = 'POSITIVE' OR
           (evidence.polarity = 'NEGATIVE' AND evidence.subject_player_id = $2 AND EXISTS (
             SELECT 1 FROM skill_graph_evidence_contributions lineage
             WHERE lineage.skill_graph_run_id = $1
               AND lineage.concept_evidence_instance_id = evidence.id
           ))
         )
       ORDER BY evidence.concept_stable_id, evidence.polarity,
                evidence_date DESC, evidence.id`,
      [input.skillGraphRunId, input.playerId, input.ontologyVersion],
    );
    return result.rows.map((row) => ({
      evidenceInstanceId: row.evidence_instance_id,
      conceptStableId: row.concept_stable_id,
      evidenceRole: row.evidence_role,
      polarity: row.polarity,
      subjectPlayerId: row.subject_player_id,
      evidenceDate: dateOnly(row.evidence_date)!,
      sourceGameId: row.source_game_id,
      sourceOccurrenceId: row.source_occurrence_id,
      sourceOccurrencePly: row.source_occurrence_ply,
      sourceClassificationRunId: row.source_classification_run_id,
      sourceAnalysisRunId: row.source_analysis_run_id,
      exactHistorySha256: row.exact_history_sha256,
      initialFen: row.initial_fen,
      historyUci: json(row.history_uci),
      positionFen: row.position_fen,
      sideToMove: row.side_to_move,
      playedMoveUci: row.played_move_uci,
      bestMoveUci: row.best_move_uci,
      facts: json(row.facts),
      classifierBundleVersion: row.classifier_bundle_version,
      classifierConfigSha256: row.classifier_config_sha256,
      analysisProfile: row.analysis_profile,
      analysisProfileVersion: row.analysis_profile_version,
    }));
  }

  async getRecentlyAttemptedSourceEvidenceIds(playerId: string): Promise<string[]> {
    const result = await this.database.query<{ source_evidence_instance_id: string }>(
      `SELECT DISTINCT item.source_evidence_instance_id
       FROM training_items item
       JOIN training_attempts attempt ON attempt.training_item_id = item.id
       WHERE item.player_id = $1
         AND attempt.submitted_at >= now() - INTERVAL '14 days'
       ORDER BY item.source_evidence_instance_id`,
      [playerId],
    );
    return result.rows.map((row) => row.source_evidence_instance_id);
  }

  async persistSuccessfulPlan(input: PersistTrainingPlanInput): Promise<PersistTrainingPlanResult> {
    return this.database.transaction(async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM training_plan_runs
         WHERE skill_graph_run_id = $1
           AND training_candidate_policy_version = $2
           AND candidate_policy_config_sha256 = $3
           AND training_item_source_policy_version = $4
           AND training_item_generator_version = $5
           AND item_generator_config_sha256 = $6
           AND reveal_policy_version = $7 AND cooldown_policy_version = $8
           AND max_items = $9 AND status = 'SUCCEEDED'
         LIMIT 1`,
        [
          input.skillGraphRunId,
          input.trainingCandidatePolicyVersion,
          input.candidatePolicyConfigSha256,
          input.trainingItemSourcePolicyVersion,
          input.trainingItemGeneratorVersion,
          input.itemGeneratorConfigSha256,
          input.revealPolicyVersion,
          input.cooldownPolicyVersion,
          input.maxItems,
        ],
      );
      if (existing.rows[0]) return { planId: existing.rows[0].id, deduplicated: true };

      const ontology = await client.query<OntologyVersionRow>(
        `SELECT id FROM ontology_versions WHERE version = $1 AND status = 'PUBLISHED'`,
        [input.ontologyVersion],
      );
      const ontologyVersionId = ontology.rows[0]?.id;
      if (!ontologyVersionId)
        throw new Error(`Published ontology ${input.ontologyVersion} missing.`);
      const planId = randomUUID();
      const eligible = input.candidates.filter((candidate) => candidate.disposition === 'ELIGIBLE');
      await client.query(
        `INSERT INTO training_plan_runs (
           id, player_id, skill_graph_run_id, ontology_version_id, ontology_version,
           training_candidate_policy_version, candidate_policy_config_sha256,
           training_item_source_policy_version, training_item_generator_version,
           item_generator_config_sha256, reveal_policy_version, cooldown_policy_version,
           max_items, status, considered_concept_count, eligible_candidate_count,
           materialized_item_count, completed_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, 'SUCCEEDED', $14, $15, $16, now()
         )`,
        [
          planId,
          input.playerId,
          input.skillGraphRunId,
          ontologyVersionId,
          input.ontologyVersion,
          input.trainingCandidatePolicyVersion,
          input.candidatePolicyConfigSha256,
          input.trainingItemSourcePolicyVersion,
          input.trainingItemGeneratorVersion,
          input.itemGeneratorConfigSha256,
          input.revealPolicyVersion,
          input.cooldownPolicyVersion,
          input.maxItems,
          input.consideredConceptCount,
          eligible.length,
          input.items.length,
        ],
      );

      const candidatesByConcept = new Map<
        string,
        { id: string; decision: TrainingCandidateDecision }
      >();
      for (const decision of input.candidates) {
        const candidateId = randomUUID();
        candidatesByConcept.set(decision.conceptStableId, { id: candidateId, decision });
        await client.query(
          `INSERT INTO training_candidates (
             id, training_plan_run_id, ontology_version_id, ontology_version,
             concept_stable_id, candidate_type, disposition, skill_state_status,
             mastery_band, evidence_confidence, prerequisite_status,
             selected_source_evidence_id, reason_code, rank
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            candidateId,
            planId,
            ontologyVersionId,
            input.ontologyVersion,
            decision.conceptStableId,
            decision.candidateType,
            decision.disposition,
            decision.skillStateStatus,
            decision.masteryBand,
            decision.evidenceConfidence,
            decision.prerequisiteStatus,
            decision.selectedSourceEvidenceId,
            decision.reasonCode,
            decision.rank,
          ],
        );
      }

      for (const item of input.items) {
        const candidate = candidatesByConcept.get(item.candidateConceptStableId);
        if (!candidate || candidate.decision.disposition !== 'ELIGIBLE') {
          throw new Error(`No eligible candidate exists for ${item.candidateConceptStableId}.`);
        }
        await client.query(
          `INSERT INTO training_items (
             id, training_plan_run_id, training_candidate_id, player_id,
             ontology_version_id, ontology_version, concept_stable_id,
             item_type, training_mode, source_game_id, source_occurrence_id,
             source_occurrence_ply, source_evidence_instance_id,
             source_classification_run_id, source_analysis_run_id,
             exact_history_sha256, initial_fen, history_uci, position_fen, side_to_move,
             accepted_move_ucis, generator_id, generator_version, generator_config_sha256
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 'FIND_BEST_MOVE', $8, $9, $10, $11,
             $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20::jsonb, $21, $22, $23
           )`,
          [
            randomUUID(),
            planId,
            candidate.id,
            input.playerId,
            ontologyVersionId,
            input.ontologyVersion,
            item.candidateConceptStableId,
            candidate.decision.candidateType,
            item.source.sourceGameId,
            item.source.sourceOccurrenceId,
            item.source.sourceOccurrencePly,
            item.source.evidenceInstanceId,
            item.source.sourceClassificationRunId,
            item.source.sourceAnalysisRunId,
            item.source.exactHistorySha256,
            item.source.initialFen,
            JSON.stringify(item.source.historyUci),
            item.source.positionFen,
            item.source.sideToMove,
            JSON.stringify(item.acceptedMoveUcis),
            'TACTICAL_TRAINING_ITEM_GENERATOR',
            input.trainingItemGeneratorVersion,
            input.itemGeneratorConfigSha256,
          ],
        );
      }
      return { planId, deduplicated: false };
    });
  }

  async getPlan(planId: string): Promise<TrainingPlanRunRecord | null> {
    const result = await this.database.query<PlanRow>(
      `SELECT * FROM training_plan_runs WHERE id = $1 AND status = 'SUCCEEDED'`,
      [planId],
    );
    return result.rows[0] ? this.plan(result.rows[0]) : null;
  }

  async getCandidates(planId: string): Promise<TrainingCandidateRecord[]> {
    const result = await this.database.query<CandidateRow>(
      `SELECT * FROM training_candidates WHERE training_plan_run_id = $1 ORDER BY rank`,
      [planId],
    );
    return result.rows.map((row) => this.candidate(row));
  }

  async getPlanItems(planId: string): Promise<TrainingItemRecord[]> {
    const result = await this.database.query<ItemRow>(
      `SELECT * FROM training_items WHERE training_plan_run_id = $1 ORDER BY created_at, id`,
      [planId],
    );
    return result.rows.map((row) => this.item(row));
  }

  async getItem(itemId: string): Promise<TrainingItemRecord | null> {
    const result = await this.database.query<ItemRow>(
      `SELECT * FROM training_items WHERE id = $1`,
      [itemId],
    );
    return result.rows[0] ? this.item(result.rows[0]) : null;
  }

  async getItemAttempts(itemId: string): Promise<TrainingAttemptRecord[]> {
    const result = await this.database.query<AttemptRow>(
      `SELECT * FROM training_attempts WHERE training_item_id = $1 ORDER BY attempt_number`,
      [itemId],
    );
    return result.rows.map((row) => this.attempt(row));
  }

  async submitAttempt(input: {
    trainingItemId: string;
    playerId: string;
    submittedMoveUci: string;
    startedAt?: string | null | undefined;
    durationMs?: number | null | undefined;
  }): Promise<{ attempt: TrainingAttemptRecord; evidence: TrainingEvidenceRecord }> {
    return this.database.transaction(async (client) => {
      const itemResult = await client.query<ItemRow>(
        `SELECT * FROM training_items WHERE id = $1 FOR UPDATE`,
        [input.trainingItemId],
      );
      const item = itemResult.rows[0];
      if (!item) {
        throw new TrainingRepositoryError(
          'TRAINING_ITEM_NOT_FOUND',
          `Training item ${input.trainingItemId} does not exist.`,
        );
      }
      if (item.player_id !== input.playerId) {
        throw new TrainingRepositoryError(
          'TRAINING_PLAYER_MISMATCH',
          'The submitted Player does not own this training item.',
        );
      }
      const role = await client.query<{ evidence_role: EvidenceRole }>(
        `SELECT policy.evidence_role
         FROM ontology_versions ontology
         JOIN concept_evidence_policies policy ON policy.ontology_version_id = ontology.id
         JOIN evidence_type_definitions evidence_type
           ON evidence_type.ontology_version_id = ontology.id
          AND evidence_type.stable_id = policy.evidence_type_stable_id
         WHERE ontology.version = $1 AND ontology.status = 'PUBLISHED'
           AND policy.concept_stable_id = $2
           AND policy.evidence_type_stable_id = 'training.attempt'
           AND evidence_type.allowed_polarities @> $3::jsonb`,
        [item.ontology_version, item.concept_stable_id, JSON.stringify(['POSITIVE', 'NEGATIVE'])],
      );
      const resolvedRole = role.rows[0]?.evidence_role;
      if (!resolvedRole) {
        throw new TrainingRepositoryError(
          'ONTOLOGY_TRAINING_POLICY_MISSING',
          `Ontology ${item.ontology_version} does not allow training.attempt for ${item.concept_stable_id}.`,
        );
      }
      const count = await client.query<{ next_attempt: number }>(
        `SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS next_attempt
         FROM training_attempts WHERE training_item_id = $1`,
        [item.id],
      );
      const attemptNumber = count.rows[0]!.next_attempt;
      const result: TrainingAttemptResult = json<string[]>(item.accepted_move_ucis).includes(
        input.submittedMoveUci,
      )
        ? 'CORRECT'
        : 'INCORRECT';
      const polarity = result === 'CORRECT' ? 'POSITIVE' : 'NEGATIVE';
      const attemptId = randomUUID();
      const attempt = await client.query<AttemptRow>(
        `INSERT INTO training_attempts (
           id, training_item_id, player_id, submitted_move_uci, result,
           started_at, duration_ms, attempt_number
         ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8)
         RETURNING *`,
        [
          attemptId,
          item.id,
          input.playerId,
          input.submittedMoveUci,
          result,
          input.startedAt ?? null,
          input.durationMs ?? null,
          attemptNumber,
        ],
      );
      const ontology = await client.query<OntologyVersionRow>(
        `SELECT id FROM ontology_versions WHERE version = $1 AND status = 'PUBLISHED'`,
        [item.ontology_version],
      );
      const evidence = await client.query<TrainingEvidenceRow>(
        `INSERT INTO training_evidence_instances (
           id, training_attempt_id, training_item_id, player_id,
           ontology_version_id, ontology_version, concept_stable_id,
           evidence_type_stable_id, resolved_evidence_role, polarity,
           training_mode, attempt_number, source_item_generator_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'training.attempt', $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          randomUUID(),
          attemptId,
          item.id,
          item.player_id,
          ontology.rows[0]!.id,
          item.ontology_version,
          item.concept_stable_id,
          resolvedRole,
          polarity,
          item.training_mode,
          attemptNumber,
          item.generator_version,
        ],
      );
      return {
        attempt: this.attempt(attempt.rows[0]!),
        evidence: this.evidence(evidence.rows[0]!),
      };
    });
  }

  async getAttempt(attemptId: string): Promise<{
    attempt: TrainingAttemptRecord;
    evidence: TrainingEvidenceRecord;
    item: TrainingItemRecord;
  } | null> {
    const attempt = await this.database.query<AttemptRow>(
      `SELECT * FROM training_attempts WHERE id = $1`,
      [attemptId],
    );
    const row = attempt.rows[0];
    if (!row) return null;
    const [evidence, item] = await Promise.all([
      this.database.query<TrainingEvidenceRow>(
        `SELECT * FROM training_evidence_instances WHERE training_attempt_id = $1`,
        [attemptId],
      ),
      this.database.query<ItemRow>(`SELECT * FROM training_items WHERE id = $1`, [
        row.training_item_id,
      ]),
    ]);
    return {
      attempt: this.attempt(row),
      evidence: this.evidence(evidence.rows[0]!),
      item: this.item(item.rows[0]!),
    };
  }

  async loadTrainingEvidenceForSkillGraph(input: {
    playerId: string;
    ontologyVersion: string;
    asOfDate: string;
  }): Promise<TrainingEvidenceForMastery[]> {
    const result = await this.database.query<TrainingEvidenceRow & { submitted_at: string | Date }>(
      `SELECT evidence.*, attempt.submitted_at
       FROM training_evidence_instances evidence
       JOIN training_attempts attempt ON attempt.id = evidence.training_attempt_id
       WHERE evidence.player_id = $1 AND evidence.ontology_version = $2
         AND attempt.submitted_at < ($3::date + INTERVAL '1 day')
       ORDER BY evidence.concept_stable_id, evidence.training_item_id,
                evidence.attempt_number, attempt.submitted_at, evidence.id`,
      [input.playerId, input.ontologyVersion, input.asOfDate],
    );
    return result.rows.map((row) => ({
      id: row.id,
      trainingAttemptId: row.training_attempt_id,
      trainingItemId: row.training_item_id,
      playerId: row.player_id,
      ontologyVersion: row.ontology_version,
      conceptStableId: row.concept_stable_id,
      evidenceRole: row.resolved_evidence_role,
      polarity: row.polarity,
      trainingMode: row.training_mode,
      attemptNumber: row.attempt_number,
      submittedAt: iso(row.submitted_at)!,
    }));
  }

  private plan(row: PlanRow): TrainingPlanRunRecord {
    return {
      id: row.id,
      playerId: row.player_id,
      skillGraphRunId: row.skill_graph_run_id,
      ontologyVersion: row.ontology_version,
      trainingCandidatePolicyVersion: row.training_candidate_policy_version,
      candidatePolicyConfigSha256: row.candidate_policy_config_sha256,
      trainingItemSourcePolicyVersion: row.training_item_source_policy_version,
      trainingItemGeneratorVersion: row.training_item_generator_version,
      itemGeneratorConfigSha256: row.item_generator_config_sha256,
      revealPolicyVersion: row.reveal_policy_version,
      cooldownPolicyVersion: row.cooldown_policy_version,
      maxItems: row.max_items,
      status: row.status,
      consideredConceptCount: row.considered_concept_count,
      eligibleCandidateCount: row.eligible_candidate_count,
      materializedItemCount: row.materialized_item_count,
      createdAt: iso(row.created_at)!,
      completedAt: iso(row.completed_at),
    };
  }

  private candidate(row: CandidateRow): TrainingCandidateRecord {
    return {
      id: row.id,
      trainingPlanRunId: row.training_plan_run_id,
      conceptStableId: row.concept_stable_id,
      candidateType: row.candidate_type,
      disposition: row.disposition,
      skillStateStatus: row.skill_state_status,
      masteryBand: row.mastery_band,
      evidenceConfidence: row.evidence_confidence,
      prerequisiteStatus: row.prerequisite_status,
      selectedSourceEvidenceId: row.selected_source_evidence_id,
      reasonCode: row.reason_code,
      rank: row.rank,
      createdAt: iso(row.created_at)!,
    };
  }

  private item(row: ItemRow): TrainingItemRecord {
    return {
      id: row.id,
      trainingPlanRunId: row.training_plan_run_id,
      trainingCandidateId: row.training_candidate_id,
      playerId: row.player_id,
      ontologyVersion: row.ontology_version,
      conceptStableId: row.concept_stable_id,
      itemType: row.item_type,
      trainingMode: row.training_mode,
      sourceGameId: row.source_game_id,
      sourceOccurrenceId: row.source_occurrence_id,
      sourceOccurrencePly: row.source_occurrence_ply,
      sourceEvidenceInstanceId: row.source_evidence_instance_id,
      sourceClassificationRunId: row.source_classification_run_id,
      sourceAnalysisRunId: row.source_analysis_run_id,
      exactHistorySha256: row.exact_history_sha256,
      initialFen: row.initial_fen,
      historyUci: json(row.history_uci),
      positionFen: row.position_fen,
      sideToMove: row.side_to_move,
      acceptedMoveUcis: json(row.accepted_move_ucis),
      generatorId: row.generator_id,
      generatorVersion: row.generator_version,
      generatorConfigSha256: row.generator_config_sha256,
      createdAt: iso(row.created_at)!,
    };
  }

  private attempt(row: AttemptRow): TrainingAttemptRecord {
    return {
      id: row.id,
      trainingItemId: row.training_item_id,
      playerId: row.player_id,
      submittedMoveUci: row.submitted_move_uci,
      result: row.result,
      startedAt: iso(row.started_at),
      submittedAt: iso(row.submitted_at)!,
      durationMs: row.duration_ms,
      attemptNumber: row.attempt_number,
    };
  }

  private evidence(row: TrainingEvidenceRow): TrainingEvidenceRecord {
    return {
      id: row.id,
      trainingAttemptId: row.training_attempt_id,
      trainingItemId: row.training_item_id,
      playerId: row.player_id,
      ontologyVersion: row.ontology_version,
      conceptStableId: row.concept_stable_id,
      evidenceTypeStableId: row.evidence_type_stable_id,
      resolvedEvidenceRole: row.resolved_evidence_role,
      polarity: row.polarity,
      trainingMode: row.training_mode,
      attemptNumber: row.attempt_number,
      sourceItemGeneratorVersion: row.source_item_generator_version,
      createdAt: iso(row.created_at)!,
    };
  }
}
