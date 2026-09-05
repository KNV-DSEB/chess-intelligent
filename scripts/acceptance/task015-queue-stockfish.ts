import { readFile } from 'node:fs/promises';

import { AnalysisRepository, PgDatabase } from '@chess-intelligent/db';

import { buildApp } from '../../apps/api/src/app';

const connectionString = process.env.DATABASE_URL;
const fixturePath = process.env.TASK015_FIXTURE_PATH;
const gameDate = process.env.TASK015_GAME_DATE ?? '2026-09-04';
if (!connectionString) throw new Error('DATABASE_URL is required.');
if (!fixturePath) throw new Error('TASK015_FIXTURE_PATH is required.');

const database = new PgDatabase(connectionString, { applicationName: 'task015-stockfish-queue' });
const app = await buildApp({ database, internalDevRoutes: true });

try {
  const fixture = await readFile(fixturePath, 'utf8');
  const pgn = fixture.replace('[Date "2026.08.22"]', `[Date "${gameDate.replaceAll('-', '.')}"]`);
  const response = await app.inject({
    method: 'POST',
    url: '/games/import-pgn',
    payload: { pgn, sourceType: 'USER_UPLOAD' },
  });
  if (response.statusCode !== 201) throw new Error(`Import failed: ${response.body}`);
  const gameId = response.json<{ gameId: string }>().gameId;
  const requested = await new AnalysisRepository(database).requestJob({
    gameId,
    profile: 'QUICK_V1',
  });
  process.stdout.write(`${JSON.stringify({ gameId, jobId: requested.job.id })}\n`);
} finally {
  await app.close();
  await database.close();
}
