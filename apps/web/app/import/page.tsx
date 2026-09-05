'use client';

import { useState, type FormEvent } from 'react';

import { StatusMessage } from '@chess-intelligent/ui';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface ImportResult {
  status: 'created' | 'already_exists';
  gameId: string;
  importJobId: string;
}

interface ApiError {
  error?: { message?: string };
}

export default function ImportPage() {
  const [pgn, setPgn] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${apiUrl}/games/import-pgn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pgn, sourceType: 'USER_UPLOAD' }),
      });
      const body = (await response.json()) as ImportResult & ApiError;
      if (!response.ok) {
        throw new Error(body.error?.message ?? `Import failed with HTTP ${response.status}.`);
      }
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import failed unexpectedly.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel wide">
      <p className="eyebrow">Developer ingestion tool</p>
      <h1>Import PGN</h1>
      <p>Only direct user input is enabled. The original PGN is retained with its provenance.</p>

      <form onSubmit={submit}>
        <label htmlFor="pgn">Portable Game Notation</label>
        <textarea
          id="pgn"
          name="pgn"
          rows={18}
          required
          value={pgn}
          onChange={(event) => setPgn(event.target.value)}
          placeholder={'[Event "Academy game"]\n[White "Student"]\n[Black "Coach"]\n\n1. e4 e5 *'}
        />
        <button type="submit" disabled={submitting || !pgn.trim()}>
          {submitting ? 'Importing…' : 'Import'}
        </button>
      </form>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {result ? (
        <StatusMessage tone="success">
          <strong>{result.status === 'created' ? 'Game imported.' : 'Game already exists.'}</strong>{' '}
          Canonical ID: <code>{result.gameId}</code>.{' '}
          <a href={`/games/${result.gameId}`}>View game details</a>
        </StatusMessage>
      ) : null}
    </section>
  );
}
