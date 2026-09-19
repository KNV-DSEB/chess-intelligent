'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { ChessPosition } from '../components/chess-position';

import { apiUrl } from '../api-client';

interface ApiError {
  error?: { message?: string };
}

interface Player {
  playerId: string;
  displayName: string;
  identity: { provider: string; externalId: string } | null;
}

interface SkillGraphRun {
  id: string;
  playerId: string;
  ontologyVersion: string;
  asOfDate: string;
  skillGraphPolicyVersion: string;
  evidenceScope: Record<string, unknown>;
  completedAt: string;
}

interface Candidate {
  id: string;
  conceptStableId: string;
  concept: { stableId: string; displayName: string; shortDescription: string };
  candidateType: 'REMEDIATION' | 'DIAGNOSTIC';
  disposition: string;
  skillStateStatus: string;
  masteryBand: string | null;
  evidenceConfidence: string;
  prerequisiteStatus: string;
  reasonCode: string;
  rank: number;
  why: string[];
}

interface Attempt {
  id: string;
  result: 'CORRECT' | 'INCORRECT';
  submittedMoveUci: string;
  attemptNumber: number;
  submittedAt: string;
}

interface TrainingEvidence {
  id: string;
  conceptStableId: string;
  polarity: 'POSITIVE' | 'NEGATIVE';
  resolvedEvidenceRole: string;
  ontologyVersion: string;
  evidenceTypeStableId: 'training.attempt';
}

interface TrainingItem {
  id: string;
  playerId: string;
  itemType: 'FIND_BEST_MOVE';
  trainingMode: 'REMEDIATION' | 'DIAGNOSTIC';
  positionFen: string;
  sideToMove: 'WHITE' | 'BLACK';
  exactHistorySha256: string;
  instructions: string;
  targetConcept: { stableId: string; displayName: string } | null;
  source: { gameId: string; occurrenceId: string; occurrencePly: number } | null;
  acceptedMoveUcis?: string[];
  attempts: Attempt[];
  trainingEvidence: TrainingEvidence[];
}

interface TrainingPlan {
  run: {
    id: string;
    playerId: string;
    skillGraphRunId: string;
    ontologyVersion: string;
    trainingCandidatePolicyVersion: string;
    deduplicated?: boolean;
  };
  coverage: {
    consideredConcepts: number;
    eligibleCandidates: number;
    materializedItems: number;
    unavailableCandidates: number;
  };
  remediationCandidates: Candidate[];
  diagnosticCandidates: Candidate[];
  unavailableCandidates: Candidate[];
  trainingItems: TrainingItem[];
}

async function responseBody<Result>(response: Response): Promise<Result> {
  const body = (await response.json()) as Result | ApiError;
  if (!response.ok) {
    throw new Error((body as ApiError).error?.message ?? 'Training request failed.');
  }
  return body as Result;
}

