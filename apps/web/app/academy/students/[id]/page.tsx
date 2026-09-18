'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  GroundedBriefPanel,
  LearningIntelligencePanel,
  type ConceptEvidenceDetail,
  type CoverageReport,
  type GroundedBriefArtifact,
  type SkillGraph,
} from '../../../components/learning-intelligence';
import { recordPilotClientEvent } from '../../../components/pilot-client';

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
  pilotReadiness: {
    state:
      | 'READY'
      | 'READY_WITH_LOW_COVERAGE'
      | 'NOT_READY_NO_GAMES'
      | 'NOT_READY_NO_ANALYSIS'
      | 'NOT_READY_NO_SKILL_GRAPH';
    reason: string;
  };
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
  return value.toLowerCase().replaceAll('_', ' ').replaceAll('.', ' ');
}

export default function StudentIntelligencePage() {
  const parameters = useParams<{ id: string }>();
  const studentId = parameters.id;
  const [academyId, setAcademyId] = useState('');
  const [data, setData] = useState<StudentIntelligence | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [pageOpenInteractionId] = useState(() => crypto.randomUUID());
  const [skillGraph, setSkillGraph] = useState<SkillGraph | null>(null);
  const [coverageReport, setCoverageReport] = useState<CoverageReport | null>(null);
  const [brief, setBrief] = useState<GroundedBriefArtifact | null>(null);
  const [briefUnavailable, setBriefUnavailable] = useState<string | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
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
        void recordPilotClientEvent(apiUrl, academy, {
          eventType: 'COACH_OPENED_STUDENT_INTELLIGENCE',
          studentProfileId: studentId,
          ...(result.skillGraph ? { skillGraphRunId: result.skillGraph.run.id } : {}),
          interactionId: pageOpenInteractionId,
        });
        if (result.skillGraph) {
          const [graph, coverage] = await Promise.all([
            responseBody<SkillGraph>(
              await fetch(
                `${apiUrl}/academies/${academy}/students/${studentId}/skill-graph/${result.skillGraph.run.id}`,
                { credentials: 'include' },
              ),
            ),
            responseBody<CoverageReport>(
              await fetch(
                `${apiUrl}/intelligence/concept-coverage?ontologyVersion=${encodeURIComponent(result.profile.ontologyVersion)}`,
                { credentials: 'include' },
              ),
            ),
          ]);
          setSkillGraph(graph);
          setCoverageReport(coverage);
        } else {
          setSkillGraph(null);
          setCoverageReport(null);
        }
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
    [pageOpenInteractionId, studentId],
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
      await responseBody<{ assignment: { id: string } }>(
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
      setNotice('Assignment created. It will count only after a valid post-assignment attempt.');
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
      await responseBody<{ run: { id: string } }>(
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
      setNotice('Learning picture refreshed from the latest compatible evidence.');
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

  async function inspectConcept(stableId: string): Promise<ConceptEvidenceDetail> {
    if (!skillGraph) throw new Error('No compatible Skill Graph is available.');
    void recordPilotClientEvent(apiUrl, academyId, {
      eventType: 'COACH_OPENED_CONCEPT_EVIDENCE',
      studentProfileId: studentId,
      skillGraphRunId: skillGraph.run.id,
      conceptStableId: stableId,
    });
    return responseBody<ConceptEvidenceDetail>(
      await fetch(
        `${apiUrl}/academies/${academyId}/students/${studentId}/skill-graph/${skillGraph.run.id}/concepts/${encodeURIComponent(stableId)}`,
        { credentials: 'include' },
      ),
    );
  }

  async function createTrainingPlan(): Promise<void> {
    if (!skillGraph) return;
    setLoading(true);
    setError(null);
    try {
      await responseBody<{ run: { id: string } }>(
        await fetch(`${apiUrl}/academies/${academyId}/students/${studentId}/training-plans`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ skillGraphRunId: skillGraph.run.id, maxItems: 10 }),
        }),
      );
      setNotice('A new evidence-backed training plan is ready for assignment.');
      await load(academyId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the TrainingPlan.');
    } finally {
      setLoading(false);
    }
  }

  async function submitCoachFeedback(
    stableId: string,
    feedbackValue: 'AGREE' | 'UNSURE' | 'DISAGREE',
  ): Promise<void> {
    if (!skillGraph) return;
    await responseBody(
      await fetch(`${apiUrl}/academies/${academyId}/students/${studentId}/pilot/coach-feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          skillGraphRunId: skillGraph.run.id,
          conceptStableId: stableId,
          feedbackValue,
          interactionId: crypto.randomUUID(),
        }),
      }),
    );
  }

  async function submitAiFeedback(
    claimId: string,
    feedbackValue: 'USEFUL' | 'NOT_USEFUL',
    notUsefulReason:
      'INCORRECT' | 'TOO_VAGUE' | 'NOT_ACTIONABLE' | 'ALREADY_KNOWN' | 'OTHER' | null,
  ): Promise<void> {
    if (!brief) return;
    await responseBody(
      await fetch(
        `${apiUrl}/academies/${academyId}/students/${studentId}/ai-briefs/${brief.id}/claims/${encodeURIComponent(claimId)}/feedback`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            feedbackValue,
            notUsefulReason,
            interactionId: crypto.randomUUID(),
          }),
        },
      ),
    );
  }

  async function generateBrief(): Promise<void> {
    if (!skillGraph) return;
    setBriefBusy(true);
    setBriefUnavailable(null);
    try {
      const artifact = await responseBody<GroundedBriefArtifact>(
        await fetch(`${apiUrl}/academies/${academyId}/students/${studentId}/ai-briefs`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            skillGraphRunId: skillGraph.run.id,
            trainingPlanRunId: data?.trainingPlans[0]?.id ?? null,
          }),
        }),
      );
      setBrief(artifact);
    } catch (caught) {
      setBriefUnavailable(
        caught instanceof Error
          ? caught.message
          : 'AI briefing is unavailable. Structured intelligence remains available.',
      );
    } finally {
      setBriefBusy(false);
    }
  }

  return (
    <section className="student-intelligence-page" id="student-intelligence-top">
      <a className="back-link" href={`/academy?academyId=${academyId}`}>
        ← Coach home
      </a>
      {loading && !data ? <p>Loading verified student evidence…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      {data ? (
        <>
          <header className="academy-student-header">
            <div>
              <p className="context-line">Student intelligence</p>
              <h1>{data.student.displayName}</h1>
              <p>
                Chess record: {data.player.displayName}
                {data.player.fideId ? ` · FIDE ${data.player.fideId}` : ''}
              </p>
            </div>
            <div className="academy-signals">
              <span className="pilot-readiness">{label(data.pilotReadiness.state)}</span>
              {data.attentionSignals.map((signal) => (
                <span key={signal}>{label(signal)}</span>
              ))}
            </div>
          </header>

          <div className="student-summary-band">
            <div>
              <span>Current picture</span>
              <strong>{label(data.pilotReadiness.state)}</strong>
              <small>{data.pilotReadiness.reason}</small>
            </div>
            <div>
              <span>Recommended next action</span>
              <strong>
                {data.skillGraph
                  ? 'Review evidence, then assign focused training'
                  : 'Build the verified game and analysis record'}
              </strong>
              <small>No conclusion is drawn from missing evidence.</small>
            </div>
          </div>

          <section className="academy-section" id="compatible-skill-graph">
            <div className="section-heading">
              <div>
                <h2>Evidence coverage</h2>
                <p>How much of this learning picture is directly supported.</p>
              </div>
              {data.freshness.status === 'REFRESH_AVAILABLE' ? (
                <button disabled={loading} onClick={refreshSkillGraph}>
                  Include {data.freshness.newTrainingEvidenceCount} new training result
                  {data.freshness.newTrainingEvidenceCount === 1 ? '' : 's'}
                </button>
              ) : null}
            </div>
            {data.skillGraph ? (
              <>
                <div className="academy-coverage-grid detail evidence-funnel">
                  <span>
                    <b>{data.skillGraph.coverage.canonicalGames}</b> games reviewed
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.decisionOccurrences}</b> decisions found
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.classifiedDecisions}</b> concept-classified
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.engineBackedDecisions}</b> engine-verified
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.masteryEligibleEvidence}</b> model-eligible
                  </span>
                  <span>
                    <b>{data.skillGraph.coverage.trainingMeasurementUnits}</b> training results
                  </span>
                </div>
                <details className="advanced-panel compact-advanced">
                  <summary>Advanced evidence configuration</summary>
                  <p>Snapshot date {data.skillGraph.run.asOfDate}</p>
                  <p>
                    Run <code>{data.skillGraph.run.id}</code>
                  </p>
                  <p>
                    Concept library {data.profile.ontologyVersion} · learning model{' '}
                    {data.profile.skillGraphPolicyVersion}
                  </p>
                  <p>
                    {data.authorizationStatus} · Student profile and chess record remain separate
                    identities.
                  </p>
                </details>
              </>
            ) : (
              <p className="academy-empty">
                No compatible learning picture exists yet. Opening this page did not create or infer
                one.
              </p>
            )}
          </section>

          {skillGraph && coverageReport ? (
            <>
              <div className="pilot-intelligence-layout">
                <LearningIntelligencePanel
                  graph={skillGraph}
                  coverage={coverageReport}
                  audience="COACH"
                  onInspect={inspectConcept}
                  onCoachFeedback={submitCoachFeedback}
                />
                <div className="pilot-side-rail">
                  <GroundedBriefPanel
                    artifact={brief}
                    unavailable={briefUnavailable}
                    busy={briefBusy}
                    onGenerate={() => void generateBrief()}
                    onInspectConcept={inspectConcept}
                    onEvidenceOpen={(claimId, stableId, evidenceRef) => {
                      if (!brief) return;
                      void recordPilotClientEvent(apiUrl, academyId, {
                        eventType: 'COACH_OPENED_AI_CLAIM_EVIDENCE',
                        studentProfileId: studentId,
                        skillGraphRunId: skillGraph.run.id,
                        groundedAiArtifactId: brief.id,
                        groundedAiClaimId: claimId,
                        evidenceReference: evidenceRef,
                        ...(stableId ? { conceptStableId: stableId } : {}),
                      });
                    }}
                    onClaimFeedback={submitAiFeedback}
                  />
                  <section className="next-actions">
                    <h2>Move from evidence to practice</h2>
                    <ol>
                      <li>Inspect the exact game or training lineage.</li>
                      <li>Choose a diagnostic or practice item below.</li>
                      <li>Refresh the learning picture only after new evidence exists.</li>
                    </ol>
                  </section>
                  <section className="opening-context">
                    <span>Opening context</span>
                    <p>
                      Historical repertoire stays available as supporting context, not learning
                      truth.
                    </p>
                    <a href="/preparation">Open repertoire intelligence</a>
                  </section>
                </div>
              </div>
              <section className="recent-change" aria-labelledby="recent-change-title">
                <div>
                  <h2 id="recent-change-title">
                    {data.freshness.status === 'REFRESH_AVAILABLE'
                      ? 'New verified training evidence is ready to include'
                      : 'The learning picture matches the selected evidence snapshot'}
                  </h2>
                </div>
                <p>
                  {data.freshness.newTrainingEvidenceCount} new training unit
                  {data.freshness.newTrainingEvidenceCount === 1 ? '' : 's'} · comparison is only
                  shown when run identities remain compatible.
                </p>
              </section>
            </>
          ) : null}

          <section className="academy-section" id="training-history">
            <h2>Training activity</h2>
            <div className="academy-coverage-grid">
              <span>
                <b>{data.trainingSummary.trainingPlans}</b> plans
              </span>
              <span>
                <b>{data.trainingSummary.distinctScoredItems}</b> measured exercises
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
            <p>These counts describe activity and first attempts, not learning effectiveness.</p>
          </section>

          <section className="academy-section">
            <div className="section-heading">
              <div>
                <h2>Choose the next training</h2>
                <p>
                  Diagnostic items gather missing evidence. Practice items reinforce a verified
                  missed application.
                </p>
              </div>
              <button disabled={loading || !skillGraph} onClick={() => void createTrainingPlan()}>
                Prepare a training plan
              </button>
            </div>
            {data.trainingPlans.length ? (
              <form className="academy-assignment-form" onSubmit={createAssignment}>
                <label>
                  Evidence-backed plan
                  <select
                    value={selectedPlanId}
                    onChange={(event) => {
                      setSelectedPlanId(event.target.value);
                      setSelectedItemIds([]);
                    }}
                  >
                    {data.trainingPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {new Date(plan.createdAt).toLocaleDateString()} · {plan.items.length}{' '}
                        available items
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
                        <b>{label(item.conceptStableId)}</b> ·{' '}
                        {item.trainingMode === 'DIAGNOSTIC'
                          ? 'Diagnostic — gather evidence'
                          : 'Practice — reinforce a verified pattern'}
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
                  Note for the student (does not affect evidence)
                  <textarea name="note" maxLength={2000} />
                </label>
                <button disabled={loading || selectedItemIds.length === 0}>
                  Assign selected training
                </button>
              </form>
            ) : (
              <p className="academy-empty">
                No training plan is ready. Prepare one from the current verified learning picture.
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
              <div className="section-heading">
                <h2>Progress since assignment</h2>
                <a
                  href="#student-intelligence-top"
                  onClick={() => {
                    if (!data.skillGraph) return;
                    void recordPilotClientEvent(apiUrl, academyId, {
                      eventType: 'COACH_RETURNED_TO_STUDENT',
                      studentProfileId: studentId,
                      skillGraphRunId: data.skillGraph.run.id,
                    });
                  }}
                >
                  Return to student overview
                </a>
              </div>
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
                    Estimate movement is shown neutrally. It is not an automatic improvement or
                    regression label.
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
