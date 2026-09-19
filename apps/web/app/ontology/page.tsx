'use client';

import { useEffect, useMemo, useState } from 'react';

import { apiUrl } from '../api-client';

type ConceptKind = 'DOMAIN' | 'SKILL' | 'PRINCIPLE' | 'MOTIF' | 'TECHNIQUE' | 'STRUCTURE';

interface Concept {
  stableId: string;
  displayName: string;
  shortDescription: string;
  kind: ConceptKind;
  difficulty: string;
  status: 'ACTIVE' | 'DEPRECATED';
  aliases: string[];
  replacementConceptIds: string[];
}

interface Relationship {
  type: 'PARENT_OF' | 'PREREQUISITE_OF';
  fromConceptId: string;
  toConceptId: string;
}

interface OntologyView {
  version: string;
  status: 'PUBLISHED';
  contentSha256: string;
  publishedAt: string;
  counts: {
    concepts: number;
    domains: number;
    relationships: number;
    prerequisites: number;
    evidenceTypes: number;
    evidencePolicies: number;
  };
  concepts: Concept[];
  relationships: Relationship[];
}

interface ConceptSummary {
  stableId: string;
  displayName: string;
  kind: ConceptKind;
  difficulty: string;
  status: string;
}

interface EvidencePolicyView {
  stableId: string;
  displayName: string;
  description: string;
  sourceClass: string;
  allowedPolarities: string[];
  role: 'DIRECT' | 'SUPPORTING' | 'CONTEXTUAL';
  rationale: string;
}

interface ConceptDetailResponse {
  version: string;
  concept: Concept & {
    parent: ConceptSummary | null;
    children: ConceptSummary[];
    prerequisites: ConceptSummary[];
    dependents: ConceptSummary[];
    allowedEvidence: EvidencePolicyView[];
  };
}

interface ApiError {
  error?: { message?: string };
}

