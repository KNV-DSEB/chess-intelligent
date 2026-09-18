'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface ApiError {
  error?: { message?: string };
}

interface AssignmentResponse {
  authorizationStatus: string;
  assignment: {
    id: string;
    studentProfileId: string;
    studentDisplayName: string;
    playerId: string;
    coachDisplayName: string;
    trainingPlanRunId: string;
    baselineSkillGraphRunId: string;
    assignedAt: string;
    dueAt: string | null;
    cancelledAt: string | null;
    note: string | null;
    items: Array<{
      trainingItemId: string;
      conceptStableId: string;
      trainingMode: string;
      measurementStatus: string;
      ordinal: number;
      firstPostAssignmentAttempt: null | {
        result: 'CORRECT' | 'INCORRECT';
        submittedAt: string;
        attemptNumber: number;
      };
      postAssignmentAttemptCount: number;
    }>;
  };
  progress: {
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    overdue: boolean;
    itemCount: number;
    completedItemCount: number;
    firstScoredCorrectItems: number;
    firstScoredIncorrectItems: number;
  };
}

async function responseBody<Value>(response: Response): Promise<Value> {
  const body = (await response.json()) as Value & ApiError;
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
  return body;
}

function label(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replaceAll('.', ' ');
}

export default function AssignmentPage() {
  const parameters = useParams<{ id: string }>();
  const assignmentId = parameters.id;
  const [academyId, setAcademyId] = useState('');
  const [data, setData] = useState<AssignmentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (academy: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        setData(
          await responseBody<AssignmentResponse>(
            await fetch(`${apiUrl}/academies/${academy}/assignments/${assignmentId}`, {
              credentials: 'include',
            }),
          ),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load the assignment.');
      } finally {
        setLoading(false);
      }
    },
    [assignmentId],
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const academy = query.get('academyId') ?? '';
    setAcademyId(academy);
    if (academy) void load(academy);
  }, [load]);

  async function cancel(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setData(
        await responseBody<AssignmentResponse>(
          await fetch(`${apiUrl}/academies/${academyId}/assignments/${assignmentId}/cancel`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel the assignment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="assignment-page">
      {data ? (
        <a href={`/academy/students/${data.assignment.studentProfileId}?academyId=${academyId}`}>
          ← Student overview
        </a>
      ) : null}
      {loading && !data ? <p>Loading assignment…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {data ? (
        <>
          <header className="academy-student-header">
            <div>
              <p className="context-line">Training assignment</p>
              <h1>{data.assignment.studentDisplayName}’s next positions</h1>
              <p>
                Assigned by {data.assignment.coachDisplayName} ·{' '}
                {new Date(data.assignment.assignedAt).toLocaleString()}
              </p>
            </div>
            <span className={`academy-freshness ${data.progress.status.toLowerCase()}`}>
              {label(data.progress.status)}
            </span>
          </header>
          <p className="workspace-trust-line">
            Assignment progress is activity, not a mastery score.
          </p>

          <div className="academy-coverage-grid">
            <span>
              <b>{data.progress.completedItemCount}</b> / {data.progress.itemCount} completed
            </span>
            <span>
              <b>{data.progress.firstScoredCorrectItems}</b> first attempts correct
            </span>
            <span>
              <b>{data.progress.firstScoredIncorrectItems}</b> first attempts incorrect
            </span>
            <span>
              <b>{data.progress.overdue ? 'Yes' : 'No'}</b> overdue
            </span>
          </div>
          <div className="assignment-note">
            <p>Due {data.assignment.dueAt ?? 'not set'}</p>
            <p>Note: {data.assignment.note ?? 'none'}</p>
          </div>
          <details className="advanced-panel compact-advanced">
            <summary>Advanced assignment provenance</summary>
            <p>{data.authorizationStatus}</p>
            <p>
              Plan <code>{data.assignment.trainingPlanRunId}</code>
            </p>
            <p>
              Baseline learning snapshot <code>{data.assignment.baselineSkillGraphRunId}</code>
            </p>
          </details>

          <section className="academy-section">
            <h2>Assigned positions</h2>
            <div className="academy-assignment-items">
              {data.assignment.items.map((item) => (
                <article key={item.trainingItemId}>
                  <div>
                    <span>#{item.ordinal}</span>
                    <h3>{label(item.conceptStableId)}</h3>
                    <p>
                      {item.trainingMode === 'DIAGNOSTIC'
                        ? 'Diagnostic — gather evidence'
                        : 'Practice — reinforce a verified pattern'}{' '}
                      · {label(item.measurementStatus)}
                    </p>
                    {item.firstPostAssignmentAttempt ? (
                      <p>
                        First scored attempt: {label(item.firstPostAssignmentAttempt.result)} ·{' '}
                        {new Date(item.firstPostAssignmentAttempt.submittedAt).toLocaleString()}
                      </p>
                    ) : (
                      <p>Waiting for the first attempt.</p>
                    )}
                    {item.postAssignmentAttemptCount > 1 ? (
                      <small>
                        {item.postAssignmentAttemptCount - 1} retries are visible but do not add
                        another completion.
                      </small>
                    ) : null}
                  </div>
                  <a className="button-link" href={`/training?item=${item.trainingItemId}`}>
                    Open position
                  </a>
                </article>
              ))}
            </div>
          </section>

          {data.progress.status === 'ACTIVE' ? (
            <button className="secondary-button" disabled={loading} onClick={cancel}>
              Cancel assignment
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
