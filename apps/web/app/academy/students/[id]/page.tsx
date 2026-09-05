'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface ApiError {
  error?: { message?: string };
}

interface TrainingPlan {
  id: string;
  skillGraphRunId: string;
  ontologyVersion: string;
  createdAt: string;
  items: Array<{
    id: string;
    conceptStableId: string;
    trainingMode: 'REMEDIATION' | 'DIAGNOSTIC';
    previouslyScored: boolean;
    assignmentMeasurementStatus: string | null;
    assignmentRejection: string | null;
  }>;
}

interface AssignmentView {
  assignment: {
    id: string;
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

interface StudentIntelligence {
  authorizationStatus: string;
  profile: {
    ontologyVersion: string;
    skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V1' | 'SKILL_GRAPH_POLICY_V2';
    evidenceScope: {
      gameContexts: string[];
      timeCategories: string[];
      sourceTypes: string[];
      playedFrom: string | null;
      playedTo: string | null;
    };
  };
  student: { id: string; displayName: string };
  player: { id: string; displayName: string; fideId: string | null };
  skillGraph: null | {
    run: {
      id: string;
      ontologyVersion: string;
      skillGraphPolicyVersion: string;
      policyConfigSha256: string;
      evidenceScope: Record<string, unknown>;
      asOfDate: string;
      completedAt: string;
    };
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
  freshness: {
    status: 'CURRENT' | 'REFRESH_AVAILABLE' | 'NO_COMPATIBLE_GRAPH';
    newTrainingEvidenceCount: number;
    newGameEvidenceCount: number | null;
  };
  trainingSummary: {
    trainingPlans: number;
    distinctScoredItems: number;
    attemptCount: number;
    firstAttemptCorrect: number;
    firstAttemptIncorrect: number;
    diagnosticItems: number;
    remediationItems: number;
    lastTrainingAt: string | null;
  };
  trainingPlans: TrainingPlan[];
  assignments: AssignmentView[];
  attentionSignals: string[];
}

interface ProgressResponse {
  comparisonStatus: 'COMPARABLE' | 'NOT_COMPARABLE';
  comparabilityReasons: string[];
  coverageDelta: null | {
    canonicalGameDelta: number;
    masteryEligibleEvidenceDelta: number;
    trainingIndependentUnitDelta: number;
  };
  conceptTransitions: Array<{
    conceptStableId: string;
    fromStatus: string | null;
    toStatus: string | null;
    posteriorDelta: number | null;
    effectiveEvidenceMassDelta: number;
    fromEvidenceConfidence: string | null;
    toEvidenceConfidence: string | null;
    transition: string;
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

export default function StudentIntelligencePage() {
  const parameters = useParams<{ id: string }>();
  const studentId = parameters.id;
  const [academyId, setAcademyId] = useState('');
  const [data, setData] = useState<StudentIntelligence | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (academy: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          ontologyVersion: '1.0.0',
          skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
          gameContexts: 'OTB',
          timeCategories: 'CLASSICAL',
        });
        const result = await responseBody<StudentIntelligence>(
          await fetch(
            `${apiUrl}/academies/${academy}/students/${studentId}/intelligence?${query}`,
            {
              credentials: 'include',
            },
          ),
        );
        setData(result);
        setSelectedPlanId((current) =>
          result.trainingPlans.some((plan) => plan.id === current)
            ? current
            : (result.trainingPlans[0]?.id ?? ''),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load Student Intelligence.');
      } finally {
        setLoading(false);
      }
    },
    [studentId],
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const academy = query.get('academyId') ?? '';
    setAcademyId(academy);
    if (academy) void load(academy);
  }, [load]);

  const selectedPlan = data?.trainingPlans.find((plan) => plan.id === selectedPlanId) ?? null;

  async function createAssignment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPlan || selectedItemIds.length === 0) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData(event.currentTarget);
      const created = await responseBody<{ assignment: { id: string } }>(
        await fetch(`${apiUrl}/academies/${academyId}/assignments`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            studentProfileId: studentId,
            trainingPlanRunId: selectedPlan.id,
            baselineSkillGraphRunId: selectedPlan.skillGraphRunId,
            trainingItemIds: selectedItemIds,
            dueAt: String(form.get('dueAt') ?? '') || null,
            note: String(form.get('note') ?? '').trim() || null,
          }),
        }),
      );
      setSelectedItemIds([]);
      setNotice(`Assignment ${created.assignment.id} created without creating mastery evidence.`);
      await load(academyId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the assignment.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshSkillGraph(): Promise<void> {
    if (!data?.skillGraph) return;
    setLoading(true);
    setError(null);
    try {
      const refreshed = await responseBody<{ run: { id: string } }>(
        await fetch(`${apiUrl}/academies/${academyId}/students/${studentId}/skill-graph`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ontologyVersion: data.profile.ontologyVersion,
            skillGraphPolicyVersion: data.profile.skillGraphPolicyVersion,
            scope: data.profile.evidenceScope,
            asOfDate: new Date().toISOString().slice(0, 10),
          }),
        }),
      );
      setNotice(`Explicit Skill Graph run ${refreshed.run.id} created.`);
      await load(academyId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh the Skill Graph.');
    } finally {
      setLoading(false);
    }
  }

  async function compare(assignment: AssignmentView): Promise<void> {
    if (!data?.skillGraph) return;
    setLoading(true);
    setError(null);
    try {
      setProgress(
        await responseBody<ProgressResponse>(
          await fetch(`${apiUrl}/intelligence/student-progress`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              academyId,
              studentProfileId: studentId,
              fromSkillGraphRunId: assignment.assignment.baselineSkillGraphRunId,
              toSkillGraphRunId: data.skillGraph.run.id,
            }),
          }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not compare Skill Graph runs.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel wide academy-page">
      <a href={`/academy?academyId=${academyId}`}>← Academy roster</a>
      {loading && !data ? <p>Loading Student Intelligence…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      {data ? (
        <>
          <header className="academy-student-header">
            <div>
              <span className="eyebrow">Student Intelligence</span>
              <h1>{data.student.displayName}</h1>
              <p>
                Canonical Player: {data.player.displayName}
                {data.player.fideId ? ` · FIDE ${data.player.fideId}` : ''}
              </p>
            </div>
            <div className="academy-signals">
              {data.attentionSignals.map((signal) => (
                <span key={signal}>{label(signal)}</span>
              ))}
            </div>
          </header>

          <aside className="academy-security-note">
            <b>{data.authorizationStatus}</b>
            <span>StudentProfile and Player remain separate identities.</span>
          </aside>

          <section className="academy-section">
            <div className="section-heading">
              <div>
                <h2>Compatible Skill Graph</h2>
                <p>
                  {data.profile.ontologyVersion} · {data.profile.skillGraphPolicyVersion}
                </p>
              </div>
              {data.freshness.status === 'REFRESH_AVAILABLE' ? (
                <button disabled={loading} onClick={refreshSkillGraph}>
                  Refresh explicitly ({data.freshness.newTrainingEvidenceCount} new units)
                </button>
              ) : null}
            </div>
            {data.skillGraph ? (
              <>
                <div className="academy-coverage-grid detail">
                  <span>
                    <b>{data.skillGraph.coverage.canonicalGames}</b> canonical games
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.decisionOccurrences}</b> decisions
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.classifiedDecisions}</b> classified
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.engineBackedDecisions}</b> engine-backed
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.masteryEligibleEvidence}</b> mastery evidence
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.trainingMeasurementUnits}</b> training units
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.estimatedConcepts}</b> estimated concepts
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.insufficientConcepts}</b> insufficient
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.noEvidenceConcepts}</b> no evidence
                  </span>
                </div>
                <p className="academy-run-id">
                  Run <code>{data.skillGraph.run.id}</code> · as of {data.skillGraph.run.asOfDate}
                </p>
              </>
            ) : (
              <p className="academy-empty">
                No compatible graph. Opening this page did not create one.
              </p>
            )}
          </section>

          <section className="academy-section">
            <h2>Training history</h2>
            <div className="academy-coverage-grid">
              <span>
                <b>{data.trainingSummary.trainingPlans}</b> plans
              </span>
              <span>
                <b>{data.trainingSummary.distinctScoredItems}</b> measured items
              </span>
              <span>
                <b>{data.trainingSummary.attemptCount}</b> attempts including retries
              </span>
              <span>
                <b>{data.trainingSummary.firstAttemptCorrect}</b> first correct
              </span>
              <span>
                <b>{data.trainingSummary.firstAttemptIncorrect}</b> first incorrect
              </span>
            </div>
            <p>These are training-performance counts, not mastery accuracy.</p>
          </section>

          <section className="academy-section">
            <h2>Create assignment from an immutable TrainingPlan</h2>
            {data.trainingPlans.length ? (
              <form className="academy-assignment-form" onSubmit={createAssignment}>
                <label>
                  Training plan
                  <select
                    value={selectedPlanId}
                    onChange={(event) => {
                      setSelectedPlanId(event.target.value);
                      setSelectedItemIds([]);
                    }}
                  >
                    {data.trainingPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.id.slice(0, 8)} · baseline {plan.skillGraphRunId.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="academy-item-picker">
                  {selectedPlan?.items.map((item) => (
                    <label className={item.assignmentRejection ? 'disabled' : ''} key={item.id}>
                      <input
                        type="checkbox"
                        disabled={Boolean(item.assignmentRejection)}
                        checked={selectedItemIds.includes(item.id)}
                        onChange={(event) =>
                          setSelectedItemIds((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />
                      <span>
                        <b>{item.conceptStableId}</b> · {label(item.trainingMode)}
                        <small>
                          {item.assignmentRejection
                            ? label(item.assignmentRejection)
                            : label(item.assignmentMeasurementStatus ?? '')}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <label>
                  Due date (optional)
                  <input name="dueAt" type="date" />
                </label>
                <label>
                  Operational note (not concept evidence)
                  <textarea name="note" maxLength={2000} />
                </label>
                <button disabled={loading || selectedItemIds.length === 0}>
                  Create assignment
                </button>
              </form>
            ) : (
              <p className="academy-empty">
                No existing TrainingPlan is available. Plans are never generated by this read page.
              </p>
            )}
          </section>

          <section className="academy-section">
            <h2>Assignments</h2>
            <div className="academy-assignment-list">
              {data.assignments.map((assignment) => (
                <article key={assignment.assignment.id}>
                  <header>
                    <div>
                      <b>{label(assignment.progress.status)}</b>
                      <span>
                        {assignment.progress.completedItemCount}/{assignment.progress.itemCount}{' '}
                        completed · {assignment.progress.firstScoredCorrectItems} correct ·{' '}
                        {assignment.progress.firstScoredIncorrectItems} incorrect
                      </span>
                    </div>
                    <a
                      href={`/academy/assignments/${assignment.assignment.id}?academyId=${academyId}`}
                    >
                      Assignment details
                    </a>
                  </header>
                  <div className="academy-assignment-actions">
                    {data.skillGraph &&
                    assignment.assignment.baselineSkillGraphRunId !== data.skillGraph.run.id ? (
                      <button disabled={loading} onClick={() => compare(assignment)}>
                        Compare baseline → current graph
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {data.assignments.length === 0 ? <p>No assignment history.</p> : null}
            </div>
          </section>

          {progress ? (
            <section className="academy-section academy-progress">
              <h2>Comparable progress review</h2>
              <p>
                Status: <b>{label(progress.comparisonStatus)}</b>
              </p>
              {progress.comparisonStatus === 'NOT_COMPARABLE' ? (
                <p>{progress.comparabilityReasons.map(label).join(', ')}</p>
              ) : (
                <>
                  <div className="academy-coverage-grid">
                    <span>
                      <b>{progress.coverageDelta?.canonicalGameDelta}</b> game delta
                    </span>
                    <span>
                      <b>{progress.coverageDelta?.masteryEligibleEvidenceDelta}</b> evidence delta
                    </span>
                    <span>
                      <b>{progress.coverageDelta?.trainingIndependentUnitDelta}</b> training-unit
                      delta
                    </span>
                  </div>
                  <div className="academy-transition-list">
                    {progress.conceptTransitions
                      .filter(
                        (transition) =>
                          transition.transition !== 'UNCHANGED' ||
                          transition.effectiveEvidenceMassDelta !== 0,
                      )
                      .map((transition) => (
                        <div key={transition.conceptStableId}>
                          <b>{transition.conceptStableId}</b>
                          <span>
                            {label(transition.fromStatus ?? 'absent')} →{' '}
                            {label(transition.toStatus ?? 'absent')}
                          </span>
                          <span>
                            Evidence mass Δ {transition.effectiveEvidenceMassDelta.toFixed(3)}
                          </span>
                          <span>
                            Confidence {label(transition.fromEvidenceConfidence ?? 'none')} →{' '}
                            {label(transition.toEvidenceConfidence ?? 'none')}
                          </span>
                        </div>
                      ))}
                  </div>
                  <p>
                    Posterior movement is an estimate change, not an automatic
                    improvement/regression label.
                  </p>
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
