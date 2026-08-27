import { createHash } from 'node:crypto';

import type { Color } from './index';

export const ANALYSIS_PROFILES = ['QUICK_V1'] as const;
export type AnalysisProfileName = (typeof ANALYSIS_PROFILES)[number];

export const ANALYSIS_JOB_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type AnalysisJobStatus = (typeof ANALYSIS_JOB_STATUSES)[number];

export const ANALYSIS_RUN_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type AnalysisRunStatus = (typeof ANALYSIS_RUN_STATUSES)[number];

export const ENGINE_EVALUATION_ROLES = ['MULTIPV', 'PLAYED_MOVE'] as const;
export type EngineEvaluationRole = (typeof ENGINE_EVALUATION_ROLES)[number];

export const SEARCH_LIMIT_TYPES = ['DEPTH', 'NODES', 'MOVETIME'] as const;
export type SearchLimitType = (typeof SEARCH_LIMIT_TYPES)[number];

export type EngineScore =
  { kind: 'CENTIPAWN'; centipawns: number } | { kind: 'MATE'; mateIn: number };

export interface EngineIdentity {
  family: 'STOCKFISH' | 'FAKE';
  reportedName: string;
  reportedVersion: string | null;
  binarySha256: string;
}

export interface EngineSearchConfiguration {
  threads: number;
  hashMb: number;
  multiPv: number;
  searchLimit: { type: SearchLimitType; value: number };
  analysisTimeoutMs: number;
}

export interface AnalysisProfile {
  name: AnalysisProfileName;
  version: number;
  engine: EngineSearchConfiguration;
  maximumGamePlies: number;
}

export const ANALYSIS_PROFILE_CONFIGURATIONS: Readonly<
  Record<AnalysisProfileName, AnalysisProfile>
> = {
  QUICK_V1: {
    name: 'QUICK_V1',
    version: 1,
    engine: {
      threads: 1,
      hashMb: 32,
      multiPv: 2,
      searchLimit: { type: 'DEPTH', value: 10 },
      analysisTimeoutMs: 20_000,
    },
    maximumGamePlies: 240,
  },
};

export interface EnginePosition {
  initialFen: string;
  moves: readonly string[];
  sideToMove: Color;
}

export function exactHistorySha256(initialFen: string, moves: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify({ initialFen, moves }), 'utf8').digest('hex');
}

export interface EnginePrincipalVariation {
  pvRank: number;
  rootMoveUci: string;
  moves: readonly string[];
  score: EngineScore;
  depth: number | null;
  seldepth: number | null;
  nodes: number | null;
  nps: number | null;
  timeMs: number | null;
  hashfull: number | null;
}

export interface EngineAnalysisRequest {
  position: EnginePosition;
  configuration: EngineSearchConfiguration;
  allowedRootMoves?: readonly string[];
}

export interface EngineAnalysisResult {
  bestMoveUci: string;
  lines: readonly EnginePrincipalVariation[];
}

export interface ChessEngine {
  identify(): Promise<EngineIdentity>;
  newGame(configuration: EngineSearchConfiguration): Promise<void>;
  analyze(request: EngineAnalysisRequest): Promise<EngineAnalysisResult>;
  close(): Promise<void>;
}

export function normalizeScoreToWhitePerspective(
  score: EngineScore,
  sideToMove: Color,
): EngineScore {
  if (sideToMove === 'WHITE') {
    return score;
  }
  return score.kind === 'CENTIPAWN'
    ? { kind: 'CENTIPAWN', centipawns: -score.centipawns }
    : { kind: 'MATE', mateIn: -score.mateIn };
}

export function scoreForMover(score: EngineScore, mover: Color): EngineScore {
  if (mover === 'WHITE') {
    return score;
  }
  return score.kind === 'CENTIPAWN'
    ? { kind: 'CENTIPAWN', centipawns: -score.centipawns }
    : { kind: 'MATE', mateIn: -score.mateIn };
}

export function calculateCentipawnLoss(
  bestWhiteRelative: EngineScore,
  playedWhiteRelative: EngineScore,
  mover: Color,
): number | null {
  if (bestWhiteRelative.kind !== 'CENTIPAWN' || playedWhiteRelative.kind !== 'CENTIPAWN') {
    return null;
  }
  const best = mover === 'WHITE' ? bestWhiteRelative.centipawns : -bestWhiteRelative.centipawns;
  const played =
    mover === 'WHITE' ? playedWhiteRelative.centipawns : -playedWhiteRelative.centipawns;
  return Math.max(0, best - played);
}

export const MATE_OUTCOMES = [
  'NOT_APPLICABLE',
  'MATE_MISSED',
  'MATE_ALLOWED',
  'MATE_PRESERVED',
  'MATE_CHANGED',
] as const;
export type MateOutcome = (typeof MATE_OUTCOMES)[number];

function isWinningMateForMover(score: EngineScore, mover: Color): boolean {
  const moverScore = scoreForMover(score, mover);
  return moverScore.kind === 'MATE' && moverScore.mateIn > 0;
}

function isLosingMateForMover(score: EngineScore, mover: Color): boolean {
  const moverScore = scoreForMover(score, mover);
  return moverScore.kind === 'MATE' && moverScore.mateIn < 0;
}

