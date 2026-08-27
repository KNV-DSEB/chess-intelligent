import { StatusMessage } from '@chess-intelligent/ui';

import { EngineAnalysisPanel } from './engine-analysis-panel';
import { ConceptEvidencePanel } from './concept-evidence-panel';

export const dynamic = 'force-dynamic';

const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface GameDetails {
  id: string;
  pgnStatus: string;
  contentStatus: string;
  verificationStatus: string;
  event: string | null;
  round: string | null;
  headers: Record<string, string>;
  result: string;
  playedDateText: string | null;
  gameContext: string;
  timeCategory: string;
  players: Array<{
    id: string;
    color: string;
    displayName: string;
    rating: number | null;
    fideId: string | null;
  }>;
  provenance: Array<{
    id: string;
    sourceType: string;
    permissionBasis: string;
    externalId: string | null;
    importedAt: string;
    observationKind: 'METADATA' | 'PGN';
  }>;
  moves: Array<{
    ply: number;
    san: string;
    uci: string;
    fenAfter: string;
    positionId: string;
    sideToMove: string;
  }>;
}

async function loadGame(id: string): Promise<GameDetails | null> {
  const response = await fetch(`${apiUrl}/games/${id}`, { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as GameDetails;
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await loadGame(id);
  if (!game) {
    return <StatusMessage tone="error">No imported game exists for this ID.</StatusMessage>;
  }

  const white = game.players.find((player) => player.color === 'WHITE');
  const black = game.players.find((player) => player.color === 'BLACK');

  return (
    <section className="panel wide">
      <p className="eyebrow">
        {game.contentStatus} · {game.verificationStatus}
      </p>
      <h1>{game.event ?? `${white?.displayName ?? '?'} vs ${black?.displayName ?? '?'}`}</h1>
      <p>
        {white?.displayName ?? '?'} {white?.rating ? `(${white.rating})` : ''}{' '}
        {white?.fideId ? `FIDE ${white.fideId}` : ''} · <strong>{game.result}</strong> ·{' '}
        {black?.displayName ?? '?'} {black?.rating ? `(${black.rating})` : ''}{' '}
        {black?.fideId ? `FIDE ${black.fideId}` : ''}
      </p>
      <p>
        {game.playedDateText ?? 'Unknown date'} · Round {game.round ?? '?'} · {game.gameContext} ·{' '}
        {game.timeCategory}
      </p>

      <h2>Provenance</h2>
      <ul>
        {game.provenance.map((source) => (
          <li key={source.id}>
            {source.sourceType} {source.observationKind} · {source.permissionBasis} ·{' '}
            {new Date(source.importedAt).toLocaleString()}
          </li>
        ))}
      </ul>

      <h2>Moves</h2>
      {game.moves.length === 0 ? (
        <StatusMessage tone="info">
          Moves are not yet available.{' '}
          <a href={`/games/${game.id}/attach-pgn`}>Review and attach a PGN</a>
        </StatusMessage>
      ) : (
        <p>{game.moves.length} plies are available from an attached PGN.</p>
      )}
      {game.moves.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ply</th>
                <th>SAN</th>
                <th>UCI</th>
                <th>Side to move</th>
                <th>Position ID</th>
                <th>FEN after move</th>
              </tr>
            </thead>
            <tbody>
              {game.moves.map((move) => (
                <tr key={move.ply}>
                  <td>{move.ply}</td>
                  <td>{move.san}</td>
                  <td>
                    <code>{move.uci}</code>
                  </td>
                  <td>{move.sideToMove}</td>
                  <td>
                    <code title={move.positionId}>{move.positionId.slice(0, 12)}…</code>
                  </td>
                  <td>
                    <code>{move.fenAfter}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {game.moves.length > 0 ? <EngineAnalysisPanel gameId={game.id} /> : null}
      {game.moves.length > 0 ? <ConceptEvidencePanel gameId={game.id} /> : null}
    </section>
  );
}
