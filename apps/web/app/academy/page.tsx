'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { AcademyAdministration } from './academy-administration';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface ApiError {
  error?: { message?: string };
}

interface StudentRosterEntry {
  student: {
    id: string;
    displayName: string;
    playerId: string;
    playerDisplayName: string;
    fideId: string | null;
  };
  skillGraph: null | {
    id: string;
    asOfDate: string;
    skillGraphPolicyVersion: string;
    coverage: {
      canonicalGames: number;
      decisionOccurrences: number;
      classifiedDecisions: number;
      engineBackedDecisions: number;
      masteryEligibleEvidence: number;
      trainingMeasurementUnits: number;
      estimatedConcepts: number;
      insufficientConcepts: number;
      noEvidenceConcepts: number;
    };
  };
  freshness: { status: string; newTrainingEvidenceCount: number };
  activeAssignment: null | {
    id: string;
    dueAt: string | null;
    itemCount: number;
    completedItemCount: number;
  };
  lastTrainingAt: string | null;
  attentionSignals: string[];
}

interface RosterResponse {
  authorizationStatus: string;
  profile: {
    ontologyVersion: string;
    skillGraphPolicyVersion: string;
    policyConfigSha256: string;
    evidenceScopeSha256: string;
  };
  pagination: { limit: number; offset: number; total: number };
  students: StudentRosterEntry[];
}

async function responseBody<Value>(response: Response): Promise<Value> {
  const body = (await response.json()) as Value & ApiError;
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
  return body;
}

function words(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replaceAll('.', ' ');
}

function freshnessLabel(value: string): string {
  if (value === 'CURRENT') return 'Evidence current';
  if (value === 'REFRESH_AVAILABLE') return 'New evidence to review';
  return 'Learning picture not ready';
}

