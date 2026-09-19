# Project Context — Chess Intelligence Platform

> This file is the concise architectural memory of the project.
>
> Read this before making cross-cutting changes.
>
> Detailed implementation rules live in `AGENTS.md` and `docs/architecture/*`.
> This file must remain short, current, and high-level. It is not a changelog.

---

## 1. Product thesis

This product is an:

> **Academy-first, analysis-first chess intelligence and learning platform.**

It is NOT a chess-playing server.

Users play chess elsewhere and use this platform for:

- academy and coach workflows;
- game analysis;
- player intelligence;
- opponent preparation;
- opening/repertoire intelligence;
- concept-level learning analytics;
- future adaptive training;
- future grounded AI coaching.

Long-term target users include:

- children and beginners;
- club players;
- tournament players;
- coaches;
- academies;
- titled players and professional analysts.

The initial go-to-market orientation is:

```text
Academy
  ↓
Coach
  ↓
Students
  ↓
Serious Players
```

The product architecture must remain broad enough for all player levels.

---

# 2. Strategic differentiation

The project does NOT aim to beat Chess.com or Lichess at hosting games.

It does NOT aim to beat ChessBase by simply having a larger database.

The intended differentiation is:

```text
Game
 ↓
Analysis
 ↓
Player Understanding
 ↓
Concept Evidence
 ↓
Skill Model
 ↓
Training
 ↓
Coach Workflow
 ↓
Measured Improvement
```

The long-term moat is expected to come from:

```text
canonical chess data
+
player history
+
learning ontology
+
concept evidence
+
skill graph
+
coach/student workflows
+
training outcomes
```

not from Stockfish or an LLM alone.

---

# 3. Current milestone

Completed:

```text
Task 001 — PGN/Data Foundation
Task 002 — Metadata-Only OTB Games & PGN Reconciliation
Task 003 — Position Corpus Explorer / Historical Intelligence
Task 004 — Stockfish Analysis Pipeline / Engine Intelligence
Task 005 — Opponent Opening Intelligence
Task 006 — Player Intelligence / Opponent Dossier
Task 007 — Chess Concept Ontology
Task 008 — Concept Evidence Classification
Task 009 — Player Skill Graph & Mastery Estimation V1
Task 010 — Adaptive Training Engine V1
Task 011 — Coach / Student Intelligence V1
Task 012 — Academy Production Foundation V1
Task 013 — Production Verification & Deployment Gate V1 (implementation complete)
Task 014 — Production Gate Execution & Blocker Remediation V1 (execution complete)
Task 015 — Production Topology & Four-Role Browser Gate Closure V1
Task 016 — Learning Intelligence Expansion, Grounded AI Briefing & Pilot Experience V1
Pilot 001 — Private Academy Pilot Readiness & Launch V1 (implementation complete; launch blocked)
Pilot 001B — Real Deployment & Launch Gate Closure V1 (rc5 Railway API bind remediation published;
environment execution blocked)
Pilot 001C — Product UX Reconstruction & Pilot Experience V2 (`pilot-001-rc8` source/local browser
acceptance complete; deployment not run)
Pilot 001D — Public Landing, Self-Service Signup & Academy Onboarding (`pilot-001-rc9` source,
integration, build, and responsive QA complete; deployed acceptance not run)
```

Current production gate:

```text
PRODUCTION_GATE_PASSED_WITH_NON_BLOCKING_RISKS

Task 015 verified the then-current eight-service acceptance topology, migrations,
explicit ontology publication, HTTPS proxy, SMTP failure/recovery, real Stockfish
18 Worker job, four-role browser UI matrix, session/password/consent lifecycle,
tenant attacks, exact training lineage, persistence recreation, repository checks,
and build. Pilot 001 now separates those local acceptance dependencies from the
public launch profile: automatic public ACME TLS and external transactional SMTP
are required, while the local internal-CA/Mailpit topology remains test-only.

Non-blocking risks:
- a fresh dependency audit remains NOT_RUN because external manifest disclosure
  was not authorized;
- the Windows Docker Desktop acceptance host has a recurring optional-component
  stale AF_UNIX listener defect; non-destructive recovery preserved all data;
- the historical internal Caddy TLS and Mailpit evidence proves protocol behavior,
  not public certificate issuance or real-provider deliverability; Pilot launch
  remains blocked until the external services are exercised;
- the GHCR Pilot Worker image now compiles pinned Stockfish 18 for Linux x86-64,
  while every engine run still retains its exact binary hash/version provenance.
```

