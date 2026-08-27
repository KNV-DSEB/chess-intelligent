import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import { parsePgn, PgnParseError, PositionFenError, sha256 } from '@chess-intelligent/chess-core';
import {
  AnalysisRepository,
  AnalysisRepositoryError,
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
  type Database,
} from '@chess-intelligent/db';
import {
  ANALYSIS_PROFILES,
  COLORS,
  ConceptEvidencePolicyError,
  DATA_SOURCE_TYPES,
  GAME_CONTEXTS,
  IDENTITY_PROVIDERS,
  TIME_CATEGORIES,
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

export interface AppOptions {
  database: Database;
  webOrigin?: string;
  logger?: boolean;
  manageDatabaseLifecycle?: boolean;
  now?: () => Date;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const repository = new GameRepository(options.database);
  const analysisRepository = new AnalysisRepository(options.database);
  const metadataRepository = new MetadataGameRepository(options.database);
  const reconciliation = new GameReconciliationApplicationService(metadataRepository);
  const positionCorpusRepository = new PositionCorpusRepository(options.database);
  const positionExplorer = new PositionExplorerApplicationService(positionCorpusRepository);
  const opponentPreparation = new OpponentPreparationApplicationService(
    new OpponentPreparationRepository(options.database),
    positionCorpusRepository,
    options.now ?? (() => new Date()),
  );
  const playerDossier = new PlayerDossierApplicationService(
    new PlayerIntelligenceRepository(options.database),
    positionCorpusRepository,
    opponentPreparation,
    options.now ?? (() => new Date()),
  );
  const ontologyRepository = new OntologyRepository(options.database);
  const ontology = new OntologyApplicationService(ontologyRepository);
  const conceptClassification = new ConceptClassificationApplicationService(
    new ClassificationRepository(options.database),
    ontologyRepository,
  );
  const playerSkillGraph = new PlayerSkillGraphApplicationService(
    new PlayerSkillGraphRepository(options.database),
    positionCorpusRepository,
    ontologyRepository,
  );

  await app.register(cors, { origin: options.webOrigin ?? 'http://localhost:3000' });

  if (options.manageDatabaseLifecycle ?? false) {
    app.addHook('onClose', async () => options.database.close());
  }

  app.get('/health', async () => ({ status: 'ok' }));

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
