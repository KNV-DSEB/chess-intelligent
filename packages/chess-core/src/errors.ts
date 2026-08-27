export class PgnParseError extends Error {
  readonly code = 'INVALID_PGN';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PgnParseError';
  }
}

export class PositionFenError extends Error {
  readonly code = 'INVALID_FEN';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PositionFenError';
  }
}
