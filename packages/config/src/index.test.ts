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
      GROUNDED_AI_PROVIDER: 'DISABLED',
      WEB_ORIGINS: ['http://localhost:3000'],
    });
  });

  it('requires a credential only when the real grounded AI provider is enabled', () => {
    expect(() =>
      readApiEnvironment({
        DATABASE_URL: 'postgresql://example',
        GROUNDED_AI_PROVIDER: 'OPENAI',
      } as NodeJS.ProcessEnv),
    ).toThrow(/GROUNDED_AI_API_KEY/u);
    expect(
      readApiEnvironment({
        DATABASE_URL: 'postgresql://example',
        GROUNDED_AI_PROVIDER: 'OPENAI',
        GROUNDED_AI_API_KEY: 'test-only-key',
      } as NodeJS.ProcessEnv),
    ).toMatchObject({
      GROUNDED_AI_PROVIDER: 'OPENAI',
      GROUNDED_AI_MODEL: 'gpt-5.6-terra',
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
