import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import { parsePgn, PgnParseError, PositionFenError, sha256 } from '@chess-intelligent/chess-core';
import {
  AnalysisRepository,
  AnalysisRepositoryError,
  AcademyAccessRepository,
  AcademyAccessRepositoryError,
  AcademyInvitationRepository,
  AcademyInvitationRepositoryError,
  AcademyRepository,
  AcademyRepositoryError,
  ClassificationRepository,
  ClassificationRepositoryError,
  GameRepository,
  MetadataGameRepository,
  OntologyRepository,
  OpponentPreparationRepository,
  PlayerIntelligenceRepository,
  PlayerSkillGraphRepository,
  PgnAttachmentError,
  PositionCorpusRepository,
  AuthRepository,
  PasswordResetRepository,
  SecurityAuditRepository,
  TrainingRepository,
  TrainingRepositoryError,
  type Database,
  isSchemaCurrent,
} from '@chess-intelligent/db';
import {
  ANALYSIS_PROFILES,
  COLORS,
  ConceptEvidencePolicyError,
  DATA_SOURCE_TYPES,
  GAME_CONTEXTS,
  IDENTITY_PROVIDERS,
  TIME_CATEGORIES,
  ACADEMY_MEMBERSHIP_ROLES,
} from '@chess-intelligent/domain';

import {
  GameReconciliationApplicationService,
  ReviewedAttachmentError,
} from './game-reconciliation-application';
import {
  PositionExplorerApplicationService,
  PositionExplorerError,
} from './position-explorer-application';
import {
  OpponentPreparationApplicationService,
  OpponentPreparationError,
} from './opponent-preparation-application';
import { PlayerDossierApplicationService, PlayerDossierError } from './player-dossier-application';
import { OntologyApplicationError, OntologyApplicationService } from './ontology-application';
import {
  ConceptClassificationApplicationError,
  ConceptClassificationApplicationService,
} from './concept-classification-application';
import {
  PlayerSkillGraphApplicationError,
  PlayerSkillGraphApplicationService,
} from './player-skill-graph-application';
import { TrainingApplicationError, TrainingApplicationService } from './training-application';
import { AcademyApplicationError, AcademyApplicationService } from './academy-application';
import {
  AcademySecurityApplicationError,
  AcademySecurityApplicationService,
} from './academy-security-application';
import { AuthApplicationError, AuthApplicationService } from './auth-application';
import { Argon2idPasswordHasher } from './password-hasher';
import { authErrorStatus, registerCsrfOriginBoundary, requireRequestPrincipal } from './auth-http';
import { registerSecurityRoutes } from './security-routes';
import { DisabledEmailDeliveryProvider, type EmailDeliveryProvider } from './email-delivery';
import {
  PasswordResetApplicationError,
  PasswordResetApplicationService,
} from './password-reset-application';

const importBodySchema = z.object({
  pgn: z.string().min(1, 'pgn is required').max(2_000_000, 'pgn must not exceed 2 MB'),
  sourceType: z.enum(DATA_SOURCE_TYPES).default('USER_UPLOAD'),
  externalId: z.string().trim().min(1).max(500).nullable().optional().default(null),
});

const gameParametersSchema = z.object({ id: z.uuid() });
const analysisJobBodySchema = z.object({
  gameId: z.uuid(),
  profile: z.enum(ANALYSIS_PROFILES).default('QUICK_V1'),
});
const analysisParametersSchema = z.object({ id: z.uuid() });
const classificationBodySchema = z.object({
  ontologyVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u),
  analysisRunId: z.uuid().optional(),
});
const classificationParametersSchema = z.object({ id: z.uuid() });
const conceptStableIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*)+$/u);
const conceptEvidenceQuerySchema = z.object({
  classificationRunId: z.uuid().optional(),
  concept: conceptStableIdSchema.optional(),
});

const nullableText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional().default(null);

function isValidIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
  );
}

const metadataPlayerSchema = z.object({
  displayName: z.string().trim().min(1).max(300),
  rating: z.number().int().min(100).max(4000).nullable().optional().default(null),
  fideId: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/u, 'FIDE ID must contain 4 to 10 digits')
    .nullable()
    .optional()
    .default(null),
});

const metadataBodySchema = z
  .object({
    sourceType: z.enum(DATA_SOURCE_TYPES).default('USER_UPLOAD'),
    event: nullableText(500),
    site: nullableText(500),
    round: nullableText(100),
    boardNumber: z
      .union([z.string().trim().min(1).max(100), z.number().int().nonnegative()])
      .nullable()
      .optional()
      .default(null)
      .transform((value) => (value === null ? null : String(value))),
    playedAt: z
      .string()
      .refine(isValidIsoDate, 'playedAt must be a real ISO date in YYYY-MM-DD format')
      .nullable()
      .optional()
      .default(null),
    result: z.enum(['1-0', '0-1', '1/2-1/2', '*']),
    gameContext: z.enum(GAME_CONTEXTS).default('UNKNOWN'),
    timeCategory: z.enum(TIME_CATEGORIES).default('UNKNOWN'),
    timeControl: nullableText(100),
    rated: z.boolean().nullable().optional().default(null),
    white: metadataPlayerSchema,
    black: metadataPlayerSchema,
    externalTournamentId: nullableText(500),
    externalGameId: nullableText(500),
  })
  .superRefine((value, context) => {
    if (value.white.fideId && value.white.fideId === value.black.fideId) {
      context.addIssue({
        code: 'custom',
        path: ['black', 'fideId'],
        message: 'White and Black cannot share the same FIDE identity.',
      });
    }
  });

const reconcilePgnBodySchema = z.object({
  pgn: z.string().min(1).max(2_000_000),
  sourceType: z.enum(DATA_SOURCE_TYPES).default('USER_UPLOAD'),
  externalGameId: nullableText(500),
  externalTournamentId: nullableText(500),
});

const attachPgnBodySchema = reconcilePgnBodySchema.extend({
  expectedReconciliationClassification: z.enum(['EXACT_MATCH', 'HIGH_CONFIDENCE_MATCH']),
});

const exactIdentitySchema = z.object({
  provider: z.enum(IDENTITY_PROVIDERS),
  externalId: z.string().trim().min(1).max(200),
});

const corpusFiltersSchema = z
  .object({
    playerId: z.uuid().nullable().optional().default(null),
    externalIdentity: exactIdentitySchema.nullable().optional().default(null),
    playerColor: z.enum(COLORS).nullable().optional().default(null),
    gameContexts: z.array(z.enum(GAME_CONTEXTS)).max(GAME_CONTEXTS.length).optional().default([]),
    timeCategories: z
      .array(z.enum(TIME_CATEGORIES))
      .max(TIME_CATEGORIES.length)
      .optional()
      .default([]),
    playedFrom: z
      .string()
      .refine(isValidIsoDate, 'playedFrom must be a real ISO date in YYYY-MM-DD format')
      .nullable()
      .optional()
      .default(null),
    playedTo: z
      .string()
      .refine(isValidIsoDate, 'playedTo must be a real ISO date in YYYY-MM-DD format')
      .nullable()
      .optional()
      .default(null),
    minimumOpponentRating: z.number().int().min(100).max(4000).nullable().optional().default(null),
    sourceTypes: z
      .array(z.enum(DATA_SOURCE_TYPES))
      .max(DATA_SOURCE_TYPES.length)
      .optional()
      .default([]),
    minimumSampleSize: z.number().int().min(1).max(100_000).optional().default(1),
  })
  .superRefine((value, context) => {
    if (value.playerId && value.externalIdentity) {
      context.addIssue({
        code: 'custom',
        path: ['externalIdentity'],
        message: 'Supply playerId or externalIdentity, not both.',
      });
    }
    if (value.playedFrom && value.playedTo && value.playedFrom > value.playedTo) {
      context.addIssue({
        code: 'custom',
        path: ['playedTo'],
        message: 'playedTo must not be earlier than playedFrom.',
      });
    }
  });

