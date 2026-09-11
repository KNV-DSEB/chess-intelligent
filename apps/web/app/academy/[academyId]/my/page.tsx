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
  student: { displayName: string };
  player: { displayName: string };
  freshness: { status: string; newTrainingEvidenceCount: number };
  attentionSignals: string[];
  skillGraph: null | { run: { id: string } };
  trainingPlans: Array<{ id: string }>;
}

type LearningLoadState = 'LOADING' | 'READY' | 'UNKNOWN' | 'ERROR';

function label(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
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

  return (
    <section className="panel wide academy-page student-pilot-page">
      <p className="eyebrow">Student self-service</p>
      <h1>{intelligence?.student.displayName ?? 'My training'}</h1>
      <p className="student-welcome">
        Your next training is first. Evidence explains why it is here.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {intelligence ? (
        <aside className="academy-security-note">
          <b>{intelligence.freshness.status}</b>
          <span>{intelligence.freshness.newTrainingEvidenceCount} new training evidence units</span>
        </aside>
      ) : null}
      <section
        className="student-training-first"
        id="training-history"
        aria-labelledby="my-assignments-title"
      >
        <div className="section-kicker">Ready to train</div>
        <h2 id="my-assignments-title">My assignments</h2>
        <div className="academy-roster">
          {assignments?.assignments.map((view) => (
            <article className="academy-student-card" key={view.assignment.id}>
              <h3>{label(view.progress.status)}</h3>
              <p>
                {view.progress.completedItemCount}/{view.progress.itemCount} completed
                {view.assignment.dueAt ? ` · due ${view.assignment.dueAt}` : ''}
              </p>
              <div className="home-actions">
                {view.itemLinks.map((item, index) => {
                  const detail = view.assignment.items.find(
                    (candidate) => candidate.trainingItemId === item.trainingItemId,
                  );
                  const action = detail?.trainingMode === 'DIAGNOSTIC' ? 'Measure' : 'Practice';
                  const concept = label(detail?.conceptStableId ?? `training item ${index + 1}`);
                  return (
                    <a className="button-link" href={item.href} key={item.trainingItemId}>
                      {action}: {concept}
                    </a>
                  );
                })}
              </div>
            </article>
          ))}
          {assignments?.assignments.length === 0 ? (
            <p>No active or historical assignments.</p>
          ) : null}
        </div>
      </section>
      {learningLoadState === 'READY' && skillGraph && coverage ? (
        <div className="student-learning-layout" id="compatible-skill-graph">
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
          />
        </div>
      ) : learningLoadState === 'LOADING' ? (
        <section className="student-unknown-state" aria-live="polite">
          <div className="section-kicker">Learning picture</div>
          <h2>Loading verified learning evidence…</h2>
          <p>The page has not made an evidence conclusion yet.</p>
        </section>
      ) : learningLoadState === 'ERROR' ? (
        <section className="student-unknown-state" role="alert">
          <div className="section-kicker">Learning service unavailable</div>
          <h2>Evidence could not be loaded</h2>
          <p>{learningError} This is a service state, not missing or negative evidence.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </section>
      ) : (
        <section className="student-unknown-state">
          <div className="section-kicker">Learning picture</div>
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
