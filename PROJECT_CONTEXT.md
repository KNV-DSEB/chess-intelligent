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
```

Current planned milestone:

```text
Task 010 — Adaptive Training Engine V1
```

Expected future direction:

```text
Task 011 — Coach / Student Intelligence
Task 012 — Grounded AI Coach
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
8. Training               ← Task 010
      ↓
9. AI Coach               ← future
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

# 17. Future learning architecture

Expected future flow:

```text
Concept Evidence
      ↓
Player Skill Graph
      ↓
Training Candidate Selection
      ↓
Exercises
      ↓
Training Attempts
      ↓
New Evidence
      ↓
Updated Skill Graph
```

This creates the desired closed learning loop.

Future LLM behavior should consume this structured evidence.

The LLM must not invent player state from raw PGNs.

---

# 18. Data provenance

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

# 19. External data policy

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

# 20. Important licensing boundaries

Stockfish is used as:

```text
external UCI process
```

and is not committed into the repository.

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

# 21. Core technology

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

# 22. Infrastructure philosophy

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

# 23. Domain boundaries

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

# 24. Immutability philosophy

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

# 25. AI philosophy

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

---

# 26. Academy-first principle

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

# 27. Child-friendly product principle

The product should eventually be much more approachable than traditional professional chess database software.

However:

> child-friendly UX must not mean simplified or corrupted chess truth.

Use different presentation layers over the same trusted core.

---

# 28. Current verification constraints

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

# 29. Testing philosophy

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

# 30. Current major project invariants

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

---

# 31. Important documentation

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
```

---

# 32. Agent workflow

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

# 33. Product decision heuristic

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

# 34. North-star philosophy

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

# 35. Keep this file current

At milestone completion:

- update `Current milestone`;
- add new high-level architectural invariants if necessary;
- remove obsolete temporary details;
- update the expected next milestone.

Do NOT append chronological Task summaries indefinitely.

This file should remain a concise representation of the project's current truth.