Expected future direction:

```text
Next — resume Pilot 001B launch closure: same-origin/free-domain session, transactional SMTP,
deployed four-role matrix, and one full deployed learning-loop dry run
Then — run the private academy pilot and define Task 017 only from reviewed human Pilot evidence
```

Current Pilot gate:

```text
PILOT_BLOCKED

Pilot 001B added the Vercel Web-only release boundary, a digest-pinned backend-only
container profile for external managed PostgreSQL, migration/restore verification
through Pilot migration 017, and a tag-only GHCR publication boundary for separate
compiled API and Worker images. The Worker image builds pinned Stockfish 18 as a
separate UCI executable and includes its GPL license/corresponding source. The explicit
launch mode is AI_DISABLED_FOR_PILOT.

`pilot-001-rc4` at `37386cc86266e6ce7fd3dec8e2763c607287e0ac` published separate
public API and Worker GHCR packages. Railway then exposed a production blocker: the active
API container listened on loopback and ignored Railway's `PORT`. `pilot-001-rc5` at
`6e2617ea210562b3b2144549efe078a1b5b1dc2b` binds the API to `0.0.0.0` and prefers the platform
port while preserving the existing configured fallback port. Its public immutable API image is
`ghcr.io/knv-dseb/chess-intelligent-api@sha256:22ee3485b956d99b9a2ce08c6a94716079b6932543bdad8158d9f1827d6168bc`.
Rc3 and rc4 remain immutable, and rc5 does not change database, auth, CORS, sessions, Worker,
Stockfish, or product behavior. Railway Pilot and restore PostgreSQL instances are
operator-provisioned but not yet verified. Launch still requires the rc5 API digest to be deployed,
Vercel, real Pilot hostnames with trusted TLS,
transactional email, provisioned Pilot identities/consent, the deployed four-role
Coach+Student dry run, named operational owners, and separate backup/restore proof.

Pilot 001C reconstructs the Web presentation around the existing verified loop:
Coach attention → exact Student evidence → training assignment → Student attempt → compatible
progress review. It changes no API, database, ontology, classifier, learning policy, authorization,
or Pilot event contract. Its deterministic PGlite fixture and local browser screenshots are UX
acceptance only and never deployed-production evidence.

Primary Coach/Student surfaces now use task language, show useful chess evidence before technical
lineage, preserve unsupported/no-evidence/insufficient/estimated distinctions, and place raw IDs,
hashes, and policy metadata behind advanced provenance disclosure. Coach navigation is Home →
Students → Training → Progress; Student navigation is Today → Training → Progress.
```

Do not implement future milestones inside the current task unless explicitly requested.

---

# 4. Architecture layers

The current system can be understood as these layers:

```text
1. Canonical Data
      ↓
2. Historical Intelligence
      ↓
3. Engine Intelligence
      ↓
4. Opponent / Player Intelligence
      ↓
5. Chess Knowledge Ontology
      ↓
6. Concept Evidence
      ↓
7. Skill Graph
      ↓
8. Training
      ↓
9. Academy / Coach Workflow
      ↓
10. Secure Production Access
      ↓
11. Grounded AI Briefing  ← optional explanation layer
12. Pilot Observation      ← operational measurement, never learning evidence
```

Each layer should depend on trusted structured outputs from earlier layers.

Do not collapse these boundaries.

---

