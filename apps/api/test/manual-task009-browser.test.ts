import { describe, it } from 'vitest';

const browserDescribe = process.env.TASK009_BROWSER_QA === '1' ? describe : describe.skip;

browserDescribe('Task 009 manual browser fixture', () => {
  it(
    'serves the deterministic Skill Graph fixture until the QA process is stopped',
    async () => {
      await import('./manual-task009-server');
      await new Promise<never>(() => undefined);
    },
    24 * 60 * 60 * 1_000,
  );
});
