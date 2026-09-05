'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { AcademyAdministration } from './academy-administration';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface ApiError {
  error?: { message?: string };
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
  students: Array<{
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
  }>;
}

async function responseBody<Value>(response: Response): Promise<Value> {
  const body = (await response.json()) as Value & ApiError;
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
  return body;
}

function label(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

export default function AcademyPage() {
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [academyId, setAcademyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setAcademyId(query.get('academyId') ?? '');
  }, []);

  async function loadRoster(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    if (!academyId) return;
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
        await fetch(`${apiUrl}/academies/${academyId}/roster?${query}`, {
          credentials: 'include',
        }),
      );
      setRoster(result);
      window.history.replaceState(null, '', `/academy?academyId=${academyId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the roster.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel wide academy-page">
      <span className="eyebrow">Coach / Student Intelligence V1</span>
      <h1>Academy roster and evidence-backed learning workflow</h1>
      <p>
        Students are Academy profiles linked to canonical Players. This dashboard selects one
        explicit compatible Skill Graph profile and never ranks learners or treats missing evidence
        as weakness.
      </p>

      <form className="academy-context-form" onSubmit={loadRoster}>
        <label>
          Academy ID
          <input
            value={academyId}
            onChange={(event) => setAcademyId(event.target.value)}
            required
          />
        </label>
        <button disabled={loading}>{loading ? 'Loading…' : 'Open academy roster'}</button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {roster ? (
        <>
          <aside className="academy-security-note">
            <b>{roster.authorizationStatus}</b>
            <span>
              The server derives your acting membership from the authenticated session and applies
              Academy RBAC before returning this tenant-scoped roster.
            </span>
          </aside>
          <div className="academy-profile-strip">
            <span>Ontology {roster.profile.ontologyVersion}</span>
            <span>{roster.profile.skillGraphPolicyVersion}</span>
            <code title={roster.profile.policyConfigSha256}>
              policy {roster.profile.policyConfigSha256.slice(0, 10)}…
            </code>
            <code title={roster.profile.evidenceScopeSha256}>
              scope {roster.profile.evidenceScopeSha256.slice(0, 10)}…
            </code>
          </div>
          <div className="section-heading">
            <div>
              <h2>Students</h2>
              <p>{roster.pagination.total} Academy-scoped StudentProfiles</p>
            </div>
          </div>
          <div className="academy-roster">
            {roster.students.map((entry) => {
              const href = `/academy/students/${entry.student.id}?academyId=${academyId}`;
              return (
                <article className="academy-student-card" key={entry.student.id}>
                  <header>
                    <div>
                      <h3>{entry.student.displayName}</h3>
                      <p>
                        Player: {entry.student.playerDisplayName}
                        {entry.student.fideId ? ` · FIDE ${entry.student.fideId}` : ''}
                      </p>
                    </div>
                    <a className="button-link" href={href}>
                      Open intelligence
                    </a>
                  </header>
                  {entry.skillGraph ? (
                    <div className="academy-coverage-grid">
                      <span>
                        <b>{entry.skillGraph.coverage.canonicalGames}</b> games
                      </span>
                      <span>
                        <b>{entry.skillGraph.coverage.classifiedDecisions}</b> classified decisions
                      </span>
                      <span>
                        <b>{entry.skillGraph.coverage.masteryEligibleEvidence}</b> mastery evidence
                      </span>
                      <span>
                        <b>{entry.skillGraph.coverage.trainingMeasurementUnits}</b> training units
                      </span>
                    </div>
                  ) : (
                    <p className="academy-empty">No compatible Skill Graph for this profile.</p>
                  )}
                  <div className="academy-card-footer">
                    <span className={`academy-freshness ${entry.freshness.status.toLowerCase()}`}>
                      {label(entry.freshness.status)}
                    </span>
                    <span>
                      Last training:{' '}
                      {entry.lastTrainingAt
                        ? new Date(entry.lastTrainingAt).toLocaleDateString()
                        : 'none'}
                    </span>
                    <span>
                      Assignment:{' '}
                      {entry.activeAssignment
                        ? `${entry.activeAssignment.completedItemCount}/${entry.activeAssignment.itemCount}`
                        : 'none active'}
                    </span>
                  </div>
                  {entry.attentionSignals.length ? (
                    <div className="academy-signals">
                      {entry.attentionSignals.map((signal) => (
                        <span key={signal}>{label(signal)}</span>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <AcademyAdministration academyId={academyId} />
        </>
      ) : null}
    </section>
  );
}
