import type {
  Color,
  CriticalPositionReason,
  DataSourceType,
  EngineScore,
  GameContext,
  MateOutcome,
  OpponentBehavior,
  ResolvedPlayerIdentity,
  TimeCategory,
} from './index';
import { scoreForMover } from './engine-analysis';

export const DOSSIER_EVIDENCE_QUALITY_VERSION = 'DOSSIER_EVIDENCE_QUALITY_V1';
export const REPERTOIRE_BREADTH_VERSION = 'REPERTOIRE_BREADTH_V1';
export const ENGINE_AGGREGATION_VERSION = 'ENGINE_AGGREGATION_V1';
export const DECISION_QUALITY_VERSION = 'DECISION_QUALITY_V1';
export const ADVANTAGE_CONVERSION_VERSION = 'ADVANTAGE_CONVERSION_V1';
export const DISADVANTAGE_RECOVERY_VERSION = 'DISADVANTAGE_RECOVERY_V1';
export const OBJECTIVE_BEHAVIOR_VERSION = 'OBJECTIVE_BEHAVIOR_V1';
export const QUEEN_TRADE_TIMING_VERSION = 'QUEEN_TRADE_TIMING_V1';
export const RECENT_DECISION_MONTHS = 12;

export const OPPONENT_RATING_BANDS = [
  'UNDER_1800',
  '1800_1999',
  '2000_2199',
  '2200_2399',
  '2400_PLUS',
  'UNKNOWN',
] as const;
export type OpponentRatingBand = (typeof OPPONENT_RATING_BANDS)[number];

export const CENTIPAWN_LOSS_BANDS = ['CP_0_19', 'CP_20_74', 'CP_75_199', 'CP_200_PLUS'] as const;
export type CentipawnLossBand = (typeof CENTIPAWN_LOSS_BANDS)[number];

export const EVIDENCE_QUALITY_BANDS = ['INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH'] as const;
export type EvidenceQualityBand = (typeof EVIDENCE_QUALITY_BANDS)[number];

export const REPERTOIRE_BREADTH_BANDS = [
  'INSUFFICIENT_SAMPLE',
  'CONCENTRATED',
  'BALANCED',
  'BROAD',
] as const;
export type RepertoireBreadthBand = (typeof REPERTOIRE_BREADTH_BANDS)[number];

export const GAME_PHASES = ['OPENING', 'MIDDLEGAME', 'ENDGAME'] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export interface PlayerDossierFilters {
  gameContexts: GameContext[];
  timeCategories: TimeCategory[];
  playedFrom: string | null;
  playedTo: string | null;
  minimumOpponentRating: number | null;
  sourceTypes: DataSourceType[];
}

export const CONSERVATIVE_DOSSIER_FILTERS: Readonly<PlayerDossierFilters> = {
  gameContexts: ['OTB'],
  timeCategories: ['CLASSICAL'],
  playedFrom: null,
  playedTo: null,
  minimumOpponentRating: null,
  sourceTypes: [],
};

export interface PlayerGameFact {
  gameId: string;
  focalColor: Color;
  focalRating: number | null;
  opponentName: string;
  opponentRating: number | null;
  event: string | null;
  playedAt: string | null;
  result: string;
  gameContext: GameContext;
  timeCategory: TimeCategory;
  contentStatus: 'METADATA_ONLY' | 'MOVES_AVAILABLE';
  moveCount: number;
  castling: 'KING_SIDE' | 'QUEEN_SIDE' | 'NO_CASTLING_MOVE_RECORDED';
  queenTradePly: number | null;
  sourceTypes: DataSourceType[];
}

export interface PerformanceCounts {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  unresolvedResults: number;
  score: number | null;
  scorePerspective: 'FOCAL_PLAYER';
}

export interface PerformanceSummary {
  overall: PerformanceCounts;
  byColor: Array<{ color: Color; performance: PerformanceCounts }>;
  byOpponentRatingBand: Array<{ band: OpponentRatingBand; performance: PerformanceCounts }>;
  byYear: Array<{ year: number; performance: PerformanceCounts }>;
  undatedGames: number;
  recordedRatingTimeline: Array<{ gameId: string; playedAt: string; rating: number }>;
  ratingTimelineMeaning: 'RECORDED_GAME_OBSERVATIONS_NOT_OFFICIAL_HISTORY';
}

