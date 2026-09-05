'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface AssignmentView {
  assignment: { id: string; dueAt: string | null };
  progress: { status: string; completedItems: number; totalItems: number };
  itemLinks: Array<{ trainingItemId: string; href: string }>;
}

interface AssignmentsResponse {
  assignments: AssignmentView[];
}

interface IntelligenceResponse {
  student: { displayName: string };
  player: { displayName: string };
  freshness: { status: string; newTrainingEvidenceCount: number };
  attentionSignals: string[];
}

export default function StudentHomePage() {
  const { academyId } = useParams<{ academyId: string }>();
  const [assignments, setAssignments] = useState<AssignmentsResponse | null>(null);
  const [intelligence, setIntelligence] = useState<IntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const profile = new URLSearchParams({
      ontologyVersion: '1.0.0',
      skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
      gameContexts: 'OTB',
      timeCategories: 'CLASSICAL',
    });
    void Promise.all([
      fetch(`${apiUrl}/academies/${academyId}/me/assignments`, { credentials: 'include' }),
      fetch(`${apiUrl}/academies/${academyId}/me/intelligence?${profile}`, {
        credentials: 'include',
      }),
    ])
      .then(async ([assignmentResponse, intelligenceResponse]) => {
        if (assignmentResponse.status === 401 || intelligenceResponse.status === 401) {
          window.location.assign('/login');
          return;
        }
        const assignmentBody = (await assignmentResponse.json()) as AssignmentsResponse & {
          error?: { message?: string };
        };
        const intelligenceBody = (await intelligenceResponse.json()) as IntelligenceResponse & {
          error?: { message?: string };
        };
        if (!assignmentResponse.ok || !intelligenceResponse.ok) {
          throw new Error(
            assignmentBody.error?.message ??
              intelligenceBody.error?.message ??
              'Student workspace is unavailable.',
          );
        }
        setAssignments(assignmentBody);
        setIntelligence(intelligenceBody);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Student workspace is unavailable.'),
      );
  }, [academyId]);

  return (
    <section className="panel wide academy-page">
      <p className="eyebrow">Student self-service</p>
      <h1>{intelligence?.student.displayName ?? 'My training'}</h1>
      <p>
        Player evidence is linked by the server from your authenticated StudentProfile. No Player or
        membership identity is accepted from this page.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {intelligence ? (
        <aside className="academy-security-note">
          <b>{intelligence.freshness.status}</b>
          <span>{intelligence.freshness.newTrainingEvidenceCount} new training evidence units</span>
        </aside>
      ) : null}
      <h2>My assignments</h2>
      <div className="academy-roster">
        {assignments?.assignments.map((view) => (
          <article className="academy-student-card" key={view.assignment.id}>
            <h3>{view.progress.status}</h3>
            <p>
              {view.progress.completedItems}/{view.progress.totalItems} completed
              {view.assignment.dueAt ? ` · due ${view.assignment.dueAt}` : ''}
            </p>
            <div className="home-actions">
              {view.itemLinks.map((item) => (
                <a
                  className="button-link"
                  href={`/training?item=${item.trainingItemId}`}
                  key={item.trainingItemId}
                >
                  Open training item
                </a>
              ))}
            </div>
          </article>
        ))}
        {assignments?.assignments.length === 0 ? <p>No active or historical assignments.</p> : null}
      </div>
    </section>
  );
}
