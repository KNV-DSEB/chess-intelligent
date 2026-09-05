'use client';

import { type FormEvent, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface RepresentativeGame {
  gameId: string;
  white: { displayName: string; rating: number | null };
  black: { displayName: string; rating: number | null };
  event: string | null;
  playedAt: string | null;
  result: string;
  sourceTypes: string[];
}

interface ExplorerResult {
  position: { id: string; fen: string; sideToMove: 'WHITE' | 'BLACK' };
  filters: { playerColor: 'WHITE' | 'BLACK' | null };
  focalPlayer: {
    playerId: string;
    displayName: string;
    identity: { provider: string; externalId: string } | null;
  } | null;
  focalPlayerCorpus: {
    totalCanonicalGames: number;
    gamesWithMoves: number;
    metadataOnlyGames: number;
  } | null;
  sample: { games: number };
  scorePerspective: 'FOCAL_PLAYER' | 'SIDE_TO_MOVE';
  nextMoves: Array<{
    san: string;
    uci: string;
    gameCount: number;
    frequency: number;
    whiteWins: number;
    draws: number;
    blackWins: number;
    score: number;
    resultingPositionId: string;
    resultingFen: string;
    representativeGames: RepresentativeGame[];
  }>;
  representativeGames: RepresentativeGame[];
}

interface ApiError {
  error?: { message?: string };
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function nullableNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
}

export default function PositionExplorerPage() {
  const [fen, setFen] = useState(initialFen);
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runQuery(queryFen: string, form: HTMLFormElement): Promise<void> {
    setLoading(true);
    setError(null);
    const data = new FormData(form);
    const fideId = String(data.get('fideId') ?? '').trim();
    const playerId = String(data.get('playerId') ?? '').trim();
    const context = String(data.get('gameContext') ?? '');
    const timeCategory = String(data.get('timeCategory') ?? '');
    const playerColor = String(data.get('playerColor') ?? '');
    const sourceType = String(data.get('sourceType') ?? '');
    const playedFrom = String(data.get('playedFrom') ?? '').trim();
    const playedTo = String(data.get('playedTo') ?? '').trim();

    try {
      const response = await fetch(`${apiUrl}/positions/explore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fen: queryFen,
          filters: {
            playerId: playerId || null,
            externalIdentity: fideId ? { provider: 'FIDE', externalId: fideId } : null,
            playerColor: playerColor || null,
            gameContexts: context ? [context] : [],
            timeCategories: timeCategory ? [timeCategory] : [],
            playedFrom: playedFrom || null,
            playedTo: playedTo || null,
            minimumOpponentRating: nullableNumber(data.get('minimumOpponentRating')),
            sourceTypes: sourceType ? [sourceType] : [],
            minimumSampleSize: nullableNumber(data.get('minimumSampleSize')) ?? 1,
          },
        }),
      });
      const body = (await response.json()) as ExplorerResult | ApiError;
      if (!response.ok) {
        throw new Error(
          'error' in body
            ? (body.error?.message ?? 'Position query failed.')
            : 'Position query failed.',
        );
      }
      setResult(body as ExplorerResult);
      setFen((body as ExplorerResult).position.fen);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : 'Position query failed.');
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runQuery(fen, event.currentTarget);
  }

  async function navigate(resultingFen: string): Promise<void> {
    const form = document.querySelector<HTMLFormElement>('#position-explorer-form');
    if (!form) return;
    setFen(resultingFen);
    await runQuery(resultingFen, form);
  }

  return (
    <section className="panel wide">
      <p className="eyebrow">Historical intelligence · Task 003</p>
      <h1>Position corpus explorer</h1>
      <p>
        Explore what players actually played from a normalized position. Frequency and observed
        score describe this local corpus; they are not engine recommendations.
      </p>

      <form id="position-explorer-form" onSubmit={submit}>
        <label>
          Position FEN
          <textarea
            rows={3}
            name="fen"
            value={fen}
            onChange={(event) => setFen(event.target.value)}
          />
        </label>

        <fieldset>
          <legend>Focal player — exact local identity only</legend>
          <div className="form-grid">
            <label>
              FIDE ID
              <input name="fideId" inputMode="numeric" placeholder="12456789" />
            </label>
            <label>
              Internal Player ID
              <input name="playerId" placeholder="UUID" />
            </label>
          </div>
          <p className="help-text">
            Supply one identity field. No external or fuzzy lookup occurs.
          </p>
        </fieldset>

        <div className="form-grid three">
          <label>
            Player color
            <select name="playerColor" defaultValue="">
              <option value="">Both</option>
              <option value="WHITE">White</option>
              <option value="BLACK">Black</option>
            </select>
          </label>
          <label>
            Context
            <select name="gameContext" defaultValue="">
              <option value="">All contexts</option>
              <option value="OTB">OTB</option>
              <option value="ONLINE">Online</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label>
            Time category
            <select name="timeCategory" defaultValue="">
              <option value="">All categories</option>
              <option value="CLASSICAL">Classical</option>
              <option value="RAPID">Rapid</option>
              <option value="BLITZ">Blitz</option>
              <option value="BULLET">Bullet</option>
              <option value="CORRESPONDENCE">Correspondence</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label>
            Played from
            <input name="playedFrom" type="date" />
          </label>
          <label>
            Played to
            <input name="playedTo" type="date" />
          </label>
          <label>
            Minimum opponent rating
            <input name="minimumOpponentRating" type="number" min="100" max="4000" />
          </label>
          <label>
            Source
            <select name="sourceType" defaultValue="">
              <option value="">All local sources</option>
              <option value="USER_UPLOAD">User upload</option>
            </select>
          </label>
          <label>
            Minimum move sample
            <input name="minimumSampleSize" type="number" min="1" defaultValue="1" />
          </label>
        </div>

        <button disabled={loading}>{loading ? 'Exploring…' : 'Explore observed moves'}</button>
      </form>

      {error ? <p className="status status-error">{error}</p> : null}

      {result ? (
        <div>
          {result.focalPlayer ? (
            <div className="status status-info">
              <strong>Analyzing: {result.focalPlayer.displayName}</strong>
              <br />
              Identity:{' '}
              {result.focalPlayer.identity
                ? `${result.focalPlayer.identity.provider} ${result.focalPlayer.identity.externalId}`
                : `Player ${result.focalPlayer.playerId}`}
            </div>
          ) : null}

          <div className="metric-grid">
            <div>
              <span>Observed games</span>
              <strong>{result.sample.games}</strong>
            </div>
            <div>
              <span>Side to move</span>
              <strong>{result.position.sideToMove}</strong>
            </div>
            <div>
              <span>Score perspective</span>
              <strong>{result.scorePerspective.replaceAll('_', ' ')}</strong>
            </div>
          </div>

          <p className="position-key">
            Position <code>{result.position.id}</code>
          </p>

          {result.sample.games === 0 ? (
            <p className="status status-info">
              {result.focalPlayerCorpus && result.focalPlayerCorpus.gamesWithMoves === 0
                ? `${result.focalPlayerCorpus.totalCanonicalGames} games are known for this player, but none currently contain moves usable for position analysis.`
                : 'No matching games exist under the current position and corpus filters.'}
            </p>
          ) : (
            <>
              <h2>
                {result.focalPlayer && result.filters.playerColor === result.position.sideToMove
                  ? `Observed choices by ${result.focalPlayer.displayName}`
                  : result.focalPlayer
                    ? 'Observed continuations in focal-player games'
                    : 'Most played moves'}
              </h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Move</th>
                      <th>Games</th>
                      <th>Frequency</th>
                      <th>White/Draw/Black</th>
                      <th>Observed score</th>
                      <th>Representative games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.nextMoves.map((move) => (
                      <tr key={`${move.uci}-${move.resultingPositionId}`}>
                        <td>
                          <button
                            className="move-link"
                            type="button"
                            disabled={loading}
                            onClick={() => navigate(move.resultingFen)}
                            title={`Navigate to ${move.resultingPositionId}`}
                          >
                            {move.san}
                          </button>{' '}
                          <code>{move.uci}</code>
                        </td>
                        <td>{move.gameCount}</td>
                        <td>{percentage(move.frequency)}</td>
                        <td>
                          {move.whiteWins}/{move.draws}/{move.blackWins}
                        </td>
                        <td>{percentage(move.score)}</td>
                        <td className="representative-links">
                          {move.representativeGames.map((game) => (
                            <a key={game.gameId} href={`/games/${game.gameId}`}>
                              {game.white.displayName}–{game.black.displayName} ({game.result})
                            </a>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.nextMoves.length === 0 ? (
                <p className="status status-info">
                  Games match the position, but no move reaches the selected minimum sample size.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
