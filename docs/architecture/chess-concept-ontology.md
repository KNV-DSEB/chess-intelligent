# Chess Concept Ontology and Evidence Policy

Task 007 introduces the first Learning Intelligence boundary. It defines what chess concepts the academy recognizes, how they relate, and which kinds of future observations are admissible for each concept. It does not classify game decisions, store evidence instances, estimate mastery, diagnose weaknesses, or generate lessons.

## Source of truth and publication

`ontology/chess/1.0.0.json` is the canonical, reviewable source. A source contains:

- immutable semantic version and publication status;
- versioned concept definitions with stable identities;
- primary hierarchy and prerequisite relationships;
- versioned evidence-type definitions;
- explicit concept/evidence role policies and rationale.

`pnpm ontology:validate` validates this file without a database. `pnpm ontology:sync` applies migrations, validates the source, canonicalizes all unordered arrays, calculates SHA-256, and inserts one complete published version transactionally.

A repeated sync with the same semantic version and hash is idempotent. The same version with a different hash fails with `ONTOLOGY_VERSION_HASH_CONFLICT`; published rows are never updated. Any meaning, relationship, policy, or definition change therefore requires a new source version. Canonical hashing reconstructs objects in a fixed field order and sorts concepts, aliases, replacements, relationships, evidence definitions and polarities, and policies, so formatting, object-key order, and source-array order do not create false changes.

## Identity and versioned definitions

A concept stable ID is a lowercase namespaced value such as `calculation.candidate_moves`, `strategy.piece_activity`, or `endgame.rook_activity`. Stable IDs—not display labels—are the analytical join key. A wording-only rename can retain its ID in a new version. A material change of meaning requires a new ID; the old definition becomes `DEPRECATED` and can name one or more replacements.

The database separates `concept_identities` from `concept_definitions`. The former exists once per stable ID; the latter is keyed by ontology version and ID. This preserves historical interpretation while allowing later versions to revise display metadata or deprecate a concept.

Top-level grouping concepts use `domain.*`. V1 has seven domains: Calculation, Tactics, Strategy, Pawn Structure, Opening Principles, Endgame, and Decision Process. Every non-domain concept has exactly one primary parent and must reach one top-level domain. `decision.candidate_generation` is intentionally consolidated into `calculation.candidate_moves`; “Candidate generation” is an alias, avoiding two concepts with the same teachable meaning.

## Two graph semantics

`PARENT_OF` forms the primary browsing and curriculum hierarchy. It must be acyclic, every non-domain node has exactly one parent, and domain nodes have no parent.

`PREREQUISITE_OF` forms an independent learning-dependency DAG. It can cross domains and must also be acyclic. Difficulty is pedagogical metadata, not an Elo mapping. A prerequisite marked harder than its dependent produces a validation warning so an author must review the edge, but it does not invent player-rating thresholds.

`OntologyGraph` supports parent, child, top-level domain, descendant, prerequisite, and dependent traversal. `OntologyRegistry` adds active-ID checks, admissible-evidence lookup, and resolved concept detail for Tasks 008–010.

## Evidence types and policy

Evidence type definitions are versioned vocabulary, not evidence instances. Each type has a stable ID, a source class, and allowed polarity values. V1 distinguishes engine, position-rule, decision-classifier, training, coach, assessment, and game observations.

Each concept/evidence pair is explicitly allowlisted with one role:

- `DIRECT`: the evidence can directly support classifying or assessing this concept when its own producer contract is satisfied.
- `SUPPORTING`: the evidence corroborates an interpretation but is insufficient alone.
- `CONTEXTUAL`: the evidence helps explain importance or consequence but does not establish the concept.

For example, `position.tactical_motif` and a versioned `decision.classification` can be direct evidence for `tactics.deflection`. Generic `engine.eval_loss` is only contextual: a score change establishes objective consequence, not whether the cause was deflection, calculation, strategy, time management, or another concept. The validator rejects generic engine-loss types assigned as `DIRECT` to a specific concept.

Every active learnable leaf has at least one direct or supporting evidence path. A contextual engine signal alone cannot satisfy that requirement. Evidence policies include an author-written rationale to make downstream decisions inspectable.

## Relational model

Migration 008 adds:

- `ontology_versions`: immutable publication identity, status, canonical hash, timestamp;
- `concept_identities`: stable analytical identity across versions;
- `concept_definitions`: versioned label, description, kind, difficulty, status, aliases, and replacements;
- `concept_relationships`: versioned hierarchy and prerequisite edges with traversal indexes;
- `evidence_type_definitions`: versioned evidence vocabulary and source class;
- `concept_evidence_policies`: versioned allowlist, role, and rationale.

The relational rows make identity, traversal, and policy joins enforceable; the ontology is not persisted as one opaque JSON blob. Migration 008 creates no player-concept record, evidence instance, classifier output, mastery score, weakness label, lesson, or recommendation table.

## Read-only boundary

The Fastify API exposes:

- `GET /ontology/versions`
- `GET /ontology/latest`
- `GET /ontology/:version`
- `GET /ontology/:version/concepts/:stableId`

The latest and version routes accept an optional exact `domain` filter such as `tactics` or `domain.tactics`. Concept detail resolves parent, children, prerequisites, dependents, aliases, replacements, and admissible evidence definitions. There is deliberately no HTTP mutation or runtime concept-creation endpoint.

The developer explorer at `/ontology` searches stable ID, display name, and aliases; renders the hierarchy; and inspects dependency and evidence policy. It contains no player state or mastery UI.

## Downstream contract

Task 008 may produce versioned decision-to-concept evidence, but it must first resolve an active concept in the exact ontology version and verify that its evidence type is allowed. Evidence polarity must be one allowed by that version's evidence definition. Downstream records must retain both concept stable ID and ontology version so later ontology releases cannot reinterpret historical evidence silently.

An LLM may later explain already-verified structured evidence, but it cannot create ontology truth, chess truth, classifier truth, engine truth, or policy exceptions.
