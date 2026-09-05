export type { Database, DatabaseResult, PgDatabaseOptions, QueryClient } from './database';
export { PgDatabase } from './database';
export type { GameDetails } from './game-repository';
export { GameRepository } from './game-repository';
export { isSchemaCurrent, LATEST_MIGRATION_NAME, runMigrations } from './migrations';
export type {
  MetadataImportResult,
  PgnAttachmentErrorCode,
  PgnAttachmentResult,
} from './metadata-game-repository';
export { MetadataGameRepository, PgnAttachmentError } from './metadata-game-repository';
export type {
  PositionCorpusQuery,
  PositionCorpusRepositoryFilters,
  RawPositionCorpusResult,
  RawPositionMoveAggregate,
} from './position-corpus-repository';
export { PositionCorpusRepository } from './position-corpus-repository';
export type {
  RawBlackResponseGroup,
  RawCompatibleEngineMove,
  RawEngineCandidateEvidence,
  RawOpponentMove,
  RawPreparationHotspot,
  RawReferenceMove,
} from './opponent-preparation-repository';
export { OpponentPreparationRepository } from './opponent-preparation-repository';
export type { RawPlayerEngineObservation } from './player-intelligence-repository';
export { PlayerIntelligenceRepository } from './player-intelligence-repository';
export type { OntologySyncResult, OntologyVersionSummary } from './ontology-repository';
export { OntologyImmutabilityError, OntologyRepository } from './ontology-repository';
export { DEFAULT_ONTOLOGY_SOURCE_PATH, readOntologySourceFile } from './ontology-source';
export type {
  ClassificationEngineOccurrenceInput,
  ClassificationGameInput,
  ClassificationGameOccurrenceInput,
  PersistClassificationInput,
} from './classification-repository';
export {
  ClassificationRepository,
  ClassificationRepositoryError,
} from './classification-repository';
export type {
  LoadPlayerSkillEvidenceInput,
  PersistedConceptLineage,
  PersistedTrainingConceptLineage,
  PersistPlayerSkillGraphInput,
  PersistPlayerSkillGraphResult,
  PlayerSkillEvidenceProjection,
  PlayerSkillGraphRunRecord,
} from './player-skill-graph-repository';
export { PlayerSkillGraphRepository } from './player-skill-graph-repository';
export type {
  MaterializedTrainingItemInput,
  PersistTrainingPlanInput,
  PersistTrainingPlanResult,
  TrainingAttemptRecord,
  TrainingCandidateRecord,
  TrainingEvidenceRecord,
  TrainingItemRecord,
  TrainingPlanRunRecord,
  TrainingSourceMaterial,
} from './training-repository';
export { TrainingRepository, TrainingRepositoryError } from './training-repository';
export type {
  AcademyMembershipRecord,
  AcademyMembershipRole,
  AcademyRecord,
  AssignableTrainingPlan,
  CreateTrainingAssignmentInput,
  RosterProjectionRow,
  StudentProfileRecord,
  StudentTrainingSummary,
  TrainingAssignmentRecord,
} from './academy-repository';
export { AcademyRepository, AcademyRepositoryError } from './academy-repository';
export type {
  AppendSecurityAuditEventInput,
  SecurityAuditEventRecord,
} from './security-audit-repository';
export { SecurityAuditRepository, appendSecurityAuditEvent } from './security-audit-repository';
export type {
  AuthenticatedPrincipalRecord,
  CurrentUserMembershipRecord,
  CurrentUserRecord,
  LoginAccountRecord,
} from './auth-repository';
export { AuthRepository, AuthRepositoryError } from './auth-repository';
export type { PasswordResetDeliveryRecord } from './password-reset-repository';
export { PasswordResetRepository } from './password-reset-repository';
export type {
  AcademyActorRecord,
  AssignedStudentItemContext,
  ManagedMembershipRecord,
  StudentActorContext,
} from './academy-access-repository';
export { AcademyAccessRepository, AcademyAccessRepositoryError } from './academy-access-repository';
export type {
  AcademyInvitationDeliveryStatus,
  AcademyInvitationRecord,
  AcademyInvitationStatus,
} from './academy-invitation-repository';
export {
  AcademyInvitationRepository,
  AcademyInvitationRepositoryError,
} from './academy-invitation-repository';
export type {
  AnalysisEvaluationView,
  AnalysisGame,
  AnalysisGameOccurrence,
  AnalysisJobView,
  AnalysisRunSummary,
  AnalysisRunView,
  ClaimedAnalysisJob,
  PersistPositionAnalysisInput,
} from './analysis-repository';
export {
  AnalysisRepository,
  AnalysisRepositoryError,
  analysisProfileConfigurationHash,
} from './analysis-repository';
