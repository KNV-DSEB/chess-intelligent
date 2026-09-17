import { describe, expect, it } from 'vitest';

import { resolveApiListenOptions } from '../src/api-listener';

describe('resolveApiListenOptions', () => {
  it('binds all interfaces and preserves the configured fallback port', () => {
    expect(resolveApiListenOptions(4000, {})).toEqual({ host: '0.0.0.0', port: 4000 });
  });

  it('prefers the platform PORT environment variable', () => {
    expect(resolveApiListenOptions(4000, { PORT: '51234' })).toEqual({
      host: '0.0.0.0',
      port: 51234,
    });
  });

  it.each(['not-a-port', '0', '65536'])('rejects invalid PORT value %s', (port) => {
    expect(() => resolveApiListenOptions(4000, { PORT: port })).toThrow(
      'PORT must be an integer between 1 and 65535.',
    );
  });
});
