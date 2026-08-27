import { normalizePositionFen, type NormalizedChessPosition } from '@chess-intelligent/chess-core';
import type { PositionCorpusRepository } from '@chess-intelligent/db';
import type {
  ExactExternalIdentityInput,
  PlayerCorpusSummary,
  PositionCorpusFilters,
  PositionExploreResult,
  ResolvedPlayerIdentity,
  ScorePerspective,
} from '@chess-intelligent/domain';
import { calculateObservedMoveStatistics } from '@chess-intelligent/domain';

export type PositionExplorerErrorCode =
  'INVALID_CORPUS_FILTERS' | 'IDENTITY_NOT_FOUND' | 'PLAYER_NOT_FOUND' | 'POSITION_NOT_FOUND';

export class PositionExplorerError extends Error {
  constructor(
    readonly code: PositionExplorerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PositionExplorerError';
  }
}

export interface ExplorePositionInput {
  positionId: string | null;
  fen: string | null;
  filters: PositionCorpusFilters;
}

export class PositionExplorerApplicationService {
  constructor(private readonly repository: PositionCorpusRepository) {}

  async resolveIdentity(
    exactIdentity: ExactExternalIdentityInput,
  ): Promise<ResolvedPlayerIdentity | null> {
    return this.repository.resolveExactIdentity(exactIdentity);
  }

  async getPlayerCorpusSummary(playerId: string): Promise<PlayerCorpusSummary | null> {
    return this.repository.getPlayerCorpusSummary(playerId);
  }

  async explore(input: ExplorePositionInput): Promise<PositionExploreResult> {
    const position = await this.resolvePosition(input);
    const focalPlayer = await this.resolveFocalPlayer(input.filters);
    this.validateFocalFilters(input.filters, focalPlayer);

    const raw = await this.repository.explore({
      positionId: position.id,
      sideToMove: position.sideToMove,
      focalPlayerId: focalPlayer?.playerId ?? null,
      playerColor: input.filters.playerColor,
      gameContexts: input.filters.gameContexts,
      timeCategories: input.filters.timeCategories,
      playedFrom: input.filters.playedFrom,
      playedTo: input.filters.playedTo,
      minimumOpponentRating: input.filters.minimumOpponentRating,
      sourceTypes: input.filters.sourceTypes,
    });
    const totalMatchingGames = raw.moves.reduce((total, move) => total + move.gameCount, 0);
    const scorePerspective: ScorePerspective = focalPlayer ? 'FOCAL_PLAYER' : 'SIDE_TO_MOVE';
    const focalPlayerCorpus = focalPlayer
      ? await this.repository.getPlayerCorpusCounts(focalPlayer.playerId)
      : null;

    return {
      position: {
        id: position.id,
        fen: position.fen,
        normalizedFenKey: position.normalizedFenKey,
        sideToMove: position.sideToMove,
      },
      filters: {
        ...input.filters,
        resolvedPlayerId: focalPlayer?.playerId ?? null,
      },
      focalPlayer,
      focalPlayerCorpus,
      sample: { games: totalMatchingGames },
      scorePerspective,
      nextMoves: raw.moves
        .filter((move) => move.gameCount >= input.filters.minimumSampleSize)
        .map((move) => ({
          san: move.san,
          uci: move.uci,
          resultingPositionId: move.resultingPositionId,
          resultingFen: move.resultingFen,
          representativeGames: move.representativeGames,
          ...calculateObservedMoveStatistics({
            gameCount: move.gameCount,
            totalMatchingGames,
            whiteWins: move.whiteWins,
            draws: move.draws,
            blackWins: move.blackWins,
            perspectiveWins: move.perspectiveWins,
            perspectiveDraws: move.perspectiveDraws,
            scorePerspective,
          }),
        })),
      representativeGames: raw.representativeGames,
    };
  }

  private async resolvePosition(input: ExplorePositionInput): Promise<NormalizedChessPosition> {
    if (input.fen) {
      return normalizePositionFen(input.fen);
    }
    if (!input.positionId) {
      throw new PositionExplorerError(
        'POSITION_NOT_FOUND',
        'Supply exactly one FEN or canonical position ID.',
      );
    }

    const stored = await this.repository.getPosition(input.positionId);
    if (!stored) {
      throw new PositionExplorerError(
        'POSITION_NOT_FOUND',
        'The position ID does not exist in the local corpus.',
      );
    }
    return {
      id: stored.id,
      fen: stored.representativeFen,
      normalizedFenKey: stored.normalizedFenKey,
      sideToMove: stored.sideToMove,
    };
  }

  private async resolveFocalPlayer(
    filters: PositionCorpusFilters,
  ): Promise<ResolvedPlayerIdentity | null> {
    if (filters.playerId && filters.externalIdentity) {
      throw new PositionExplorerError(
        'INVALID_CORPUS_FILTERS',
        'Supply a player ID or an exact external identity, not both.',
      );
    }
    if (filters.externalIdentity) {
      const resolved = await this.repository.resolveExactIdentity(filters.externalIdentity);
      if (!resolved) {
        throw new PositionExplorerError(
          'IDENTITY_NOT_FOUND',
          `${filters.externalIdentity.provider} ${filters.externalIdentity.externalId} does not exist as a verified identity in the local corpus.`,
        );
      }
      return resolved;
    }
    if (filters.playerId) {
      const player = await this.repository.getPlayer(filters.playerId);
      if (!player) {
        throw new PositionExplorerError('PLAYER_NOT_FOUND', 'The local Player does not exist.');
      }
      return player;
    }
    return null;
  }

  private validateFocalFilters(
    filters: PositionCorpusFilters,
    focalPlayer: ResolvedPlayerIdentity | null,
  ): void {
    if (!focalPlayer && (filters.playerColor || filters.minimumOpponentRating !== null)) {
      throw new PositionExplorerError(
        'INVALID_CORPUS_FILTERS',
        'playerColor and minimumOpponentRating require a focal Player.',
      );
    }
  }
}
