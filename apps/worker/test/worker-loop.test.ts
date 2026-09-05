import { describe, expect, it, vi } from 'vitest';

import { runWorkerLoop } from '../src/worker-loop';

describe('production Worker loop', () => {
  it('retries dependency failures without terminating the process', async () => {
    const recoverStaleWork = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(undefined);
    const runNext = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(false);
    const errors: unknown[] = [];
    const delays: number[] = [];
    let stopping = false;

    await runWorkerLoop(
      { recoverStaleWork, runNext },
      {
        once: false,
        pollIntervalMs: 50,
        shouldStop: () => stopping,
        onDependencyError: (error) => errors.push(error),
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
          if (delays.length === 3) stopping = true;
        },
      },
    );

    expect(recoverStaleWork).toHaveBeenCalledTimes(2);
    expect(runNext).toHaveBeenCalledTimes(2);
    expect(errors).toHaveLength(2);
    expect(delays).toEqual([1_000, 1_000, 50]);
  });

  it('surfaces dependency failures in one-shot mode', async () => {
    const error = new Error('database unavailable');
    await expect(
      runWorkerLoop(
        {
          recoverStaleWork: vi.fn().mockRejectedValue(error),
          runNext: vi.fn(),
        },
        { once: true, pollIntervalMs: 50, shouldStop: () => false },
      ),
    ).rejects.toBe(error);
  });
});
