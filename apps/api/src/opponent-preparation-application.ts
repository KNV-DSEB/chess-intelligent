import {
  applyUciMove,
  normalizePositionFen,
  type NormalizedChessPosition,
} from '@chess-intelligent/chess-core';
import type {
  OpponentPreparationRepository,
  PositionCorpusRepository,
  RawCompatibleEngineMove,
  RawOpponentMove,
  RawReferenceMove,
} from '@chess-intelligent/db';
import {
  CONSERVATIVE_PREPARATION_FILTERS,
  STRONG_REFERENCE_PROFILE,
  calculateOpponentFamiliarity,
  calculatePredictability,
  calculatePreparationInterest,
  calculateRecentRepertoireWindow,
  calculateReferenceStatistics,
  classifyEngineSoundness,
  classifyRepertoireTrend,
  oppositeColor,
  type CandidateEngineEvidence,
  type Color,
  type FilteredPlayerRepertoire,
  type OpponentBehavior,
  type OpponentOpeningProfile,
  type OpponentPreparationDossier,
  type OpponentPreparationFilters,
  type PreparationCandidate,
  type PreparationPositionResult,
  type ReferenceCorpusEvidence,
  type ResolvedPlayerIdentity,
} from '@chess-intelligent/domain';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type OpponentPreparationErrorCode =
  'PLAYER_NOT_FOUND_IN_LOCAL_CORPUS' | 'POSITION_NOT_FOUND' | 'POSITION_ID_MISMATCH';

export class OpponentPreparationError extends Error {
  constructor(
    readonly code: OpponentPreparationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OpponentPreparationError';
  }
}

export interface PreparationFilterInput {
  gameContexts?: OpponentPreparationFilters['gameContexts'] | undefined;
  timeCategories?: OpponentPreparationFilters['timeCategories'] | undefined;
  playedFrom?: string | null | undefined;
  playedTo?: string | null | undefined;
  minimumOpponentRating?: number | null | undefined;
  sourceTypes?: OpponentPreparationFilters['sourceTypes'] | undefined;
}

export interface PrepareOpponentInput {
  opponentPlayerId: string;
  opponentColor: Color;
  filters?: PreparationFilterInput | undefined;
}

export interface PrepareOpponentPositionInput extends PrepareOpponentInput {
  positionId: string;
  positionFen?: string | null | undefined;
}

