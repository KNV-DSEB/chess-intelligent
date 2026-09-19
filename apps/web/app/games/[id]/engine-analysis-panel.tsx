'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiUrl } from '../../api-client';

interface Job {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  progress: { processed: number; total: number };
  runId: string | null;
  error: { code: string; message: string } | null;
}

interface RunSummary {
  id: string;
  profile: string;
  profileVersion: number;
  engineReportedName: string;
  binarySha256: string;
  completedAt: string;
}

interface Evaluation {
  pvRank: number | null;
  score:
    | { kind: 'CENTIPAWN'; centipawns: number; perspective: 'WHITE' }
    | { kind: 'MATE'; mateIn: number; perspective: 'WHITE' };
  rootMoveUci: string;
  pvUci: string[];
  search: { depth: number | null; nodes: number | null; timeMs: number | null };
}

interface AnalysisRun extends RunSummary {
  jobId: string;
  startedAt: string;
  configuration: {
    engineOptions: Record<string, unknown>;
    searchLimit: { type: string; value: number };
    multiPv: number;
    detectorVersion: string;
  };
  positions: Array<{
    ply: number;
    mover: 'WHITE' | 'BLACK';
    playedMoveUci: string;
    bestMoveUci: string;
    centipawnLoss: number | null;
    mateOutcome: string;
    multiPv: Evaluation[];
    playedMoveEvaluation: Evaluation;
    critical: { severity: string; reasons: string[]; detectorVersion: string } | null;
  }>;
}

function scoreText(score: Evaluation['score']): string {
  if (score.kind === 'MATE')
    return score.mateIn > 0 ? `M${score.mateIn}` : `-M${Math.abs(score.mateIn)}`;
  const pawns = score.centipawns / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

async function responseJson<Response>(response: globalThis.Response): Promise<Response> {
  const body = (await response.json()) as Response & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return body;
}

export function EngineAnalysisPanel({ gameId }: { gameId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRuns = useCallback(async () => {
    const response = await fetch(`${apiUrl}/games/${gameId}/analysis-runs`);
    const body = await responseJson<{ runs: RunSummary[] }>(response);
    setRuns(body.runs);
  }, [gameId]);

  const loadRun = useCallback(async (runId: string) => {
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/analysis/runs/${runId}`);
      setRun(await responseJson<AnalysisRun>(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load analysis run.');
    }
  }, []);

  useEffect(() => {
    void refreshRuns().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not load analysis history.');
    });
  }, [refreshRuns]);

  useEffect(() => {
    if (!job || (job.status !== 'PENDING' && job.status !== 'RUNNING')) return;
    const timer = setTimeout(() => {
      void fetch(`${apiUrl}/analysis/jobs/${job.id}`)
        .then((response) => responseJson<Job>(response))
        .then(async (next) => {
          setJob(next);
          if (next.status === 'SUCCEEDED' && next.runId) {
            await Promise.all([loadRun(next.runId), refreshRuns()]);
          }
        })
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'Could not poll analysis job.');
        });
    }, 1_000);
    return () => clearTimeout(timer);
  }, [job, loadRun, refreshRuns]);

  async function requestAnalysis() {
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/analysis/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId, profile: 'QUICK_V1' }),
      });
      setJob(await responseJson<Job>(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not request engine analysis.');
    }
  }

  return (
    <section className="engine-panel" id="engine-analysis">
      <h2>Engine Analysis</h2>
      <p className="help-text">
        QUICK_V1 evaluates each pre-move state and the played root move. Scores are White-relative;
        historical frequency is separate evidence.
      </p>
      <button
        type="button"
        onClick={() => void requestAnalysis()}
        disabled={job?.status === 'RUNNING' || job?.status === 'PENDING'}
      >
        {runs.length > 0 ? 'Run analysis again' : 'Analyze with QUICK_V1'}
      </button>

      {job ? (
        <p className={`status ${job.status === 'FAILED' ? 'status-error' : 'status-info'}`}>
          Job {job.status} · {job.progress.processed}/{job.progress.total} positions
          {job.error ? ` · ${job.error.message}` : ''}
        </p>
      ) : null}
      {error ? <p className="status status-error">{error}</p> : null}

      {runs.length > 0 ? (
        <div className="analysis-history">
          <h3>Completed immutable runs</h3>
          {runs.map((summary) => (
            <button
              className="run-link"
              type="button"
              key={summary.id}
              onClick={() => void loadRun(summary.id)}
            >
              {summary.profile} v{summary.profileVersion} · {summary.engineReportedName} ·{' '}
              {new Date(summary.completedAt).toLocaleString()}
            </button>
          ))}
        </div>
      ) : null}

      {run ? (
        <div className="analysis-run">
          <h3>Analysis run</h3>
          <div className="metric-grid">
            <div>
              <span>Engine</span>
              <strong>{run.engineReportedName}</strong>
            </div>
            <div>
              <span>Search</span>
              <strong>
                {run.configuration.searchLimit.type} {run.configuration.searchLimit.value}
              </strong>
            </div>
            <div>
              <span>Critical</span>
              <strong>{run.positions.filter((position) => position.critical).length}</strong>
            </div>
          </div>
          <p className="position-key">
            Binary SHA-256: <code>{run.binarySha256}</code>
            <br />
            Options: <code>{JSON.stringify(run.configuration.engineOptions)}</code> · detector{' '}
            <code>{run.configuration.detectorVersion}</code>
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ply</th>
                  <th>Mover</th>
                  <th>Best</th>
                  <th>Played</th>
                  <th>Loss</th>
                  <th>MultiPV</th>
                  <th>Critical evidence</th>
                </tr>
              </thead>
              <tbody>
                {run.positions.map((position) => (
                  <tr key={position.ply} className={position.critical ? 'critical-row' : undefined}>
                    <td>{position.ply}</td>
                    <td>{position.mover}</td>
                    <td>
                      <code>{position.bestMoveUci}</code> {scoreText(position.multiPv[0]!.score)}
                    </td>
                    <td>
                      <code>{position.playedMoveUci}</code>{' '}
                      {scoreText(position.playedMoveEvaluation.score)}
                    </td>
                    <td>
                      {position.centipawnLoss === null
                        ? position.mateOutcome
                        : `${position.centipawnLoss} cp`}
                    </td>
                    <td>
                      {position.multiPv
                        .map(
                          (line) => `#${line.pvRank} ${line.rootMoveUci} ${scoreText(line.score)}`,
                        )
                        .join(' · ')}
                    </td>
                    <td>
                      {position.critical ? (
                        <>
                          <span
                            className={`severity severity-${position.critical.severity.toLowerCase()}`}
                          >
                            {position.critical.severity}
                          </span>{' '}
                          {position.critical.reasons.join(', ')}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
