import { createHash, randomUUID } from 'node:crypto';

import {
  ANALYSIS_PROFILE_CONFIGURATIONS,
  CRITICAL_DETECTOR_VERSION,
  type AnalysisJobStatus,
  type AnalysisProfile,
  type AnalysisProfileName,
  type AnalysisRunStatus,
  type Color,
  type CriticalPositionDetection,
  type EngineIdentity,
  type EnginePrincipalVariation,
  type MateOutcome,
} from '@chess-intelligent/domain';

import type { Database, QueryClient } from './database';

export type AnalysisRepositoryErrorCode =
  | 'GAME_NOT_FOUND'
  | 'MOVES_REQUIRED'
  | 'GAME_TOO_LONG'
  | 'JOB_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'INVALID_ANALYSIS_STATE';

export class AnalysisRepositoryError extends Error {
  constructor(
    readonly code: AnalysisRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AnalysisRepositoryError';
  }
}

interface AnalysisJobRow {
  id: string;
  game_id: string;
  profile: AnalysisProfileName;
  profile_version: number;
  configuration_sha256: string;
  status: AnalysisJobStatus;
  attempt_count: number;
  maximum_attempts: number;
  claimed_by: string | null;
  requested_reanalysis: boolean;
  total_occurrences: number;
  processed_occurrences: number;
  successful_run_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
}

interface AnalysisRunRow {
  id: string;
  job_id: string;
  game_id: string;
  attempt_number: number;
  status: AnalysisRunStatus;
  engine_family: EngineIdentity['family'];
  engine_reported_name: string;
  engine_reported_version: string | null;
  binary_sha256: string;
  profile: AnalysisProfileName;
  profile_version: number;
  engine_options: Record<string, unknown> | string;
  search_limit_type: AnalysisProfile['engine']['searchLimit']['type'];
  search_limit_value: string | number;
  multipv: number;
  detector_version: string;
  started_at: string | Date;
  completed_at: string | Date | null;
  error_code: string | null;
  error_message: string | null;
}

interface AnalysisGameRow {
  id: string;
  content_status: string;
  initial_fen: string | null;
  move_count: string | number;
}

interface OccurrenceRow {
  ply: number;
  position_id: string;
  side_to_move: Color;
  played_move_uci: string;
}

interface StateRow {
  id: string;
  occurrence_ply: number;
  normalized_position_id: string;
  initial_fen: string;
  history_uci: string[] | string;
  history_sha256: string;
  side_to_move: Color;
  mover: Color;
  played_move_uci: string;
  best_move_uci: string;
  centipawn_loss: number | null;
  mate_outcome: MateOutcome;
}

interface EvaluationRow {
  id: string;
  engine_position_state_id: string;
  role: 'MULTIPV' | 'PLAYED_MOVE';
  pv_rank: number | null;
  score_kind: 'CENTIPAWN' | 'MATE';
  centipawns: number | null;
  mate_in: number | null;
  root_move_uci: string;
  pv_uci: string[] | string;
  depth: number | null;
  seldepth: number | null;
  nodes: string | number | null;
  nps: string | number | null;
  time_ms: string | number | null;
  hashfull: number | null;
}

interface CriticalRow {
  occurrence_ply: number;
  severity: CriticalPositionDetection['severity'];
  reasons: CriticalPositionDetection['reasons'] | string;
  detector_version: string;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function json<Value>(value: Value | string): Value {
  return typeof value === 'string' ? (JSON.parse(value) as Value) : value;
}

function numberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function sanitizedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown analysis failure';
  return message.replaceAll(/(?:[A-Za-z]:)?[\\/][^\s]+/gu, '[path]').slice(0, 2000);
}

