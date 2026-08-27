'use client';

import { useState, type FormEvent } from 'react';

import { StatusMessage } from '@chess-intelligent/ui';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface MetadataResult {
  gameId: string;
  contentStatus: 'METADATA_ONLY';
}

function optionalText(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? '').trim();
  return value || null;
}

function optionalNumber(form: FormData, name: string): number | null {
  const value = optionalText(form, name);
  return value === null ? null : Number(value);
}

export default function NewMetadataGamePage() {
  const [result, setResult] = useState<MetadataResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      sourceType: 'USER_UPLOAD',
      event: optionalText(form, 'event'),
      site: optionalText(form, 'site'),
      playedAt: optionalText(form, 'playedAt'),
      round: optionalText(form, 'round'),
      boardNumber: optionalText(form, 'boardNumber'),
      result: String(form.get('result')),
      gameContext: String(form.get('gameContext')),
      timeCategory: String(form.get('timeCategory')),
      white: {
        displayName: String(form.get('whiteName') ?? '').trim(),
        fideId: optionalText(form, 'whiteFideId'),
        rating: optionalNumber(form, 'whiteRating'),
      },
      black: {
        displayName: String(form.get('blackName') ?? '').trim(),
        fideId: optionalText(form, 'blackFideId'),
        rating: optionalNumber(form, 'blackRating'),
      },
      externalTournamentId: optionalText(form, 'externalTournamentId'),
      externalGameId: optionalText(form, 'externalGameId'),
    };

    try {
      const response = await fetch(`${apiUrl}/games/import-metadata`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as MetadataResult & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? `Creation failed with HTTP ${response.status}.`);
      }
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Metadata creation failed unexpectedly.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel wide">
      <p className="eyebrow">OTB corpus workflow</p>
      <h1>Create metadata-only game</h1>
      <p>Record a known game without inventing moves. FIDE IDs are explicit reviewed identities.</p>

      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Event
            <input name="event" placeholder="Bangkok Open 2026" />
          </label>
          <label>
            Site
            <input name="site" placeholder="Bangkok, Thailand" />
          </label>
          <label>
            Date
            <input name="playedAt" type="date" />
          </label>
          <label>
            Round
            <input name="round" placeholder="4" />
          </label>
          <label>
            Board
            <input name="boardNumber" inputMode="numeric" placeholder="18" />
          </label>
          <label>
            Result
            <select name="result" defaultValue="*">
              <option value="*">Unknown / unfinished</option>
              <option value="1-0">1-0</option>
              <option value="0-1">0-1</option>
              <option value="1/2-1/2">1/2-1/2</option>
            </select>
          </label>
          <label>
            Context
            <select name="gameContext" defaultValue="OTB">
              <option value="OTB">OTB</option>
              <option value="ONLINE">Online</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label>
            Time category
            <select name="timeCategory" defaultValue="CLASSICAL">
              {['CLASSICAL', 'RAPID', 'BLITZ', 'BULLET', 'CORRESPONDENCE', 'UNKNOWN'].map(
                (category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>White</legend>
          <div className="form-grid three">
            <label>
              Name
              <input name="whiteName" required />
            </label>
            <label>
              FIDE ID
              <input name="whiteFideId" inputMode="numeric" />
            </label>
            <label>
              Rating
              <input name="whiteRating" type="number" min="100" max="4000" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Black</legend>
          <div className="form-grid three">
            <label>
              Name
              <input name="blackName" required />
            </label>
            <label>
              FIDE ID
              <input name="blackFideId" inputMode="numeric" />
            </label>
            <label>
              Rating
              <input name="blackRating" type="number" min="100" max="4000" />
            </label>
          </div>
        </fieldset>

        <details>
          <summary>Optional source identifiers</summary>
          <div className="form-grid">
            <label>
              External tournament ID
              <input name="externalTournamentId" />
            </label>
            <label>
              External game ID
              <input name="externalGameId" />
            </label>
          </div>
        </details>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create metadata game'}
        </button>
      </form>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {result ? (
        <StatusMessage tone="success">
          Metadata-only game created. <a href={`/games/${result.gameId}`}>Open canonical game</a>
        </StatusMessage>
      ) : null}
    </section>
  );
}
