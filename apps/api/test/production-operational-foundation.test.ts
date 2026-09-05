import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthRepository, runMigrations, type Database } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';

import { buildApp, redactSensitiveRequestUrl } from '../src/app';
import type {
  AcademyInvitationEmail,
  EmailDeliveryProvider,
  PasswordResetEmail,
} from '../src/email-delivery';
import { Argon2idPasswordHasher } from '../src/password-hasher';

const NOW = new Date('2026-08-29T03:00:00.000Z');
const ORIGIN = 'https://academy.example';

class RecordingEmailProvider implements EmailDeliveryProvider {
  readonly configured = true;
  readonly invitations: AcademyInvitationEmail[] = [];
  readonly resets: PasswordResetEmail[] = [];
  async verify(): Promise<void> {}
  async sendAcademyInvitation(message: AcademyInvitationEmail): Promise<void> {
    this.invitations.push(message);
  }
  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    this.resets.push(message);
  }
}

class FailingEmailProvider implements EmailDeliveryProvider {
  readonly configured = true;
  async verify(): Promise<void> {
    throw new Error('provider credential detail');
  }
  async sendAcademyInvitation(): Promise<void> {
    throw new Error('provider credential detail');
  }
  async sendPasswordReset(): Promise<void> {
    throw new Error('provider credential detail');
  }
}

function cookie(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== 'string') throw new Error('Expected session cookie.');
  return value.split(';', 1)[0]!;
}

