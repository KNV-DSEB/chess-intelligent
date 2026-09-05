'use client';

import { type FormEvent, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface Player {
  playerId: string;
  displayName: string;
  identity: { provider: string; externalId: string; verificationStatus: string };
}

interface RepresentativeGame {
  gameId: string;
  white: { displayName: string; rating: number | null };
  black: { displayName: string; rating: number | null };
  event: string | null;
  playedAt: string | null;
  result: string;
}

interface OpponentMove {
  san: string;
  uci: string;
  games: number;
  frequency: number;
  recentGames: number;
  recentFrequency: number;
  opponentScore: number;
  resultingPositionId: string;
  resultingFen: string;
  trend: { label: string };
}

interface Candidate {
  move: { san: string; uci: string; resultingPositionId: string; resultingFen: string };
  sources: string[];
  opponentEvidence: {
    gamesSeen: number;
    positionGames: number;
    frequency: number;
    recentGamesSeen: number;
    recentPositionGames: number;
    recentFrequency: number;
    lastSeen: string | null;
    familiarityScore: number;
  };
  referenceEvidence:
    | { status: 'NOT_AVAILABLE'; profile: { name: string; minimumBothPlayersRating: number } }
    | {
        status: 'AVAILABLE' | 'INSUFFICIENT_SAMPLE';
        profile: { name: string; minimumBothPlayersRating: number };
        statistics: {
          games: number;
          wins: number;
          draws: number;
          losses: number;
          rawScore: number;
          adjustedScore: number;
        };
        averageRecordedRating: number;
        representativeGames: RepresentativeGame[];
      };
  engineEvidence:
    | { status: 'NOT_AVAILABLE' | 'INCOMPATIBLE_ENGINE_STATE' }
    | {
        status: 'AVAILABLE';
        classification: string;
        evaluation: {
          score:
            | { kind: 'CENTIPAWN'; centipawns: number; perspective: 'WHITE' }
            | { kind: 'MATE'; mateIn: number; perspective: 'WHITE' };
          pvRank: number;
        };
        run: {
          id: string;
          engineReportedName: string;
          binarySha256: string;
          profile: string;
          profileVersion: number;
          searchLimit: { type: string; value: number };
        };
      };
  preparationInterest: {
    version: string;
    band: 'LOW' | 'MEDIUM' | 'HIGH';
    points: number;
    components: Record<string, number>;
  };
}

interface PositionResult {
  generatedAt: string;
  recentWindow: { months: number; from: string; through: string };
  opponent: Player;
  opponentColor: 'WHITE' | 'BLACK';
  preparationColor: 'WHITE' | 'BLACK';
  filters: Record<string, unknown>;
  position: { id: string; fen: string; sideToMove: 'WHITE' | 'BLACK' };
  nodeType: 'OPPONENT_CHOICE' | 'PREPARATION_CHOICE';
  opponentBehavior: {
    sampleGames: number;
    recentSampleGames: number;
    moves: OpponentMove[];
    predictability: { topMoveShare: number; band: string };
  } | null;
  candidates: Candidate[];
}

interface Dossier {
  opponent: Player;
  opponentColor: 'WHITE' | 'BLACK';
  preparationColor: 'WHITE' | 'BLACK';
  filters: Record<string, unknown>;
  coverage: { canonicalGames: number; gamesWithMoves: number; metadataOnlyGames: number };
  root: PositionResult;
  hotspots: Array<{
    positionId: string;
    representativeFen: string;
    reachedGames: number;
    recentReachedGames: number;
    predictability: { band: string; topMoveShare: number };
  }>;
}

interface OpeningProfile {
  coverage: {
    totalCanonicalGames: number;
    gamesWithMoves: number;
    metadataOnlyGames: number;
    otbGamesWithMoves: number;
    classicalGamesWithMoves: number;
    earliestKnownGame: string | null;
    latestKnownGame: string | null;
  };
}

interface ApiError {
  error?: { code?: string; message?: string };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function engineScore(candidate: Candidate): string {
  if (candidate.engineEvidence.status !== 'AVAILABLE') return candidate.engineEvidence.status;
  const score = candidate.engineEvidence.evaluation.score;
  return score.kind === 'CENTIPAWN'
    ? `${score.centipawns >= 0 ? '+' : ''}${(score.centipawns / 100).toFixed(2)} (White)`
    : `Mate ${score.mateIn} (White)`;
}

async function responseBody<Result>(response: Response): Promise<Result> {
  const body = (await response.json()) as Result | ApiError;
  if (!response.ok) {
    const apiError = body as ApiError;
    throw new Error(
      apiError.error?.code === 'IDENTITY_NOT_FOUND'
        ? 'No locally verified player exists for this FIDE ID. Import games or add verified identity data first.'
        : (apiError.error?.message ?? 'Opponent preparation request failed.'),
    );
  }
  return body as Result;
}

export default function PreparationPage() {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [profile, setProfile] = useState<OpeningProfile | null>(null);
  const [position, setPosition] = useState<PositionResult | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ san: string; positionId: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function currentFilters(form: HTMLFormElement): Record<string, unknown> {
    const data = new FormData(form);
    const contexts = data.getAll('gameContexts').map(String);
    const categories = data.getAll('timeCategories').map(String);
    const playedFrom = String(data.get('playedFrom') ?? '').trim();
    const playedTo = String(data.get('playedTo') ?? '').trim();
    const minimumOpponentRating = String(data.get('minimumOpponentRating') ?? '').trim();
    return {
      gameContexts: contexts,
      timeCategories: categories,
      playedFrom: playedFrom || null,
      playedTo: playedTo || null,
      minimumOpponentRating: minimumOpponentRating ? Number(minimumOpponentRating) : null,
      sourceTypes: [],
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setDossier(null);
    setProfile(null);
    setPosition(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const fideId = String(data.get('fideId') ?? '').trim();
    const opponentColor = String(data.get('opponentColor')) as 'WHITE' | 'BLACK';
    try {
      const playerResponse = await fetch(
        `${apiUrl}/players/resolve?provider=FIDE&externalId=${encodeURIComponent(fideId)}`,
      );
      const player = await responseBody<Player>(playerResponse);
      const [dossierResponse, profileResponse] = await Promise.all([
        fetch(`${apiUrl}/preparation/opponent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            opponentPlayerId: player.playerId,
            opponentColor,
            filters: currentFilters(form),
          }),
        }),
        fetch(`${apiUrl}/players/${player.playerId}/opening-profile`),
      ]);
      const [nextDossier, nextProfile] = await Promise.all([
        responseBody<Dossier>(dossierResponse),
        responseBody<OpeningProfile>(profileResponse),
      ]);
      setDossier(nextDossier);
      setProfile(nextProfile);
      setPosition(nextDossier.root);
      setBreadcrumbs([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Opponent preparation request failed.');
    } finally {
      setLoading(false);
    }
  }

  async function navigate(move: {
    san: string;
    resultingPositionId: string;
    resultingFen: string;
  }): Promise<void> {
    if (!dossier) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/preparation/opponent/position`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          opponentPlayerId: dossier.opponent.playerId,
          opponentColor: dossier.opponentColor,
          positionId: move.resultingPositionId,
          positionFen: move.resultingFen,
          filters: dossier.filters,
        }),
      });
      const next = await responseBody<PositionResult>(response);
      setPosition(next);
      setBreadcrumbs((current) => [
        ...current,
        { san: move.san, positionId: move.resultingPositionId },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Position request failed.');
    } finally {
      setLoading(false);
    }
  }

  function resetTree(): void {
    if (!dossier) return;
    setPosition(dossier.root);
    setBreadcrumbs([]);
  }

  return (
    <section className="panel wide preparation-workspace">
      <p className="eyebrow">Historical + engine intelligence · Task 005</p>
      <h1>Opponent opening intelligence</h1>
      <p>
        Build an evidence-backed preparation tree from a verified local FIDE identity. No external
        lookup occurs, and candidates are study priorities—not guaranteed best moves.
      </p>

      <form id="preparation-form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Opponent FIDE ID
            <input name="fideId" inputMode="numeric" required placeholder="12456789" />
          </label>
          <fieldset>
            <legend>Opponent will have</legend>
            <label className="inline-choice">
              <input type="radio" name="opponentColor" value="WHITE" defaultChecked /> White
            </label>
            <label className="inline-choice">
              <input type="radio" name="opponentColor" value="BLACK" /> Black
            </label>
          </fieldset>
        </div>

        <fieldset>
          <legend>Preparation corpus</legend>
          <div className="filter-choices">
            <label className="inline-choice">
              <input type="checkbox" name="gameContexts" value="OTB" defaultChecked /> OTB
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="gameContexts" value="ONLINE" /> Online
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="gameContexts" value="UNKNOWN" /> Unknown context
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="CLASSICAL" defaultChecked />
              Classical
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="RAPID" /> Rapid
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="BLITZ" /> Blitz
            </label>
          </div>
          <div className="form-grid three filter-dates">
            <label>
              Played from
              <input type="date" name="playedFrom" />
            </label>
            <label>
              Played to
              <input type="date" name="playedTo" />
            </label>
            <label>
              Minimum opponent rating
              <input type="number" name="minimumOpponentRating" min="100" max="4000" />
            </label>
          </div>
          <p className="help-text">
            OTB + Classical is the conservative default. Broader local data is included only when
            selected.
          </p>
        </fieldset>
        <button disabled={loading}>
          {loading ? 'Building dossier…' : 'Build preparation dossier'}
        </button>
      </form>

      {error ? <p className="status status-error">{error}</p> : null}

      {dossier && profile && position ? (
        <div>
          <div className="dossier-heading">
            <div>
              <p className="eyebrow">Player</p>
              <h2>{dossier.opponent.displayName}</h2>
              <p>
                {dossier.opponent.identity.provider} {dossier.opponent.identity.externalId} ·
                Prepare against {dossier.opponentColor.toLowerCase()} · You prepare as{' '}
                {dossier.preparationColor.toLowerCase()}
              </p>
            </div>
            <button type="button" className="secondary-button" onClick={resetTree}>
              Repertoire root
            </button>
          </div>

          <div className="metric-grid coverage-grid">
            <div>
              <span>Filtered games with moves</span>
              <strong>{dossier.coverage.gamesWithMoves}</strong>
            </div>
            <div>
              <span>Known metadata-only</span>
              <strong>{dossier.coverage.metadataOnlyGames}</strong>
            </div>
            <div>
              <span>All local games with moves</span>
              <strong>{profile.coverage.gamesWithMoves}</strong>
            </div>
            <div>
              <span>Known date range</span>
              <strong className="small-metric">
                {profile.coverage.earliestKnownGame ?? 'Unknown'} –{' '}
                {profile.coverage.latestKnownGame ?? 'Unknown'}
              </strong>
            </div>
          </div>

          <div className="tree-path" aria-label="Repertoire path">
            <button type="button" className="move-link" onClick={resetTree}>
              Start
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={`${crumb.positionId}-${crumb.san}`}>→ {crumb.san}</span>
            ))}
          </div>

          <div className="node-heading">
            <div>
              <p className="eyebrow">
                {position.nodeType === 'OPPONENT_CHOICE'
                  ? 'Opponent observation'
                  : 'Preparation candidates'}
              </p>
              <h2>
                {position.nodeType === 'OPPONENT_CHOICE'
                  ? `${dossier.opponent.displayName} to move`
                  : `Preparing side (${dossier.preparationColor.toLowerCase()}) to move`}
              </h2>
            </div>
            <code className="compact-position">{position.position.id}</code>
          </div>

          {position.opponentBehavior ? (
            <>
              <p>
                {position.opponentBehavior.sampleGames} canonical games ·{' '}
                {position.opponentBehavior.recentSampleGames} in the last{' '}
                {position.recentWindow.months} months · Statistical predictability:{' '}
                <strong>{position.opponentBehavior.predictability.band}</strong> (top move{' '}
                {percent(position.opponentBehavior.predictability.topMoveShare)})
              </p>
              {position.opponentBehavior.moves.length === 0 ? (
                <p className="status status-info">No observed move under the current filters.</p>
              ) : (
                <div className="repertoire-list">
                  {position.opponentBehavior.moves.map((move) => (
                    <button
                      key={`${move.uci}-${move.resultingPositionId}`}
                      type="button"
                      className="repertoire-row"
                      disabled={loading}
                      onClick={() => navigate(move)}
                    >
                      <strong>{move.san}</strong>
                      <code>{move.uci}</code>
                      <span>
                        {move.games} games · {percent(move.frequency)}
                      </span>
                      <span>
                        Recent {move.recentGames} · {percent(move.recentFrequency)}
                      </span>
                      <span className={`trend trend-${move.trend.label.toLowerCase()}`}>
                        {move.trend.label.replaceAll('_', ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="candidate-grid">
              {position.candidates.length === 0 ? (
                <p className="status status-info">
                  No local strong-reference or compatible engine candidate is available here.
                </p>
              ) : null}
              {position.candidates.map((candidate) => (
                <article
                  className="candidate-card"
                  key={`${candidate.move.uci}-${candidate.move.resultingPositionId}`}
                >
                  <header>
                    <div>
                      <p className="eyebrow">Preparation candidate</p>
                      <h3>
                        {candidate.move.san} <code>{candidate.move.uci}</code>
                      </h3>
                    </div>
                    <span
                      className={`interest interest-${candidate.preparationInterest.band.toLowerCase()}`}
                    >
                      {candidate.preparationInterest.band} interest
                    </span>
                  </header>

                  <div className="evidence-columns">
                    <section>
                      <h4>Opponent observation</h4>
                      <strong>{candidate.opponentEvidence.gamesSeen} games seen</strong>
                      <p>
                        {percent(candidate.opponentEvidence.frequency)} overall ·{' '}
                        {candidate.opponentEvidence.recentGamesSeen} recent · familiarity{' '}
                        {candidate.opponentEvidence.familiarityScore.toFixed(2)}
                      </p>
                      <small>
                        Last seen: {candidate.opponentEvidence.lastSeen ?? 'Never observed'}
                      </small>
                    </section>

                    <section>
                      <h4>Strong-player corpus</h4>
                      {candidate.referenceEvidence.status === 'NOT_AVAILABLE' ? (
                        <strong>NOT AVAILABLE</strong>
                      ) : (
                        <>
                          <strong>
                            {candidate.referenceEvidence.statistics.games} games ·{' '}
                            {candidate.referenceEvidence.status.replaceAll('_', ' ')}
                          </strong>
                          <p>
                            W/D/L {candidate.referenceEvidence.statistics.wins}/
                            {candidate.referenceEvidence.statistics.draws}/
                            {candidate.referenceEvidence.statistics.losses} · raw{' '}
                            {percent(candidate.referenceEvidence.statistics.rawScore)} · adjusted{' '}
                            {percent(candidate.referenceEvidence.statistics.adjustedScore)}
                          </p>
                          <small>
                            Average recorded rating{' '}
                            {Math.round(candidate.referenceEvidence.averageRecordedRating)} ·
                            minimum both{' '}
                            {candidate.referenceEvidence.profile.minimumBothPlayersRating}
                          </small>
                          <div className="representative-links">
                            {candidate.referenceEvidence.representativeGames.map((game) => (
                              <a href={`/games/${game.gameId}`} key={game.gameId}>
                                {game.white.displayName}–{game.black.displayName} ({game.result})
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </section>

                    <section>
                      <h4>Engine evidence</h4>
                      {candidate.engineEvidence.status === 'AVAILABLE' ? (
                        <>
                          <strong>{candidate.engineEvidence.classification}</strong>
                          <p>
                            {engineScore(candidate)} · PV{' '}
                            {candidate.engineEvidence.evaluation.pvRank}
                          </p>
                          <small>
                            {candidate.engineEvidence.run.engineReportedName} ·{' '}
                            {candidate.engineEvidence.run.profile} v
                            {candidate.engineEvidence.run.profileVersion} ·{' '}
                            {candidate.engineEvidence.run.searchLimit.type}{' '}
                            {candidate.engineEvidence.run.searchLimit.value}
                          </small>
                        </>
                      ) : (
                        <strong>{candidate.engineEvidence.status.replaceAll('_', ' ')}</strong>
                      )}
                    </section>
                  </div>

                  <footer>
                    <span>
                      {candidate.preparationInterest.version} · visible points{' '}
                      {candidate.preparationInterest.points}
                    </span>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => navigate(candidate.move)}
                    >
                      Study branch
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          )}

          {dossier.hotspots.length > 0 ? (
            <details className="hotspots">
              <summary>Frequent preparation nodes</summary>
              <ol>
                {dossier.hotspots.map((hotspot) => (
                  <li key={hotspot.positionId}>
                    <button
                      className="move-link"
                      type="button"
                      onClick={() =>
                        navigate({
                          san: 'hotspot',
                          resultingPositionId: hotspot.positionId,
                          resultingFen: hotspot.representativeFen,
                        })
                      }
                    >
                      {hotspot.reachedGames} reached games
                    </button>{' '}
                    · {hotspot.recentReachedGames} recent · {hotspot.predictability.band}{' '}
                    predictability
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          <p className="help-text evidence-disclaimer">
            Frequency measures stored-corpus familiarity, not move quality. Engine evaluation
            measures configured-search soundness, not practical surprise value. Missing engine
            evidence is unknown, never zero.
          </p>
        </div>
      ) : null}
    </section>
  );
}
