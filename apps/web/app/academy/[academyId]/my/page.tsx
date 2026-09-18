'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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

interface AssignmentView {
  assignment: {
    id: string;
    dueAt: string | null;
    items: Array<{
      trainingItemId: string;
      conceptStableId: string;
      trainingMode: string;
      measurementStatus: string;
    }>;
  };
  progress: { status: string; completedItemCount: number; itemCount: number };
  itemLinks: Array<{ trainingItemId: string; href: string }>;
}

interface AssignmentsResponse {
  assignments: AssignmentView[];
}

interface IntelligenceResponse {
  student: { id: string; displayName: string };
  player: { displayName: string };
  freshness: { status: string; newTrainingEvidenceCount: number };
  attentionSignals: string[];
  skillGraph: null | { run: { id: string } };
  trainingPlans: Array<{ id: string }>;
  pilotReadiness: {
    state:
      | 'READY'
      | 'READY_WITH_LOW_COVERAGE'
      | 'NOT_READY_NO_GAMES'
      | 'NOT_READY_NO_ANALYSIS'
      | 'NOT_READY_NO_SKILL_GRAPH';
  };
}

type LearningLoadState = 'LOADING' | 'READY' | 'UNKNOWN' | 'ERROR';

function label(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replaceAll('.', ' ');
}

