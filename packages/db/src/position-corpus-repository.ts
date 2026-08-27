import type {
  Color,
  DataSourceType,
  ExactExternalIdentityInput,
  GameContext,
  IdentityProvider,
  PlayerCorpusCounts,
  PlayerCorpusSummary,
  RepresentativeGame,
  ResolvedPlayerIdentity,
  TimeCategory,
} from '@chess-intelligent/domain';

import type { Database } from './database';
import { dateOnly } from './date-values';

interface IdentityPlayerRow {
  player_id: string;
  display_name: string;
  provider: IdentityProvider | null;
  external_id: string | null;
  verification_status: string | null;
}

interface PositionRow {
  id: string;
  normalized_fen_key: string;
  representative_fen: string;
  side_to_move: Color;
}

interface AggregateRow {
  san: string;
  uci: string;
  resulting_position_id: string;
  resulting_fen: string;
  game_count: string | number;
  white_wins: string | number;
  draws: string | number;
  black_wins: string | number;
  perspective_wins: string | number;
  perspective_draws: string | number;
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
  overall_rank: string | number;
}

interface CorpusCountRow {
  total_canonical_games: string | number;
  games_with_moves: string | number;
  metadata_only_games: string | number;
}

interface CorpusSummaryRow extends CorpusCountRow {
  white_games: string | number;
  black_games: string | number;
  otb_games: string | number;
  online_games: string | number;
  unknown_context_games: string | number;
  classical_games: string | number;
  rapid_games: string | number;
  blitz_games: string | number;
  other_time_category_games: string | number;
  earliest_known_game: string | Date | null;
  latest_known_game: string | Date | null;
}

interface SourceCoverageRow {
  source_type: DataSourceType;
  canonical_games: string | number;
  observations: string | number;
}

export interface PositionCorpusRepositoryFilters {
  focalPlayerId: string | null;
  playerColor: Color | null;
  gameContexts: GameContext[];
  timeCategories: TimeCategory[];
  playedFrom: string | null;
  playedTo: string | null;
  minimumOpponentRating: number | null;
  sourceTypes: DataSourceType[];
}

export interface PositionCorpusQuery extends PositionCorpusRepositoryFilters {
  positionId: string;
  sideToMove: Color;
}

export interface RawPositionMoveAggregate {
  san: string;
  uci: string;
  resultingPositionId: string;
  resultingFen: string;
  gameCount: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  perspectiveWins: number;
  perspectiveDraws: number;
  representativeGames: RepresentativeGame[];
}

export interface RawPositionCorpusResult {
  moves: RawPositionMoveAggregate[];
  representativeGames: RepresentativeGame[];
}

function asCount(value: string | number): number {
  return Number(value);
}

