# Graph Report - chess-intelligent  (2026-09-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2516 nodes · 5375 edges · 137 communities (122 shown, 15 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 173 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- player-intelligence.ts
- preparation.ts
- app.ts
- position-corpus-repository.ts
- appendSecurityAuditEvent
- AuthApplicationService
- Database
- training_items
- games/[id]/page.tsx
- Color
- player-skill-graph.ts
- adaptive-training.ts
- TrainingRepository
- engine-analysis.ts
- academy-production-foundation.test.ts
- coach-student-intelligence.ts
- academy-security.ts
- security-routes.ts
- player-skill-graph-application.ts
- scripts
- concept-facts.ts
- db/src/index.ts
- StockfishUciEngine
- concept-classification.ts
- EmailDeliveryProvider
- classification-repository.ts
- task015-browser-gate.mjs
- buildApp
- AnalysisRepository
- chess-core/src/index.ts
- database.ts
- ontology.ts
- academy-security-application.ts
- DataSourceType
- analysis-worker.ts
- academy-bootstrap-owner-cli.ts
- AcademyRepository
- player-skill-graph-repository.ts
- task015-auth-boundary-gate.mjs
- Coding Agent Guide
- ontology-repository.ts
- Player Intelligence Dossier
- academy-administration.tsx
- domain/src/index.ts
- typescript
- metadata-game-repository.ts
- training-repository.ts
- test/coach-student-intelligence.test.ts
- training/page.tsx
- Position Corpus Explorer
- academy-repository.ts
- game-repository.ts
- reconciliation.ts
- compilerOptions
- api/package.json
- @chess-intelligent/domain
- devDependencies
- QueryClient
- PlayerSkillGraphRepository
- web/package.json
- ui/package.json
- preparation/page.tsx
- restore-verify-cli.ts
- ontology-application.ts
- player/page.tsx
- dependencies
- test/player-skill-graph.test.ts
- ontology/page.tsx
- CONCEPT_CLASSIFIER_BUNDLE_V1
- task015-runtime-fault-gate.mjs
- game-reconciliation-application.ts
- skills/page.tsx
- analysis-worker.test.ts
- task015-evidence-audit.mjs
- Concept Evidence Classification
- concept-classification-application.ts
- OntologyRepository
- security-audit-repository.ts
- test/concept-classification.test.ts
- opponent-preparation.test.ts
- test/player-intelligence.test.ts
- students/[id]/page.tsx
- worker/package.json
- Chess Concept Ontology and Evidence Policy
- config/package.json
- task015-seed-learning.ts
- Chess Intelligent Platform
- manual-task009-server.ts
- Task 007 Chess Concept Ontology
- 001_foundation.sql
- db/package.json
- domain/package.json
- paths
- devDependencies
- ../../tsconfig.base.json
- explorer/page.tsx
- OntologyGraph
- OntologyRegistry
- chess-core/package.json
- manual-task008-server.ts
- web/tsconfig.json
- Task 005 Opponent Opening Intelligence
- 009_concept_evidence_classification.sql
- assignments/[id]/page.tsx
- layout.tsx
- 005_engine_analysis.sql
- 008_chess_concept_ontology.sql
- include
- ui/tsconfig.json
- acceptance/tsconfig.json
- [academyId]/my/page.tsx
- worker/tsconfig.json
- game-phase.ts
- .prettierrc.json
- build-node-artifacts.mjs
- invitations/[token]/page.tsx
- chess-core/tsconfig.json
- db/tsconfig.json
- domain/tsconfig.json
- LoginPage
- app/my/page.tsx
- PasswordResetRequestPage
- PasswordResetCompletePage
- 003_metadata_reconciliation.sql
- 004_position_corpus_explorer.sql
- next.config.ts
- next-env.d.ts
- init-app-user.sh
- Classifier Rules V1

## God Nodes (most connected - your core abstractions)
1. `buildApp()` - 98 edges
2. `Database` - 55 edges
3. `DataSourceType` - 37 edges
4. `QueryClient` - 35 edges
5. `PGliteDatabase` - 30 edges
6. `AcademyRepository` - 28 edges
7. `PlayerSkillGraphRepository` - 28 edges
8. `runMigrations()` - 27 edges
9. `appendSecurityAuditEvent()` - 27 edges
10. `dateOnly()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Historical and Engine Evidence Separation` --semantically_similar_to--> `Independent Preparation Candidate Evidence`  [INFERRED] [semantically similar]
  AGENTS.md → docs/architecture/opponent-opening-intelligence.md
- `Database Migration and Quality Checks` --semantically_similar_to--> `Repository Quality Checks`  [INFERRED] [semantically similar]
  .github/workflows/ci.yml → README.md
- `GeneratePlayerDossierInput` --references--> `ExactExternalIdentityInput`  [EXTRACTED]
  apps/api/src/player-dossier-application.ts → packages/domain/src/corpus.ts