# 5. Canonical game model

A real-world chess game is represented by ONE canonical:

```text
Game
```

Multiple observations may reference it:

```text
Game
 ├── metadata provenance
 ├── PGN provenance
 ├── provider provenance
 └── future licensed-source provenance
```

Statistical unit:

> **canonical Game**

NOT:

> provenance observation.

A game may exist without moves:

```text
METADATA_ONLY
```

and later receive a reviewed PGN while preserving the same canonical Game identity.

---

# 6. Identity model

Internal:

```text
Player
```

is separate from:

```text
ExternalIdentity
```

Examples:

```text
FIDE ID
Lichess username
Chess.com username
```

Rules:

- never merge people by display name alone;
- exact verified identity is preferred;
- FIDE ID is a high-value identity anchor;
- external identity inference must remain conservative;
- fuzzy identity resolution is not currently implemented.

---

# 7. Position model

Historical corpus analytics use normalized position identity based on:

```text
first four FEN fields
```

This supports:

```text
transposition-aware historical analysis
```

But:

> normalized Position ID is NOT a complete engine-analysis state.

Engine truth depends on:

```text
Game
+
PositionOccurrence
+
exact move history
+
engine configuration
```

Never reuse engine evidence solely because normalized Position IDs match.

---

# 8. Historical Intelligence

Task 003 provides:

```text
Position → observed moves
```

with filters including:

- Player;
- exact identity;
- color;
- OTB / online;
- time category;
- date;
- historical opponent Elo;
- source.

Historical statistics are:

> evidence of what happened,

not:

> chess truth.

Never label a move "best" solely from frequency or historical result.

---

# 9. Engine Intelligence

Task 004 provides asynchronous, immutable engine analysis.

Key invariants:

```text
AnalysisJob
→ AnalysisRun
→ EnginePositionState
→ EngineEvaluation
→ MoveAssessment
→ CriticalPosition
```

Persisted scores are:

```text
White-relative
```

Score types remain separate:

```text
CENTIPAWN
MATE
```

Mate is never converted to fake centipawns.

Engine results preserve:

- engine identity;
- reported version/name;
- binary SHA-256;
- profile;
- options;
- search limit;
- MultiPV;
- exact history.

Current primary engine profile:

```text
QUICK_V1
```

Stockfish is an external UCI process.

Do not make LLMs responsible for chess truth.

---

# 10. Opponent Opening Intelligence

Task 005 combines:

```text
Opponent historical behavior
+
Strong-player reference corpus
+
Compatible engine evidence
```

These evidence dimensions must remain independently visible.

Important rules:

```text
frequency ≠ move quality
rare ≠ good surprise
engine eval ≠ practical preparation value
```

Preparation candidates are:

> study candidates,

not:

> guaranteed best counters.

---

# 11. Player Intelligence

Task 006 provides structured Player Dossiers including:

- corpus coverage;
- player-perspective W/D/L;
- recorded rating observations;
- repertoire;
- engine decision metrics;
- advantage conversion;
- disadvantage recovery;
- recurring engine-assessed events;
- objective behavioral indicators.

It does NOT infer psychological traits.

It does NOT call recurring engine events "weaknesses".

Coverage must always be shown before conclusions.

---

# 12. Chess Concept Ontology

Current published ontology:

```text
version: 1.0.0
concepts: 64
domains: 7
evidence types: 12
```

Canonical source:

```text
ontology/chess/1.0.0.json
```

Published ontology versions are immutable.

Stable concept IDs survive label changes.

Example:

```text
tactics.fork
strategy.piece_activity
calculation.candidate_moves
endgame.rook_activity
```

Ontology relationships:

```text
hierarchy
prerequisites
```

Hierarchy is single-parent.

Prerequisites form a DAG.

Do not edit published `1.0.0`.

Semantic changes require a new ontology version.

---

# 13. Evidence model

Task 007 defines evidence policies.

Roles:

