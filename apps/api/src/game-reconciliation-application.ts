import { parsePgn } from '@chess-intelligent/chess-core';
import {
  PgnAttachmentError,
  type MetadataGameRepository,
  type PgnAttachmentResult,
} from '@chess-intelligent/db';
import {
  GameReconciliationService,
  type DataSourceType,
  type ReconciliationClassification,
  type ReconciliationContext,
  type ReconciliationReport,
} from '@chess-intelligent/domain';

export type ReviewedAttachmentErrorCode =
  | 'RECONCILIATION_CANDIDATE_NOT_FOUND'
  | 'RECONCILIATION_CONFLICT'
  | 'RECONCILIATION_EVIDENCE_TOO_WEAK'
  | 'RECONCILIATION_RESULT_STALE';

export class ReviewedAttachmentError extends Error {
  constructor(
    readonly code: ReviewedAttachmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReviewedAttachmentError';
  }
}

export interface ReconcilePgnCommand extends ReconciliationContext {
  pgn: string;
}

export interface AttachPgnCommand extends ReconcilePgnCommand {
  gameId: string;
  expectedClassification: ReconciliationClassification;
}

export class GameReconciliationApplicationService {
  private readonly reconciliation: GameReconciliationService;

  constructor(private readonly repository: MetadataGameRepository) {
    this.reconciliation = new GameReconciliationService(repository);
  }

  async preview(command: ReconcilePgnCommand): Promise<ReconciliationReport> {
    const parsed = parsePgn(command.pgn);
    return this.reconciliation.reconcile(parsed, command);
  }

  async attach(command: AttachPgnCommand): Promise<PgnAttachmentResult> {
    const parsed = parsePgn(command.pgn);
    const state = await this.repository.getAttachmentState(command.gameId);
    if (!state) {
      throw new PgnAttachmentError('GAME_NOT_FOUND', 'The canonical game does not exist.');
    }
    if (state.content_status === 'MOVES_AVAILABLE') {
      if (state.fingerprint !== parsed.fingerprint) {
        throw new PgnAttachmentError(
          'DIFFERENT_PGN_ALREADY_ATTACHED',
          'This game already has a materially different PGN attached.',
        );
      }
      return {
        status: 'already_attached',
        gameId: command.gameId,
        contentStatus: 'MOVES_AVAILABLE',
        verificationStatus: 'VERIFIED',
      };
    }

    const candidate = await this.reconciliation.reconcileGame(command.gameId, parsed, command);
    if (!candidate) {
      throw new ReviewedAttachmentError(
        'RECONCILIATION_CANDIDATE_NOT_FOUND',
        'The PGN does not have enough deterministic evidence for this canonical game.',
      );
    }
    if (candidate.classification === 'CONFLICT') {
      throw new ReviewedAttachmentError(
        'RECONCILIATION_CONFLICT',
        `Attachment rejected: ${candidate.reasons.join(' ')}`,
      );
    }
    if (candidate.classification === 'AMBIGUOUS_MATCH') {
      throw new ReviewedAttachmentError(
        'RECONCILIATION_EVIDENCE_TOO_WEAK',
        'Name-based evidence is ambiguous and cannot authorize PGN attachment.',
      );
    }
    if (candidate.classification !== command.expectedClassification) {
      throw new ReviewedAttachmentError(
        'RECONCILIATION_RESULT_STALE',
        `The current classification is ${candidate.classification}, not ${command.expectedClassification}.`,
      );
    }

    return this.repository.attachPgn({
      gameId: command.gameId,
      parsed,
      sourceType: command.sourceType as DataSourceType,
      externalGameId: command.externalGameId,
      externalTournamentId: command.externalTournamentId,
      reconciliation: candidate,
    });
  }
}