- `PreparationFilterInput` --references--> `OpponentPreparationFilters`  [EXTRACTED]
  apps/api/src/opponent-preparation-application.ts → packages/domain/src/preparation.ts
- `ExplorePositionInput` --references--> `PositionCorpusFilters`  [EXTRACTED]
  apps/api/src/position-explorer-application.ts → packages/domain/src/corpus.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Historical and Engine Intelligence Chain** — docs_plans_003_position_corpus_explorer_task_003, docs_plans_004_stockfish_analysis_pipeline_task_004, docs_plans_005_opponent_opening_intelligence_task_005, docs_plans_006_player_intelligence_dossier_task_006 [EXTRACTED 1.00]
- **Canonical Game Provenance and Reviewed Attachment** — docs_architecture_data_provenance_game_source_record, docs_architecture_game_reconciliation_canonical_game_lifecycle, docs_architecture_game_reconciliation_reviewed_pgn_attachment [EXTRACTED 1.00]
- **Opponent Preparation Evidence Synthesis** — docs_plans_005_opponent_opening_intelligence_opponent_familiarity_v1, docs_plans_005_opponent_opening_intelligence_strong_reference_v1, docs_plans_005_opponent_opening_intelligence_engine_soundness_v1, docs_plans_005_opponent_opening_intelligence_preparation_interest_v1 [EXTRACTED 1.00]
- **Canonical Game Evidence Foundation** — docs_plans_001_foundation_pgn_ingestion_task_001, docs_plans_002_metadata_game_reconciliation_task_002, docs_plans_003_position_corpus_explorer_task_003 [INFERRED 0.85]
- **Immutable Versioned Evidence System** — docs_architecture_chess_concept_ontology_canonical_publication, docs_architecture_engine_analysis_engine_run_lifecycle, docs_plans_008_concept_evidence_classification_immutable_classification_runs [INFERRED 0.85]
- **Ontology and Evidence Governance** — docs_ontology_concept_authoring_guide_chess_concept_authoring_guide, docs_plans_007_chess_concept_ontology_task_007, docs_plans_008_concept_evidence_classification_task_008, docs_classifiers_v1_classifier_rules_v1 [INFERRED 0.95]

## Communities (137 total, 15 thin omitted)

### Community 0 - "player-intelligence.ts"
Cohesion: 0.06
Nodes (60): GeneratePlayerDossierInput, PlayerDossierError, PlayerDossierErrorCode, ratio(), StateRow, ClassificationEngineOccurrenceInput, EngineContextRow, EngineObservationRow (+52 more)

### Community 1 - "preparation.ts"
Cohesion: 0.08
Nodes (39): OpponentPreparationApplicationService, OpponentPreparationError, OpponentPreparationErrorCode, PreparationFilterInput, PrepareOpponentInput, PrepareOpponentPositionInput, NormalizedChessPosition, RawCompatibleEngineMove (+31 more)

### Community 2 - "app.ts"
Cohesion: 0.04
Nodes (49): academyAssignmentParametersSchema, academyBodySchema, academyCoachQuerySchema, academyIntelligenceQuerySchema, academyLegacyCoachQuerySchema, academyLegacyIntelligenceQuerySchema, academyMembershipBodySchema, academyParametersSchema (+41 more)

### Community 3 - "position-corpus-repository.ts"
Cohesion: 0.07
Nodes (33): ExplorePositionInput, PositionExplorerApplicationService, PositionExplorerError, PositionExplorerErrorCode, dateOnly(), AggregateRow, asCount(), CorpusCountRow (+25 more)

### Community 4 - "appendSecurityAuditEvent"
Cohesion: 0.09
Nodes (22): AcademyAccessRepository, AcademyAccessRepositoryError, AcademyActorRecord, ActorRow, AssignedStudentItemContext, iso(), MembershipRow, StudentActorRow (+14 more)

### Community 5 - "AuthApplicationService"
Cohesion: 0.08
Nodes (15): AuthApplicationError, AuthApplicationService, LoginResult, PasswordHasher, AccountRow, AuthenticatedPrincipalRecord, AuthRepository, AuthRepositoryError (+7 more)

### Community 6 - "Database"
Cohesion: 0.06
Nodes (19): CORPUS_FIXTURE_GAMES, CorpusFixtureGame, CountRow, ErrorResponse, fixtureUrl, ImportResponse, ImportResponse, CountRow (+11 more)

### Community 7 - "training_items"
Cohesion: 0.08
Nodes (41): concept_classification_runs, concept_evidence_policies, games, ontology_versions, player_concept_game_contributions, player_concept_states, player_skill_graph_runs, skill_graph_evidence_contributions (+33 more)

### Community 8 - "games/[id]/page.tsx"
Cohesion: 0.06
Nodes (29): AttachPgnPage(), Candidate, ReconciliationReport, ClassificationResult, ConceptEvidencePanel(), EvidenceItem, EvidenceProjection, factsText() (+21 more)

