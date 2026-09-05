'use client';

import { type FormEvent, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface Performance {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  unresolvedResults: number;
  score: number | null;
}

interface MoveEvidence {
  san: string;
  uci: string;
  games: number;
  frequency: number;
  recentGames: number;
  recentFrequency: number;
  trend: { label: string };
}

interface Behavior {
  sampleGames: number;
  recentSampleGames: number;
  predictability: { band: string; topMoveShare: number };
  moves: MoveEvidence[];
}

interface Opportunity {
  version: string;
  opportunities: number;
  successfulOutcomes: number;
  wins: number;
  draws: number;
  losses: number;
  unresolvedResults: number;
  rate: number | null;
  evidence: Array<{
    gameId: string;
    analysisRunId: string;
    firstOpportunityPly: number;
    phase: string;
    playedAt: string | null;
    opponentName: string;
    result: string;
    scoreAtOpportunity:
      { kind: 'CENTIPAWN'; centipawns: number } | { kind: 'MATE'; mateIn: number };
  }>;
}

interface Dossier {
  generatedAt: string;
  player: {
    playerId: string;
    displayName: string;
    identity: { provider: string; externalId: string; verificationStatus: string } | null;
  };
  filters: Record<string, unknown>;
  coverage: {
    canonicalGames: number;
    gamesWithMoves: number;
    metadataOnlyGames: number;
    whiteGames: number;
    blackGames: number;
    earliestKnownGame: string | null;
    latestKnownGame: string | null;
    engineEligibleGames: number;
    compatibleAnalyzedGames: number;
    engineCoverageRatio: number;
  };
  evidenceQuality: {
    version: string;
    band: string;
    points: number;
    inputs: {
      opponentRatingCompleteness: number;
      latestGameWithin18Months: boolean;
    };
  };
  performance: {
    overall: Performance;
    byColor: Array<{ color: string; performance: Performance }>;
    byOpponentRatingBand: Array<{ band: string; performance: Performance }>;
    byYear: Array<{ year: number; performance: Performance }>;
    recordedRatingTimeline: Array<{ gameId: string; playedAt: string; rating: number }>;
  };
  repertoire: {
    recentWindow: { months: number; from: string; through: string };
    asWhite: {
      behavior: Behavior;
      breadth: {
        band: string;
        effectiveBranchCount: number;
        topMoveShare: number;
        version: string;
      };
    };
    asBlack: Array<{
      againstMove: { san: string; games: number };
      behavior: Behavior;
      breadth: {
        band: string;
        effectiveBranchCount: number;
        topMoveShare: number;
        version: string;
      };
    }>;
  };
  engine: {
    aggregation: {
      version: string;
      selection: string;
      requestedProfile: { name: string; version: number };
      eligibleGames: number;
      selectedAnalyzedGames: number;
      coverageRatio: number;
      selectedRuns: Array<{
        id: string;
        gameId: string;
        engineReportedName: string;
        engineReportedVersion: string | null;
        binarySha256: string;
        profile: string;
        profileVersion: number;
        completedAt: string;
      }>;
    };
    decisionQuality: {
      version: string;
      analyzedGames: number;
      analyzedMoves: number;
      centipawnAssessedMoves: number;
      meanCentipawnLoss: number | null;
      medianCentipawnLoss: number | null;
      centipawnLossBands: Array<{ band: string; moves: number; share: number }>;
      mateAssessments: {
        assessedMoves: number;
        outcomes: Array<{ outcome: string; moves: number }>;
      };
      byPhase: Array<{
        phase: string;
        analyzedMoves: number;
        meanCentipawnLoss: number | null;
        medianCentipawnLoss: number | null;
      }>;
    };
    criticalPatterns: {
      playerDecisionEvents: Array<{
        reason: string;
        events: number;
        gamesAffected: number;
        perAnalyzedGame: number;
        per100AnalyzedMoves: number;
      }>;
      positionComplexityEvents: Array<{
        reason: string;
        events: number;
        gamesAffected: number;
        perAnalyzedGame: number;
        per100AnalyzedMoves: number;
      }>;
      recencyComparison: {
        recentWindowMonths: number;
        all: { analyzedGames: number; analyzedMoves: number; playerDecisionEvents: number };
        recent: { analyzedGames: number; analyzedMoves: number; playerDecisionEvents: number };
      };
      evidence: Array<{
        gameId: string;
        analysisRunId: string;
        occurrencePly: number;
        phase: string;
        reason: string;
        playedAt: string | null;
        opponentName: string;
        result: string;
      }>;
    };
    advantageConversion: Opportunity;
    disadvantageRecovery: Opportunity;
  };
  objectiveBehavior: {
    gamesWithMoves: number;
    gameLength: {
      mean: number | null;
      median: number | null;
      meanMoves: number | null;
      medianMoves: number | null;
    };
    results: {
      completedGames: number;
      draws: number;
      decisiveGames: number;
      drawRate: number | null;
      decisiveRate: number | null;
    };
    castling: Array<{
      color: string;
      gamesWithMoves: number;
      kingSide: number;
      queenSide: number;
      noCastlingMoveRecorded: number;
    }>;
    queenTradeTiming: {
      version: string;
      gamesWithRecordedQueenTrade: number;
      medianPly: number | null;
      earlyGames: number;
      earlyRate: number | null;
    };
  };
}

interface ApiError {
  error?: { code?: string; message?: string };
}

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function number(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

function score(performance: Performance): string {
  return `${performance.wins} / ${performance.draws} / ${performance.losses} · ${percent(performance.score)}`;
}

function opportunityScore(item: Opportunity['evidence'][number]): string {
  return item.scoreAtOpportunity.kind === 'CENTIPAWN'
    ? `${item.scoreAtOpportunity.centipawns >= 0 ? '+' : ''}${(item.scoreAtOpportunity.centipawns / 100).toFixed(2)}`
    : `Mate ${item.scoreAtOpportunity.mateIn}`;
}

async function responseBody<Result>(response: Response): Promise<Result> {
  const body = (await response.json()) as Result | ApiError;
  if (!response.ok) {
    throw new Error((body as ApiError).error?.message ?? 'Player Intelligence request failed.');
  }
  return body as Result;
}

function RepertoireTable({ behavior }: { behavior: Behavior }) {
  if (behavior.moves.length === 0)
    return <p className="help-text">No observed moves under these filters.</p>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Move</th>
            <th>Games</th>
            <th>Frequency</th>
            <th>Recent</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {behavior.moves.map((move) => (
            <tr key={move.uci}>
              <td>
                <strong>{move.san}</strong> <code>{move.uci}</code>
              </td>
              <td>{move.games}</td>
              <td>{percent(move.frequency)}</td>
              <td>
                {move.recentGames} · {percent(move.recentFrequency)}
              </td>
              <td>
                <span className={`trend trend-${move.trend.label.toLowerCase()}`}>
                  {move.trend.label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpportunityPanel({ title, data }: { title: string; data: Opportunity }) {
  return (
    <section className="evidence-card">
      <h3>{title}</h3>
      <div className="metric-grid">
        <div>
          <span>Opportunities</span>
          <strong>{data.opportunities}</strong>
        </div>
        <div>
          <span>Successful outcomes</span>
          <strong>{data.successfulOutcomes}</strong>
        </div>
        <div>
          <span>Rate</span>
          <strong>{percent(data.rate)}</strong>
        </div>
      </div>
      <p className="help-text">
        {data.version} · first ±1.50/mate state per game · W/D/L {data.wins}/{data.draws}/
        {data.losses}
      </p>
      <details>
        <summary>Supporting games ({data.evidence.length})</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>First ply</th>
                <th>Phase</th>
                <th>Score</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {data.evidence.map((item) => (
                <tr key={item.gameId}>
                  <td>
                    <a href={`/games/${item.gameId}`}>
                      {item.playedAt ?? 'Undated'} vs {item.opponentName}
                    </a>
                  </td>
                  <td>{item.firstOpportunityPly}</td>
                  <td>{item.phase}</td>
                  <td>{opportunityScore(item)}</td>
                  <td>{item.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export default function PlayerIntelligencePage() {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setDossier(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const playedFrom = String(data.get('playedFrom') ?? '').trim();
    const playedTo = String(data.get('playedTo') ?? '').trim();
    const minimumOpponentRating = String(data.get('minimumOpponentRating') ?? '').trim();
    try {
      const response = await fetch(`${apiUrl}/intelligence/player-dossier`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalIdentity: {
            provider: 'FIDE',
            externalId: String(data.get('fideId') ?? '').trim(),
          },
          filters: {
            gameContexts: data.getAll('gameContexts').map(String),
            timeCategories: data.getAll('timeCategories').map(String),
            playedFrom: playedFrom || null,
            playedTo: playedTo || null,
            minimumOpponentRating: minimumOpponentRating ? Number(minimumOpponentRating) : null,
            sourceTypes: [],
          },
          engineProfile: 'QUICK_V1',
        }),
      });
      setDossier(await responseBody<Dossier>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Player Intelligence request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel wide player-intelligence">
      <p className="eyebrow">Player Intelligence · evidence-first V1</p>
      <h1>Opponent dossier from observed games and compatible engine runs</h1>
      <p>
        Exact local FIDE identity only. Frequencies describe the corpus; engine metrics describe
        selected runs. Neither is a psychology or weakness label.
      </p>

      <form onSubmit={submit}>
        <div className="form-grid three">
          <label>
            FIDE ID
            <input name="fideId" required pattern="\d{4,10}" placeholder="e.g. 1503014" />
          </label>
          <label>
            Played from
            <input type="date" name="playedFrom" />
          </label>
          <label>
            Played through
            <input type="date" name="playedTo" />
          </label>
        </div>
        <fieldset>
          <legend>Corpus context</legend>
          <div className="filter-choices">
            <label className="inline-choice">
              <input type="checkbox" name="gameContexts" value="OTB" defaultChecked /> OTB
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="gameContexts" value="ONLINE" /> Online
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="gameContexts" value="UNKNOWN" /> Unknown
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Time category</legend>
          <div className="filter-choices">
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="CLASSICAL" defaultChecked />{' '}
              Classical
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="RAPID" /> Rapid
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="BLITZ" /> Blitz
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="UNKNOWN" /> Unknown
            </label>
          </div>
        </fieldset>
        <label>
          Minimum opponent rating
          <input
            type="number"
            name="minimumOpponentRating"
            min="100"
            max="4000"
            placeholder="Optional; unknown ratings are excluded when set"
          />
        </label>
        <button disabled={loading}>
          {loading ? 'Building dossier…' : 'Build Player Intelligence dossier'}
        </button>
      </form>

      {error ? <p className="status status-error">{error}</p> : null}
      {dossier ? (
        <>
          <header className="dossier-heading">
            <div>
              <p className="eyebrow">Exact player</p>
              <h2>{dossier.player.displayName}</h2>
            </div>
            <small>
              {dossier.player.identity?.provider} {dossier.player.identity?.externalId} · generated{' '}
              {new Date(dossier.generatedAt).toLocaleString()}
            </small>
          </header>

          <section className="dossier-section coverage-first">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Evidence coverage comes first</p>
                <h2>Coverage & evidence quality</h2>
              </div>
              <span
                className={`quality-badge quality-${dossier.evidenceQuality.band.toLowerCase()}`}
              >
                {dossier.evidenceQuality.band}
              </span>
            </div>
            <div className="metric-grid coverage-grid">
              <div>
                <span>Canonical games</span>
                <strong>{dossier.coverage.canonicalGames}</strong>
              </div>
              <div>
                <span>Games with moves</span>
                <strong>{dossier.coverage.gamesWithMoves}</strong>
              </div>
              <div>
                <span>Metadata only</span>
                <strong>{dossier.coverage.metadataOnlyGames}</strong>
              </div>
              <div>
                <span>Selected engine games</span>
                <strong>
                  {dossier.coverage.compatibleAnalyzedGames} /{' '}
                  {dossier.coverage.engineEligibleGames}
                </strong>
              </div>
              <div>
                <span>Engine coverage</span>
                <strong>{percent(dossier.coverage.engineCoverageRatio)}</strong>
              </div>
              <div>
                <span>White / Black</span>
                <strong>
                  {dossier.coverage.whiteGames} / {dossier.coverage.blackGames}
                </strong>
              </div>
              <div>
                <span>Date range</span>
                <strong className="small-metric">
                  {dossier.coverage.earliestKnownGame ?? '—'} →{' '}
                  {dossier.coverage.latestKnownGame ?? '—'}
                </strong>
              </div>
              <div>
                <span>Opponent rating known</span>
                <strong>
                  {percent(dossier.evidenceQuality.inputs.opponentRatingCompleteness)}
                </strong>
              </div>
            </div>
            <p className="help-text">
              {dossier.evidenceQuality.version} · {dossier.evidenceQuality.points}/6 points ·
              measures evidence coverage, not player quality.
            </p>
            <details>
              <summary>Applied filters</summary>
              <pre>{JSON.stringify(dossier.filters, null, 2)}</pre>
            </details>
          </section>

          <section className="dossier-section">
            <p className="eyebrow">Historical intelligence</p>
            <h2>Recorded performance</h2>
            <div className="metric-grid">
              <div>
                <span>Completed games</span>
                <strong>{dossier.performance.overall.games}</strong>
              </div>
              <div>
                <span>W / D / L</span>
                <strong>
                  {dossier.performance.overall.wins} / {dossier.performance.overall.draws} /{' '}
                  {dossier.performance.overall.losses}
                </strong>
              </div>
              <div>
                <span>Focal score</span>
                <strong>{percent(dossier.performance.overall.score)}</strong>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Slice</th>
                    <th>Games</th>
                    <th>W / D / L · score</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.performance.byColor.map((row) => (
                    <tr key={row.color}>
                      <td>{row.color}</td>
                      <td>{row.performance.games}</td>
                      <td>{score(row.performance)}</td>
                    </tr>
                  ))}
                  {dossier.performance.byOpponentRatingBand.map((row) => (
                    <tr key={row.band}>
                      <td>Opponent {row.band}</td>
                      <td>{row.performance.games}</td>
                      <td>{score(row.performance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Yearly performance and recorded rating observations</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Games</th>
                      <th>W / D / L · score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.performance.byYear.map((row) => (
                      <tr key={row.year}>
                        <td>{row.year}</td>
                        <td>{row.performance.games}</td>
                        <td>{score(row.performance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="help-text">
                Ratings are observations stored with games, not an inferred or official rating
                history.
              </p>
            </details>
          </section>

          <section className="dossier-section">
            <p className="eyebrow">Task 005 read model</p>
            <h2>Observed repertoire</h2>
            <p className="help-text">
              Recent window {dossier.repertoire.recentWindow.from} →{' '}
              {dossier.repertoire.recentWindow.through}. Frequency is descriptive, never “best”.
            </p>
            <h3>As White · first move</h3>
            <p>
              <strong>{dossier.repertoire.asWhite.breadth.band}</strong> · effective branches{' '}
              {number(dossier.repertoire.asWhite.breadth.effectiveBranchCount, 2)} · top share{' '}
              {percent(dossier.repertoire.asWhite.breadth.topMoveShare)}
            </p>
            <RepertoireTable behavior={dossier.repertoire.asWhite.behavior} />
            {dossier.repertoire.asBlack.map((response) => (
              <details key={response.againstMove.san}>
                <summary>
                  As Black vs {response.againstMove.san} · {response.behavior.sampleGames} games ·{' '}
                  {response.breadth.band}
                </summary>
                <p className="help-text">
                  Effective branches {number(response.breadth.effectiveBranchCount, 2)} · top share{' '}
                  {percent(response.breadth.topMoveShare)}
                </p>
                <RepertoireTable behavior={response.behavior} />
              </details>
            ))}
          </section>

          <section className="dossier-section">
            <p className="eyebrow">Engine intelligence</p>
            <h2>Decision quality</h2>
            <div className="metric-grid">
              <div>
                <span>Analyzed games</span>
                <strong>{dossier.engine.decisionQuality.analyzedGames}</strong>
              </div>
              <div>
                <span>Mean CPL</span>
                <strong>{number(dossier.engine.decisionQuality.meanCentipawnLoss)}</strong>
              </div>
              <div>
                <span>Median CPL</span>
                <strong>{number(dossier.engine.decisionQuality.medianCentipawnLoss)}</strong>
              </div>
            </div>
            <p className="help-text">
              {dossier.engine.decisionQuality.version} · focal-player moves only · mate outcomes
              excluded from centipawn averages.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CPL band</th>
                    <th>Moves</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.engine.decisionQuality.centipawnLossBands.map((row) => (
                    <tr key={row.band}>
                      <td>{row.band}</td>
                      <td>{row.moves}</td>
                      <td>{percent(row.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Phase breakdown and mate semantics</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Phase</th>
                      <th>Moves</th>
                      <th>Mean / median CPL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.engine.decisionQuality.byPhase.map((row) => (
                      <tr key={row.phase}>
                        <td>{row.phase}</td>
                        <td>{row.analyzedMoves}</td>
                        <td>
                          {number(row.meanCentipawnLoss)} / {number(row.medianCentipawnLoss)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Mate-assessed moves: {dossier.engine.decisionQuality.mateAssessments.assessedMoves}
              </p>
            </details>
          </section>

          <section className="dossier-section">
            <h2>Observed critical-position recurrence</h2>
            <p className="help-text">
              Counts are observed recurrence with explicit denominators. They are not weakness or
              concept labels.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Player-decision event</th>
                    <th>Events</th>
                    <th>Games</th>
                    <th>Per game</th>
                    <th>Per 100 moves</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.engine.criticalPatterns.playerDecisionEvents.map((row) => (
                    <tr key={row.reason}>
                      <td>{row.reason}</td>
                      <td>{row.events}</td>
                      <td>{row.gamesAffected}</td>
                      <td>{number(row.perAnalyzedGame, 2)}</td>
                      <td>{number(row.per100AnalyzedMoves, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Position complexity:{' '}
              {dossier.engine.criticalPatterns.positionComplexityEvents[0]?.events ?? 0}{' '}
              high-sensitivity decisions.
            </p>
            <details>
              <summary>
                Supporting critical positions ({dossier.engine.criticalPatterns.evidence.length})
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Game</th>
                      <th>Ply</th>
                      <th>Phase</th>
                      <th>Reason</th>
                      <th>Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.engine.criticalPatterns.evidence.map((item, index) => (
                      <tr key={`${item.gameId}-${item.occurrencePly}-${item.reason}-${index}`}>
                        <td>
                          <a href={`/games/${item.gameId}`}>
                            {item.playedAt ?? 'Undated'} vs {item.opponentName}
                          </a>
                        </td>
                        <td>{item.occurrencePly}</td>
                        <td>{item.phase}</td>
                        <td>{item.reason}</td>
                        <td>
                          <a href={`/games/${item.gameId}?analysisRun=${item.analysisRunId}`}>
                            {item.analysisRunId.slice(0, 8)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <div className="opportunity-grid">
            <OpportunityPanel
              title="Advantage conversion"
              data={dossier.engine.advantageConversion}
            />
            <OpportunityPanel
              title="Disadvantage recovery"
              data={dossier.engine.disadvantageRecovery}
            />
          </div>

          <section className="dossier-section">
            <h2>Objective recorded behavior</h2>
            <div className="metric-grid">
              <div>
                <span>Mean / median length</span>
                <strong>
                  {number(dossier.objectiveBehavior.gameLength.meanMoves)} /{' '}
                  {number(dossier.objectiveBehavior.gameLength.medianMoves)} moves
                </strong>
              </div>
              <div>
                <span>Draw rate</span>
                <strong>{percent(dossier.objectiveBehavior.results.drawRate)}</strong>
              </div>
              <div>
                <span>Decisive rate</span>
                <strong>{percent(dossier.objectiveBehavior.results.decisiveRate)}</strong>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Color</th>
                    <th>Games</th>
                    <th>King side</th>
                    <th>Queen side</th>
                    <th>No castling move recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.objectiveBehavior.castling.map((row) => (
                    <tr key={row.color}>
                      <td>{row.color}</td>
                      <td>{row.gamesWithMoves}</td>
                      <td>{row.kingSide}</td>
                      <td>{row.queenSide}</td>
                      <td>{row.noCastlingMoveRecorded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Recorded queen trades:{' '}
              {dossier.objectiveBehavior.queenTradeTiming.gamesWithRecordedQueenTrade}; median ply{' '}
              {number(dossier.objectiveBehavior.queenTradeTiming.medianPly)}; early (≤20):{' '}
              {dossier.objectiveBehavior.queenTradeTiming.earlyGames} (
              {percent(dossier.objectiveBehavior.queenTradeTiming.earlyRate)}).
            </p>
            <p className="help-text">
              Objective behavior describes recorded actions, not intent, temperament, or psychology.
            </p>
          </section>

          <section className="dossier-section">
            <h2>Engine evidence provenance</h2>
            <p>
              {dossier.engine.aggregation.version} ·{' '}
              {dossier.engine.aggregation.requestedProfile.name} v
              {dossier.engine.aggregation.requestedProfile.version} · latest successful run per
              canonical game.
            </p>
            <details>
              <summary>
                Selected immutable runs ({dossier.engine.aggregation.selectedRuns.length})
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Game / run</th>
                      <th>Engine</th>
                      <th>Profile</th>
                      <th>Binary hash</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.engine.aggregation.selectedRuns.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <a href={`/games/${run.gameId}?analysisRun=${run.id}`}>
                            {run.gameId.slice(0, 8)} / {run.id.slice(0, 8)}
                          </a>
                        </td>
                        <td>
                          {run.engineReportedName} {run.engineReportedVersion ?? ''}
                        </td>
                        <td>
                          {run.profile} v{run.profileVersion}
                        </td>
                        <td>
                          <code>{run.binarySha256}</code>
                        </td>
                        <td>{new Date(run.completedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      ) : null}
    </section>
  );
}
