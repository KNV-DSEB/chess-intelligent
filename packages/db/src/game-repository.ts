import { randomUUID } from 'node:crypto';

import type { Color, DataSourceType, ImportPgnResult, ParsedGame } from '@chess-intelligent/domain';

import type { Database, QueryClient } from './database';
import { dateOnly } from './date-values';
import { insertParsedGameMoves } from './move-persistence';

interface SourceRow {
  id: string;
  type: DataSourceType;
  integration_status: string;
}

interface IdRow {
  id: string;
}

interface IdentityRow {
  player_id: string;
}

interface GameRow {
  id: string;
  pgn_status: string;
  content_status: string;
  verification_status: string;
  event: string | null;
  site: string | null;
  played_at: string | Date | null;
  played_date_text: string | null;
  round: string | null;
  result: string;
  termination: string | null;
  time_control: string | null;
  rated: boolean | null;
  board_number: string | null;
  game_context: string;
  time_category: string;
  initial_fen: string | null;
  normalized_headers: Record<string, string> | string;
  created_at: string | Date;
}

interface PlayerRow {
  id: string;
  color: Color;
  display_name: string;
  rating: number | null;
  fide_id: string | null;
  fide_verification_status: string | null;
}

interface SourceRecordRow {
  id: string;
  source_type: DataSourceType;
  external_id: string | null;
  source_reference: string | null;
  permission_basis: string;
  raw_pgn: string | null;
  confidence: string | number | null;
  retrieved_at: string | Date | null;
  imported_at: string | Date;
  observation_kind: 'METADATA' | 'PGN';
  external_tournament_id: string | null;
  raw_source_metadata: Record<string, unknown> | string;
}

interface MoveRow {
  ply: number;
  san: string;
  uci: string;
  from_square: string;
  to_square: string;
  promotion: string | null;
  fen_after: string;
  position_id: string;
  side_to_move: Color;
}

export interface GameDetails {
  id: string;
  pgnStatus: string;
  contentStatus: string;
  verificationStatus: string;
  headers: Record<string, string>;
  event: string | null;
  site: string | null;
  playedAt: string | null;
  playedDateText: string | null;
  round: string | null;
  result: string;
  termination: string | null;
  timeControl: string | null;
  rated: boolean | null;
  boardNumber: string | null;
  gameContext: string;
  timeCategory: string;
  initialFen: string | null;
  createdAt: string;
  players: Array<{
    id: string;
    color: Color;
    displayName: string;
    rating: number | null;
    fideId: string | null;
    fideVerificationStatus: string | null;
  }>;
  provenance: Array<{
    id: string;
    sourceType: DataSourceType;
    externalId: string | null;
    sourceReference: string | null;
    permissionBasis: string;
    rawPgn: string | null;
    confidence: number | null;
    retrievedAt: string | null;
    importedAt: string;
    observationKind: 'METADATA' | 'PGN';
    externalTournamentId: string | null;
    rawMetadata: Record<string, unknown>;
  }>;
  moves: Array<{
    ply: number;
    san: string;
    uci: string;
    from: string;
    to: string;
    promotion: string | null;
    fenAfter: string;
    positionId: string;
    sideToMove: Color;
  }>;
}