### Community 9 - "Color"
Cohesion: 0.10
Nodes (27): BlackResponseRow, BuiltCorpus, count(), CountRow, EvidenceAvailabilityRow, HotspotRow, iso(), jsonArray() (+19 more)

### Community 10 - "player-skill-graph.ts"
Cohesion: 0.08
Nodes (33): aggregateTrainingAugmentedSkillGraph(), classifySkillEvidenceConfidenceV2(), selectFirstTrainingEvidencePerItem(), gameEvidence(), graphInput(), TrainingEvidenceForMastery, TrainingSourceCandidate, aggregatePlayerSkillGraph() (+25 more)

### Community 11 - "adaptive-training.ts"
Cohesion: 0.07
Nodes (36): CreateTrainingPlanInput, TrainingApplicationErrorCode, TrainingCandidateView, why(), TrainingCandidateRecord, CONFIDENCE_RANK, diagnosticEligible(), isSupportedConcept() (+28 more)

### Community 12 - "TrainingRepository"
Cohesion: 0.13
Nodes (7): PublishedOntologySnapshotReader, TrainingApplicationError, TrainingApplicationService, iso(), json(), TrainingItemRecord, TrainingRepository

### Community 13 - "engine-analysis.ts"
Cohesion: 0.07
Nodes (27): ANALYSIS_JOB_STATUSES, ANALYSIS_PROFILES, ANALYSIS_RUN_STATUSES, calculateCentipawnLoss(), ChessEngine, classifyMateOutcome(), CRITICAL_DETECTOR_V1_CONFIGURATION, CRITICAL_POSITION_REASONS (+19 more)

### Community 14 - "academy-production-foundation.test.ts"
Cohesion: 0.07
Nodes (14): redactSensitiveRequestUrl(), AcademyInvitationEmail, PasswordResetEmail, Argon2idPasswordHasher, bootstrap(), login(), NOW, RecordingEmailDeliveryProvider (+6 more)

### Community 15 - "coach-student-intelligence.ts"
Cohesion: 0.09
Nodes (31): PersistTrainingPlanInput, TrainingCandidateDecision, AssignmentItemProgressInput, AssignmentMeasurementRejection, checkSkillGraphComparability(), classifyAssignmentMeasurement(), classifyConceptTransition(), COACH_ATTENTION_SIGNAL_V1 (+23 more)

### Community 16 - "academy-security.ts"
Cohesion: 0.09
Nodes (26): AuthApplicationErrorCode, CryptoOpaqueTokenFactory, OpaqueToken, OpaqueTokenFactory, ARGON2ID_OPTIONS, PASSWORD_ALGORITHM, ACADEMY_CAPABILITIES, ACADEMY_INVITATION_POLICY_V1 (+18 more)

### Community 17 - "security-routes.ts"
Cohesion: 0.09
Nodes (29): authErrorStatus(), AuthHttpOptions, clearSessionCookie(), registerCsrfOriginBoundary(), requestPrincipal(), requireRequestPrincipal(), sessionCookieName(), setSessionCookie() (+21 more)

### Community 18 - "player-skill-graph-application.ts"
Cohesion: 0.13
Nodes (21): GeneratePlayerSkillGraphInput, PlayerSkillGraphApplicationError, PlayerSkillGraphApplicationErrorCode, PlayerSkillGraphApplicationService, PlayerSkillGraphConceptDetailView, PlayerSkillGraphView, PersistedConceptLineage, PlayerSkillGraphRunRecord (+13 more)

### Community 19 - "scripts"
Cohesion: 0.06
Nodes (32): engines, node, name, packageManager, private, scripts, academy:bootstrap-owner, academy:bootstrap-owner:production (+24 more)

### Community 20 - "concept-facts.ts"
Cohesion: 0.15
Nodes (31): ALL_DIRECTIONS, apply(), attacksSquare(), BoardPiece, chessColor(), coordinates(), detectFileStructureFacts(), detectPositionStructureFacts() (+23 more)

### Community 21 - "db/src/index.ts"
Cohesion: 0.12
Nodes (27): AnalysisEvaluationView, AnalysisGame, AnalysisGameOccurrence, AnalysisGameRow, AnalysisJobRow, AnalysisJobView, AnalysisRepositoryError, AnalysisRepositoryErrorCode (+19 more)

### Community 22 - "StockfishUciEngine"
Cohesion: 0.14
Nodes (12): ChessEngineFactory, buildUciGoCommand(), buildUciPositionCommand(), EngineProcessError, Exchange, integerMetric(), parseUciInfoLine(), sha256File() (+4 more)

### Community 23 - "concept-classification.ts"
Cohesion: 0.10
Nodes (25): PositionStructureClassifier, TacticalMotifClassifier, PersistClassificationInput, baseDecisionCandidate(), CLASSIFICATION_RUN_STATUSES, ClassificationContext, ClassificationEngineContext, ClassificationFactValue (+17 more)