function ConceptLinks({
  title,
  concepts,
  onSelect,
}: {
  title: string;
  concepts: ConceptSummary[];
  onSelect: (stableId: string) => void;
}) {
  return (
    <section className="ontology-link-section">
      <h3>{title}</h3>
      {concepts.length === 0 ? (
        <p className="help-text">None in this version.</p>
      ) : (
        <div className="concept-chips">
          {concepts.map((concept) => (
            <button
              className="concept-chip"
              key={concept.stableId}
              onClick={() => onSelect(concept.stableId)}
              type="button"
            >
              {concept.displayName}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function OntologyPage() {
  const [ontology, setOntology] = useState<OntologyView | null>(null);
  const [selectedId, setSelectedId] = useState('calculation.candidate_moves');
  const [detail, setDetail] = useState<ConceptDetailResponse | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadOntology(): Promise<void> {
      try {
        const response = await fetch(`${apiUrl}/ontology/latest`);
        const body = (await response.json()) as OntologyView & ApiError;
        if (!response.ok) throw new Error(body.error?.message ?? 'Unable to load the ontology.');
        if (active) setOntology(body);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unexpected error.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadOntology();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ontology) return;
    const ontologyVersion = ontology.version;
    let active = true;
    async function loadDetail(): Promise<void> {
      try {
        const response = await fetch(
          `${apiUrl}/ontology/${ontologyVersion}/concepts/${encodeURIComponent(selectedId)}`,
        );
        const body = (await response.json()) as ConceptDetailResponse & ApiError;
        if (!response.ok) throw new Error(body.error?.message ?? 'Unable to load the concept.');
        if (active) {
          setDetail(body);
          setError(null);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unexpected error.');
      }
    }
    void loadDetail();
    return () => {
      active = false;
    };
  }, [ontology, selectedId]);

  const filteredIds = useMemo(() => {
    if (!ontology || !query.trim()) return null;
    const needle = query.trim().toLocaleLowerCase();
    return new Set(
      ontology.concepts
        .filter((concept) =>
          [concept.stableId, concept.displayName, ...concept.aliases].some((value) =>
            value.toLocaleLowerCase().includes(needle),
          ),
        )
        .map((concept) => concept.stableId),
    );
  }, [ontology, query]);

  if (loading) {
    return <section className="panel wide status status-info">Loading published ontology…</section>;
  }

  if (!ontology) {
    return (
      <section className="panel wide status status-error">{error ?? 'No ontology found.'}</section>
    );
  }

  const childrenByParent = new Map<string, Concept[]>();
  const conceptById = new Map(ontology.concepts.map((concept) => [concept.stableId, concept]));
  for (const relationship of ontology.relationships) {
    if (relationship.type !== 'PARENT_OF') continue;
    const child = conceptById.get(relationship.toConceptId);
    if (!child) continue;
    childrenByParent.set(relationship.fromConceptId, [
      ...(childrenByParent.get(relationship.fromConceptId) ?? []),
      child,
    ]);
  }

  function branchMatches(concept: Concept): boolean {
    if (!filteredIds) return true;
    if (filteredIds.has(concept.stableId)) return true;
    return (childrenByParent.get(concept.stableId) ?? []).some(branchMatches);
  }

  function renderBranch(concept: Concept, depth = 0) {
    const children = (childrenByParent.get(concept.stableId) ?? [])
      .filter(branchMatches)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
    if (!branchMatches(concept)) return null;
    return (
      <li key={concept.stableId}>
        <button
          aria-current={selectedId === concept.stableId ? 'true' : undefined}
          className={`ontology-tree-item ${selectedId === concept.stableId ? 'selected' : ''}`}
          onClick={() => setSelectedId(concept.stableId)}
          style={{ paddingLeft: `${0.7 + depth * 1.05}rem` }}
          type="button"
        >
          <span>{concept.displayName}</span>
          <code>{concept.stableId}</code>
        </button>
        {children.length > 0 ? (
          <ul>{children.map((child) => renderBranch(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  const domains = ontology.concepts
    .filter((concept) => concept.kind === 'DOMAIN' && branchMatches(concept))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const selected = detail?.concept;

  return (
    <section className="panel wide ontology-page">
      <div className="ontology-title-row">
        <div>
          <p className="eyebrow">Developer ontology explorer</p>
          <h1>Chess concepts and admissible evidence</h1>
          <p>
            Inspect the published vocabulary that future classification, skill graphs, and training
            systems must reference by stable ID.
          </p>
        </div>
        <div className="ontology-version">
          <strong>v{ontology.version}</strong>
          <span>{ontology.status}</span>
        </div>
      </div>

      <div className="metric-grid ontology-metrics">
        <div>
          <span>Concepts</span>
          <strong>{ontology.counts.concepts}</strong>
        </div>
        <div>
          <span>Domains</span>
          <strong>{ontology.counts.domains}</strong>
        </div>
        <div>
          <span>Prerequisites</span>
          <strong>{ontology.counts.prerequisites}</strong>
        </div>
        <div>
          <span>Evidence types</span>
          <strong>{ontology.counts.evidenceTypes}</strong>
        </div>
      </div>

      <div className="ontology-workspace">
        <aside className="ontology-browser">
          <label htmlFor="ontology-search">Search concepts</label>
          <input
            id="ontology-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, alias, or stable ID"
            type="search"
            value={query}
          />
          <p className="help-text">
            {filteredIds ? `${filteredIds.size} direct matches` : 'Browse all published concepts'}
          </p>
          <ul className="ontology-tree">{domains.map((domain) => renderBranch(domain))}</ul>
        </aside>

        <article className="ontology-detail">
          {!selected ? (
            <p className="status status-info">Loading concept detail…</p>
          ) : (
            <>
              <header>
                <div className="concept-badges">
                  <span>{selected.kind}</span>
                  <span>{selected.difficulty}</span>
                  <span>{selected.status}</span>
                </div>
                <h2>{selected.displayName}</h2>
                <code className="stable-id">{selected.stableId}</code>
                <p>{selected.shortDescription}</p>
              </header>

              <dl className="ontology-metadata">
                <div>
                  <dt>Parent</dt>
                  <dd>{selected.parent?.stableId ?? 'Top-level domain'}</dd>
                </div>
                <div>
                  <dt>Aliases</dt>
                  <dd>{selected.aliases.join(', ') || 'None'}</dd>
                </div>
                <div>
                  <dt>Replacements</dt>
                  <dd>{selected.replacementConceptIds.join(', ') || 'None'}</dd>
                </div>
              </dl>

              <div className="ontology-relations">
                <ConceptLinks
                  title="Children"
                  concepts={selected.children}
                  onSelect={setSelectedId}
                />
                <ConceptLinks
                  title="Prerequisites"
                  concepts={selected.prerequisites}
                  onSelect={setSelectedId}
                />
                <ConceptLinks
                  title="Dependents"
                  concepts={selected.dependents}
                  onSelect={setSelectedId}
                />
              </div>

              <section className="ontology-evidence">
                <h3>Allowed evidence policy</h3>
                {selected.allowedEvidence.length === 0 ? (
                  <p className="help-text">This grouping concept has no direct evidence policy.</p>
                ) : (
                  selected.allowedEvidence.map((evidence) => (
                    <article className="evidence-policy" key={evidence.stableId}>
                      <div>
                        <span className={`evidence-role role-${evidence.role.toLocaleLowerCase()}`}>
                          {evidence.role}
                        </span>
                        <strong>{evidence.displayName}</strong>
                        <code>{evidence.stableId}</code>
                      </div>
                      <p>{evidence.rationale}</p>
                      <small>
                        {evidence.sourceClass} · {evidence.allowedPolarities.join(' / ')}
                      </small>
                    </article>
                  ))
                )}
              </section>
            </>
          )}
          {error ? <p className="status status-error">{error}</p> : null}
        </article>
      </div>

      <footer className="ontology-provenance">
        <span>Canonical SHA-256</span>
        <code>{ontology.contentSha256}</code>
        <span>Published {new Date(ontology.publishedAt).toLocaleString()}</span>
      </footer>
    </section>
  );
}