describe('Task 013 production operational foundation', () => {
  let database: Database;
  let app: FastifyInstance;
  let email: RecordingEmailProvider;
  const passwords = new Argon2idPasswordHasher();

  beforeEach(async () => {
    database = await PGliteDatabase.create();
    await runMigrations(database);
    email = new RecordingEmailProvider();
    app = await buildApp({
      database,
      webOrigins: [ORIGIN],
      secureCookies: true,
      emailDelivery: email,
      now: () => NOW,
    });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  async function owner() {
    const created = await new AuthRepository(database).bootstrapOwner({
      academyName: 'Production Gate Academy',
      email: 'owner@task013.test',
      normalizedEmail: 'owner@task013.test',
      displayName: 'Task 013 Owner',
      passwordHash: await passwords.hashPassword('original owner password'),
      now: NOW,
    });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'owner@task013.test', password: 'original owner password' },
    });
    expect(login.statusCode, login.body).toBe(200);
    return { ...created, cookie: cookie(login) };
  }

  it('delivers invitations without returning or persisting the raw token', async () => {
    const actor = await owner();
    const response = await app.inject({
      method: 'POST',
      url: `/academies/${actor.academyId}/invitations`,
      headers: { cookie: actor.cookie, origin: ORIGIN },
      payload: { email: 'coach@task013.test', role: 'COACH' },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).not.toHaveProperty('rawInvitationToken');
    expect(response.json()).toMatchObject({ deliveryStatus: 'DELIVERED' });
    expect(email.invitations).toHaveLength(1);
    const rawToken = email.invitations[0]!.rawToken;
    const persisted = await database.query<{
      token_hash: string;
      delivery_status: string;
    }>('SELECT token_hash, delivery_status FROM academy_invitations');
    expect(persisted.rows[0]).toMatchObject({ delivery_status: 'DELIVERED' });
    expect(persisted.rows[0]!.token_hash).not.toBe(rawToken);
    const actions = await database.query<{ action: string }>(
      `SELECT action FROM security_audit_events
       WHERE action LIKE 'INVITATION_DELIVERY_%' ORDER BY occurred_at, id`,
    );
    expect(actions.rows.map((row) => row.action).sort()).toEqual([
      'INVITATION_DELIVERY_REQUESTED',
      'INVITATION_DELIVERY_SUCCEEDED',
    ]);
  });

  it('redacts bearer invitation tokens from structured request URLs', () => {
    expect(redactSensitiveRequestUrl('/auth/invitations/raw-secret/accept')).toBe(
      '/auth/invitations/[REDACTED]/accept',
    );
  });

  it('completes one single-use reset, revokes old sessions, and rejects concurrent reuse', async () => {
    const actor = await owner();
    const requested = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      headers: { origin: ORIGIN },
      payload: { email: 'OWNER@task013.test' },
    });
    expect(requested.statusCode).toBe(202);
    expect(requested.json()).toMatchObject({ status: 'PASSWORD_RESET_REQUEST_ACCEPTED' });
    expect(email.resets).toHaveLength(1);
    const rawToken = email.resets[0]!.rawToken;
    const stored = await database.query<{ token_hash: string }>(
      'SELECT token_hash FROM password_reset_tokens',
    );
    expect(stored.rows[0]!.token_hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(stored.rows[0]!.token_hash).not.toBe(rawToken);

    const completion = () =>
      app.inject({
        method: 'POST',
        url: '/auth/password-reset/complete',
        headers: { origin: ORIGIN },
        payload: { token: rawToken, newPassword: 'replacement owner password' },
      });
    const results = await Promise.all([completion(), completion()]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400]);
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: actor.cookie } }))
        .statusCode,
    ).toBe(401);
    expect((await completion()).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          headers: { origin: ORIGIN },
          payload: { email: 'owner@task013.test', password: 'original owner password' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          headers: { origin: ORIGIN },
          payload: { email: 'owner@task013.test', password: 'replacement owner password' },
        })
      ).statusCode,
    ).toBe(200);
    const audit = await database.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM security_audit_events WHERE action LIKE 'PASSWORD_RESET_%'`,
    );
    expect(JSON.stringify(audit.rows)).not.toContain(rawToken);
  });

  it('returns the same reset response for unknown accounts and silently enforces request rate limits', async () => {
    await owner();
    const request = (emailAddress: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/password-reset/request',
        headers: { origin: ORIGIN },
        payload: { email: emailAddress },
      });
    const unknown = await request('missing@task013.test');
    const known = await request('owner@task013.test');
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.json()).toEqual(known.json());
    await request('owner@task013.test');
    await request('owner@task013.test');
    await request('owner@task013.test');
    expect(email.resets).toHaveLength(3);
  });

  it('records SMTP failures without leaking provider details or reset account existence', async () => {
    await app.close();
    app = await buildApp({
      database,
      webOrigins: [ORIGIN],
      secureCookies: true,
      emailDelivery: new FailingEmailProvider(),
      now: () => NOW,
    });
    const actor = await owner();
    const invitation = await app.inject({
      method: 'POST',
      url: `/academies/${actor.academyId}/invitations`,
      headers: { cookie: actor.cookie, origin: ORIGIN },
      payload: { email: 'failed-delivery@task013.test', role: 'COACH' },
    });
    expect(invitation.statusCode).toBe(503);
    expect(invitation.body).not.toContain('provider credential detail');
    expect(
      (
        await database.query<{ delivery_status: string }>(
          `SELECT delivery_status FROM academy_invitations
           WHERE normalized_email = 'failed-delivery@task013.test'`,
        )
      ).rows[0]?.delivery_status,
    ).toBe('FAILED');

    const known = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      headers: { origin: ORIGIN },
      payload: { email: 'owner@task013.test' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      headers: { origin: ORIGIN },
      payload: { email: 'unknown@task013.test' },
    });
    expect(known.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());
    expect(known.body).not.toContain('provider credential detail');
    expect(
      (
        await database.query<{ delivery_status: string }>(
          `SELECT delivery_status FROM password_reset_requests WHERE user_id = $1`,
          [actor.userId],
        )
      ).rows[0]?.delivery_status,
    ).toBe('FAILED');
  });

  it('separates liveness/readiness and emits correlation and browser security headers', async () => {
    const live = await app.inject({ method: 'GET', url: '/livez' });
    expect(live.statusCode).toBe(200);
    expect(live.headers['x-request-id']).toBeTruthy();
    expect(live.headers['x-content-type-options']).toBe('nosniff');
    expect(live.headers['referrer-policy']).toBe('no-referrer');
    expect(live.headers['x-frame-options']).toBe('DENY');
    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ database: 'ok', schema: 'current' });

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(preflight.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(preflight.headers['access-control-allow-origin']).not.toBe('*');

    const actor = await owner();
    const denied = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: actor.cookie, origin: 'https://foreign.example' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: { code: 'CSRF_ORIGIN_DENIED' } });
  });
});

describe('Task 013 dependency failure behavior', () => {
  it('fails readiness and authentication closed without exposing an internal error', async () => {
    const unavailable: Database = {
      async query() {
        throw new Error('database credential secret should not reach the client');
      },
      async execute() {
        throw new Error('database unavailable');
      },
      async transaction() {
        throw new Error('database unavailable');
      },
      async close() {},
    };
    const app = await buildApp({ database: unavailable });
    try {
      const ready = await app.inject({ method: 'GET', url: '/readyz' });
      expect(ready.statusCode).toBe(503);
      const auth = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie: 'chess_session=opaque-value' },
      });
      expect(auth.statusCode).toBe(500);
      expect(auth.body).not.toContain('credential secret');
      expect(auth.json()).toMatchObject({ error: { code: 'INTERNAL_SERVER_ERROR' } });
    } finally {
      await app.close();
    }
  });
});

describe('Task 014 production build boundary', () => {
  it('excludes disposable gate artifacts from the Docker build context', async () => {
    const dockerIgnore = await readFile('.dockerignore', 'utf8');
    expect(dockerIgnore.split(/\r?\n/u)).toContain('.tmp-task*');
  });
});