### Community 24 - "EmailDeliveryProvider"
Cohesion: 0.10
Nodes (10): AppOptions, DisabledEmailDeliveryProvider, EmailDeliveryError, EmailDeliveryProvider, SmtpEmailDeliveryOptions, SmtpEmailDeliveryProvider, PasswordResetApplicationService, database (+2 more)

### Community 25 - "classification-repository.ts"
Cohesion: 0.11
Nodes (18): AnalysisSelectionRow, ClassificationGameInput, ClassificationGameOccurrenceInput, ClassificationRepository, ClassificationRepositoryError, ClassificationRepositoryErrorCode, evidenceView(), GameRow (+10 more)

### Community 26 - "task015-browser-gate.mjs"
Cohesion: 0.18
Nodes (25): acceptInvitation(), CdpClient, chrome, click(), createAssignment(), createInvitation(), createStudentMembership(), delay() (+17 more)

### Community 27 - "buildApp"
Cohesion: 0.15
Nodes (8): ACADEMY_AUTHORIZATION_STATUS, AcademyApplicationError, AcademyApplicationService, AcademyIntelligenceProfileInput, AcademyOntologyReader, academyErrorStatus(), buildApp(), database

### Community 28 - "AnalysisRepository"
Cohesion: 0.09
Nodes (10): sortedAndValidatedLines(), evaluation(), PostgreSqlVerificationEngine, analysisProfileConfigurationHash(), AnalysisRepository, iso(), json(), mapJob() (+2 more)

### Community 29 - "chess-core/src/index.ts"
Cohesion: 0.17
Nodes (20): DetectedFileStructureFacts, PgnParseError, PositionFenError, normalizeCastling(), normalizedPositionKey(), positionIdentity(), sha256(), HEADER_ALIASES (+12 more)

### Community 30 - "database.ts"
Cohesion: 0.12
Nodes (12): benchmarkDatabaseName, database, measureAndExplain(), seed(), PgDatabase, PgQueryClient, database, AppliedMigrationRow (+4 more)

### Community 31 - "ontology.ts"
Cohesion: 0.11
Nodes (25): canonicalizeOntology(), compareText(), CONCEPT_DIFFICULTIES, CONCEPT_KINDS, CONCEPT_STATUSES, ConceptEvidencePolicy, cyclePath(), DIFFICULTY_RANK (+17 more)

### Community 32 - "academy-security-application.ts"
Cohesion: 0.19
Nodes (12): AcademySecurityApplicationError, AcademySecurityApplicationErrorCode, AcademySecurityApplicationService, AuthenticatedPrincipal, ManagedMembershipRecord, StudentActorContext, AcademyCapability, canManageMembershipRole() (+4 more)

### Community 33 - "DataSourceType"
Cohesion: 0.17
Nodes (19): PlayerDossierApplicationService, PlayerDossierFilterInput, BuiltFilteredGames, count(), GameFactRow, iso(), jsonObject(), jsonReasons() (+11 more)

### Community 34 - "analysis-worker.ts"
Cohesion: 0.10
Nodes (14): analyze(), classify(), engineLine(), fixtureUrl, importFixture(), PlanResponse, prepare(), TrainingFixtureEngine (+6 more)

### Community 35 - "academy-bootstrap-owner-cli.ts"
Cohesion: 0.09
Nodes (19): academyId, academyName, database, displayName, email, database, environment, database (+11 more)

### Community 36 - "AcademyRepository"
Cohesion: 0.15
Nodes (4): AcademyRepository, AcademyRepositoryError, iso(), StudentIntelligenceProfile

### Community 37 - "player-skill-graph-repository.ts"
Cohesion: 0.10
Nodes (25): BuiltScope, ConceptStateRow, ContributionLineageRow, DecisionRow, EvidenceRow, GameRow, LoadPlayerSkillEvidenceInput, OntologyVersionRow (+17 more)

### Community 38 - "task015-auth-boundary-gate.mjs"
Cohesion: 0.17
Nodes (21): CdpClient, chrome, click(), compose(), composeArguments, delay(), evaluate(), goto() (+13 more)

### Community 39 - "Coding Agent Guide"
Cohesion: 0.11
Nodes (25): Chess Truth Boundary, Coding Agent Guide, Historical and Engine Evidence Separation, Exact-History Engine Identity, External Data Authorization Rule, Mandatory Observation Provenance, False-Negative Reconciliation Bias, Data Provenance and Provider Policy (+17 more)

### Community 40 - "ontology-repository.ts"
Cohesion: 0.13
Nodes (21): EvidenceRow, ConceptRow, EvidencePolicyRow, EvidenceTypeRow, iso(), OntologyImmutabilityError, OntologySyncResult, OntologyVersionSummary (+13 more)

### Community 41 - "Player Intelligence Dossier"
Cohesion: 0.11
Nodes (25): ChessEngine Contract, Critical Position Detector V1, Engine Analysis Architecture, Immutable Engine Run Lifecycle, Exact Engine-State Identity, White-Relative Score and Mover Loss Semantics, Stockfish UCI Engine Adapter, Advantage Conversion and Disadvantage Recovery V1 (+17 more)

