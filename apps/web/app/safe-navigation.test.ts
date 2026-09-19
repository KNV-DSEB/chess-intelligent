import { describe, expect, it } from 'vitest';

import { safeReturnTo, withReturnTo } from './safe-navigation';

describe('public entry safe navigation', () => {
  it('accepts only same-origin path-shaped return locations', () => {
    expect(safeReturnTo('/academy?academyId=abc')).toBe('/academy?academyId=abc');
    expect(safeReturnTo('https://foreign.example')).toBe('/my');
    expect(safeReturnTo('//foreign.example')).toBe('/my');
    expect(safeReturnTo('/\\evil.example')).toBe('/my');
    expect(safeReturnTo('/%5Cevil.example')).toBe('/my');
    expect(safeReturnTo('/%255Cevil.example')).toBe('/my');
    expect(safeReturnTo('/%0Aacademy')).toBe('/my');
    expect(safeReturnTo('/login?returnTo=%2Flogin')).toBe('/my');
    expect(withReturnTo('/signup', '/onboarding')).toBe('/signup?returnTo=%2Fonboarding');
  });
});
