import {
  analysisProfileConfigurationHash,
  type AnalysisRepository,
  type ClaimedAnalysisJob,
} from '@chess-intelligent/db';
import {
  ANALYSIS_PROFILE_CONFIGURATIONS,
  calculateCentipawnLoss,
  classifyMateOutcome,
  CriticalPositionDetector,
  exactHistorySha256,
  type ChessEngine,
  type EnginePrincipalVariation,
} from '@chess-intelligent/domain';

import { EngineProcessError } from './stockfish-uci-engine';

export type ChessEngineFactory = () => ChessEngine;

function sortedAndValidatedLines(
  lines: readonly EnginePrincipalVariation[],
): EnginePrincipalVariation[] {
  const sorted = [...lines].sort((left, right) => left.pvRank - right.pvRank);
  if (!sorted[0] || sorted[0].pvRank !== 1) {
    throw new EngineProcessError('An engine analysis did not include MultiPV rank 1.');
  }
  if (new Set(sorted.map((line) => line.pvRank)).size !== sorted.length) {
    throw new EngineProcessError('An engine analysis returned duplicate MultiPV ranks.');
  }
  return sorted;
}

export class AnalysisWorker {
  private readonly detector = new CriticalPositionDetector();

  constructor(
    private readonly repository: AnalysisRepository,
    private readonly engineFactory: ChessEngineFactory,
    private readonly workerId: string,
  ) {}

  async recoverStaleWork(now = new Date()): Promise<number> {
    return this.repository.recoverStaleJobs(new Date(now.valueOf() - 2 * 60_000));
  }

  async runNext(): Promise<ClaimedAnalysisJob | null> {
    const job = await this.repository.claimNext(this.workerId);
    if (!job) return null;
    const profile = ANALYSIS_PROFILE_CONFIGURATIONS[job.profile];
    let engine: ChessEngine | null = null;
    let runId: string | null = null;
    try {
      if (analysisProfileConfigurationHash(profile) !== job.configurationSha256) {
        throw new Error('The requested profile hash does not match the application profile.');
      }
      const game = await this.repository.loadGameForAnalysis(job);
      engine = this.engineFactory();
      const identity = await engine.identify();
      runId = await this.repository.createRun(job, identity, profile);
      await engine.newGame(profile.engine);

      for (const occurrence of game.occurrences) {
        const position = {
          initialFen: game.initialFen,
          moves: occurrence.historyUci,
          sideToMove: occurrence.sideToMove,
        } as const;
        const unrestricted = await engine.analyze({ position, configuration: profile.engine });
        const multiPv = sortedAndValidatedLines(unrestricted.lines);
        const best = multiPv[0]!;
        const forced = await engine.analyze({
          position,
          configuration: profile.engine,
          allowedRootMoves: [occurrence.playedMoveUci],
        });
        const played = sortedAndValidatedLines(forced.lines)[0]!;
        if (played.rootMoveUci !== occurrence.playedMoveUci) {
          throw new EngineProcessError(
            'The forced-root evaluation did not evaluate the played move.',
          );
        }
        const centipawnLoss = calculateCentipawnLoss(
          best.score,
          played.score,
          occurrence.sideToMove,
        );
        const mateOutcome = classifyMateOutcome(best.score, played.score, occurrence.sideToMove);
        const critical = this.detector.detect({
          mover: occurrence.sideToMove,
          bestScore: best.score,
          playedScore: played.score,
          multiPvScores: multiPv.map((line) => line.score),
        });
        await this.repository.persistPosition(job.id, runId, {
          gameId: game.gameId,
          ply: occurrence.ply,
          normalizedPositionId: occurrence.normalizedPositionId,
          initialFen: game.initialFen,
          historyUci: occurrence.historyUci,
          historySha256: exactHistorySha256(game.initialFen, occurrence.historyUci),
          sideToMove: occurrence.sideToMove,
          playedMoveUci: occurrence.playedMoveUci,
          bestMoveUci: unrestricted.bestMoveUci,
          multiPv,
          playedMoveEvaluation: played,
          centipawnLoss,
          mateOutcome,
          critical,
        });
      }
      await engine.close();
      engine = null;
      await this.repository.succeed(job.id, runId);
      return job;
    } catch (error) {
      try {
        await engine?.close();
      } catch {
        // The original engine error remains the lifecycle cause.
      }
      await this.repository.fail(job, runId, error, error instanceof EngineProcessError);
      return job;
    }
  }
}
