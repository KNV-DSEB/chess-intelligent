import { classifyGamePhase } from '@chess-intelligent/chess-core';
import type { PlayerIntelligenceRepository, PositionCorpusRepository } from '@chess-intelligent/db';
import {
  ANALYSIS_PROFILE_CONFIGURATIONS,
  CONSERVATIVE_DOSSIER_FILTERS,
  ENGINE_AGGREGATION_VERSION,
  calculateAdvantageConversion,
  calculateCriticalPatterns,
  calculateDecisionQuality,
  calculateDisadvantageRecovery,
  calculateEvidenceQuality,
  calculateObjectiveBehavior,
  calculatePerformanceSummary,
  calculateRepertoireBreadth,
  type DataSourceType,
  type ExactExternalIdentityInput,
  type GameContext,
  type EngineAggregationEvidence,
  type PlayerDossierFilters,
  type PlayerEngineObservation,
  type PlayerIntelligenceDossier,
  type TimeCategory,
} from '@chess-intelligent/domain';

import type { OpponentPreparationApplicationService } from './opponent-preparation-application';

export type PlayerDossierErrorCode = 'PLAYER_NOT_FOUND_IN_LOCAL_CORPUS';

export class PlayerDossierError extends Error {
  constructor(
    readonly code: PlayerDossierErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlayerDossierError';
  }
}

export interface PlayerDossierFilterInput {
  gameContexts?: GameContext[] | undefined;
  timeCategories?: TimeCategory[] | undefined;
  playedFrom?: string | null | undefined;
  playedTo?: string | null | undefined;
  minimumOpponentRating?: number | null | undefined;
  sourceTypes?: DataSourceType[] | undefined;
}