export interface EvidenceQuality {
  version: typeof DOSSIER_EVIDENCE_QUALITY_VERSION;
  band: EvidenceQualityBand;
  points: number;
  inputs: {
    canonicalGames: number;
    usableGames: number;
    compatibleAnalyzedGames: number;
    engineCoverageRatio: number;
    opponentRatingCompleteness: number;
    latestKnownGame: string | null;
    latestGameWithin18Months: boolean;
  };
  components: {
    usableGames: number;
    engineCoverage: number;
    opponentRatingCompleteness: number;
    dateRecency: number;
  };
  meaning: 'EVIDENCE_COVERAGE_NOT_PLAYER_QUALITY';
}

export interface RepertoireBreadth {
  version: typeof REPERTOIRE_BREADTH_VERSION;
  sampleGames: number;
  moveCount: number;
  topMoveShare: number;
  shannonEntropy: number;
  effectiveBranchCount: number;
  band: RepertoireBreadthBand;
}

export interface PlayerRepertoireSummary {
  recentWindow: { months: number; from: string; through: string };
  asWhite: { behavior: OpponentBehavior; breadth: RepertoireBreadth };
  asBlack: Array<{
    againstMove: { san: string; uci: string; resultingPositionId: string; games: number };
    behavior: OpponentBehavior;
    breadth: RepertoireBreadth;
  }>;
}

export interface SelectedEngineRunEvidence {
  id: string;
  gameId: string;
  completedAt: string;
  engineFamily: 'STOCKFISH' | 'FAKE';
  engineReportedName: string;
  engineReportedVersion: string | null;
  binarySha256: string;
  profile: 'QUICK_V1';
  profileVersion: number;
  engineOptions: Record<string, unknown>;
  searchLimit: { type: 'DEPTH' | 'NODES' | 'MOVETIME'; value: number };
  multiPv: number;
  detectorVersion: string;
  startedAt: string;
}

export interface EngineAggregationEvidence {
  version: typeof ENGINE_AGGREGATION_VERSION;
  selection: 'LATEST_COMPLETED_SUCCESSFUL_RUN_PER_CANONICAL_GAME';
  requestedProfile: { name: 'QUICK_V1'; version: number };
  eligibleGames: number;
  selectedAnalyzedGames: number;
  coverageRatio: number;
  selectedRuns: SelectedEngineRunEvidence[];
}

export interface PlayerEngineObservation {
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
  phase: GamePhase;
  centipawnLoss: number | null;
  mateOutcome: MateOutcome;
  bestScoreWhite: EngineScore;
  criticalReasons: CriticalPositionReason[];
}

export interface DecisionPhaseSummary {
  phase: GamePhase;
  analyzedMoves: number;
  centipawnAssessedMoves: number;
  meanCentipawnLoss: number | null;
  medianCentipawnLoss: number | null;
}

export interface DecisionQualitySummary {
  version: typeof DECISION_QUALITY_VERSION;
  scorePerspective: 'FOCAL_PLAYER';
  analyzedGames: number;
  analyzedMoves: number;
  centipawnAssessedMoves: number;
  meanCentipawnLoss: number | null;
  medianCentipawnLoss: number | null;
  centipawnLossBands: Array<{ band: CentipawnLossBand; moves: number; share: number }>;
  mateAssessments: {
    assessedMoves: number;
    outcomes: Array<{ outcome: Exclude<MateOutcome, 'NOT_APPLICABLE'>; moves: number }>;
  };
  byPhase: DecisionPhaseSummary[];
}

export interface CriticalEventEvidence {
  gameId: string;
  analysisRunId: string;
  occurrencePly: number;
  phase: GamePhase;
  reason: CriticalPositionReason;
  playedAt: string | null;
  opponentName: string;
  opponentRating: number | null;
  event: string | null;
  result: string;
}

export interface CriticalEventAggregate {
  reason: CriticalPositionReason;
  events: number;
  gamesAffected: number;
  perAnalyzedGame: number;
  per100AnalyzedMoves: number;
}