### Community 42 - "academy-administration.tsx"
Cohesion: 0.12
Nodes (19): AcademyAdministration(), createInvitation(), createMembership(), createStudentProfile(), mutate(), updateMembership(), AcademyRole, ApiError (+11 more)

### Community 43 - "domain/src/index.ts"
Cohesion: 0.11
Nodes (17): migratedDatabase(), DEFAULT_ONTOLOGY_SOURCE_PATH, readOntologySourceFile(), database, report, COLORS, DATA_SOURCE_TYPES, GAME_CONTEXTS (+9 more)

### Community 44 - "typescript"
Cohesion: 0.10
Nodes (22): devDependencies, @types/node, @types/react-dom, typescript, devDependencies, tsx, @types/node, typescript (+14 more)

### Community 45 - "metadata-game-repository.ts"
Cohesion: 0.14
Nodes (13): AttachmentStateRow, CandidateRow, CandidateSourceRow, IdentityRow, MetadataGameRepository, MetadataImportResult, normalizedName(), PgnAttachmentErrorCode (+5 more)

### Community 46 - "training-repository.ts"
Cohesion: 0.13
Nodes (19): PublicTrainingItemView, TrainingPlanView, AttemptRow, CandidateRow, MaterializedTrainingItemInput, OntologyVersionRow, PersistTrainingPlanResult, PlanRow (+11 more)

### Community 47 - "test/coach-student-intelligence.test.ts"
Cohesion: 0.13
Nodes (13): AcademyFixtureEngine, AcademySetup, analyze(), classify(), createAcademy(), createMembership(), createStudent(), engineLine() (+5 more)

### Community 48 - "training/page.tsx"
Cohesion: 0.11
Nodes (15): ApiError, Attempt, boardSquares(), Candidate, CandidateCard(), ChessBoard(), label(), pieces (+7 more)

### Community 49 - "Position Corpus Explorer"
Cohesion: 0.11
Nodes (21): Canonical Game Counting, Exact Verified Identity Filtering, Historical Intelligence Boundary, Position Corpus Explorer, PositionCorpusRepository, PositionExplorerApplicationService, Position Occurrences, position:v1 Identity (+13 more)

### Community 50 - "academy-repository.ts"
Cohesion: 0.13
Nodes (20): AcademyMembershipRole, AcademyRecord, AcademyRepositoryErrorCode, AcademyRow, AssignableTrainingPlan, AssignmentRow, CreateTrainingAssignmentInput, PlanItemRow (+12 more)

### Community 51 - "game-repository.ts"
Cohesion: 0.12
Nodes (14): GameDetails, GameRepository, GameRow, IdentityRow, IdRow, iso(), MoveRow, normalizedName() (+6 more)

### Community 52 - "reconciliation.ts"
Cohesion: 0.18
Nodes (12): ParsedGame, addComparison(), classificationRank(), GameReconciliationService, metadataCandidateIdentity(), MetadataPlayerInput, normalized(), player() (+4 more)

### Community 53 - "compilerOptions"
Cohesion: 0.10
Nodes (19): DOM, DOM.Iterable, ES2022, compilerOptions, allowJs, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames (+11 more)

### Community 54 - "api/package.json"
Cohesion: 0.11
Nodes (18): devDependencies, tsx, @types/node, @types/nodemailer, typescript, vitest, tsx, vitest (+10 more)

### Community 55 - "@chess-intelligent/domain"
Cohesion: 0.11
Nodes (19): @chess-intelligent/config, @chess-intelligent/db, @chess-intelligent/domain, @chess-intelligent/config, @chess-intelligent/db, @chess-intelligent/domain, dependencies, @chess-intelligent/config (+11 more)

### Community 56 - "devDependencies"
Cohesion: 0.11
Nodes (19): esbuild, eslint, eslint-config-next, @eslint/js, globals, devDependencies, esbuild, eslint (+11 more)

### Community 58 - "PlayerSkillGraphRepository"
Cohesion: 0.20
Nodes (6): PlayerSkillGraphConceptView, iso(), json(), number(), PlayerSkillGraphRepository, TrainingAugmentedConceptState

### Community 59 - "web/package.json"
Cohesion: 0.11
Nodes (17): dependencies, @chess-intelligent/ui, next, react, react-dom, react, name, private (+9 more)

### Community 60 - "ui/package.json"
Cohesion: 0.12
Nodes (17): @types/react, @types/react, devDependencies, react, @types/react, typescript, exports, react (+9 more)

### Community 61 - "preparation/page.tsx"
Cohesion: 0.15
Nodes (14): ApiError, Candidate, Dossier, engineScore(), OpeningProfile, OpponentMove, percent(), Player (+6 more)

### Community 62 - "restore-verify-cli.ts"
Cohesion: 0.19
Nodes (14): database, outputPath, target, compareRestoreManifests(), createRestoreManifest(), PostgresProcessTarget, requireExplicitFilePath(), RESTORE_MANIFEST_TABLES (+6 more)

