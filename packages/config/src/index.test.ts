import { describe, expect, it } from 'vitest';

import { readApiEnvironment } from './index';

describe('Task 012 API production security configuration', () => {
  it('defaults secure and internal route flags off in development', () => {
    expect(
      readApiEnvironment({ DATABASE_URL: 'postgresql://example' } as NodeJS.ProcessEnv),
    ).toMatchObject({
      APP_ENV: 'development',
      AUTH_COOKIE_SECURE: false,
      INTERNAL_DEV_ROUTES: false,
      TRUST_PROXY: false,
      AUTO_MIGRATE: true,
      SMTP_ENABLED: false,
      WEB_ORIGINS: ['http://localhost:3000'],
    });
  });

  it('rejects production without Secure cookies or with internal routes', () => {
    expect(() =>
      readApiEnvironment({
        DATABASE_URL: 'postgresql://example',
        APP_ENV: 'production',
        AUTH_COOKIE_SECURE: 'false',
      } as NodeJS.ProcessEnv),
    ).toThrow(/Secure/u);
    expect(() =>
      readApiEnvironment({
        DATABASE_URL: 'postgresql://example',
        APP_ENV: 'production',
        AUTH_COOKIE_SECURE: 'true',
        INTERNAL_DEV_ROUTES: 'true',
      } as NodeJS.ProcessEnv),
    ).toThrow(/development routes/u);
  });

  it('accepts the complete explicit production boundary', () => {
    expect(
      readApiEnvironment({
        DATABASE_URL: 'postgresql://example',
        APP_ENV: 'production',
        AUTH_COOKIE_SECURE: 'true',
        INTERNAL_DEV_ROUTES: 'false',
        AUTO_MIGRATE: 'false',
        ALLOWED_ORIGINS: 'https://academy.example',
        PUBLIC_WEB_BASE_URL: 'https://academy.example',
        SMTP_ENABLED: 'true',
        SMTP_HOST: 'smtp.example',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USERNAME: 'smtp-user',
        SMTP_PASSWORD: 'not-a-real-secret',
        EMAIL_FROM: 'academy@example.test',
      } as NodeJS.ProcessEnv),
    ).toMatchObject({
      APP_ENV: 'production',
      AUTH_COOKIE_SECURE: true,
      AUTO_MIGRATE: false,
      SMTP_ENABLED: true,
      WEB_ORIGINS: ['https://academy.example'],
    });
  });
});
