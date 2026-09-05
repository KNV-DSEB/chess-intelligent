export interface WorkerLoopTarget {
  recoverStaleWork(): Promise<unknown>;
  runNext(): Promise<unknown>;
}

export interface WorkerLoopOptions {
  once: boolean;
  pollIntervalMs: number;
  shouldStop: () => boolean;
  onDependencyError?: (error: unknown) => void;
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runWorkerLoop(
  worker: WorkerLoopTarget,
  options: WorkerLoopOptions,
): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  const dependencyRetryMs = Math.max(options.pollIntervalMs, 1_000);
  let recoveredStaleWork = false;

  do {
    try {
      if (!recoveredStaleWork) {
        await worker.recoverStaleWork();
        recoveredStaleWork = true;
      }
      const claimed = await worker.runNext();
      if (options.once) return;
      if (!claimed) await sleep(options.pollIntervalMs);
    } catch (error) {
      if (options.once) throw error;
      options.onDependencyError?.(error);
      await sleep(dependencyRetryMs);
    }
  } while (!options.shouldStop());
}