const explorePositionBodySchema = z
  .object({
    positionId: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable()
      .optional()
      .default(null),
    fen: z.string().trim().min(1).max(500).nullable().optional().default(null),
    filters: corpusFiltersSchema.optional().default({
      playerId: null,
      externalIdentity: null,
      playerColor: null,
      gameContexts: [],
      timeCategories: [],
      playedFrom: null,
      playedTo: null,
      minimumOpponentRating: null,
      sourceTypes: [],
      minimumSampleSize: 1,
    }),
  })
  .superRefine((value, context) => {
    if (Boolean(value.positionId) === Boolean(value.fen)) {
      context.addIssue({
        code: 'custom',
        path: ['positionId'],
        message: 'Supply exactly one positionId or FEN.',
      });
    }
  });

const identityQuerySchema = exactIdentitySchema;
const playerParametersSchema = z.object({ id: z.uuid() });
const ontologyVersionParametersSchema = z.object({
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u),
});
const ontologyConceptParametersSchema = ontologyVersionParametersSchema.extend({
  stableId: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*)+$/u),
});
const ontologyQuerySchema = z.object({ domain: z.string().trim().min(1).max(100).optional() });

const preparationFiltersSchema = z
  .object({
    gameContexts: z.array(z.enum(GAME_CONTEXTS)).max(GAME_CONTEXTS.length).optional(),
    timeCategories: z.array(z.enum(TIME_CATEGORIES)).max(TIME_CATEGORIES.length).optional(),
    playedFrom: z
      .string()
      .refine(isValidIsoDate, 'playedFrom must be a real ISO date in YYYY-MM-DD format')
      .nullable()
      .optional(),
    playedTo: z
      .string()
      .refine(isValidIsoDate, 'playedTo must be a real ISO date in YYYY-MM-DD format')
      .nullable()
      .optional(),
    minimumOpponentRating: z.number().int().min(100).max(4000).nullable().optional(),
    sourceTypes: z.array(z.enum(DATA_SOURCE_TYPES)).max(DATA_SOURCE_TYPES.length).optional(),
  })
  .superRefine((value, context) => {
    if (value.playedFrom && value.playedTo && value.playedFrom > value.playedTo) {
      context.addIssue({
        code: 'custom',
        path: ['playedTo'],
        message: 'playedTo must not be earlier than playedFrom.',
      });
    }
  });

const prepareOpponentBodySchema = z.object({
  opponentPlayerId: z.uuid(),
  opponentColor: z.enum(COLORS),
  filters: preparationFiltersSchema.optional(),
});

const prepareOpponentPositionBodySchema = prepareOpponentBodySchema.extend({
  positionId: z.string().regex(/^[a-f0-9]{64}$/u),
  positionFen: z.string().trim().min(1).max(500).nullable().optional(),
});

const playerDossierBodySchema = z
  .object({
    playerId: z.uuid().optional(),
    externalIdentity: z
      .object({
        provider: z.literal('FIDE'),
        externalId: z
          .string()
          .trim()
          .regex(/^\d{4,10}$/u),
      })
      .optional(),
    filters: preparationFiltersSchema.optional(),
    engineProfile: z.enum(ANALYSIS_PROFILES).optional().default('QUICK_V1'),
  })
  .superRefine((value, context) => {
    if (Boolean(value.playerId) === Boolean(value.externalIdentity)) {
      context.addIssue({
        code: 'custom',
        path: ['playerId'],
        message: 'Supply exactly one playerId or exact FIDE identity.',
      });
    }
  });

const playerSkillGraphScopeSchema = z
  .object({
    gameContexts: z.array(z.enum(GAME_CONTEXTS)).max(GAME_CONTEXTS.length).optional(),
    timeCategories: z.array(z.enum(TIME_CATEGORIES)).max(TIME_CATEGORIES.length).optional(),
    playedFrom: z.string().refine(isValidIsoDate).nullable().optional(),
    playedTo: z.string().refine(isValidIsoDate).nullable().optional(),
    sourceTypes: z.array(z.enum(DATA_SOURCE_TYPES)).max(DATA_SOURCE_TYPES.length).optional(),
  })
  .superRefine((value, context) => {
    if (value.playedFrom && value.playedTo && value.playedFrom > value.playedTo) {
      context.addIssue({
        code: 'custom',
        path: ['playedTo'],
        message: 'playedTo must not be earlier than playedFrom.',
      });
    }
  });

const playerSkillGraphBodySchema = z
  .object({
    playerId: z.uuid().optional(),
    externalIdentity: z
      .object({
        provider: z.literal('FIDE'),
        externalId: z
          .string()
          .trim()
          .regex(/^\d{4,10}$/u),
      })
      .optional(),
    ontologyVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u),
    asOfDate: z.string().refine(isValidIsoDate, 'asOfDate must be a real YYYY-MM-DD date'),
    scope: playerSkillGraphScopeSchema.optional(),
    skillGraphPolicyVersion: z.enum(['SKILL_GRAPH_POLICY_V1', 'SKILL_GRAPH_POLICY_V2']).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.playerId) === Boolean(value.externalIdentity)) {
      context.addIssue({
        code: 'custom',
        path: ['playerId'],
        message: 'Supply exactly one playerId or exact FIDE identity.',
      });
    }
  });

const skillGraphRunParametersSchema = z.object({ id: z.uuid() });
const skillGraphConceptParametersSchema = z.object({
  runId: z.uuid(),
  stableId: conceptStableIdSchema,
});
const academySkillGraphBodySchema = z.object({
  ontologyVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u),
  asOfDate: z.string().refine(isValidIsoDate, 'asOfDate must be a real YYYY-MM-DD date'),
  scope: playerSkillGraphScopeSchema.optional(),
  skillGraphPolicyVersion: z.enum(['SKILL_GRAPH_POLICY_V1', 'SKILL_GRAPH_POLICY_V2']).optional(),
});
const trainingPlanBodySchema = z.object({
  playerId: z.uuid(),
  skillGraphRunId: z.uuid(),
  maxItems: z.number().int().min(1).max(100).default(10),
});
const trainingIdParametersSchema = z.object({ id: z.uuid() });
const trainingAttemptBodySchema = z.object({
  // Accepted only by explicitly enabled internal-development routes. The
  // production path always derives playerId from the authenticated Student.
  playerId: z.uuid().optional(),
  moveUci: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/u),
  startedAt: z.iso.datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
});

const academyParametersSchema = z.object({ academyId: z.uuid() });
const academyStudentParametersSchema = academyParametersSchema.extend({ studentId: z.uuid() });
const academyAssignmentParametersSchema = academyParametersSchema.extend({
  assignmentId: z.uuid(),
});
const academyBodySchema = z.object({ name: z.string().trim().min(1).max(300) });
const academyMembershipBodySchema = z.object({
  role: z.enum(ACADEMY_MEMBERSHIP_ROLES),
  displayName: z.string().trim().min(1).max(300),
});
const studentProfileBodySchema = z.object({
  membershipId: z.uuid(),
  playerId: z.uuid(),
  requiresGuardianConsent: z.boolean().default(false),
});
const academyCoachQuerySchema = z.object({});
const academyLegacyCoachQuerySchema = z.object({ coachMembershipId: z.uuid() });
const commaSeparated = (allowed: readonly string[]) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (value) =>
        !value ||
        value
          .split(',')
          .filter(Boolean)
          .every((entry) => allowed.includes(entry)),
      'One or more scope values are invalid.',
    );
