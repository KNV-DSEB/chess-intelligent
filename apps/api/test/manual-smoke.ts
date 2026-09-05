import { readFile } from 'node:fs/promises';

import { runMigrations } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';

import { buildApp } from '../src/app';

interface ImportResponse {
  status: 'created' | 'already_exists';
  gameId: string;
}

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
  const importBody = (await imported.json()) as ImportResponse;
  const retrieved = await fetch(`${address}/games/${importBody.gameId}`);
  const game = (await retrieved.json()) as { id: string; moves: unknown[]; provenance: unknown[] };

  process.stdout.write(
    `${JSON.stringify(
      {
        cleanMigrationsApplied: applied,
        importHttpStatus: imported.status,
        importStatus: importBody.status,
        retrievalHttpStatus: retrieved.status,
        retrievedGameId: game.id,
        moveCount: game.moves.length,
        provenanceCount: game.provenance.length,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await app.close();
  await database.close();
}