export function classifyMateOutcome(
  bestWhiteRelative: EngineScore,
  playedWhiteRelative: EngineScore,
  mover: Color,
): MateOutcome {
  if (bestWhiteRelative.kind !== 'MATE' && playedWhiteRelative.kind !== 'MATE') {
    return 'NOT_APPLICABLE';
  }

  if (
    isWinningMateForMover(bestWhiteRelative, mover) &&
    isWinningMateForMover(playedWhiteRelative, mover)
  ) {
    return 'MATE_PRESERVED';
  }
  if (
    isWinningMateForMover(bestWhiteRelative, mover) &&
    !isWinningMateForMover(playedWhiteRelative, mover)
  ) {
    return 'MATE_MISSED';
  }
  if (
    !isLosingMateForMover(bestWhiteRelative, mover) &&
    isLosingMateForMover(playedWhiteRelative, mover)
  ) {
    return 'MATE_ALLOWED';
  }
  return 'MATE_CHANGED';
}

export const CRITICAL_POSITION_REASONS = [
  'EVAL_LOSS',
  'SEVERE_EVAL_LOSS',
  'ADVANTAGE_DROPPED',
  'MATE_MISSED',
  'MATE_ALLOWED',
  'HIGH_DECISION_SENSITIVITY',
] as const;
export type CriticalPositionReason = (typeof CRITICAL_POSITION_REASONS)[number];

export const CRITICAL_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type CriticalSeverity = (typeof CRITICAL_SEVERITIES)[number];

export const CRITICAL_DETECTOR_VERSION = 'CRITICAL_DETECTOR_V1';

export interface CriticalDetectorConfiguration {
  evaluationLossCp: number;
  severeEvaluationLossCp: number;
  meaningfulAdvantageCp: number;
  retainedAdvantageCp: number;
  decisionSensitivityCp: number;
}

export const CRITICAL_DETECTOR_V1_CONFIGURATION: Readonly<CriticalDetectorConfiguration> = {
  evaluationLossCp: 75,
  severeEvaluationLossCp: 200,
  meaningfulAdvantageCp: 100,
  retainedAdvantageCp: 40,
  decisionSensitivityCp: 120,
};

export interface CriticalPositionEvidence {
  mover: Color;
  bestScore: EngineScore;
  playedScore: EngineScore;
  multiPvScores: readonly EngineScore[];
}

export interface CriticalPositionDetection {
  detectorVersion: typeof CRITICAL_DETECTOR_VERSION;
  reasons: CriticalPositionReason[];
  severity: CriticalSeverity;
  centipawnLoss: number | null;
  mateOutcome: MateOutcome;
}

const SEVERITY_WEIGHT: Record<CriticalSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function highestSeverity(values: readonly CriticalSeverity[]): CriticalSeverity {
  return values.reduce((highest, value) =>
    SEVERITY_WEIGHT[value] > SEVERITY_WEIGHT[highest] ? value : highest,
  );
}

export class CriticalPositionDetector {
  constructor(
    private readonly configuration: CriticalDetectorConfiguration = CRITICAL_DETECTOR_V1_CONFIGURATION,
  ) {}

  detect(evidence: CriticalPositionEvidence): CriticalPositionDetection | null {
    const reasons: CriticalPositionReason[] = [];
    const severities: CriticalSeverity[] = [];
    const centipawnLoss = calculateCentipawnLoss(
      evidence.bestScore,
      evidence.playedScore,
      evidence.mover,
    );
    const mateOutcome = classifyMateOutcome(
      evidence.bestScore,
      evidence.playedScore,
      evidence.mover,
    );

    if (centipawnLoss !== null && centipawnLoss >= this.configuration.evaluationLossCp) {
      reasons.push('EVAL_LOSS');
      severities.push('MEDIUM');
    }
    if (centipawnLoss !== null && centipawnLoss >= this.configuration.severeEvaluationLossCp) {
      reasons.push('SEVERE_EVAL_LOSS');
      severities.push('HIGH');
    }

    const bestForMover = scoreForMover(evidence.bestScore, evidence.mover);
    const playedForMover = scoreForMover(evidence.playedScore, evidence.mover);
    if (
      bestForMover.kind === 'CENTIPAWN' &&
      playedForMover.kind === 'CENTIPAWN' &&
      bestForMover.centipawns >= this.configuration.meaningfulAdvantageCp &&
      playedForMover.centipawns < this.configuration.retainedAdvantageCp
    ) {
      reasons.push('ADVANTAGE_DROPPED');
      severities.push('HIGH');
    }

    if (mateOutcome === 'MATE_MISSED') {
      reasons.push('MATE_MISSED');
      severities.push('CRITICAL');
    } else if (mateOutcome === 'MATE_ALLOWED') {
      reasons.push('MATE_ALLOWED');
      severities.push('CRITICAL');
    }

    const first = evidence.multiPvScores[0];
    const second = evidence.multiPvScores[1];
    if (first && second) {
      const firstForMover = scoreForMover(first, evidence.mover);
      const secondForMover = scoreForMover(second, evidence.mover);
      if (
        firstForMover.kind === 'CENTIPAWN' &&
        secondForMover.kind === 'CENTIPAWN' &&
        firstForMover.centipawns - secondForMover.centipawns >=
          this.configuration.decisionSensitivityCp
      ) {
        reasons.push('HIGH_DECISION_SENSITIVITY');
        severities.push('MEDIUM');
      }
    }

    if (reasons.length === 0) {
      return null;
    }
    return {
      detectorVersion: CRITICAL_DETECTOR_VERSION,
      reasons,
      severity: highestSeverity(severities),
      centipawnLoss,
      mateOutcome,
    };
  }
}
