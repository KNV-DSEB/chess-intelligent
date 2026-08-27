import type {
  AnalysisProfileName,
  Color,
  CriticalPositionReason,
  DataSourceType,
  EngineScore,
  GameContext,
  MateOutcome,
  PlayerDossierFilters,
  PlayerGameFact,
  SelectedEngineRunEvidence,
  TimeCategory,
} from '@chess-intelligent/domain';

import type { Database } from './database';
import { dateOnly } from './date-values';

interface GameFactRow {
  game_id: string;
  focal_color: Color;
  focal_rating: number | null;
  opponent_name: string;
  opponent_rating: number | null;
  event: string | null;
  played_at: string | Date | null;
  result: string;
  game_context: GameContext;
  time_category: TimeCategory;
  content_status: 'METADATA_ONLY' | 'MOVES_AVAILABLE';
  move_count: string | number;
  king_side_castle: boolean;
  queen_side_castle: boolean;
  queen_trade_ply: string | number | null;
  source_types: DataSourceType[] | null;
}

interface EngineObservationRow {
  run_id: string;
  game_id: string;
  completed_at: string | Date;
  engine_family: 'STOCKFISH' | 'FAKE';
  engine_reported_name: string;
  engine_reported_version: string | null;
  binary_sha256: string;
  profile: AnalysisProfileName;
  profile_version: number;
  engine_options: Record<string, unknown> | string;
  search_limit_type: 'DEPTH' | 'NODES' | 'MOVETIME';
  search_limit_value: string | number;
  multipv: number;
  detector_version: string;
  started_at: string | Date;
  focal_color: Color;
  opponent_name: string;
  opponent_rating: number | null;
  event: string | null;
  played_at: string | Date | null;
  result: string;
  occurrence_ply: number;
  mover: Color;
  representative_fen: string;
  centipawn_loss: number | null;
  mate_outcome: MateOutcome;
  score_kind: 'CENTIPAWN' | 'MATE';
  centipawns: number | null;
  mate_in: number | null;
  critical_reasons: CriticalPositionReason[] | string | null;
}

export interface RawPlayerEngineObservation {
  run: SelectedEngineRunEvidence;
  gameId: string;
  focalColor: Color;
  opponentName: string;
  opponentRating: number | null;
  event: string | null;
  playedAt: string | null;
  result: string;
  occurrencePly: number;
  mover: Color;
  representativeFen: string;
  centipawnLoss: number | null;
  mateOutcome: MateOutcome;
  bestScoreWhite: EngineScore;
  criticalReasons: CriticalPositionReason[];
}

interface BuiltFilteredGames {
  cte: string;
  parameters: unknown[];
}

