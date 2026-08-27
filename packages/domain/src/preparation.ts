import type {
  Color,
  DataSourceType,
  GameContext,
  RepresentativeGame,
  ResolvedPlayerIdentity,
  TimeCategory,
} from './index';
import { scoreForMover, type AnalysisProfileName, type EngineScore } from './engine-analysis';

export const RECENT_REPERTOIRE_MONTHS = 12;
export const REPERTOIRE_TREND_VERSION = 'REPERTOIRE_TREND_V1';
export const OPPONENT_FAMILIARITY_VERSION = 'OPPONENT_FAMILIARITY_V1';
export const REPERTOIRE_PREDICTABILITY_VERSION = 'REPERTOIRE_PREDICTABILITY_V1';
export const STRONG_REFERENCE_PROFILE = {
  name: 'STRONG_REFERENCE_V1',
  version: 1,
  gameContexts: ['OTB'],
  timeCategories: ['CLASSICAL'],
  minimumBothPlayersRating: 2400,
  minimumAvailableSample: 3,
  scorePrior: { points: 2, games: 4 },
} as const;
export const ENGINE_SOUNDNESS_VERSION = 'ENGINE_SOUNDNESS_V1';
export const PREPARATION_INTEREST_VERSION = 'PREPARATION_INTEREST_V1';

export const REPERTOIRE_TRENDS = [
  'STABLE',
  'INCREASING',
  'DECREASING',
  'NEW',
  'DORMANT',
  'INSUFFICIENT_DATA',
] as const;
export type RepertoireTrend = (typeof REPERTOIRE_TRENDS)[number];

export const PREDICTABILITY_BANDS = ['LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT_SAMPLE'] as const;
export type PredictabilityBand = (typeof PREDICTABILITY_BANDS)[number];

export const ENGINE_SOUNDNESS_CLASSIFICATIONS = [
  'SOUND',
  'PLAYABLE',
  'RISKY',
  'ENGINE_DISFAVORED',
] as const;
export type EngineSoundnessClassification = (typeof ENGINE_SOUNDNESS_CLASSIFICATIONS)[number];

export type OpponentNodeType = 'OPPONENT_CHOICE' | 'PREPARATION_CHOICE';

export interface OpponentPreparationFilters {
  gameContexts: GameContext[];
  timeCategories: TimeCategory[];
  playedFrom: string | null;
  playedTo: string | null;
  minimumOpponentRating: number | null;
  sourceTypes: DataSourceType[];
}

export const CONSERVATIVE_PREPARATION_FILTERS: Readonly<OpponentPreparationFilters> = {
  gameContexts: ['OTB'],
  timeCategories: ['CLASSICAL'],
  playedFrom: null,
  playedTo: null,
  minimumOpponentRating: null,
  sourceTypes: [],
};

export interface RepertoireTrendEvidence {
  version: typeof REPERTOIRE_TREND_VERSION;
  label: RepertoireTrend;
  historical: { moveGames: number; positionGames: number; frequency: number };
  recent: { moveGames: number; positionGames: number; frequency: number };
  frequencyDelta: number | null;
}

export interface OpponentMoveEvidence {
  san: string;
  uci: string;
  games: number;
  frequency: number;
  recentGames: number;
  recentFrequency: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  opponentScore: number;
  scorePerspective: 'FOCAL_OPPONENT';
  lastSeen: string | null;
  resultingPositionId: string;
  resultingFen: string;
  trend: RepertoireTrendEvidence;
  representativeGames: RepresentativeGame[];
}

export interface PredictabilityEvidence {
  version: typeof REPERTOIRE_PREDICTABILITY_VERSION;
  sampleGames: number;
  topMoveShare: number;
  band: PredictabilityBand;
}

export interface OpponentBehavior {
  sampleGames: number;
  recentSampleGames: number;
  moves: OpponentMoveEvidence[];
  predictability: PredictabilityEvidence;
}

export interface OpponentFamiliarity {
  version: typeof OPPONENT_FAMILIARITY_VERSION;
  gamesSeen: number;
  positionGames: number;
  frequency: number;
  recentGamesSeen: number;
  recentPositionGames: number;
  recentFrequency: number;
  lastSeen: string | null;
  whiteWins: number;
  draws: number;
  blackWins: number;
  opponentScore: number | null;
  familiarityScore: number;
}

export interface ReferenceStatistics {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  whiteWins: number;
  blackWins: number;
  rawScore: number;
  adjustedScore: number;
}

export type ReferenceCorpusEvidence =
  | {
      status: 'AVAILABLE' | 'INSUFFICIENT_SAMPLE';
      profile: typeof STRONG_REFERENCE_PROFILE;
      statistics: ReferenceStatistics;
      averageRecordedRating: number;
      minimumRecordedRating: number;
      representativeGames: RepresentativeGame[];
    }
  | {
      status: 'NOT_AVAILABLE';
      profile: typeof STRONG_REFERENCE_PROFILE;
    };