export class OpponentPreparationApplicationService {
  constructor(
    private readonly repository: OpponentPreparationRepository,
    private readonly corpusRepository: PositionCorpusRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getOpeningProfile(playerId: string): Promise<OpponentOpeningProfile> {
    const opponent = await this.requireVerifiedPlayer(playerId);
    const recentWindow = calculateRecentRepertoireWindow(this.now());
    const allLocalFilters: OpponentPreparationFilters = {
      gameContexts: [],
      timeCategories: [],
      playedFrom: null,
      playedTo: null,
      minimumOpponentRating: null,
      sourceTypes: [],
    };
    const initial = normalizePositionFen(INITIAL_FEN);
    const [coverage, whiteMoves, blackResponses] = await Promise.all([
      this.repository.getOpeningProfileCoverage(playerId),
      this.repository.getOpponentMoves({
        playerId,
        opponentColor: 'WHITE',
        positionId: initial.id,
        filters: allLocalFilters,
        recentFrom: recentWindow.from,
      }),
      this.repository.getBlackRootResponses({
        playerId,
        filters: allLocalFilters,
        recentFrom: recentWindow.from,
      }),
    ]);
    return {
      player: opponent,
      coverage,
      whiteRoot: this.behavior(whiteMoves),
      blackResponses: blackResponses.map((group) => {
        const behavior = this.behavior(group.moves);
        return {
          againstMove: { ...group.againstMove, games: behavior.sampleGames },
          behavior,
        };
      }),
    };
  }

  async getFilteredPlayerRepertoire(
    playerId: string,
    filterInput?: PreparationFilterInput,
  ): Promise<FilteredPlayerRepertoire> {
    const player = await this.corpusRepository.getPlayer(playerId);
    if (!player) {
      throw new OpponentPreparationError(
        'PLAYER_NOT_FOUND_IN_LOCAL_CORPUS',
        'No exact local Player exists for this player ID.',
      );
    }
    const filters = this.filters(filterInput);
    const recentWindow = calculateRecentRepertoireWindow(this.now());
    const initial = normalizePositionFen(INITIAL_FEN);
    const [whiteMoves, blackResponses] = await Promise.all([
      this.repository.getOpponentMoves({
        playerId,
        opponentColor: 'WHITE',
        positionId: initial.id,
        filters,
        recentFrom: recentWindow.from,
      }),
      this.repository.getBlackRootResponses({
        playerId,
        filters,
        recentFrom: recentWindow.from,
      }),
    ]);
    return {
      recentWindow,
      whiteRoot: this.behavior(whiteMoves),
      blackResponses: blackResponses.map((group) => {
        const behavior = this.behavior(group.moves);
        return {
          againstMove: { ...group.againstMove, games: behavior.sampleGames },
          behavior,
        };
      }),
    };
  }

  async prepareOpponent(input: PrepareOpponentInput): Promise<OpponentPreparationDossier> {
    const opponent = await this.requireVerifiedPlayer(input.opponentPlayerId);
    const filters = this.filters(input.filters);
    const recentWindow = calculateRecentRepertoireWindow(this.now());
    const initial = normalizePositionFen(INITIAL_FEN);
    const [coverage, root, rawHotspots] = await Promise.all([
      this.repository.getFilteredCoverage(input.opponentPlayerId, input.opponentColor, filters),
      this.prepareResolvedPosition({
        opponent,
        opponentColor: input.opponentColor,
        filters,
        position: initial,
        recentWindow,
      }),
      this.repository.getHotspots({
        playerId: input.opponentPlayerId,
        opponentColor: input.opponentColor,
        filters,
        recentFrom: recentWindow.from,
        maximumPly: 16,
      }),
    ]);
    return {
      generatedAt: this.now().toISOString(),
      opponent,
      opponentColor: input.opponentColor,
      preparationColor: oppositeColor(input.opponentColor),
      filters,
      coverage,
      root,
      hotspots: rawHotspots.map((hotspot) => ({
        positionId: hotspot.positionId,
        representativeFen: hotspot.representativeFen,
        sideToMove: hotspot.sideToMove,
        reachedGames: hotspot.reachedGames,
        recentReachedGames: hotspot.recentReachedGames,
        predictability: calculatePredictability(hotspot.reachedGames, hotspot.largestMoveGames),
      })),
    };
  }

  async preparePosition(input: PrepareOpponentPositionInput): Promise<PreparationPositionResult> {
    const opponent = await this.requireVerifiedPlayer(input.opponentPlayerId);
    const position = await this.resolvePosition(input.positionId, input.positionFen ?? null);
    return this.prepareResolvedPosition({
      opponent,
      opponentColor: input.opponentColor,
      filters: this.filters(input.filters),
      position,
      recentWindow: calculateRecentRepertoireWindow(this.now()),
    });
  }

  private async prepareResolvedPosition(input: {
    opponent: ResolvedPlayerIdentity;
    opponentColor: Color;
    filters: OpponentPreparationFilters;
    position: NormalizedChessPosition;
    recentWindow: ReturnType<typeof calculateRecentRepertoireWindow>;
  }): Promise<PreparationPositionResult> {
    const generatedAt = this.now().toISOString();
    const preparationColor = oppositeColor(input.opponentColor);
    if (input.position.sideToMove === input.opponentColor) {
      const moves = await this.repository.getOpponentMoves({
        playerId: input.opponent.playerId,
        opponentColor: input.opponentColor,
        positionId: input.position.id,
        filters: input.filters,
        recentFrom: input.recentWindow.from,
      });
      return {
        generatedAt,
        recentWindow: input.recentWindow,
        opponent: input.opponent,
        opponentColor: input.opponentColor,
        preparationColor,
        filters: input.filters,
        position: this.positionView(input.position),
        nodeType: 'OPPONENT_CHOICE',
        opponentBehavior: this.behavior(moves),
        candidates: [],
      };
    }

    const [exposureMoves, referenceMoves, engine] = await Promise.all([
      this.repository.getOpponentMoves({
        playerId: input.opponent.playerId,
        opponentColor: input.opponentColor,
        positionId: input.position.id,
        filters: input.filters,
        recentFrom: input.recentWindow.from,
      }),
      this.repository.getStrongReferenceMoves({
        positionId: input.position.id,
        preparationColor,
        profile: STRONG_REFERENCE_PROFILE,
      }),
      this.repository.getCompatibleEngineMoves({
        playerId: input.opponent.playerId,
        opponentColor: input.opponentColor,
        positionId: input.position.id,
        filters: input.filters,
      }),
    ]);
    const exposureByMove = new Map(exposureMoves.map((move) => [move.uci, move]));
    const referenceByMove = new Map(referenceMoves.map((move) => [move.uci, move]));
    const engineByMove = new Map(engine.moves.map((move) => [move.rootMoveUci, move]));
    const exposureTotals = this.moveTotals(exposureMoves);
    const candidateMoves = new Set(referenceMoves.map((move) => move.uci));
    for (const line of engine.moves) {
      const soundness = classifyEngineSoundness(line.score, preparationColor);
      if (soundness === 'SOUND' || soundness === 'PLAYABLE') {
        candidateMoves.add(line.rootMoveUci);
      }
    }

    const candidates = [...candidateMoves].map((uci) => {
      const reference = referenceByMove.get(uci);
      const engineLine = engineByMove.get(uci);
      const exposure = exposureByMove.get(uci);
      const transition = reference
        ? {
            san: reference.san,
            uci: reference.uci,
            resultingPositionId: reference.resultingPositionId,
            resultingFen: reference.resultingFen,
          }
        : this.engineTransition(input.position.fen, uci);
      const opponentEvidence = calculateOpponentFamiliarity({
        gamesSeen: exposure?.games ?? 0,
        positionGames: exposureTotals.all,
        recentGamesSeen: exposure?.recentGames ?? 0,
        recentPositionGames: exposureTotals.recent,
        lastSeen: exposure?.lastSeen ?? null,
        whiteWins: exposure?.whiteWins ?? 0,
        draws: exposure?.draws ?? 0,
        blackWins: exposure?.blackWins ?? 0,
        opponentWins: exposure?.opponentWins ?? 0,
      });
      const referenceEvidence = this.referenceEvidence(reference);
      const engineEvidence = this.engineEvidence(
        engineLine,
        engine.hasOnlyIncompatibleSuccessfulState,
        preparationColor,
      );
      const sources: PreparationCandidate['sources'] = [];
      if (reference) sources.push('STRONG_REFERENCE');
      if (engineLine) sources.push('COMPATIBLE_ENGINE');
      const preparationInterest = calculatePreparationInterest({
        familiarityScore: opponentEvidence.familiarityScore,
        referenceGames: reference?.games ?? null,
        engineSoundness:
          engineEvidence.status === 'AVAILABLE' ? engineEvidence.classification : null,
      });
      return {
        move: transition,
        sources,
        opponentEvidence,
        referenceEvidence,
        engineEvidence,
        preparationInterest,
      } satisfies PreparationCandidate;
    });
    candidates.sort((left, right) => {
      const band = { HIGH: 2, MEDIUM: 1, LOW: 0 } as const;
      const leftReference =
        left.referenceEvidence.status === 'NOT_AVAILABLE'
          ? 0
          : left.referenceEvidence.statistics.games;
      const rightReference =
        right.referenceEvidence.status === 'NOT_AVAILABLE'
          ? 0
          : right.referenceEvidence.statistics.games;
      return (
        band[right.preparationInterest.band] - band[left.preparationInterest.band] ||
        rightReference - leftReference ||
        left.opponentEvidence.familiarityScore - right.opponentEvidence.familiarityScore ||
        left.move.uci.localeCompare(right.move.uci)
      );
    });

    return {
      generatedAt,
      recentWindow: input.recentWindow,
      opponent: input.opponent,
      opponentColor: input.opponentColor,
      preparationColor,
      filters: input.filters,
      position: this.positionView(input.position),
      nodeType: 'PREPARATION_CHOICE',
      opponentBehavior: null,
      candidates,
    };
  }

  private behavior(moves: RawOpponentMove[]): OpponentBehavior {
    const totals = this.moveTotals(moves);
    return {
      sampleGames: totals.all,
      recentSampleGames: totals.recent,
      moves: moves.map((move) => ({
        san: move.san,
        uci: move.uci,
        games: move.games,
        frequency: totals.all === 0 ? 0 : move.games / totals.all,
        recentGames: move.recentGames,
        recentFrequency: totals.recent === 0 ? 0 : move.recentGames / totals.recent,
        whiteWins: move.whiteWins,
        draws: move.draws,
        blackWins: move.blackWins,
        opponentScore: move.games === 0 ? 0 : (move.opponentWins + 0.5 * move.draws) / move.games,
        scorePerspective: 'FOCAL_OPPONENT',
        lastSeen: move.lastSeen,
        resultingPositionId: move.resultingPositionId,
        resultingFen: move.resultingFen,
        trend: classifyRepertoireTrend({
          historicalMoveGames: move.historicalGames,
          historicalPositionGames: totals.historical,
          recentMoveGames: move.recentGames,
          recentPositionGames: totals.recent,
        }),
        representativeGames: move.representativeGames,
      })),
      predictability: calculatePredictability(
        totals.all,
        Math.max(0, ...moves.map((move) => move.games)),
      ),
    };
  }

  private referenceEvidence(reference: RawReferenceMove | undefined): ReferenceCorpusEvidence {
    if (!reference) {
      return { status: 'NOT_AVAILABLE', profile: STRONG_REFERENCE_PROFILE };
    }
    const statistics = calculateReferenceStatistics({
      games: reference.games,
      wins: reference.preparationWins,
      draws: reference.draws,
      losses: reference.preparationLosses,
      whiteWins: reference.whiteWins,
      blackWins: reference.blackWins,
    });
    return {
      status:
        reference.games >= STRONG_REFERENCE_PROFILE.minimumAvailableSample
          ? 'AVAILABLE'
          : 'INSUFFICIENT_SAMPLE',
      profile: STRONG_REFERENCE_PROFILE,
      statistics,
      averageRecordedRating: reference.averageRecordedRating,
      minimumRecordedRating: reference.minimumRecordedRating,
      representativeGames: reference.representativeGames,
    };
  }

  private engineEvidence(
    line: RawCompatibleEngineMove | undefined,
    incompatibleOnly: boolean,
    preparationColor: Color,
  ): CandidateEngineEvidence {
    if (!line) {
      return { status: incompatibleOnly ? 'INCOMPATIBLE_ENGINE_STATE' : 'NOT_AVAILABLE' };
    }
    return {
      status: 'AVAILABLE',
      compatibility: 'DIRECT_GAME_OCCURRENCE',
      soundnessVersion: 'ENGINE_SOUNDNESS_V1',
      classification: classifyEngineSoundness(line.score, preparationColor),
      evaluation: {
        score: { ...line.score, perspective: 'WHITE' },
        pvRank: line.pvRank,
        rootMoveUci: line.rootMoveUci,
        pvUci: line.pvUci,
        search: line.search,
      },
      occurrence: {
        gameId: line.gameId,
        ply: line.occurrencePly,
        historySha256: line.historySha256,
      },
      run: {
        id: line.runId,
        completedAt: line.completedAt,
        engineFamily: line.engineFamily,
        engineReportedName: line.engineReportedName,
        engineReportedVersion: line.engineReportedVersion,
        binarySha256: line.binarySha256,
        profile: line.profile,
        profileVersion: line.profileVersion,
        searchLimit: line.searchLimit,
        engineOptions: line.engineOptions,
        multiPv: line.multiPv,
        detectorVersion: line.detectorVersion,
        startedAt: line.startedAt,
      },
    };
  }

  private engineTransition(fen: string, uci: string): PreparationCandidate['move'] {
    const applied = applyUciMove(fen, uci);
    return {
      san: applied.san,
      uci,
      resultingPositionId: applied.resultingPosition.id,
      resultingFen: applied.resultingPosition.fen,
    };
  }

  private moveTotals(moves: RawOpponentMove[]): {
    all: number;
    historical: number;
    recent: number;
  } {
    return moves.reduce(
      (totals, move) => ({
        all: totals.all + move.games,
        historical: totals.historical + move.historicalGames,
        recent: totals.recent + move.recentGames,
      }),
      { all: 0, historical: 0, recent: 0 },
    );
  }

  private filters(input: PreparationFilterInput | undefined): OpponentPreparationFilters {
    return {
      gameContexts:
        input?.gameContexts === undefined
          ? [...CONSERVATIVE_PREPARATION_FILTERS.gameContexts]
          : [...input.gameContexts],
      timeCategories:
        input?.timeCategories === undefined
          ? [...CONSERVATIVE_PREPARATION_FILTERS.timeCategories]
          : [...input.timeCategories],
      playedFrom: input?.playedFrom ?? null,
      playedTo: input?.playedTo ?? null,
      minimumOpponentRating: input?.minimumOpponentRating ?? null,
      sourceTypes: input?.sourceTypes ? [...input.sourceTypes] : [],
    };
  }

  private async requireVerifiedPlayer(playerId: string): Promise<ResolvedPlayerIdentity> {
    const player = await this.corpusRepository.getPlayer(playerId);
    if (!player?.identity || player.identity.verificationStatus !== 'VERIFIED') {
      throw new OpponentPreparationError(
        'PLAYER_NOT_FOUND_IN_LOCAL_CORPUS',
        'No locally verified Player exists for this identity. Import games or add verified identity data first.',
      );
    }
    return player;
  }

  private async resolvePosition(
    positionId: string,
    positionFen: string | null,
  ): Promise<NormalizedChessPosition> {
    const stored = await this.corpusRepository.getPosition(positionId);
    if (stored) {
      return {
        id: stored.id,
        fen: stored.representativeFen,
        normalizedFenKey: stored.normalizedFenKey,
        sideToMove: stored.sideToMove,
      };
    }
    if (positionFen) {
      const normalized = normalizePositionFen(positionFen);
      if (normalized.id !== positionId) {
        throw new OpponentPreparationError(
          'POSITION_ID_MISMATCH',
          'The supplied position FEN does not match the requested normalized position ID.',
        );
      }
      return normalized;
    }
    throw new OpponentPreparationError(
      'POSITION_NOT_FOUND',
      'The position is not stored locally; supply its representative FEN for an engine-only branch.',
    );
  }

  private positionView(position: NormalizedChessPosition): PreparationPositionResult['position'] {
    return {
      id: position.id,
      fen: position.fen,
      normalizedFenKey: position.normalizedFenKey,
      sideToMove: position.sideToMove,
    };
  }
}
