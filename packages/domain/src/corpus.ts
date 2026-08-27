import type { Color, DataSourceType, GameContext, IdentityProvider, TimeCategory } from './index';

export const SCORE_PERSPECTIVES = ['SIDE_TO_MOVE', 'FOCAL_PLAYER'] as const;
export type ScorePerspective = (typeof SCORE_PERSPECTIVES)[number];

export interface ExactExternalIdentityInput {
  provider: IdentityProvider;
  externalId: string;
}

export interface PositionCorpusFilters {
  playerId: string | null;
  externalIdentity: ExactExternalIdentityInput | null;
  playerColor: Color | null;
  gameContexts: GameContext[];
  timeCategories: TimeCategory[];
  playedFrom: string | null;
  playedTo: string | null;
  minimumOpponentRating: number | null;
  sourceTypes: DataSourceType[];
  minimumSampleSize: number;
}

export interface ResolvedPlayerIdentity {
  playerId: string;
  displayName: string;
  identity: {
    provider: IdentityProvider;
    externalId: string;
    verificationStatus: string;
  } | null;
}

export interface RepresentativeGame {
  gameId: string;
  white: { displayName: string; rating: number | null };
  black: { displayName: string; rating: number | null };
  event: string | null;
  playedAt: string | null;
  result: string;
  sourceTypes: DataSourceType[];
}

export interface ObservedResultCounts {
  whiteWins: number;
  draws: number;
  blackWins: number;
}

export interface ObservedMoveStatistics extends ObservedResultCounts {
  gameCount: number;
  frequency: number;
  score: number;
  scorePerspective: ScorePerspective;
}

export interface PositionExplorerMove extends ObservedMoveStatistics {
  san: string;
  uci: string;
  resultingPositionId: string;
  resultingFen: string;
  representativeGames: RepresentativeGame[];
}

export interface PlayerCorpusCounts {
  totalCanonicalGames: number;
  gamesWithMoves: number;
  metadataOnlyGames: number;
}

export interface PositionExploreResult {
  position: {
    id: string;
    fen: string;
    normalizedFenKey: string;
    sideToMove: Color;
  };
  filters: PositionCorpusFilters & { resolvedPlayerId: string | null };
  focalPlayer: ResolvedPlayerIdentity | null;
  focalPlayerCorpus: PlayerCorpusCounts | null;
  sample: { games: number };
  scorePerspective: ScorePerspective;
  nextMoves: PositionExplorerMove[];
  representativeGames: RepresentativeGame[];
}

export interface PlayerCorpusSummary extends PlayerCorpusCounts {
  player: ResolvedPlayerIdentity;
  whiteGames: number;
  blackGames: number;
  otbGames: number;
  onlineGames: number;
  unknownContextGames: number;
  classicalGames: number;
  rapidGames: number;
  blitzGames: number;
  otherTimeCategoryGames: number;
  earliestKnownGame: string | null;
  latestKnownGame: string | null;
  sourceCoverage: Array<{
    sourceType: DataSourceType;
    canonicalGames: number;
    observations: number;
  }>;
}

export function calculateObservedMoveStatistics(input: {
  gameCount: number;
  totalMatchingGames: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  perspectiveWins: number;
  perspectiveDraws: number;
  scorePerspective: ScorePerspective;
}): ObservedMoveStatistics {
  const frequency = input.totalMatchingGames === 0 ? 0 : input.gameCount / input.totalMatchingGames;
  const score =
    input.gameCount === 0
      ? 0
      : (input.perspectiveWins + 0.5 * input.perspectiveDraws) / input.gameCount;

  return {
    gameCount: input.gameCount,
    frequency,
    whiteWins: input.whiteWins,
    draws: input.draws,
    blackWins: input.blackWins,
    score,
    scorePerspective: input.scorePerspective,
  };
}