### Community 63 - "ontology-application.ts"
Cohesion: 0.18
Nodes (9): OntologyApplicationError, OntologyApplicationErrorCode, OntologyApplicationService, OntologyConceptReadView, OntologyReadView, resolveDomainId(), OntologyConceptDefinition, OntologyConceptDetail (+1 more)

### Community 64 - "player/page.tsx"
Cohesion: 0.18
Nodes (13): ApiError, Behavior, Dossier, MoveEvidence, number(), Opportunity, OpportunityPanel(), opportunityScore() (+5 more)

### Community 65 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @chess-intelligent/chess-core, fastify, @fastify/cookie, @fastify/cors, @node-rs/argon2, nodemailer, zod (+7 more)

### Community 66 - "test/player-skill-graph.test.ts"
Cohesion: 0.18
Nodes (9): analyze(), classify(), conceptFixtureUrl, engineLine(), importPgn(), ordinaryFixtureUrl, prepareFixture(), SkillGraphFakeEngine (+1 more)

### Community 67 - "ontology/page.tsx"
Cohesion: 0.14
Nodes (11): ApiError, Concept, ConceptDetailResponse, ConceptKind, ConceptSummary, EvidencePolicyView, OntologyPage(), branchMatches() (+3 more)

### Community 68 - "CONCEPT_CLASSIFIER_BUNDLE_V1"
Cohesion: 0.13
Nodes (15): CONCEPT_CLASSIFIER_BUNDLE_V1, CONCEPT_CLASSIFIER_V1_CONFIGURATION, Conservative Decision Evidence, pawn_structure.doubled_pawns, pawn_structure.isolated_queen_pawn, pawn_structure.passed_pawn, pawn_structure.pawn_majority, POSITION_STRUCTURE_CLASSIFIER (+7 more)

### Community 69 - "task015-runtime-fault-gate.mjs"
Cohesion: 0.20
Nodes (14): baseUrl, compose(), composeArguments, databaseSnapshot(), delay(), docker(), expected, persistenceStable (+6 more)

### Community 70 - "game-reconciliation-application.ts"
Cohesion: 0.19
Nodes (9): AttachPgnCommand, GameReconciliationApplicationService, ReconcilePgnCommand, ReviewedAttachmentError, ReviewedAttachmentErrorCode, PgnAttachmentError, ReconciliationClassification, ReconciliationContext (+1 more)

### Community 71 - "skills/page.tsx"
Cohesion: 0.19
Nodes (9): ApiError, ConceptDetail, ConceptState, conceptStatus(), ConceptSummary, label(), mass(), PlayerSkillsPage() (+1 more)

### Community 72 - "analysis-worker.test.ts"
Cohesion: 0.18
Nodes (5): DeterministicFakeEngine, FailingFakeEngine, fixtureUrl, line(), TransientFailingFakeEngine

### Community 73 - "task015-evidence-audit.mjs"
Cohesion: 0.15
Nodes (13): audit, compose(), composeArguments, databaseJson(), knownSecretMatches, knownSecrets, lineage, logs (+5 more)

### Community 74 - "Concept Evidence Classification"
Cohesion: 0.15
Nodes (13): Conservative Concept Classification, Immutable Ontology Versions, Canonical Ontology Publication, Immutable Published Ontology, Exact Occurrence Classification Path, Concept Evidence Classification, Exact-History Classification Compatibility, Fact Evidence and Mastery Boundary (+5 more)

### Community 75 - "concept-classification-application.ts"
Cohesion: 0.24
Nodes (10): ClassifyGameRequest, ClassifyGameResult, ConceptClassificationApplicationError, ConceptClassificationApplicationErrorCode, ConceptClassificationApplicationService, exactHistoryMismatch(), historyMismatch(), verifyEngineContext() (+2 more)

### Community 76 - "OntologyRepository"
Cohesion: 0.29
Nodes (4): jsonArray(), OntologyRepository, OntologyConceptSummary, OntologySnapshot

### Community 77 - "security-audit-repository.ts"
Cohesion: 0.30
Nodes (8): AppendSecurityAuditEventInput, AuditRow, iso(), metadata(), SecurityAuditEventRecord, SecurityAuditRepository, SecurityAuditAction, SecurityAuditOutcome

### Community 78 - "test/concept-classification.test.ts"
Cohesion: 0.18
Nodes (5): ClassificationResponse, ConceptEvidenceFakeEngine, engineLine(), EvidenceResponse, fixtureUrl

### Community 80 - "test/player-intelligence.test.ts"
Cohesion: 0.18
Nodes (4): DossierFixtureEngine, EngineScenario, fixtures, line()

### Community 81 - "students/[id]/page.tsx"
Cohesion: 0.18
Nodes (7): ApiError, AssignmentView, label(), ProgressResponse, StudentIntelligence, StudentIntelligencePage(), TrainingPlan

### Community 82 - "worker/package.json"
Cohesion: 0.17
Nodes (11): exports, name, private, scripts, build, dev, health, start (+3 more)