export interface AnalysisJobView {
  id: string;
  gameId: string;
  profile: AnalysisProfileName;
  profileVersion: number;
  status: AnalysisJobStatus;
  attemptCount: number;
  maximumAttempts: number;
  requestedReanalysis: boolean;
  progress: { processed: number; total: number };
  runId: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AnalysisRunSummary {
  id: string;
  gameId: string;
  profile: AnalysisProfileName;
  profileVersion: number;
  engineFamily: EngineIdentity['family'];
  engineReportedName: string;
  engineReportedVersion: string | null;
  binarySha256: string;
  completedAt: string;
}

export interface AnalysisEvaluationView {
  id: string;
  role: 'MULTIPV' | 'PLAYED_MOVE';
  pvRank: number | null;
  score:
    | { kind: 'CENTIPAWN'; centipawns: number; perspective: 'WHITE' }
    | { kind: 'MATE'; mateIn: number; perspective: 'WHITE' };
  rootMoveUci: string;
  pvUci: string[];
  search: {
    depth: number | null;
    seldepth: number | null;
    nodes: number | null;
    nps: number | null;
    timeMs: number | null;
    hashfull: number | null;
  };
}

export interface AnalysisRunView extends AnalysisRunSummary {
  jobId: string;
  status: 'SUCCEEDED';
  attemptNumber: number;
  configuration: {
    engineOptions: Record<string, unknown>;
    searchLimit: { type: AnalysisRunRow['search_limit_type']; value: number };
    multiPv: number;
    detectorVersion: string;
  };
  startedAt: string;
  positions: Array<{
    ply: number;
    normalizedPositionId: string;
    engineState: {
      initialFen: string;
      historyUci: string[];
      historySha256: string;
      sideToMove: Color;
    };
    mover: Color;
    playedMoveUci: string;
    bestMoveUci: string;
    centipawnLoss: number | null;
    mateOutcome: MateOutcome;
    multiPv: AnalysisEvaluationView[];
    playedMoveEvaluation: AnalysisEvaluationView;
    critical: {
      severity: CriticalPositionDetection['severity'];
      reasons: CriticalPositionDetection['reasons'];
      detectorVersion: string;
    } | null;
  }>;
}

function mapJob(row: AnalysisJobRow): AnalysisJobView {
  return {
    id: row.id,
    gameId: row.game_id,
    profile: row.profile,
    profileVersion: row.profile_version,
    status: row.status,
    attemptCount: row.attempt_count,
    maximumAttempts: row.maximum_attempts,
    requestedReanalysis: row.requested_reanalysis,
    progress: { processed: row.processed_occurrences, total: row.total_occurrences },
    runId: row.successful_run_id,
    error:
      row.error_code && row.error_message
        ? { code: row.error_code, message: row.error_message }
        : null,
    createdAt: iso(row.created_at)!,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
  };
}

export function analysisProfileConfigurationHash(profile: AnalysisProfile): string {
  return createHash('sha256').update(JSON.stringify(profile), 'utf8').digest('hex');
}

export interface ClaimedAnalysisJob extends AnalysisJobView {
  configurationSha256: string;
  claimedBy: string;
}

export interface AnalysisGameOccurrence {
  ply: number;
  normalizedPositionId: string;
  sideToMove: Color;
  playedMoveUci: string;
  historyUci: string[];
}

export interface AnalysisGame {
  gameId: string;
  initialFen: string;
  occurrences: AnalysisGameOccurrence[];
}

export interface PersistPositionAnalysisInput {
  gameId: string;
  ply: number;
  normalizedPositionId: string;
  initialFen: string;
  historyUci: readonly string[];
  historySha256: string;
  sideToMove: Color;
  playedMoveUci: string;
  bestMoveUci: string;
  multiPv: readonly EnginePrincipalVariation[];
  playedMoveEvaluation: EnginePrincipalVariation;
  centipawnLoss: number | null;
  mateOutcome: MateOutcome;
  critical: CriticalPositionDetection | null;
}

export class AnalysisRepository {
  constructor(private readonly database: Database) {}