export interface CriticalPatternSummary {
  playerDecisionEvents: CriticalEventAggregate[];
  positionComplexityEvents: CriticalEventAggregate[];
  byPhase: Array<{
    phase: GamePhase;
    playerDecisionEvents: number;
    positionComplexityEvents: number;
  }>;
  recencyComparison: {
    recentWindowMonths: typeof RECENT_DECISION_MONTHS;
    all: { analyzedGames: number; analyzedMoves: number; playerDecisionEvents: number };
    recent: { analyzedGames: number; analyzedMoves: number; playerDecisionEvents: number };
  };
  evidence: CriticalEventEvidence[];
  interpretation: 'RECURRENCE_IS_OBSERVED_FREQUENCY_NOT_A_SKILL_OR_PSYCHOLOGY_LABEL';
}

export interface OpportunityEvidence {
  gameId: string;
  analysisRunId: string;
  firstOpportunityPly: number;
  phase: GamePhase;
  scoreAtOpportunity: EngineScore & { perspective: 'FOCAL_PLAYER' };
  playedAt: string | null;
  opponentName: string;
  opponentRating: number | null;
  event: string | null;
  result: string;
  outcome: 'WIN' | 'DRAW' | 'LOSS' | 'UNRESOLVED';
}

export interface OpportunitySummary {
  version: typeof ADVANTAGE_CONVERSION_VERSION | typeof DISADVANTAGE_RECOVERY_VERSION;
  threshold: { centipawns: 150; mateCounts: true };
  opportunities: number;
  wins: number;
  draws: number;
  losses: number;
  unresolvedResults: number;
  successfulOutcomes: number;
  rate: number | null;
  evidence: OpportunityEvidence[];
}

export interface ObjectiveBehaviorSummary {
  version: typeof OBJECTIVE_BEHAVIOR_VERSION;
  gamesWithMoves: number;
  gameLength: {
    unit: 'PLIES';
    mean: number | null;
    median: number | null;
    meanMoves: number | null;
    medianMoves: number | null;
  };
  results: {
    completedGames: number;
    draws: number;
    decisiveGames: number;
    drawRate: number | null;
    decisiveRate: number | null;
  };
  castling: Array<{
    color: Color;
    gamesWithMoves: number;
    kingSide: number;
    queenSide: number;
    noCastlingMoveRecorded: number;
  }>;
  queenTradeTiming: {
    version: typeof QUEEN_TRADE_TIMING_VERSION;
    earlyBoundaryPly: 20;
    gamesWithRecordedQueenTrade: number;
    medianPly: number | null;
    earlyGames: number;
    earlyRate: number | null;
  };
  interpretation: 'OBJECTIVE_RECORDED_BEHAVIOR_NOT_PSYCHOLOGY';
}