function count(value: string | number): number {
  return Number(value);
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function jsonObject(value: Record<string, unknown> | string): Record<string, unknown> {
  return typeof value === 'string' ? (JSON.parse(value) as Record<string, unknown>) : value;
}

function jsonReasons(value: CriticalPositionReason[] | string | null): CriticalPositionReason[] {
  if (value === null) return [];
  return typeof value === 'string' ? (JSON.parse(value) as CriticalPositionReason[]) : value;
}

export class PlayerIntelligenceRepository {
  constructor(private readonly database: Database) {}

  async getGameFacts(playerId: string, filters: PlayerDossierFilters): Promise<PlayerGameFact[]> {
    const built = this.buildFilteredGames(playerId, filters, false);
    const result = await this.database.query<GameFactRow>(
      `${built.cte}
       SELECT filtered_games.game_id, filtered_games.focal_color,
              filtered_games.focal_rating, filtered_games.opponent_name,
              filtered_games.opponent_rating, filtered_games.event,
              filtered_games.played_at, filtered_games.result,
              filtered_games.game_context, filtered_games.time_category,
              filtered_games.content_status,
              COUNT(occurrence.next_move_id)::integer AS move_count,
              COALESCE(BOOL_OR(
                position.side_to_move = filtered_games.focal_color AND move.san = 'O-O'
              ), FALSE) AS king_side_castle,
              COALESCE(BOOL_OR(
                position.side_to_move = filtered_games.focal_color AND move.san = 'O-O-O'
              ), FALSE) AS queen_side_castle,
              MIN(move.ply) FILTER (
                WHERE split_part(move.fen_after, ' ', 1) NOT LIKE '%Q%'
                  AND split_part(move.fen_after, ' ', 1) NOT LIKE '%q%'
              ) AS queen_trade_ply,
              ARRAY(
                SELECT DISTINCT source.type
                FROM game_source_records source_record
                JOIN data_sources source ON source.id = source_record.data_source_id
                WHERE source_record.game_id = filtered_games.game_id
                ORDER BY source.type
              ) AS source_types
       FROM filtered_games
       LEFT JOIN position_occurrences occurrence
         ON occurrence.game_id = filtered_games.game_id
       LEFT JOIN positions position ON position.id = occurrence.position_id
       LEFT JOIN moves move ON move.id = occurrence.next_move_id
       GROUP BY filtered_games.game_id, filtered_games.focal_color,
                filtered_games.focal_rating, filtered_games.opponent_name,
                filtered_games.opponent_rating, filtered_games.event,
                filtered_games.played_at, filtered_games.result,
                filtered_games.game_context, filtered_games.time_category,
                filtered_games.content_status
       ORDER BY filtered_games.played_at DESC NULLS LAST, filtered_games.game_id`,
      built.parameters,
    );
    return result.rows.map((row) => ({
      gameId: row.game_id,
      focalColor: row.focal_color,
      focalRating: row.focal_rating,
      opponentName: row.opponent_name,
      opponentRating: row.opponent_rating,
      event: row.event,
      playedAt: dateOnly(row.played_at),
      result: row.result,
      gameContext: row.game_context,
      timeCategory: row.time_category,
      contentStatus: row.content_status,
      moveCount: count(row.move_count),
      castling: row.queen_side_castle
        ? 'QUEEN_SIDE'
        : row.king_side_castle
          ? 'KING_SIDE'
          : 'NO_CASTLING_MOVE_RECORDED',
      queenTradePly: row.queen_trade_ply === null ? null : count(row.queen_trade_ply),
      sourceTypes: row.source_types ?? [],
    }));
  }

  async getSelectedEngineObservations(input: {
    playerId: string;
    filters: PlayerDossierFilters;
    profile: 'QUICK_V1';
    profileVersion: number;
  }): Promise<RawPlayerEngineObservation[]> {
    const built = this.buildFilteredGames(input.playerId, input.filters, true);
    const profile = this.addParameter(built, input.profile);
    const version = this.addParameter(built, input.profileVersion);
    const result = await this.database.query<EngineObservationRow>(
      `${built.cte},
       selected_runs AS (
         SELECT DISTINCT ON (run.game_id)
                run.id, run.game_id, run.completed_at, run.engine_family,
                run.engine_reported_name, run.engine_reported_version,
                run.binary_sha256, run.profile, run.profile_version,
                run.engine_options, run.search_limit_type, run.search_limit_value,
                run.multipv, run.detector_version, run.started_at
         FROM analysis_runs run
         JOIN filtered_games ON filtered_games.game_id = run.game_id
         WHERE run.status = 'SUCCEEDED'
           AND run.profile = ${profile}
           AND run.profile_version = ${version}
         ORDER BY run.game_id, run.completed_at DESC NULLS LAST, run.id DESC
       )
       SELECT run.id AS run_id, run.game_id, run.completed_at, run.engine_family,
              run.engine_reported_name, run.engine_reported_version,
              run.binary_sha256, run.profile, run.profile_version,
              run.engine_options, run.search_limit_type, run.search_limit_value,
              run.multipv, run.detector_version, run.started_at,
              filtered_games.focal_color, filtered_games.opponent_name,
              filtered_games.opponent_rating, filtered_games.event,
              filtered_games.played_at, filtered_games.result,
              assessment.occurrence_ply, assessment.mover,
              position.representative_fen, assessment.centipawn_loss,
              assessment.mate_outcome, best.score_kind, best.centipawns, best.mate_in,
              critical.reasons AS critical_reasons
       FROM selected_runs run
       JOIN filtered_games ON filtered_games.game_id = run.game_id
       JOIN move_engine_assessments assessment ON assessment.analysis_run_id = run.id
       JOIN engine_evaluations best ON best.id = assessment.best_evaluation_id
       JOIN engine_position_states state ON state.id = assessment.engine_position_state_id
       JOIN positions position ON position.id = state.normalized_position_id
       LEFT JOIN critical_positions critical
         ON critical.analysis_run_id = assessment.analysis_run_id
        AND critical.game_id = assessment.game_id
        AND critical.occurrence_ply = assessment.occurrence_ply
       ORDER BY run.game_id, assessment.occurrence_ply`,
      built.parameters,
    );
    return result.rows.map((row) => ({
      run: {
        id: row.run_id,
        gameId: row.game_id,
        completedAt: iso(row.completed_at),
        engineFamily: row.engine_family,
        engineReportedName: row.engine_reported_name,
        engineReportedVersion: row.engine_reported_version,
        binarySha256: row.binary_sha256,
        profile: row.profile as 'QUICK_V1',
        profileVersion: row.profile_version,
        engineOptions: jsonObject(row.engine_options),
        searchLimit: { type: row.search_limit_type, value: count(row.search_limit_value) },
        multiPv: row.multipv,
        detectorVersion: row.detector_version,
        startedAt: iso(row.started_at),
      },
      gameId: row.game_id,
      focalColor: row.focal_color,
      opponentName: row.opponent_name,
      opponentRating: row.opponent_rating,
      event: row.event,
      playedAt: dateOnly(row.played_at),
      result: row.result,
      occurrencePly: row.occurrence_ply,
      mover: row.mover,
      representativeFen: row.representative_fen,
      centipawnLoss: row.centipawn_loss,
      mateOutcome: row.mate_outcome,
      bestScoreWhite:
        row.score_kind === 'CENTIPAWN'
          ? { kind: 'CENTIPAWN', centipawns: row.centipawns! }
          : { kind: 'MATE', mateIn: row.mate_in! },
      criticalReasons: jsonReasons(row.critical_reasons),
    }));
  }

  private buildFilteredGames(
    playerId: string,
    filters: PlayerDossierFilters,
    movesOnly: boolean,
  ): BuiltFilteredGames {
    const built: BuiltFilteredGames = { cte: '', parameters: [] };
    const conditions = [`focal.player_id = ${this.addParameter(built, playerId)}`];
    if (movesOnly) conditions.push("g.content_status = 'MOVES_AVAILABLE'");
    this.addListCondition(built, conditions, 'g.game_context', filters.gameContexts);
    this.addListCondition(built, conditions, 'g.time_category', filters.timeCategories);
    if (filters.playedFrom) {
      conditions.push(`g.played_at >= ${this.addParameter(built, filters.playedFrom)}::date`);
    }
    if (filters.playedTo) {
      conditions.push(`g.played_at <= ${this.addParameter(built, filters.playedTo)}::date`);
    }
    if (filters.minimumOpponentRating !== null) {
      conditions.push(
        `opponent.rating >= ${this.addParameter(built, filters.minimumOpponentRating)}`,
      );
    }
    if (filters.sourceTypes.length > 0) {
      const placeholders = filters.sourceTypes
        .map((source) => this.addParameter(built, source))
        .join(', ');
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM game_source_records filtered_source
          JOIN data_sources filtered_data_source
            ON filtered_data_source.id = filtered_source.data_source_id
          WHERE filtered_source.game_id = g.id
            AND filtered_data_source.type IN (${placeholders})
        )`,
      );
    }
    built.cte = `WITH filtered_games AS (
      SELECT g.id AS game_id, g.event, g.played_at, g.result,
             g.game_context, g.time_category, g.content_status,
             focal.color AS focal_color, focal.rating AS focal_rating,
             opponent.display_name AS opponent_name,
             opponent.rating AS opponent_rating
      FROM game_players focal
      JOIN games g ON g.id = focal.game_id
      JOIN game_players opponent
        ON opponent.game_id = g.id AND opponent.color <> focal.color
      WHERE ${conditions.join('\n        AND ')}
    )`;
    return built;
  }

  private addParameter(built: BuiltFilteredGames, value: unknown): string {
    built.parameters.push(value);
    return `$${built.parameters.length}`;
  }

  private addListCondition(
    built: BuiltFilteredGames,
    conditions: string[],
    column: string,
    values: readonly string[],
  ): void {
    if (values.length === 0) return;
    conditions.push(
      `${column} IN (${values.map((value) => this.addParameter(built, value)).join(', ')})`,
    );
  }
}