```text
DIRECT
SUPPORTING
CONTEXTUAL
```

Polarity:

```text
POSITIVE
NEGATIVE
NEUTRAL
```

Generic engine loss is not direct evidence of a specific chess concept.

Example:

```text
200 cp loss
```

does NOT imply:

```text
tactics.fork
strategy.king_safety
calculation.visualization
```

without an appropriate classifier.

---

# 14. Concept Evidence Classification

Task 008 produces immutable:

```text
ConceptEvidenceInstance
```

Pipeline:

```text
exact game history
→ chess-core fact
→ classifier candidate
→ ontology validation
→ immutable evidence
```

Current deterministic V1 concepts include selected:

```text
tactical motifs
pawn / structural features
```

Classification favors:

> precision over recall.

False negatives are preferred over false-positive concept evidence.

Classifier output is versioned.

Ontology version is always preserved.

Task 016 adds `CONCEPT_CLASSIFIER_BUNDLE_V2` without editing ontology `1.0.0`. New runs can
observe 13 concepts: eight tactical decision concepts that are also trainable and five neutral
structural concepts. `CONCEPT_COVERAGE_REPORT_V1` assigns every one of the 64 ontology concepts
exactly one support status. V1 remains explicitly selectable and reproducible.

---

# 15. Critical evidence invariant

The following are distinct:

```text
POSITION FEATURE

DECISION EVIDENCE

PLAYER MASTERY
```

Example:

```text
Position contains an IQP
```

is NEUTRAL exposure.

It does NOT imply:

```text
Player understands IQP
```

This distinction must survive all future learning layers.

---

# 16. Player Skill Graph

Task 009 aggregates immutable Task 008 evidence into immutable, policy-versioned Player Skill Graph runs.

Current invariants:

```text
explicit ontology version → one immutable OntologyRegistry per run

focal-player decision universe → coverage projection

neutral evidence → no mastery update

contextual evidence → no mastery weight in V1

direct/supporting evidence → versioned weighting

multiple events in one Game → correlated

recent evidence → stronger than old evidence

mastery estimate → always accompanied by evidence mass

missing classification/engine evidence → UNKNOWN

effective contribution → exact concept_evidence_instance lineage
```

One canonical Game is the V1 correlation unit; multiple evidence events or classification reruns for that Game are not independent samples. Recency uses an explicit date-only `asOfDate`. Task 009 never reclassifies chess data and does not infer weaknesses or training priorities.

---

# 17. Adaptive Training Engine

Task 010 closes the first explicit learning loop:

```text
Concept Evidence
      ↓
Player Skill Graph
      ↓
Training Candidate Selection
      ↓
Training Plan / exact-state Item
      ↓
Training Attempts
      ↓
Training Evidence
      ↓
New Skill Graph V2
```

Current invariants:

```text
NO_EVIDENCE → diagnostic uncertainty, never weakness
remediation → sufficiently supported negative mastery evidence
TrainingPlanRun → one explicit immutable SkillGraphRun
TrainingItem → verifiable local Task 008 + Task 004 source truth
TrainingAttempt → immutable server-scored interaction
TrainingEvidenceInstance → separate ontology-governed evidence origin
one TrainingItem's retries → correlated, first scored attempt selected in V1
SKILL_GRAPH_POLICY_V1 → unchanged historical truth
SKILL_GRAPH_POLICY_V2 → additive Game + Training evidence with exact snapshot
```

Every training-derived contribution traces to its evidence, attempt, item, Task 008 source evidence, canonical Game, and exact occurrence. Training never creates a concept from generic engine loss and never mutates an earlier Skill Graph.

Future coach/academy workflows should consume these structured runs, plans, attempts, and evidence.

Future LLM behavior should consume this structured evidence.

The LLM must not invent player state from raw PGNs.

---

# 18. Academy / Coach Workflow

Task 011 adds an operational layer over immutable Skill Graph and Training artifacts:

