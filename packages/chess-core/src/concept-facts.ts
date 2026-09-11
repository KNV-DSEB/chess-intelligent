import { Chess, type Color as ChessColor, type PieceSymbol, type Square } from 'chess.js';

import {
  CONCEPT_CLASSIFIER_V1_CONFIGURATION,
  CONCEPT_CLASSIFIER_BUNDLE_VERSION,
  conceptClassifierBundleDefinition,
  POSITION_STRUCTURE_CLASSIFIER_ID,
  TACTICAL_MOTIF_CLASSIFIER_ID,
  type ClassificationContext,
  type ConceptClassifierBundleVersion,
  type ConceptEvidenceCandidate,
  type ConceptEvidenceClassifier,
  type Color,
  type DetectedConceptFact,
} from '@chess-intelligent/domain';

import { PositionFenError } from './errors';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const ALL_DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;
const DIAGONAL_DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;
const ORTHOGONAL_DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

interface BoardPiece {
  square: Square;
  file: number;
  rank: number;
  color: ChessColor;
  type: PieceSymbol;
}

interface ParsedUciMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

function domainColor(color: ChessColor): Color {
  return color === 'w' ? 'WHITE' : 'BLACK';
}

function chessColor(color: Color): ChessColor {
  return color === 'WHITE' ? 'w' : 'b';
}

function opposite(color: ChessColor): ChessColor {
  return color === 'w' ? 'b' : 'w';
}