### Community 83 - "Chess Concept Ontology and Evidence Policy"
Cohesion: 0.21
Nodes (12): Chess Concept Ontology and Evidence Policy, Evidence Policy Roles, Hierarchy and Prerequisite Graph Semantics, Read-Only Ontology Boundary, Chess Concept Authoring Guide, Immutable Ontology Publication, Prerequisite DAG, Primary Parent Hierarchy (+4 more)

### Community 84 - "config/package.json"
Cohesion: 0.17
Nodes (11): dependencies, zod, exports, zod, name, private, scripts, build (+3 more)

### Community 85 - "task015-seed-learning.ts"
Cohesion: 0.20
Nodes (4): analyzeWithFixture(), database, FixtureEngine, principalVariation()

### Community 86 - "Chess Intelligent Platform"
Cohesion: 0.18
Nodes (11): Continuous Integration Pipeline, Database Migration and Quality Checks, Local Infrastructure Stack, PostgreSQL Service, Redis Service, Chess Intelligent Platform, Engine Analysis Workflow, Chess Concept Ontology Workflow (+3 more)

### Community 87 - "manual-task009-server.ts"
Cohesion: 0.22
Nodes (4): focal, line(), ManualSkillGraphEngine, shutdown()

### Community 88 - "Task 007 Chess Concept Ontology"
Cohesion: 0.22
Nodes (11): Evidence Policy Authoring, DIRECT SUPPORTING CONTEXTUAL Evidence Roles, OntologyGraph, OntologyRegistry, OntologyValidator, Task 007 Chess Concept Ontology, Game Decision to Concept Evidence Pipeline, Deterministic Chess Facts (+3 more)

### Community 89 - "001_foundation.sql"
Cohesion: 0.40
Nodes (10): data_licenses, data_sources, external_identities, game_players, game_source_records, games, import_jobs, moves (+2 more)

### Community 90 - "db/package.json"
Cohesion: 0.18
Nodes (10): exports, ./testing, name, private, scripts, build, migrate, typecheck (+2 more)

### Community 91 - "domain/package.json"
Cohesion: 0.18
Nodes (10): devDependencies, typescript, exports, name, private, scripts, build, typecheck (+2 more)

### Community 92 - "paths"
Cohesion: 0.18
Nodes (11): packages/chess-core/src/index.ts, packages/config/src/index.ts, packages/db/src/index.ts, packages/domain/src/index.ts, packages/ui/src/index.ts, paths, @chess-intelligent/chess-core, @chess-intelligent/config (+3 more)

### Community 93 - "devDependencies"
Cohesion: 0.20
Nodes (10): @electric-sql/pglite, @electric-sql/pglite, devDependencies, @electric-sql/pglite, tsx, @types/node, @types/pg, typescript (+2 more)

### Community 94 - "../../tsconfig.base.json"
Cohesion: 0.20
Nodes (8): extends, include, src/**/*.ts, test/**/*.ts, extends, include, src/**/*.ts, ../../tsconfig.base.json

### Community 95 - "explorer/page.tsx"
Cohesion: 0.29
Nodes (9): ApiError, ExplorerResult, nullableNumber(), percentage(), PositionExplorerPage(), navigate(), runQuery(), submit() (+1 more)

### Community 98 - "chess-core/package.json"
Cohesion: 0.22
Nodes (8): exports, name, private, scripts, build, typecheck, type, version

### Community 99 - "manual-task008-server.ts"
Cohesion: 0.32
Nodes (3): line(), ManualConceptEngine, shutdown()

### Community 100 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, incremental, jsx, plugins, exclude, extends, node_modules

### Community 101 - "Task 005 Opponent Opening Intelligence"
Cohesion: 0.54
Nodes (8): Opponent Opening Intelligence, ENGINE_SOUNDNESS_V1, OPPONENT_FAMILIARITY_V1, PREPARATION_INTEREST_V1, REPERTOIRE_PREDICTABILITY_V1, REPERTOIRE_TREND_V1, STRONG_REFERENCE_V1, Task 005 Opponent Opening Intelligence

### Community 102 - "009_concept_evidence_classification.sql"
Cohesion: 0.50
Nodes (7): analysis_runs, concept_classification_runs, concept_evidence_instances, concept_evidence_policies, game_players, ontology_versions, position_occurrences

### Community 103 - "assignments/[id]/page.tsx"
Cohesion: 0.33
Nodes (4): ApiError, AssignmentPage(), AssignmentResponse, label()

### Community 104 - "layout.tsx"
Cohesion: 0.33
Nodes (3): metadata, SessionNavigation(), SessionUser

### Community 105 - "005_engine_analysis.sql"
Cohesion: 0.67
Nodes (6): analysis_jobs, analysis_runs, critical_positions, engine_evaluations, engine_position_states, move_engine_assessments

### Community 106 - "008_chess_concept_ontology.sql"
Cohesion: 0.67
Nodes (6): concept_definitions, concept_evidence_policies, concept_identities, concept_relationships, evidence_type_definitions, ontology_versions

