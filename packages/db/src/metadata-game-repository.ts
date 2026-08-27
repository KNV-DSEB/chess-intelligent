import { randomUUID } from 'node:crypto';

import type {
  Color,
  DataSourceType,
  MetadataGameInput,
  ParsedGame,
  ReconciliationCandidate,
  ReconciliationCandidateFinder,
  ReconciliationGameSnapshot,
  ReconciliationSourceObservation,
} from '@chess-intelligent/domain';
import { metadataCandidateIdentity } from '@chess-intelligent/domain';

import type { Database, QueryClient } from './database';
import { dateOnly } from './date-values';
import { insertParsedGameMoves } from './move-persistence';

interface SourceRow {
  id: string;
}

interface IdentityRow {
  player_id: string;
}

interface AttachmentStateRow {
  id: string;
  content_status: 'METADATA_ONLY' | 'MOVES_AVAILABLE';
  fingerprint: string | null;
}

interface CandidateRow {
  game_id: string;
  content_status: 'METADATA_ONLY' | 'MOVES_AVAILABLE';
  event: string | null;
  played_at: string | Date | null;
  round: string | null;
  board_number: string | null;
  result: string;
  white_name: string;
  white_fide_id: string | null;
  black_name: string;
  black_fide_id: string | null;
}

interface CandidateSourceRow {
  game_id: string;
  source_type: DataSourceType;
  external_id: string | null;
  external_tournament_id: string | null;
}

export type PgnAttachmentErrorCode =
  | 'GAME_NOT_FOUND'
  | 'GAME_NOT_METADATA_ONLY'
  | 'DIFFERENT_PGN_ALREADY_ATTACHED'
  | 'PGN_BELONGS_TO_ANOTHER_GAME';

export class PgnAttachmentError extends Error {
  constructor(
    readonly code: PgnAttachmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PgnAttachmentError';
  }
}

export interface MetadataImportResult {
  status: 'created';
  gameId: string;
  contentStatus: 'METADATA_ONLY';
  verificationStatus: 'UNVERIFIED';
}

export interface PgnAttachmentResult {
  status: 'attached' | 'already_attached';
  gameId: string;
  contentStatus: 'MOVES_AVAILABLE';
  verificationStatus: 'VERIFIED';
}

function normalizedName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

async function sourceId(client: QueryClient, sourceType: DataSourceType): Promise<string> {
  const result = await client.query<SourceRow>('SELECT id FROM data_sources WHERE type = $1', [
    sourceType,
  ]);
  const source = result.rows[0];
  if (!source) {
    throw new Error(`Data source ${sourceType} is not configured.`);
  }
  return source.id;
}

export class MetadataGameRepository implements ReconciliationCandidateFinder {
  constructor(private readonly database: Database) {}

  async createMetadataGame(
    metadata: MetadataGameInput,
    rawPayload: unknown,
  ): Promise<MetadataImportResult> {
    if (metadata.white.fideId && metadata.white.fideId === metadata.black.fideId) {
      throw new Error('White and Black cannot share the same FIDE identity.');
    }

    return this.database.transaction(async (client) => {
      const gameId = randomUUID();
      const dataSourceId = await sourceId(client, metadata.sourceType);
      const whitePlayerId = await this.resolvePlayer(client, metadata.white);
      const blackPlayerId = await this.resolvePlayer(client, metadata.black);

      if (whitePlayerId === blackPlayerId) {
        throw new Error('White and Black resolved to the same internal player.');
      }

      await client.query(
        `INSERT INTO games (
           id, pgn_status, content_status, verification_status, metadata_candidate_key,
           event, site, played_at, played_date_text, round, result, time_control, rated,
           board_number, game_context, time_category, normalized_headers
         ) VALUES (
           $1, 'METADATA_ONLY', 'METADATA_ONLY', 'UNVERIFIED', $2,
           $3, $4, $5::date, to_char($5::date, 'YYYY-MM-DD'),
           $6, $7, $8, $9, $10, $11, $12, '{}'::jsonb
         )`,
        [
          gameId,
          metadataCandidateIdentity(metadata),
          metadata.event,
          metadata.site,
          metadata.playedAt,
          metadata.round,
          metadata.result,
          metadata.timeControl,
          metadata.rated,
          metadata.boardNumber,
          metadata.gameContext,
          metadata.timeCategory,
        ],
      );

      await this.insertGamePlayer(client, gameId, 'WHITE', whitePlayerId, metadata.white);
      await this.insertGamePlayer(client, gameId, 'BLACK', blackPlayerId, metadata.black);
      await client.query(
        `INSERT INTO game_source_records (
           id, game_id, data_source_id, external_id, external_tournament_id,
           observation_kind, permission_basis, raw_source_metadata, confidence, retrieved_at
         ) VALUES ($1, $2, $3, $4, $5, 'METADATA', 'USER_SUPPLIED', $6::jsonb, 1.0, now())`,
        [
          randomUUID(),
          gameId,
          dataSourceId,
          metadata.externalGameId,
          metadata.externalTournamentId,
          JSON.stringify({ payload: rawPayload, ingestionMethod: 'DIRECT_USER_METADATA_ENTRY' }),
        ],
      );

      return {
        status: 'created',
        gameId,
        contentStatus: 'METADATA_ONLY',
        verificationStatus: 'UNVERIFIED',
      };
    });
  }

