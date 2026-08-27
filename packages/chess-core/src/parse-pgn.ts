import { Chess } from 'chess.js';

import type { ParsedGame, ParsedPlayer } from '@chess-intelligent/domain';

import { PgnParseError } from './errors';
import { normalizedPositionKey, positionIdentity, sha256 } from './hash';

const HEADER_ALIASES: Record<string, string> = {
  event: 'Event',
  site: 'Site',
  date: 'Date',
  round: 'Round',
  white: 'White',
  black: 'Black',
  result: 'Result',
  termination: 'Termination',
  timecontrol: 'TimeControl',
  whiteelo: 'WhiteElo',
  blackelo: 'BlackElo',
  whitefideid: 'WhiteFideId',
  blackfideid: 'BlackFideId',
  rated: 'Rated',
  board: 'Board',
  setup: 'SetUp',
  fen: 'FEN',
};

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const entries = Object.entries(headers).map(([key, value]): [string, string] => [
    HEADER_ALIASES[key.trim().toLowerCase()] ?? key.trim(),
    value.trim(),
  ]);
  return Object.fromEntries(entries.sort((left, right) => left[0].localeCompare(right[0])));
}

function optionalHeader(headers: Record<string, string>, name: string): string | null {
  const value = headers[name];
  return value && value !== '?' ? value : null;
}

function parseRating(value: string | undefined): number | null {
  if (!value || !/^\d{3,4}$/u.test(value)) {
    return null;
  }

  const rating = Number.parseInt(value, 10);
  return rating > 0 ? rating : null;
}

function parseRated(value: string | undefined): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', '1', 'rated'].includes(normalized)) {
    return true;
  }
  if (['false', 'no', '0', 'unrated'].includes(normalized)) {
    return false;
  }
  return null;
}

function parsePlayedAt(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})[.-](\d{2})[.-](\d{2})$/u.exec(value);
  if (!match || match[2] === '??' || match[3] === '??') {
    return null;
  }

  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

function normalizedFingerprintText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function player(headers: Record<string, string>, color: 'White' | 'Black'): ParsedPlayer {
  const fideId = headers[`${color}FideId`];
  return {
    displayName: optionalHeader(headers, color) ?? '?',
    rating: parseRating(headers[`${color}Elo`]),
    fideId: fideId && /^\d{4,10}$/u.test(fideId) ? fideId : null,
  };
}

function parseFailure(error: unknown): PgnParseError {
  const detail = error instanceof Error ? error.message : 'Unknown parser failure';
  return new PgnParseError(`The PGN is malformed or contains an illegal move: ${detail}`, {
    cause: error,
  });
}

export function parsePgn(rawPgn: string): ParsedGame {
  const pgn = rawPgn.trim();
  if (!pgn) {
    throw new PgnParseError('The PGN must not be empty.');
  }

  const loaded = new Chess();
  try {
    loaded.loadPgn(pgn, { strict: true });
  } catch (error) {
    throw parseFailure(error);
  }

  const verboseHistory = loaded.history({ verbose: true });
  if (verboseHistory.length === 0) {
    throw new PgnParseError(
      'The PGN contains no moves. Use the future metadata ingestion path for metadata-only games.',
    );
  }

  const headers = normalizeHeaders(loaded.getHeaders());
  const initialFen = verboseHistory[0]?.before;
  if (!initialFen) {
    throw new PgnParseError('The PGN did not produce an initial chess position.');
  }

  let replay: Chess;
  try {
    replay = new Chess(initialFen);
  } catch (error) {
    throw parseFailure(error);
  }

  const moves = verboseHistory.map((historicalMove, index) => {
    const replayed = replay.move(historicalMove.san, { strict: true });
    if (!replayed) {
      throw new PgnParseError(`Move ${index + 1} could not be reconstructed legally.`);
    }

    const fenAfter = replay.fen();
    const normalizedPosition = normalizedPositionKey(fenAfter);
    const uci = `${replayed.from}${replayed.to}${replayed.promotion ?? ''}`;

    return {
      ply: index + 1,
      san: replayed.san,
      uci,
      from: replayed.from,
      to: replayed.to,
      promotion: replayed.promotion ?? null,
      fenAfter,
      positionId: positionIdentity(fenAfter),
      normalizedPosition,
      sideToMove: replay.turn() === 'w' ? ('WHITE' as const) : ('BLACK' as const),
    };
  });

  const white = player(headers, 'White');
  const black = player(headers, 'Black');
  if (white.fideId !== null && white.fideId === black.fideId) {
    throw new PgnParseError('White and Black cannot share the same FIDE identity.');
  }
  const result = optionalHeader(headers, 'Result') ?? '*';
  const playedDateText = optionalHeader(headers, 'Date');
  const stableMetadata = [
    normalizedFingerprintText(white.displayName),
    normalizedFingerprintText(black.displayName),
    normalizedFingerprintText(playedDateText),
    normalizedFingerprintText(result),
  ].join('|');
  const moveSequence = moves.map((move) => move.uci).join(' ');
  const fingerprint = sha256(
    `game:v1:${normalizedPositionKey(initialFen)}|${moveSequence}|${stableMetadata}`,
  );

  return {
    rawPgn,
    rawPgnSha256: sha256(rawPgn),
    fingerprint,
    initialFen,
    initialPositionId: positionIdentity(initialFen),
    normalizedInitialPosition: normalizedPositionKey(initialFen),
    initialSideToMove: initialFen.split(/\s+/u)[1] === 'w' ? 'WHITE' : 'BLACK',
    headers,
    event: optionalHeader(headers, 'Event'),
    site: optionalHeader(headers, 'Site'),
    playedAt: parsePlayedAt(headers.Date),
    playedDateText,
    round: optionalHeader(headers, 'Round'),
    result,
    termination: optionalHeader(headers, 'Termination'),
    timeControl: optionalHeader(headers, 'TimeControl'),
    rated: parseRated(headers.Rated),
    boardNumber: optionalHeader(headers, 'Board'),
    gameContext: 'UNKNOWN',
    timeCategory: 'UNKNOWN',
    white,
    black,
    moves,
  };
}
