import type {
  AnalysisProfileName,
  Color,
  DataSourceType,
  EngineScore,
  OpponentOpeningProfile,
  OpponentPreparationFilters,
  RepresentativeGame,
  STRONG_REFERENCE_PROFILE,
} from '@chess-intelligent/domain';

import type { Database } from './database';
import { dateOnly } from './date-values';

interface CountRow {
  canonical_games: string | number;
  games_with_moves: string | number;
  metadata_only_games: string | number;
}

interface ProfileCoverageRow extends CountRow {
  white_games_with_moves: string | number;
  black_games_with_moves: string | number;
  otb_games_with_moves: string | number;
  online_games_with_moves: string | number;
  classical_games_with_moves: string | number;
  rapid_games_with_moves: string | number;
  blitz_games_with_moves: string | number;
  earliest_known_game: string | Date | null;
  latest_known_game: string | Date | null;
}

interface MoveAggregateRow {
  san: string;
  uci: string;
  resulting_position_id: string;
  resulting_fen: string;
  games: string | number;
  historical_games: string | number;
  recent_games: string | number;
  white_wins: string | number;
  draws: string | number;
  black_wins: string | number;
  opponent_wins: string | number;
  last_seen: string | Date | null;
}

interface BlackResponseRow extends MoveAggregateRow {
  against_san: string;
  against_uci: string;
  against_position_id: string;
}

interface RepresentativeRow {
  uci: string;
  game_id: string;
  white_name: string;
  white_rating: number | null;
  black_name: string;
  black_rating: number | null;
  event: string | null;
  played_at: string | Date | null;
  result: string;
  source_types: DataSourceType[] | null;
  move_rank: string | number;
}

interface ReferenceAggregateRow {
  san: string;
  uci: string;
  resulting_position_id: string;
  resulting_fen: string;
  games: string | number;
  white_wins: string | number;
  draws: string | number;
  black_wins: string | number;
  preparation_wins: string | number;
  preparation_losses: string | number;
  average_recorded_rating: string | number;
  minimum_recorded_rating: string | number;
}