export interface EngineEvaluationEvidence {
  score: EngineScore & { perspective: 'WHITE' };
  pvRank: number;
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

export type CandidateEngineEvidence =
  | {
      status: 'AVAILABLE';
      compatibility: 'DIRECT_GAME_OCCURRENCE';
      soundnessVersion: typeof ENGINE_SOUNDNESS_VERSION;
      classification: EngineSoundnessClassification;
      evaluation: EngineEvaluationEvidence;
      occurrence: {
        gameId: string;
        ply: number;
        historySha256: string;
      };
      run: {
        id: string;
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
      };
    }
  | { status: 'NOT_AVAILABLE' }
  | { status: 'INCOMPATIBLE_ENGINE_STATE' };

export interface PreparationInterest {
  version: typeof PREPARATION_INTEREST_VERSION;
  band: 'LOW' | 'MEDIUM' | 'HIGH';
  points: number;
  components: {
    opponentUnfamiliarity: number;
    referenceSupport: number;
    engineSoundness: number;
  };
}

export interface PreparationCandidate {
  move: {
    san: string;
    uci: string;
    resultingPositionId: string;
    resultingFen: string;
  };
  sources: Array<'STRONG_REFERENCE' | 'COMPATIBLE_ENGINE'>;
  opponentEvidence: OpponentFamiliarity;
  referenceEvidence: ReferenceCorpusEvidence;
  engineEvidence: CandidateEngineEvidence;
  preparationInterest: PreparationInterest;
}

export interface PreparationPositionResult {
  generatedAt: string;
  recentWindow: { months: number; from: string; through: string };
  opponent: ResolvedPlayerIdentity;
  opponentColor: Color;
  preparationColor: Color;
  filters: OpponentPreparationFilters;
  position: {
    id: string;
    fen: string;
    normalizedFenKey: string;
    sideToMove: Color;
  };
  nodeType: OpponentNodeType;
  opponentBehavior: OpponentBehavior | null;
  candidates: PreparationCandidate[];
}

export interface PreparationHotspot {
  positionId: string;
  representativeFen: string;
  sideToMove: Color;
  reachedGames: number;
  recentReachedGames: number;
  predictability: PredictabilityEvidence;
}

export interface OpponentOpeningProfile {
  player: ResolvedPlayerIdentity;
  coverage: {
    totalCanonicalGames: number;
    gamesWithMoves: number;
    metadataOnlyGames: number;
    whiteGamesWithMoves: number;
    blackGamesWithMoves: number;
    otbGamesWithMoves: number;
    onlineGamesWithMoves: number;
    classicalGamesWithMoves: number;
    rapidGamesWithMoves: number;
    blitzGamesWithMoves: number;
    earliestKnownGame: string | null;
    latestKnownGame: string | null;
  };
  whiteRoot: OpponentBehavior;
  blackResponses: Array<{
    againstMove: {
      san: string;
      uci: string;
      resultingPositionId: string;
      games: number;
    };
    behavior: OpponentBehavior;
  }>;
}

export interface FilteredPlayerRepertoire {
  recentWindow: { months: number; from: string; through: string };
  whiteRoot: OpponentBehavior;
  blackResponses: Array<{
    againstMove: {
      san: string;
      uci: string;
      resultingPositionId: string;
      games: number;
    };
    behavior: OpponentBehavior;
  }>;
}

export interface OpponentPreparationDossier {
  generatedAt: string;
  opponent: ResolvedPlayerIdentity;
  opponentColor: Color;
  preparationColor: Color;
  filters: OpponentPreparationFilters;
  coverage: {
    canonicalGames: number;
    gamesWithMoves: number;
    metadataOnlyGames: number;
  };
  root: PreparationPositionResult;
  hotspots: PreparationHotspot[];
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function classifyRepertoireTrend(input: {
  historicalMoveGames: number;
  historicalPositionGames: number;
  recentMoveGames: number;
  recentPositionGames: number;
}): RepertoireTrendEvidence {
  const historicalFrequency = ratio(input.historicalMoveGames, input.historicalPositionGames);
  const recentFrequency = ratio(input.recentMoveGames, input.recentPositionGames);
  const sufficientRecentPosition = input.recentPositionGames >= 3;
  let label: RepertoireTrend;

  if (!sufficientRecentPosition) {
    label = 'INSUFFICIENT_DATA';
  } else if (input.historicalMoveGames === 0 && input.recentMoveGames >= 2) {
    label = 'NEW';
  } else if (input.historicalMoveGames >= 2 && input.recentMoveGames === 0) {
    label = 'DORMANT';
  } else if (input.historicalPositionGames < 3) {
    label = 'INSUFFICIENT_DATA';
  } else if (recentFrequency - historicalFrequency >= 0.15) {
    label = 'INCREASING';
  } else if (recentFrequency - historicalFrequency <= -0.15) {
    label = 'DECREASING';
  } else {
    label = 'STABLE';
  }

  return {
    version: REPERTOIRE_TREND_VERSION,
    label,
    historical: {
      moveGames: input.historicalMoveGames,
      positionGames: input.historicalPositionGames,
      frequency: historicalFrequency,
    },
    recent: {
      moveGames: input.recentMoveGames,
      positionGames: input.recentPositionGames,
      frequency: recentFrequency,
    },
    frequencyDelta:
      sufficientRecentPosition && input.historicalPositionGames >= 3
        ? recentFrequency - historicalFrequency
        : null,
  };
}

export function calculateOpponentFamiliarity(input: {
  gamesSeen: number;
  positionGames: number;
  recentGamesSeen: number;
  recentPositionGames: number;
  lastSeen: string | null;
  whiteWins: number;
  draws: number;
  blackWins: number;
  opponentWins: number;
}): OpponentFamiliarity {
  const frequency = ratio(input.gamesSeen, input.positionGames);
  const recentFrequency = ratio(input.recentGamesSeen, input.recentPositionGames);
  return {
    version: OPPONENT_FAMILIARITY_VERSION,
    gamesSeen: input.gamesSeen,
    positionGames: input.positionGames,
    frequency,
    recentGamesSeen: input.recentGamesSeen,
    recentPositionGames: input.recentPositionGames,
    recentFrequency,
    lastSeen: input.lastSeen,
    whiteWins: input.whiteWins,
    draws: input.draws,
    blackWins: input.blackWins,
    opponentScore:
      input.gamesSeen === 0 ? null : (input.opponentWins + 0.5 * input.draws) / input.gamesSeen,
    familiarityScore: clamp01(
      0.6 * frequency + 0.25 * recentFrequency + 0.15 * Math.min(input.gamesSeen / 5, 1),
    ),
  };
}

export function calculatePredictability(
  sampleGames: number,
  largestMoveGames: number,
): PredictabilityEvidence {
  const topMoveShare = ratio(largestMoveGames, sampleGames);
  const band: PredictabilityBand =
    sampleGames < 3
      ? 'INSUFFICIENT_SAMPLE'
      : topMoveShare >= 0.7
        ? 'HIGH'
        : topMoveShare >= 0.45
          ? 'MEDIUM'
          : 'LOW';
  return {
    version: REPERTOIRE_PREDICTABILITY_VERSION,
    sampleGames,
    topMoveShare,
    band,
  };
}

export function calculateReferenceStatistics(input: {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  whiteWins: number;
  blackWins: number;
}): ReferenceStatistics {
  return {
    ...input,
    rawScore: input.games === 0 ? 0 : (input.wins + 0.5 * input.draws) / input.games,
    adjustedScore:
      (input.wins + 0.5 * input.draws + STRONG_REFERENCE_PROFILE.scorePrior.points) /
      (input.games + STRONG_REFERENCE_PROFILE.scorePrior.games),
  };
}

export function classifyEngineSoundness(
  whiteRelativeScore: EngineScore,
  preparationColor: Color,
): EngineSoundnessClassification {
  const score = scoreForMover(whiteRelativeScore, preparationColor);
  if (score.kind === 'MATE') {
    return score.mateIn > 0 ? 'SOUND' : 'ENGINE_DISFAVORED';
  }
  if (score.centipawns >= -50) return 'SOUND';
  if (score.centipawns >= -150) return 'PLAYABLE';
  if (score.centipawns >= -300) return 'RISKY';
  return 'ENGINE_DISFAVORED';
}

export function calculatePreparationInterest(input: {
  familiarityScore: number;
  referenceGames: number | null;
  engineSoundness: EngineSoundnessClassification | null;
}): PreparationInterest {
  const opponentUnfamiliarity =
    input.familiarityScore < 0.2 ? 2 : input.familiarityScore < 0.5 ? 1 : 0;
  const referenceSupport =
    input.referenceGames === null
      ? 0
      : input.referenceGames >= 10
        ? 2
        : input.referenceGames >= 3
          ? 1
          : 0;
  const engineSoundness =
    input.engineSoundness === 'SOUND'
      ? 2
      : input.engineSoundness === 'PLAYABLE'
        ? 1
        : input.engineSoundness === 'ENGINE_DISFAVORED'
          ? -2
          : 0;
  const points = opponentUnfamiliarity + referenceSupport + engineSoundness;
  return {
    version: PREPARATION_INTEREST_VERSION,
    band: points >= 5 ? 'HIGH' : points >= 2 ? 'MEDIUM' : 'LOW',
    points,
    components: { opponentUnfamiliarity, referenceSupport, engineSoundness },
  };
}

export function oppositeColor(color: Color): Color {
  return color === 'WHITE' ? 'BLACK' : 'WHITE';
}

export function calculateRecentRepertoireWindow(asOf: Date): {
  months: typeof RECENT_REPERTOIRE_MONTHS;
  from: string;
  through: string;
} {
  const through = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const targetMonth = through.getUTCMonth() - RECENT_REPERTOIRE_MONTHS;
  const endOfTargetMonth = new Date(
    Date.UTC(through.getUTCFullYear(), targetMonth + 1, 0),
  ).getUTCDate();
  const from = new Date(
    Date.UTC(
      through.getUTCFullYear(),
      targetMonth,
      Math.min(through.getUTCDate(), endOfTargetMonth),
    ),
  );
  return {
    months: RECENT_REPERTOIRE_MONTHS,
    from: from.toISOString().slice(0, 10),
    through: through.toISOString().slice(0, 10),
  };
}
