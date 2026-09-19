'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiUrl } from '../../api-client';

interface EvidenceItem {
  id: string;
  occurrencePly: number;
  decisionPly: number;
  conceptStableId: string;
  concept: {
    displayName: string;
    kind: string;
    difficulty: string;
  };
  conceptDescription: string;
  evidenceTypeDisplayName: string;
  evidenceRole: string;
  polarity: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  subjectKind: 'POSITION' | 'DECISION';
  subjectColor: 'WHITE' | 'BLACK';
  classifierId: string;
  classifierVersion: string;
  ruleId: string;
  exactHistorySha256: string;
  analysisRunId: string | null;
  facts: Record<string, string | number | boolean | string[]>;
  playedMoveSan: string;
  playedMoveUci: string;
}

interface EvidenceProjection {
  run: {
    id: string;
    ontologyVersion: string;
    classifierBundleVersion: string;
    classifierConfigSha256: string;
    selectedAnalysisRunId: string | null;
    evidenceCount: number;
    completedAt: string;
  };
  evidence: EvidenceItem[];
  limitations: {
    decisionQualityEvidenceLimited: boolean;
    message: string;
  };
}

interface ClassificationResult {
  classificationRunId: string;
  evidenceCount: number;
  deduplicated: boolean;
}

async function responseJson<Response>(response: globalThis.Response): Promise<Response> {
  const body = (await response.json()) as Response & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return body;
}

function factsText(facts: EvidenceItem['facts']): string {
  return Object.entries(facts)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ');
}

export function ConceptEvidencePanel({ gameId }: { gameId: string }) {
  const [projection, setProjection] = useState<EvidenceProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEvidence = useCallback(
    async (classificationRunId?: string) => {
      const suffix = classificationRunId
        ? `?classificationRunId=${encodeURIComponent(classificationRunId)}`
        : '';
      const response = await fetch(`${apiUrl}/games/${gameId}/concept-evidence${suffix}`);
      if (response.status === 404) {
        setProjection(null);
        return;
      }
      setProjection(await responseJson<EvidenceProjection>(response));
    },
    [gameId],
  );

  useEffect(() => {
    void loadEvidence().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not load concept evidence.');
    });
  }, [loadEvidence]);

  const grouped = useMemo(() => {
    const groups = new Map<number, EvidenceItem[]>();
    for (const evidence of projection?.evidence ?? []) {
      const current = groups.get(evidence.occurrencePly) ?? [];
      current.push(evidence);
      groups.set(evidence.occurrencePly, current);
    }
    return [...groups.entries()];
  }, [projection]);

  async function classify() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiUrl}/classification/games/${gameId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ontologyVersion: '1.0.0' }),
      });
      const result = await responseJson<ClassificationResult>(response);
      await loadEvidence(result.classificationRunId);
      setNotice(
        result.deduplicated
          ? 'The matching immutable classification run already existed.'
          : `Classification completed with ${result.evidenceCount} evidence records.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not classify this game.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="concept-evidence-panel" id="concept-evidence">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deterministic · ontology-governed</p>
          <h2>Concept Evidence</h2>
          <p className="help-text">
            Objective motifs and structures are kept separate from engine-supported decision
            evidence. This view makes no mastery or weakness claim.
          </p>
        </div>
        <button type="button" onClick={() => void classify()} disabled={loading}>
          {loading
            ? 'Classifying…'
            : projection
              ? 'Run classification again'
              : 'Run classification'}
        </button>
      </div>

      {notice ? <p className="status status-success">{notice}</p> : null}
      {error ? <p className="status status-error">{error}</p> : null}
      {!projection ? (
        <p className="status status-info">
          No successful concept classification exists for this game yet.
        </p>
      ) : (
        <>
          <p
            className={`status ${
              projection.limitations.decisionQualityEvidenceLimited
                ? 'status-info'
                : 'status-success'
            }`}
          >
            {projection.limitations.message}
          </p>
          <div className="classification-provenance">
            <span>Ontology {projection.run.ontologyVersion}</span>
            <span>{projection.run.classifierBundleVersion}</span>
            <span>{projection.run.evidenceCount} evidence records</span>
            <span>
              Engine {projection.run.selectedAnalysisRunId ? 'compatible QUICK_V1' : 'not used'}
            </span>
          </div>
          {grouped.length === 0 ? (
            <p className="status status-info">
              The conservative V1 rules found no supported concept evidence in this game.
            </p>
          ) : (
            <div className="concept-occurrences">
              {grouped.map(([occurrencePly, evidence]) => (
                <section className="concept-occurrence" key={occurrencePly}>
                  <header>
                    <strong>
                      Decision ply {occurrencePly + 1} — {evidence[0]!.playedMoveSan}
                    </strong>
                    <code>{evidence[0]!.playedMoveUci}</code>
                  </header>
                  <div className="concept-card-grid">
                    {evidence.map((item) => (
                      <article className="concept-evidence-card" key={item.id}>
                        <div className="concept-card-heading">
                          <div>
                            <span className="eyebrow">
                              {item.concept.kind} · {item.subjectColor}
                            </span>
                            <h3>{item.concept.displayName}</h3>
                          </div>
                          <span className={`polarity polarity-${item.polarity.toLowerCase()}`}>
                            {item.polarity}
                          </span>
                        </div>
                        <p>{item.conceptDescription}</p>
                        <p className="classifier-facts">{factsText(item.facts)}</p>
                        <dl className="evidence-metadata">
                          <div>
                            <dt>Evidence</dt>
                            <dd>
                              {item.evidenceTypeDisplayName} · {item.evidenceRole}
                            </dd>
                          </div>
                          <div>
                            <dt>Subject</dt>
                            <dd>{item.subjectKind}</dd>
                          </div>
                          <div>
                            <dt>Classifier</dt>
                            <dd>
                              <code>
                                {item.classifierId}_{item.classifierVersion}
                              </code>
                            </dd>
                          </div>
                          <div>
                            <dt>Rule</dt>
                            <dd>
                              <code>{item.ruleId}</code>
                            </dd>
                          </div>
                        </dl>
                        <details>
                          <summary>Exact provenance</summary>
                          <p>
                            Concept <code>{item.conceptStableId}</code>
                            <br />
                            History <code>{item.exactHistorySha256}</code>
                            <br />
                            Analysis <code>{item.analysisRunId ?? 'not used'}</code>
                          </p>
                        </details>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
