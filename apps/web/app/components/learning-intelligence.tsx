'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ChessPosition } from './chess-position';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

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
    contributionId: string;
    gameId: string;
    classificationRunId: string;
    game: {
      playedAt: string | null;
      event: string | null;
      result: string;
      opponentName: string | null;
    };
    evidenceDate: string;
    links: { game: string; conceptEvidence: string; engineAnalysis: string | null };
    evidence: Array<{
      conceptEvidenceInstanceId: string;
      evidenceTypeStableId: string;
      historicalEvidenceRole: string;
      polarity: 'POSITIVE' | 'NEGATIVE';
      positionOccurrenceId: string;
      occurrencePly: number;
      decisionPly: number;
      subjectColor: 'WHITE' | 'BLACK';
      ruleId: string;
      exactHistorySha256: string;
      analysisRunId: string;
    }>;
  }>;
  trainingContributions: Array<{
    trainingEvidenceInstanceId: string;
    trainingItemId: string;
    polarity: 'POSITIVE' | 'NEGATIVE';
    evidenceDate?: string;
    attempt?: { number: number; result: 'CORRECT' | 'INCORRECT'; submittedAt: string };
    links?: { trainingItem: string; sourceGame: string; sourceConceptEvidence: string };
  }>;
}

interface EvidenceGame {
  id: string;
  event: string | null;
  playedAt: string | null;
  result: string;
  initialFen: string | null;
  players: Array<{ color: 'WHITE' | 'BLACK'; displayName: string }>;
  moves: Array<{ ply: number; san: string; uci: string; fenAfter: string }>;
}

interface EvidenceAnalysis {
  id: string;
  engineReportedName: string;
  engineReportedVersion: string | null;
  profile: string;
  configuration: { searchLimit: { type: string; value: number }; multiPv: number };
  positions: Array<{
    ply: number;
    playedMoveUci: string;
    bestMoveUci: string;
    centipawnLoss: number | null;
    mateOutcome: string;
    engineState: { sideToMove: 'WHITE' | 'BLACK'; historySha256: string };
  }>;
}

