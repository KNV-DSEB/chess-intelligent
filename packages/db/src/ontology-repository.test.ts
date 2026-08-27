import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { ChessConceptOntologySource } from '@chess-intelligent/domain';

import { OntologyRepository } from './ontology-repository';
import { readOntologySourceFile } from './ontology-source';
import { PGliteDatabase } from './testing';

async function migratedDatabase(): Promise<PGliteDatabase> {
  const database = await PGliteDatabase.create();
  await database.execute(
    await readFile(
      new URL('../migrations/008_chess_concept_ontology.sql', import.meta.url),
      'utf8',
    ),
  );
  return database;
}

describe('Task 007 ontology repository', () => {
  it('publishes transactionally and treats an identical source as idempotent', async () => {
    const database = await migratedDatabase();
    try {
      const source = await readOntologySourceFile();
      const repository = new OntologyRepository(database);
      const first = await repository.sync(source);
      const second = await repository.sync(structuredClone(source));

      expect(first).toMatchObject({ status: 'published', version: '1.0.0' });
      expect(first.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(second).toEqual({ ...first, status: 'already_published' });

      const versions = await repository.listVersions();
      expect(versions).toEqual([
        expect.objectContaining({
          version: '1.0.0',
          conceptCount: 64,
          domainCount: 7,
          relationshipCount: 81,
          prerequisiteCount: 24,
          evidenceTypeCount: 12,
          evidencePolicyCount: 190,
        }),
      ]);
      const snapshot = await repository.getSnapshot('latest');
      expect(snapshot?.contentSha256).toBe(first.contentSha256);
      expect(snapshot?.source.concepts).toHaveLength(64);
      expect(
        (await repository.getPrerequisites('1.0.0', 'endgame.triangulation')).map(
          (concept) => concept.stableId,
        ),
      ).toEqual(['endgame.opposition']);
      expect(await repository.getAllowedEvidence('1.0.0', 'tactics.deflection')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stableId: 'engine.eval_loss', role: 'CONTEXTUAL' }),
        ]),
      );
    } finally {
      await database.close();
    }
  });

  it('refuses to mutate an already-published semantic version', async () => {
    const database = await migratedDatabase();
    try {
      const source = await readOntologySourceFile();
      const repository = new OntologyRepository(database);
      await repository.sync(source);
      const changed = structuredClone(source);
      changed.concepts.find((concept) => concept.stableId === 'tactics.deflection')!.displayName =
        'Deflection renamed in place';

      await expect(repository.sync(changed)).rejects.toMatchObject({
        code: 'ONTOLOGY_VERSION_HASH_CONFLICT',
        version: '1.0.0',
      });
      expect((await repository.listVersions()).map((entry) => entry.version)).toEqual(['1.0.0']);
    } finally {
      await database.close();
    }
  });

  it('retains stable identities and historical definitions across a new version', async () => {
    const database = await migratedDatabase();
    try {
      const source = await readOntologySourceFile();
      const next = structuredClone(source) as ChessConceptOntologySource;
      next.version = '1.0.1';
      const deprecated = next.concepts.find(
        (concept) => concept.stableId === 'opening.premature_queen_activity',
      )!;
      deprecated.status = 'DEPRECATED';
      deprecated.replacementConceptIds = ['opening.tempo'];
      next.concepts.find((concept) => concept.stableId === 'strategy.piece_activity')!.displayName =
        'Active Piece Placement';

      const repository = new OntologyRepository(database);
      await repository.sync(source);
      await repository.sync(next);

      expect((await repository.listVersions()).map((entry) => entry.version)).toEqual([
        '1.0.1',
        '1.0.0',
      ]);
      expect(
        (await repository.getSnapshot('1.0.0'))?.source.concepts.find(
          (concept) => concept.stableId === deprecated.stableId,
        ),
      ).toMatchObject({ status: 'ACTIVE', replacementConceptIds: [] });
      expect(
        (await repository.getSnapshot('1.0.1'))?.source.concepts.find(
          (concept) => concept.stableId === deprecated.stableId,
        ),
      ).toMatchObject({ status: 'DEPRECATED', replacementConceptIds: ['opening.tempo'] });
      expect(
        (await repository.getSnapshot('1.0.0'))?.source.concepts.find(
          (concept) => concept.stableId === 'strategy.piece_activity',
        )?.displayName,
      ).toBe('Piece Activity');
      expect(
        (await repository.getSnapshot('1.0.1'))?.source.concepts.find(
          (concept) => concept.stableId === 'strategy.piece_activity',
        )?.displayName,
      ).toBe('Active Piece Placement');

      const identities = await database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM concept_identities',
      );
      expect(identities.rows[0]?.count).toBe('64');
    } finally {
      await database.close();
    }
  });

  it('persists definitions and policies but no player evidence, mastery, or weakness state', async () => {
    const database = await migratedDatabase();
    try {
      const tables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`,
      );
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        'concept_definitions',
        'concept_evidence_policies',
        'concept_identities',
        'concept_relationships',
        'evidence_type_definitions',
        'ontology_versions',
      ]);
    } finally {
      await database.close();
    }
  });
});
