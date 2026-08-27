import { describe, expect, it } from 'vitest';

import {
  detectFileStructureFacts,
  detectPositionStructureFacts,
  detectTacticalMoveFacts,
} from './concept-facts';

function concepts(fen: string, move: string): string[] {
  return detectTacticalMoveFacts(fen, move).map((fact) => fact.conceptStableId);
}

function structure(fen: string, color: 'WHITE' | 'BLACK', conceptStableId: string) {
  return detectPositionStructureFacts(fen).find(
    (fact) => fact.subjectColor === color && fact.conceptStableId === conceptStableId,
  );
}

describe('TACTICAL_MOTIF_CLASSIFIER_V1 geometry', () => {
  it('detects a meaningful knight fork and rejects a single attack', () => {
    expect(concepts('8/5r2/6k1/8/2N5/8/8/K7 w - - 0 1', 'c4e5')).toContain('tactics.fork');
    expect(concepts('8/8/6k1/8/2N5/8/8/K7 w - - 0 1', 'c4e5')).not.toContain('tactics.fork');
  });

  it('detects only an absolute king pin, not a relative alignment', () => {
    expect(concepts('4k3/8/8/8/4b3/8/7K/R7 w - - 0 1', 'a1e1')).toContain('tactics.pin');
    expect(concepts('4q1k1/8/8/8/4b3/8/7K/R7 w - - 0 1', 'a1e1')).not.toContain('tactics.pin');
  });

  it('detects a clear king-front skewer without also labeling a pin', () => {
    const detected = concepts('4q3/8/8/8/4k3/8/7K/R7 w - - 0 1', 'a1e1');
    expect(detected).toContain('tactics.skewer');
    expect(detected).not.toContain('tactics.pin');
  });

  it('detects a discovered check as the existing discovered-attack concept', () => {
    const facts = detectTacticalMoveFacts('4k3/8/8/8/8/8/4B3/4R2K w - - 0 1', 'e2b5');
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conceptStableId: 'tactics.discovered_attack',
          ruleId: 'TACTICAL_DISCOVERED_ATTACK_V1',
          facts: expect.objectContaining({ discoveredCheck: true, revealedAttackers: ['e1'] }),
        }),
      ]),
    );
  });

  it('does not call an uncovered pawn attack a discovered tactical motif', () => {
    expect(concepts('k7/4p3/8/8/8/8/4B3/4R2K w - - 0 1', 'e2b5')).not.toContain(
      'tactics.discovered_attack',
    );
  });

  it('allows independently proven multi-label motifs but emits no duplicate concept', () => {
    const detected = concepts('4k3/5r2/8/8/8/8/4B3/4R2K w - - 0 1', 'e2c4');
    expect(new Set(detected).size).toBe(detected.length);
  });
});

describe('POSITION_STRUCTURE_CLASSIFIER_V1 geometry', () => {
  it('detects White and Black isolated queen pawns symmetrically', () => {
    expect(
      structure('7k/8/8/8/3P4/8/8/K7 w - - 0 1', 'WHITE', 'pawn_structure.isolated_queen_pawn'),
    ).toBeDefined();
    expect(
      structure('7k/8/8/3p4/8/8/8/K7 b - - 0 1', 'BLACK', 'pawn_structure.isolated_queen_pawn'),
    ).toBeDefined();
  });

  it('rejects IQP when an adjacent-file friendly pawn exists', () => {
    expect(
      structure('7k/8/8/8/2PP4/8/8/K7 w - - 0 1', 'WHITE', 'pawn_structure.isolated_queen_pawn'),
    ).toBeUndefined();
  });

  it('detects doubled pawns once per side and rejects a single pawn', () => {
    const doubled = structure(
      '7k/8/8/8/8/2P5/2P5/K7 w - - 0 1',
      'WHITE',
      'pawn_structure.doubled_pawns',
    );
    expect(doubled?.facts).toMatchObject({ files: ['c'], pawnSquares: ['c2', 'c3'] });
    expect(
      structure('7k/8/8/8/8/8/2P5/K7 w - - 0 1', 'WHITE', 'pawn_structure.doubled_pawns'),
    ).toBeUndefined();
  });

  it('detects White and Black passed pawns and rejects an adjacent-file blocker ahead', () => {
    expect(
      structure('7k/p7/8/3P4/8/8/8/K7 w - - 0 1', 'WHITE', 'pawn_structure.passed_pawn'),
    ).toBeDefined();
    expect(
      structure('7k/8/8/8/3p4/8/P7/K7 b - - 0 1', 'BLACK', 'pawn_structure.passed_pawn'),
    ).toBeDefined();
    expect(
      structure('7k/8/2p5/3P4/8/8/8/K7 w - - 0 1', 'WHITE', 'pawn_structure.passed_pawn'),
    ).toBeUndefined();
  });

  it('records currently protected passed-pawn squares without inventing a new ontology ID', () => {
    const passed = structure(
      '7k/8/8/3P4/2P5/8/8/K7 w - - 0 1',
      'WHITE',
      'pawn_structure.passed_pawn',
    );
    expect(passed?.facts).toMatchObject({ protectedPawnSquares: ['d5'] });
    expect(detectPositionStructureFacts('7k/8/8/3P4/2P5/8/8/K7 w - - 0 1')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conceptStableId: 'pawn_structure.protected_passed_pawn' }),
      ]),
    );
  });

  it('detects a side- and wing-specific pawn majority', () => {
    expect(
      structure('7k/p7/8/8/8/8/PP6/K7 w - - 0 1', 'WHITE', 'pawn_structure.pawn_majority')?.facts,
    ).toMatchObject({ wings: ['queenside:2-1'] });
  });

  it('detects open and perspective-specific semi-open files as raw chess facts only', () => {
    expect(detectFileStructureFacts('7k/8/8/8/8/8/8/K7 w - - 0 1').openFiles).toContain('d');
    expect(detectFileStructureFacts('7k/3p4/8/8/8/8/8/K7 w - - 0 1').semiOpenFiles.WHITE).toContain(
      'd',
    );
    expect(detectFileStructureFacts('7k/8/8/8/8/8/3P4/K7 w - - 0 1').semiOpenFiles.BLACK).toContain(
      'd',
    );
  });
});
