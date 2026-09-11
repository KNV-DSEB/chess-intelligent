import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  conceptClassifierConfigurationSha256,
  resolveAndNormalizeConceptEvidence,
  tacticalDecisionEvidenceCandidates,
  type ClassificationContext,
  type ConceptEvidenceCandidate,
  type ConceptEvidencePolicyError,
  type DetectedConceptFact,
} from './concept-classification';
import { OntologyRegistry, parseOntologySource, type ChessConceptOntologySource } from './ontology';

let source: ChessConceptOntologySource;
let registry: OntologyRegistry;

beforeAll(async () => {
  source = parseOntologySource(
    JSON.parse(
      await readFile(new URL('../../../ontology/chess/1.0.0.json', import.meta.url), 'utf8'),
    ) as unknown,
  );
  registry = new OntologyRegistry(source);
});

function context(engine: ClassificationContext['engine'] = null): ClassificationContext {
  return {
    occurrencePly: 10,
    decisionPly: 11,
    positionOccurrenceId: '10000000-0000-4000-8000-000000000001',
    exactHistorySha256: 'a'.repeat(64),
    sideToMove: 'WHITE',
    preMoveFen: '8/8/8/8/8/8/8/K6k w - - 0 1',
    playedMoveUci: 'c4e5',
    playedMoveSan: 'Ne5+',
    subjectPlayerId: '20000000-0000-4000-8000-000000000001',
    engine,
  };
}

function candidate(overrides: Partial<ConceptEvidenceCandidate> = {}): ConceptEvidenceCandidate {
  const base = context();
  return {
    occurrencePly: base.occurrencePly,
    decisionPly: base.decisionPly,
    positionOccurrenceId: base.positionOccurrenceId,
    exactHistorySha256: base.exactHistorySha256,
    conceptStableId: 'tactics.fork',
    evidenceTypeStableId: 'position.tactical_motif',
    polarity: 'NEUTRAL',
    subjectKind: 'DECISION',
    subjectPlayerId: base.subjectPlayerId,
    subjectColor: 'WHITE',
    classifierId: 'TACTICAL_MOTIF_CLASSIFIER',
    classifierVersion: 'V1',
    ruleId: 'TACTICAL_FORK_V1',
    facts: { targets: ['g6', 'f7'], movedPiece: 'knight' },
    analysisRunId: null,
    ...overrides,
  };
}

const forkFact: DetectedConceptFact = {
  conceptStableId: 'tactics.fork',
  ruleId: 'TACTICAL_FORK_V1',
  subjectColor: 'WHITE',
  facts: { targets: ['f7', 'g6'] },
};

