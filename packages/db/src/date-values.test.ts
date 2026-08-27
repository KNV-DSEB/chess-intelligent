import { describe, expect, it } from 'vitest';

import { dateOnly } from './date-values';

describe('PostgreSQL date-only serialization', () => {
  it('preserves local calendar components instead of applying a UTC date shift', () => {
    expect(dateOnly(new Date(2024, 0, 10, 0, 0, 0))).toBe('2024-01-10');
    expect(dateOnly('2025-02-11')).toBe('2025-02-11');
    expect(dateOnly(null)).toBeNull();
  });
});
