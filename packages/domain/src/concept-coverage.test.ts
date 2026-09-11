import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { buildConceptCoverageReport } from './concept-coverage';
import { ontologyContentSha256, type ChessConceptOntologySource } from './ontology';

describe('CONCEPT_COVERAGE_REPORT_V1', () => {
  it('assigns all 64 immutable ontology concepts exactly one support status', async () => {
    const source = JSON.parse(
      await readFile(new URL('../../../ontology/chess/1.0.0.json', import.meta.url), 'utf8'),
    ) as ChessConceptOntologySource;
    const report = buildConceptCoverageReport({
      ontology: source,
      ontologyContentSha256: ontologyContentSha256(source),
    });
    expect(report.counts).toEqual({
      total: 64,
      classifierSupported: 13,
      trainable: 8,
      contextOnly: 5,
      ontologyOnly: 36,
      deferred: 15,
    });
    expect(new Set(report.entries.map((entry) => entry.stableId)).size).toBe(64);
    expect(report.entries.every((entry) => Boolean(entry.status))).toBe(true);
  });

  it('never marks structural exposure as mastery eligible', async () => {
    const source = JSON.parse(
      await readFile(new URL('../../../ontology/chess/1.0.0.json', import.meta.url), 'utf8'),
    ) as ChessConceptOntologySource;
    const report = buildConceptCoverageReport({
      ontology: source,
      ontologyContentSha256: ontologyContentSha256(source),
    });
    const hanging = report.entries.find(
      (entry) => entry.stableId === 'pawn_structure.hanging_pawns',
    );
    expect(hanging).toMatchObject({
      status: 'OBSERVABLE_CONTEXT_ONLY',
      masteryEligible: false,
      trainingSupported: false,
      polarities: ['NEUTRAL'],
    });
  });
});
