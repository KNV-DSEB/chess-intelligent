# Graph Report - .  (2026-08-23)

## Corpus Check
- 148 files · ~83,827 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1500 nodes · 3077 edges · 92 communities (82 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Color Domain
- Src Public Exports
- Metadata Game Repository Module
- Player Intelligence Module
- Analysis Repository Module
- Opponent Preparation Tests
- Scripts Domain
- Ontology Module
- App Module
- Dependencies Domain
- Pg Database
- Id UI
- Concept Facts Module
- Analysis Worker Module
- Position Explorer Application Module
- Db Package
- Engine Analysis Module
- Classification Repository Module
- Web Package
- Ontology Repository
- Ontology Repository Module
- Data Source Type
- Worker Package
- Chess Core Package
- Concept Classification Module
- Compiler Options
- Player Intelligence Repository Module
- Query Client
- Game Repository Module
- Ui Package
- Position Corpus Explorer
- Config Package
- Src Public Exports 2
- Player UI
- Mate Outcome
- Web TypeScript Configuration
- Analysis Worker Tests
- Preparation UI
- Src Public Exports 3
- Concept Classification Tests
- POSITION STRUCTURE CLASSIFIER
- Parse Pgn Module
- Domain Package
- Concept Classification Application Module
- Ontology UI
- Opponent Opening Intelligence
- Task 004 Stockfish Analysis Pipeline
- Foundation Migration
- Coding Agent Guide
- Concept Evidence Candidate
- Ontology Graph
- Chess Concept Ontology And Evidence
- Data Provenance And Provider Policy
- Engine Analysis Architecture
- Player Intelligence Dossier
- Game Decision To Concept Evidence
- Concept Evidence Classification
- Chess Concept Authoring Guide
- Task 007 Chess Concept Ontology
- Concept Evidence Classification Migration
- Explorer UI
- Task 002 Metadata Game Reconciliation
- Task 005 Opponent Opening Intelligence
- Engine Analysis Migration
- Chess Concept Ontology Migration
- Pglite Query Client
- Ui TypeScript Configuration
- Database Migration And Quality Checks
- Api TypeScript Configuration
- Postgre Sql Verification Engine
- Worker TypeScript Configuration
- Game Phase Module
- Chess Core TypeScript Configuration
- Config TypeScript Configuration
- Db TypeScript Configuration
- Domain TypeScript Configuration
- Prettierrc Configuration
- Current Request And Analysis Path
- Pg Query Client
- Web Application Layout
- Metadata Reconciliation Migration
- Position Corpus Explorer Migration
- Next Config Module
- NOTE This File Should Not
- Classifier Versioning Rule

## God Nodes (most connected - your core abstractions)
1. `buildApp()` - 43 edges
2. `Database` - 35 edges
3. `DataSourceType` - 34 edges
4. `OntologyRepository` - 27 edges
5. `AnalysisRepository` - 26 edges
6. `QueryClient` - 24 edges
7. `PGliteDatabase` - 24 edges
8. `runMigrations()` - 22 edges
9. `ChessEngine` - 22 edges
10. `parsePgn()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Database Migration and Quality Checks` --semantically_similar_to--> `Repository Quality Checks`  [INFERRED] [semantically similar]
  .github/workflows/ci.yml → README.md
- `Mandatory Observation Provenance` --conceptually_related_to--> `Data Provenance and Provider Policy`  [INFERRED]
  AGENTS.md → docs/architecture/data-provenance.md
- `Historical and Engine Evidence Separation` --semantically_similar_to--> `Independent Preparation Candidate Evidence`  [INFERRED] [semantically similar]
  AGENTS.md → docs/architecture/opponent-opening-intelligence.md
- `ExplorePositionInput` --references--> `PositionCorpusFilters`  [EXTRACTED]
  apps/api/src/position-explorer-application.ts → packages/domain/src/corpus.ts
- `Chess Truth Boundary` --conceptually_related_to--> `Boundary-Separated Structured Truth`  [INFERRED]
  AGENTS.md → docs/architecture/overview.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Canonical Game Provenance and Reviewed Attachment** — docs_architecture_data_provenance_game_source_record, docs_architecture_game_reconciliation_canonical_game_lifecycle, docs_architecture_game_reconciliation_reviewed_pgn_attachment [EXTRACTED 1.00]
- **Immutable Versioned Evidence System** — docs_architecture_chess_concept_ontology_canonical_publication, docs_architecture_engine_analysis_engine_run_lifecycle, docs_architecture_concept_evidence_classification_immutable_classification_runs [INFERRED 0.85]
- **Opponent Preparation Evidence Synthesis** — docs_architecture_opponent_opening_intelligence_opponent_familiarity_v1, docs_architecture_opponent_opening_intelligence_strong_reference_v1, docs_architecture_opponent_opening_intelligence_engine_soundness_v1, docs_architecture_opponent_opening_intelligence_preparation_interest_v1 [EXTRACTED 1.00]
- **Historical and Engine Intelligence Chain** — docs_plans_003_position_corpus_explorer_task_003, docs_plans_004_stockfish_analysis_pipeline_task_004, docs_plans_005_opponent_opening_intelligence_task_005, docs_plans_006_player_intelligence_dossier_task_006 [EXTRACTED 1.00]
- **Ontology and Evidence Governance** — docs_ontology_concept_authoring_guide_chess_concept_authoring_guide, docs_plans_007_chess_concept_ontology_task_007, docs_plans_008_concept_evidence_classification_task_008, docs_classifiers_v1_classifier_rules_v1 [INFERRED 0.95]
- **Canonical Game Evidence Foundation** — docs_plans_001_foundation_pgn_ingestion_task_001, docs_plans_002_metadata_game_reconciliation_task_002, docs_plans_003_position_corpus_explorer_task_003 [INFERRED 0.85]

## Communities (92 total, 10 thin omitted)

### Community 0 - "Color Domain"
Cohesion: 0.05
Nodes (69): OpponentPreparationApplicationService, OpponentPreparationErrorCode, PreparationFilterInput, PrepareOpponentInput, PrepareOpponentPositionInput, NormalizedChessPosition, OccurrenceRow, BlackResponseRow (+61 more)

### Community 1 - "Src Public Exports"
Cohesion: 0.07
Nodes (24): AppOptions, buildApp(), CORPUS_FIXTURE_GAMES, CorpusFixtureGame, CountRow, ErrorResponse, fixtureUrl, ImportResponse (+16 more)

### Community 2 - "Metadata Game Repository Module"
Cohesion: 0.07
Nodes (34): AttachPgnCommand, GameReconciliationApplicationService, ReconcilePgnCommand, ReviewedAttachmentError, ReviewedAttachmentErrorCode, AttachmentStateRow, CandidateRow, CandidateSourceRow (+26 more)

### Community 3 - "Player Intelligence Module"
Cohesion: 0.08
Nodes (43): PlayerDossierErrorCode, ratio(), average(), calculateAdvantageConversion(), calculateCriticalPatterns(), calculateDecisionQuality(), calculateDisadvantageRecovery(), calculateEvidenceQuality() (+35 more)

### Community 4 - "Analysis Repository Module"
Cohesion: 0.08
Nodes (30): sortedAndValidatedLines(), AnalysisEvaluationView, AnalysisGame, AnalysisGameOccurrence, AnalysisGameRow, AnalysisJobRow, AnalysisJobView, analysisProfileConfigurationHash() (+22 more)

### Community 5 - "Opponent Preparation Tests"
Cohesion: 0.05
Nodes (15): line(), ManualDossierEngine, shutdown(), line(), ManualConceptEngine, shutdown(), line(), PreparationFixtureEngine (+7 more)

### Community 6 - "Scripts Domain"
Cohesion: 0.05
Nodes (43): eslint, eslint-config-next, @eslint/js, globals, devDependencies, eslint, eslint-config-next, @eslint/js (+35 more)

### Community 7 - "Ontology Module"
Cohesion: 0.08
Nodes (29): importFixture(), canonicalizeOntology(), compareText(), CONCEPT_DIFFICULTIES, CONCEPT_KINDS, CONCEPT_STATUSES, ConceptEvidencePolicy, cyclePath() (+21 more)

### Community 8 - "App Module"
Cohesion: 0.05
Nodes (29): analysisJobBodySchema, analysisParametersSchema, attachPgnBodySchema, classificationBodySchema, classificationParametersSchema, conceptEvidenceQuerySchema, conceptStableIdSchema, corpusFiltersSchema (+21 more)

### Community 9 - "Dependencies Domain"
Cohesion: 0.06
Nodes (35): dependencies, @chess-intelligent/chess-core, @chess-intelligent/config, @chess-intelligent/db, @chess-intelligent/domain, fastify, @fastify/cors, zod (+27 more)

### Community 10 - "Pg Database"
Cohesion: 0.08
Nodes (21): database, environment, database, environment, repository, worker, ApiEnvironment, apiEnvironmentSchema (+13 more)

### Community 11 - "Id UI"
Cohesion: 0.08
Nodes (24): Candidate, ReconciliationReport, ClassificationResult, ConceptEvidencePanel(), EvidenceItem, EvidenceProjection, factsText(), AnalysisRun (+16 more)

### Community 12 - "Concept Facts Module"
Cohesion: 0.14
Nodes (32): ALL_DIRECTIONS, apply(), attacksSquare(), BoardPiece, chessColor(), coordinates(), DetectedFileStructureFacts, detectFileStructureFacts() (+24 more)

### Community 13 - "Analysis Worker Module"
Cohesion: 0.15
Nodes (14): AnalysisWorker, ChessEngineFactory, buildGoCommand(), buildUciPositionCommand(), EngineProcessError, Exchange, integerMetric(), parseUciInfoLine() (+6 more)

### Community 14 - "Position Explorer Application Module"
Cohesion: 0.12
Nodes (13): GeneratePlayerDossierInput, ExplorePositionInput, PositionExplorerApplicationService, PositionExplorerErrorCode, asCount(), identity(), PositionCorpusRepository, representative() (+5 more)

### Community 15 - "Db Package"
Cohesion: 0.07
Nodes (28): dependencies, @chess-intelligent/config, @chess-intelligent/domain, pg, devDependencies, @electric-sql/pglite, tsx, @types/node (+20 more)

### Community 16 - "Engine Analysis Module"
Cohesion: 0.10
Nodes (23): ANALYSIS_JOB_STATUSES, ANALYSIS_PROFILES, ANALYSIS_RUN_STATUSES, calculateCentipawnLoss(), classifyMateOutcome(), CRITICAL_DETECTOR_V1_CONFIGURATION, CRITICAL_POSITION_REASONS, CRITICAL_SEVERITIES (+15 more)

### Community 17 - "Classification Repository Module"
Cohesion: 0.12
Nodes (17): AnalysisSelectionRow, ClassificationGameInput, ClassificationGameOccurrenceInput, ClassificationRepository, ClassificationRepositoryErrorCode, evidenceView(), GameRow, iso() (+9 more)

### Community 18 - "Web Package"
Cohesion: 0.07
Nodes (26): dependencies, @chess-intelligent/ui, next, react, react-dom, devDependencies, @types/node, @types/react (+18 more)

### Community 19 - "Ontology Repository"
Cohesion: 0.15
Nodes (12): OntologyApplicationErrorCode, OntologyApplicationService, OntologyConceptReadView, OntologyReadView, resolveDomainId(), jsonArray(), OntologyRepository, OntologyConceptDefinition (+4 more)

### Community 20 - "Ontology Repository Module"
Cohesion: 0.13
Nodes (21): EvidenceRow, ConceptRow, EvidencePolicyRow, EvidenceTypeRow, iso(), OntologyImmutabilityError, OntologySyncResult, OntologyVersionSummary (+13 more)

### Community 21 - "Data Source Type"
Cohesion: 0.17
Nodes (23): PlayerDossierFilterInput, GameFactRow, AggregateRow, CorpusCountRow, CorpusSummaryRow, IdentityPlayerRow, PositionCorpusQuery, PositionCorpusRepositoryFilters (+15 more)

### Community 22 - "Worker Package"
Cohesion: 0.08
Nodes (24): dependencies, @chess-intelligent/config, @chess-intelligent/db, @chess-intelligent/domain, devDependencies, tsx, @types/node, typescript (+16 more)

### Community 23 - "Chess Core Package"
Cohesion: 0.10
Nodes (20): chess.js, dependencies, @chess-intelligent/domain, chess.js, devDependencies, @types/node, typescript, vitest (+12 more)

### Community 24 - "Concept Classification Module"
Cohesion: 0.14
Nodes (18): baseDecisionCandidate(), CLASSIFICATION_RUN_STATUSES, ClassificationEngineContext, ClassificationFactValue, ClassificationRunStatus, ClassificationSourceSnapshot, CONCEPT_CLASSIFIER_V1_CONFIGURATION, ConceptEvidencePolicyError (+10 more)

### Community 25 - "Compiler Options"
Cohesion: 0.10
Nodes (19): DOM, DOM.Iterable, ES2022, compilerOptions, allowJs, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames (+11 more)

### Community 26 - "Player Intelligence Repository Module"
Cohesion: 0.19
Nodes (8): PlayerDossierApplicationService, dateOnly(), BuiltFilteredGames, count(), iso(), jsonObject(), jsonReasons(), PlayerIntelligenceRepository

### Community 27 - "Query Client"
Cohesion: 0.25
Nodes (3): QueryClient, insertParsedGameMoves(), ChessConceptOntologySource

### Community 28 - "Game Repository Module"
Cohesion: 0.12
Nodes (13): GameDetails, GameRepository, GameRow, IdentityRow, IdRow, iso(), MoveRow, normalizedName() (+5 more)

### Community 29 - "Ui Package"
Cohesion: 0.12
Nodes (17): devDependencies, react, @types/react, typescript, exports, react, @types/react, typescript (+9 more)

### Community 30 - "Position Corpus Explorer"
Cohesion: 0.14
Nodes (17): Canonical Game Counting, Exact Verified Identity Filtering, Historical Intelligence Boundary, Position Corpus Explorer, PositionCorpusRepository, PositionExplorerApplicationService, Position Occurrences, position:v1 Identity (+9 more)

### Community 31 - "Config Package"
Cohesion: 0.12
Nodes (16): dependencies, zod, devDependencies, @types/node, typescript, exports, @types/node, typescript (+8 more)

### Community 32 - "Src Public Exports 2"
Cohesion: 0.29
Nodes (9): PgnParseError, PositionFenError, normalizeCastling(), normalizedPositionKey(), positionIdentity(), sha256(), AppliedUciMove, applyUciMove() (+1 more)

### Community 33 - "Player UI"
Cohesion: 0.20
Nodes (13): ApiError, Behavior, Dossier, MoveEvidence, number(), Opportunity, OpportunityPanel(), opportunityScore() (+5 more)

### Community 34 - "Mate Outcome"
Cohesion: 0.16
Nodes (15): StateRow, ClassificationEngineOccurrenceInput, EngineContextRow, EngineObservationRow, RawPlayerEngineObservation, CriticalPositionReason, EngineScore, MateOutcome (+7 more)

### Community 35 - "Web TypeScript Configuration"
Cohesion: 0.14
Nodes (13): compilerOptions, incremental, jsx, plugins, exclude, extends, include, ../../tsconfig.base.json (+5 more)

### Community 36 - "Analysis Worker Tests"
Cohesion: 0.18
Nodes (5): DeterministicFakeEngine, FailingFakeEngine, fixtureUrl, line(), TransientFailingFakeEngine

### Community 37 - "Preparation UI"
Cohesion: 0.18
Nodes (11): ApiError, Candidate, Dossier, engineScore(), OpeningProfile, OpponentMove, percent(), Player (+3 more)

### Community 38 - "Src Public Exports 3"
Cohesion: 0.15
Nodes (12): COLORS, DATA_SOURCE_TYPES, GAME_CONTEXTS, IDENTITY_PROVIDERS, ImportPgnCommand, ParsedMove, ParsedPlayer, PGN_STATUSES (+4 more)

### Community 39 - "Concept Classification Tests"
Cohesion: 0.20
Nodes (6): ClassificationResponse, ConceptEvidenceFakeEngine, engineLine(), EvidenceResponse, fixtureUrl, EngineAnalysisResult

### Community 40 - "POSITION STRUCTURE CLASSIFIER"
Cohesion: 0.17
Nodes (12): CONCEPT_CLASSIFIER_BUNDLE_V1, CONCEPT_CLASSIFIER_V1_CONFIGURATION, pawn_structure.doubled_pawns, pawn_structure.isolated_queen_pawn, pawn_structure.passed_pawn, pawn_structure.pawn_majority, POSITION_STRUCTURE_CLASSIFIER, TACTICAL_MOTIF_CLASSIFIER (+4 more)

### Community 41 - "Parse Pgn Module"
Cohesion: 0.32
Nodes (10): HEADER_ALIASES, normalizedFingerprintText(), normalizeHeaders(), optionalHeader(), parseFailure(), parsePgn(), parsePlayedAt(), parseRated() (+2 more)

### Community 42 - "Domain Package"
Cohesion: 0.17
Nodes (11): devDependencies, typescript, exports, typescript, name, private, scripts, build (+3 more)

### Community 43 - "Concept Classification Application Module"
Cohesion: 0.31
Nodes (9): ClassifyGameRequest, ClassifyGameResult, ConceptClassificationApplicationErrorCode, ConceptClassificationApplicationService, exactHistoryMismatch(), historyMismatch(), verifyEngineContext(), conceptClassifierConfigurationSha256() (+1 more)

### Community 44 - "Ontology UI"
Cohesion: 0.18
Nodes (8): ApiError, Concept, ConceptDetailResponse, ConceptKind, ConceptSummary, EvidencePolicyView, OntologyView, Relationship

### Community 45 - "Opponent Opening Intelligence"
Cohesion: 0.27
Nodes (11): Engine Soundness V1, Opponent Familiarity V1, Opponent Opening Intelligence, Preparation Interest V1, Repertoire Trend V1, Strong Reference V1, Chess Intelligent Platform, Chess Concept Ontology Workflow (+3 more)

### Community 46 - "Task 004 Stockfish Analysis Pipeline"
Cohesion: 0.20
Nodes (11): ChessEngine Contract, Critical Position Detector V1, Immutable Analysis Runs, Stockfish UCI Adapter, Task 004 Stockfish Analysis Pipeline, Coverage-First Player Dossier, DECISION_QUALITY_V1, DOSSIER_EVIDENCE_QUALITY_V1 (+3 more)

### Community 47 - "Foundation Migration"
Cohesion: 0.40
Nodes (10): data_licenses, data_sources, external_identities, game_players, game_source_records, games, import_jobs, moves (+2 more)

### Community 48 - "Coding Agent Guide"
Cohesion: 0.20
Nodes (10): Chess Truth Boundary, Coding Agent Guide, Historical and Engine Evidence Separation, Exact-History Engine Identity, External Data Authorization Rule, Mandatory Observation Provenance, False-Negative Reconciliation Bias, Provider Access Prohibition (+2 more)

### Community 49 - "Concept Evidence Candidate"
Cohesion: 0.24
Nodes (7): PositionStructureClassifier, TacticalMotifClassifier, PersistClassificationInput, ClassificationContext, ConceptEvidenceCandidate, ConceptEvidenceClassifier, ResolvedConceptEvidence

### Community 51 - "Chess Concept Ontology And Evidence"
Cohesion: 0.28
Nodes (9): Immutable Ontology Versions, Canonical Ontology Publication, Chess Concept Ontology and Evidence Policy, Evidence Policy Roles, Immutable Published Ontology, Hierarchy and Prerequisite Graph Semantics, Read-Only Ontology Boundary, Stable Concept Identity (+1 more)

### Community 52 - "Data Provenance And Provider Policy"
Cohesion: 0.36
Nodes (9): Data Provenance and Provider Policy, External Identity Graph, Game Source Record, Metadata-Only OTB Records, Canonical Game Lifecycle, Canonical Game Reconciliation, Deterministic Matching Rules, Immutable Source Observations (+1 more)

### Community 53 - "Engine Analysis Architecture"
Cohesion: 0.25
Nodes (9): ChessEngine Contract, Engine Analysis Architecture, Immutable Engine Run Lifecycle, Exact Engine-State Identity, Stockfish UCI Engine Adapter, Engine Aggregation V1, Engine Analysis Workflow, Dependency License Review Boundary (+1 more)

### Community 54 - "Player Intelligence Dossier"
Cohesion: 0.28
Nodes (9): Critical Position Detector V1, White-Relative Score and Mover Loss Semantics, Advantage Conversion and Disadvantage Recovery V1, Coverage-First Evidence Dossier, Decision Quality V1, Dossier Evidence Quality V1, Objective Behavior Indicators V1, Player Intelligence Dossier (+1 more)

### Community 55 - "Game Decision To Concept Evidence"
Cohesion: 0.22
Nodes (9): Conservative Decision Evidence, TACTICAL_DECISION_CLASSIFIER, Exact-History Engine States, Game Decision to Concept Evidence Pipeline, Concept Evidence Instances, Conservative Classification Policy, Deterministic Chess Facts, Exact-History Hash Contract (+1 more)

### Community 56 - "Concept Evidence Classification"
Cohesion: 0.25
Nodes (8): Conservative Concept Classification, Exact Occurrence Classification Path, Concept Evidence Classification, Exact-History Classification Compatibility, Fact Evidence and Mastery Boundary, Ontology Policy Resolver, Precision-First Classifier Boundary, Concept Evidence Classification Workflow

### Community 57 - "Chess Concept Authoring Guide"
Cohesion: 0.29
Nodes (8): Chess Concept Authoring Guide, Immutable Ontology Publication, Prerequisite DAG, Primary Parent Hierarchy, Ontology Publication Workflow, Stable Concept Identity, Canonical Ontology 1.0.0, Immutable Ontology Synchronization

### Community 58 - "Task 007 Chess Concept Ontology"
Cohesion: 0.29
Nodes (8): Evidence Policy Authoring, DIRECT SUPPORTING CONTEXTUAL Evidence Roles, OntologyGraph, OntologyRegistry, OntologyValidator, Task 007 Chess Concept Ontology, Ontology Role Resolution, Task 008 Concept Evidence Classification

### Community 59 - "Concept Evidence Classification Migration"
Cohesion: 0.50
Nodes (7): analysis_runs, concept_classification_runs, concept_evidence_instances, concept_evidence_policies, game_players, ontology_versions, position_occurrences

### Community 60 - "Explorer UI"
Cohesion: 0.33
Nodes (5): ApiError, ExplorerResult, percentage(), PositionExplorerPage(), RepresentativeGame

### Community 61 - "Task 002 Metadata Game Reconciliation"
Cohesion: 0.29
Nodes (7): Provenance Preservation, Transactional PGN Ingestion, False-Negative Reconciliation Policy, Reviewed PGN Attachment, Rule-Based Game Reconciliation, Task 002 Metadata Game Reconciliation, Transactional Metadata Ingestion

### Community 62 - "Task 005 Opponent Opening Intelligence"
Cohesion: 0.43
Nodes (7): ENGINE_SOUNDNESS_V1, OPPONENT_FAMILIARITY_V1, PREPARATION_INTEREST_V1, REPERTOIRE_PREDICTABILITY_V1, REPERTOIRE_TREND_V1, STRONG_REFERENCE_V1, Task 005 Opponent Opening Intelligence

### Community 63 - "Engine Analysis Migration"
Cohesion: 0.67
Nodes (6): analysis_jobs, analysis_runs, critical_positions, engine_evaluations, engine_position_states, move_engine_assessments

### Community 64 - "Chess Concept Ontology Migration"
Cohesion: 0.67
Nodes (6): concept_definitions, concept_evidence_policies, concept_identities, concept_relationships, evidence_type_definitions, ontology_versions

### Community 66 - "Ui TypeScript Configuration"
Cohesion: 0.29
Nodes (6): compilerOptions, jsx, extends, include, ../../tsconfig.base.json, src/**/*.tsx

### Community 67 - "Database Migration And Quality Checks"
Cohesion: 0.33
Nodes (6): Continuous Integration Pipeline, Database Migration and Quality Checks, Local Infrastructure Stack, PostgreSQL Service, Redis Service, Repository Quality Checks

### Community 68 - "Api TypeScript Configuration"
Cohesion: 0.33
Nodes (5): extends, include, src/**/*.ts, test/**/*.ts, ../../tsconfig.base.json

### Community 70 - "Worker TypeScript Configuration"
Cohesion: 0.33
Nodes (5): extends, include, src/**/*.ts, test/**/*.ts, ../../tsconfig.base.json

### Community 71 - "Game Phase Module"
Cohesion: 0.50
Nodes (3): classifyGamePhase(), MATERIAL_VALUE, GamePhase

### Community 72 - "Chess Core TypeScript Configuration"
Cohesion: 0.40
Nodes (4): extends, include, src/**/*.ts, ../../tsconfig.base.json

### Community 73 - "Config TypeScript Configuration"
Cohesion: 0.40
Nodes (4): extends, include, src/**/*.ts, ../../tsconfig.base.json

### Community 74 - "Db TypeScript Configuration"
Cohesion: 0.40
Nodes (4): extends, include, src/**/*.ts, ../../tsconfig.base.json

### Community 75 - "Domain TypeScript Configuration"
Cohesion: 0.40
Nodes (4): extends, include, src/**/*.ts, ../../tsconfig.base.json

### Community 76 - "Prettierrc Configuration"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 77 - "Current Request And Analysis Path"
Cohesion: 0.50
Nodes (4): Architecture Overview, Boundary-Separated Structured Truth, Current Request and Analysis Path, Modular Monolith

## Knowledge Gaps
- **421 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `name` (+416 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Color` connect `Color Domain` to `Src Public Exports 2`, `Src Public Exports`, `Mate Outcome`, `Metadata Game Repository Module`, `Analysis Repository Module`, `Player Intelligence Module`, `Src Public Exports 3`, `Concept Facts Module`, `Position Explorer Application Module`, `Engine Analysis Module`, `Classification Repository Module`, `Concept Evidence Candidate`, `Ontology Repository Module`, `Data Source Type`, `Concept Classification Module`, `Player Intelligence Repository Module`, `Query Client`, `Game Repository Module`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `Database` connect `Src Public Exports` to `Color Domain`, `Metadata Game Repository Module`, `Analysis Repository Module`, `Analysis Worker Tests`, `Opponent Preparation Tests`, `Concept Classification Tests`, `App Module`, `Pg Database`, `Position Explorer Application Module`, `Classification Repository Module`, `Ontology Repository Module`, `Data Source Type`, `Player Intelligence Repository Module`, `Query Client`, `Game Repository Module`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `OntologyRepository` connect `Ontology Repository` to `Src Public Exports`, `Concept Classification Tests`, `App Module`, `Pg Database`, `Concept Classification Application Module`, `Classification Repository Module`, `Ontology Repository Module`, `Query Client`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _421 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Color Domain` be split into smaller, more focused modules?**
  _Cohesion score 0.05306930693069307 - nodes in this community are weakly interconnected._
- **Should `Src Public Exports` be split into smaller, more focused modules?**
  _Cohesion score 0.07402597402597402 - nodes in this community are weakly interconnected._
- **Should `Metadata Game Repository Module` be split into smaller, more focused modules?**
  _Cohesion score 0.06801346801346801 - nodes in this community are weakly interconnected._