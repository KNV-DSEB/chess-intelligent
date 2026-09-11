export const DATA_SOURCE_TYPES = [
  'USER_UPLOAD',
  'LICHESS_API',
  'LICHESS_CC0',
  'CHESS_RESULTS',
  'FIDE',
  'CHESSCOM_AUTHORIZED',
  'TOURNAMENT_FEED',
  'LICENSED_PROVIDER',
  'OTHER',
] as const;

export type DataSourceType = (typeof DATA_SOURCE_TYPES)[number];

export const PGN_STATUSES = [
  'METADATA_ONLY',
  'PGN_AVAILABLE',
  'PGN_IMPORTED',
  'PGN_VERIFIED',
] as const;

export type PgnStatus = (typeof PGN_STATUSES)[number];

export const GAME_CONTEXTS = ['OTB', 'ONLINE', 'UNKNOWN'] as const;
export type GameContext = (typeof GAME_CONTEXTS)[number];

export const TIME_CATEGORIES = [
  'CLASSICAL',
  'RAPID',
  'BLITZ',
  'BULLET',
  'CORRESPONDENCE',
  'UNKNOWN',
] as const;
export type TimeCategory = (typeof TIME_CATEGORIES)[number];

export const COLORS = ['WHITE', 'BLACK'] as const;
export type Color = (typeof COLORS)[number];

export const IDENTITY_PROVIDERS = [
  'FIDE',
  'LICHESS',
  'CHESSCOM',
  'CHESS_RESULTS',
  'OTHER',
] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export const VERIFICATION_STATUSES = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface ParsedPlayer {
  displayName: string;
  rating: number | null;
  fideId: string | null;
}

export interface ParsedMove {
  ply: number;
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion: string | null;
  fenAfter: string;
  positionId: string;
  normalizedPosition: string;
  sideToMove: 'WHITE' | 'BLACK';
}

export interface ParsedGame {
  rawPgn: string;
  rawPgnSha256: string;
  fingerprint: string;
  initialFen: string;
  initialPositionId: string;
  normalizedInitialPosition: string;
  initialSideToMove: Color;
  headers: Record<string, string>;
  event: string | null;
  site: string | null;
  playedAt: string | null;
  playedDateText: string | null;
  round: string | null;
  result: string;
  termination: string | null;
  timeControl: string | null;
  rated: boolean | null;
  boardNumber: string | null;
  gameContext: GameContext;
  timeCategory: TimeCategory;
  white: ParsedPlayer;
  black: ParsedPlayer;
  moves: ParsedMove[];
}

export interface ImportPgnCommand {
  pgn: string;
  sourceType: DataSourceType;
  externalId: string | null;
}

export interface ImportPgnResult {
  status: 'created' | 'already_exists';
  gameId: string;
  importJobId: string;
}

export * from './reconciliation';
export * from './corpus';
export * from './engine-analysis';
export * from './preparation';
export * from './player-intelligence';
export * from './ontology';
export * from './concept-classification';
export * from './concept-coverage';
export * from './grounded-ai';
export * from './pilot';
export * from './player-skill-graph';
export * from './adaptive-training';
export * from './coach-student-intelligence';
export * from './academy-security';