```text
Academy roster
→ StudentProfile linked to canonical Player
→ compatible Student Intelligence
→ TrainingAssignment from an existing TrainingPlan
→ Task 010 attempts/evidence
→ explicit comparable Skill Graph review
```

StudentProfile, Player, Academy membership, and future User identity remain separate. The same Player may appear through different StudentProfiles in multiple Academies. Progress requires identical Player, ontology, policy configuration, classifier semantics, and evidence scope; a different evidence snapshot is expected.

Assignments never create mastery evidence. Completion derives from Task 010 attempts after assignment time, and a repeated measured item remains practice rather than a new independent measurement. Coach notes are operational text only. Academy dashboards expose coverage and operational attention signals without ranking Students.

Current Academy routes authenticate opaque server-side sessions, derive the active same-Academy membership on the server, enforce `ACADEMY_RBAC_V1`, and expose Student self-service only through User → membership → StudentProfile → Player attribution. Generic evidence-writing routes are disabled by default outside explicit internal development mode.

---

# 19. Data provenance

Data provenance is first-class.

Every external or imported observation should preserve:

```text
source
external identifier
retrieval/import time
license/permission state
raw source metadata where appropriate
```

Do not build a data dependency on unauthorized scraping.

---

# 20. External data policy

Current strategy:

### User-owned/imported PGNs

Allowed project source.

### Lichess

Architecture supports future use of permitted/open data.

### Chess-Results

High strategic value for OTB tournament data, but currently:

```text
PENDING_LICENSE_REVIEW
```

Do NOT scrape.

### Chess.com

Only use authorized integration paths.

Do NOT build unauthorized scraping/mining dependencies.

### FIDE

Useful identity/rating source, but commercial reuse must be handled deliberately.

No external provider integration should be added unless explicitly scoped and permitted.

---

# 21. Important licensing boundaries

Stockfish is used as:

```text
external UCI process
```

and is not committed into the repository. The Pilot Worker container build compiles the
exact Stockfish 18 upstream revision recorded in `THIRD_PARTY_LICENSES.md`, executes it
through the same UCI process boundary, and ships the GPL license plus corresponding
source archive in the image.

Chess-specific dependencies must be reviewed in:

```text
THIRD_PARTY_LICENSES.md
```

Do not copy proprietary UI/content/code from:

- ChessBase;
- Chess.com;
- Chessable;
- other commercial products.

---

# 22. Core technology

Current architecture is primarily:

```text
TypeScript
Next.js
Fastify
PostgreSQL
pnpm workspace
```

with packages separated for:

```text
domain
database
chess-core
UI/config as appropriate
```

Stockfish runs through:

```text
apps/worker
```

as an external process.

Do not introduce new infrastructure without demonstrated need.

---

# 23. Infrastructure philosophy

Prefer:

```text
PostgreSQL
simple workers
typed domain logic
deterministic algorithms
```

over unnecessary:

```text
Kafka
Neo4j
Elasticsearch
ClickHouse
Kubernetes
ML microservices
```

unless a later scale requirement clearly justifies them.

---

# 24. Domain boundaries

General ownership:

```text
packages/chess-core
→ chess rules, board geometry, deterministic chess facts

packages/domain
→ domain models, policies, aggregation math

packages/db
→ persistence and analytical queries

apps/api
→ HTTP/application orchestration

apps/worker
→ asynchronous engine work

apps/web
→ UI
```

Do not place heavy chess truth or statistical policy inside route handlers.

---

# 25. Immutability philosophy

The project heavily relies on historical reproducibility.

Immutable/versioned artifacts include:

```text
published ontology versions
engine AnalysisRuns
classification runs
concept evidence
future SkillGraphRuns
```

When logic changes:

```text
new version
→ new immutable result
```

not:

```text
rewrite history
```

---

# 26. AI philosophy

AI is a future explanation/orchestration layer.

LLMs may eventually:

