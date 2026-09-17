import { describe, expect, it } from 'vitest';

import { resolveNextOutputMode } from './next-output-mode';

describe('resolveNextOutputMode', () => {
  it('disables standalone output whenever the Vercel system indicator is set', () => {
    expect(resolveNextOutputMode({ VERCEL: '1' })).toBeUndefined();
    expect(resolveNextOutputMode({ VERCEL: '' })).toBeUndefined();
  });

  it('preserves standalone output for container and self-hosted builds', () => {
    expect(resolveNextOutputMode({})).toBe('standalone');
  });
});