function identity(row: IdentityPlayerRow): ResolvedPlayerIdentity {
  return {
    playerId: row.player_id,
    displayName: row.display_name,
    identity:
      row.provider && row.external_id && row.verification_status
        ? {
            provider: row.provider,
            externalId: row.external_id,
            verificationStatus: row.verification_status,
          }
        : null,
  };
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

export class PositionCorpusRepository {
  constructor(private readonly database: Database) {}

  async resolveExactIdentity(
    input: ExactExternalIdentityInput,
  ): Promise<ResolvedPlayerIdentity | null> {
    const result = await this.database.query<IdentityPlayerRow>(
      `SELECT p.id AS player_id, p.display_name, ei.provider, ei.external_id,
              ei.verification_status
       FROM external_identities ei
       JOIN players p ON p.id = ei.player_id
       WHERE ei.provider = $1 AND ei.external_id = $2
         AND ei.verification_status = 'VERIFIED'`,
      [input.provider, input.externalId],
    );
    return result.rows[0] ? identity(result.rows[0]) : null;
  }

  async getPlayer(playerId: string): Promise<ResolvedPlayerIdentity | null> {
    const result = await this.database.query<IdentityPlayerRow>(
      `SELECT p.id AS player_id, p.display_name, ei.provider, ei.external_id,
              ei.verification_status
       FROM players p
       LEFT JOIN external_identities ei
         ON ei.player_id = p.id AND ei.verification_status = 'VERIFIED'
       WHERE p.id = $1
       ORDER BY CASE ei.provider WHEN 'FIDE' THEN 0 ELSE 1 END, ei.created_at
       LIMIT 1`,
      [playerId],
    );
    return result.rows[0] ? identity(result.rows[0]) : null;
  }

  async getPosition(positionId: string): Promise<{
    id: string;
    normalizedFenKey: string;
    representativeFen: string;
    sideToMove: Color;
  } | null> {
    const result = await this.database.query<PositionRow>(
      `SELECT id, normalized_fen_key, representative_fen, side_to_move
       FROM positions WHERE id = $1`,
      [positionId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id.trim(),
          normalizedFenKey: row.normalized_fen_key,
          representativeFen: row.representative_fen,
          sideToMove: row.side_to_move,
        }
      : null;
  }

  async explore(query: PositionCorpusQuery): Promise<RawPositionCorpusResult> {
    const built = this.buildMatchingCorpus(query);
    const perspectiveWins = query.focalPlayerId
      ? `COUNT(*) FILTER (WHERE
           (focal_color = 'WHITE' AND result = '1-0') OR
           (focal_color = 'BLACK' AND result = '0-1'))`
      : `COUNT(*) FILTER (WHERE result = '${query.sideToMove === 'WHITE' ? '1-0' : '0-1'}')`;

    const aggregates = await this.database.query<AggregateRow>(
      `${built.cte}
       SELECT san, uci, resulting_position_id, resulting_fen,
              COUNT(*)::integer AS game_count,
              COUNT(*) FILTER (WHERE result = '1-0')::integer AS white_wins,
              COUNT(*) FILTER (WHERE result = '1/2-1/2')::integer AS draws,
              COUNT(*) FILTER (WHERE result = '0-1')::integer AS black_wins,
              (${perspectiveWins})::integer AS perspective_wins,
              COUNT(*) FILTER (WHERE result = '1/2-1/2')::integer AS perspective_draws
       FROM matching_games
       GROUP BY san, uci, resulting_position_id, resulting_fen
       ORDER BY game_count DESC, san, uci`,
      built.parameters,
    );

    const representatives = await this.database.query<RepresentativeRow>(
      `${built.cte},
       ranked_games AS (
         SELECT matching_games.*,
                ROW_NUMBER() OVER (
                  PARTITION BY uci
                  ORDER BY ranking_rating DESC, played_at DESC NULLS LAST, game_id
                ) AS move_rank,
                ROW_NUMBER() OVER (
                  ORDER BY ranking_rating DESC, played_at DESC NULLS LAST, game_id
                ) AS overall_rank
         FROM matching_games
       )
       SELECT ranked.uci, ranked.game_id, ranked.white_name, ranked.white_rating,
              ranked.black_name, ranked.black_rating, ranked.event, ranked.played_at,
              ranked.result, ranked.move_rank, ranked.overall_rank,
              ARRAY(
                SELECT DISTINCT ds.type
                FROM game_source_records gsr
                JOIN data_sources ds ON ds.id = gsr.data_source_id
                WHERE gsr.game_id = ranked.game_id
                ORDER BY ds.type
              ) AS source_types
       FROM ranked_games ranked
       WHERE ranked.move_rank <= 3 OR ranked.overall_rank <= 5
       ORDER BY ranked.overall_rank, ranked.move_rank`,
      built.parameters,
    );

    const representativesByMove = new Map<string, RepresentativeGame[]>();
    for (const row of representatives.rows) {
      if (asCount(row.move_rank) <= 3) {
        const games = representativesByMove.get(row.uci) ?? [];
        games.push(representative(row));
        representativesByMove.set(row.uci, games);
      }
    }

    return {
      moves: aggregates.rows.map((row) => ({
        san: row.san,
        uci: row.uci,
        resultingPositionId: row.resulting_position_id.trim(),
        resultingFen: row.resulting_fen,
        gameCount: asCount(row.game_count),
        whiteWins: asCount(row.white_wins),
        draws: asCount(row.draws),
        blackWins: asCount(row.black_wins),
        perspectiveWins: asCount(row.perspective_wins),
        perspectiveDraws: asCount(row.perspective_draws),
        representativeGames: representativesByMove.get(row.uci) ?? [],
      })),
      representativeGames: representatives.rows
        .filter((row) => asCount(row.overall_rank) <= 5)
        .sort((left, right) => asCount(left.overall_rank) - asCount(right.overall_rank))
        .map(representative),
    };
  }

  private buildMatchingCorpus(query: PositionCorpusQuery): {
    cte: string;
    parameters: unknown[];
  } {
    const parameters: unknown[] = [query.positionId];
    const conditions = ["g.content_status = 'MOVES_AVAILABLE'", 'po.position_id = $1'];
    const joins: string[] = [];
    const add = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    const addListCondition = (column: string, values: readonly string[]): void => {
      if (values.length > 0) {
        conditions.push(`${column} IN (${values.map((value) => add(value)).join(', ')})`);
      }
    };

    if (query.focalPlayerId) {
      joins.push(
        `JOIN game_players focal
           ON focal.game_id = g.id AND focal.player_id = ${add(query.focalPlayerId)}`,
      );
      if (query.playerColor) {
        conditions.push(`focal.color = ${add(query.playerColor)}`);
      }
      if (query.minimumOpponentRating !== null) {
        conditions.push(
          `CASE focal.color WHEN 'WHITE' THEN black_player.rating ELSE white_player.rating END >= ${add(query.minimumOpponentRating)}`,
        );
      }
    }

    addListCondition('g.game_context', query.gameContexts);
    addListCondition('g.time_category', query.timeCategories);
    if (query.playedFrom) {
      conditions.push(`g.played_at >= ${add(query.playedFrom)}::date`);
    }
    if (query.playedTo) {
      conditions.push(`g.played_at <= ${add(query.playedTo)}::date`);
    }
    if (query.sourceTypes.length > 0) {
      const sourcePlaceholders = query.sourceTypes.map((source) => add(source)).join(', ');
      conditions.push(
        `EXISTS (
           SELECT 1
           FROM game_source_records filtered_source
           JOIN data_sources filtered_data_source
             ON filtered_data_source.id = filtered_source.data_source_id
           WHERE filtered_source.game_id = g.id
             AND filtered_data_source.type IN (${sourcePlaceholders})
         )`,
      );
    }

    return {
      parameters,
      cte: `WITH matching_games AS (
        SELECT DISTINCT ON (po.game_id)
               po.game_id, po.ply, move.san, move.uci, po.resulting_position_id,
               resulting.representative_fen AS resulting_fen,
               g.event, g.played_at, g.result,
               white_player.display_name AS white_name,
               white_player.rating AS white_rating,
               black_player.display_name AS black_name,
               black_player.rating AS black_rating,
               ${query.focalPlayerId ? 'focal.color' : 'NULL::text'} AS focal_color,
               COALESCE(
                 (white_player.rating + black_player.rating) / 2.0,
                 white_player.rating,
                 black_player.rating,
                 -1
               ) AS ranking_rating
        FROM position_occurrences po
        JOIN moves move ON move.id = po.next_move_id
        JOIN positions resulting ON resulting.id = po.resulting_position_id
        JOIN games g ON g.id = po.game_id
        JOIN game_players white_player
          ON white_player.game_id = g.id AND white_player.color = 'WHITE'
        JOIN game_players black_player
          ON black_player.game_id = g.id AND black_player.color = 'BLACK'
        ${joins.join('\n')}
        WHERE ${conditions.join('\n          AND ')}
        ORDER BY po.game_id, po.ply
      )`,
    };
  }

  async getPlayerCorpusCounts(playerId: string): Promise<PlayerCorpusCounts> {
    const result = await this.database.query<CorpusCountRow>(
      `SELECT COUNT(*)::integer AS total_canonical_games,
              COUNT(*) FILTER (WHERE g.content_status = 'MOVES_AVAILABLE')::integer
                AS games_with_moves,
              COUNT(*) FILTER (WHERE g.content_status = 'METADATA_ONLY')::integer
                AS metadata_only_games
       FROM game_players gp
       JOIN games g ON g.id = gp.game_id
       WHERE gp.player_id = $1`,
      [playerId],
    );
    const row = result.rows[0];
    return {
      totalCanonicalGames: row ? asCount(row.total_canonical_games) : 0,
      gamesWithMoves: row ? asCount(row.games_with_moves) : 0,
      metadataOnlyGames: row ? asCount(row.metadata_only_games) : 0,
    };
  }

  async getPlayerCorpusSummary(playerId: string): Promise<PlayerCorpusSummary | null> {
    const player = await this.getPlayer(playerId);
    if (!player) {
      return null;
    }

    const [summary, coverage] = await Promise.all([
      this.database.query<CorpusSummaryRow>(
        `SELECT COUNT(*)::integer AS total_canonical_games,
                COUNT(*) FILTER (WHERE g.content_status = 'MOVES_AVAILABLE')::integer
                  AS games_with_moves,
                COUNT(*) FILTER (WHERE g.content_status = 'METADATA_ONLY')::integer
                  AS metadata_only_games,
                COUNT(*) FILTER (WHERE gp.color = 'WHITE')::integer AS white_games,
                COUNT(*) FILTER (WHERE gp.color = 'BLACK')::integer AS black_games,
                COUNT(*) FILTER (WHERE g.game_context = 'OTB')::integer AS otb_games,
                COUNT(*) FILTER (WHERE g.game_context = 'ONLINE')::integer AS online_games,
                COUNT(*) FILTER (WHERE g.game_context = 'UNKNOWN')::integer
                  AS unknown_context_games,
                COUNT(*) FILTER (WHERE g.time_category = 'CLASSICAL')::integer
                  AS classical_games,
                COUNT(*) FILTER (WHERE g.time_category = 'RAPID')::integer AS rapid_games,
                COUNT(*) FILTER (WHERE g.time_category = 'BLITZ')::integer AS blitz_games,
                COUNT(*) FILTER (
                  WHERE g.time_category NOT IN ('CLASSICAL', 'RAPID', 'BLITZ')
                )::integer AS other_time_category_games,
                MIN(g.played_at) AS earliest_known_game,
                MAX(g.played_at) AS latest_known_game
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         WHERE gp.player_id = $1`,
        [playerId],
      ),
      this.database.query<SourceCoverageRow>(
        `SELECT ds.type AS source_type,
                COUNT(DISTINCT gp.game_id)::integer AS canonical_games,
                COUNT(gsr.id)::integer AS observations
         FROM game_players gp
         JOIN game_source_records gsr ON gsr.game_id = gp.game_id
         JOIN data_sources ds ON ds.id = gsr.data_source_id
         WHERE gp.player_id = $1
         GROUP BY ds.type
         ORDER BY ds.type`,
        [playerId],
      ),
    ]);
    const row = summary.rows[0];
    if (!row) {
      return null;
    }

    return {
      player,
      totalCanonicalGames: asCount(row.total_canonical_games),
      gamesWithMoves: asCount(row.games_with_moves),
      metadataOnlyGames: asCount(row.metadata_only_games),
      whiteGames: asCount(row.white_games),
      blackGames: asCount(row.black_games),
      otbGames: asCount(row.otb_games),
      onlineGames: asCount(row.online_games),
      unknownContextGames: asCount(row.unknown_context_games),
      classicalGames: asCount(row.classical_games),
      rapidGames: asCount(row.rapid_games),
      blitzGames: asCount(row.blitz_games),
      otherTimeCategoryGames: asCount(row.other_time_category_games),
      earliestKnownGame: dateOnly(row.earliest_known_game),
      latestKnownGame: dateOnly(row.latest_known_game),
      sourceCoverage: coverage.rows.map((source) => ({
        sourceType: source.source_type,
        canonicalGames: asCount(source.canonical_games),
        observations: asCount(source.observations),
      })),
    };
  }
}
