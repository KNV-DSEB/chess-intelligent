import { afterAll, describe, expect, it } from 'vitest';

import { PgDatabase } from './database';
import { runMigrations } from './migrations';

const connectionString = process.env.TEST_DATABASE_URL;
const integrationDescribe = connectionString ? describe : describe.skip;
const database = connectionString ? new PgDatabase(connectionString) : null;

integrationDescribe('PostgreSQL migration verification', () => {
  afterAll(async () => {
    await database?.close();
  });

  it('applies and records every repository migration on PostgreSQL', async () => {
    if (!database) {
      throw new Error('TEST_DATABASE_URL is required for this integration test');
    }

    await runMigrations(database);

    const migrations = await database.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    expect(migrations.rows.map((row) => row.name)).toEqual([
      '001_foundation.sql',
      '002_repeatable_source_observations.sql',
      '003_metadata_reconciliation.sql',
      '004_position_corpus_explorer.sql',
      '005_engine_analysis.sql',
      '006_opponent_opening_intelligence.sql',
      '007_player_intelligence_dossier.sql',
      '008_chess_concept_ontology.sql',
      '009_concept_evidence_classification.sql',
    ]);

    const gameColumns = await database.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'games'
         AND column_name IN ('content_status', 'verification_status', 'metadata_candidate_key')
       ORDER BY column_name`,
    );
    expect(gameColumns.rows.map((row) => row.column_name)).toEqual([
      'content_status',
      'metadata_candidate_key',
      'verification_status',
    ]);

    const occurrenceTable = await database.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'position_occurrences'`,
    );
    expect(occurrenceTable.rows).toEqual([{ table_name: 'position_occurrences' }]);
  });
});