  async requestJob(input: {
    gameId: string;
    profile: AnalysisProfileName;
  }): Promise<{ created: boolean; job: AnalysisJobView }> {
    const profile = ANALYSIS_PROFILE_CONFIGURATIONS[input.profile];
    const configurationSha256 = analysisProfileConfigurationHash(profile);

    return this.database.transaction(async (client) => {
      const games = await client.query<AnalysisGameRow>(
        `SELECT g.id, g.content_status, g.initial_fen, count(m.id) AS move_count
         FROM games g
         LEFT JOIN moves m ON m.game_id = g.id
         WHERE g.id = $1
         GROUP BY g.id`,
        [input.gameId],
      );
      const game = games.rows[0];
      if (!game) {
        throw new AnalysisRepositoryError('GAME_NOT_FOUND', 'No game was found for that ID.');
      }
      const moveCount = Number(game.move_count);
      if (game.content_status !== 'MOVES_AVAILABLE' || moveCount === 0 || !game.initial_fen) {
        throw new AnalysisRepositoryError(
          'MOVES_REQUIRED',
          'Engine analysis requires a canonical game with legal moves.',
        );
      }
      if (moveCount > profile.maximumGamePlies) {
        throw new AnalysisRepositoryError(
          'GAME_TOO_LONG',
          `QUICK_V1 accepts at most ${profile.maximumGamePlies} plies.`,
        );
      }

      const active = await client.query<AnalysisJobRow>(
        `SELECT * FROM analysis_jobs
         WHERE game_id = $1 AND profile = $2 AND profile_version = $3
           AND configuration_sha256 = $4 AND status IN ('PENDING', 'RUNNING')
         ORDER BY created_at LIMIT 1`,
        [input.gameId, profile.name, profile.version, configurationSha256],
      );
      if (active.rows[0]) return { created: false, job: mapJob(active.rows[0]) };

      const prior = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM analysis_runs WHERE game_id = $1 AND status = 'SUCCEEDED'
         ) AS exists`,
        [input.gameId],
      );
      const id = randomUUID();
      const inserted = await client.query<AnalysisJobRow>(
        `INSERT INTO analysis_jobs (
           id, game_id, profile, profile_version, configuration_sha256, status,
           requested_reanalysis, total_occurrences
         ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7)
         ON CONFLICT (game_id, profile, profile_version, configuration_sha256)
           WHERE status IN ('PENDING', 'RUNNING')
         DO NOTHING
         RETURNING *`,
        [
          id,
          input.gameId,
          profile.name,
          profile.version,
          configurationSha256,
          prior.rows[0]?.exists ?? false,
          moveCount,
        ],
      );
      const insertedRow = inserted.rows[0];
      if (insertedRow) return { created: true, job: mapJob(insertedRow) };
      const concurrent = await client.query<AnalysisJobRow>(
        `SELECT * FROM analysis_jobs
         WHERE game_id = $1 AND profile = $2 AND profile_version = $3
           AND configuration_sha256 = $4 AND status IN ('PENDING', 'RUNNING')
         ORDER BY created_at LIMIT 1`,
        [input.gameId, profile.name, profile.version, configurationSha256],
      );
      if (!concurrent.rows[0]) {
        throw new AnalysisRepositoryError(
          'INVALID_ANALYSIS_STATE',
          'The active analysis job could not be resolved after a concurrent request.',
        );
      }
      return { created: false, job: mapJob(concurrent.rows[0]) };
    });
  }

  async getJob(id: string): Promise<AnalysisJobView | null> {
    const result = await this.database.query<AnalysisJobRow>(
      'SELECT * FROM analysis_jobs WHERE id = $1',
      [id],
    );
    return result.rows[0] ? mapJob(result.rows[0]) : null;
  }

  async recoverStaleJobs(staleBefore: Date): Promise<number> {
    return this.database.transaction(async (client) => {
      await client.query(
        `UPDATE analysis_runs r
         SET status = 'FAILED', completed_at = now(), error_code = 'WORKER_HEARTBEAT_EXPIRED',
             error_message = 'The worker stopped updating this analysis attempt.'
         FROM analysis_jobs j
         WHERE r.job_id = j.id AND r.status = 'RUNNING' AND j.status = 'RUNNING'
           AND j.heartbeat_at < $1`,
        [staleBefore.toISOString()],
      );
      const recovered = await client.query<{ id: string }>(
        `UPDATE analysis_jobs
         SET status = CASE WHEN attempt_count < maximum_attempts THEN 'PENDING' ELSE 'FAILED' END,
             claimed_by = NULL, heartbeat_at = NULL,
             completed_at = CASE WHEN attempt_count < maximum_attempts THEN NULL ELSE now() END,
             error_code = 'WORKER_HEARTBEAT_EXPIRED',
             error_message = 'The worker stopped updating this analysis attempt.'
         WHERE status = 'RUNNING' AND heartbeat_at < $1
         RETURNING id`,
        [staleBefore.toISOString()],
      );
      return recovered.rowCount;
    });
  }

  async claimNext(workerId: string): Promise<ClaimedAnalysisJob | null> {
    const result = await this.database.query<AnalysisJobRow>(
      `WITH candidate AS (
         SELECT id FROM analysis_jobs
         WHERE status = 'PENDING'
         ORDER BY created_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE analysis_jobs job
       SET status = 'RUNNING', claimed_by = $1, attempt_count = attempt_count + 1,
           processed_occurrences = 0, started_at = COALESCE(started_at, now()),
           heartbeat_at = now(), completed_at = NULL, error_code = NULL, error_message = NULL
       FROM candidate
       WHERE job.id = candidate.id
       RETURNING job.*`,
      [workerId.slice(0, 200)],
    );
    const row = result.rows[0];
    return row
      ? { ...mapJob(row), configurationSha256: row.configuration_sha256, claimedBy: workerId }
      : null;
  }

  async loadGameForAnalysis(job: ClaimedAnalysisJob): Promise<AnalysisGame> {
    const gameResult = await this.database.query<{ id: string; initial_fen: string | null }>(
      `SELECT id, initial_fen FROM games
       WHERE id = $1 AND content_status = 'MOVES_AVAILABLE'`,
      [job.gameId],
    );
    const game = gameResult.rows[0];
    if (!game?.initial_fen) {
      throw new AnalysisRepositoryError('MOVES_REQUIRED', 'The claimed game no longer has moves.');
    }
    const occurrenceResult = await this.database.query<OccurrenceRow>(
      `SELECT po.ply, po.position_id, p.side_to_move, next_move.uci AS played_move_uci
       FROM position_occurrences po
       JOIN positions p ON p.id = po.position_id
       JOIN moves next_move ON next_move.id = po.next_move_id
       WHERE po.game_id = $1
       ORDER BY po.ply`,
      [job.gameId],
    );
    const history: string[] = [];
    const occurrences = occurrenceResult.rows.map((row) => {
      const occurrence: AnalysisGameOccurrence = {
        ply: row.ply,
        normalizedPositionId: row.position_id,
        sideToMove: row.side_to_move,
        playedMoveUci: row.played_move_uci,
        historyUci: [...history],
      };
      history.push(row.played_move_uci);
      return occurrence;
    });
    if (occurrences.length !== job.progress.total) {
      throw new AnalysisRepositoryError(
        'INVALID_ANALYSIS_STATE',
        'The game occurrence count changed after the job was requested.',
      );
    }
    return { gameId: game.id, initialFen: game.initial_fen, occurrences };
  }

  async createRun(
    job: ClaimedAnalysisJob,
    identity: EngineIdentity,
    profile: AnalysisProfile,
  ): Promise<string> {
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO analysis_runs (
         id, job_id, game_id, attempt_number, status, engine_family,
         engine_reported_name, engine_reported_version, binary_sha256,
         profile, profile_version, engine_options, search_limit_type,
         search_limit_value, multipv, detector_version
       ) VALUES ($1, $2, $3, $4, 'RUNNING', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        job.id,
        job.gameId,
        job.attemptCount,
        identity.family,
        identity.reportedName,
        identity.reportedVersion,
        identity.binarySha256,
        profile.name,
        profile.version,
        JSON.stringify({
          Threads: profile.engine.threads,
          Hash: profile.engine.hashMb,
          MultiPV: profile.engine.multiPv,
        }),
        profile.engine.searchLimit.type,
        profile.engine.searchLimit.value,
        profile.engine.multiPv,
        CRITICAL_DETECTOR_VERSION,
      ],
    );
    return id;
  }

  async persistPosition(
    jobId: string,
    runId: string,
    input: PersistPositionAnalysisInput,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const running = await client.query<{ id: string }>(
        `SELECT id FROM analysis_runs WHERE id = $1 AND job_id = $2 AND status = 'RUNNING' FOR UPDATE`,
        [runId, jobId],
      );
      if (!running.rows[0]) {
        throw new AnalysisRepositoryError(
          'INVALID_ANALYSIS_STATE',
          'The analysis run is not writable.',
        );
      }
      const stateId = randomUUID();
      await client.query(
        `INSERT INTO engine_position_states (
           id, analysis_run_id, game_id, occurrence_ply, normalized_position_id,
           initial_fen, history_uci, history_sha256, side_to_move
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          stateId,
          runId,
          input.gameId,
          input.ply,
          input.normalizedPositionId,
          input.initialFen,
          JSON.stringify(input.historyUci),
          input.historySha256,
          input.sideToMove,
        ],
      );

      let bestEvaluationId: string | null = null;
      for (const line of [...input.multiPv].sort((left, right) => left.pvRank - right.pvRank)) {
        const evaluationId = randomUUID();
        await this.insertEvaluation(client, runId, stateId, evaluationId, 'MULTIPV', line);
        if (line.pvRank === 1) bestEvaluationId = evaluationId;
      }
      if (!bestEvaluationId) {
        throw new AnalysisRepositoryError('INVALID_ANALYSIS_STATE', 'MultiPV rank 1 is required.');
      }
      const playedEvaluationId = randomUUID();
      await this.insertEvaluation(
        client,
        runId,
        stateId,
        playedEvaluationId,
        'PLAYED_MOVE',
        input.playedMoveEvaluation,
      );
      await client.query(
        `INSERT INTO move_engine_assessments (
           analysis_run_id, engine_position_state_id, game_id, occurrence_ply, mover,
           played_move_uci, best_move_uci, best_evaluation_id, played_evaluation_id,
           centipawn_loss, mate_outcome
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          runId,
          stateId,
          input.gameId,
          input.ply,
          input.sideToMove,
          input.playedMoveUci,
          input.bestMoveUci,
          bestEvaluationId,
          playedEvaluationId,
          input.centipawnLoss,
          input.mateOutcome,
        ],
      );
      if (input.critical) {
        await client.query(
          `INSERT INTO critical_positions (
             id, analysis_run_id, game_id, occurrence_ply, severity, reasons, detector_version
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            runId,
            input.gameId,
            input.ply,
            input.critical.severity,
            JSON.stringify(input.critical.reasons),
            input.critical.detectorVersion,
          ],
        );
      }
      await client.query(
        `UPDATE analysis_jobs
         SET processed_occurrences = processed_occurrences + 1, heartbeat_at = now()
         WHERE id = $1 AND status = 'RUNNING'`,
        [jobId],
      );
    });
  }

  private async insertEvaluation(
    client: QueryClient,
    runId: string,
    stateId: string,
    evaluationId: string,
    role: 'MULTIPV' | 'PLAYED_MOVE',
    line: EnginePrincipalVariation,
  ): Promise<void> {
    await client.query(
      `INSERT INTO engine_evaluations (
         id, analysis_run_id, engine_position_state_id, role, pv_rank, score_kind,
         centipawns, mate_in, root_move_uci, pv_uci, depth, seldepth, nodes, nps, time_ms, hashfull
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        evaluationId,
        runId,
        stateId,
        role,
        role === 'MULTIPV' ? line.pvRank : null,
        line.score.kind,
        line.score.kind === 'CENTIPAWN' ? line.score.centipawns : null,
        line.score.kind === 'MATE' ? line.score.mateIn : null,
        line.rootMoveUci,
        JSON.stringify(line.moves),
        line.depth,
        line.seldepth,
        line.nodes,
        line.nps,
        line.timeMs,
        line.hashfull,
      ],
    );
  }

  async succeed(jobId: string, runId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const run = await client.query<{ count: string | number }>(
        `SELECT count(*) AS count FROM engine_position_states WHERE analysis_run_id = $1`,
        [runId],
      );
      const job = await client.query<{ total_occurrences: number; processed_occurrences: number }>(
        `SELECT total_occurrences, processed_occurrences FROM analysis_jobs
         WHERE id = $1 AND status = 'RUNNING' FOR UPDATE`,
        [jobId],
      );
      const jobRow = job.rows[0];
      if (!jobRow || Number(run.rows[0]?.count ?? 0) !== jobRow.total_occurrences) {
        throw new AnalysisRepositoryError(
          'INVALID_ANALYSIS_STATE',
          'A run cannot succeed until every occurrence is persisted.',
        );
      }
      await client.query(
        `UPDATE analysis_runs SET status = 'SUCCEEDED', completed_at = now()
         WHERE id = $1 AND job_id = $2 AND status = 'RUNNING'`,
        [runId, jobId],
      );
      await client.query(
        `UPDATE analysis_jobs
         SET status = 'SUCCEEDED', successful_run_id = $2, completed_at = now(), heartbeat_at = NULL
         WHERE id = $1 AND status = 'RUNNING'`,
        [jobId, runId],
      );
    });
  }

  async fail(
    job: ClaimedAnalysisJob,
    runId: string | null,
    error: unknown,
    transient: boolean,
  ): Promise<'PENDING' | 'FAILED'> {
    const message = sanitizedMessage(error);
    const code = transient ? 'ENGINE_PROCESS_FAILURE' : 'ANALYSIS_FAILURE';
    const retry = transient && job.attemptCount < job.maximumAttempts;
    await this.database.transaction(async (client) => {
      if (runId) {
        await client.query(
          `UPDATE analysis_runs
           SET status = 'FAILED', completed_at = now(), error_code = $2, error_message = $3
           WHERE id = $1 AND status = 'RUNNING'`,
          [runId, code, message],
        );
      }
      await client.query(
        `UPDATE analysis_jobs
         SET status = $2, claimed_by = NULL, heartbeat_at = NULL,
             processed_occurrences = 0,
             completed_at = CASE WHEN $2 = 'FAILED' THEN now() ELSE NULL END,
             error_code = $3, error_message = $4
         WHERE id = $1 AND status = 'RUNNING'`,
        [job.id, retry ? 'PENDING' : 'FAILED', code, message],
      );
    });
    return retry ? 'PENDING' : 'FAILED';
  }

  async listSuccessfulRuns(gameId: string): Promise<AnalysisRunSummary[]> {
    const result = await this.database.query<AnalysisRunRow>(
      `SELECT * FROM analysis_runs
       WHERE game_id = $1 AND status = 'SUCCEEDED'
       ORDER BY completed_at DESC, id DESC`,
      [gameId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      profile: row.profile,
      profileVersion: row.profile_version,
      engineFamily: row.engine_family,
      engineReportedName: row.engine_reported_name,
      engineReportedVersion: row.engine_reported_version,
      binarySha256: row.binary_sha256,
      completedAt: iso(row.completed_at)!,
    }));
  }

  async getSuccessfulRun(runId: string): Promise<AnalysisRunView | null> {
    const runResult = await this.database.query<AnalysisRunRow>(
      `SELECT * FROM analysis_runs WHERE id = $1 AND status = 'SUCCEEDED'`,
      [runId],
    );
    const run = runResult.rows[0];
    if (!run || !run.completed_at) return null;
    const [stateResult, evaluationResult, criticalResult] = await Promise.all([
      this.database.query<StateRow>(
        `SELECT state.*, assessment.mover, assessment.played_move_uci,
                assessment.best_move_uci, assessment.centipawn_loss, assessment.mate_outcome
         FROM engine_position_states state
         JOIN move_engine_assessments assessment
           ON assessment.analysis_run_id = state.analysis_run_id
          AND assessment.engine_position_state_id = state.id
         WHERE state.analysis_run_id = $1
         ORDER BY state.occurrence_ply`,
        [runId],
      ),
      this.database.query<EvaluationRow>(
        `SELECT * FROM engine_evaluations
         WHERE analysis_run_id = $1
         ORDER BY engine_position_state_id, role, pv_rank`,
        [runId],
      ),
      this.database.query<CriticalRow>(
        `SELECT occurrence_ply, severity, reasons, detector_version
         FROM critical_positions WHERE analysis_run_id = $1`,
        [runId],
      ),
    ]);
    const evaluations = new Map<string, EvaluationRow[]>();
    for (const evaluation of evaluationResult.rows) {
      const group = evaluations.get(evaluation.engine_position_state_id) ?? [];
      group.push(evaluation);
      evaluations.set(evaluation.engine_position_state_id, group);
    }
    const critical = new Map(criticalResult.rows.map((row) => [row.occurrence_ply, row]));
    const mapEvaluation = (row: EvaluationRow): AnalysisEvaluationView => ({
      id: row.id,
      role: row.role,
      pvRank: row.pv_rank,
      score:
        row.score_kind === 'CENTIPAWN'
          ? { kind: 'CENTIPAWN', centipawns: row.centipawns!, perspective: 'WHITE' }
          : { kind: 'MATE', mateIn: row.mate_in!, perspective: 'WHITE' },
      rootMoveUci: row.root_move_uci,
      pvUci: json<string[]>(row.pv_uci),
      search: {
        depth: row.depth,
        seldepth: row.seldepth,
        nodes: numberOrNull(row.nodes),
        nps: numberOrNull(row.nps),
        timeMs: numberOrNull(row.time_ms),
        hashfull: row.hashfull,
      },
    });
    return {
      id: run.id,
      jobId: run.job_id,
      gameId: run.game_id,
      status: 'SUCCEEDED',
      attemptNumber: run.attempt_number,
      profile: run.profile,
      profileVersion: run.profile_version,
      engineFamily: run.engine_family,
      engineReportedName: run.engine_reported_name,
      engineReportedVersion: run.engine_reported_version,
      binarySha256: run.binary_sha256,
      configuration: {
        engineOptions: json<Record<string, unknown>>(run.engine_options),
        searchLimit: { type: run.search_limit_type, value: Number(run.search_limit_value) },
        multiPv: run.multipv,
        detectorVersion: run.detector_version,
      },
      startedAt: iso(run.started_at)!,
      completedAt: iso(run.completed_at)!,
      positions: stateResult.rows.map((state) => {
        const all = evaluations.get(state.id) ?? [];
        const played = all.find((evaluation) => evaluation.role === 'PLAYED_MOVE');
        if (!played) {
          throw new AnalysisRepositoryError(
            'INVALID_ANALYSIS_STATE',
            'A successful run is incomplete.',
          );
        }
        const criticalRow = critical.get(state.occurrence_ply);
        return {
          ply: state.occurrence_ply,
          normalizedPositionId: state.normalized_position_id,
          engineState: {
            initialFen: state.initial_fen,
            historyUci: json<string[]>(state.history_uci),
            historySha256: state.history_sha256,
            sideToMove: state.side_to_move,
          },
          mover: state.mover,
          playedMoveUci: state.played_move_uci,
          bestMoveUci: state.best_move_uci,
          centipawnLoss: state.centipawn_loss,
          mateOutcome: state.mate_outcome,
          multiPv: all
            .filter((evaluation) => evaluation.role === 'MULTIPV')
            .sort((left, right) => left.pv_rank! - right.pv_rank!)
            .map(mapEvaluation),
          playedMoveEvaluation: mapEvaluation(played),
          critical: criticalRow
            ? {
                severity: criticalRow.severity,
                reasons: json<CriticalPositionDetection['reasons']>(criticalRow.reasons),
                detectorVersion: criticalRow.detector_version,
              }
            : null,
        };
      }),
    };
  }
}
