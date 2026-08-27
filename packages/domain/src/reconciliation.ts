import type { Color, DataSourceType, GameContext, ParsedGame, TimeCategory } from './index';

export const RECONCILIATION_CLASSIFICATIONS = [
  'EXACT_MATCH',
  'HIGH_CONFIDENCE_MATCH',
  'AMBIGUOUS_MATCH',
  'NO_MATCH',
  'CONFLICT',
] as const;

export type ReconciliationClassification = (typeof RECONCILIATION_CLASSIFICATIONS)[number];

export interface MetadataPlayerInput {
  displayName: string;
  rating: number | null;
  fideId: string | null;
}

export interface MetadataGameInput {
  sourceType: DataSourceType;
  event: string | null;
  site: string | null;
  round: string | null;
  boardNumber: string | null;
  playedAt: string | null;
  result: string;
  gameContext: GameContext;
  timeCategory: TimeCategory;
  timeControl: string | null;
  rated: boolean | null;
  white: MetadataPlayerInput;
  black: MetadataPlayerInput;
  externalTournamentId: string | null;
  externalGameId: string | null;
}

export interface ReconciliationSourceObservation {
  sourceType: DataSourceType;
  externalGameId: string | null;
  externalTournamentId: string | null;
}

export interface ReconciliationGamePlayer {
  color: Color;
  displayName: string;
  fideId: string | null;
}

export interface ReconciliationGameSnapshot {
  gameId: string;
  contentStatus: 'METADATA_ONLY' | 'MOVES_AVAILABLE';
  event: string | null;
  playedAt: string | null;
  round: string | null;
  boardNumber: string | null;
  result: string;
  players: ReconciliationGamePlayer[];
  sources: ReconciliationSourceObservation[];
}

export interface ReconciliationContext {
  sourceType: DataSourceType;
  externalGameId: string | null;
  externalTournamentId: string | null;
}

export interface ReconciliationCandidate {
  gameId: string;
  classification: Exclude<ReconciliationClassification, 'NO_MATCH'>;
  matchedFields: string[];
  conflictingFields: string[];
  reasons: string[];
}

export interface ReconciliationReport {
  pgnSummary: {
    white: string;
    whiteFideId: string | null;
    black: string;
    blackFideId: string | null;
    date: string | null;
    result: string;
    event: string | null;
    round: string | null;
  };
  candidates: ReconciliationCandidate[];
}

export interface ReconciliationCandidateFinder {
  findReconciliationCandidates(parsed: ParsedGame): Promise<ReconciliationGameSnapshot[]>;
  findReconciliationGame(gameId: string): Promise<ReconciliationGameSnapshot | null>;
}

