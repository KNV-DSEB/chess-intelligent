'use client';

import { useEffect, useMemo, useState } from 'react';

export interface CoverageEntry {
  stableId: string;
  displayName: string;
  domainStableId: string;
  status:
    | 'TRAINABLE_V1'
    | 'CLASSIFIABLE_DECISION_V1'
    | 'OBSERVABLE_CONTEXT_ONLY'
    | 'ONTOLOGY_ONLY'
    | 'DEFERRED';
  classifierBundleVersion: string | null;
  masteryEligible: boolean;
  trainingSupported: boolean;
  limitation: string;
}

export interface CoverageReport {
  version: string;
  counts: {
    total: number;
    classifierSupported: number;
    trainable: number;
    contextOnly: number;
    ontologyOnly: number;
    deferred: number;
  };
  entries: CoverageEntry[];
}

export interface SkillConcept {
  conceptStableId: string;
  displayName: string;
  shortDescription: string;
  status: 'NO_EVIDENCE' | 'INSUFFICIENT_EVIDENCE' | 'ESTIMATED';
  masteryBand: string | null;
  evidenceConfidence: 'INSUFFICIENT' | 'LOW' | 'MODERATE' | 'HIGH';
  displayPosteriorMean: number | null;
  effectiveEvidenceMass: number;
  rawPositiveCount: number;
  rawNegativeCount: number;
}

export interface SkillGraph {
  run: {
    id: string;
    ontologyVersion: string;
    classifierBundleVersion: string;
    skillGraphPolicyVersion: string;
    asOfDate: string;
  };
  coverage: {
    decisionOccurrences: number;
    classifiedDecisions: number;
    engineBackedDecisions: number;
    masteryEligibleEvidence: number;
  };
  concepts: SkillConcept[];
}

export interface GroundedBriefArtifact {
  id: string;
  provider: string;
  model: string;
  inputSnapshotSha256: string;
  inputSnapshot: {
    source: {
      skillGraphRunId: string;
      trainingPlanRunId: string | null;
    };
    permittedEvidenceRefs: Array<{
      ref: string;
      kind:
        | 'SKILL_GRAPH_RUN'
        | 'CONCEPT_EVIDENCE'
        | 'TRAINING_EVIDENCE'
        | 'TRAINING_PLAN'
        | 'COVERAGE_REPORT';
    }>;
  };
  createdAt: string;
  validatedOutput: {
    headline: string;
    summary: string;
    claims: Array<{
      id: string;
      type: 'CURRENT_PRIORITY' | 'EVIDENCE_LIMITATION' | 'RECENT_CHANGE' | 'NEXT_ACTION';
      conceptStableId: string | null;
      statement: string;
      confidence: 'INSUFFICIENT' | 'LOW' | 'MODERATE' | 'HIGH';
      evidenceRefs: string[];
    }>;
    limitations: string[];
  };
}

export interface ConceptEvidenceDetail {
  state: SkillConcept;
  contributions: Array<{
    gameId: string;
    evidence: Array<{
      conceptEvidenceInstanceId: string;
      polarity: string;
      ruleId: string;
    }>;
  }>;
  trainingContributions: Array<{
    trainingEvidenceInstanceId: string;
    trainingItemId: string;
    polarity: string;
  }>;
}