function words(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replaceAll('.', ' ');
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
  const [game, setGame] = useState<EvidenceGame | null>(null);
  const [analysis, setAnalysis] = useState<EvidenceAnalysis | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const contribution = detail.contributions[0] ?? null;
  const evidence = contribution?.evidence[0] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setGame(null);
    setAnalysis(null);
    setContextError(null);
    if (!contribution || !evidence) return () => controller.abort();
    void Promise.all([
      fetch(`${apiUrl}/games/${contribution.gameId}`, {
        credentials: 'include',
        signal: controller.signal,
      }),
      fetch(`${apiUrl}/analysis/runs/${evidence.analysisRunId}`, {
        credentials: 'include',
        signal: controller.signal,
      }),
    ])
      .then(async ([gameResponse, analysisResponse]) => {
        if (!gameResponse.ok) throw new Error('The source game could not be loaded.');
        setGame((await gameResponse.json()) as EvidenceGame);
        if (analysisResponse.ok) setAnalysis((await analysisResponse.json()) as EvidenceAnalysis);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setContextError(
          error instanceof Error ? error.message : 'Position context is unavailable.',
        );
      });
    return () => controller.abort();
  }, [contribution, evidence]);

  const positionFen =
    game && evidence
      ? evidence.occurrencePly === 0
        ? game.initialFen
        : (game.moves.find((move) => move.ply === evidence.occurrencePly)?.fenAfter ?? null)
      : null;
  const moveWindow =
    game && evidence
      ? game.moves.filter(
          (move) =>
            move.ply >= Math.max(1, evidence.decisionPly - 4) &&
            move.ply <= evidence.decisionPly + 4,
        )
      : [];
  const enginePosition = analysis?.positions.find(
    (position) => position.ply === evidence?.occurrencePly,
  );
  return (
    <section
      className={`evidence-drawer ${className}`.trim()}
      aria-labelledby={titleId}
      data-testid={`${idPrefix}-evidence-trail`}
    >
      <div className="section-heading pilot-heading evidence-title-row">
        <div>
          <h2 id={titleId}>{detail.state.displayName}</h2>
          <p>From board position to classification to the current learning estimate.</p>
        </div>
        <button className="quiet-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="evidence-source-grid" aria-label="Evidence coverage">
        <div>
          <EvidenceIcon type="coverage" />
          <strong>{detail.contributions.length}</strong>
          <span>games</span>
        </div>
        <div>
          <EvidenceIcon type="engine" />
          <strong>{detail.contributions.flatMap((item) => item.evidence).length}</strong>
          <span>verified decisions</span>
        </div>
        <div>
          <EvidenceIcon type="training" />
          <strong>{detail.trainingContributions.length}</strong>
          <span>training results</span>
        </div>
      </div>

      {contribution && evidence ? (
        <article className="evidence-game-folio">
          <header>
            <div>
              <h3>{contribution.game.event ?? 'Recorded game'}</h3>
              <p>
                {contribution.game.opponentName ? `vs ${contribution.game.opponentName} · ` : ''}
                {contribution.game.result} ·{' '}
                {contribution.game.playedAt?.slice(0, 10) ?? contribution.evidenceDate}
              </p>
            </div>
            <span
              className={`evidence-state ${evidence.polarity === 'POSITIVE' ? 'estimated' : 'early'}`}
            >
              {evidence.polarity === 'POSITIVE' ? 'Concept demonstrated' : 'Missed application'}
            </span>
          </header>
          <div className="evidence-position-layout">
            <div>
              {positionFen ? (
                <ChessPosition fen={positionFen} sideToMove={evidence.subjectColor} compact />
              ) : (
                <div className="position-placeholder">Loading exact position…</div>
              )}
              {contextError ? <p className="error">{contextError}</p> : null}
            </div>
            <div className="position-notation">
              <h4>Decision at move {Math.ceil(evidence.decisionPly / 2)}</h4>
              <ol aria-label="Move sequence around the classified decision">
                {moveWindow.map((move) => (
                  <li
                    className={move.ply === evidence.decisionPly ? 'played-decision' : ''}
                    key={move.ply}
                  >
                    <span>
                      {move.ply % 2 === 1
                        ? `${Math.ceil(move.ply / 2)}.`
                        : `${Math.ceil(move.ply / 2)}…`}
                    </span>
                    <strong>{move.san}</strong>
                  </li>
                ))}
              </ol>
              <p className="evidence-meaning">
                {evidence.polarity === 'POSITIVE'
                  ? 'The concept classifier found this motif in the player’s decision, with compatible exact-history engine evidence.'
                  : 'The concept classifier found this motif in the decision and compatible engine evidence recorded a missed application.'}
              </p>
              {analysis && enginePosition ? (
                <div className="engine-note">
                  <strong>
                    {analysis.engineReportedName} {analysis.engineReportedVersion ?? ''}
                  </strong>
                  <span>
                    Played {enginePosition.playedMoveUci} · reference {enginePosition.bestMoveUci}
                    {enginePosition.centipawnLoss === null
                      ? ''
                      : ` · ${enginePosition.centipawnLoss} cp recorded loss`}
                  </span>
                  <small>
                    {analysis.profile} · {analysis.configuration.searchLimit.type.toLowerCase()}{' '}
                    {analysis.configuration.searchLimit.value} · MultiPV{' '}
                    {analysis.configuration.multiPv}
                  </small>
                </div>
              ) : null}
              <Link className="text-link" href={contribution.links.game}>
                Open full game →
              </Link>
            </div>
          </div>
          <details className="advanced-panel compact-advanced">
            <summary>Advanced evidence provenance</summary>
            <dl className="provenance-list">
              <div>
                <dt>Evidence row</dt>
                <dd>
                  <code>{evidence.conceptEvidenceInstanceId}</code>
                </dd>
              </div>
              <div>
                <dt>Rule</dt>
                <dd>{words(evidence.ruleId)}</dd>
              </div>
              <div>
                <dt>Historical role</dt>
                <dd>{words(evidence.historicalEvidenceRole)}</dd>
              </div>
              <div>
                <dt>Exact history</dt>
                <dd>
                  <code>{evidence.exactHistorySha256}</code>
                </dd>
              </div>
              <div>
                <dt>Analysis run</dt>
                <dd>
                  <code>{evidence.analysisRunId}</code>
                </dd>
              </div>
            </dl>
          </details>
        </article>
      ) : (
        <p className="empty-note">No mastery-eligible game decision is attached to this state.</p>
      )}

      {detail.contributions.length > 1 || detail.trainingContributions.length > 0 ? (
        <details className="evidence-history">
          <summary>
            All contributing evidence (
            {detail.contributions.length + detail.trainingContributions.length})
          </summary>
          <ul className="lineage-list">
            {detail.contributions.flatMap((item) =>
              item.evidence.map((entry) => (
                <li key={entry.conceptEvidenceInstanceId}>
                  <Link href={item.links.conceptEvidence}>
                    {item.game.event ?? 'Game'} · move {Math.ceil(entry.decisionPly / 2)}
                  </Link>
                  <span>
                    {words(entry.polarity)} · {item.evidenceDate}
                  </span>
                </li>
              )),
            )}
            {detail.trainingContributions.map((entry) => (
              <li key={entry.trainingEvidenceInstanceId}>
                <Link href={entry.links?.trainingItem ?? `/training?item=${entry.trainingItemId}`}>
                  Training attempt {entry.attempt?.number ?? ''}
                </Link>
                <span>
                  {words(entry.polarity)}
                  {entry.attempt ? ` · ${words(entry.attempt.result)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function LearningIntelligencePanel({
  graph,
  coverage,
  audience,
  onInspect,
  onCoachFeedback,
}: {
  graph: SkillGraph;
  coverage: CoverageReport;
  audience: 'COACH' | 'STUDENT';
  onInspect?: ((stableId: string) => Promise<ConceptEvidenceDetail>) | undefined;
  onCoachFeedback?:
    ((stableId: string, value: 'AGREE' | 'UNSURE' | 'DISAGREE') => Promise<void>) | undefined;
}) {
  const [selected, setSelected] = useState<ConceptEvidenceDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [feedbackByConcept, setFeedbackByConcept] = useState<Record<string, string>>({});
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
  const coverageByDomain = useMemo(() => {
    const grouped = new Map<string, CoverageEntry[]>();
    for (const entry of coverage.entries) {
      const entries = grouped.get(entry.domainStableId) ?? [];
      entries.push(entry);
      grouped.set(entry.domainStableId, entries);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [coverage.entries]);

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
        <div className="section-heading pilot-heading">
          <div>
            <h2 id="learning-priorities-title">
              {audience === 'COACH' ? 'Where to look next' : 'What to practice next'}
            </h2>
            <p>
              Each suggestion is tied to verified decisions. Unknown means “not enough evidence,”
              never “weak.”
            </p>
          </div>
          <span className="snapshot-chip">As of {graph.run.asOfDate}</span>
        </div>
        <div className="priority-stack">
          {priorities.map(({ entry, concept }) => {
            const state = evidenceState(concept, entry);
            return (
              <article className="priority-row" key={entry.stableId}>
                <div className="priority-copy">
                  <div>
                    <h3>{entry.displayName}</h3>
                    <span className={`evidence-state ${state.tone}`}>{state.label}</span>
                  </div>
                  <p>
                    {concept?.shortDescription ?? entry.limitation}
                    {concept?.status === 'ESTIMATED'
                      ? ` · ${words(concept.evidenceConfidence)} confidence from ${concept.rawPositiveCount + concept.rawNegativeCount} classified decision${concept.rawPositiveCount + concept.rawNegativeCount === 1 ? '' : 's'}`
                      : ''}
                  </p>
                </div>
                {onInspect && concept ? (
                  <div className="priority-actions">
                    <button
                      className="quiet-button"
                      type="button"
                      onClick={() => void inspect(entry.stableId)}
                    >
                      Inspect evidence
                    </button>
                    {audience === 'COACH' && onCoachFeedback ? (
                      <div className="pilot-feedback" aria-label={`Review ${entry.displayName}`}>
                        {(['AGREE', 'UNSURE', 'DISAGREE'] as const).map((value) => (
                          <button
                            className={
                              feedbackByConcept[entry.stableId] === value ? 'selected' : ''
                            }
                            type="button"
                            key={value}
                            disabled={Boolean(feedbackByConcept[entry.stableId])}
                            onClick={() => {
                              setFeedbackByConcept((current) => ({
                                ...current,
                                [entry.stableId]: value,
                              }));
                              void onCoachFeedback(entry.stableId, value).catch(
                                (error: unknown) => {
                                  setFeedbackByConcept((current) => {
                                    const next = { ...current };
                                    delete next[entry.stableId];
                                    return next;
                                  });
                                  setDetailError(
                                    error instanceof Error
                                      ? error.message
                                      : 'Coach feedback could not be recorded.',
                                  );
                                },
                              );
                            }}
                          >
                            {words(value)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
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
            <h2 id="skill-map-title">Skill map</h2>
            <p>
              Browse the whole concept library by chess domain. System coverage and student evidence
              remain separate.
            </p>
          </div>
          <span className="coverage-fraction">
            {coverage.counts.classifierSupported}/{coverage.counts.total} observable
          </span>
        </div>
        <div className="skill-domain-list">
          {coverageByDomain.map(([domain, entries]) => {
            const measured = entries.filter(
              (entry) => conceptById.get(entry.stableId)?.status === 'ESTIMATED',
            ).length;
            return (
              <details className="skill-domain-group" key={domain} open={measured > 0}>
                <summary>
                  <span>{words(domain)}</span>
                  <small>
                    {measured} estimated · {entries.length} concepts
                  </small>
                </summary>
                <div className="skill-domain-rows">
                  {entries.map((entry) => {
                    const concept = conceptById.get(entry.stableId);
                    const state = evidenceState(concept, entry);
                    const percentage =
                      concept?.status === 'ESTIMATED' && concept.displayPosteriorMean !== null
                        ? Math.round(concept.displayPosteriorMean * 100)
                        : null;
                    return (
                      <article className="skill-cell" key={entry.stableId}>
                        <div className="skill-cell-heading">
                          <h3>{entry.displayName}</h3>
                          <span className={`evidence-state ${state.tone}`}>{state.label}</span>
                        </div>
                        <p>
                          {percentage === null
                            ? entry.status === 'OBSERVABLE_CONTEXT_ONLY'
                              ? 'Position context only; it cannot update the player model.'
                              : entry.classifierBundleVersion
                                ? 'Awaiting enough eligible decisions.'
                                : entry.limitation
                            : `${words(concept!.evidenceConfidence)} confidence · ${concept!.rawPositiveCount + concept!.rawNegativeCount} decision${concept!.rawPositiveCount + concept!.rawNegativeCount === 1 ? '' : 's'}`}
                        </p>
                        {onInspect && concept && concept.status !== 'NO_EVIDENCE' ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => void inspect(entry.stableId)}
                          >
                            See evidence
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </details>
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
  onEvidenceOpen,
  onClaimFeedback,
}: {
  artifact: GroundedBriefArtifact | null;
  unavailable: string | null;
  busy: boolean;
  onGenerate: () => void;
  onInspectConcept?: ((stableId: string) => Promise<ConceptEvidenceDetail>) | undefined;
  onEvidenceOpen?:
    ((claimId: string, stableId: string | null, evidenceRef: string) => void) | undefined;
  onClaimFeedback?:
    | ((
        claimId: string,
        value: 'USEFUL' | 'NOT_USEFUL',
        reason: 'INCORRECT' | 'TOO_VAGUE' | 'NOT_ACTIONABLE' | 'ALREADY_KNOWN' | 'OTHER' | null,
      ) => Promise<void>)
    | undefined;
}) {
  const [citationDetail, setCitationDetail] = useState<ConceptEvidenceDetail | null>(null);
  const [citationError, setCitationError] = useState<string | null>(null);
  const [citationBusy, setCitationBusy] = useState<string | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<Record<string, string>>({});
  const [reasonByClaim, setReasonByClaim] = useState<Record<string, string>>({});

  useEffect(() => {
    setCitationDetail(null);
    setCitationError(null);
    setCitationBusy(null);
    setClaimFeedback({});
    setReasonByClaim({});
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
    <details className="grounded-brief quiet-ai">
      <summary>
        <span className="grounded-brief-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7zM8 12l2.5 2.5L16 9" />
          </svg>
        </span>
        <span>
          <strong>Optional AI explanation</strong>
          <small>
            {artifact ? 'Validated against cited evidence' : 'Structured evidence works without it'}
          </small>
        </span>
      </summary>
      <div className="grounded-brief-body">
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
                              onClick={() => {
                                onEvidenceOpen?.(claim.id, claim.conceptStableId, reference);
                                void inspectCitation(claim.conceptStableId!);
                              }}
                            >
                              Inspect <code>{reference}</code>
                            </button>
                          ) : href ? (
                            <a
                              href={href}
                              data-evidence-ref={reference}
                              onClick={() =>
                                onEvidenceOpen?.(claim.id, claim.conceptStableId, reference)
                              }
                            >
                              <code>{reference}</code>
                            </a>
                          ) : (
                            <code data-evidence-ref={reference}>{reference}</code>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {onClaimFeedback ? (
                    <div className="ai-claim-feedback" aria-label={`Feedback for ${claim.id}`}>
                      <span>Useful?</span>
                      <button
                        type="button"
                        className={claimFeedback[claim.id] === 'USEFUL' ? 'selected' : ''}
                        disabled={Boolean(claimFeedback[claim.id])}
                        onClick={() => {
                          setClaimFeedback((current) => ({ ...current, [claim.id]: 'USEFUL' }));
                          void onClaimFeedback(claim.id, 'USEFUL', null).catch((error: unknown) => {
                            setClaimFeedback((current) => {
                              const next = { ...current };
                              delete next[claim.id];
                              return next;
                            });
                            setCitationError(
                              error instanceof Error
                                ? error.message
                                : 'AI feedback could not be recorded.',
                            );
                          });
                        }}
                      >
                        Yes
                      </button>
                      <select
                        aria-label={`Why ${claim.id} was not useful`}
                        disabled={Boolean(claimFeedback[claim.id])}
                        value={reasonByClaim[claim.id] ?? ''}
                        onChange={(event) => {
                          if (!event.target.value) return;
                          const reason = event.target.value as
                            | 'INCORRECT'
                            | 'TOO_VAGUE'
                            | 'NOT_ACTIONABLE'
                            | 'ALREADY_KNOWN'
                            | 'OTHER';
                          setReasonByClaim((current) => ({ ...current, [claim.id]: reason }));
                          setClaimFeedback((current) => ({ ...current, [claim.id]: 'NOT_USEFUL' }));
                          void onClaimFeedback(claim.id, 'NOT_USEFUL', reason).catch(
                            (error: unknown) => {
                              setClaimFeedback((current) => {
                                const next = { ...current };
                                delete next[claim.id];
                                return next;
                              });
                              setReasonByClaim((current) => {
                                const next = { ...current };
                                delete next[claim.id];
                                return next;
                              });
                              setCitationError(
                                error instanceof Error
                                  ? error.message
                                  : 'AI feedback could not be recorded.',
                              );
                            },
                          );
                        }}
                      >
                        <option value="">No — select reason</option>
                        <option value="INCORRECT">Incorrect</option>
                        <option value="TOO_VAGUE">Too vague</option>
                        <option value="NOT_ACTIONABLE">Not actionable</option>
                        <option value="ALREADY_KNOWN">Already known</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  ) : null}
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
            <details className="advanced-panel compact-advanced">
              <summary>AI provenance</summary>
              <p className="artifact-proof">
                Validated artifact <code>{artifact.id}</code> · snapshot{' '}
                <code>{artifact.inputSnapshotSha256}</code>
              </p>
            </details>
          </>
        ) : (
          <>
            <p>
              This optional explanation can only summarize the verified learning picture and cite
              its sources. It cannot create chess facts or change the player model.
            </p>
            {unavailable ? (
              <p className="ai-unavailable" role="status">
                {unavailable}
              </p>
            ) : null}
            <button type="button" disabled={busy} onClick={onGenerate}>
              {busy ? 'Checking sources…' : 'Create evidence-backed explanation'}
            </button>
          </>
        )}
      </div>
    </details>
  );
}