  private async resolvePlayer(
    client: QueryClient,
    observation: { displayName: string; fideId: string | null },
  ): Promise<string> {
    if (observation.fideId) {
      const existing = await client.query<IdentityRow>(
        `SELECT player_id FROM external_identities
         WHERE provider = 'FIDE' AND external_id = $1`,
        [observation.fideId],
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE external_identities
           SET verification_status = 'VERIFIED', confidence = 1.0,
               link_reason = 'EXPLICIT_REVIEWED_METADATA_FIDE_ID', updated_at = now()
           WHERE provider = 'FIDE' AND external_id = $1`,
          [observation.fideId],
        );
        await client.query(
          `UPDATE players SET identity_resolution_status = 'RESOLVED'
           WHERE id = $1`,
          [existing.rows[0].player_id],
        );
        return existing.rows[0].player_id;
      }
    }

    const playerId = randomUUID();
    await client.query(
      `INSERT INTO players (id, display_name, normalized_name, identity_resolution_status)
       VALUES ($1, $2, $3, $4)`,
      [
        playerId,
        observation.displayName,
        normalizedName(observation.displayName),
        observation.fideId ? 'RESOLVED' : 'UNRESOLVED',
      ],
    );

    if (!observation.fideId) {
      return playerId;
    }

    const inserted = await client.query<IdentityRow>(
      `INSERT INTO external_identities (
         id, player_id, provider, external_id, display_handle,
         verification_status, confidence, link_reason
       ) VALUES ($1, $2, 'FIDE', $3, $4, 'VERIFIED', 1.0, 'EXPLICIT_REVIEWED_METADATA_FIDE_ID')
       ON CONFLICT (provider, external_id) DO NOTHING
       RETURNING player_id`,
      [randomUUID(), playerId, observation.fideId, observation.displayName],
    );
    if (inserted.rows[0]) {
      return inserted.rows[0].player_id;
    }

    // A concurrent transaction inserted the identity first. Remove our unused observation-only
    // player and reuse the identity winner rather than creating a false duplicate.
    await client.query('DELETE FROM players WHERE id = $1', [playerId]);
    const winner = await client.query<IdentityRow>(
      `SELECT player_id FROM external_identities
       WHERE provider = 'FIDE' AND external_id = $1`,
      [observation.fideId],
    );
    if (!winner.rows[0]) {
      throw new Error('The FIDE identity could not be created or located.');
    }
    return winner.rows[0].player_id;
  }

  private async insertGamePlayer(
    client: QueryClient,
    gameId: string,
    color: Color,
    playerId: string,
    observation: { displayName: string; rating: number | null },
  ): Promise<void> {
    await client.query(
      `INSERT INTO game_players (id, game_id, color, player_id, display_name, rating)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), gameId, color, playerId, observation.displayName, observation.rating],
    );
  }

  async getAttachmentState(gameId: string): Promise<AttachmentStateRow | null> {
    const result = await this.database.query<AttachmentStateRow>(
      'SELECT id, content_status, fingerprint FROM games WHERE id = $1',
      [gameId],
    );
    return result.rows[0] ?? null;
  }

  async attachPgn(input: {
    gameId: string;
    parsed: ParsedGame;
    sourceType: DataSourceType;
    externalGameId: string | null;
    externalTournamentId: string | null;
    reconciliation: ReconciliationCandidate;
  }): Promise<PgnAttachmentResult> {
    return this.database.transaction(async (client) => {
      const stateResult = await client.query<AttachmentStateRow>(
        'SELECT id, content_status, fingerprint FROM games WHERE id = $1 FOR UPDATE',
        [input.gameId],
      );
      const state = stateResult.rows[0];
      if (!state) {
        throw new PgnAttachmentError('GAME_NOT_FOUND', 'The canonical game does not exist.');
      }
      if (state.content_status === 'MOVES_AVAILABLE') {
        if (state.fingerprint === input.parsed.fingerprint) {
          return {
            status: 'already_attached',
            gameId: input.gameId,
            contentStatus: 'MOVES_AVAILABLE',
            verificationStatus: 'VERIFIED',
          };
        }
        throw new PgnAttachmentError(
          'DIFFERENT_PGN_ALREADY_ATTACHED',
          'This game already has a materially different PGN attached.',
        );
      }
      if (state.content_status !== 'METADATA_ONLY') {
        throw new PgnAttachmentError(
          'GAME_NOT_METADATA_ONLY',
          'Only metadata-only games can receive their first PGN.',
        );
      }

      const fingerprintOwner = await client.query<{ id: string }>(
        'SELECT id FROM games WHERE fingerprint = $1 AND id <> $2',
        [input.parsed.fingerprint, input.gameId],
      );
      if (fingerprintOwner.rows[0]) {
        throw new PgnAttachmentError(
          'PGN_BELONGS_TO_ANOTHER_GAME',
          'This PGN fingerprint already belongs to another canonical game and requires separate review.',
        );
      }

      await insertParsedGameMoves(client, input.gameId, input.parsed);

      await client.query(
        `UPDATE games
         SET fingerprint = $2,
             pgn_status = 'PGN_VERIFIED',
             content_status = 'MOVES_AVAILABLE',
             verification_status = 'VERIFIED',
             event = COALESCE(event, $3),
             site = COALESCE(site, $4),
             played_at = COALESCE(played_at, $5),
             played_date_text = COALESCE(played_date_text, $6),
             round = COALESCE(round, $7),
             result = CASE WHEN result = '*' THEN $8 ELSE result END,
             termination = COALESCE(termination, $9),
             time_control = COALESCE(time_control, $10),
             rated = COALESCE(rated, $11),
             board_number = COALESCE(board_number, $12),
             initial_fen = $13,
             normalized_headers = $14::jsonb || normalized_headers,
             updated_at = now()
         WHERE id = $1`,
        [
          input.gameId,
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
          input.parsed.initialFen,
          JSON.stringify(input.parsed.headers),
        ],
      );

      const dataSourceId = await sourceId(client, input.sourceType);
      await client.query(
        `INSERT INTO game_source_records (
           id, game_id, data_source_id, external_id, external_tournament_id,
           observation_kind, permission_basis, raw_pgn, original_pgn_sha256,
           raw_source_metadata, confidence, retrieved_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'PGN', 'USER_SUPPLIED', $6, $7, $8::jsonb, 1.0, now()
         )`,
        [
          randomUUID(),
          input.gameId,
          dataSourceId,
          input.externalGameId,
          input.externalTournamentId,
          input.parsed.rawPgn,
          input.parsed.rawPgnSha256,
          JSON.stringify({
            ingestionMethod: 'REVIEWED_PGN_ATTACHMENT',
            reconciliationClassification: input.reconciliation.classification,
            matchedFields: input.reconciliation.matchedFields,
            conflictingFields: input.reconciliation.conflictingFields,
          }),
        ],
      );

      return {
        status: 'attached',
        gameId: input.gameId,
        contentStatus: 'MOVES_AVAILABLE',
        verificationStatus: 'VERIFIED',
      };
    });
  }

  async findReconciliationCandidates(parsed: ParsedGame): Promise<ReconciliationGameSnapshot[]> {
    const event = parsed.event ? normalizedName(parsed.event) : null;
    const whiteName = normalizedName(parsed.white.displayName);
    const blackName = normalizedName(parsed.black.displayName);
    return this.loadSnapshots(
      `g.content_status = 'METADATA_ONLY' AND (
         ($1::date IS NOT NULL AND g.played_at = $1::date)
         OR ($2::text IS NOT NULL AND lower(trim(g.event)) = $2)
         OR ($3::text IS NOT NULL AND wei.external_id = $3)
         OR ($4::text IS NOT NULL AND bei.external_id = $4)
         OR lower(trim(wgp.display_name)) = $5
         OR lower(trim(bgp.display_name)) = $6
       )`,
      [parsed.playedAt, event, parsed.white.fideId, parsed.black.fideId, whiteName, blackName],
    );
  }

  async findReconciliationGame(gameId: string): Promise<ReconciliationGameSnapshot | null> {
    const snapshots = await this.loadSnapshots('g.id = $1', [gameId]);
    return snapshots[0] ?? null;
  }

  private async loadSnapshots(
    condition: string,
    parameters: readonly unknown[],
  ): Promise<ReconciliationGameSnapshot[]> {
    const candidates = await this.database.query<CandidateRow>(
      `SELECT g.id AS game_id, g.content_status, g.event, g.played_at, g.round,
              g.board_number, g.result, wgp.display_name AS white_name,
              wei.external_id AS white_fide_id, bgp.display_name AS black_name,
              bei.external_id AS black_fide_id
       FROM games g
       JOIN game_players wgp ON wgp.game_id = g.id AND wgp.color = 'WHITE'
       JOIN game_players bgp ON bgp.game_id = g.id AND bgp.color = 'BLACK'
       LEFT JOIN external_identities wei
         ON wei.player_id = wgp.player_id AND wei.provider = 'FIDE'
        AND wei.verification_status = 'VERIFIED'
       LEFT JOIN external_identities bei
         ON bei.player_id = bgp.player_id AND bei.provider = 'FIDE'
        AND bei.verification_status = 'VERIFIED'
       WHERE ${condition}
       ORDER BY g.played_at DESC NULLS LAST, g.created_at DESC
       LIMIT 100`,
      parameters,
    );
    if (candidates.rows.length === 0) {
      return [];
    }

    const placeholders = candidates.rows.map((_, index) => `$${index + 1}`).join(', ');
    const sources = await this.database.query<CandidateSourceRow>(
      `SELECT gsr.game_id, ds.type AS source_type, gsr.external_id,
              gsr.external_tournament_id
       FROM game_source_records gsr
       JOIN data_sources ds ON ds.id = gsr.data_source_id
       WHERE gsr.game_id IN (${placeholders})`,
      candidates.rows.map((candidate) => candidate.game_id),
    );
    const sourcesByGame = new Map<string, ReconciliationSourceObservation[]>();
    for (const source of sources.rows) {
      const observations = sourcesByGame.get(source.game_id) ?? [];
      observations.push({
        sourceType: source.source_type,
        externalGameId: source.external_id,
        externalTournamentId: source.external_tournament_id,
      });
      sourcesByGame.set(source.game_id, observations);
    }

    return candidates.rows.map((candidate) => ({
      gameId: candidate.game_id,
      contentStatus: candidate.content_status,
      event: candidate.event,
      playedAt: dateOnly(candidate.played_at),
      round: candidate.round,
      boardNumber: candidate.board_number,
      result: candidate.result,
      players: [
        {
          color: 'WHITE',
          displayName: candidate.white_name,
          fideId: candidate.white_fide_id,
        },
        {
          color: 'BLACK',
          displayName: candidate.black_name,
          fideId: candidate.black_fide_id,
        },
      ],
      sources: sourcesByGame.get(candidate.game_id) ?? [],
    }));
  }
}
