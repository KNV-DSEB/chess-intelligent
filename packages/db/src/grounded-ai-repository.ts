import { randomUUID } from 'node:crypto';

import type {
  GroundedBriefAudience,
  GroundedBriefContext,
  GroundedBriefOutput,
} from '@chess-intelligent/domain';

import type { Database } from './database';

interface ArtifactRow {
  id: string;
  academy_id: string;
  student_profile_id: string;
  player_id: string;
  ontology_version: string;
  audience: GroundedBriefAudience;
  source_skill_graph_run_id: string;
  source_training_plan_run_id: string | null;
  context_version: string;
  prompt_version: string;
  artifact_version: string;
  provider: string;
  model: string;
  input_snapshot_sha256: string;
  input_snapshot: GroundedBriefContext | string;
  validated_output: GroundedBriefOutput | string;
  usage: Record<string, number> | string;
  latency_ms: number;
  created_at: string | Date;
}

export interface GroundedAiArtifactRecord {
  id: string;
  academyId: string;
  studentProfileId: string;
  playerId: string;
  ontologyVersion: string;
  audience: GroundedBriefAudience;
  sourceSkillGraphRunId: string;
  sourceTrainingPlanRunId: string | null;
  contextVersion: string;
  promptVersion: string;
  artifactVersion: string;
  provider: string;
  model: string;
  inputSnapshotSha256: string;
  inputSnapshot: GroundedBriefContext;
  validatedOutput: GroundedBriefOutput;
  usage: Record<string, number>;
  latencyMs: number;
  createdAt: string;
}

export interface CreateGroundedAiArtifactInput {
  academyId: string;
  studentProfileId: string;
  playerId: string;
  ontologyVersion: string;
  audience: GroundedBriefAudience;
  sourceSkillGraphRunId: string;
  sourceTrainingPlanRunId: string | null;
  contextVersion: string;
  promptVersion: string;
  artifactVersion: string;
  provider: string;
  model: string;
  inputSnapshotSha256: string;
  inputSnapshot: GroundedBriefContext;
  validatedOutput: GroundedBriefOutput;
  usage: Record<string, number>;
  latencyMs: number;
}

function json<T>(value: T | string): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}

function artifact(row: ArtifactRow): GroundedAiArtifactRecord {
  return {
    id: row.id,
    academyId: row.academy_id,
    studentProfileId: row.student_profile_id,
    playerId: row.player_id,
    ontologyVersion: row.ontology_version,
    audience: row.audience,
    sourceSkillGraphRunId: row.source_skill_graph_run_id,
    sourceTrainingPlanRunId: row.source_training_plan_run_id,
    contextVersion: row.context_version,
    promptVersion: row.prompt_version,
    artifactVersion: row.artifact_version,
    provider: row.provider,
    model: row.model,
    inputSnapshotSha256: row.input_snapshot_sha256,
    inputSnapshot: json(row.input_snapshot),
    validatedOutput: json(row.validated_output),
    usage: json(row.usage),
    latencyMs: row.latency_ms,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export class GroundedAiRepository {
  constructor(private readonly database: Database) {}

  async create(input: CreateGroundedAiArtifactInput): Promise<GroundedAiArtifactRecord> {
    const id = randomUUID();
    const result = await this.database.query<ArtifactRow>(
      `INSERT INTO grounded_ai_artifacts (
         id, academy_id, student_profile_id, player_id, ontology_version_id, ontology_version,
         artifact_type, artifact_version, audience, source_skill_graph_run_id,
         source_training_plan_run_id, context_version, prompt_version, provider, model,
         input_snapshot_sha256, input_snapshot, validated_output, usage, latency_ms
       ) SELECT
         $1, $2, $3, $4, ontology.id, $5, 'PLAYER_GROUNDED_BRIEF', $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18
       FROM ontology_versions ontology
       WHERE ontology.version = $5 AND ontology.status = 'PUBLISHED'
       RETURNING *`,
      [
        id,
        input.academyId,
        input.studentProfileId,
        input.playerId,
        input.ontologyVersion,
        input.artifactVersion,
        input.audience,
        input.sourceSkillGraphRunId,
        input.sourceTrainingPlanRunId,
        input.contextVersion,
        input.promptVersion,
        input.provider,
        input.model,
        input.inputSnapshotSha256,
        JSON.stringify(input.inputSnapshot),
        JSON.stringify(input.validatedOutput),
        JSON.stringify(input.usage),
        input.latencyMs,
      ],
    );
    if (!result.rows[0]) throw new Error('Pinned published ontology was not found.');
    return artifact(result.rows[0]);
  }

  async getForAcademy(
    academyId: string,
    studentProfileId: string,
    id: string,
  ): Promise<GroundedAiArtifactRecord | null> {
    const result = await this.database.query<ArtifactRow>(
      `SELECT * FROM grounded_ai_artifacts
       WHERE id = $1 AND academy_id = $2 AND student_profile_id = $3`,
      [id, academyId, studentProfileId],
    );
    return result.rows[0] ? artifact(result.rows[0]) : null;
  }
}