function words(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

function evidenceState(concept: SkillConcept | undefined, support: CoverageEntry | undefined) {
  if (!support?.classifierBundleVersion) {
    return { code: 'SYSTEM_UNSUPPORTED', label: 'Not yet supported', tone: 'unsupported' };
  }
  if (!concept || concept.status === 'NO_EVIDENCE') {
    return { code: 'NO_EVIDENCE', label: 'No evidence yet', tone: 'unknown' };
  }
  if (concept.status === 'INSUFFICIENT_EVIDENCE') {
    return { code: 'INSUFFICIENT_EVIDENCE', label: 'Early signal', tone: 'early' };
  }
  return { code: 'ESTIMATED', label: 'Evidence estimate', tone: 'estimated' };
}

function EvidenceIcon({ type }: { type: 'coverage' | 'engine' | 'training' }) {
  if (type === 'engine') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3v4M17 3v4M4 9h16M6 13h4v4H6zm8 0h4v4h-4zM4 7h16v14H4z" />
      </svg>
    );
  }
  if (type === 'training') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function EvidenceTrail({
  detail,
  onClose,
  idPrefix,
  className = '',
}: {
  detail: ConceptEvidenceDetail;
  onClose: () => void;
  idPrefix: string;
  className?: string;
}) {
  const titleId = `${idPrefix}-evidence-detail-title`;
  return (
    <section
      className={`evidence-drawer ${className}`.trim()}
      aria-labelledby={titleId}
      data-testid={`${idPrefix}-evidence-trail`}
    >
      <div className="section-heading pilot-heading">
        <div>
          <div className="section-kicker">Evidence trail</div>
          <h2 id={titleId}>{detail.state.displayName}</h2>
        </div>
        <button className="quiet-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="evidence-source-grid">
        <div>
          <EvidenceIcon type="coverage" />
          <strong>{detail.contributions.length}</strong>
          <span>canonical game units</span>
        </div>
        <div>
          <EvidenceIcon type="engine" />
          <strong>{detail.contributions.flatMap((item) => item.evidence).length}</strong>
          <span>exact concept evidence rows</span>
        </div>
        <div>
          <EvidenceIcon type="training" />
          <strong>{detail.trainingContributions.length}</strong>
          <span>training measurement units</span>
        </div>
      </div>
      <ul className="lineage-list">
        {detail.contributions.flatMap((item) =>
          item.evidence.map((evidence) => (
            <li key={evidence.conceptEvidenceInstanceId}>
              <a href={`/games/${item.gameId}#concept-evidence`}>
                Game evidence {evidence.conceptEvidenceInstanceId.slice(0, 8)}
              </a>
              <span>
                {words(evidence.polarity)} · {words(evidence.ruleId)}
              </span>
            </li>
          )),
        )}
        {detail.trainingContributions.map((evidence) => (
          <li key={evidence.trainingEvidenceInstanceId}>
            <a href={`/training?item=${evidence.trainingItemId}`}>
              Training evidence {evidence.trainingEvidenceInstanceId.slice(0, 8)}
            </a>
            <span>{words(evidence.polarity)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LearningIntelligencePanel({
  graph,
  coverage,
  audience,
  onInspect,
}: {
  graph: SkillGraph;
  coverage: CoverageReport;
  audience: 'COACH' | 'STUDENT';
  onInspect?: ((stableId: string) => Promise<ConceptEvidenceDetail>) | undefined;
}) {
  const [selected, setSelected] = useState<ConceptEvidenceDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const conceptById = useMemo(
    () => new Map(graph.concepts.map((entry) => [entry.conceptStableId, entry])),
    [graph],
  );
  const supported = coverage.entries.filter((entry) => entry.classifierBundleVersion);
  const priorities = supported
    .filter((entry) => entry.trainingSupported)
    .map((entry) => ({ entry, concept: conceptById.get(entry.stableId) }))
    .sort(
      (left, right) =>
        Number(left.concept?.status === 'NO_EVIDENCE') -
          Number(right.concept?.status === 'NO_EVIDENCE') ||
        (left.concept?.displayPosteriorMean ?? 1) - (right.concept?.displayPosteriorMean ?? 1) ||
        left.entry.stableId.localeCompare(right.entry.stableId),
    )
    .slice(0, audience === 'COACH' ? 4 : 3);

  async function inspect(stableId: string) {
    if (!onInspect) return;
    setDetailError(null);
    try {
      setSelected(await onInspect(stableId));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Evidence detail is unavailable.');
    }
  }

  return (
    <div className="learning-intelligence">
      <section className="learning-priorities" aria-labelledby="learning-priorities-title">
        <div className="section-kicker">Current learning picture</div>
        <div className="section-heading pilot-heading">
          <div>
            <h2 id="learning-priorities-title">
              {audience === 'COACH' ? 'Priorities with evidence' : 'What to practice next'}
            </h2>
            <p>
              Ordered from the pinned Skill Graph. Unknown data stays unknown; these are study
              candidates, not labels about the Player.
            </p>
          </div>
          <span className="snapshot-chip">As of {graph.run.asOfDate}</span>
        </div>
        <div className="priority-stack">
          {priorities.map(({ entry, concept }, index) => {
            const state = evidenceState(concept, entry);
            return (
              <article className="priority-row" key={entry.stableId}>
                <span className="priority-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="priority-copy">
                  <div>
                    <h3>{entry.displayName}</h3>
                    <span className={`evidence-state ${state.tone}`}>{state.label}</span>
                  </div>
                  <p>
                    {concept?.shortDescription ?? entry.limitation}
                    {concept?.status === 'ESTIMATED'
                      ? ` · ${words(concept.masteryBand ?? 'estimated')} · ${words(concept.evidenceConfidence)} confidence`
                      : ''}
                  </p>
                </div>
                {onInspect && concept ? (
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={() => void inspect(entry.stableId)}
                  >
                    Inspect evidence
                  </button>
                ) : (
                  <span className="practice-label">
                    {entry.trainingSupported ? 'Trainable' : 'Context'}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="skill-map" aria-labelledby="skill-map-title">
        <div className="section-heading pilot-heading">
          <div>
            <div className="section-kicker">Skill Map</div>
            <h2 id="skill-map-title">Supported learning surface</h2>
          </div>
          <span className="coverage-fraction">
            {coverage.counts.classifierSupported}/{coverage.counts.total} observable
          </span>
        </div>
        <div className="skill-map-grid">
          {supported.map((entry) => {
            const concept = conceptById.get(entry.stableId);
            const state = evidenceState(concept, entry);
            const percentage =
              concept?.status === 'ESTIMATED' && concept.displayPosteriorMean !== null
                ? Math.round(concept.displayPosteriorMean * 100)
                : null;
            return (
              <article className="skill-cell" key={entry.stableId}>
                <div>
                  <span className={`state-dot ${state.tone}`} aria-hidden="true" />
                  <span>{state.label}</span>
                </div>
                <h3>{entry.displayName}</h3>
                <p>
                  {percentage === null
                    ? entry.status === 'OBSERVABLE_CONTEXT_ONLY'
                      ? 'Position exposure only'
                      : 'Awaiting sufficient direct evidence'
                    : `${percentage}% posterior · ${words(concept!.evidenceConfidence)} confidence`}
                </p>
              </article>
            );
          })}
        </div>
        <details className="coverage-legend">
          <summary>How to read these states</summary>
          <dl>
            <div>
              <dt>Not yet supported</dt>
              <dd>The ontology defines it; this system does not classify it.</dd>
            </div>
            <div>
              <dt>No evidence yet</dt>
              <dd>Supported, but no eligible observation exists in this scope.</dd>
            </div>
            <div>
              <dt>Early signal</dt>
              <dd>Evidence exists but is insufficient for an estimate.</dd>
            </div>
            <div>
              <dt>Evidence estimate</dt>
              <dd>A bounded posterior estimate with visible confidence.</dd>
            </div>
          </dl>
        </details>
      </section>

      {detailError ? (
        <p className="error" role="alert">
          {detailError}
        </p>
      ) : null}
      {selected ? (
        <EvidenceTrail detail={selected} onClose={() => setSelected(null)} idPrefix="skill-map" />
      ) : null}
    </div>
  );
}

export function GroundedBriefPanel({
  artifact,
  unavailable,
  busy,
  onGenerate,
  onInspectConcept,
}: {
  artifact: GroundedBriefArtifact | null;
  unavailable: string | null;
  busy: boolean;
  onGenerate: () => void;
  onInspectConcept?: ((stableId: string) => Promise<ConceptEvidenceDetail>) | undefined;
}) {
  const [citationDetail, setCitationDetail] = useState<ConceptEvidenceDetail | null>(null);
  const [citationError, setCitationError] = useState<string | null>(null);
  const [citationBusy, setCitationBusy] = useState<string | null>(null);

  useEffect(() => {
    setCitationDetail(null);
    setCitationError(null);
    setCitationBusy(null);
  }, [artifact?.id]);

  async function inspectCitation(stableId: string): Promise<void> {
    if (!onInspectConcept) return;
    setCitationBusy(stableId);
    setCitationError(null);
    try {
      setCitationDetail(await onInspectConcept(stableId));
    } catch (error) {
      setCitationError(error instanceof Error ? error.message : 'Cited evidence is unavailable.');
    } finally {
      setCitationBusy(null);
    }
  }

  function citationHref(reference: string): string | null {
    if (reference.startsWith('coverage:')) return '/coverage';
    if (reference.startsWith('skill-graph:')) return '#compatible-skill-graph';
    if (reference.startsWith('training-plan:')) return '#training-history';
    return null;
  }

  return (
    <aside className="grounded-brief" aria-labelledby="grounded-brief-title">
      <div className="grounded-brief-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7zM8 12l2.5 2.5L16 9" />
        </svg>
      </div>
      <div className="section-kicker">Grounded AI brief</div>
      <h2 id="grounded-brief-title">
        {artifact?.validatedOutput.headline ?? 'Explain the evidence, not invent it'}
      </h2>
      {artifact ? (
        <>
          <p>{artifact.validatedOutput.summary}</p>
          <ol className="brief-claims">
            {artifact.validatedOutput.claims.map((claim) => (
              <li key={claim.id}>
                <span>{words(claim.type)}</span>
                <p>{claim.statement}</p>
                <small>{words(claim.confidence)} confidence · validated citations</small>
                <ul className="brief-citations" aria-label={`Evidence cited by ${claim.id}`}>
                  {claim.evidenceRefs.map((reference) => {
                    const href = citationHref(reference);
                    const canInspect =
                      claim.conceptStableId !== null &&
                      onInspectConcept !== undefined &&
                      (reference.startsWith('concept-evidence:') ||
                        reference.startsWith('training-evidence:'));
                    return (
                      <li key={reference}>
                        {canInspect ? (
                          <button
                            className="citation-link"
                            type="button"
                            data-evidence-ref={reference}
                            disabled={citationBusy === claim.conceptStableId}
                            onClick={() => void inspectCitation(claim.conceptStableId!)}
                          >
                            Inspect <code>{reference}</code>
                          </button>
                        ) : href ? (
                          <a href={href} data-evidence-ref={reference}>
                            <code>{reference}</code>
                          </a>
                        ) : (
                          <code data-evidence-ref={reference}>{reference}</code>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
          {citationError ? (
            <p className="ai-unavailable" role="alert">
              {citationError}
            </p>
          ) : null}
          {citationDetail ? (
            <EvidenceTrail
              detail={citationDetail}
              onClose={() => setCitationDetail(null)}
              idPrefix="brief-citation"
              className="citation-evidence"
            />
          ) : null}
          {artifact.validatedOutput.limitations.length ? (
            <details>
              <summary>Evidence limitations</summary>
              <ul>
                {artifact.validatedOutput.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="artifact-proof">
            Validated artifact {artifact.id.slice(0, 8)} · snapshot{' '}
            {artifact.inputSnapshotSha256.slice(0, 10)}
          </p>
        </>
      ) : (
        <>
          <p>
            The brief can summarize only the pinned Skill Graph, TrainingPlan, coverage report, and
            exact evidence references. It cannot create chess truth or change mastery.
          </p>
          {unavailable ? (
            <p className="ai-unavailable" role="status">
              {unavailable}
            </p>
          ) : null}
          <button type="button" disabled={busy} onClick={onGenerate}>
            {busy ? 'Validating brief…' : 'Generate grounded brief'}
          </button>
        </>
      )}
    </aside>
  );
}
