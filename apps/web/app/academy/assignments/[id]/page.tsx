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
  return value.toLowerCase().replaceAll('_', ' ');
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
    <section className="panel wide academy-page">
      {data ? (
        <a href={`/academy/students/${data.assignment.studentProfileId}?academyId=${academyId}`}>
          ← Student Intelligence
        </a>
      ) : null}
      {loading && !data ? <p>Loading assignment…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {data ? (
        <>
          <header className="academy-student-header">
            <div>
              <span className="eyebrow">Training Assignment</span>
              <h1>{data.assignment.studentDisplayName}</h1>
              <p>
                Assigned by {data.assignment.coachDisplayName} ·{' '}
                {new Date(data.assignment.assignedAt).toLocaleString()}
              </p>
            </div>
            <span className={`academy-freshness ${data.progress.status.toLowerCase()}`}>
              {label(data.progress.status)}
            </span>
          </header>
          <aside className="academy-security-note">
            <b>{data.authorizationStatus}</b>
            <span>Assignment workflow state is not mastery evidence.</span>
          </aside>

          <div className="academy-coverage-grid">
            <span>
              <b>{data.progress.completedItemCount}</b> / {data.progress.itemCount} completed
            </span>
            <span>
              <b>{data.progress.firstScoredCorrectItems}</b> first scored correct
            </span>
            <span>
              <b>{data.progress.firstScoredIncorrectItems}</b> first scored incorrect
            </span>
            <span>
              <b>{data.progress.overdue ? 'Yes' : 'No'}</b> overdue
            </span>
          </div>
          <div className="academy-assignment-metadata">
            <p>
              Plan <code>{data.assignment.trainingPlanRunId}</code>
            </p>
            <p>
              Baseline Skill Graph <code>{data.assignment.baselineSkillGraphRunId}</code>
            </p>
            <p>Due {data.assignment.dueAt ?? 'not set'}</p>
            <p>Note: {data.assignment.note ?? 'none'}</p>
          </div>

          <section className="academy-section">
            <h2>Immutable assigned items</h2>
            <div className="academy-assignment-items">
              {data.assignment.items.map((item) => (
                <article key={item.trainingItemId}>
                  <div>
                    <span>#{item.ordinal}</span>
                    <h3>{item.conceptStableId}</h3>
                    <p>
                      {label(item.trainingMode)} · {label(item.measurementStatus)}
                    </p>
                    {item.firstPostAssignmentAttempt ? (
                      <p>
                        First post-assignment attempt:{' '}
                        {label(item.firstPostAssignmentAttempt.result)} ·{' '}
                        {new Date(item.firstPostAssignmentAttempt.submittedAt).toLocaleString()}
                      </p>
                    ) : (
                      <p>Not attempted after assignment.</p>
                    )}
                    {item.postAssignmentAttemptCount > 1 ? (
                      <small>
                        {item.postAssignmentAttemptCount - 1} visible retries; no additional
                        completion.
                      </small>
                    ) : null}
                  </div>
                  <a className="button-link" href={`/training?item=${item.trainingItemId}`}>
                    Open in Training
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
