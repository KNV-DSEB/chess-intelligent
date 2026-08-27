import { describe, it } from 'vitest';

const browserDescribe = process.env.TASK008_BROWSER_QA === '1' ? describe : describe.skip;

browserDescribe('Task 008 manual browser fixture', () => {
  it(
    'serves the deterministic classified game until the QA process is stopped',
    async () => {
      await import('./manual-task008-server');
      await new Promise<never>(() => undefined);
    },
    24 * 60 * 60 * 1_000,
  );
});