function normalizedName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function iso(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

async function sourceByType(client: QueryClient, sourceType: DataSourceType): Promise<SourceRow> {
  const source = await client.query<SourceRow>(
    'SELECT id, type, integration_status FROM data_sources WHERE type = $1',
    [sourceType],
  );
  const row = source.rows[0];
  if (!row) {
    throw new Error(`Data source ${sourceType} is not configured.`);
  }
  return row;
}

export class GameRepository {
  constructor(private readonly database: Database) {}

  async createImportJob(input: {
    sourceType: DataSourceType;
    externalId: string | null;
    rawPgnSha256: string;
  }): Promise<string> {
    const source = await sourceByType(this.database, input.sourceType);
    const importJobId = randomUUID();
    await this.database.query(
      `INSERT INTO import_jobs
        (id, data_source_id, status, external_id, raw_pgn_sha256)
       VALUES ($1, $2, 'PENDING', $3, $4)`,
      [importJobId, source.id, input.externalId, input.rawPgnSha256],
    );
    return importJobId;
  }

  async failImportJob(importJobId: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.database.query(
      `UPDATE import_jobs
       SET status = 'FAILED', error_code = $2, error_message = $3, completed_at = now()
       WHERE id = $1 AND status = 'PENDING'`,
      [importJobId, errorCode, errorMessage.slice(0, 2000)],
    );
  }

  async persistImportedGame(input: {
    parsed: ParsedGame;
    sourceType: DataSourceType;
    externalId: string | null;
    importJobId: string;
  }): Promise<ImportPgnResult> {
    return this.database.transaction(async (client) => {
      const source = await sourceByType(client, input.sourceType);
      const gameId = randomUUID();
      const inserted = await client.query<IdRow>(
        `INSERT INTO games (
           id, fingerprint, pgn_status, content_status, verification_status,
           event, site, played_at, played_date_text, round,
           result, termination, time_control, rated, board_number, game_context, time_category,
           initial_fen, normalized_headers
         ) VALUES (
           $1, $2, 'PGN_IMPORTED', 'MOVES_AVAILABLE', 'UNVERIFIED', $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb
         )
         ON CONFLICT (fingerprint) DO NOTHING
         RETURNING id`,
        [
          gameId,
          input.parsed.fingerprint,
          input.parsed.event,
          input.parsed.site,
          input.parsed.playedAt,
          input.parsed.playedDateText,
          input.parsed.round,
          input.parsed.result,
          input.parsed.termination,
          input.parsed.timeControl,
          input.parsed.rated,
          input.parsed.boardNumber,
          input.parsed.gameContext,
          input.parsed.timeCategory,
          input.parsed.initialFen,
          JSON.stringify(input.parsed.headers),
        ],
      );

      const created = inserted.rowCount === 1;
      let canonicalGameId = inserted.rows[0]?.id;

      if (!canonicalGameId) {
        const existing = await client.query<IdRow>('SELECT id FROM games WHERE fingerprint = $1', [
          input.parsed.fingerprint,
        ]);
        canonicalGameId = existing.rows[0]?.id;
      }
      if (!canonicalGameId) {
        throw new Error('The canonical game could not be created or located.');
      }

      if (created) {
        await this.insertPlayerObservation(client, canonicalGameId, 'WHITE', input.parsed.white);
        await this.insertPlayerObservation(client, canonicalGameId, 'BLACK', input.parsed.black);

        await insertParsedGameMoves(client, canonicalGameId, input.parsed);
      }

      await client.query(
        `INSERT INTO game_source_records (
           id, game_id, data_source_id, import_job_id, external_id, observation_kind,
           permission_basis, raw_pgn, original_pgn_sha256, raw_source_metadata,
           confidence, retrieved_at
         ) VALUES ($1, $2, $3, $4, $5, 'PGN', 'USER_SUPPLIED', $6, $7, $8::jsonb, 1.0, now())`,
        [
          randomUUID(),
          canonicalGameId,
          source.id,
          input.importJobId,
          input.externalId,
          input.parsed.rawPgn,
          input.parsed.rawPgnSha256,
          JSON.stringify({ ingestionMethod: 'DIRECT_USER_INPUT' }),
        ],
      );

      const resultStatus = created ? 'CREATED' : 'ALREADY_EXISTS';
      await client.query(
        `UPDATE import_jobs
         SET status = 'COMPLETED', result_status = $2, game_id = $3, completed_at = now()
         WHERE id = $1`,
        [input.importJobId, resultStatus, canonicalGameId],
      );

      return {
        status: created ? 'created' : 'already_exists',
        gameId: canonicalGameId,
        importJobId: input.importJobId,
      };
    });
  }

  private async insertPlayerObservation(
    client: QueryClient,
    gameId: string,
    color: Color,
    player: { displayName: string; rating: number | null; fideId: string | null },
  ): Promise<void> {
    let playerId: string | null = null;
    if (player.fideId) {
      const identity = await client.query<IdentityRow>(
        `SELECT player_id FROM external_identities
         WHERE provider = 'FIDE' AND external_id = $1`,
        [player.fideId],
      );
      playerId = identity.rows[0]?.player_id ?? null;
      if (playerId) {
        await client.query(
          `UPDATE external_identities
           SET verification_status = 'VERIFIED', confidence = 1.0,
               link_reason = 'EXPLICIT_USER_PGN_FIDE_ID', updated_at = now()
           WHERE provider = 'FIDE' AND external_id = $1`,
          [player.fideId],
        );
        await client.query(
          `UPDATE players SET identity_resolution_status = 'RESOLVED' WHERE id = $1`,
          [playerId],
        );
      }
    }

    if (!playerId) {
      playerId = randomUUID();
      await client.query(
        `INSERT INTO players (id, display_name, normalized_name, identity_resolution_status)
         VALUES ($1, $2, $3, $4)`,
        [
          playerId,
          player.displayName,
          normalizedName(player.displayName),
          player.fideId ? 'RESOLVED' : 'UNRESOLVED',
        ],
      );
    }

    if (player.fideId) {
      const insertedIdentity = await client.query<IdentityRow>(
        `INSERT INTO external_identities (
           id, player_id, provider, external_id, display_handle,
           verification_status, confidence, link_reason
         ) VALUES ($1, $2, 'FIDE', $3, $4, 'VERIFIED', 1.0, 'EXPLICIT_USER_PGN_FIDE_ID')
         ON CONFLICT (provider, external_id) DO NOTHING
         RETURNING player_id`,
        [randomUUID(), playerId, player.fideId, player.displayName],
      );
      if (!insertedIdentity.rows[0]) {
        const winner = await client.query<IdentityRow>(
          `SELECT player_id FROM external_identities
           WHERE provider = 'FIDE' AND external_id = $1`,
          [player.fideId],
        );
        const winnerId = winner.rows[0]?.player_id;
        if (!winnerId) {
          throw new Error('The FIDE identity could not be created or located.');
        }
        if (winnerId !== playerId) {
          await client.query('DELETE FROM players WHERE id = $1', [playerId]);
          playerId = winnerId;
        }
      }
    }

    // Names remain per-game observations. Only an explicit FIDE identity can reuse a Player here.
    await client.query(
      `INSERT INTO game_players (id, game_id, color, player_id, display_name, rating)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), gameId, color, playerId, player.displayName, player.rating],
    );
  }

  async getGame(gameId: string): Promise<GameDetails | null> {
    const game = await this.database.query<GameRow>(
      `SELECT id, pgn_status, content_status, verification_status, event, site,
              played_at, played_date_text, round, result,
              termination, time_control, rated, board_number, game_context, time_category,
              initial_fen, normalized_headers, created_at
       FROM games WHERE id = $1`,
      [gameId],
    );
    const row = game.rows[0];
    if (!row) {
      return null;
    }

    const [players, provenance, moves] = await Promise.all([
      this.database.query<PlayerRow>(
        `SELECT p.id, gp.color, gp.display_name, gp.rating,
                (SELECT ei.external_id FROM external_identities ei
                 WHERE ei.player_id = p.id AND ei.provider = 'FIDE'
                 ORDER BY CASE ei.verification_status WHEN 'VERIFIED' THEN 0 ELSE 1 END,
                          ei.created_at
                 LIMIT 1) AS fide_id,
                (SELECT ei.verification_status FROM external_identities ei
                 WHERE ei.player_id = p.id AND ei.provider = 'FIDE'
                 ORDER BY CASE ei.verification_status WHEN 'VERIFIED' THEN 0 ELSE 1 END,
                          ei.created_at
                 LIMIT 1) AS fide_verification_status
         FROM game_players gp
         JOIN players p ON p.id = gp.player_id
         WHERE gp.game_id = $1
         ORDER BY CASE gp.color WHEN 'WHITE' THEN 0 ELSE 1 END`,
        [gameId],
      ),
      this.database.query<SourceRecordRow>(
        `SELECT gsr.id, ds.type AS source_type, gsr.external_id, gsr.source_reference,
                gsr.permission_basis, gsr.raw_pgn, gsr.confidence, gsr.retrieved_at,
                gsr.imported_at, gsr.observation_kind, gsr.external_tournament_id,
                gsr.raw_source_metadata
         FROM game_source_records gsr
         JOIN data_sources ds ON ds.id = gsr.data_source_id
         WHERE gsr.game_id = $1
         ORDER BY gsr.imported_at`,
        [gameId],
      ),
      this.database.query<MoveRow>(
        `SELECT m.ply, m.san, m.uci, m.from_square, m.to_square, m.promotion,
                m.fen_after, m.position_id, p.side_to_move
         FROM moves m
         JOIN positions p ON p.id = m.position_id
         WHERE m.game_id = $1
         ORDER BY m.ply`,
        [gameId],
      ),
    ]);

    const headers =
      typeof row.normalized_headers === 'string'
        ? (JSON.parse(row.normalized_headers) as Record<string, string>)
        : row.normalized_headers;

    return {
      id: row.id,
      pgnStatus: row.pgn_status,
      contentStatus: row.content_status,
      verificationStatus: row.verification_status,
      headers,
      event: row.event,
      site: row.site,
      playedAt: dateOnly(row.played_at),
      playedDateText: row.played_date_text,
      round: row.round,
      result: row.result,
      termination: row.termination,
      timeControl: row.time_control,
      rated: row.rated,
      boardNumber: row.board_number,
      gameContext: row.game_context,
      timeCategory: row.time_category,
      initialFen: row.initial_fen,
      createdAt: iso(row.created_at) ?? '',
      players: players.rows.map((player) => ({
        id: player.id,
        color: player.color,
        displayName: player.display_name,
        rating: player.rating,
        fideId: player.fide_id,
        fideVerificationStatus: player.fide_verification_status,
      })),
      provenance: provenance.rows.map((source) => ({
        id: source.id,
        sourceType: source.source_type,
        externalId: source.external_id,
        sourceReference: source.source_reference,
        permissionBasis: source.permission_basis,
        rawPgn: source.raw_pgn,
        confidence: source.confidence === null ? null : Number(source.confidence),
        retrievedAt: iso(source.retrieved_at),
        importedAt: iso(source.imported_at) ?? '',
        observationKind: source.observation_kind,
        externalTournamentId: source.external_tournament_id,
        rawMetadata:
          typeof source.raw_source_metadata === 'string'
            ? (JSON.parse(source.raw_source_metadata) as Record<string, unknown>)
            : source.raw_source_metadata,
      })),
      moves: moves.rows.map((move) => ({
        ply: move.ply,
        san: move.san,
        uci: move.uci,
        from: move.from_square.trim(),
        to: move.to_square.trim(),
        promotion: move.promotion?.trim() ?? null,
        fenAfter: move.fen_after,
        positionId: move.position_id.trim(),
        sideToMove: move.side_to_move,
      })),
    };
  }
}
