import { rm } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'esbuild';

const workspaceRoot = process.cwd();
const workspaceEntrypoints = new Map([
  ['@chess-intelligent/chess-core', 'packages/chess-core/src/index.ts'],
  ['@chess-intelligent/config', 'packages/config/src/index.ts'],
  ['@chess-intelligent/db', 'packages/db/src/index.ts'],
  ['@chess-intelligent/db/testing', 'packages/db/src/testing.ts'],
  ['@chess-intelligent/domain', 'packages/domain/src/index.ts'],
]);

const workspaceResolver = {
  name: 'workspace-source-resolver',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^@chess-intelligent\// }, (args) => {
      const entrypoint = workspaceEntrypoints.get(args.path);
      if (!entrypoint) throw new Error(`No production bundle entrypoint for ${args.path}.`);
      return { path: path.join(workspaceRoot, entrypoint) };
    });
  },
};

const targets = [
  {
    outdir: 'apps/api/dist',
    entryPoints: ['apps/api/src/server.ts', 'apps/api/src/academy-bootstrap-owner-cli.ts'],
  },
  {
    outdir: 'apps/worker/dist',
    entryPoints: ['apps/worker/src/worker.ts', 'apps/worker/src/health-cli.ts'],
  },
  {
    outdir: 'packages/db/dist',
    entryPoints: ['packages/db/src/migrate-cli.ts', 'packages/db/src/ontology-sync-cli.ts'],
  },
  {
    outdir: 'scripts/acceptance/dist',
    entryPoints: [
      'scripts/acceptance/task015-seed-learning.ts',
      'scripts/acceptance/task015-seed-v2-training.ts',
      'scripts/acceptance/task015-queue-stockfish.ts',
    ],
  },
];

for (const target of targets) {
  await rm(path.join(workspaceRoot, target.outdir), { recursive: true, force: true });
  await build({
    absWorkingDir: workspaceRoot,
    bundle: true,
    entryPoints: target.entryPoints,
    outdir: target.outdir,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    plugins: [workspaceResolver],
    sourcemap: 'linked',
    legalComments: 'external',
    logLevel: 'info',
  });
}
