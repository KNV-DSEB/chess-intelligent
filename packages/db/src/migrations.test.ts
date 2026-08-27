import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PGliteDatabase } from './testing';

describe('Task 002 through 009 migration compatibility', () => {
  it('upgrades Task 001 rows and backfills position occurrences without changing lifecycle meaning', async () => {
    const database = await PGliteDatabase.create();
    try {
      const migration001 = await readFile(
        new URL('../migrations/001_foundation.sql', import.meta.url),
        'utf8',
      );
      const migration002 = await readFile(
        new URL('../migrations/002_repeatable_source_observations.sql', import.meta.url),
        'utf8',
      );
      const migration003 = await readFile(
        new URL('../migrations/003_metadata_reconciliation.sql', import.meta.url),
        'utf8',
      );
      const migration004 = await readFile(
        new URL('../migrations/004_position_corpus_explorer.sql', import.meta.url),
        'utf8',
      );
      const migration005 = await readFile(
        new URL('../migrations/005_engine_analysis.sql', import.meta.url),
        'utf8',
      );
      const migration006 = await readFile(
        new URL('../migrations/006_opponent_opening_intelligence.sql', import.meta.url),
        'utf8',
      );
      const migration007 = await readFile(
        new URL('../migrations/007_player_intelligence_dossier.sql', import.meta.url),
        'utf8',
      );
      const migration008 = await readFile(
        new URL('../migrations/008_chess_concept_ontology.sql', import.meta.url),
        'utf8',
      );
      const migration009 = await readFile(
        new URL('../migrations/009_concept_evidence_classification.sql', import.meta.url),
        'utf8',
      );
      const migration010 = await readFile(
        new URL('../migrations/010_player_skill_graph.sql', import.meta.url),
        'utf8',
      );
      const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const samePositionDifferentClocks =
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 7 42';
      const initialPositionId = createHash('sha256')
        .update('position:v1:rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'utf8')
        .digest('hex');
      const firstMove = {
        san: 'e4',
        uci: 'e2e4',
        from: 'e2',
        to: 'e4',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        positionId: 'c'.repeat(64),
        normalizedPosition: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
        sideToMove: 'BLACK',
      };
      await database.execute(migration001);
      await database.execute(migration002);
      await database.query(
        `INSERT INTO games (id, fingerprint, pgn_status, result, initial_fen)
         VALUES
           ('10000000-0000-4000-8000-000000000001', $1, 'PGN_IMPORTED', '1-0', $2),
           ('10000000-0000-4000-8000-000000000002', NULL, 'METADATA_ONLY', '*', $3)`,
        ['a'.repeat(64), initialFen, samePositionDifferentClocks],
      );
      await database.query(
        `INSERT INTO game_source_records (
           id, game_id, data_source_id, permission_basis, raw_pgn, original_pgn_sha256
         ) VALUES (
           '20000000-0000-4000-8000-000000000001',
           '10000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000001',
           'USER_SUPPLIED', '1. e4 *', $1
         )`,
        ['b'.repeat(64)],
      );
      await database.query(
        `INSERT INTO positions (id, normalized_fen_key, side_to_move)
         VALUES ($1, $2, $3)`,
        [firstMove.positionId, firstMove.normalizedPosition, firstMove.sideToMove],
      );
      await database.query(
        `INSERT INTO moves (
           id, game_id, ply, san, uci, from_square, to_square, fen_after, position_id
         ) VALUES (
           '30000000-0000-4000-8000-000000000001',
           '10000000-0000-4000-8000-000000000001',
           1, $1, $2, $3, $4, $5, $6
         )`,
        [
          firstMove.san,
          firstMove.uci,
          firstMove.from,
          firstMove.to,
          firstMove.fenAfter,
          firstMove.positionId,
        ],
      );

      await database.execute(migration003);
      await database.execute(migration004);
      await database.execute(migration005);
      await database.execute(migration006);
      await database.execute(migration007);
      await database.execute(migration008);
      await database.execute(migration009);
      await database.execute(migration010);
      const games = await database.query<{
        id: string;
        content_status: string;
        verification_status: string;
      }>(
        `SELECT id, content_status, verification_status
         FROM games ORDER BY id`,
      );
      expect(games.rows).toEqual([
        {
          id: '10000000-0000-4000-8000-000000000001',
          content_status: 'MOVES_AVAILABLE',
          verification_status: 'UNVERIFIED',
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          content_status: 'METADATA_ONLY',
          verification_status: 'UNVERIFIED',
        },
      ]);
      const source = await database.query<{ observation_kind: string }>(
        'SELECT observation_kind FROM game_source_records',
      );
      expect(source.rows).toEqual([{ observation_kind: 'PGN' }]);

      const occurrences = await database.query<{
        ply: number;
        position_id: string;
        resulting_position_id: string;
      }>(
        `SELECT ply, position_id, resulting_position_id
         FROM position_occurrences`,
      );
      expect(occurrences.rows).toEqual([
        {
          ply: 0,
          position_id: initialPositionId,
          resulting_position_id: firstMove.positionId,
        },
      ]);
      const initial = await database.query<{ representative_fen: string }>(
        'SELECT representative_fen FROM positions WHERE id = $1',
        [initialPositionId],
      );
      expect(initial.rows).toEqual([{ representative_fen: initialFen }]);
      const analysisTables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN (
           'analysis_jobs', 'analysis_runs', 'engine_position_states',
           'engine_evaluations', 'move_engine_assessments', 'critical_positions'
         )
         ORDER BY table_name`,
      );
      expect(analysisTables.rows.map((row) => row.table_name)).toEqual([
        'analysis_jobs',
        'analysis_runs',
        'critical_positions',
        'engine_evaluations',
        'engine_position_states',
        'move_engine_assessments',
      ]);
      const task005Indexes = await database.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND indexname IN (
           'game_players_player_color_game_idx',
           'position_occurrences_game_position_ply_idx',
           'engine_position_states_compatible_occurrence_idx',
           'engine_evaluations_candidate_root_idx'
         )
         ORDER BY indexname`,
      );
      expect(task005Indexes.rows.map((row) => row.indexname)).toEqual([
        'engine_evaluations_candidate_root_idx',
        'engine_position_states_compatible_occurrence_idx',
        'game_players_player_color_game_idx',
        'position_occurrences_game_position_ply_idx',
      ]);
      const task006Indexes = await database.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND indexname IN (
           'analysis_runs_dossier_selection_idx',
           'move_engine_assessments_run_mover_ply_idx',
           'game_players_dossier_player_game_idx'
         )
         ORDER BY indexname`,
      );
      expect(task006Indexes.rows.map((row) => row.indexname)).toEqual([
        'analysis_runs_dossier_selection_idx',
        'game_players_dossier_player_game_idx',
        'move_engine_assessments_run_mover_ply_idx',
      ]);
      const ontologyTables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN (
           'ontology_versions', 'concept_identities', 'concept_definitions',
           'concept_relationships', 'evidence_type_definitions',
           'concept_evidence_policies'
         ) ORDER BY table_name`,
      );
      expect(ontologyTables.rows.map((row) => row.table_name)).toEqual([
        'concept_definitions',
        'concept_evidence_policies',
        'concept_identities',
        'concept_relationships',
        'evidence_type_definitions',
        'ontology_versions',
      ]);
      const classificationTables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN (
           'concept_classification_runs', 'concept_evidence_instances'
         ) ORDER BY table_name`,
      );
      expect(classificationTables.rows.map((row) => row.table_name)).toEqual([
        'concept_classification_runs',
        'concept_evidence_instances',
      ]);
      const occurrenceIdentity = await database.query<{ id: string }>(
        'SELECT id FROM position_occurrences',
      );
      expect(occurrenceIdentity.rows[0]?.id).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u,
      );
      const skillGraphTables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN (
           'player_skill_graph_runs', 'skill_graph_selected_classification_runs',
           'player_concept_states', 'player_concept_game_contributions',
           'skill_graph_evidence_contributions'
         ) ORDER BY table_name`,
      );
      expect(skillGraphTables.rows.map((row) => row.table_name)).toEqual([
        'player_concept_game_contributions',
        'player_concept_states',
        'player_skill_graph_runs',
        'skill_graph_evidence_contributions',
        'skill_graph_selected_classification_runs',
      ]);
    } finally {
      await database.close();
    }
  });
});