export default function AcademyPage() {
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [academyId, setAcademyId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRosterFor = useCallback(async (targetAcademyId: string): Promise<void> => {
    if (!targetAcademyId) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        ontologyVersion: '1.0.0',
        skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
        gameContexts: 'OTB',
        timeCategories: 'CLASSICAL',
        limit: '50',
        offset: '0',
      });
      const result = await responseBody<RosterResponse>(
        await fetch(`${apiUrl}/academies/${targetAcademyId}/roster?${query}`, {
          credentials: 'include',
        }),
      );
      setRoster(result);
      window.history.replaceState(null, '', `/academy?academyId=${targetAcademyId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The academy workspace could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedAcademyId = query.get('academyId') ?? '';
    setAcademyId(requestedAcademyId);
    if (requestedAcademyId) void loadRosterFor(requestedAcademyId);
  }, [loadRosterFor]);

  async function loadRoster(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    await loadRosterFor(academyId);
  }

  const visibleStudents = useMemo(() => {
    if (!roster) return [];
    const query = search.trim().toLowerCase();
    if (!query) return roster.students;
    return roster.students.filter((entry) =>
      `${entry.student.displayName} ${entry.student.playerDisplayName} ${entry.student.fideId ?? ''}`
        .toLowerCase()
        .includes(query),
    );
  }, [roster, search]);
  const focusStudents = roster?.students.filter(
    (entry) =>
      entry.attentionSignals.length > 0 ||
      !entry.skillGraph ||
      entry.freshness.status === 'REFRESH_AVAILABLE' ||
      (entry.activeAssignment !== null &&
        entry.activeAssignment.completedItemCount < entry.activeAssignment.itemCount),
  );
  const activeAssignments = roster?.students.filter((entry) => entry.activeAssignment) ?? [];
  const completedItems = activeAssignments.reduce(
    (total, entry) => total + (entry.activeAssignment?.completedItemCount ?? 0),
    0,
  );
  const assignedItems = activeAssignments.reduce(
    (total, entry) => total + (entry.activeAssignment?.itemCount ?? 0),
    0,
  );

  return (
    <section className="coach-workspace" id="coach-home">
      <header className="coach-home-hero">
        <div>
          <p className="context-line">Coach workspace</p>
          <h1>See who needs your eye today.</h1>
          <p>
            Start with an actionable signal, open the exact evidence, then assign one focused next
            step. Missing evidence stays unknown.
          </p>
        </div>
        {roster ? (
          <div className="coach-day-note">
            <span>
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <strong>{focusStudents?.length ?? 0} students to review</strong>
            <small>{activeAssignments.length} active assignments</small>
          </div>
        ) : null}
      </header>

      <form
        className={`academy-context-form${roster ? ' context-loaded' : ''}`}
        onSubmit={loadRoster}
      >
        <label>
          Academy workspace
          <input
            value={academyId}
            onChange={(event) => setAcademyId(event.target.value)}
            placeholder="Academy ID"
            required
          />
        </label>
        <button disabled={loading}>{loading ? 'Opening workspace…' : 'Open workspace'}</button>
      </form>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {roster ? (
        <>
          <div className="workspace-trust-line">
            <span aria-hidden="true">✓</span>
            <p>Signed-in academy scope verified. Student and player identities remain separate.</p>
          </div>

          <section className="coach-focus" aria-labelledby="coach-focus-title">
            <div className="folio-heading">
              <div>
                <h2 id="coach-focus-title">Needs your attention</h2>
                <p>Actionable workflow signals only—never a ranking by mastery.</p>
              </div>
              <Link className="text-link" href="#students">
                View all students
              </Link>
            </div>
            <div className="focus-ledger">
              {(focusStudents ?? []).slice(0, 5).map((entry) => (
                <article className="focus-row" key={entry.student.id}>
                  <div className="student-initial" aria-hidden="true">
                    {entry.student.displayName.slice(0, 1)}
                  </div>
                  <div>
                    <h3>{entry.student.displayName}</h3>
                    <p>
                      {entry.attentionSignals[0]
                        ? words(entry.attentionSignals[0])
                        : freshnessLabel(entry.freshness.status)}
                    </p>
                  </div>
                  <div className="focus-evidence">
                    <strong>{entry.skillGraph?.coverage.canonicalGames ?? 0}</strong>
                    <span>games in view</span>
                  </div>
                  <Link
                    className="button-link compact"
                    href={`/academy/students/${entry.student.id}?academyId=${academyId}`}
                  >
                    Review
                  </Link>
                </article>
              ))}
              {(focusStudents?.length ?? 0) === 0 ? (
                <p className="empty-note">No current workflow signal needs attention.</p>
              ) : null}
            </div>
          </section>

          <section className="coach-section" id="students" aria-labelledby="students-title">
            <div className="folio-heading">
              <div>
                <h2 id="students-title">Students</h2>
                <p>{roster.pagination.total} academy learners in this workspace.</p>
              </div>
              <label className="student-search">
                <span className="sr-only">Search students</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search students"
                />
              </label>
            </div>
            <div className="student-ledger" role="list">
              {visibleStudents.map((entry) => (
                <article className="academy-student-card" role="listitem" key={entry.student.id}>
                  <div className="student-ledger-identity">
                    <div className="student-initial" aria-hidden="true">
                      {entry.student.displayName.slice(0, 1)}
                    </div>
                    <div>
                      <h3>{entry.student.displayName}</h3>
                      <p>
                        {entry.student.playerDisplayName}
                        {entry.student.fideId ? ` · FIDE ${entry.student.fideId}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="student-ledger-state">
                    <span
                      className={`evidence-state ${entry.skillGraph ? 'estimated' : 'unknown'}`}
                    >
                      {freshnessLabel(entry.freshness.status)}
                    </span>
                    <small>
                      {entry.skillGraph
                        ? `${entry.skillGraph.coverage.masteryEligibleEvidence} eligible evidence rows`
                        : 'No compatible evidence snapshot'}
                    </small>
                  </div>
                  <div className="student-ledger-assignment">
                    <strong>
                      {entry.activeAssignment
                        ? `${entry.activeAssignment.completedItemCount}/${entry.activeAssignment.itemCount}`
                        : '—'}
                    </strong>
                    <span>
                      {entry.activeAssignment ? 'assignment progress' : 'no active assignment'}
                    </span>
                  </div>
                  <Link
                    className="text-link"
                    href={`/academy/students/${entry.student.id}?academyId=${academyId}`}
                  >
                    Open student →
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section
            className="coach-section split-section"
            id="training"
            aria-labelledby="training-title"
          >
            <div>
              <h2 id="training-title">Training in motion</h2>
              <p>
                Assignments are operational practice; they do not become mastery evidence until a
                valid attempt exists.
              </p>
            </div>
            <div className="score-sheet-list">
              {activeAssignments.map((entry) => (
                <div key={entry.student.id}>
                  <span>{entry.student.displayName}</span>
                  <strong>
                    {entry.activeAssignment!.completedItemCount}/{entry.activeAssignment!.itemCount}
                  </strong>
                  <Link
                    href={`/academy/assignments/${entry.activeAssignment!.id}?academyId=${academyId}`}
                  >
                    Open
                  </Link>
                </div>
              ))}
              {activeAssignments.length === 0 ? (
                <p className="empty-note">No active assignments.</p>
              ) : null}
            </div>
          </section>

          <section
            className="coach-section split-section"
            id="progress"
            aria-labelledby="progress-title"
          >
            <div>
              <h2 id="progress-title">Progress review</h2>
              <p>Completion is shown as activity, not learning effectiveness.</p>
            </div>
            <div className="progress-notation">
              <strong>
                {completedItems}/{assignedItems || 0}
              </strong>
              <span>assigned items completed</span>
              <small>Open a student to compare only compatible evidence snapshots.</small>
            </div>
          </section>

          <details className="advanced-panel">
            <summary>Academy settings and evidence configuration</summary>
            <p>{roster.authorizationStatus}</p>
            <div className="academy-profile-strip">
              <span>Concept library {roster.profile.ontologyVersion}</span>
              <span>
                Learning model{' '}
                {roster.profile.skillGraphPolicyVersion.replace('SKILL_GRAPH_POLICY_', '')}
              </span>
              <code title={roster.profile.policyConfigSha256}>
                Configuration {roster.profile.policyConfigSha256.slice(0, 10)}…
              </code>
              <code title={roster.profile.evidenceScopeSha256}>
                Evidence scope {roster.profile.evidenceScopeSha256.slice(0, 10)}…
              </code>
            </div>
            <AcademyAdministration academyId={academyId} />
          </details>
        </>
      ) : null}
    </section>
  );
}