function normalized(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function player(snapshot: ReconciliationGameSnapshot, color: Color): ReconciliationGamePlayer {
  const found = snapshot.players.find((candidate) => candidate.color === color);
  if (!found) {
    throw new Error(`Canonical game ${snapshot.gameId} is missing its ${color} player.`);
  }
  return found;
}

function addComparison(
  matchedFields: string[],
  field: string,
  left: string | null,
  right: string | null,
): boolean {
  if (left !== null && right !== null && normalized(left) === normalized(right)) {
    matchedFields.push(field);
    return true;
  }
  return false;
}

function classificationRank(classification: ReconciliationCandidate['classification']): number {
  return {
    EXACT_MATCH: 0,
    HIGH_CONFIDENCE_MATCH: 1,
    CONFLICT: 2,
    AMBIGUOUS_MATCH: 3,
  }[classification];
}

export function metadataCandidateIdentity(input: MetadataGameInput): string {
  const fields = [
    `white:${input.white.fideId ?? '?'}`,
    `black:${input.black.fideId ?? '?'}`,
    `date:${input.playedAt ?? '?'}`,
    `event:${normalized(input.event) ?? '?'}`,
    `tournament:${normalized(input.externalTournamentId) ?? '?'}`,
    `round:${normalized(input.round) ?? '?'}`,
    `board:${normalized(input.boardNumber) ?? '?'}`,
    `result:${input.result}`,
  ];
  return `metadata-candidate:v1|${fields.join('|')}`;
}

export class GameReconciliationService {
  constructor(private readonly finder: ReconciliationCandidateFinder) {}

  async reconcile(
    parsed: ParsedGame,
    context: ReconciliationContext,
  ): Promise<ReconciliationReport> {
    const snapshots = await this.finder.findReconciliationCandidates(parsed);
    return this.report(parsed, context, snapshots);
  }

  async reconcileGame(
    gameId: string,
    parsed: ParsedGame,
    context: ReconciliationContext,
  ): Promise<ReconciliationCandidate | null> {
    const snapshot = await this.finder.findReconciliationGame(gameId);
    if (!snapshot) {
      return null;
    }
    return this.classify(parsed, context, snapshot);
  }

  private report(
    parsed: ParsedGame,
    context: ReconciliationContext,
    snapshots: ReconciliationGameSnapshot[],
  ): ReconciliationReport {
    const candidates = snapshots
      .map((snapshot) => this.classify(parsed, context, snapshot))
      .filter((candidate): candidate is ReconciliationCandidate => candidate !== null)
      .sort(
        (left, right) =>
          classificationRank(left.classification) - classificationRank(right.classification) ||
          left.gameId.localeCompare(right.gameId),
      );

    return {
      pgnSummary: {
        white: parsed.white.displayName,
        whiteFideId: parsed.white.fideId,
        black: parsed.black.displayName,
        blackFideId: parsed.black.fideId,
        date: parsed.playedAt,
        result: parsed.result,
        event: parsed.event,
        round: parsed.round,
      },
      candidates,
    };
  }

  private classify(
    parsed: ParsedGame,
    context: ReconciliationContext,
    snapshot: ReconciliationGameSnapshot,
  ): ReconciliationCandidate | null {
    const white = player(snapshot, 'WHITE');
    const black = player(snapshot, 'BLACK');
    const matchedFields: string[] = [];
    const conflictingFields: string[] = [];
    const reasons: string[] = [];

    const whiteFideMatch = addComparison(
      matchedFields,
      'white.fideId',
      white.fideId,
      parsed.white.fideId,
    );
    const blackFideMatch = addComparison(
      matchedFields,
      'black.fideId',
      black.fideId,
      parsed.black.fideId,
    );
    const whiteNameMatch = addComparison(
      matchedFields,
      'white.displayName',
      white.displayName,
      parsed.white.displayName,
    );
    const blackNameMatch = addComparison(
      matchedFields,
      'black.displayName',
      black.displayName,
      parsed.black.displayName,
    );
    const dateMatch = addComparison(matchedFields, 'playedAt', snapshot.playedAt, parsed.playedAt);
    const resultMatch = addComparison(matchedFields, 'result', snapshot.result, parsed.result);
    const eventMatch = addComparison(matchedFields, 'event', snapshot.event, parsed.event);
    const roundMatch = addComparison(matchedFields, 'round', snapshot.round, parsed.round);
    const boardMatch = addComparison(
      matchedFields,
      'boardNumber',
      snapshot.boardNumber,
      parsed.boardNumber,
    );
    const externalGameMatch = context.externalGameId
      ? snapshot.sources.some(
          (source) =>
            source.sourceType === context.sourceType &&
            normalized(source.externalGameId) === normalized(context.externalGameId),
        )
      : false;
    if (externalGameMatch) {
      matchedFields.push('source.externalGameId');
    }
    const externalTournamentMatch = context.externalTournamentId
      ? snapshot.sources.some(
          (source) =>
            source.sourceType === context.sourceType &&
            normalized(source.externalTournamentId) === normalized(context.externalTournamentId),
        )
      : false;
    if (externalTournamentMatch) {
      matchedFields.push('source.externalTournamentId');
    }

    const bothFideMatch = whiteFideMatch && blackFideMatch;
    const bothNamesMatch = whiteNameMatch && blackNameMatch;
    const reversedFide =
      white.fideId !== null &&
      black.fideId !== null &&
      parsed.white.fideId !== null &&
      parsed.black.fideId !== null &&
      white.fideId === parsed.black.fideId &&
      black.fideId === parsed.white.fideId;

    if (reversedFide) {
      conflictingFields.push('players.color');
      reasons.push('The verified FIDE identities appear with reversed colors.');
    }

    const identityMismatch =
      (white.fideId !== null &&
        parsed.white.fideId !== null &&
        white.fideId !== parsed.white.fideId) ||
      (black.fideId !== null &&
        parsed.black.fideId !== null &&
        black.fideId !== parsed.black.fideId);
    const sameFixtureSlot = eventMatch && dateMatch && (roundMatch || boardMatch);
    if (identityMismatch && (externalGameMatch || sameFixtureSlot)) {
      conflictingFields.push('players.fideId');
      reasons.push(
        'The fixture metadata matches, but at least one verified FIDE identity differs.',
      );
    }

    if (
      snapshot.result !== '*' &&
      parsed.result !== '*' &&
      snapshot.result !== parsed.result &&
      (externalGameMatch || bothFideMatch || (bothNamesMatch && dateMatch))
    ) {
      conflictingFields.push('result');
      reasons.push(`Result mismatch: metadata is ${snapshot.result}; PGN is ${parsed.result}.`);
    }

    if (
      snapshot.playedAt !== null &&
      parsed.playedAt !== null &&
      snapshot.playedAt !== parsed.playedAt &&
      (externalGameMatch || bothFideMatch)
    ) {
      conflictingFields.push('playedAt');
      reasons.push(`Date mismatch: metadata is ${snapshot.playedAt}; PGN is ${parsed.playedAt}.`);
    }

    if (conflictingFields.length > 0) {
      return {
        gameId: snapshot.gameId,
        classification: 'CONFLICT',
        matchedFields,
        conflictingFields,
        reasons,
      };
    }

    if (externalGameMatch) {
      return {
        gameId: snapshot.gameId,
        classification: 'EXACT_MATCH',
        matchedFields,
        conflictingFields,
        reasons: ['The provider and external game ID match exactly.'],
      };
    }

    const strongMetadataMatches = [
      dateMatch,
      resultMatch,
      eventMatch,
      roundMatch,
      boardMatch,
    ].filter(Boolean).length;
    if (bothFideMatch && strongMetadataMatches >= 2) {
      return {
        gameId: snapshot.gameId,
        classification: 'HIGH_CONFIDENCE_MATCH',
        matchedFields,
        conflictingFields,
        reasons: [
          'Both verified player FIDE IDs match in the same colors.',
          `${strongMetadataMatches} fixture metadata fields match exactly.`,
        ],
      };
    }

    const weakMetadataMatches = [dateMatch, resultMatch, eventMatch, roundMatch, boardMatch].filter(
      Boolean,
    ).length;
    if (bothNamesMatch && weakMetadataMatches >= 2) {
      return {
        gameId: snapshot.gameId,
        classification: 'AMBIGUOUS_MATCH',
        matchedFields,
        conflictingFields,
        reasons: [
          'Player names and fixture metadata match, but names do not prove player identity.',
        ],
      };
    }

    return null;
  }
}