export default function StudentHomePage() {
  const { academyId } = useParams<{ academyId: string }>();
  const [assignments, setAssignments] = useState<AssignmentsResponse | null>(null);
  const [intelligence, setIntelligence] = useState<IntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skillGraph, setSkillGraph] = useState<SkillGraph | null>(null);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [learningLoadState, setLearningLoadState] = useState<LearningLoadState>('LOADING');
  const [learningError, setLearningError] = useState<string | null>(null);
  const [brief, setBrief] = useState<GroundedBriefArtifact | null>(null);
  const [briefStatus, setBriefStatus] = useState<string | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);

  useEffect(() => {
    setLearningLoadState('LOADING');
    setLearningError(null);
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
        if (intelligenceBody.skillGraph) {
          try {
            const [graphResponse, coverageResponse] = await Promise.all([
              fetch(
                `${apiUrl}/academies/${academyId}/me/skill-graph/${intelligenceBody.skillGraph.run.id}`,
                { credentials: 'include' },
              ),
              fetch(`${apiUrl}/intelligence/concept-coverage?ontologyVersion=1.0.0`, {
                credentials: 'include',
              }),
            ]);
            if (graphResponse.status === 401 || coverageResponse.status === 401) {
              window.location.assign('/login');
              return;
            }
            const graphBody = (await graphResponse.json()) as SkillGraph & {
              error?: { message?: string };
            };
            const coverageBody = (await coverageResponse.json()) as CoverageReport & {
              error?: { message?: string };
            };
            if (!graphResponse.ok || !coverageResponse.ok) {
              throw new Error(
                graphBody.error?.message ??
                  coverageBody.error?.message ??
                  'Verified learning evidence could not be loaded.',
              );
            }
            setSkillGraph(graphBody);
            setCoverage(coverageBody);
            setLearningLoadState('READY');
          } catch (caught) {
            setSkillGraph(null);
            setCoverage(null);
            setLearningLoadState('ERROR');
            setLearningError(
              caught instanceof Error
                ? caught.message
                : 'Verified learning evidence could not be loaded.',
            );
          }
        } else {
          setSkillGraph(null);
          setCoverage(null);
          setLearningLoadState('UNKNOWN');
        }
      })
      .catch((caught: unknown) => {
        const message =
          caught instanceof Error ? caught.message : 'Student workspace is unavailable.';
        setError(message);
        setLearningLoadState('ERROR');
        setLearningError('The learning service did not load; no evidence conclusion was made.');
      });
  }, [academyId]);

  async function inspectConcept(stableId: string) {
    if (!skillGraph) throw new Error('No compatible Skill Graph is loaded.');
    const response = await fetch(
      `${apiUrl}/academies/${academyId}/me/skill-graph/${skillGraph.run.id}/concepts/${encodeURIComponent(stableId)}`,
      { credentials: 'include' },
    );
    const body = (await response.json()) as ConceptEvidenceDetail & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.message ?? 'Cited evidence is unavailable.');
    }
    return body;
  }

  async function generateBrief(): Promise<void> {
    if (!skillGraph) return;
    setBriefBusy(true);
    setBriefStatus(null);
    try {
      const response = await fetch(`${apiUrl}/academies/${academyId}/me/ai-briefs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          skillGraphRunId: skillGraph.run.id,
          trainingPlanRunId: intelligence?.trainingPlans[0]?.id ?? null,
        }),
      });
      const body = (await response.json()) as GroundedBriefArtifact & {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? 'AI briefing is unavailable. Your training still works.',
        );
      }
      setBrief(body);
    } catch (caught) {
      setBriefStatus(
        caught instanceof Error
          ? caught.message
          : 'AI briefing is unavailable. Your training still works.',
      );
    } finally {
      setBriefBusy(false);
    }
  }

  async function submitAiFeedback(
    claimId: string,
    feedbackValue: 'USEFUL' | 'NOT_USEFUL',
    notUsefulReason:
      'INCORRECT' | 'TOO_VAGUE' | 'NOT_ACTIONABLE' | 'ALREADY_KNOWN' | 'OTHER' | null,
  ): Promise<void> {
    if (!brief) return;
    const response = await fetch(
      `${apiUrl}/academies/${academyId}/me/ai-briefs/${brief.id}/claims/${encodeURIComponent(claimId)}/feedback`,
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
    );
    if (!response.ok) throw new Error('AI feedback could not be recorded.');
  }

  return (
    <section className="student-home-page" id="today">
      <header className="student-today-header">
        <div>
          <p className="context-line">Today</p>
          <h1>
            {intelligence
              ? `Ready, ${intelligence.student.displayName}?`
              : 'Your training notebook'}
          </h1>
          <p>One position at a time. You can always open the evidence behind the exercise.</p>
        </div>
        <div className="student-day-mark" aria-hidden="true">
          <span>{new Date().toLocaleDateString(undefined, { month: 'short' })}</span>
          <strong>{new Date().getDate()}</strong>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {intelligence ? (
        <p className="student-context-note">
          Learning picture: <strong>{label(intelligence.pilotReadiness.state)}</strong>.{' '}
          {intelligence.freshness.newTrainingEvidenceCount > 0
            ? `${intelligence.freshness.newTrainingEvidenceCount} new result${intelligence.freshness.newTrainingEvidenceCount === 1 ? '' : 's'} waiting for coach review.`
            : 'No new evidence update is waiting.'}
        </p>
      ) : null}
      <section
        className="student-training-first"
        id="training"
        aria-labelledby="my-assignments-title"
      >
        <div className="folio-heading">
          <div>
            <h2 id="my-assignments-title">Your next move</h2>
            <p>
              Start with the current assignment. Diagnostic items gather evidence; practice items
              reinforce a verified pattern.
            </p>
          </div>
        </div>
        <div className="academy-roster">
          {assignments?.assignments.map((view) => (
            <article className="student-assignment-card" key={view.assignment.id}>
              <header>
                <div>
                  <h3>
                    {view.progress.status === 'ACTIVE'
                      ? 'Current assignment'
                      : label(view.progress.status)}
                  </h3>
                  <p>
                    {view.progress.completedItemCount}/{view.progress.itemCount} completed
                    {view.assignment.dueAt
                      ? ` · due ${new Date(view.assignment.dueAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                <span className="assignment-progress-mark">
                  {view.progress.completedItemCount}/{view.progress.itemCount}
                </span>
              </header>
              <div className="student-exercise-list">
                {view.itemLinks.map((item, index) => {
                  const detail = view.assignment.items.find(
                    (candidate) => candidate.trainingItemId === item.trainingItemId,
                  );
                  const action = detail?.trainingMode === 'DIAGNOSTIC' ? 'Measure' : 'Practice';
                  const concept = label(detail?.conceptStableId ?? `training item ${index + 1}`);
                  return (
                    <a
                      className="student-exercise-link"
                      href={item.href}
                      key={item.trainingItemId}
                      onClick={() => {
                        if (intelligence) {
                          void recordPilotClientEvent(apiUrl, academyId, {
                            eventType: 'STUDENT_OPENED_ASSIGNMENT',
                            studentProfileId: intelligence.student.id,
                            assignmentId: view.assignment.id,
                          });
                        }
                      }}
                    >
                      <span>{index + 1}</span>
                      <strong>{concept}</strong>
                      <small>{action === 'Measure' ? 'Diagnostic' : 'Practice'}</small>
                      <b>Open position →</b>
                    </a>
                  );
                })}
              </div>
            </article>
          ))}
          {assignments?.assignments.length === 0 ? (
            <div className="student-unknown-state">
              <h3>No training assigned today</h3>
              <p>
                Your coach has not assigned an exercise. This does not say anything about your
                skill.
              </p>
            </div>
          ) : null}
        </div>
      </section>
      {learningLoadState === 'READY' && skillGraph && coverage ? (
        <div className="student-learning-layout" id="progress">
          <LearningIntelligencePanel
            graph={skillGraph}
            coverage={coverage}
            audience="STUDENT"
            onInspect={inspectConcept}
          />
          <GroundedBriefPanel
            artifact={brief}
            unavailable={briefStatus}
            busy={briefBusy}
            onGenerate={() => void generateBrief()}
            onInspectConcept={inspectConcept}
            onClaimFeedback={submitAiFeedback}
          />
        </div>
      ) : learningLoadState === 'LOADING' ? (
        <section className="student-unknown-state" aria-live="polite">
          <h2>Loading verified learning evidence…</h2>
          <p>The page has not made an evidence conclusion yet.</p>
        </section>
      ) : learningLoadState === 'ERROR' ? (
        <section className="student-unknown-state" role="alert">
          <h2>Evidence could not be loaded</h2>
          <p>{learningError} This is a service state, not missing or negative evidence.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </section>
      ) : (
        <section className="student-unknown-state">
          <h2>More verified evidence is needed</h2>
          <p>
            No compatible Skill Graph is available in this scope. That is an unknown state, not a
            negative result.
          </p>
        </section>
      )}
    </section>
  );
}