- explain;
- summarize;
- teach;
- ask Socratic questions;
- generate lesson wording;
- translate structured evidence into human language.

LLMs must NOT become authoritative for:

- legal moves;
- engine evaluation;
- ratings;
- identity;
- historical statistics;
- ontology existence;
- concept evidence truth;
- mastery mathematics.

Structured systems remain authoritative.

Task 016 introduces an optional Grounded AI Briefing boundary. It receives one compact,
Academy-scoped, explicit Skill Graph/TrainingPlan/coverage/evidence snapshot. Every output claim
must cite a permitted reference and pass server validation; provider failures and invalid output
persist nothing. Successful artifacts are append-only explanation provenance. The product remains
fully operational when no provider is configured.

---

# 27. Academy-first principle

The long-term product must work for:

```text
Student
Coach
Academy
Serious Player
Professional Analyst
```

The same core chess truth may need different UX.

Example:

```text
Professional UI
→ detailed engine/evidence metrics

Student UI
→ simplified concept guidance

Coach UI
→ cohort/progress/evidence
```

Do not hard-code one player level into core domain models.

---

# 28. Child-friendly product principle

The product should eventually be much more approachable than traditional professional chess database software.

However:

> child-friendly UX must not mean simplified or corrupted chess truth.

Use different presentation layers over the same trusted core.

---

# 29. Current verification constraints

Development has historically encountered:

- very low free space on `C:`;
- Docker / PostgreSQL availability varying by environment;
- real Stockfish often unavailable because `STOCKFISH_PATH` is unset;
- occasional pnpm wrapper behavior attempting unnecessary installs.

Use existing installed workspace binaries when appropriate.

Prefer `D:` for task-specific temp/build data when configurable.

Do not:

```text
global Docker prune
```

or modify machine-wide configuration without explicit permission.

If real PostgreSQL or Stockfish cannot be verified:

state the gap honestly.

Do not fabricate verification.

---

# 30. Testing philosophy

Prefer:

```text
small deterministic fixtures
```

over huge external datasets.

Tests should protect conceptual invariants, not just API status codes.

Particularly important invariants include:

```text
canonical Game counting
exact identity
position transpositions
engine exact-history safety
White/Black perspective
mate semantics
ontology immutability
generic engine loss ≠ concept
neutral evidence ≠ mastery
```

---

# 31. Current major project invariants

Do not violate these without explicit architectural review:

1. One real-world game → one canonical Game.
2. Multiple provenance observations must not double-count a Game.
3. Player names alone do not prove identity.
4. Position hash is useful for corpus analysis, not sufficient for engine-state identity.
5. Historical statistics describe observations, not chess truth.
6. Engine evidence must preserve exact version/config/history.
7. Mate is structurally distinct from centipawns.
8. Published ontology versions are immutable.
9. Concepts are referenced by stable IDs.
10. Generic engine loss does not identify a specific concept.
11. Neutral evidence does not imply player understanding.
12. Classifier changes require versioning.
13. Historical analytical artifacts should remain reproducible.
14. External sites must not be scraped without authorization.
15. AI may explain structured truth but must not replace it.
16. Unknown/insufficient evidence is diagnostic uncertainty, not weakness.
17. Training decisions pin one immutable Skill Graph and verifiable local source evidence.
18. Training attempts and evidence are immutable; retries on one item are correlated.
19. Training-augmented mastery uses explicit V2 policy/snapshot lineage and never rewrites V1.
20. Production conclusions require real PostgreSQL; PGlite alone is insufficient.
21. A backup is trusted only after a separate restore and integrity comparison succeeds.
22. Production migration rollback uses verified backup/restore unless a migration is explicitly and safely reversible.
23. Secure cookies and authorization must be verified through the deployed HTTPS/browser boundary.
24. Invitation and password-reset tokens are high-entropy, single-use, hashed at rest, and never logged.
25. Readiness fails on unavailable or incompatible critical dependencies; authorization failures fail closed.
26. Deployment, recovery, and benchmark commands require explicit acknowledged targets.
27. Release status is evidence-based and blockers are never relabeled as warnings for milestone completion.
28. The Task 015 production report supersedes the Task 014 blocked decision with `PRODUCTION_GATE_PASSED_WITH_NON_BLOCKING_RISKS`; the remaining dependency-audit, public TLS, transactional-email, Docker Desktop host, and operator Stockfish concerns stay explicit non-blocking risks.
29. Pilot events and human feedback are append-only Academy-scoped operational observations; they never update chess truth, concept/training evidence, mastery, assignments, identity, consent, or security provenance.
30. Pilot usage metrics always expose denominators and never claim learning effectiveness.
31. Pilot Student readiness is an operational prerequisite projection; missing games, analysis, graph, or coverage is unknown availability, never negative mastery.
32. Browser telemetry may report only approved open/navigation observations. Successful state-changing workflow events are recorded by authenticated server handlers.
33. Pilot AI smoke uses synthetic contexts only. AI remains optional and can be disabled without blocking the structured Coach/Student workflow.
34. `PILOT_READY` requires deployed-environment proof; source checks cannot substitute for public TLS, transactional email, real-provider smoke when enabled, tenant browser verification, or a separate backup restore.
35. Public signup creates only User/Credential/Session state. Academy ownership is a separate
    authenticated transaction; Coach/Admin/Student roles remain invitation-assigned.
