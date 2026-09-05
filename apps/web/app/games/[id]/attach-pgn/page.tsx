'use client';

import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { StatusMessage } from '@chess-intelligent/ui';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface Candidate {
  gameId: string;
  classification: 'EXACT_MATCH' | 'HIGH_CONFIDENCE_MATCH' | 'AMBIGUOUS_MATCH' | 'CONFLICT';
  matchedFields: string[];
  conflictingFields: string[];
  reasons: string[];
}

interface ReconciliationReport {
  pgnSummary: {
    white: string;
    whiteFideId: string | null;
    black: string;
    blackFideId: string | null;
    date: string | null;
    result: string;
    event: string | null;
  };
  candidates: Candidate[];
}

export default function AttachPgnPage() {
  const { id } = useParams<{ id: string }>();
  const [pgn, setPgn] = useState('');
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState(false);
  const candidate = report?.candidates.find((item) => item.gameId === id) ?? null;
  const attachable =
    candidate?.classification === 'EXACT_MATCH' ||
    candidate?.classification === 'HIGH_CONFIDENCE_MATCH';

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    setAttached(false);
    try {
      const response = await fetch(`${apiUrl}/games/reconcile-pgn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pgn, sourceType: 'USER_UPLOAD' }),
      });
      const body = (await response.json()) as ReconciliationReport & {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? `Review failed with HTTP ${response.status}.`);
      }
      setReport(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reconciliation failed unexpectedly.');
    } finally {
      setBusy(false);
    }
  }

  async function attach() {
    if (!candidate || !attachable) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/games/${id}/attach-pgn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pgn,
          sourceType: 'USER_UPLOAD',
          expectedReconciliationClassification: candidate.classification,
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? `Attachment failed with HTTP ${response.status}.`);
      }
      setAttached(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Attachment failed unexpectedly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel wide">
      <p className="eyebrow">Reviewed canonical-game mutation</p>
      <h1>Attach PGN</h1>
      <p>Review deterministic evidence before adding moves to game {id}.</p>

      <form onSubmit={review}>
        <label htmlFor="candidate-pgn">Candidate PGN</label>
        <textarea
          id="candidate-pgn"
          rows={18}
          required
          value={pgn}
          onChange={(event) => setPgn(event.target.value)}
        />
        <button type="submit" disabled={busy || !pgn.trim()}>
          {busy ? 'Reviewing…' : 'Review candidate'}
        </button>
      </form>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {report ? (
        <section className="review-card">
          <h2>Candidate PGN</h2>
          <p>
            {report.pgnSummary.white} ({report.pgnSummary.whiteFideId ?? 'no FIDE ID'}) vs{' '}
            {report.pgnSummary.black} ({report.pgnSummary.blackFideId ?? 'no FIDE ID'})
          </p>
          <p>
            {report.pgnSummary.event ?? 'Unknown event'} ·{' '}
            {report.pgnSummary.date ?? 'Unknown date'} · {report.pgnSummary.result}
          </p>

          {candidate ? (
            <StatusMessage tone={candidate.classification === 'CONFLICT' ? 'error' : 'info'}>
              <strong>{candidate.classification.replaceAll('_', ' ')}</strong>
              <p>Matched: {candidate.matchedFields.join(', ') || 'None'}</p>
              <p>Conflicts: {candidate.conflictingFields.join(', ') || 'None'}</p>
              <ul>
                {candidate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </StatusMessage>
          ) : (
            <StatusMessage tone="error">
              This PGN is not a plausible candidate for the selected canonical game.
            </StatusMessage>
          )}

          {attachable && !attached ? (
            <button type="button" onClick={attach} disabled={busy}>
              Explicitly approve and attach PGN
            </button>
          ) : null}
        </section>
      ) : null}

      {attached ? (
        <StatusMessage tone="success">
          PGN attached to the existing canonical game. <a href={`/games/${id}`}>View game</a>
        </StatusMessage>
      ) : null}
    </section>
  );
}
