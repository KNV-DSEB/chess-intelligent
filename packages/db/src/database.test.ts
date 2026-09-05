import { describe, expect, it, vi } from 'vitest';

import { PgDatabase } from './database';

describe('PgDatabase', () => {
  it('handles idle pool errors instead of allowing EventEmitter to terminate the process', async () => {
    const onPoolError = vi.fn();
    const database = new PgDatabase('postgresql://127.0.0.1:1/unreachable', { onPoolError });
    const pool = (database as unknown as { pool: { emit(event: string, error: Error): boolean } })
      .pool;
    const error = Object.assign(new Error('database stopped'), { code: '57P01' });

    expect(() => pool.emit('error', error)).not.toThrow();
    expect(onPoolError).toHaveBeenCalledOnce();
    expect(onPoolError).toHaveBeenCalledWith(error);

    await database.close();
  });
});