### Community 107 - "include"
Cohesion: 0.33
Nodes (6): include, next-env.d.ts, .next/types/**/*.ts, *.ts, **/*.tsx, include

### Community 108 - "ui/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, jsx, extends, include, src/**/*.tsx

### Community 109 - "acceptance/tsconfig.json"
Cohesion: 0.33
Nodes (5): node, compilerOptions, baseUrl, types, extends

### Community 110 - "[academyId]/my/page.tsx"
Cohesion: 0.40
Nodes (3): AssignmentsResponse, AssignmentView, IntelligenceResponse

### Community 111 - "worker/tsconfig.json"
Cohesion: 0.40
Nodes (4): extends, include, src/**/*.ts, test/**/*.ts

### Community 112 - "game-phase.ts"
Cohesion: 0.50
Nodes (3): classifyGamePhase(), MATERIAL_VALUE, GamePhase

### Community 113 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 114 - "build-node-artifacts.mjs"
Cohesion: 0.40
Nodes (4): targets, workspaceEntrypoints, workspaceResolver, workspaceRoot

### Community 116 - "chess-core/tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, src/**/*.ts

### Community 117 - "db/tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, src/**/*.ts

### Community 118 - "domain/tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, src/**/*.ts

## Knowledge Gaps
- **614 isolated node(s):** `PlayerSkillGraphRunView`, `SkillGraphCoverage`, `SkillGraphEvidenceContributionComputation`, `SkillGraphPolicyIdentityInput`, `ApiError` (+609 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `ClassificationRepository` (3× useful, score=2.466991394)
- `AnalysisRepository` (2× useful, score=1.70810116)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Color` connect `Color` to `player-intelligence.ts`, `preparation.ts`, `position-corpus-repository.ts`, `player-skill-graph.ts`, `TrainingRepository`, `engine-analysis.ts`, `player-skill-graph-application.ts`, `concept-facts.ts`, `db/src/index.ts`, `concept-classification.ts`, `classification-repository.ts`, `chess-core/src/index.ts`, `DataSourceType`, `player-skill-graph-repository.ts`, `ontology-repository.ts`, `domain/src/index.ts`, `metadata-game-repository.ts`, `training-repository.ts`, `academy-repository.ts`, `game-repository.ts`, `reconciliation.ts`, `QueryClient`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `buildApp()` connect `buildApp` to `player-intelligence.ts`, `preparation.ts`, `app.ts`, `position-corpus-repository.ts`, `appendSecurityAuditEvent`, `AuthApplicationService`, `Database`, `TrainingRepository`, `academy-production-foundation.test.ts`, `security-routes.ts`, `player-skill-graph-application.ts`, `EmailDeliveryProvider`, `classification-repository.ts`, `database.ts`, `academy-security-application.ts`, `DataSourceType`, `analysis-worker.ts`, `AcademyRepository`, `ontology-repository.ts`, `metadata-game-repository.ts`, `test/coach-student-intelligence.test.ts`, `PlayerSkillGraphRepository`, `ontology-application.ts`, `test/player-skill-graph.test.ts`, `game-reconciliation-application.ts`, `analysis-worker.test.ts`, `concept-classification-application.ts`, `security-audit-repository.ts`, `test/concept-classification.test.ts`, `opponent-preparation.test.ts`, `test/player-intelligence.test.ts`, `task015-seed-learning.ts`, `manual-task009-server.ts`, `manual-task008-server.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `Database` connect `Database` to `app.ts`, `position-corpus-repository.ts`, `appendSecurityAuditEvent`, `AuthApplicationService`, `Color`, `TrainingRepository`, `academy-production-foundation.test.ts`, `db/src/index.ts`, `EmailDeliveryProvider`, `classification-repository.ts`, `AnalysisRepository`, `database.ts`, `DataSourceType`, `analysis-worker.ts`, `AcademyRepository`, `player-skill-graph-repository.ts`, `ontology-repository.ts`, `metadata-game-repository.ts`, `training-repository.ts`, `academy-repository.ts`, `game-repository.ts`, `QueryClient`, `PlayerSkillGraphRepository`, `restore-verify-cli.ts`, `test/player-skill-graph.test.ts`, `analysis-worker.test.ts`, `OntologyRepository`, `security-audit-repository.ts`, `test/concept-classification.test.ts`, `opponent-preparation.test.ts`, `test/player-intelligence.test.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 40 inferred relationships involving `buildApp()` (e.g. with `.cancelAssignment()` and `.compareProgress()`) actually correct?**
  _`buildApp()` has 40 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PlayerSkillGraphRunView`, `SkillGraphCoverage`, `SkillGraphEvidenceContributionComputation` to the rest of the system?**
  _614 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `player-intelligence.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.059673659673659674 - nodes in this community are weakly interconnected._
- **Should `preparation.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07924984875983061 - nodes in this community are weakly interconnected._