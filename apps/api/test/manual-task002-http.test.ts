import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { runMigrations } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';

import { buildApp } from '../src/app';

it('manually exercises metadata, review, conflict, attachment, and retrieval over HTTP', async () => {
  const database = await PGliteDatabase.create();
  const migrations = await runMigrations(database);
  const app = await buildApp({ database, internalDevRoutes: true });

  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const pgn = await readFile(new URL('./fixtures/metadata-match.pgn', import.meta.url), 'utf8');
    const metadataResponse = await fetch(`${address}/games/import-metadata`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'USER_UPLOAD',
        event: 'Bangkok Open 2026',
        site: 'Bangkok, Thailand',
        round: '4',
        boardNumber: 18,
        playedAt: '2026-04-15',
        result: '1-0',
        gameContext: 'OTB',
        timeCategory: 'CLASSICAL',
        white: { displayName: 'Nguyen Van A', rating: 2185, fideId: '12456789' },
        black: { displayName: 'Player B', rating: 2241, fideId: '98765432' },
      }),
    });
    const metadata = (await metadataResponse.json()) as { gameId: string; contentStatus: string };
    const beforeResponse = await fetch(`${address}/games/${metadata.gameId}`);
    const before = (await beforeResponse.json()) as { moves: unknown[]; provenance: unknown[] };

    const reviewResponse = await fetch(`${address}/games/reconcile-pgn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pgn, sourceType: 'USER_UPLOAD' }),
    });
    const review = (await reviewResponse.json()) as {
      candidates: Array<{ gameId: string; classification: string }>;
    };
    const candidate = review.candidates.find((item) => item.gameId === metadata.gameId);

    const conflictingPgn = pgn.replaceAll('1-0', '0-1');
    const conflictResponse = await fetch(`${address}/games/reconcile-pgn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pgn: conflictingPgn, sourceType: 'USER_UPLOAD' }),
    });
    const conflict = (await conflictResponse.json()) as {
      candidates: Array<{ gameId: string; classification: string }>;
    };

    const attachmentResponse = await fetch(`${address}/games/${metadata.gameId}/attach-pgn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pgn,
        sourceType: 'USER_UPLOAD',
        expectedReconciliationClassification: candidate?.classification,
      }),
    });
    const afterResponse = await fetch(`${address}/games/${metadata.gameId}`);
    const after = (await afterResponse.json()) as {
      id: string;
      contentStatus: string;
      moves: unknown[];
      provenance: Array<{ observationKind: string }>;
    };
    const evidence = {
      migrations,
      metadataHttpStatus: metadataResponse.status,
      canonicalGameId: metadata.gameId,
      initialMoveCount: before.moves.length,
      initialProvenanceCount: before.provenance.length,
      reconciliation: candidate?.classification,
      conflict: conflict.candidates.find((item) => item.gameId === metadata.gameId)?.classification,
      attachmentHttpStatus: attachmentResponse.status,
      retrievedSameGame: after.id === metadata.gameId,
      finalContentStatus: after.contentStatus,
      finalMoveCount: after.moves.length,
      provenanceKinds: after.provenance.map((source) => source.observationKind),
    };

    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    expect(evidence).toMatchObject({
      metadataHttpStatus: 201,
      initialMoveCount: 0,
      initialProvenanceCount: 1,
      reconciliation: 'HIGH_CONFIDENCE_MATCH',
      conflict: 'CONFLICT',
      attachmentHttpStatus: 201,
      retrievedSameGame: true,
      finalContentStatus: 'MOVES_AVAILABLE',
      finalMoveCount: 10,
      provenanceKinds: ['METADATA', 'PGN'],
    });
  } finally {
    await app.close();
    await database.close();
  }
});