interface EngineEvidenceRow {
  run_id: string;
  game_id: string;
  occurrence_ply: number;
  history_sha256: string;
  completed_at: string | Date;
  engine_family: 'STOCKFISH' | 'FAKE';
  engine_reported_name: string;
  engine_reported_version: string | null;
  binary_sha256: string;
  profile: AnalysisProfileName;
  profile_version: number;
  search_limit_type: 'DEPTH' | 'NODES' | 'MOVETIME';
  search_limit_value: string | number;
  engine_options: Record<string, unknown> | string;
  multipv: number;
  detector_version: string;
  started_at: string | Date;
  pv_rank: number;
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

interface EvidenceAvailabilityRow {
  direct_states: string | number;
  normalized_states: string | number;
}

interface HotspotRow {
  position_id: string;
  representative_fen: string;
  side_to_move: Color;
  uci: string;
  move_games: string | number;
  recent_move_games: string | number;
}

export interface RawOpponentMove {
  san: string;
  uci: string;
  resultingPositionId: string;
  resultingFen: string;
  games: number;
  historicalGames: number;
  recentGames: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  opponentWins: number;
  lastSeen: string | null;
  representativeGames: RepresentativeGame[];
}

export interface RawBlackResponseGroup {
  againstMove: {
    san: string;
    uci: string;
    resultingPositionId: string;
  };
  moves: RawOpponentMove[];
}

export interface RawReferenceMove {
  san: string;
  uci: string;
  resultingPositionId: string;
  resultingFen: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  preparationWins: number;
  preparationLosses: number;
  averageRecordedRating: number;
  minimumRecordedRating: number;
  representativeGames: RepresentativeGame[];
}

export interface RawCompatibleEngineMove {
  runId: string;
  gameId: string;
  occurrencePly: number;
  historySha256: string;
  completedAt: string;
  engineFamily: 'STOCKFISH' | 'FAKE';
  engineReportedName: string;
  engineReportedVersion: string | null;
  binarySha256: string;
  profile: AnalysisProfileName;
  profileVersion: number;
  searchLimit: { type: 'DEPTH' | 'NODES' | 'MOVETIME'; value: number };
  engineOptions: Record<string, unknown>;
  multiPv: number;
  detectorVersion: string;
  startedAt: string;
  pvRank: number;
  score: EngineScore;
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

export interface RawEngineCandidateEvidence {
  moves: RawCompatibleEngineMove[];
  hasDirectSuccessfulState: boolean;
  hasOnlyIncompatibleSuccessfulState: boolean;
}

export interface RawPreparationHotspot {
  positionId: string;
  representativeFen: string;
  sideToMove: Color;
  reachedGames: number;
  recentReachedGames: number;
  largestMoveGames: number;
}

function count(value: string | number): number {
  return Number(value);
}

function numberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function jsonArray(value: string[] | string): string[] {
  return typeof value === 'string' ? (JSON.parse(value) as string[]) : value;
}

function jsonObject(value: Record<string, unknown> | string): Record<string, unknown> {
  return typeof value === 'string' ? (JSON.parse(value) as Record<string, unknown>) : value;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function representative(row: RepresentativeRow): RepresentativeGame {
  return {
    gameId: row.game_id,
    white: { displayName: row.white_name, rating: row.white_rating },
    black: { displayName: row.black_name, rating: row.black_rating },
    event: row.event,
    playedAt: dateOnly(row.played_at),
    result: row.result,
    sourceTypes: row.source_types ?? [],
  };
}

interface BuiltCorpus {
  cte: string;
  parameters: unknown[];
}

export class OpponentPreparationRepository {
  constructor(private readonly database: Database) {}

  async getOpeningProfileCoverage(playerId: string): Promise<OpponentOpeningProfile['coverage']> {
    const result = await this.database.query<ProfileCoverageRow>(
      `SELECT COUNT(*)::integer AS canonical_games,
              COUNT(*) FILTER (WHERE g.content_status = 'MOVES_AVAILABLE')::integer
                AS games_with_moves,
              COUNT(*) FILTER (WHERE g.content_status = 'METADATA_ONLY')::integer
                AS metadata_only_games,
              COUNT(*) FILTER (
                WHERE g.content_status = 'MOVES_AVAILABLE' AND gp.color = 'WHITE'
              )::integer AS white_games_with_moves,
              COUNT(*) FILTER (
                WHERE g.content_status = 'MOVES_AVAILABLE' AND gp.color = 'BLACK'
              )::integer AS black_games_with_moves,
              COUNT(*) FILTER (
                WHERE g.content_status = 'MOVES_AVAILABLE' AND g.game_context = 'OTB'
              )::integer AS otb_games_with_moves,
              COUNT(*) FILTER (
                WHERE g.content_status = 'MOVES_AVAILABLE' AND g.game_context = 'ONLINE'
              )::integer AS online_games_with_moves,
              COUNT(*) FILTER (
                WHERE g.content_status = 'MOVES_AVAILABLE' AND g.time_category = 'CLASSICAL'
              )::integer AS classical_games_with_moves,
              COUNT(*) FILTER (
                WHERE g.content_status = 'MOVES_AVAILABLE' AND g.time_category = 'RAPID'
              )::integer AS rapid_games_with_moves,
              COUNT(*) FILTER (
                WHERE g.content_status = 'MOVES_AVAILABLE' AND g.time_category = 'BLITZ'
              )::integer AS blitz_games_with_moves,
              MIN(g.played_at) AS earliest_known_game,
              MAX(g.played_at) AS latest_known_game
       FROM game_players gp
       JOIN games g ON g.id = gp.game_id
       WHERE gp.player_id = $1`,
      [playerId],
    );
    const row = result.rows[0];
    return {
      totalCanonicalGames: count(row?.canonical_games ?? 0),
      gamesWithMoves: count(row?.games_with_moves ?? 0),
      metadataOnlyGames: count(row?.metadata_only_games ?? 0),
      whiteGamesWithMoves: count(row?.white_games_with_moves ?? 0),
      blackGamesWithMoves: count(row?.black_games_with_moves ?? 0),
      otbGamesWithMoves: count(row?.otb_games_with_moves ?? 0),
      onlineGamesWithMoves: count(row?.online_games_with_moves ?? 0),
      classicalGamesWithMoves: count(row?.classical_games_with_moves ?? 0),
      rapidGamesWithMoves: count(row?.rapid_games_with_moves ?? 0),
      blitzGamesWithMoves: count(row?.blitz_games_with_moves ?? 0),
      earliestKnownGame: dateOnly(row?.earliest_known_game ?? null),
      latestKnownGame: dateOnly(row?.latest_known_game ?? null),
    };
  }

  async getFilteredCoverage(
    playerId: string,
    opponentColor: Color,
    filters: OpponentPreparationFilters,
  ): Promise<{ canonicalGames: number; gamesWithMoves: number; metadataOnlyGames: number }> {
    const built = this.buildFilteredGames(playerId, opponentColor, filters, false);
    const result = await this.database.query<CountRow>(
      `${built.cte}
       SELECT COUNT(*)::integer AS canonical_games,
              COUNT(*) FILTER (WHERE content_status = 'MOVES_AVAILABLE')::integer
                AS games_with_moves,
              COUNT(*) FILTER (WHERE content_status = 'METADATA_ONLY')::integer
                AS metadata_only_games
       FROM filtered_games`,
      built.parameters,
    );
    const row = result.rows[0];
    return {
      canonicalGames: count(row?.canonical_games ?? 0),
      gamesWithMoves: count(row?.games_with_moves ?? 0),
      metadataOnlyGames: count(row?.metadata_only_games ?? 0),
    };
  }

  async getOpponentMoves(input: {
    playerId: string;
    opponentColor: Color;
    positionId: string;
    filters: OpponentPreparationFilters;
    recentFrom: string;
  }): Promise<RawOpponentMove[]> {
    const built = this.buildPositionOccurrences(input);
    const representativesPromise = this.getRepresentatives({
      cte: built.cte,
      parameters: [...built.parameters],
    });
    const recent = this.addParameter(built, input.recentFrom);
    const aggregates = await this.database.query<MoveAggregateRow>(
      `${built.cte}
       SELECT san, uci, resulting_position_id, resulting_fen,
              COUNT(*)::integer AS games,
              COUNT(*) FILTER (WHERE played_at < ${recent}::date)::integer AS historical_games,
              COUNT(*) FILTER (WHERE played_at >= ${recent}::date)::integer AS recent_games,
              COUNT(*) FILTER (WHERE result = '1-0')::integer AS white_wins,
              COUNT(*) FILTER (WHERE result = '1/2-1/2')::integer AS draws,
              COUNT(*) FILTER (WHERE result = '0-1')::integer AS black_wins,
              COUNT(*) FILTER (WHERE
                (opponent_color = 'WHITE' AND result = '1-0') OR
                (opponent_color = 'BLACK' AND result = '0-1')
              )::integer AS opponent_wins,
              MAX(played_at) AS last_seen
       FROM matching_occurrences
       GROUP BY san, uci, resulting_position_id, resulting_fen
       ORDER BY games DESC, san, uci`,
      built.parameters,
    );
    const representatives = await representativesPromise;
    const byMove = new Map<string, RepresentativeGame[]>();
    for (const row of representatives) {
      const group = byMove.get(row.uci) ?? [];
      group.push(representative(row));
      byMove.set(row.uci, group);
    }
    return aggregates.rows.map((row) => this.mapMove(row, byMove.get(row.uci) ?? []));
  }

  async getBlackRootResponses(input: {
    playerId: string;
    filters: OpponentPreparationFilters;
    recentFrom: string;
  }): Promise<RawBlackResponseGroup[]> {
    const built = this.buildFilteredGames(input.playerId, 'BLACK', input.filters, true);
    const recent = this.addParameter(built, input.recentFrom);
    const result = await this.database.query<BlackResponseRow>(
      `${built.cte},
       root_responses AS (
         SELECT filtered_games.*, first_move.san AS against_san,
                first_move.uci AS against_uci,
                first_occurrence.resulting_position_id AS against_position_id,
                reply.san, reply.uci, reply_occurrence.resulting_position_id,
                resulting.representative_fen AS resulting_fen
         FROM filtered_games
         JOIN position_occurrences first_occurrence
           ON first_occurrence.game_id = filtered_games.game_id
          AND first_occurrence.ply = 0
         JOIN moves first_move ON first_move.id = first_occurrence.next_move_id
         JOIN position_occurrences reply_occurrence
           ON reply_occurrence.game_id = filtered_games.game_id
          AND reply_occurrence.ply = 1
         JOIN moves reply ON reply.id = reply_occurrence.next_move_id
         JOIN positions resulting ON resulting.id = reply_occurrence.resulting_position_id
       )
       SELECT against_san, against_uci, against_position_id,
              san, uci, resulting_position_id, resulting_fen,
              COUNT(*)::integer AS games,
              COUNT(*) FILTER (WHERE played_at < ${recent}::date)::integer AS historical_games,
              COUNT(*) FILTER (WHERE played_at >= ${recent}::date)::integer AS recent_games,
              COUNT(*) FILTER (WHERE result = '1-0')::integer AS white_wins,
              COUNT(*) FILTER (WHERE result = '1/2-1/2')::integer AS draws,
              COUNT(*) FILTER (WHERE result = '0-1')::integer AS black_wins,
              COUNT(*) FILTER (WHERE result = '0-1')::integer AS opponent_wins,
              MAX(played_at) AS last_seen
       FROM root_responses
       GROUP BY against_san, against_uci, against_position_id,
                san, uci, resulting_position_id, resulting_fen
       ORDER BY SUM(COUNT(*)) OVER (PARTITION BY against_uci) DESC,
                against_san, games DESC, san, uci`,
      built.parameters,
    );
    const groups = new Map<string, RawBlackResponseGroup>();
    for (const row of result.rows) {
      const current = groups.get(row.against_uci) ?? {
        againstMove: {
          san: row.against_san,
          uci: row.against_uci,
          resultingPositionId: row.against_position_id.trim(),
        },
        moves: [],
      };
      current.moves.push(this.mapMove(row, []));
      groups.set(row.against_uci, current);
    }
    return [...groups.values()];
  }

  async getStrongReferenceMoves(input: {
    positionId: string;
    preparationColor: Color;
    profile: typeof STRONG_REFERENCE_PROFILE;
  }): Promise<RawReferenceMove[]> {
    const parameters: unknown[] = [
      input.positionId,
      input.profile.minimumBothPlayersRating,
      ...input.profile.gameContexts,
      ...input.profile.timeCategories,
    ];
    const contextStart = 3;
    const categoryStart = contextStart + input.profile.gameContexts.length;
    const cte = `WITH reference_games AS (
      SELECT DISTINCT ON (po.game_id)
             po.game_id, po.ply, move.san, move.uci, po.resulting_position_id,
             resulting.representative_fen AS resulting_fen,
             g.event, g.played_at, g.result,
             white_player.display_name AS white_name,
             white_player.rating AS white_rating,
             black_player.display_name AS black_name,
             black_player.rating AS black_rating,
             (white_player.rating + black_player.rating) / 2.0 AS average_rating,
             LEAST(white_player.rating, black_player.rating) AS minimum_rating
      FROM position_occurrences po
      JOIN moves move ON move.id = po.next_move_id
      JOIN positions resulting ON resulting.id = po.resulting_position_id
      JOIN games g ON g.id = po.game_id
      JOIN game_players white_player
        ON white_player.game_id = g.id AND white_player.color = 'WHITE'
      JOIN game_players black_player
        ON black_player.game_id = g.id AND black_player.color = 'BLACK'
      WHERE po.position_id = $1
        AND g.content_status = 'MOVES_AVAILABLE'
        AND white_player.rating >= $2
        AND black_player.rating >= $2
        AND g.game_context IN (${input.profile.gameContexts.map((_, index) => `$${contextStart + index}`).join(', ')})
        AND g.time_category IN (${input.profile.timeCategories.map((_, index) => `$${categoryStart + index}`).join(', ')})
      ORDER BY po.game_id, po.ply
    )`;
    const aggregates = await this.database.query<ReferenceAggregateRow>(
      `${cte}
       SELECT san, uci, resulting_position_id, resulting_fen,
              COUNT(*)::integer AS games,
              COUNT(*) FILTER (WHERE result = '1-0')::integer AS white_wins,
              COUNT(*) FILTER (WHERE result = '1/2-1/2')::integer AS draws,
              COUNT(*) FILTER (WHERE result = '0-1')::integer AS black_wins,
              COUNT(*) FILTER (WHERE result = '${input.preparationColor === 'WHITE' ? '1-0' : '0-1'}')::integer
                AS preparation_wins,
              COUNT(*) FILTER (WHERE result = '${input.preparationColor === 'WHITE' ? '0-1' : '1-0'}')::integer
                AS preparation_losses,
              AVG(average_rating) AS average_recorded_rating,
              MIN(minimum_rating) AS minimum_recorded_rating
       FROM reference_games
       GROUP BY san, uci, resulting_position_id, resulting_fen
       ORDER BY games DESC, san, uci`,
      parameters,
    );
    const representatives = await this.database.query<RepresentativeRow>(
      `${cte},
       ranked AS (
         SELECT reference_games.*,
                ROW_NUMBER() OVER (
                  PARTITION BY uci
                  ORDER BY minimum_rating DESC, average_rating DESC,
                           played_at DESC NULLS LAST,
                           (event IS NOT NULL) DESC, game_id
                ) AS move_rank
         FROM reference_games
       )
       SELECT ranked.uci, ranked.game_id, ranked.white_name, ranked.white_rating,
              ranked.black_name, ranked.black_rating, ranked.event, ranked.played_at,
              ranked.result, ranked.move_rank,
              ARRAY(
                SELECT DISTINCT ds.type
                FROM game_source_records gsr
                JOIN data_sources ds ON ds.id = gsr.data_source_id
                WHERE gsr.game_id = ranked.game_id
                ORDER BY ds.type
              ) AS source_types
       FROM ranked
       WHERE move_rank <= 3
       ORDER BY uci, move_rank`,
      parameters,
    );
    const byMove = new Map<string, RepresentativeGame[]>();
    for (const row of representatives.rows) {
      const group = byMove.get(row.uci) ?? [];
      group.push(representative(row));
      byMove.set(row.uci, group);
    }
    return aggregates.rows.map((row) => ({
      san: row.san,
      uci: row.uci,
      resultingPositionId: row.resulting_position_id.trim(),
      resultingFen: row.resulting_fen,
      games: count(row.games),
      whiteWins: count(row.white_wins),
      draws: count(row.draws),
      blackWins: count(row.black_wins),
      preparationWins: count(row.preparation_wins),
      preparationLosses: count(row.preparation_losses),
      averageRecordedRating: Number(row.average_recorded_rating),
      minimumRecordedRating: Number(row.minimum_recorded_rating),
      representativeGames: byMove.get(row.uci) ?? [],
    }));
  }

  async getCompatibleEngineMoves(input: {
    playerId: string;
    opponentColor: Color;
    positionId: string;
    filters: OpponentPreparationFilters;
  }): Promise<RawEngineCandidateEvidence> {
    const base = this.buildPositionOccurrences(input);
    const directBuilt: BuiltCorpus = { cte: base.cte, parameters: [...base.parameters] };
    const directPosition = this.addParameter(directBuilt, input.positionId);
    const direct = await this.database.query<EngineEvidenceRow>(
      `${directBuilt.cte},
       ranked_evidence AS (
         SELECT run.id AS run_id, state.game_id, state.occurrence_ply,
                state.history_sha256, run.completed_at, run.engine_family,
                run.engine_reported_name, run.engine_reported_version, run.binary_sha256,
                run.profile, run.profile_version, run.search_limit_type,
                run.search_limit_value, run.engine_options, run.multipv,
                run.detector_version, run.started_at,
                evaluation.pv_rank, evaluation.score_kind,
                evaluation.centipawns, evaluation.mate_in, evaluation.root_move_uci,
                evaluation.pv_uci, evaluation.depth, evaluation.seldepth,
                evaluation.nodes, evaluation.nps, evaluation.time_ms, evaluation.hashfull,
                ROW_NUMBER() OVER (
                  PARTITION BY evaluation.root_move_uci
                  ORDER BY run.completed_at DESC, run.id DESC,
                           state.game_id, state.occurrence_ply
                ) AS evidence_rank
         FROM matching_occurrences occurrence
         JOIN engine_position_states state
           ON state.game_id = occurrence.game_id
          AND state.occurrence_ply = occurrence.ply
          AND state.normalized_position_id = ${directPosition}
         JOIN analysis_runs run
           ON run.id = state.analysis_run_id AND run.status = 'SUCCEEDED'
         JOIN engine_evaluations evaluation
           ON evaluation.engine_position_state_id = state.id
          AND evaluation.analysis_run_id = run.id
          AND evaluation.role = 'MULTIPV'
       )
       SELECT * FROM ranked_evidence
       WHERE evidence_rank = 1
       ORDER BY pv_rank, root_move_uci`,
      directBuilt.parameters,
    );
    const availabilityBuilt: BuiltCorpus = { cte: base.cte, parameters: [...base.parameters] };
    const directPositionForAvailability = this.addParameter(availabilityBuilt, input.positionId);
    const normalizedPositionForAvailability = this.addParameter(
      availabilityBuilt,
      input.positionId,
    );
    const availability = await this.database.query<EvidenceAvailabilityRow>(
      `${availabilityBuilt.cte}
       SELECT
         (SELECT COUNT(DISTINCT state.id)
          FROM matching_occurrences occurrence
          JOIN engine_position_states state
            ON state.game_id = occurrence.game_id
           AND state.occurrence_ply = occurrence.ply
          JOIN analysis_runs run
            ON run.id = state.analysis_run_id AND run.status = 'SUCCEEDED'
          WHERE state.normalized_position_id = ${directPositionForAvailability})
            AS direct_states,
         (SELECT COUNT(DISTINCT state.id)
          FROM engine_position_states state
          JOIN analysis_runs run
            ON run.id = state.analysis_run_id AND run.status = 'SUCCEEDED'
          WHERE state.normalized_position_id = ${normalizedPositionForAvailability})
            AS normalized_states`,
      availabilityBuilt.parameters,
    );
    const stateCounts = availability.rows[0];
    const directStates = count(stateCounts?.direct_states ?? 0);
    const normalizedStates = count(stateCounts?.normalized_states ?? 0);
    return {
      moves: direct.rows.map((row) => ({
        runId: row.run_id,
        gameId: row.game_id,
        occurrencePly: row.occurrence_ply,
        historySha256: row.history_sha256,
        completedAt: iso(row.completed_at),
        engineFamily: row.engine_family,
        engineReportedName: row.engine_reported_name,
        engineReportedVersion: row.engine_reported_version,
        binarySha256: row.binary_sha256,
        profile: row.profile,
        profileVersion: row.profile_version,
        searchLimit: { type: row.search_limit_type, value: Number(row.search_limit_value) },
        engineOptions: jsonObject(row.engine_options),
        multiPv: row.multipv,
        detectorVersion: row.detector_version,
        startedAt: iso(row.started_at),
        pvRank: row.pv_rank,
        score:
          row.score_kind === 'CENTIPAWN'
            ? { kind: 'CENTIPAWN', centipawns: row.centipawns! }
            : { kind: 'MATE', mateIn: row.mate_in! },
        rootMoveUci: row.root_move_uci,
        pvUci: jsonArray(row.pv_uci),
        search: {
          depth: row.depth,
          seldepth: row.seldepth,
          nodes: numberOrNull(row.nodes),
          nps: numberOrNull(row.nps),
          timeMs: numberOrNull(row.time_ms),
          hashfull: row.hashfull,
        },
      })),
      hasDirectSuccessfulState: directStates > 0,
      hasOnlyIncompatibleSuccessfulState: directStates === 0 && normalizedStates > 0,
    };
  }

  async getHotspots(input: {
    playerId: string;
    opponentColor: Color;
    filters: OpponentPreparationFilters;
    recentFrom: string;
    maximumPly: number;
  }): Promise<RawPreparationHotspot[]> {
    const built = this.buildFilteredGames(input.playerId, input.opponentColor, input.filters, true);
    const recent = this.addParameter(built, input.recentFrom);
    const maximumPly = this.addParameter(built, input.maximumPly);
    const color = this.addParameter(built, input.opponentColor);
    const result = await this.database.query<HotspotRow>(
      `${built.cte},
       distinct_nodes AS (
         SELECT DISTINCT ON (po.game_id, po.position_id)
                po.game_id, po.position_id, po.ply, move.uci,
                filtered_games.played_at
         FROM filtered_games
         JOIN position_occurrences po ON po.game_id = filtered_games.game_id
         JOIN positions position ON position.id = po.position_id
         JOIN moves move ON move.id = po.next_move_id
         WHERE po.ply <= ${maximumPly}
           AND position.side_to_move = ${color}
         ORDER BY po.game_id, po.position_id, po.ply
       )
       SELECT node.position_id, position.representative_fen, position.side_to_move,
              node.uci, COUNT(*)::integer AS move_games,
              COUNT(*) FILTER (WHERE node.played_at >= ${recent}::date)::integer
                AS recent_move_games
       FROM distinct_nodes node
       JOIN positions position ON position.id = node.position_id
       GROUP BY node.position_id, position.representative_fen,
                position.side_to_move, node.uci
       ORDER BY node.position_id, move_games DESC, node.uci`,
      built.parameters,
    );
    const groups = new Map<string, RawPreparationHotspot>();
    for (const row of result.rows) {
      const current = groups.get(row.position_id) ?? {
        positionId: row.position_id.trim(),
        representativeFen: row.representative_fen,
        sideToMove: row.side_to_move,
        reachedGames: 0,
        recentReachedGames: 0,
        largestMoveGames: 0,
      };
      const moveGames = count(row.move_games);
      current.reachedGames += moveGames;
      current.recentReachedGames += count(row.recent_move_games);
      current.largestMoveGames = Math.max(current.largestMoveGames, moveGames);
      groups.set(row.position_id, current);
    }
    return [...groups.values()]
      .sort(
        (left, right) =>
          right.reachedGames - left.reachedGames ||
          right.recentReachedGames - left.recentReachedGames ||
          left.positionId.localeCompare(right.positionId),
      )
      .slice(0, 10);
  }

  private mapMove(row: MoveAggregateRow, games: RepresentativeGame[]): RawOpponentMove {
    return {
      san: row.san,
      uci: row.uci,
      resultingPositionId: row.resulting_position_id.trim(),
      resultingFen: row.resulting_fen,
      games: count(row.games),
      historicalGames: count(row.historical_games),
      recentGames: count(row.recent_games),
      whiteWins: count(row.white_wins),
      draws: count(row.draws),
      blackWins: count(row.black_wins),
      opponentWins: count(row.opponent_wins),
      lastSeen: dateOnly(row.last_seen),
      representativeGames: games,
    };
  }

  private async getRepresentatives(built: BuiltCorpus): Promise<RepresentativeRow[]> {
    const result = await this.database.query<RepresentativeRow>(
      `${built.cte},
       ranked AS (
         SELECT matching_occurrences.*,
                ROW_NUMBER() OVER (
                  PARTITION BY uci
                  ORDER BY ranking_rating DESC, played_at DESC NULLS LAST,
                           (event IS NOT NULL) DESC, game_id
                ) AS move_rank
         FROM matching_occurrences
       )
       SELECT ranked.uci, ranked.game_id, ranked.white_name, ranked.white_rating,
              ranked.black_name, ranked.black_rating, ranked.event, ranked.played_at,
              ranked.result, ranked.move_rank,
              ARRAY(
                SELECT DISTINCT ds.type
                FROM game_source_records gsr
                JOIN data_sources ds ON ds.id = gsr.data_source_id
                WHERE gsr.game_id = ranked.game_id
                ORDER BY ds.type
              ) AS source_types
       FROM ranked
       WHERE move_rank <= 3
       ORDER BY uci, move_rank`,
      built.parameters,
    );
    return result.rows;
  }

  private buildPositionOccurrences(input: {
    playerId: string;
    opponentColor: Color;
    positionId: string;
    filters: OpponentPreparationFilters;
  }): BuiltCorpus {
    const built = this.buildFilteredGames(input.playerId, input.opponentColor, input.filters, true);
    const position = this.addParameter(built, input.positionId);
    built.cte += `,
      matching_occurrences AS (
        SELECT DISTINCT ON (po.game_id)
               filtered_games.*, po.ply, move.san, move.uci,
               po.resulting_position_id,
               resulting.representative_fen AS resulting_fen
        FROM filtered_games
        JOIN position_occurrences po ON po.game_id = filtered_games.game_id
        JOIN moves move ON move.id = po.next_move_id
        JOIN positions resulting ON resulting.id = po.resulting_position_id
        WHERE po.position_id = ${position}
        ORDER BY po.game_id, po.ply
      )`;
    return built;
  }

  private buildFilteredGames(
    playerId: string,
    opponentColor: Color,
    filters: OpponentPreparationFilters,
    movesOnly: boolean,
  ): BuiltCorpus {
    const built: BuiltCorpus = { cte: '', parameters: [] };
    const conditions = [
      `opponent.player_id = ${this.addParameter(built, playerId)}`,
      `opponent.color = ${this.addParameter(built, opponentColor)}`,
    ];
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
        `CASE opponent.color
           WHEN 'WHITE' THEN black_player.rating
           ELSE white_player.rating
         END >= ${this.addParameter(built, filters.minimumOpponentRating)}`,
      );
    }
    if (filters.sourceTypes.length > 0) {
      const placeholders = filters.sourceTypes
        .map((source) => this.addParameter(built, source))
        .join(', ');
      conditions.push(
        `EXISTS (
          SELECT 1 FROM game_source_records filtered_source
          JOIN data_sources filtered_data_source
            ON filtered_data_source.id = filtered_source.data_source_id
          WHERE filtered_source.game_id = g.id
            AND filtered_data_source.type IN (${placeholders})
        )`,
      );
    }
    built.cte = `WITH filtered_games AS (
      SELECT g.id AS game_id, g.content_status, g.event, g.played_at, g.result,
             opponent.color AS opponent_color,
             white_player.display_name AS white_name,
             white_player.rating AS white_rating,
             black_player.display_name AS black_name,
             black_player.rating AS black_rating,
             COALESCE(
               (white_player.rating + black_player.rating) / 2.0,
               white_player.rating, black_player.rating, -1
             ) AS ranking_rating
      FROM games g
      JOIN game_players opponent ON opponent.game_id = g.id
      JOIN game_players white_player
        ON white_player.game_id = g.id AND white_player.color = 'WHITE'
      JOIN game_players black_player
        ON black_player.game_id = g.id AND black_player.color = 'BLACK'
      WHERE ${conditions.join('\n        AND ')}
    )`;
    return built;
  }

  private addParameter(built: BuiltCorpus, value: unknown): string {
    built.parameters.push(value);
    return `$${built.parameters.length}`;
  }

  private addListCondition(
    built: BuiltCorpus,
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