function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}` as Square;
}

function coordinates(square: Square): { file: number; rank: number } {
  return { file: FILES.indexOf(square[0] as (typeof FILES)[number]), rank: Number(square[1]) };
}

function pieces(chess: Chess): BoardPiece[] {
  const result: BoardPiece[] = [];
  for (const file of FILES.keys()) {
    for (const rank of RANKS) {
      const square = squareAt(file, rank)!;
      const piece = chess.get(square);
      if (piece) result.push({ square, file, rank, color: piece.color, type: piece.type });
    }
  }
  return result;
}

function pieceName(piece: PieceSymbol): string {
  return { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[piece];
}

function pieceValue(piece: PieceSymbol): number {
  return CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.pieceValues[
    pieceName(piece) as keyof typeof CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.pieceValues
  ];
}

function sliderDirections(piece: PieceSymbol): readonly (readonly [number, number])[] {
  if (piece === 'b') return DIAGONAL_DIRECTIONS;
  if (piece === 'r') return ORTHOGONAL_DIRECTIONS;
  if (piece === 'q') return ALL_DIRECTIONS;
  return [];
}

function firstPieceOnRay(
  chess: Chess,
  start: Square,
  direction: readonly [number, number],
): BoardPiece | null {
  const startCoordinates = coordinates(start);
  let file = startCoordinates.file + direction[0];
  let rank = startCoordinates.rank + direction[1];
  while (true) {
    const square = squareAt(file, rank);
    if (!square) return null;
    const piece = chess.get(square);
    if (piece) return { square, file, rank, color: piece.color, type: piece.type };
    file += direction[0];
    rank += direction[1];
  }
}

function attacksSquare(chess: Chess, attacker: BoardPiece, target: Square): boolean {
  const targetCoordinates = coordinates(target);
  const fileDelta = targetCoordinates.file - attacker.file;
  const rankDelta = targetCoordinates.rank - attacker.rank;
  if (attacker.type === 'p') {
    return Math.abs(fileDelta) === 1 && rankDelta === (attacker.color === 'w' ? 1 : -1);
  }
  if (attacker.type === 'n') {
    return (
      (Math.abs(fileDelta) === 1 && Math.abs(rankDelta) === 2) ||
      (Math.abs(fileDelta) === 2 && Math.abs(rankDelta) === 1)
    );
  }
  if (attacker.type === 'k') {
    return Math.max(Math.abs(fileDelta), Math.abs(rankDelta)) === 1;
  }
  const direction = sliderDirections(attacker.type).find(
    ([fileStep, rankStep]) =>
      (fileStep === 0 ? fileDelta === 0 : Math.sign(fileDelta) === fileStep) &&
      (rankStep === 0 ? rankDelta === 0 : Math.sign(rankDelta) === rankStep) &&
      (fileStep === 0 || rankStep === 0 || Math.abs(fileDelta) === Math.abs(rankDelta)),
  );
  if (!direction) return false;
  return firstPieceOnRay(chess, attacker.square, direction)?.square === target;
}

function attackersOf(chess: Chess, color: ChessColor, target: Square): BoardPiece[] {
  return pieces(chess)
    .filter((piece) => piece.color === color && attacksSquare(chess, piece, target))
    .sort((left, right) => left.square.localeCompare(right.square));
}

function isStrictlyBetween(square: Square, start: Square, end: Square): boolean {
  const point = coordinates(square);
  const from = coordinates(start);
  const to = coordinates(end);
  const fileDelta = to.file - from.file;
  const rankDelta = to.rank - from.rank;
  const pointFileDelta = point.file - from.file;
  const pointRankDelta = point.rank - from.rank;
  const collinear =
    (fileDelta === 0 && pointFileDelta === 0) ||
    (rankDelta === 0 && pointRankDelta === 0) ||
    (Math.abs(fileDelta) === Math.abs(rankDelta) &&
      Math.abs(pointFileDelta) === Math.abs(pointRankDelta) &&
      Math.sign(pointFileDelta) === Math.sign(fileDelta) &&
      Math.sign(pointRankDelta) === Math.sign(rankDelta));
  if (!collinear) return false;
  const distance = Math.max(Math.abs(fileDelta), Math.abs(rankDelta));
  const pointDistance = Math.max(Math.abs(pointFileDelta), Math.abs(pointRankDelta));
  return pointDistance > 0 && pointDistance < distance;
}

function parseUci(uci: string): ParsedUciMove {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/u.exec(uci);
  if (!match) throw new PositionFenError(`The move is not valid UCI notation: ${uci}`);
  return {
    from: match[1] as Square,
    to: match[2] as Square,
    ...(match[3] ? { promotion: match[3] as PieceSymbol } : {}),
  };
}

function load(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch (error) {
    throw new PositionFenError(
      `The FEN does not describe a valid classification position: ${error instanceof Error ? error.message : 'unknown error'}`,
      { cause: error },
    );
  }
}

function apply(chess: Chess, move: ParsedUciMove, uci: string): void {
  try {
    const applied = chess.move(move);
    if (!applied) throw new Error('move returned no result');
  } catch (error) {
    throw new PositionFenError(`The move ${uci} is not legal in the classification position.`, {
      cause: error,
    });
  }
}

function forkFact(
  chess: Chess,
  move: ParsedUciMove,
  mover: ChessColor,
): DetectedConceptFact | null {
  const moved = pieces(chess).find((piece) => piece.square === move.to && piece.color === mover);
  if (!moved) return null;
  const targets = pieces(chess)
    .filter(
      (piece) =>
        piece.color !== mover &&
        pieceValue(piece.type) >=
          CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.meaningfulTargetMinimumValue &&
        attacksSquare(chess, moved, piece.square),
    )
    .sort((left, right) => left.square.localeCompare(right.square));
  if (targets.length < CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.forkMinimumTargets) return null;
  const targetValue = targets.reduce((sum, target) => sum + pieceValue(target.type), 0);
  const includesKing = targets.some((target) => target.type === 'k');
  if (
    !includesKing &&
    targetValue <
      pieceValue(moved.type) + CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.forkMinimumSurplusValue
  ) {
    return null;
  }
  return {
    conceptStableId: 'tactics.fork',
    ruleId: 'TACTICAL_FORK_V1',
    subjectColor: domainColor(mover),
    facts: {
      movedPiece: pieceName(moved.type),
      from: move.from,
      to: move.to,
      targets: targets.map((target) => target.square),
      targetPieces: targets.map((target) => `${target.square}:${pieceName(target.type)}`),
    },
  };
}

function rayFacts(
  chess: Chess,
  move: ParsedUciMove,
  mover: ChessColor,
): { pins: string[]; pinKings: string[]; skewered: string[]; skewerTargets: string[] } {
  const moved = pieces(chess).find((piece) => piece.square === move.to && piece.color === mover);
  const result = {
    pins: [] as string[],
    pinKings: [] as string[],
    skewered: [] as string[],
    skewerTargets: [] as string[],
  };
  if (!moved) return result;
  for (const direction of sliderDirections(moved.type)) {
    const front = firstPieceOnRay(chess, moved.square, direction);
    if (!front || front.color === mover) continue;
    const behind = firstPieceOnRay(chess, front.square, direction);
    if (!behind || behind.color === mover) continue;
    if (front.type !== 'k' && behind.type === 'k') {
      result.pins.push(front.square);
      result.pinKings.push(behind.square);
    } else if (
      front.type === 'k' &&
      pieceValue(behind.type) >=
        CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.meaningfulTargetMinimumValue
    ) {
      result.skewered.push(front.square);
      result.skewerTargets.push(behind.square);
    }
  }
  return result;
}

function discoveredAttackFact(
  before: Chess,
  after: Chess,
  move: ParsedUciMove,
  mover: ChessColor,
): DetectedConceptFact | null {
  const attackers: string[] = [];
  const targets: BoardPiece[] = [];
  for (const direction of ALL_DIRECTIONS) {
    const behind = firstPieceOnRay(before, move.from, [-direction[0], -direction[1]]);
    if (
      !behind ||
      behind.color !== mover ||
      !sliderDirections(behind.type).some(
        ([fileStep, rankStep]) => fileStep === direction[0] && rankStep === direction[1],
      )
    ) {
      continue;
    }
    const revealedTarget = firstPieceOnRay(after, move.from, direction);
    if (
      !revealedTarget ||
      revealedTarget.color !== opposite(mover) ||
      pieceValue(revealedTarget.type) <
        CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.meaningfulTargetMinimumValue ||
      !attacksSquare(after, behind, revealedTarget.square)
    ) {
      continue;
    }
    attackers.push(behind.square);
    targets.push(revealedTarget);
  }
  if (targets.length === 0) return null;
  const orderedTargets = targets.sort((left, right) => left.square.localeCompare(right.square));
  return {
    conceptStableId: 'tactics.discovered_attack',
    ruleId: 'TACTICAL_DISCOVERED_ATTACK_V1',
    subjectColor: domainColor(mover),
    facts: {
      from: move.from,
      to: move.to,
      revealedAttackers: [...new Set(attackers)].sort(),
      targets: orderedTargets.map((target) => target.square),
      targetPieces: orderedTargets.map((target) => `${target.square}:${pieceName(target.type)}`),
      discoveredCheck: orderedTargets.some((target) => target.type === 'k'),
    },
  };
}

function removalOfDefenderFact(
  before: Chess,
  after: Chess,
  move: ParsedUciMove,
  mover: ChessColor,
): DetectedConceptFact | null {
  const removed = before.get(move.to);
  if (!removed || removed.color === mover || removed.type === 'k') return null;
  const removedPiece = pieces(before).find((piece) => piece.square === move.to)!;
  const exposed = pieces(before)
    .filter(
      (target) =>
        target.color === removed.color &&
        target.square !== move.to &&
        target.type !== 'k' &&
        pieceValue(target.type) >=
          CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.meaningfulTargetMinimumValue &&
        attacksSquare(before, removedPiece, target.square) &&
        attackersOf(before, removed.color, target.square).length === 1 &&
        Boolean(after.get(target.square)) &&
        attackersOf(after, mover, target.square).length > 0 &&
        attackersOf(after, removed.color, target.square).length === 0,
    )
    .sort((left, right) => left.square.localeCompare(right.square));
  if (exposed.length === 0) return null;
  return {
    conceptStableId: 'tactics.removal_of_defender',
    ruleId: 'TACTICAL_REMOVAL_OF_SOLE_DEFENDER_V2',
    subjectColor: domainColor(mover),
    facts: {
      from: move.from,
      to: move.to,
      removedDefender: `${move.to}:${pieceName(removed.type)}`,
      exposedTargets: exposed.map((target) => target.square),
      targetPieces: exposed.map((target) => `${target.square}:${pieceName(target.type)}`),
    },
  };
}

function interferenceFact(
  before: Chess,
  after: Chess,
  move: ParsedUciMove,
  mover: ChessColor,
): DetectedConceptFact | null {
  if (before.get(move.to)) return null;
  const enemy = opposite(mover);
  const cutLines: string[] = [];
  const targets: BoardPiece[] = [];
  const enemyPieces = pieces(before).filter((piece) => piece.color === enemy);
  for (const target of enemyPieces) {
    if (
      target.type === 'k' ||
      pieceValue(target.type) <
        CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.meaningfulTargetMinimumValue ||
      !after.get(target.square) ||
      attackersOf(after, mover, target.square).length === 0
    ) {
      continue;
    }
    const defenders = attackersOf(before, enemy, target.square);
    if (defenders.length !== 1) continue;
    const defender = defenders[0]!;
    if (
      sliderDirections(defender.type).length === 0 ||
      !isStrictlyBetween(move.to, defender.square, target.square) ||
      attackersOf(after, enemy, target.square).length !== 0
    ) {
      continue;
    }
    cutLines.push(`${defender.square}-${target.square}`);
    targets.push(target);
  }
  if (targets.length === 0) return null;
  const ordered = targets.sort((left, right) => left.square.localeCompare(right.square));
  return {
    conceptStableId: 'tactics.interference',
    ruleId: 'TACTICAL_INTERFERENCE_SOLE_SLIDER_DEFENCE_V2',
    subjectColor: domainColor(mover),
    facts: {
      from: move.from,
      to: move.to,
      cutDefenceLines: [...new Set(cutLines)].sort(),
      exposedTargets: ordered.map((target) => target.square),
      targetPieces: ordered.map((target) => `${target.square}:${pieceName(target.type)}`),
    },
  };
}

function overloadFact(
  before: Chess,
  after: Chess,
  move: ParsedUciMove,
  mover: ChessColor,
): DetectedConceptFact | null {
  const enemy = opposite(mover);
  const moved = pieces(after).find((piece) => piece.square === move.to && piece.color === mover);
  if (!moved) return null;
  const meaningfulTargets = pieces(after).filter(
    (piece) =>
      piece.color === enemy &&
      piece.type !== 'k' &&
      pieceValue(piece.type) >=
        CONCEPT_CLASSIFIER_V1_CONFIGURATION.geometry.meaningfulTargetMinimumValue &&
      attackersOf(after, mover, piece.square).length > 0,
  );
  for (const defender of pieces(after).filter(
    (piece) => piece.color === enemy && piece.type !== 'k',
  )) {
    const defended = meaningfulTargets
      .filter((target) => {
        const defenders = attackersOf(after, enemy, target.square);
        return defenders.length === 1 && defenders[0]?.square === defender.square;
      })
      .sort((left, right) => left.square.localeCompare(right.square));
    if (defended.length < 2) continue;
    const newlyAttacked = defended.filter(
      (target) =>
        attacksSquare(after, moved, target.square) &&
        !pieces(before).some(
          (piece) =>
            piece.square === move.from &&
            piece.color === mover &&
            attacksSquare(before, piece, target.square),
        ),
    );
    if (newlyAttacked.length === 0) continue;
    return {
      conceptStableId: 'tactics.overload',
      ruleId: 'TACTICAL_OVERLOADED_SOLE_DEFENDER_V2',
      subjectColor: domainColor(mover),
      facts: {
        from: move.from,
        to: move.to,
        overloadedDefender: `${defender.square}:${pieceName(defender.type)}`,
        defendedTargets: defended.map((target) => target.square),
        newlyAttackedTargets: newlyAttacked.map((target) => target.square).sort(),
      },
    };
  }
  return null;
}

function backRankFact(
  after: Chess,
  move: ParsedUciMove,
  mover: ChessColor,
): DetectedConceptFact | null {
  if (!after.isCheckmate()) return null;
  const moved = pieces(after).find((piece) => piece.square === move.to && piece.color === mover);
  const enemy = opposite(mover);
  const king = pieces(after).find((piece) => piece.color === enemy && piece.type === 'k');
  if (
    !moved ||
    !king ||
    (moved.type !== 'r' && moved.type !== 'q') ||
    king.rank !== (enemy === 'w' ? 1 : 8) ||
    moved.rank !== king.rank ||
    !attacksSquare(after, moved, king.square)
  ) {
    return null;
  }
  const shelterRank = enemy === 'w' ? 2 : 7;
  const blockedEscapeSquares = [-1, 0, 1]
    .map((offset) => squareAt(king.file + offset, shelterRank))
    .filter((square): square is Square => Boolean(square))
    .filter((square) => after.get(square)?.color === enemy)
    .sort();
  if (blockedEscapeSquares.length < 2) return null;
  return {
    conceptStableId: 'tactics.back_rank',
    ruleId: 'TACTICAL_BACK_RANK_MATE_V2',
    subjectColor: domainColor(mover),
    facts: {
      from: move.from,
      to: move.to,
      kingSquare: king.square,
      checkingPiece: pieceName(moved.type),
      blockedEscapeSquares,
      checkmate: true,
    },
  };
}

export function detectTacticalMoveFacts(
  fen: string,
  uci: string,
  bundleVersion: ConceptClassifierBundleVersion = CONCEPT_CLASSIFIER_BUNDLE_VERSION,
): DetectedConceptFact[] {
  const before = load(fen);
  const move = parseUci(uci);
  const movingPiece = before.get(move.from);
  if (!movingPiece) throw new PositionFenError(`No piece exists on ${move.from} for move ${uci}.`);
  const mover = movingPiece.color;
  const after = load(fen);
  apply(after, move, uci);

  const facts: DetectedConceptFact[] = [];
  const fork = forkFact(after, move, mover);
  if (fork) facts.push(fork);
  const rays = rayFacts(after, move, mover);
  if (rays.pins.length > 0) {
    facts.push({
      conceptStableId: 'tactics.pin',
      ruleId: 'TACTICAL_ABSOLUTE_PIN_V1',
      subjectColor: domainColor(mover),
      facts: { from: move.from, to: move.to, pinnedSquares: rays.pins, kingSquares: rays.pinKings },
    });
  }
  if (rays.skewered.length > 0) {
    facts.push({
      conceptStableId: 'tactics.skewer',
      ruleId: 'TACTICAL_KING_SKEWER_V1',
      subjectColor: domainColor(mover),
      facts: {
        from: move.from,
        to: move.to,
        kingSquares: rays.skewered,
        targetsBehind: rays.skewerTargets,
      },
    });
  }
  const discovered = discoveredAttackFact(before, after, move, mover);
  if (discovered) facts.push(discovered);
  if (bundleVersion === 'CONCEPT_CLASSIFIER_BUNDLE_V2') {
    const removal = removalOfDefenderFact(before, after, move, mover);
    if (removal) facts.push(removal);
    const interference = interferenceFact(before, after, move, mover);
    if (interference) facts.push(interference);
    const overload = overloadFact(before, after, move, mover);
    if (overload) facts.push(overload);
    const backRank = backRankFact(after, move, mover);
    if (backRank) facts.push(backRank);
  }
  return facts.sort((left, right) => left.conceptStableId.localeCompare(right.conceptStableId));
}

function pawnPieces(chess: Chess, color: ChessColor): BoardPiece[] {
  return pieces(chess).filter((piece) => piece.color === color && piece.type === 'p');
}

function positionFactsForColor(
  chess: Chess,
  color: ChessColor,
  enemy: ChessColor,
  bundleVersion: ConceptClassifierBundleVersion,
): DetectedConceptFact[] {
  const friendlyPawns = pawnPieces(chess, color);
  const enemyPawns = pawnPieces(chess, enemy);
  const subjectColor = domainColor(color);
  const result: DetectedConceptFact[] = [];

  const queenPawns = friendlyPawns.filter((pawn) => pawn.file === 3);
  if (queenPawns.length > 0 && !friendlyPawns.some((pawn) => pawn.file === 2 || pawn.file === 4)) {
    result.push({
      conceptStableId: 'pawn_structure.isolated_queen_pawn',
      ruleId: 'STRUCTURE_ISOLATED_QUEEN_PAWN_V1',
      subjectColor,
      facts: { file: 'd', pawnSquares: queenPawns.map((pawn) => pawn.square).sort() },
    });
  }

  if (bundleVersion === 'CONCEPT_CLASSIFIER_BUNDLE_V2') {
    const cPawns = friendlyPawns.filter((pawn) => pawn.file === 2);
    const dPawns = friendlyPawns.filter((pawn) => pawn.file === 3);
    const hasFlankPawns = friendlyPawns.some((pawn) => pawn.file === 1 || pawn.file === 4);
    if (cPawns.length === 1 && dPawns.length === 1 && !hasFlankPawns) {
      result.push({
        conceptStableId: 'pawn_structure.hanging_pawns',
        ruleId: 'STRUCTURE_HANGING_C_D_PAWNS_V2',
        subjectColor,
        facts: { files: ['c', 'd'], pawnSquares: [cPawns[0]!.square, dPawns[0]!.square].sort() },
      });
    }
  }

  const doubledGroups = [...new Set(friendlyPawns.map((pawn) => pawn.file))]
    .map((file) => ({ file, pawns: friendlyPawns.filter((pawn) => pawn.file === file) }))
    .filter((group) => group.pawns.length >= 2)
    .sort((left, right) => left.file - right.file);
  if (doubledGroups.length > 0) {
    result.push({
      conceptStableId: 'pawn_structure.doubled_pawns',
      ruleId: 'STRUCTURE_DOUBLED_PAWNS_V1',
      subjectColor,
      facts: {
        files: doubledGroups.map((group) => FILES[group.file]!),
        pawnSquares: doubledGroups
          .flatMap((group) => group.pawns.map((pawn) => pawn.square))
          .sort(),
      },
    });
  }

  const passedPawns = friendlyPawns.filter(
    (pawn) =>
      !enemyPawns.some(
        (candidate) =>
          Math.abs(candidate.file - pawn.file) <= 1 &&
          (color === 'w' ? candidate.rank > pawn.rank : candidate.rank < pawn.rank),
      ),
  );
  if (passedPawns.length > 0) {
    const protectedPawns = passedPawns.filter((pawn) =>
      friendlyPawns.some(
        (protector) =>
          protector.square !== pawn.square && attacksSquare(chess, protector, pawn.square),
      ),
    );
    result.push({
      conceptStableId: 'pawn_structure.passed_pawn',
      ruleId: 'STRUCTURE_PASSED_PAWN_V1',
      subjectColor,
      facts: {
        pawnSquares: passedPawns.map((pawn) => pawn.square).sort(),
        protectedPawnSquares: protectedPawns.map((pawn) => pawn.square).sort(),
      },
    });
  }

  const majorityWings = [
    { name: 'queenside', files: new Set([0, 1, 2]) },
    { name: 'kingside', files: new Set([5, 6, 7]) },
  ].flatMap((wing) => {
    const friendlyCount = friendlyPawns.filter((pawn) => wing.files.has(pawn.file)).length;
    const enemyCount = enemyPawns.filter((pawn) => wing.files.has(pawn.file)).length;
    return friendlyCount > enemyCount ? [`${wing.name}:${friendlyCount}-${enemyCount}`] : [];
  });
  if (majorityWings.length > 0) {
    result.push({
      conceptStableId: 'pawn_structure.pawn_majority',
      ruleId: 'STRUCTURE_PAWN_MAJORITY_V1',
      subjectColor,
      facts: { wings: majorityWings },
    });
  }
  return result;
}

export function detectPositionStructureFacts(
  fen: string,
  bundleVersion: ConceptClassifierBundleVersion = CONCEPT_CLASSIFIER_BUNDLE_VERSION,
): DetectedConceptFact[] {
  const chess = load(fen);
  return [
    ...positionFactsForColor(chess, chessColor('WHITE'), chessColor('BLACK'), bundleVersion),
    ...positionFactsForColor(chess, chessColor('BLACK'), chessColor('WHITE'), bundleVersion),
  ].sort(
    (left, right) =>
      left.subjectColor.localeCompare(right.subjectColor) ||
      left.conceptStableId.localeCompare(right.conceptStableId),
  );
}

export interface DetectedFileStructureFacts {
  openFiles: string[];
  semiOpenFiles: { WHITE: string[]; BLACK: string[] };
}

export function detectFileStructureFacts(fen: string): DetectedFileStructureFacts {
  const chess = load(fen);
  const whiteFiles = new Set(pawnPieces(chess, 'w').map((pawn) => pawn.file));
  const blackFiles = new Set(pawnPieces(chess, 'b').map((pawn) => pawn.file));
  return {
    openFiles: FILES.filter((_, file) => !whiteFiles.has(file) && !blackFiles.has(file)),
    semiOpenFiles: {
      WHITE: FILES.filter((_, file) => !whiteFiles.has(file) && blackFiles.has(file)),
      BLACK: FILES.filter((_, file) => !blackFiles.has(file) && whiteFiles.has(file)),
    },
  };
}

export class PositionStructureClassifier implements ConceptEvidenceClassifier {
  readonly classifierId = POSITION_STRUCTURE_CLASSIFIER_ID;
  readonly classifierVersion: 'V1' | 'V2';

  constructor(
    private readonly bundleVersion: ConceptClassifierBundleVersion = CONCEPT_CLASSIFIER_BUNDLE_VERSION,
  ) {
    this.classifierVersion =
      conceptClassifierBundleDefinition(bundleVersion).positionClassifierVersion;
  }

  classify(context: ClassificationContext): ConceptEvidenceCandidate[] {
    return detectPositionStructureFacts(context.preMoveFen, this.bundleVersion).map((fact) => ({
      occurrencePly: context.occurrencePly,
      decisionPly: context.decisionPly,
      positionOccurrenceId: context.positionOccurrenceId,
      exactHistorySha256: context.exactHistorySha256,
      conceptStableId: fact.conceptStableId,
      evidenceTypeStableId: 'position.structural_feature',
      polarity: 'NEUTRAL',
      subjectKind: 'POSITION',
      subjectPlayerId: null,
      subjectColor: fact.subjectColor,
      classifierId: this.classifierId,
      classifierVersion: this.classifierVersion,
      ruleId: fact.ruleId,
      facts: fact.facts,
      analysisRunId: null,
    }));
  }
}

export class TacticalMotifClassifier implements ConceptEvidenceClassifier {
  readonly classifierId = TACTICAL_MOTIF_CLASSIFIER_ID;
  readonly classifierVersion: 'V1' | 'V2';

  constructor(
    private readonly bundleVersion: ConceptClassifierBundleVersion = CONCEPT_CLASSIFIER_BUNDLE_VERSION,
  ) {
    this.classifierVersion =
      conceptClassifierBundleDefinition(bundleVersion).tacticalMotifClassifierVersion;
  }

  classify(context: ClassificationContext): ConceptEvidenceCandidate[] {
    return detectTacticalMoveFacts(
      context.preMoveFen,
      context.playedMoveUci,
      this.bundleVersion,
    ).map((fact) => ({
      occurrencePly: context.occurrencePly,
      decisionPly: context.decisionPly,
      positionOccurrenceId: context.positionOccurrenceId,
      exactHistorySha256: context.exactHistorySha256,
      conceptStableId: fact.conceptStableId,
      evidenceTypeStableId: 'position.tactical_motif',
      polarity: 'NEUTRAL',
      subjectKind: 'DECISION',
      subjectPlayerId: context.subjectPlayerId,
      subjectColor: context.sideToMove,
      classifierId: this.classifierId,
      classifierVersion: this.classifierVersion,
      ruleId: fact.ruleId,
      facts: fact.facts,
      analysisRunId: null,
    }));
  }
}
