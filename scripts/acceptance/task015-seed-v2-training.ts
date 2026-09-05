import { PgDatabase, TrainingRepository } from '@chess-intelligent/db';

import { buildApp } from '../../apps/api/src/app';

const connectionString = process.env.DATABASE_URL;
const playerId = process.env.TASK015_PLAYER_ID;
if (!connectionString) throw new Error('DATABASE_URL is required.');
if (!playerId) throw new Error('TASK015_PLAYER_ID is required.');

const database = new PgDatabase(connectionString, { applicationName: 'task015-v2-training-seed' });
const app = await buildApp({ database, internalDevRoutes: true });

try {
  const graphResponse = await app.inject({
    method: 'POST',
    url: '/intelligence/player-skill-graph',
    payload: {
      playerId,
      ontologyVersion: '1.0.0',
      asOfDate: '2026-09-03',
      scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
    },
  });
  if (![200, 201].includes(graphResponse.statusCode)) {
    throw new Error(`V2 Skill Graph failed: ${graphResponse.body}`);
  }
  const skillGraphRunId = graphResponse.json<{ run: { id: string } }>().run.id;

  const planResponse = await app.inject({
    method: 'POST',
    url: '/training/plans',
    payload: { playerId, skillGraphRunId, maxItems: 10 },
  });
  if (![200, 201].includes(planResponse.statusCode)) {
    throw new Error(`V2 TrainingPlan failed: ${planResponse.body}`);
  }
  const plan = planResponse.json<{
    run: { id: string };
    trainingItems: Array<{ id: string; trainingMode: string }>;
  }>();
  if (plan.trainingItems.length === 0) throw new Error('V2 plan has no TrainingItems.');

  const training = new TrainingRepository(database);
  const items = await Promise.all(
    plan.trainingItems.map(async (item) => {
      const record = await training.getItem(item.id);
      if (!record) throw new Error(`Training item ${item.id} was not persisted.`);
      return {
        id: item.id,
        trainingMode: item.trainingMode,
        acceptedMoveUci: record.acceptedMoveUcis[0],
      };
    }),
  );
  process.stdout.write(
    `${JSON.stringify({ playerId, skillGraphRunId, trainingPlanRunId: plan.run.id, items })}\n`,
  );
} finally {
  await app.close();
  await database.close();
}