export interface GeneratePlayerDossierInput {
  playerId?: string | undefined;
  externalIdentity?: ExactExternalIdentityInput | undefined;
  filters?: PlayerDossierFilterInput | undefined;
  engineProfile?: 'QUICK_V1' | undefined;
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export class PlayerDossierApplicationService {
  constructor(
    private readonly repository: PlayerIntelligenceRepository,
    private readonly corpusRepository: PositionCorpusRepository,
    private readonly preparation: OpponentPreparationApplicationService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async generate(input: GeneratePlayerDossierInput): Promise<PlayerIntelligenceDossier> {
    const player = input.playerId
      ? await this.corpusRepository.getPlayer(input.playerId)
      : input.externalIdentity
        ? await this.corpusRepository.resolveExactIdentity(input.externalIdentity)
        : null;
    if (!player) {
      throw new PlayerDossierError(
        'PLAYER_NOT_FOUND_IN_LOCAL_CORPUS',
        'No exact local Player exists for the requested identity.',
      );
    }

    const filters = this.filters(input.filters);
    const profileName = input.engineProfile ?? 'QUICK_V1';
    const profile = ANALYSIS_PROFILE_CONFIGURATIONS[profileName];
    const [games, rawEngine, rawRepertoire] = await Promise.all([
      this.repository.getGameFacts(player.playerId, filters),
      this.repository.getSelectedEngineObservations({
        playerId: player.playerId,
        filters,
        profile: profile.name,
        profileVersion: profile.version,
      }),
      this.preparation.getFilteredPlayerRepertoire(player.playerId, filters),
    ]);
    const observations: PlayerEngineObservation[] = rawEngine.map((observation) => ({
      run: observation.run,
      gameId: observation.gameId,
      focalColor: observation.focalColor,
      opponentName: observation.opponentName,
      opponentRating: observation.opponentRating,
      event: observation.event,
      playedAt: observation.playedAt,
      result: observation.result,
      occurrencePly: observation.occurrencePly,
      mover: observation.mover,
      phase: classifyGamePhase(observation.representativeFen, observation.occurrencePly),
      centipawnLoss: observation.centipawnLoss,
      mateOutcome: observation.mateOutcome,
      bestScoreWhite: observation.bestScoreWhite,
      criticalReasons: observation.criticalReasons,
    }));
    const selectedRunMap = new Map(
      rawEngine.map((observation) => [observation.run.id, observation.run]),
    );
    const selectedRuns = [...selectedRunMap.values()].sort(
      (left, right) =>
        right.completedAt.localeCompare(left.completedAt) ||
        left.gameId.localeCompare(right.gameId),
    );
    const gamesWithMoves = games.filter((game) => game.contentStatus === 'MOVES_AVAILABLE').length;
    const metadataOnlyGames = games.length - gamesWithMoves;
    const dates = games.flatMap((game) => (game.playedAt === null ? [] : [game.playedAt])).sort();
    const latestKnownGame = dates.at(-1) ?? null;
    const compatibleAnalyzedGames = selectedRuns.length;
    const coverage = {
      canonicalGames: games.length,
      gamesWithMoves,
      metadataOnlyGames,
      otbGames: games.filter((game) => game.gameContext === 'OTB').length,
      onlineGames: games.filter((game) => game.gameContext === 'ONLINE').length,
      unknownContextGames: games.filter((game) => game.gameContext === 'UNKNOWN').length,
      classicalGames: games.filter((game) => game.timeCategory === 'CLASSICAL').length,
      rapidGames: games.filter((game) => game.timeCategory === 'RAPID').length,
      blitzGames: games.filter((game) => game.timeCategory === 'BLITZ').length,
      otherTimeCategoryGames: games.filter(
        (game) => !['CLASSICAL', 'RAPID', 'BLITZ'].includes(game.timeCategory),
      ).length,
      whiteGames: games.filter((game) => game.focalColor === 'WHITE').length,
      blackGames: games.filter((game) => game.focalColor === 'BLACK').length,
      earliestKnownGame: dates[0] ?? null,
      latestKnownGame,
      engineEligibleGames: gamesWithMoves,
      compatibleAnalyzedGames,
      engineCoverageRatio: ratio(compatibleAnalyzedGames, gamesWithMoves),
    };
    const engineAggregation: EngineAggregationEvidence = {
      version: ENGINE_AGGREGATION_VERSION,
      selection: 'LATEST_COMPLETED_SUCCESSFUL_RUN_PER_CANONICAL_GAME' as const,
      requestedProfile: { name: profile.name, version: profile.version },
      eligibleGames: gamesWithMoves,
      selectedAnalyzedGames: compatibleAnalyzedGames,
      coverageRatio: coverage.engineCoverageRatio,
      selectedRuns,
    };

    return {
      generatedAt: this.now().toISOString(),
      player,
      filters,
      coverage,
      evidenceQuality: calculateEvidenceQuality({
        canonicalGames: games.length,
        usableGames: gamesWithMoves,
        compatibleAnalyzedGames,
        opponentRatingKnownGames: games.filter((game) => game.opponentRating !== null).length,
        latestKnownGame,
        asOf: this.now(),
      }),
      performance: calculatePerformanceSummary(games),
      repertoire: {
        recentWindow: rawRepertoire.recentWindow,
        asWhite: {
          behavior: rawRepertoire.whiteRoot,
          breadth: calculateRepertoireBreadth(rawRepertoire.whiteRoot),
        },
        asBlack: rawRepertoire.blackResponses.map((response) => ({
          ...response,
          breadth: calculateRepertoireBreadth(response.behavior),
        })),
      },
      engine: {
        aggregation: engineAggregation,
        decisionQuality: calculateDecisionQuality(observations),
        criticalPatterns: calculateCriticalPatterns(observations, this.now()),
        advantageConversion: calculateAdvantageConversion(observations),
        disadvantageRecovery: calculateDisadvantageRecovery(observations),
      },
      objectiveBehavior: calculateObjectiveBehavior(games),
    };
  }

  private filters(input: PlayerDossierFilterInput | undefined): PlayerDossierFilters {
    return {
      gameContexts:
        input?.gameContexts === undefined
          ? [...CONSERVATIVE_DOSSIER_FILTERS.gameContexts]
          : [...input.gameContexts],
      timeCategories:
        input?.timeCategories === undefined
          ? [...CONSERVATIVE_DOSSIER_FILTERS.timeCategories]
          : [...input.timeCategories],
      playedFrom: input?.playedFrom ?? null,
      playedTo: input?.playedTo ?? null,
      minimumOpponentRating: input?.minimumOpponentRating ?? null,
      sourceTypes: input?.sourceTypes ? [...input.sourceTypes] : [],
    };
  }
}
