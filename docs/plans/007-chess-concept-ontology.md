# Task 007 — Chess Concept Ontology & Evidence Policy V1

## Outcome

Introduce the first Learning Intelligence foundation: a source-controlled, immutable, versioned chess-concept vocabulary with hierarchy, prerequisite DAG, evidence registry/policies, validation, database synchronization, read-only APIs, and a developer explorer. Task 007 defines vocabulary and evidence compatibility only; it creates no evidence instances, classifier, mastery, weakness, lesson, or AI behavior.

## Canonical source and identity

- `ontology/chess/1.0.0.json` is the single canonical representation of concept definitions, relationships, evidence types, and concept/evidence policies.
- Stable IDs are lowercase namespaced strings and survive label/description changes. Semantically incompatible meaning receives a new stable ID plus deprecation/replacement metadata.
- V1 uses `domain.*` IDs for seven top-level domains and domain-specific IDs such as `strategy.piece_activity` for learnable concepts.
- The curated seed contains 64 concepts. `decision.candidate_generation` is consolidated into `calculation.candidate_moves`: the latter explicitly covers generating plausible candidates before concrete calculation, while Decision Process retains evaluation, plans, reassessment, threats, and time management.

## Versioning and immutable publication

- Published versions use `MAJOR.MINOR.PATCH`; Task 007 publishes `1.0.0` only.
- Canonicalization sorts concepts, aliases, replacements, relationships, evidence types/polarities, and evidence policies before compact JSON serialization and SHA-256 hashing.
- Sync validates first. An absent version is inserted transactionally; an existing equal hash is idempotent; an existing different hash fails and never updates published rows.
- Concept identity is stored separately from versioned definitions, allowing the same stable ID to remain addressable across future versions.

## Domain model and validation

- Add strongly typed concept kind, difficulty, status, relationship type, evidence source class, evidence role, and evidence polarity contracts.
- `OntologyValidator` checks schema/enums, ID format/uniqueness, hierarchy reachability and single-parent rules, hierarchy/prerequisite cycles, dangling/self/duplicate edges, deprecation replacements, and evidence policies.
- Every active non-domain hierarchy leaf must have a `DIRECT` or `SUPPORTING` evidence path; contextual engine loss alone is insufficient.
- A prerequisite harder than its dependent emits an actionable warning without blocking publication.
- `OntologyGraph` and `OntologyRegistry` provide reusable traversal/detail methods for Tasks 008–010.

## Persistence and synchronization

- Migration 008 adds published ontology versions, stable concept identities, versioned concept/evidence definitions, relationships, and allowed-evidence policies with traversal indexes.
- No opaque-only JSON storage, runtime editing endpoint, player mastery table, or evidence-instance table is added.
- `pnpm ontology:validate` requires no database. `pnpm ontology:sync` migrates, validates, hashes, and performs immutable synchronization.

## Read surface

- `GET /ontology/versions`
- `GET /ontology/latest`
- `GET /ontology/:version` with optional domain filtering
- `GET /ontology/:version/concepts/:stableId`
- Concept detail returns parent, children, prerequisites, dependents, aliases, replacements, and resolved allowed-evidence definitions.

## Developer explorer

- `/ontology` displays version/counts, searchable domain trees, and a selected concept detail panel.
- Search covers stable ID, display name, and aliases client-side.
- Prerequisite/evidence lists remain simple and inspectable; no graph-visualization dependency is introduced.

## Verification

- Unit fixtures cover invalid IDs, duplicates, dangling/multiple parents, reachability, hierarchy/prerequisite cycles, self edges, unknown evidence, duplicate policies, warnings, Elo-field prohibition, deterministic hashing, and seed quality.
- Repository/API tests cover first sync, idempotency, mutation protection, parallel versions, stable identities, deprecated historical definitions, latest/version/concept retrieval, traversal, and evidence policies.
- Verify migrations 001–008 and Task 006→007 compatibility, all repository checks, production build, browser workflow, responsive layout, and secret/temp audit.