function label(value: string): string {
  return value
    .toLocaleLowerCase()
    .split('_')
    .map((word) => `${word.slice(0, 1).toLocaleUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <article className="training-card">
      <div className="training-card-heading">
        <div>
          <span className="eyebrow">
            {candidate.candidateType === 'REMEDIATION' ? 'Practice' : 'Assessment'}
          </span>
          <h3>{candidate.concept.displayName}</h3>
        </div>
        <span className="training-badge">{label(candidate.disposition)}</span>
      </div>
      <p>{candidate.concept.shortDescription}</p>
      <details>
        <summary>Why this item?</summary>
        <ul>
          {candidate.why.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="help-text">
          Prerequisite: {label(candidate.prerequisiteStatus)} · Evidence:{' '}
          {label(candidate.evidenceConfidence)}
        </p>
      </details>
    </article>
  );
}

export default function TrainingPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [runs, setRuns] = useState<SkillGraphRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [activeItem, setActiveItem] = useState<TrainingItem | null>(null);
  const [moveUci, setMoveUci] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [directItemMode, setDirectItemMode] = useState(false);

  useEffect(() => {
    const itemId = new URLSearchParams(window.location.search).get('item');
    if (itemId) {
      setDirectItemMode(true);
      void openItem(itemId);
    }
  }, []);

  async function resolvePlayer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    setPlan(null);
    setActiveItem(null);
    try {
      const data = new FormData(event.currentTarget);
      const fideId = String(data.get('fideId') ?? '').trim();
      const resolved = await responseBody<Player>(
        await fetch(
          `${apiUrl}/players/resolve?provider=FIDE&externalId=${encodeURIComponent(fideId)}`,
        ),
      );
      const history = await responseBody<{ player: Player; runs: SkillGraphRun[] }>(
        await fetch(`${apiUrl}/players/${resolved.playerId}/skill-graph-runs`),
      );
      setPlayer(resolved);
      setRuns(history.runs);
      setSelectedRunId(history.runs[0]?.id ?? '');
      if (history.runs.length === 0) {
        setNotice('No immutable Skill Graph run exists for this Player yet. Build one first.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resolve the Player.');
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan(): Promise<void> {
    if (!player || !selectedRunId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const created = await responseBody<TrainingPlan>(
        await fetch(`${apiUrl}/training/plans`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            playerId: player.playerId,
            skillGraphRunId: selectedRunId,
            maxItems: 10,
          }),
        }),
      );
      setPlan(created);
      setActiveItem(created.trainingItems[0] ?? null);
      setMoveUci('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate the plan.');
    } finally {
      setLoading(false);
    }
  }

  async function openItem(itemId: string): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setActiveItem(
        await responseBody<TrainingItem>(
          await fetch(`${apiUrl}/training/items/${itemId}`, { credentials: 'include' }),
        ),
      );
      setMoveUci('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the item.');
    } finally {
      setLoading(false);
    }
  }

  async function submitMove(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!activeItem) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const completed = await responseBody<{
        attempt: Attempt;
        trainingEvidence: TrainingEvidence;
        item: TrainingItem;
      }>(
        await fetch(`${apiUrl}/training/items/${activeItem.id}/attempts`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ moveUci }),
        }),
      );
      setActiveItem(completed.item);
      setPlan((current) =>
        current
          ? {
              ...current,
              trainingItems: current.trainingItems.map((item) =>
                item.id === completed.item.id ? completed.item : item,
              ),
            }
          : current,
      );
      setNotice(
        `${label(completed.attempt.result)}. Your scored attempt was recorded and is ready for coach review.`,
      );
      setMoveUci('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not score the move.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshSkillGraph(): Promise<void> {
    if (!player || !selectedRunId) return;
    setLoading(true);
    setError(null);
    try {
      const selected = await responseBody<{ run: SkillGraphRun }>(
        await fetch(`${apiUrl}/skill-graph/runs/${selectedRunId}`),
      );
      const refreshed = await responseBody<{ run: SkillGraphRun }>(
        await fetch(`${apiUrl}/intelligence/player-skill-graph`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            playerId: player.playerId,
            ontologyVersion: selected.run.ontologyVersion,
            asOfDate: selected.run.asOfDate,
            scope: selected.run.evidenceScope,
            skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
          }),
        }),
      );
      setNotice(`Training-augmented Skill Graph ${refreshed.run.id} created explicitly.`);
      const history = await responseBody<{ runs: SkillGraphRun[] }>(
        await fetch(`${apiUrl}/players/${player.playerId}/skill-graph-runs`),
      );
      setRuns(history.runs);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh the Skill Graph.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={`training-page${directItemMode ? ' direct-training' : ' panel wide'}`}>
      {!directItemMode ? (
        <>
          <p className="context-line">Training workspace</p>
          <h1>Prepare evidence-backed training</h1>
          <p>
            Diagnostic exercises gather missing evidence. Practice exercises reinforce a verified
            pattern.
          </p>

          <form onSubmit={resolvePlayer}>
            <label>
              Player FIDE ID
              <input
                name="fideId"
                inputMode="numeric"
                required
                pattern="\d{4,10}"
                placeholder="12456789"
              />
            </label>
            <button disabled={loading}>Load Player and Skill Graph runs</button>
          </form>

          {player ? (
            <div className="training-run-picker">
              <p>
                <strong>{player.displayName}</strong> · Player {player.playerId}
              </p>
              <label>
                Immutable Skill Graph run
                <select
                  value={selectedRunId}
                  onChange={(event) => setSelectedRunId(event.target.value)}
                >
                  {runs.map((run) => (
                    <option value={run.id} key={run.id}>
                      {run.asOfDate} · {run.skillGraphPolicyVersion} · {run.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={loading || !selectedRunId} onClick={() => void generatePlan()}>
                Generate training plan
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <p className="status status-error">{error}</p> : null}
      {notice ? <p className="status status-success">{notice}</p> : null}

      {plan ? (
        <>
          <div className="metric-grid training-metrics">
            <div>
              <span>Considered concepts</span>
              <strong>{plan.coverage.consideredConcepts}</strong>
            </div>
            <div>
              <span>Eligible candidates</span>
              <strong>{plan.coverage.eligibleCandidates}</strong>
            </div>
            <div>
              <span>Materialized items</span>
              <strong>{plan.coverage.materializedItems}</strong>
            </div>
            <div>
              <span>Unavailable, explained</span>
              <strong>{plan.coverage.unavailableCandidates}</strong>
            </div>
          </div>

          <h2>Practice</h2>
          <div className="training-card-grid">
            {plan.remediationCandidates.map((candidate) => (
              <CandidateCard candidate={candidate} key={candidate.id} />
            ))}
            {plan.remediationCandidates.length === 0 ? (
              <p className="help-text">No supported remediation candidate in this run.</p>
            ) : null}
          </div>

          <h2>Assessment</h2>
          <div className="training-card-grid">
            {plan.diagnosticCandidates.map((candidate) => (
              <CandidateCard candidate={candidate} key={candidate.id} />
            ))}
            {plan.diagnosticCandidates.length === 0 ? (
              <p className="help-text">No verifiable diagnostic item is currently available.</p>
            ) : null}
          </div>

          <details className="training-unavailable">
            <summary>Unavailable candidates ({plan.unavailableCandidates.length})</summary>
            <div className="training-card-grid">
              {plan.unavailableCandidates.map((candidate) => (
                <CandidateCard candidate={candidate} key={candidate.id} />
              ))}
            </div>
          </details>

          <h2>Training queue</h2>
          <div className="training-queue">
            {plan.trainingItems.map((item, index) => (
              <button
                className={
                  activeItem?.id === item.id ? 'training-queue-item active' : 'training-queue-item'
                }
                onClick={() => void openItem(item.id)}
                key={item.id}
              >
                {index + 1}. {item.trainingMode === 'REMEDIATION' ? 'Practice' : 'Assessment'} ·{' '}
                {item.targetConcept?.displayName ?? 'Concept hidden until scored'}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {activeItem ? (
        <section className="training-solver">
          <header className="training-position-header">
            <div>
              <p className="context-line">
                {activeItem.trainingMode === 'REMEDIATION'
                  ? 'Focused practice'
                  : 'Diagnostic position'}
              </p>
              <h1>{activeItem.targetConcept?.displayName ?? 'Find the best move'}</h1>
            </div>
            <span className="side-to-move">{label(activeItem.sideToMove)} to move</span>
          </header>
          <p>
            {directItemMode
              ? 'Find the strongest continuation. Enter the move using its starting and ending squares.'
              : activeItem.instructions}
          </p>
          <div className="training-solver-grid">
            <ChessPosition fen={activeItem.positionFen} sideToMove={activeItem.sideToMove} />
            <div>
              <h2>Choose your move</h2>
              <p>
                Study the whole board before committing. Your first scored attempt is the
                measurement used for this exercise.
              </p>
              <form onSubmit={submitMove}>
                <label>
                  Your move
                  <input
                    value={moveUci}
                    onChange={(event) => setMoveUci(event.target.value.toLowerCase())}
                    required
                    pattern="[a-h][1-8][a-h][1-8][qrbn]?"
                    placeholder="e2e4"
                  />
                </label>
                <small>Enter the starting and ending squares, for example e2e4.</small>
                <button disabled={loading}>{loading ? 'Checking move…' : 'Commit move'}</button>
              </form>
              {activeItem.acceptedMoveUcis ? (
                <p className="status status-info">
                  Reference move: <strong>{activeItem.acceptedMoveUcis.join(', ')}</strong>
                </p>
              ) : (
                <p className="help-text">The reference move stays private until you submit.</p>
              )}
              {activeItem.source ? (
                <p>
                  <a href={`/games/${activeItem.source.gameId}`}>
                    See the source game for this position →
                  </a>
                </p>
              ) : null}
            </div>
          </div>

          {activeItem.attempts.length > 0 ? (
            <details className="attempt-review" open>
              <summary>Review your attempt</summary>
              <h3>Attempt history</h3>
              <ol className="training-attempts">
                {activeItem.attempts.map((attempt) => (
                  <li key={attempt.id}>
                    Attempt {attempt.attemptNumber} — {label(attempt.result)} ·{' '}
                    <code>{attempt.submittedMoveUci}</code>
                  </li>
                ))}
              </ol>
              <p className="help-text">
                Retries remain visible, but only the first scored attempt is a clean measurement for
                this exact exercise.
              </p>
              {directItemMode ? (
                <p>Your coach can include this result in a new learning snapshot.</p>
              ) : (
                <button disabled={loading} onClick={() => void refreshSkillGraph()}>
                  Include results in a new learning snapshot
                </button>
              )}
              <details className="advanced-panel compact-advanced">
                <summary>Advanced training evidence</summary>
                <p className="position-key">
                  Exact history <code>{activeItem.exactHistorySha256}</code>
                </p>
                {activeItem.trainingEvidence.map((evidence) => (
                  <div className="training-evidence" key={evidence.id}>
                    <strong>{evidence.conceptStableId}</strong>
                    <span>{evidence.polarity}</span>
                    <span>{evidence.resolvedEvidenceRole}</span>
                    <span>Concept library {evidence.ontologyVersion}</span>
                  </div>
                ))}
              </details>
            </details>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