export interface PlayerIntelligenceDossier {
  generatedAt: string;
  player: ResolvedPlayerIdentity;
  filters: PlayerDossierFilters;
  coverage: {
    canonicalGames: number;
    gamesWithMoves: number;
    metadataOnlyGames: number;
    otbGames: number;
    onlineGames: number;
    unknownContextGames: number;
    classicalGames: number;
    rapidGames: number;
    blitzGames: number;
    otherTimeCategoryGames: number;
    whiteGames: number;
    blackGames: number;
    earliestKnownGame: string | null;
    latestKnownGame: string | null;
    engineEligibleGames: number;
    compatibleAnalyzedGames: number;
    engineCoverageRatio: number;
  };
  evidenceQuality: EvidenceQuality;
  performance: PerformanceSummary;
  repertoire: PlayerRepertoireSummary;
  engine: {
    aggregation: EngineAggregationEvidence;
    decisionQuality: DecisionQualitySummary;
    criticalPatterns: CriticalPatternSummary;
    advantageConversion: OpportunitySummary;
    disadvantageRecovery: OpportunitySummary;
  };
  objectiveBehavior: ObjectiveBehaviorSummary;
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function classifyOpponentRating(rating: number | null): OpponentRatingBand {
  if (rating === null) return 'UNKNOWN';
  if (rating < 1800) return 'UNDER_1800';
  if (rating < 2000) return '1800_1999';
  if (rating < 2200) return '2000_2199';
  if (rating < 2400) return '2200_2399';
  return '2400_PLUS';
}

export function classifyCentipawnLoss(loss: number): CentipawnLossBand {
  if (loss < 20) return 'CP_0_19';
  if (loss < 75) return 'CP_20_74';
  if (loss < 200) return 'CP_75_199';
  return 'CP_200_PLUS';
}

function focalOutcome(result: string, color: Color): 'WIN' | 'DRAW' | 'LOSS' | 'UNRESOLVED' {
  if (result === '1/2-1/2') return 'DRAW';
  if (result === '1-0') return color === 'WHITE' ? 'WIN' : 'LOSS';
  if (result === '0-1') return color === 'BLACK' ? 'WIN' : 'LOSS';
  return 'UNRESOLVED';
}

function performance(records: readonly PlayerGameFact[]): PerformanceCounts {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let unresolvedResults = 0;
  for (const record of records) {
    const outcome = focalOutcome(record.result, record.focalColor);
    if (outcome === 'WIN') wins += 1;
    else if (outcome === 'DRAW') draws += 1;
    else if (outcome === 'LOSS') losses += 1;
    else unresolvedResults += 1;
  }
  const games = wins + draws + losses;
  return {
    games,
    wins,
    draws,
    losses,
    unresolvedResults,
    score: games === 0 ? null : (wins + draws * 0.5) / games,
    scorePerspective: 'FOCAL_PLAYER',
  };
}

export function calculatePerformanceSummary(
  records: readonly PlayerGameFact[],
): PerformanceSummary {
  return {
    overall: performance(records),
    byColor: (['WHITE', 'BLACK'] as const).map((color) => ({
      color,
      performance: performance(records.filter((record) => record.focalColor === color)),
    })),
    byOpponentRatingBand: OPPONENT_RATING_BANDS.map((band) => ({
      band,
      performance: performance(
        records.filter((record) => classifyOpponentRating(record.opponentRating) === band),
      ),
    })),
    byYear: [
      ...new Set(
        records.flatMap((record) => (record.playedAt ? [+record.playedAt.slice(0, 4)] : [])),
      ),
    ]
      .sort((left, right) => left - right)
      .map((year) => ({
        year,
        performance: performance(
          records.filter((record) => record.playedAt?.startsWith(`${year}-`) ?? false),
        ),
      })),
    undatedGames: records.filter((record) => record.playedAt === null).length,
    recordedRatingTimeline: records
      .filter(
        (record): record is PlayerGameFact & { playedAt: string; focalRating: number } =>
          record.playedAt !== null && record.focalRating !== null,
      )
      .map((record) => ({
        gameId: record.gameId,
        playedAt: record.playedAt,
        rating: record.focalRating,
      }))
      .sort(
        (left, right) =>
          left.playedAt.localeCompare(right.playedAt) || left.gameId.localeCompare(right.gameId),
      ),
    ratingTimelineMeaning: 'RECORDED_GAME_OBSERVATIONS_NOT_OFFICIAL_HISTORY',
  };
}

export function calculateEvidenceQuality(input: {
  canonicalGames: number;
  usableGames: number;
  compatibleAnalyzedGames: number;
  opponentRatingKnownGames: number;
  latestKnownGame: string | null;
  asOf: Date;
}): EvidenceQuality {
  const engineCoverageRatio = ratio(input.compatibleAnalyzedGames, input.usableGames);
  const opponentRatingCompleteness = ratio(input.opponentRatingKnownGames, input.canonicalGames);
  const latestBoundary = new Date(input.asOf);
  latestBoundary.setUTCMonth(latestBoundary.getUTCMonth() - 18);
  const latestGameWithin18Months =
    input.latestKnownGame !== null &&
    new Date(`${input.latestKnownGame}T00:00:00.000Z`) >= latestBoundary;
  const components = {
    usableGames: input.usableGames >= 30 ? 2 : input.usableGames >= 10 ? 1 : 0,
    engineCoverage: engineCoverageRatio >= 0.5 ? 2 : engineCoverageRatio >= 0.2 ? 1 : 0,
    opponentRatingCompleteness: opponentRatingCompleteness >= 0.8 ? 1 : 0,
    dateRecency: latestGameWithin18Months ? 1 : 0,
  };
  const points = Object.values(components).reduce((sum, value) => sum + value, 0);
  const band: EvidenceQualityBand =
    input.usableGames < 5
      ? 'INSUFFICIENT'
      : points >= 5
        ? 'HIGH'
        : points >= 3
          ? 'MODERATE'
          : 'LOW';
  return {
    version: DOSSIER_EVIDENCE_QUALITY_VERSION,
    band,
    points,
    inputs: {
      canonicalGames: input.canonicalGames,
      usableGames: input.usableGames,
      compatibleAnalyzedGames: input.compatibleAnalyzedGames,
      engineCoverageRatio,
      opponentRatingCompleteness,
      latestKnownGame: input.latestKnownGame,
      latestGameWithin18Months,
    },
    components,
    meaning: 'EVIDENCE_COVERAGE_NOT_PLAYER_QUALITY',
  };
}

export function calculateRepertoireBreadth(behavior: OpponentBehavior): RepertoireBreadth {
  const probabilities = behavior.moves
    .map((move) => move.frequency)
    .filter((frequency) => frequency > 0);
  const shannonEntropy = -probabilities.reduce(
    (entropy, probability) => entropy + probability * Math.log(probability),
    0,
  );
  const effectiveBranchCount = probabilities.length === 0 ? 0 : Math.exp(shannonEntropy);
  const topMoveShare = Math.max(0, ...probabilities);
  const band: RepertoireBreadthBand =
    behavior.sampleGames < 3
      ? 'INSUFFICIENT_SAMPLE'
      : topMoveShare >= 0.7 || effectiveBranchCount <= 1.5
        ? 'CONCENTRATED'
        : effectiveBranchCount >= 3
          ? 'BROAD'
          : 'BALANCED';
  return {
    version: REPERTOIRE_BREADTH_VERSION,
    sampleGames: behavior.sampleGames,
    moveCount: probabilities.length,
    topMoveShare,
    shannonEntropy,
    effectiveBranchCount,
    band,
  };
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateDecisionQuality(
  observations: readonly PlayerEngineObservation[],
): DecisionQualitySummary {
  const focal = observations.filter((observation) => observation.mover === observation.focalColor);
  const losses = focal.flatMap((observation) =>
    observation.centipawnLoss === null ? [] : [observation.centipawnLoss],
  );
  const bandCounts = new Map<CentipawnLossBand, number>();
  for (const loss of losses) {
    const band = classifyCentipawnLoss(loss);
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }
  const mateOutcomes = ['MATE_MISSED', 'MATE_ALLOWED', 'MATE_PRESERVED', 'MATE_CHANGED'] as const;
  return {
    version: DECISION_QUALITY_VERSION,
    scorePerspective: 'FOCAL_PLAYER',
    analyzedGames: new Set(focal.map((observation) => observation.gameId)).size,
    analyzedMoves: focal.length,
    centipawnAssessedMoves: losses.length,
    meanCentipawnLoss: average(losses),
    medianCentipawnLoss: median(losses),
    centipawnLossBands: CENTIPAWN_LOSS_BANDS.map((band) => ({
      band,
      moves: bandCounts.get(band) ?? 0,
      share: ratio(bandCounts.get(band) ?? 0, losses.length),
    })),
    mateAssessments: {
      assessedMoves: focal.filter((observation) => observation.mateOutcome !== 'NOT_APPLICABLE')
        .length,
      outcomes: mateOutcomes.map((outcome) => ({
        outcome,
        moves: focal.filter((observation) => observation.mateOutcome === outcome).length,
      })),
    },
    byPhase: GAME_PHASES.map((phase) => {
      const phaseObservations = focal.filter((observation) => observation.phase === phase);
      const phaseLosses = phaseObservations.flatMap((observation) =>
        observation.centipawnLoss === null ? [] : [observation.centipawnLoss],
      );
      return {
        phase,
        analyzedMoves: phaseObservations.length,
        centipawnAssessedMoves: phaseLosses.length,
        meanCentipawnLoss: average(phaseLosses),
        medianCentipawnLoss: median(phaseLosses),
      };
    }),
  };
}

const PLAYER_DECISION_REASONS: readonly CriticalPositionReason[] = [
  'EVAL_LOSS',
  'SEVERE_EVAL_LOSS',
  'ADVANTAGE_DROPPED',
  'MATE_MISSED',
  'MATE_ALLOWED',
];

function eventAggregate(
  reason: CriticalPositionReason,
  events: readonly CriticalEventEvidence[],
  analyzedGames: number,
  analyzedMoves: number,
): CriticalEventAggregate {
  const matching = events.filter((event) => event.reason === reason);
  return {
    reason,
    events: matching.length,
    gamesAffected: new Set(matching.map((event) => event.gameId)).size,
    perAnalyzedGame: ratio(matching.length, analyzedGames),
    per100AnalyzedMoves: ratio(matching.length * 100, analyzedMoves),
  };
}

export function calculateCriticalPatterns(
  observations: readonly PlayerEngineObservation[],
  asOf: Date,
): CriticalPatternSummary {
  const focal = observations.filter((observation) => observation.mover === observation.focalColor);
  const evidence = focal.flatMap((observation) =>
    observation.criticalReasons.map((reason) => ({
      gameId: observation.gameId,
      analysisRunId: observation.run.id,
      occurrencePly: observation.occurrencePly,
      phase: observation.phase,
      reason,
      playedAt: observation.playedAt,
      opponentName: observation.opponentName,
      opponentRating: observation.opponentRating,
      event: observation.event,
      result: observation.result,
    })),
  );
  const analyzedGames = new Set(focal.map((observation) => observation.gameId)).size;
  const recentBoundary = new Date(asOf);
  recentBoundary.setUTCMonth(recentBoundary.getUTCMonth() - RECENT_DECISION_MONTHS);
  const recentFocal = focal.filter(
    (observation) =>
      observation.playedAt !== null &&
      new Date(`${observation.playedAt}T00:00:00.000Z`) >= recentBoundary,
  );
  const playerEvents = evidence.filter((event) => PLAYER_DECISION_REASONS.includes(event.reason));
  const recentGameIds = new Set(recentFocal.map((observation) => observation.gameId));
  const recentPlayerEvents = playerEvents.filter((event) => recentGameIds.has(event.gameId));
  return {
    playerDecisionEvents: PLAYER_DECISION_REASONS.map((reason) =>
      eventAggregate(reason, evidence, analyzedGames, focal.length),
    ),
    positionComplexityEvents: [
      eventAggregate('HIGH_DECISION_SENSITIVITY', evidence, analyzedGames, focal.length),
    ],
    byPhase: GAME_PHASES.map((phase) => ({
      phase,
      playerDecisionEvents: playerEvents.filter((event) => event.phase === phase).length,
      positionComplexityEvents: evidence.filter(
        (event) => event.phase === phase && event.reason === 'HIGH_DECISION_SENSITIVITY',
      ).length,
    })),
    recencyComparison: {
      recentWindowMonths: RECENT_DECISION_MONTHS,
      all: {
        analyzedGames,
        analyzedMoves: focal.length,
        playerDecisionEvents: playerEvents.length,
      },
      recent: {
        analyzedGames: recentGameIds.size,
        analyzedMoves: recentFocal.length,
        playerDecisionEvents: recentPlayerEvents.length,
      },
    },
    evidence,
    interpretation: 'RECURRENCE_IS_OBSERVED_FREQUENCY_NOT_A_SKILL_OR_PSYCHOLOGY_LABEL',
  };
}

function focalScore(
  score: EngineScore,
  color: Color,
): EngineScore & { perspective: 'FOCAL_PLAYER' } {
  return { ...scoreForMover(score, color), perspective: 'FOCAL_PLAYER' };
}

function opportunity(
  observations: readonly PlayerEngineObservation[],
  kind: 'ADVANTAGE' | 'DISADVANTAGE',
): OpportunitySummary {
  const byGame = new Map<string, PlayerEngineObservation[]>();
  for (const observation of observations) {
    const group = byGame.get(observation.gameId) ?? [];
    group.push(observation);
    byGame.set(observation.gameId, group);
  }
  const evidence: OpportunityEvidence[] = [];
  for (const game of byGame.values()) {
    game.sort((left, right) => left.occurrencePly - right.occurrencePly);
    const first = game.find((observation) => {
      const score = focalScore(observation.bestScoreWhite, observation.focalColor);
      if (score.kind === 'MATE') return kind === 'ADVANTAGE' ? score.mateIn > 0 : score.mateIn < 0;
      return kind === 'ADVANTAGE' ? score.centipawns >= 150 : score.centipawns <= -150;
    });
    if (!first) continue;
    evidence.push({
      gameId: first.gameId,
      analysisRunId: first.run.id,
      firstOpportunityPly: first.occurrencePly,
      phase: first.phase,
      scoreAtOpportunity: focalScore(first.bestScoreWhite, first.focalColor),
      playedAt: first.playedAt,
      opponentName: first.opponentName,
      opponentRating: first.opponentRating,
      event: first.event,
      result: first.result,
      outcome: focalOutcome(first.result, first.focalColor),
    });
  }
  evidence.sort(
    (left, right) =>
      (right.playedAt ?? '').localeCompare(left.playedAt ?? '') ||
      left.gameId.localeCompare(right.gameId),
  );
  const wins = evidence.filter((item) => item.outcome === 'WIN').length;
  const draws = evidence.filter((item) => item.outcome === 'DRAW').length;
  const losses = evidence.filter((item) => item.outcome === 'LOSS').length;
  const unresolvedResults = evidence.filter((item) => item.outcome === 'UNRESOLVED').length;
  const resolved = wins + draws + losses;
  const successfulOutcomes = kind === 'ADVANTAGE' ? wins : wins + draws;
  return {
    version: kind === 'ADVANTAGE' ? ADVANTAGE_CONVERSION_VERSION : DISADVANTAGE_RECOVERY_VERSION,
    threshold: { centipawns: 150, mateCounts: true },
    opportunities: evidence.length,
    wins,
    draws,
    losses,
    unresolvedResults,
    successfulOutcomes,
    rate: resolved === 0 ? null : successfulOutcomes / resolved,
    evidence,
  };
}

export function calculateAdvantageConversion(
  observations: readonly PlayerEngineObservation[],
): OpportunitySummary {
  return opportunity(observations, 'ADVANTAGE');
}

export function calculateDisadvantageRecovery(
  observations: readonly PlayerEngineObservation[],
): OpportunitySummary {
  return opportunity(observations, 'DISADVANTAGE');
}

export function calculateObjectiveBehavior(
  records: readonly PlayerGameFact[],
): ObjectiveBehaviorSummary {
  const withMoves = records.filter((record) => record.contentStatus === 'MOVES_AVAILABLE');
  const lengths = withMoves.map((record) => record.moveCount);
  const completed = records.filter(
    (record) => focalOutcome(record.result, record.focalColor) !== 'UNRESOLVED',
  );
  const draws = completed.filter(
    (record) => focalOutcome(record.result, record.focalColor) === 'DRAW',
  ).length;
  const decisiveGames = completed.length - draws;
  const queenTrades = withMoves.flatMap((record) =>
    record.queenTradePly === null ? [] : [record.queenTradePly],
  );
  return {
    version: OBJECTIVE_BEHAVIOR_VERSION,
    gamesWithMoves: withMoves.length,
    gameLength: {
      unit: 'PLIES',
      mean: average(lengths),
      median: median(lengths),
      meanMoves: average(lengths) === null ? null : average(lengths)! / 2,
      medianMoves: median(lengths) === null ? null : median(lengths)! / 2,
    },
    results: {
      completedGames: completed.length,
      draws,
      decisiveGames,
      drawRate: completed.length === 0 ? null : draws / completed.length,
      decisiveRate: completed.length === 0 ? null : decisiveGames / completed.length,
    },
    castling: (['WHITE', 'BLACK'] as const).map((color) => {
      const games = withMoves.filter((record) => record.focalColor === color);
      return {
        color,
        gamesWithMoves: games.length,
        kingSide: games.filter((record) => record.castling === 'KING_SIDE').length,
        queenSide: games.filter((record) => record.castling === 'QUEEN_SIDE').length,
        noCastlingMoveRecorded: games.filter(
          (record) => record.castling === 'NO_CASTLING_MOVE_RECORDED',
        ).length,
      };
    }),
    queenTradeTiming: {
      version: QUEEN_TRADE_TIMING_VERSION,
      earlyBoundaryPly: 20,
      gamesWithRecordedQueenTrade: queenTrades.length,
      medianPly: median(queenTrades),
      earlyGames: queenTrades.filter((ply) => ply <= 20).length,
      earlyRate:
        queenTrades.length === 0
          ? null
          : queenTrades.filter((ply) => ply <= 20).length / queenTrades.length,
    },
    interpretation: 'OBJECTIVE_RECORDED_BEHAVIOR_NOT_PSYCHOLOGY',
  };
}
