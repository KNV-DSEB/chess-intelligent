'use client';

import { type FormEvent, useMemo, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ConceptSummary {
  stableId: string;
  displayName: string;
  kind: string;
  difficulty: string;
  status: string;
}

interface ConceptState {
  conceptStableId: string;
  displayName: string;
  shortDescription: string;
  kind: string;
  difficulty: string;
  status: 'NO_EVIDENCE' | 'INSUFFICIENT_EVIDENCE' | 'ESTIMATED';
  posteriorAlpha: number;
  posteriorBeta: number;
  posteriorMean: number | null;
  displayPosteriorMean: number | null;
  positiveEvidenceMass: number;
  negativeEvidenceMass: number;
  effectiveEvidenceMass: number;
  rawPositiveCount: number;
  rawNegativeCount: number;
  neutralExposureCount: number;
  neutralExposureGameCount: number;
  contextualEvidenceCount: number;
  canonicalGameCount: number;
  lastEvidenceAt: string | null;
  evidenceConfidence: string;
  masteryBand: string | null;
  parent: ConceptSummary | null;
  children: ConceptSummary[];
  prerequisites: ConceptSummary[];
}

interface SkillGraph {
  run: {
    id: string;
    player: {
      displayName: string;
      identity: { provider: string; externalId: string } | null;
    };
    ontologyVersion: string;
    asOfDate: string;
    skillGraphPolicyVersion: string;
    policyConfigSha256: string;
    evidenceScope: Record<string, unknown>;
  };
  coverage: {
    canonicalGames: number;
    gamesWithMoves: number;
    decisionOccurrences: number;
    classifiedDecisions: number;
    engineBackedDecisions: number;
    masteryEligibleEvidence: number;
    positiveMasteryEvidence: number;
    negativeMasteryEvidence: number;
    neutralExposureEvidence: number;
    selectedClassificationRuns: number;
  };
  policy: {
    roleWeights: { DIRECT: number; SUPPORTING: number; CONTEXTUAL: number };
    maximumGameContribution: number;
    recencyHalfLifeDays: number;
    betaPrior: { alpha: number; beta: number };
    classificationSelection: { strategy: string };
    versions: Record<string, string>;
  };
  domains: Array<{
    stableId: string;
    displayName: string;
    conceptsWithEvidence: number;
    conceptsEstimated: number;
    conceptsInsufficient: number;
    totalEffectiveEvidenceMass: number;
  }>;
  concepts: ConceptState[];
}

interface ConceptDetail {
  ontology: ConceptState & { dependents: ConceptSummary[] };
  state: ConceptState;
  contributions: Array<{
    contributionId: string;
    gameId: string;
    classificationRunId: string;
    game: { playedAt: string | null; event: string | null; result: string; opponentName: string };
    evidenceDate: string;
    weights: {
      rawPositive: number;
      rawNegative: number;
      cappedPositive: number;
      cappedNegative: number;
      recency: number;
      effectivePositive: number;
      effectiveNegative: number;
    };
    evidence: Array<{
      conceptEvidenceInstanceId: string;
      historicalEvidenceRole: string;
      polarity: string;
      occurrencePly: number;
      classifierId: string;
      classifierVersion: string;
      ruleId: string;
      analysisRunId: string;
    }>;
    links: { game: string; conceptEvidence: string; engineAnalysis: string | null };
  }>;
  reconstruction: { matchesPersistedState: boolean };
}

interface ApiError {
  error?: { message?: string };
}

async function responseBody<Result>(response: Response): Promise<Result> {
  const body = (await response.json()) as Result | ApiError;
  if (!response.ok) {
    throw new Error((body as ApiError).error?.message ?? 'Skill Graph request failed.');
  }
  return body as Result;
}

function label(value: string): string {
  return value
    .toLocaleLowerCase()
    .split('_')
    .map((word) => `${word.slice(0, 1).toLocaleUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function conceptStatus(concept: ConceptState): string {
  if (concept.status === 'NO_EVIDENCE') return 'No mastery evidence';
  if (concept.status === 'INSUFFICIENT_EVIDENCE') return 'Insufficient evidence';
  return label(concept.masteryBand ?? 'Estimated');
}

function mass(value: number): string {
  return value.toFixed(2);
}

export default function PlayerSkillsPage() {
  const [graph, setGraph] = useState<SkillGraph | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setGraph(null);
    setDetail(null);
    setSelectedId(null);
    const data = new FormData(event.currentTarget);
    const playedFrom = String(data.get('playedFrom') ?? '').trim();
    const playedTo = String(data.get('playedTo') ?? '').trim();
    try {
      const response = await fetch(`${apiUrl}/intelligence/player-skill-graph`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalIdentity: {
            provider: 'FIDE',
            externalId: String(data.get('fideId') ?? '').trim(),
          },
          ontologyVersion: String(data.get('ontologyVersion') ?? '').trim(),
          asOfDate: String(data.get('asOfDate') ?? '').trim(),
          scope: {
            gameContexts: data.getAll('gameContexts').map(String),
            timeCategories: data.getAll('timeCategories').map(String),
            playedFrom: playedFrom || null,
            playedTo: playedTo || null,
            sourceTypes: [],
          },
        }),
      });
      setGraph(await responseBody<SkillGraph>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Skill Graph request failed.');
    } finally {
      setLoading(false);
    }
  }

  async function selectConcept(stableId: string): Promise<void> {
    if (!graph) return;
    setSelectedId(stableId);
    setDetail(null);
    setDetailLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/skill-graph/runs/${graph.run.id}/concepts/${stableId}`,
      );
      setDetail(await responseBody<ConceptDetail>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Concept detail request failed.');
    } finally {
      setDetailLoading(false);
    }
  }

  function topDomain(concept: ConceptState): string | null {
    if (!graph || !concept.parent) return null;
    let current = graph.concepts.find(
      (entry) => entry.conceptStableId === concept.parent?.stableId,
    );
    const visited = new Set<string>();
    while (current?.parent && !visited.has(current.conceptStableId)) {
      visited.add(current.conceptStableId);
      current = graph.concepts.find((entry) => entry.conceptStableId === current?.parent?.stableId);
    }
    return current?.kind === 'DOMAIN' ? current.conceptStableId : concept.parent.stableId;
  }

  return (
    <section className="panel wide skill-graph-page">
      <p className="eyebrow">Learning intelligence · Task 009</p>
      <h1>Player Skill Graph</h1>
      <p>
        Version-pinned estimates from immutable concept evidence. Coverage and evidence mass come
        before any estimate; missing classification or engine evidence remains unknown.
      </p>

      <form onSubmit={submit}>
        <div className="form-grid three">
          <label>
            FIDE ID
            <input name="fideId" required pattern="\d{4,10}" placeholder="12456789" />
          </label>
          <label>
            Ontology version
            <input name="ontologyVersion" required defaultValue="1.0.0" pattern="\d+\.\d+\.\d+" />
          </label>
          <label>
            As of
            <input type="date" name="asOfDate" required defaultValue={today} />
          </label>
          <label>
            Played from
            <input type="date" name="playedFrom" />
          </label>
          <label>
            Played through
            <input type="date" name="playedTo" />
          </label>
        </div>
        <fieldset>
          <legend>Evidence scope — visible and exact</legend>
          <div className="filter-choices">
            <label className="inline-choice">
              <input type="checkbox" name="gameContexts" value="OTB" defaultChecked /> OTB
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="gameContexts" value="ONLINE" /> Online
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="CLASSICAL" defaultChecked />{' '}
              Classical
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="RAPID" /> Rapid
            </label>
            <label className="inline-choice">
              <input type="checkbox" name="timeCategories" value="BLITZ" /> Blitz
            </label>
          </div>
        </fieldset>
        <button disabled={loading}>
          {loading ? 'Building immutable run…' : 'Build Skill Graph'}
        </button>
      </form>

      {error ? <p className="status status-error">{error}</p> : null}
      {graph ? (
        <>
          <header className="dossier-heading">
            <div>
              <p className="eyebrow">Exact local player</p>
              <h2>{graph.run.player.displayName}</h2>
            </div>
            <small>
              {graph.run.player.identity?.provider} {graph.run.player.identity?.externalId} ·
              ontology {graph.run.ontologyVersion} · as of {graph.run.asOfDate}
            </small>
          </header>

          <section className="dossier-section coverage-first">
            <p className="eyebrow">Evidence coverage comes first</p>
            <h2>Coverage</h2>
            <div className="metric-grid coverage-grid skill-coverage-grid">
              <div>
                <span>Canonical games</span>
                <strong>{graph.coverage.canonicalGames}</strong>
              </div>
              <div>
                <span>Player decisions</span>
                <strong>{graph.coverage.decisionOccurrences}</strong>
              </div>
              <div>
                <span>Classified decisions</span>
                <strong>{graph.coverage.classifiedDecisions}</strong>
              </div>
              <div>
                <span>Engine-backed decisions</span>
                <strong>{graph.coverage.engineBackedDecisions}</strong>
              </div>
              <div>
                <span>Mastery-eligible evidence</span>
                <strong>{graph.coverage.masteryEligibleEvidence}</strong>
              </div>
            </div>
            <p className="help-text">
              Unclassified decisions and decisions without compatible engine state remain coverage
              gaps. They do not create negative mastery evidence.
            </p>
          </section>

          <section className="dossier-section">
            <p className="eyebrow">Ontology-shaped state · no mastery propagation</p>
            <h2>Skill Graph</h2>
            {graph.domains.map((domain) => {
              const concepts = graph.concepts.filter(
                (concept) => concept.kind !== 'DOMAIN' && topDomain(concept) === domain.stableId,
              );
              return (
                <section className="skill-domain" key={domain.stableId}>
                  <header>
                    <div>
                      <h3>{domain.displayName}</h3>
                      <small>
                        {domain.conceptsWithEvidence} concepts with evidence ·{' '}
                        {mass(domain.totalEffectiveEvidenceMass)} effective mass
                      </small>
                    </div>
                    <span>
                      {domain.conceptsEstimated} estimated · {domain.conceptsInsufficient}{' '}
                      insufficient
                    </span>
                  </header>
                  <div className="skill-concept-grid">
                    {concepts.map((concept) => (
                      <button
                        type="button"
                        className={`skill-concept-card skill-status-${concept.status.toLocaleLowerCase()} ${
                          selectedId === concept.conceptStableId ? 'selected' : ''
                        }`}
                        key={concept.conceptStableId}
                        onClick={() => void selectConcept(concept.conceptStableId)}
                      >
                        <strong>{concept.displayName}</strong>
                        <span>{conceptStatus(concept)}</span>
                        {concept.displayPosteriorMean === null ? null : (
                          <b>{(concept.displayPosteriorMean * 100).toFixed(0)}%</b>
                        )}
                        <small>
                          {label(concept.evidenceConfidence)} confidence · mass{' '}
                          {mass(concept.effectiveEvidenceMass)} · {concept.canonicalGameCount} games
                        </small>
                        {concept.status === 'NO_EVIDENCE' && concept.neutralExposureCount > 0 ? (
                          <small>
                            Neutral exposure {concept.neutralExposureCount} observations /{' '}
                            {concept.neutralExposureGameCount} games
                          </small>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </section>

          {detailLoading ? <p className="status status-info">Loading exact lineage…</p> : null}
          {detail ? (
            <section className="dossier-section skill-detail">
              <p className="eyebrow">Explainable concept state</p>
              <h2>{detail.state.displayName}</h2>
              <p>{detail.state.shortDescription}</p>
              <div className="metric-grid">
                <div>
                  <span>Status</span>
                  <strong className="small-metric">{conceptStatus(detail.state)}</strong>
                </div>
                <div>
                  <span>Effective + / − mass</span>
                  <strong>
                    {mass(detail.state.positiveEvidenceMass)} /{' '}
                    {mass(detail.state.negativeEvidenceMass)}
                  </strong>
                </div>
                <div>
                  <span>Raw + / − evidence</span>
                  <strong>
                    {detail.state.rawPositiveCount} / {detail.state.rawNegativeCount}
                  </strong>
                </div>
              </div>
              <p className="help-text">
                Posterior inputs α {mass(detail.state.posteriorAlpha)} · β{' '}
                {mass(detail.state.posteriorBeta)} · persisted reconstruction{' '}
                {detail.reconstruction.matchesPersistedState ? 'verified' : 'mismatch'}.
              </p>
              <details open>
                <summary>Contributing canonical games ({detail.contributions.length})</summary>
                {detail.contributions.length === 0 ? (
                  <p className="help-text">No mastery-eligible game contribution.</p>
                ) : (
                  detail.contributions.map((contribution) => (
                    <article className="skill-contribution" key={contribution.contributionId}>
                      <header>
                        <a href={contribution.links.game}>
                          {contribution.game.playedAt ?? 'Undated'} vs{' '}
                          {contribution.game.opponentName ?? 'Unknown opponent'}
                        </a>
                        <span>{contribution.game.result}</span>
                      </header>
                      <p>
                        Raw +{mass(contribution.weights.rawPositive)} / −
                        {mass(contribution.weights.rawNegative)} → capped +
                        {mass(contribution.weights.cappedPositive)} / −
                        {mass(contribution.weights.cappedNegative)} → recency{' '}
                        {mass(contribution.weights.recency)} → effective +
                        {mass(contribution.weights.effectivePositive)} / −
                        {mass(contribution.weights.effectiveNegative)}
                      </p>
                      <ul>
                        {contribution.evidence.map((source) => (
                          <li key={source.conceptEvidenceInstanceId}>
                            <a href={contribution.links.conceptEvidence}>
                              Evidence {source.conceptEvidenceInstanceId.slice(0, 8)}
                            </a>{' '}
                            · ply {source.occurrencePly + 1} · {source.polarity} ·{' '}
                            {source.historicalEvidenceRole} · {source.classifierId}{' '}
                            {source.classifierVersion}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))
                )}
              </details>
              <p className="help-text">
                Prerequisites:{' '}
                {detail.state.prerequisites.map((item) => item.displayName).join(', ') || 'None'}.
                Relationships are displayed only; V1 does not propagate mastery.
              </p>
            </section>
          ) : null}

          <section className="dossier-section methodology">
            <p className="eyebrow">Transparent V1 methodology</p>
            <h2>How this estimate is calculated</h2>
            <div className="metric-grid">
              <div>
                <span>Prior</span>
                <strong>
                  Beta({graph.policy.betaPrior.alpha}, {graph.policy.betaPrior.beta})
                </strong>
              </div>
              <div>
                <span>Role weights</span>
                <strong className="small-metric">
                  D {graph.policy.roleWeights.DIRECT} · S {graph.policy.roleWeights.SUPPORTING} · C{' '}
                  {graph.policy.roleWeights.CONTEXTUAL}
                </strong>
              </div>
              <div>
                <span>Game cap</span>
                <strong>{graph.policy.maximumGameContribution.toFixed(1)}</strong>
              </div>
              <div>
                <span>Recency</span>
                <strong>{graph.policy.recencyHalfLifeDays}-day half-life</strong>
              </div>
            </div>
            <p className="help-text">
              One canonical Game is the V1 correlation unit. Neutral and contextual observations add
              zero mastery mass. This is a Beta posterior heuristic, not Bayesian Knowledge Tracing,
              a weakness label, or a training recommendation.
            </p>
            <details>
              <summary>Immutable policy and scope</summary>
              <pre>
                {JSON.stringify({ policy: graph.policy, scope: graph.run.evidenceScope }, null, 2)}
              </pre>
            </details>
          </section>
        </>
      ) : null}
    </section>
  );
}