const academyIntelligenceQuerySchema = academyCoachQuerySchema.extend({
  ontologyVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u),
  skillGraphPolicyVersion: z
    .enum(['SKILL_GRAPH_POLICY_V1', 'SKILL_GRAPH_POLICY_V2'])
    .default('SKILL_GRAPH_POLICY_V2'),
  gameContexts: commaSeparated(GAME_CONTEXTS),
  timeCategories: commaSeparated(TIME_CATEGORIES),
  sourceTypes: commaSeparated(DATA_SOURCE_TYPES),
  playedFrom: z.string().refine(isValidIsoDate).nullable().optional(),
  playedTo: z.string().refine(isValidIsoDate).nullable().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const academyLegacyIntelligenceQuerySchema = academyIntelligenceQuerySchema.extend({
  coachMembershipId: z.uuid(),
});
const trainingAssignmentBodySchema = z.object({
  studentProfileId: z.uuid(),
  trainingPlanRunId: z.uuid(),
  baselineSkillGraphRunId: z.uuid(),
  trainingItemIds: z.array(z.uuid()).min(1).max(100),
  dueAt: z.string().refine(isValidIsoDate).nullable().optional(),
  note: z.string().trim().min(1).max(2000).nullable().optional(),
});
const legacyTrainingAssignmentBodySchema = trainingAssignmentBodySchema.extend({
  coachMembershipId: z.uuid(),
});
const studentProgressBodySchema = z.object({
  academyId: z.uuid(),
  studentProfileId: z.uuid(),
  fromSkillGraphRunId: z.uuid(),
  toSkillGraphRunId: z.uuid(),
});
const legacyStudentProgressBodySchema = studentProgressBodySchema.extend({
  coachMembershipId: z.uuid(),
});

function splitScope<Value extends string>(value: string | undefined): Value[] | undefined {
  return value ? (value.split(',').filter(Boolean) as Value[]) : undefined;
}

function academyProfile(query: z.infer<typeof academyIntelligenceQuerySchema>) {
  return {
    ontologyVersion: query.ontologyVersion,
    skillGraphPolicyVersion: query.skillGraphPolicyVersion,
    scope: {
      gameContexts: splitScope<(typeof GAME_CONTEXTS)[number]>(query.gameContexts),
      timeCategories: splitScope<(typeof TIME_CATEGORIES)[number]>(query.timeCategories),
      sourceTypes: splitScope<(typeof DATA_SOURCE_TYPES)[number]>(query.sourceTypes),
      playedFrom: query.playedFrom,
      playedTo: query.playedTo,
    },
  };
}

function academyErrorStatus(error: AcademyApplicationError | AcademyRepositoryError): number {
  if (error.code === 'COACH_MEMBERSHIP_REQUIRED') return 403;
  if (
    error.code === 'ACADEMY_NOT_FOUND' ||
    error.code === 'STUDENT_PROFILE_NOT_FOUND' ||
    error.code === 'SKILL_GRAPH_RUN_NOT_FOUND' ||
    error.code === 'ONTOLOGY_NOT_FOUND' ||
    error.code === 'TRAINING_ASSIGNMENT_NOT_FOUND' ||
    error.code === 'TRAINING_PLAN_NOT_FOUND'
  ) {
    return 404;
  }
  return 409;
}

export interface AppOptions {
  database: Database;
  webOrigin?: string;
  webOrigins?: readonly string[];
  logger?: boolean;
  manageDatabaseLifecycle?: boolean;
  now?: () => Date;
  secureCookies?: boolean;
  internalDevRoutes?: boolean;
  trustProxy?: boolean;
  emailDelivery?: EmailDeliveryProvider;
}

export function redactSensitiveRequestUrl(url: string): string {
  return url.replace(/\/auth\/invitations\/[^/?]+/gu, '/auth/invitations/[REDACTED]');
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const fastifyOptions = {
    trustProxy: options.trustProxy ?? false,
    genReqId: (request: { headers: Record<string, string | string[] | undefined> }) => {
      const supplied = request.headers['x-request-id'];
      const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
      return candidate && /^[a-zA-Z0-9._:-]{1,100}$/u.test(candidate) ? candidate : randomUUID();
    },
  };
  const app = options.logger
    ? Fastify({
        ...fastifyOptions,
        logger: {
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers.set-cookie',
              'password',
              'newPassword',
              'currentPassword',
              'rawToken',
            ],
            censor: '[REDACTED]',
          },
          serializers: {
            req: (value: unknown) => {
              const request = value as {
                method?: string;
                url?: string;
                headers?: { host?: string };
                remoteAddress?: string;
              };
              return {
                method: request.method ?? '',
                url: redactSensitiveRequestUrl(request.url ?? ''),
                host: request.headers?.host ?? '',
                remoteAddress: request.remoteAddress ?? '',
              };
            },
          },
        },
      })
    : Fastify({ ...fastifyOptions, logger: false });
  const now = options.now ?? (() => new Date());
  const secureCookies = options.secureCookies ?? false;
  const internalDevRoutes = options.internalDevRoutes ?? false;
  const repository = new GameRepository(options.database);
  const analysisRepository = new AnalysisRepository(options.database);
  const metadataRepository = new MetadataGameRepository(options.database);
  const reconciliation = new GameReconciliationApplicationService(metadataRepository);
  const positionCorpusRepository = new PositionCorpusRepository(options.database);
  const positionExplorer = new PositionExplorerApplicationService(positionCorpusRepository);
  const opponentPreparation = new OpponentPreparationApplicationService(
    new OpponentPreparationRepository(options.database),
    positionCorpusRepository,
    now,
  );
  const playerDossier = new PlayerDossierApplicationService(
    new PlayerIntelligenceRepository(options.database),
    positionCorpusRepository,
    opponentPreparation,
    now,
  );
  const ontologyRepository = new OntologyRepository(options.database);
  const ontology = new OntologyApplicationService(ontologyRepository);
  const conceptClassification = new ConceptClassificationApplicationService(
    new ClassificationRepository(options.database),
    ontologyRepository,
  );
  const playerSkillGraphRepository = new PlayerSkillGraphRepository(options.database);
  const trainingRepository = new TrainingRepository(options.database);
  const playerSkillGraph = new PlayerSkillGraphApplicationService(
    playerSkillGraphRepository,
    positionCorpusRepository,
    ontologyRepository,
    trainingRepository,
  );
  const training = new TrainingApplicationService(
    trainingRepository,
    playerSkillGraphRepository,
    ontologyRepository,
  );
  const academyRepository = new AcademyRepository(options.database);
  const academyIntelligence = new AcademyApplicationService(
    academyRepository,
    playerSkillGraphRepository,
    ontologyRepository,
    now,
  );
  const authRepository = new AuthRepository(options.database);
  const auditRepository = new SecurityAuditRepository(options.database);
  const passwordHasher = new Argon2idPasswordHasher();
  const emailDelivery = options.emailDelivery ?? new DisabledEmailDeliveryProvider();
  const auth = new AuthApplicationService(authRepository, passwordHasher, undefined, now);
  const passwordReset = new PasswordResetApplicationService(
    new PasswordResetRepository(options.database),
    auth,
    passwordHasher,
    emailDelivery,
    now,
  );
  const academySecurity = new AcademySecurityApplicationService(
    new AcademyAccessRepository(options.database),
    new AcademyInvitationRepository(options.database),
    academyRepository,
    auditRepository,
    auth,
    now,
    emailDelivery,
    internalDevRoutes,
  );

  const webOrigins = options.webOrigins ?? [options.webOrigin ?? 'http://localhost:3000'];
  await app.register(cookie);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    reply.header('content-security-policy', "frame-ancestors 'none'");
  });
  registerCsrfOriginBoundary(app, { webOrigins, secureCookies });
  await app.register(cors, { origin: [...webOrigins], credentials: true });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthApplicationError) {
      if (error.retryAfterSeconds) reply.header('retry-after', String(error.retryAfterSeconds));
      return reply
        .code(authErrorStatus(error))
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof AcademySecurityApplicationError) {
      const status = error.code.startsWith('EMAIL_DELIVERY_') ? 503 : 403;
      return reply.code(status).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof PasswordResetApplicationError) {
      return reply.code(400).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof AcademyInvitationRepositoryError) {
      const status =
        error.code === 'INVITATION_EXPIRED' ? 410 : error.code === 'INVITATION_INVALID' ? 404 : 409;
      return reply.code(status).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof AcademyAccessRepositoryError) {
      const status = error.code.endsWith('_REQUIRED')
        ? 403
        : error.code.endsWith('_NOT_FOUND')
          ? 404
          : 409;
      return reply.code(status).send({ error: { code: error.code, message: error.message } });
    }
    _request.log.error(
      {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorCode:
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : undefined,
        requestId: _request.id,
        route: _request.routeOptions.url,
      },
      'request failed',
    );
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'The request could not be completed.',
        requestId: _request.id,
      },
    });
  });

  registerSecurityRoutes({
    app,
    auth,
    passwordReset,
    security: academySecurity,
    audit: auditRepository,
    secureCookies,
  });

  const authorizeAcademy = async (
    request: Parameters<typeof requireRequestPrincipal>[0],
    academyId: string,
    capability: Parameters<AcademySecurityApplicationService['requireCapability']>[0]['capability'],
  ) => {
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    const actor = await academySecurity.requireCapability({
      principal,
      academyId,
      capability,
      requestId: request.id,
    });
    return { principal, actor };
  };

  if (options.manageDatabaseLifecycle ?? false) {
    app.addHook('onClose', async () => options.database.close());
  }

  app.get('/livez', async () => ({ status: 'alive' }));
  app.get('/health', async () => ({ status: 'alive' }));
  app.get('/readyz', async (_request, reply) => {
    try {
      await options.database.query('SELECT 1');
      const schemaCurrent = await isSchemaCurrent(options.database);
      if (!schemaCurrent) {
        return reply.code(503).send({ status: 'not_ready', database: 'ok', schema: 'outdated' });
      }
      return reply.send({
        status: 'ready',
        database: 'ok',
        schema: 'current',
        email: emailDelivery.configured ? 'configured' : 'disabled',
      });
    } catch {
      return reply.code(503).send({ status: 'not_ready', database: 'unavailable' });
    }
  });

  app.get('/ontology/versions', async () => ({ versions: await ontology.listVersions() }));

  app.get('/ontology/latest', async (request, reply) => {
    const query = ontologyQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ONTOLOGY_QUERY',
          message: 'The ontology query is invalid.',
          details: z.flattenError(query.error).fieldErrors,
        },
      });
    }
    try {
      return reply.send(await ontology.getOntology('latest', query.data.domain));
    } catch (error) {
      if (error instanceof OntologyApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/ontology/:version/concepts/:stableId', async (request, reply) => {
    const parameters = ontologyConceptParametersSchema.safeParse(request.params);
    if (!parameters.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ONTOLOGY_CONCEPT_PATH',
          message: 'The ontology version or concept stable ID is invalid.',
        },
      });
    }
    try {
      return reply.send(
        await ontology.getConcept(parameters.data.version, parameters.data.stableId),
      );
    } catch (error) {
      if (error instanceof OntologyApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/ontology/:version', async (request, reply) => {
    const parameters = ontologyVersionParametersSchema.safeParse(request.params);
    const query = ontologyQuerySchema.safeParse(request.query);
    if (!parameters.success || !query.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ONTOLOGY_QUERY',
          message: 'The ontology version or query is invalid.',
          details: query.success ? undefined : z.flattenError(query.error).fieldErrors,
        },
      });
    }
    try {
      return reply.send(await ontology.getOntology(parameters.data.version, query.data.domain));
    } catch (error) {
      if (error instanceof OntologyApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/analysis/jobs', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = analysisJobBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ANALYSIS_REQUEST',
          message: 'The analysis job request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    try {
      const result = await analysisRepository.requestJob(validated.data);
      request.log.info(
        { jobId: result.job.id, gameId: result.job.gameId, deduplicated: !result.created },
        'analysis job accepted',
      );
      return reply.code(202).send({ ...result.job, deduplicated: !result.created });
    } catch (error) {
      if (error instanceof AnalysisRepositoryError) {
        const status = error.code === 'GAME_NOT_FOUND' ? 404 : 409;
        return reply.code(status).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/analysis/jobs/:id', async (request, reply) => {
    const validated = analysisParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_ANALYSIS_JOB_ID', message: 'The job ID must be a UUID.' },
      });
    }
    const job = await analysisRepository.getJob(validated.data.id);
    if (!job) {
      return reply.code(404).send({
        error: {
          code: 'ANALYSIS_JOB_NOT_FOUND',
          message: 'No analysis job was found for that ID.',
        },
      });
    }
    return reply.send(job);
  });

  app.get('/analysis/runs/:id', async (request, reply) => {
    const validated = analysisParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_ANALYSIS_RUN_ID', message: 'The run ID must be a UUID.' },
      });
    }
    const run = await analysisRepository.getSuccessfulRun(validated.data.id);
    if (!run) {
      return reply.code(404).send({
        error: {
          code: 'ANALYSIS_RUN_NOT_FOUND',
          message: 'No completed analysis run was found for that ID.',
        },
      });
    }
    return reply.send(run);
  });

  app.get('/games/:id/analysis-runs', async (request, reply) => {
    const validated = gameParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_GAME_ID', message: 'The game ID must be a UUID.' },
      });
    }
    const game = await repository.getGame(validated.data.id);
    if (!game) {
      return reply.code(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'No game was found for that ID.' },
      });
    }
    return reply.send({ runs: await analysisRepository.listSuccessfulRuns(game.id) });
  });

  app.post('/classification/games/:id', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const parameters = gameParametersSchema.safeParse(request.params);
    const body = classificationBodySchema.safeParse(request.body);
    if (!parameters.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_CLASSIFICATION_REQUEST',
          message: 'The classification game ID or request body is invalid.',
          details: body.success ? undefined : z.flattenError(body.error).fieldErrors,
        },
      });
    }
    try {
      const result = await conceptClassification.classifyGame({
        gameId: parameters.data.id,
        ontologyVersion: body.data.ontologyVersion,
        analysisRunId: body.data.analysisRunId,
      });
      request.log.info(
        {
          gameId: parameters.data.id,
          classificationRunId: result.classificationRunId,
          selectedAnalysisRunId: result.selectedAnalysisRunId,
          evidenceCount: result.evidenceCount,
          deduplicated: result.deduplicated,
        },
        'concept classification completed',
      );
      return reply.code(result.deduplicated ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof ClassificationRepositoryError) {
        const status = ['GAME_NOT_FOUND', 'ANALYSIS_RUN_NOT_FOUND'].includes(error.code)
          ? 404
          : 409;
        return reply.code(status).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof ConceptClassificationApplicationError) {
        const status = error.code === 'ONTOLOGY_NOT_FOUND' ? 404 : 409;
        return reply.code(status).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof ConceptEvidencePolicyError) {
        return reply.code(409).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof PositionFenError) {
        return reply.code(409).send({
          error: { code: 'CLASSIFICATION_CHESS_STATE_INVALID', message: error.message },
        });
      }
      throw error;
    }
  });

  app.get('/classification/runs/:id', async (request, reply) => {
    const parameters = classificationParametersSchema.safeParse(request.params);
    if (!parameters.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_CLASSIFICATION_RUN_ID', message: 'The run ID must be a UUID.' },
      });
    }
    const run = await conceptClassification.getRun(parameters.data.id);
    if (!run) {
      return reply.code(404).send({
        error: {
          code: 'CLASSIFICATION_RUN_NOT_FOUND',
          message: 'No completed concept classification run was found for that ID.',
        },
      });
    }
    return reply.send(run);
  });

  app.get('/games/:id/concept-evidence', async (request, reply) => {
    const parameters = gameParametersSchema.safeParse(request.params);
    const query = conceptEvidenceQuerySchema.safeParse(request.query);
    if (!parameters.success || !query.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_CONCEPT_EVIDENCE_QUERY',
          message: 'The game ID or concept evidence query is invalid.',
          details: query.success ? undefined : z.flattenError(query.error).fieldErrors,
        },
      });
    }
    const projection = await conceptClassification.getGameEvidence(
      parameters.data.id,
      query.data.classificationRunId,
      query.data.concept,
    );
    if (!projection) {
      return reply.code(404).send({
        error: {
          code: 'CONCEPT_EVIDENCE_NOT_FOUND',
          message: 'No completed concept classification run was found for this game.',
        },
      });
    }
    return reply.send(projection);
  });

  app.get('/players/resolve', async (request, reply) => {
    const validated = identityQuerySchema.safeParse(request.query);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_IDENTITY_QUERY',
          message: 'The exact external identity query is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }

    const player = await positionExplorer.resolveIdentity(validated.data);
    if (!player) {
      return reply.code(404).send({
        error: {
          code: 'IDENTITY_NOT_FOUND',
          message: 'This exact verified identity does not exist in the local corpus.',
        },
      });
    }
    return reply.send(player);
  });

  app.get('/players/:id/corpus-summary', async (request, reply) => {
    const validated = playerParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_PLAYER_ID', message: 'The Player ID must be a UUID.' },
      });
    }
    const summary = await positionExplorer.getPlayerCorpusSummary(validated.data.id);
    if (!summary) {
      return reply.code(404).send({
        error: { code: 'PLAYER_NOT_FOUND', message: 'No local Player was found for that ID.' },
      });
    }
    return reply.send(summary);
  });

  app.get('/players/:id/opening-profile', async (request, reply) => {
    const validated = playerParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_PLAYER_ID', message: 'The Player ID must be a UUID.' },
      });
    }
    try {
      return reply.send(await opponentPreparation.getOpeningProfile(validated.data.id));
    } catch (error) {
      if (error instanceof OpponentPreparationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/intelligence/player-dossier', async (request, reply) => {
    const validated = playerDossierBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_PLAYER_DOSSIER_REQUEST',
          message: 'The Player Intelligence request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    try {
      const dossier = await playerDossier.generate(validated.data);
      request.log.info(
        {
          playerId: dossier.player.playerId,
          canonicalGames: dossier.coverage.canonicalGames,
          selectedAnalysisRuns: dossier.engine.aggregation.selectedAnalyzedGames,
          evidenceQuality: dossier.evidenceQuality.band,
        },
        'player intelligence dossier generated',
      );
      return reply.send(dossier);
    } catch (error) {
      if (error instanceof PlayerDossierError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/intelligence/player-skill-graph', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'Use an Academy-scoped workflow.' },
      });
    }
    const validated = playerSkillGraphBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_PLAYER_SKILL_GRAPH_REQUEST',
          message: 'The Player Skill Graph request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    try {
      const graph = await playerSkillGraph.generate(validated.data);
      request.log.info(
        {
          runId: graph.run.id,
          playerId: graph.run.playerId,
          ontologyVersion: graph.run.ontologyVersion,
          decisionOccurrences: graph.coverage.decisionOccurrences,
          masteryEligibleEvidence: graph.coverage.masteryEligibleEvidence,
          deduplicated: graph.run.deduplicated ?? false,
        },
        'player skill graph generated',
      );
      return reply.code(graph.run.deduplicated ? 200 : 201).send(graph);
    } catch (error) {
      if (error instanceof PlayerSkillGraphApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/skill-graph/runs/:runId/concepts/:stableId', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = skillGraphConceptParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_SKILL_GRAPH_CONCEPT_PATH',
          message: 'The Skill Graph run or concept stable ID is invalid.',
        },
      });
    }
    try {
      return reply.send(
        await playerSkillGraph.getConcept(validated.data.runId, validated.data.stableId),
      );
    } catch (error) {
      if (error instanceof PlayerSkillGraphApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/skill-graph/runs/:id', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = skillGraphRunParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_SKILL_GRAPH_RUN_ID', message: 'The run ID must be a UUID.' },
      });
    }
    try {
      return reply.send(await playerSkillGraph.getRun(validated.data.id));
    } catch (error) {
      if (error instanceof PlayerSkillGraphApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/players/:id/skill-graph-runs', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = playerParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_PLAYER_ID', message: 'The Player ID must be a UUID.' },
      });
    }
    try {
      return reply.send(await playerSkillGraph.listPlayerRuns(validated.data.id));
    } catch (error) {
      if (error instanceof PlayerSkillGraphApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/training/plans', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = trainingPlanBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_TRAINING_PLAN_REQUEST',
          message: 'The training plan request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    try {
      const plan = await training.createPlan(validated.data);
      return reply.code(plan.run.deduplicated ? 200 : 201).send(plan);
    } catch (error) {
      if (error instanceof TrainingApplicationError) {
        const status = error.code === 'PLAYER_SKILL_GRAPH_MISMATCH' ? 409 : 404;
        return reply.code(status).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/training/plans/:id', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = trainingIdParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_TRAINING_PLAN_ID', message: 'The plan ID must be a UUID.' },
      });
    }
    try {
      return reply.send(await training.getPlan(validated.data.id));
    } catch (error) {
      if (error instanceof TrainingApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/training/items/:id', async (request, reply) => {
    const validated = trainingIdParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_TRAINING_ITEM_ID', message: 'The item ID must be a UUID.' },
      });
    }
    try {
      if (!internalDevRoutes) {
        const principal = await requireRequestPrincipal(request, auth, secureCookies);
        await academySecurity.requireTrainingItemStudent({
          principal,
          trainingItemId: validated.data.id,
          requireConsent: false,
          requestId: request.id,
        });
      }
      return reply.send(await training.getItem(validated.data.id));
    } catch (error) {
      if (error instanceof TrainingApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/training/items/:id/attempts', async (request, reply) => {
    const [parameters, body] = [
      trainingIdParametersSchema.safeParse(request.params),
      trainingAttemptBodySchema.safeParse(request.body),
    ];
    if (!parameters.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_TRAINING_ATTEMPT_REQUEST',
          message: 'The training attempt request is invalid.',
          details: body.success ? undefined : z.flattenError(body.error).fieldErrors,
        },
      });
    }
    try {
      let playerId = body.data.playerId;
      if (!internalDevRoutes) {
        const principal = await requireRequestPrincipal(request, auth, secureCookies);
        const student = await academySecurity.requireTrainingItemStudent({
          principal,
          trainingItemId: parameters.data.id,
          requireConsent: true,
          requestId: request.id,
        });
        playerId = student.playerId;
      }
      if (!playerId) {
        return reply.code(400).send({
          error: {
            code: 'INTERNAL_PLAYER_ID_REQUIRED',
            message: 'Internal development attempts require playerId.',
          },
        });
      }
      return reply.code(201).send(
        await training.submitAttempt({
          itemId: parameters.data.id,
          playerId,
          moveUci: body.data.moveUci,
          startedAt: body.data.startedAt,
          durationMs: body.data.durationMs,
        }),
      );
    } catch (error) {
      if (error instanceof TrainingApplicationError) {
        const status = error.code === 'ILLEGAL_TRAINING_MOVE' ? 422 : 409;
        return reply.code(status).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof TrainingRepositoryError) {
        return reply.code(409).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/training/attempts/:id', async (request, reply) => {
    const validated = trainingIdParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_TRAINING_ATTEMPT_ID', message: 'The attempt ID must be a UUID.' },
      });
    }
    try {
      const attempt = await training.getAttempt(validated.data.id);
      if (!internalDevRoutes) {
        const principal = await requireRequestPrincipal(request, auth, secureCookies);
        const student = await academySecurity.requireTrainingItemStudent({
          principal,
          trainingItemId: attempt.attempt.trainingItemId,
          requireConsent: false,
          requestId: request.id,
        });
        if (student.playerId !== attempt.attempt.playerId) {
          throw new AcademySecurityApplicationError(
            'STUDENT_SELF_CONTEXT_REQUIRED',
            'The attempt does not belong to the authenticated Student.',
          );
        }
      }
      return reply.send(attempt);
    } catch (error) {
      if (error instanceof TrainingApplicationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/academies', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'Use the bootstrap workflow.' },
      });
    }
    const validated = academyBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ACADEMY_REQUEST',
          message: 'The Academy request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    return reply.code(201).send(await academyIntelligence.createAcademy(validated.data.name));
  });

  app.post('/academies/:academyId/memberships', async (request, reply) => {
    const [parameters, body] = [
      academyParametersSchema.safeParse(request.params),
      academyMembershipBodySchema.safeParse(request.body),
    ];
    if (!parameters.success || !body.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_ACADEMY_MEMBERSHIP_REQUEST', message: 'Invalid membership.' },
      });
    }
    try {
      if (!internalDevRoutes) {
        const principal = await requireRequestPrincipal(request, auth, secureCookies);
        return reply.code(201).send(
          await academySecurity.createMembership({
            principal,
            academyId: parameters.data.academyId,
            ...body.data,
            requestId: request.id,
          }),
        );
      }
      return reply.code(201).send(
        await academyIntelligence.createMembership({
          academyId: parameters.data.academyId,
          ...body.data,
        }),
      );
    } catch (error) {
      if (error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/academies/:academyId/students', async (request, reply) => {
    const [parameters, body] = [
      academyParametersSchema.safeParse(request.params),
      studentProfileBodySchema.safeParse(request.body),
    ];
    if (!parameters.success || !body.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_STUDENT_PROFILE_REQUEST', message: 'Invalid StudentProfile.' },
      });
    }
    try {
      if (!internalDevRoutes) {
        await authorizeAcademy(request, parameters.data.academyId, 'MEMBERSHIP_MANAGE');
      }
      return reply.code(201).send(
        await academyIntelligence.createStudentProfile({
          academyId: parameters.data.academyId,
          ...body.data,
        }),
      );
    } catch (error) {
      if (error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/academies/:academyId/roster', async (request, reply) => {
    const [parameters, query] = [
      academyParametersSchema.safeParse(request.params),
      (internalDevRoutes
        ? academyLegacyIntelligenceQuerySchema
        : academyIntelligenceQuerySchema
      ).safeParse(request.query),
    ];
    if (!parameters.success || !query.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ACADEMY_ROSTER_REQUEST',
          message: 'The roster requires an explicit valid intelligence profile.',
        },
      });
    }
    try {
      const actor = internalDevRoutes
        ? {
            membershipId: (query.data as unknown as { coachMembershipId: string })
              .coachMembershipId,
          }
        : (await authorizeAcademy(request, parameters.data.academyId, 'ROSTER_READ')).actor;
      if (!actor.membershipId) {
        return reply.code(400).send({
          error: { code: 'INTERNAL_COACH_ID_REQUIRED', message: 'coachMembershipId is required.' },
        });
      }
      return reply.send(
        await academyIntelligence.getRoster({
          academyId: parameters.data.academyId,
          coachMembershipId: actor.membershipId,
          profile: academyProfile(query.data),
          limit: query.data.limit,
          offset: query.data.offset,
        }),
      );
    } catch (error) {
      if (error instanceof AcademyApplicationError || error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/academies/:academyId/students/:studentId/intelligence', async (request, reply) => {
    const [parameters, query] = [
      academyStudentParametersSchema.safeParse(request.params),
      (internalDevRoutes
        ? academyLegacyIntelligenceQuerySchema
        : academyIntelligenceQuerySchema
      ).safeParse(request.query),
    ];
    if (!parameters.success || !query.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_STUDENT_INTELLIGENCE_REQUEST',
          message: 'Student Intelligence requires an explicit valid profile.',
        },
      });
    }
    try {
      const actor = internalDevRoutes
        ? {
            membershipId: (query.data as unknown as { coachMembershipId: string })
              .coachMembershipId,
          }
        : (await authorizeAcademy(request, parameters.data.academyId, 'STUDENT_INTELLIGENCE_READ'))
            .actor;
      if (!actor.membershipId) {
        return reply.code(400).send({
          error: { code: 'INTERNAL_COACH_ID_REQUIRED', message: 'coachMembershipId is required.' },
        });
      }
      return reply.send(
        await academyIntelligence.getStudentIntelligence({
          academyId: parameters.data.academyId,
          studentProfileId: parameters.data.studentId,
          coachMembershipId: actor.membershipId,
          profile: academyProfile(query.data),
        }),
      );
    } catch (error) {
      if (error instanceof AcademyApplicationError || error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/academies/:academyId/me/intelligence', async (request, reply) => {
    const [parameters, query] = [
      academyParametersSchema.safeParse(request.params),
      academyIntelligenceQuerySchema.safeParse(request.query),
    ];
    if (!parameters.success || !query.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_STUDENT_SELF_INTELLIGENCE_REQUEST',
          message: 'Student Intelligence requires an explicit valid profile.',
        },
      });
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    const student = await academySecurity.requireStudentSelf({
      principal,
      academyId: parameters.data.academyId,
      requestId: request.id,
    });
    if (student.consentStatus === 'PENDING' || student.consentStatus === 'REVOKED') {
      throw new AcademySecurityApplicationError(
        'GUARDIAN_CONSENT_REQUIRED',
        'Academy-recorded guardian consent is required for Student self-service.',
      );
    }
    return academyIntelligence.getStudentIntelligence({
      academyId: parameters.data.academyId,
      studentProfileId: student.studentProfileId,
      coachMembershipId: student.membershipId,
      profile: academyProfile(query.data),
      authorizationAlreadyEnforced: true,
    });
  });

  app.post('/academies/:academyId/students/:studentId/skill-graph', async (request, reply) => {
    const parameters = academyStudentParametersSchema.safeParse(request.params);
    const body = academySkillGraphBodySchema.safeParse(request.body);
    if (!parameters.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ACADEMY_SKILL_GRAPH_REQUEST',
          message: 'The Academy Skill Graph request is invalid.',
        },
      });
    }
    await authorizeAcademy(request, parameters.data.academyId, 'STUDENT_INTELLIGENCE_READ');
    const student = await academyRepository.getStudentProfile(
      parameters.data.academyId,
      parameters.data.studentId,
    );
    if (!student) {
      return reply.code(404).send({
        error: {
          code: 'STUDENT_PROFILE_NOT_FOUND',
          message: 'The StudentProfile does not belong to the requested Academy.',
        },
      });
    }
    const graph = await playerSkillGraph.generate({ playerId: student.playerId, ...body.data });
    return reply.code(graph.run.deduplicated ? 200 : 201).send(graph);
  });

  app.get('/academies/:academyId/students/:studentId/assignments', async (request, reply) => {
    const [parameters, query] = [
      academyStudentParametersSchema.safeParse(request.params),
      (internalDevRoutes ? academyLegacyCoachQuerySchema : academyCoachQuerySchema).safeParse(
        request.query,
      ),
    ];
    if (!parameters.success || !query.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_STUDENT_ASSIGNMENTS_REQUEST', message: 'Invalid request.' },
      });
    }
    try {
      const actor = internalDevRoutes
        ? {
            membershipId: (query.data as unknown as { coachMembershipId: string })
              .coachMembershipId,
          }
        : (await authorizeAcademy(request, parameters.data.academyId, 'ASSIGNMENT_READ')).actor;
      if (!actor.membershipId) {
        return reply.code(400).send({
          error: { code: 'INTERNAL_COACH_ID_REQUIRED', message: 'coachMembershipId is required.' },
        });
      }
      return reply.send(
        await academyIntelligence.getStudentAssignments({
          academyId: parameters.data.academyId,
          studentProfileId: parameters.data.studentId,
          coachMembershipId: actor.membershipId,
        }),
      );
    } catch (error) {
      if (error instanceof AcademyApplicationError || error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/academies/:academyId/me/assignments', async (request, reply) => {
    const parameters = academyParametersSchema.safeParse(request.params);
    if (!parameters.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_ACADEMY_ID', message: 'The Academy ID must be a UUID.' },
      });
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    const student = await academySecurity.requireStudentSelf({
      principal,
      academyId: parameters.data.academyId,
      requestId: request.id,
    });
    if (student.consentStatus === 'PENDING' || student.consentStatus === 'REVOKED') {
      throw new AcademySecurityApplicationError(
        'GUARDIAN_CONSENT_REQUIRED',
        'Academy-recorded guardian consent is required for Student self-service.',
      );
    }
    return academyIntelligence.getStudentAssignments({
      academyId: parameters.data.academyId,
      studentProfileId: student.studentProfileId,
      coachMembershipId: student.membershipId,
      authorizationAlreadyEnforced: true,
    });
  });

  app.post('/academies/:academyId/assignments', async (request, reply) => {
    const [parameters, body] = [
      academyParametersSchema.safeParse(request.params),
      (internalDevRoutes
        ? legacyTrainingAssignmentBodySchema
        : trainingAssignmentBodySchema
      ).safeParse(request.body),
    ];
    if (!parameters.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_TRAINING_ASSIGNMENT_REQUEST',
          message: 'The TrainingAssignment request is invalid.',
          details: body.success ? undefined : z.flattenError(body.error).fieldErrors,
        },
      });
    }
    try {
      const authorized = internalDevRoutes
        ? {
            principal: null,
            actor: {
              membershipId: (body.data as unknown as { coachMembershipId: string })
                .coachMembershipId,
            },
          }
        : await authorizeAcademy(request, parameters.data.academyId, 'ASSIGNMENT_WRITE');
      if (!authorized.actor.membershipId) {
        return reply.code(400).send({
          error: { code: 'INTERNAL_COACH_ID_REQUIRED', message: 'coachMembershipId is required.' },
        });
      }
      const assignment = await academyIntelligence.createAssignment({
        academyId: parameters.data.academyId,
        ...body.data,
        coachMembershipId: authorized.actor.membershipId,
      });
      if (authorized.principal) {
        await academySecurity.recordAssignmentAudit({
          principal: authorized.principal,
          actor: authorized.actor,
          academyId: parameters.data.academyId,
          assignmentId: assignment.assignment.id,
          action: 'ASSIGNMENT_CREATED',
          requestId: request.id,
        });
      }
      return reply.code(201).send(assignment);
    } catch (error) {
      if (error instanceof AcademyApplicationError || error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get('/academies/:academyId/assignments/:assignmentId', async (request, reply) => {
    const [parameters, query] = [
      academyAssignmentParametersSchema.safeParse(request.params),
      (internalDevRoutes ? academyLegacyCoachQuerySchema : academyCoachQuerySchema).safeParse(
        request.query,
      ),
    ];
    if (!parameters.success || !query.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_TRAINING_ASSIGNMENT_REQUEST', message: 'Invalid request.' },
      });
    }
    try {
      const actor = internalDevRoutes
        ? {
            membershipId: (query.data as unknown as { coachMembershipId: string })
              .coachMembershipId,
          }
        : (await authorizeAcademy(request, parameters.data.academyId, 'ASSIGNMENT_READ')).actor;
      if (!actor.membershipId) {
        return reply.code(400).send({
          error: { code: 'INTERNAL_COACH_ID_REQUIRED', message: 'coachMembershipId is required.' },
        });
      }
      return reply.send(
        await academyIntelligence.getAssignment({
          academyId: parameters.data.academyId,
          assignmentId: parameters.data.assignmentId,
          coachMembershipId: actor.membershipId,
        }),
      );
    } catch (error) {
      if (error instanceof AcademyApplicationError || error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/academies/:academyId/assignments/:assignmentId/cancel', async (request, reply) => {
    const [parameters, body] = [
      academyAssignmentParametersSchema.safeParse(request.params),
      (internalDevRoutes ? academyLegacyCoachQuerySchema : academyCoachQuerySchema).safeParse(
        request.body,
      ),
    ];
    if (!parameters.success || !body.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_ASSIGNMENT_CANCELLATION', message: 'Invalid cancellation.' },
      });
    }
    try {
      const authorized = internalDevRoutes
        ? {
            principal: null,
            actor: {
              membershipId: (body.data as unknown as { coachMembershipId: string })
                .coachMembershipId,
            },
          }
        : await authorizeAcademy(request, parameters.data.academyId, 'ASSIGNMENT_WRITE');
      if (!authorized.actor.membershipId) {
        return reply.code(400).send({
          error: { code: 'INTERNAL_COACH_ID_REQUIRED', message: 'coachMembershipId is required.' },
        });
      }
      const assignment = await academyIntelligence.cancelAssignment({
        academyId: parameters.data.academyId,
        assignmentId: parameters.data.assignmentId,
        coachMembershipId: authorized.actor.membershipId,
      });
      if (authorized.principal) {
        await academySecurity.recordAssignmentAudit({
          principal: authorized.principal,
          actor: authorized.actor,
          academyId: parameters.data.academyId,
          assignmentId: parameters.data.assignmentId,
          action: 'ASSIGNMENT_CANCELLED',
          requestId: request.id,
        });
      }
      return reply.send(assignment);
    } catch (error) {
      if (error instanceof AcademyApplicationError || error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/intelligence/student-progress', async (request, reply) => {
    const validated = (
      internalDevRoutes ? legacyStudentProgressBodySchema : studentProgressBodySchema
    ).safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_STUDENT_PROGRESS_REQUEST',
          message: 'The progress comparison request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    try {
      const actor = internalDevRoutes
        ? {
            membershipId: (validated.data as unknown as { coachMembershipId: string })
              .coachMembershipId,
          }
        : (await authorizeAcademy(request, validated.data.academyId, 'STUDENT_INTELLIGENCE_READ'))
            .actor;
      if (!actor.membershipId) {
        return reply.code(400).send({
          error: { code: 'INTERNAL_COACH_ID_REQUIRED', message: 'coachMembershipId is required.' },
        });
      }
      return reply.send(
        await academyIntelligence.compareProgress({
          ...validated.data,
          coachMembershipId: actor.membershipId,
        }),
      );
    } catch (error) {
      if (error instanceof AcademyApplicationError || error instanceof AcademyRepositoryError) {
        return reply
          .code(academyErrorStatus(error))
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/preparation/opponent', async (request, reply) => {
    const validated = prepareOpponentBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_PREPARATION_REQUEST',
          message: 'The opponent preparation request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    try {
      const dossier = await opponentPreparation.prepareOpponent(validated.data);
      request.log.info(
        {
          opponentPlayerId: dossier.opponent.playerId,
          opponentColor: dossier.opponentColor,
          usableGames: dossier.coverage.gamesWithMoves,
        },
        'opponent preparation dossier generated',
      );
      return reply.send(dossier);
    } catch (error) {
      if (error instanceof OpponentPreparationError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/preparation/opponent/position', async (request, reply) => {
    const validated = prepareOpponentPositionBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_PREPARATION_POSITION_REQUEST',
          message: 'The preparation position request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    try {
      return reply.send(await opponentPreparation.preparePosition(validated.data));
    } catch (error) {
      if (error instanceof PositionFenError) {
        return reply.code(422).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof OpponentPreparationError) {
        const status = error.code === 'POSITION_ID_MISMATCH' ? 400 : 404;
        return reply.code(status).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/positions/explore', async (request, reply) => {
    const validated = explorePositionBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_POSITION_QUERY',
          message: 'The position corpus query is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }

    try {
      const result = await positionExplorer.explore(validated.data);
      request.log.info(
        {
          positionId: result.position.id,
          focalPlayerId: result.focalPlayer?.playerId ?? null,
          matchingGames: result.sample.games,
          observedMoveCount: result.nextMoves.length,
        },
        'position corpus explored',
      );
      return reply.send(result);
    } catch (error) {
      if (error instanceof PositionFenError) {
        return reply.code(422).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof PositionExplorerError) {
        const notFound = ['IDENTITY_NOT_FOUND', 'PLAYER_NOT_FOUND', 'POSITION_NOT_FOUND'].includes(
          error.code,
        );
        return reply
          .code(notFound ? 404 : 400)
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.post('/games/import-pgn', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = importBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'The import request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }

    if (validated.data.sourceType !== 'USER_UPLOAD') {
      return reply.code(400).send({
        error: {
          code: 'SOURCE_NOT_ENABLED',
          message: 'This endpoint accepts direct USER_UPLOAD PGNs only.',
        },
      });
    }

    const importJobId = await repository.createImportJob({
      sourceType: validated.data.sourceType,
      externalId: validated.data.externalId,
      rawPgnSha256: sha256(validated.data.pgn),
    });

    let parsed;
    try {
      parsed = parsePgn(validated.data.pgn);
    } catch (error) {
      if (error instanceof PgnParseError) {
        await repository.failImportJob(importJobId, error.code, error.message);
        return reply.code(422).send({
          error: { code: error.code, message: error.message, importJobId },
        });
      }
      throw error;
    }

    try {
      const result = await repository.persistImportedGame({
        parsed,
        sourceType: validated.data.sourceType,
        externalId: validated.data.externalId,
        importJobId,
      });
      return reply.code(result.status === 'created' ? 201 : 200).send(result);
    } catch (error) {
      request.log.error({ err: error, importJobId }, 'PGN persistence failed');
      await repository.failImportJob(
        importJobId,
        'PERSISTENCE_FAILED',
        error instanceof Error ? error.message : 'Unknown persistence failure',
      );
      return reply.code(500).send({
        error: {
          code: 'PERSISTENCE_FAILED',
          message: 'The PGN could not be persisted. No partial game data was kept.',
          importJobId,
        },
      });
    }
  });

  app.post('/games/import-metadata', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = metadataBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_METADATA_REQUEST',
          message: 'The metadata import request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    if (validated.data.sourceType !== 'USER_UPLOAD') {
      return reply.code(400).send({
        error: {
          code: 'SOURCE_NOT_ENABLED',
          message: 'This endpoint accepts direct USER_UPLOAD metadata only.',
        },
      });
    }

    try {
      const result = await metadataRepository.createMetadataGame(validated.data, request.body);
      request.log.info(
        { gameId: result.gameId, sourceType: validated.data.sourceType },
        'metadata game created',
      );
      return reply.code(201).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'metadata game creation failed');
      return reply.code(500).send({
        error: {
          code: 'METADATA_PERSISTENCE_FAILED',
          message: 'The metadata game could not be persisted transactionally.',
        },
      });
    }
  });

  app.post('/games/reconcile-pgn', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const validated = reconcilePgnBodySchema.safeParse(request.body);
    if (!validated.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_RECONCILIATION_REQUEST',
          message: 'The reconciliation request is invalid.',
          details: z.flattenError(validated.error).fieldErrors,
        },
      });
    }
    if (validated.data.sourceType !== 'USER_UPLOAD') {
      return reply.code(400).send({
        error: {
          code: 'SOURCE_NOT_ENABLED',
          message: 'Only direct USER_UPLOAD PGNs are enabled.',
        },
      });
    }

    try {
      const report = await reconciliation.preview({
        pgn: validated.data.pgn,
        sourceType: validated.data.sourceType,
        externalGameId: validated.data.externalGameId,
        externalTournamentId: validated.data.externalTournamentId,
      });
      request.log.info(
        {
          candidateCount: report.candidates.length,
          conflictCount: report.candidates.filter(
            (candidate) => candidate.classification === 'CONFLICT',
          ).length,
        },
        'reconciliation performed',
      );
      return reply.send(report);
    } catch (error) {
      if (error instanceof PgnParseError) {
        return reply.code(422).send({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  });

  app.post('/games/:id/attach-pgn', async (request, reply) => {
    if (!internalDevRoutes) {
      return reply.code(404).send({
        error: { code: 'INTERNAL_DEV_ROUTE_DISABLED', message: 'This route is not public.' },
      });
    }
    const parameters = gameParametersSchema.safeParse(request.params);
    const body = attachPgnBodySchema.safeParse(request.body);
    if (!parameters.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ATTACHMENT_REQUEST',
          message: 'The reviewed attachment request is invalid.',
          details: body.success ? undefined : z.flattenError(body.error).fieldErrors,
        },
      });
    }
    if (body.data.sourceType !== 'USER_UPLOAD') {
      return reply.code(400).send({
        error: { code: 'SOURCE_NOT_ENABLED', message: 'Only USER_UPLOAD PGNs are enabled.' },
      });
    }

    try {
      const result = await reconciliation.attach({
        gameId: parameters.data.id,
        pgn: body.data.pgn,
        sourceType: body.data.sourceType,
        externalGameId: body.data.externalGameId,
        externalTournamentId: body.data.externalTournamentId,
        expectedClassification: body.data.expectedReconciliationClassification,
      });
      request.log.info({ gameId: result.gameId, status: result.status }, 'PGN attached');
      return reply.code(result.status === 'attached' ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof PgnParseError) {
        return reply.code(422).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof ReviewedAttachmentError) {
        request.log.warn(
          { gameId: parameters.data.id, code: error.code },
          'PGN attachment rejected',
        );
        return reply.code(409).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof PgnAttachmentError) {
        request.log.warn(
          { gameId: parameters.data.id, code: error.code },
          'PGN attachment rejected',
        );
        return reply
          .code(error.code === 'GAME_NOT_FOUND' ? 404 : 409)
          .send({ error: { code: error.code, message: error.message } });
      }
      request.log.error({ err: error, gameId: parameters.data.id }, 'PGN attachment failed');
      return reply.code(500).send({
        error: {
          code: 'ATTACHMENT_PERSISTENCE_FAILED',
          message: 'The PGN could not be attached. No partial game data was kept.',
        },
      });
    }
  });

  app.get('/games/:id', async (request, reply) => {
    const validated = gameParametersSchema.safeParse(request.params);
    if (!validated.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_GAME_ID', message: 'The game ID must be a UUID.' },
      });
    }

    const game = await repository.getGame(validated.data.id);
    if (!game) {
      return reply.code(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'No game was found for that ID.' },
      });
    }
    return reply.send(game);
  });

  return app;
}
