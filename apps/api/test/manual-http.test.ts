import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { runMigrations } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';

import { buildApp } from '../src/app';

it('manually exercises import and retrieval over a real HTTP listener', async () => {
  const database = await PGliteDatabase.create();
  const applied = await runMigrations(database);
  const app = await buildApp({ database, internalDevRoutes: true });

  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const pgn = await readFile(new URL('./fixtures/successful.pgn', import.meta.url), 'utf8');
    const imported = await fetch(`${address}/games/import-pgn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pgn, sourceType: 'USER_UPLOAD' }),
    });
    const importBody = (await imported.json()) as { status: string; gameId: string };
    const retrieved = await fetch(`${address}/games/${importBody.gameId}`);
    const game = (await retrieved.json()) as {
      id: string;
      moves: unknown[];
      provenance: unknown[];
    };
    const evidence = {
      cleanMigrationsApplied: applied,
      importHttpStatus: imported.status,
      importStatus: importBody.status,
      retrievalHttpStatus: retrieved.status,
      retrievedGameId: game.id,
      moveCount: game.moves.length,
      provenanceCount: game.provenance.length,
    };

    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    expect(evidence).toMatchObject({
      cleanMigrationsApplied: [
        '001_foundation.sql',
        '002_repeatable_source_observations.sql',
        '003_metadata_reconciliation.sql',
        '004_position_corpus_explorer.sql',
        '005_engine_analysis.sql',
        '006_opponent_opening_intelligence.sql',
        '007_player_intelligence_dossier.sql',
        '008_chess_concept_ontology.sql',
        '009_concept_evidence_classification.sql',
        '010_player_skill_graph.sql',
        '011_adaptive_training_engine.sql',
        '012_coach_student_intelligence.sql',
        '013_academy_production_foundation.sql',
        '014_production_verification_foundation.sql',
      ],
      importHttpStatus: 201,
      importStatus: 'created',
      retrievalHttpStatus: 200,
      moveCount: 20,
      provenanceCount: 1,
    });
    expect(evidence.retrievedGameId).toBe(importBody.gameId);
  } finally {
    await app.close();
    await database.close();
  }
});