36. Pilot browser API traffic uses the single same-origin `/backend` boundary. Fastify still
    requires the exact public Web Origin and production session cookies remain host-only.

---

# 32. Important documentation

Read task-specific details from:

```text
docs/architecture/
```

Important documents currently include:

```text
overview.md
data-provenance.md
game-reconciliation.md
position-corpus-explorer.md
engine-analysis.md
opponent-opening-intelligence.md
player-intelligence-dossier.md
chess-concept-ontology.md
concept-evidence-classification.md
```

Task 009 architecture:

```text
player-skill-graph.md
adaptive-training-engine.md
```

Classifier rules:

```text
docs/classifiers/v1.md
```

Ontology authoring:

```text
docs/ontology/concept-authoring-guide.md
```

Skill Graph policy:

```text
docs/skill-model/v1.md
docs/training/v1.md
```

---

# 33. Agent workflow

For a new task:

1. read this file;
2. read `AGENTS.md`;
3. use Graphify to inspect relevant code/schema dependency paths when available;
4. open the concrete source files returned by that investigation;
5. read only task-relevant architecture documentation;
6. plan;
7. implement;
8. verify;
9. update this file only if the current architectural state materially changed.

Graphify is a codebase-navigation aid, not product-domain truth. Repository source, migrations, published ontology versions, persisted analytical artifacts, and explicit architecture documents remain authoritative. Dynamic HTTP fetch boundaries and SQL relationships may require direct inspection when graph edges are incomplete; runtime product logic must never depend on Graphify.

Do not turn `PROJECT_CONTEXT.md` into a detailed task log.

---

# 34. Product decision heuristic

When choosing between:

```text
more features
```

and:

```text
more trustworthy foundations
```

prefer trustworthy foundations.

The desired sequence is:

```text
truth
→ evidence
→ interpretation
→ teaching
```

not:

```text
AI prose
→ guessed truth
```

---

# 35. North-star philosophy

The long-term product should optimize for:

> **verified chess improvement**

rather than merely:

```text
time spent
games played
chatbot engagement
```

The future learning loop should eventually support:

```text
Diagnose
→ Learn
→ Practice
→ Retest
→ Measure
```

with evidence flowing back into the Player Skill Graph.

---

# 36. Keep this file current

At milestone completion:

- update `Current milestone`;
- add new high-level architectural invariants if necessary;
- remove obsolete temporary details;
- update the expected next milestone.

Do NOT append chronological Task summaries indefinitely.

This file should remain a concise representation of the project's current truth.