describe('Task 008 ontology enforcement', () => {
  it('resolves evidence role from the selected ontology policy', () => {
    const [resolved] = resolveAndNormalizeConceptEvidence(registry, [candidate()]);
    expect(resolved?.evidenceRole).toBe('DIRECT');
    expect(candidate()).not.toHaveProperty('evidenceRole');
  });

  it.each([
    ['UNKNOWN_CONCEPT', { conceptStableId: 'tactics.unknown' }],
    ['UNKNOWN_EVIDENCE_TYPE', { evidenceTypeStableId: 'position.unknown' }],
    [
      'EVIDENCE_NOT_ALLOWED',
      {
        conceptStableId: 'strategy.open_file',
        evidenceTypeStableId: 'position.structural_feature',
      },
    ],
    ['POLARITY_NOT_ALLOWED', { polarity: 'POSITIVE', evidenceTypeStableId: 'engine.eval_loss' }],
  ] as const)('rejects %s candidates', (code, overrides) => {
    expect(() => resolveAndNormalizeConceptEvidence(registry, [candidate(overrides)])).toThrowError(
      expect.objectContaining<Partial<ConceptEvidencePolicyError>>({ code }),
    );
  });

  it('uses historical version policy rather than a current classifier preference', () => {
    const next = structuredClone(source);
    next.version = '1.0.1';
    next.evidencePolicies.find(
      (policy) =>
        policy.conceptStableId === 'tactics.fork' &&
        policy.evidenceTypeStableId === 'position.tactical_motif',
    )!.role = 'SUPPORTING';
    expect(
      resolveAndNormalizeConceptEvidence(new OntologyRegistry(next), [candidate()])[0]
        ?.evidenceRole,
    ).toBe('SUPPORTING');
    expect(resolveAndNormalizeConceptEvidence(registry, [candidate()])[0]?.evidenceRole).toBe(
      'DIRECT',
    );
  });

  it('deduplicates and sorts normalized output deterministically', () => {
    const other = candidate({
      conceptStableId: 'tactics.pin',
      ruleId: 'TACTICAL_ABSOLUTE_PIN_V1',
      facts: { pinnedSquares: ['e4'] },
    });
    const first = resolveAndNormalizeConceptEvidence(registry, [candidate(), other, candidate()]);
    const second = resolveAndNormalizeConceptEvidence(registry, [other, candidate()]);
    expect(first).toEqual(second);
    expect(first.map((entry) => entry.conceptStableId)).toEqual(['tactics.fork', 'tactics.pin']);
    expect(conceptClassifierConfigurationSha256()).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe('Task 008 tactical decision evidence policy', () => {
  it('emits no positive decision evidence without compatible engine evidence', () => {
    expect(
      tacticalDecisionEvidenceCandidates(context(), [forkFact], [], 'CONCEPT_CLASSIFIER_BUNDLE_V1'),
    ).toEqual([]);
  });

  it('emits positive evidence for a geometrically detected low-loss played motif', () => {
    const candidates = tacticalDecisionEvidenceCandidates(
      context({
        analysisRunId: '30000000-0000-4000-8000-000000000001',
        historySha256: 'a'.repeat(64),
        playedMoveUci: 'c4e5',
        bestMoveUci: 'c4e5',
        centipawnLoss: 0,
        mateOutcome: 'NOT_APPLICABLE',
      }),
      [forkFact],
      [forkFact],
      'CONCEPT_CLASSIFIER_BUNDLE_V1',
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        conceptStableId: 'tactics.fork',
        evidenceTypeStableId: 'decision.classification',
        polarity: 'POSITIVE',
        ruleId: 'TACTICAL_DECISION_SOUND_APPLICATION_V1',
      }),
    ]);
  });

  it('emits negative evidence only for an independently detected consequential missed motif', () => {
    const missed = tacticalDecisionEvidenceCandidates(
      context({
        analysisRunId: '30000000-0000-4000-8000-000000000001',
        historySha256: 'a'.repeat(64),
        playedMoveUci: 'h2h3',
        bestMoveUci: 'c4e5',
        centipawnLoss: 184,
        mateOutcome: 'NOT_APPLICABLE',
      }),
      [],
      [forkFact],
      'CONCEPT_CLASSIFIER_BUNDLE_V1',
    );
    expect(missed).toEqual([
      expect.objectContaining({
        conceptStableId: 'tactics.fork',
        polarity: 'NEGATIVE',
        ruleId: 'MISSED_TACTICAL_MOTIF_V1',
      }),
    ]);

    const trivial = tacticalDecisionEvidenceCandidates(
      context({
        analysisRunId: '30000000-0000-4000-8000-000000000001',
        historySha256: 'a'.repeat(64),
        playedMoveUci: 'h2h3',
        bestMoveUci: 'c4e5',
        centipawnLoss: 20,
        mateOutcome: 'NOT_APPLICABLE',
      }),
      [],
      [forkFact],
      'CONCEPT_CLASSIFIER_BUNDLE_V1',
    );
    expect(trivial).toEqual([]);
  });

  it('never turns a generic 200 cp loss into a specific concept without motif geometry', () => {
    expect(
      tacticalDecisionEvidenceCandidates(
        context({
          analysisRunId: '30000000-0000-4000-8000-000000000001',
          historySha256: 'a'.repeat(64),
          playedMoveUci: 'h2h3',
          bestMoveUci: 'e2e4',
          centipawnLoss: 250,
          mateOutcome: 'NOT_APPLICABLE',
        }),
        [],
        [],
        'CONCEPT_CLASSIFIER_BUNDLE_V1',
      ),
    ).toEqual([]);
  });
});
