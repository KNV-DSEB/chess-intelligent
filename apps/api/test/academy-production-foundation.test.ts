import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthRepository, runMigrations, type Database } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';

import { buildApp } from '../src/app';
import { Argon2idPasswordHasher } from '../src/password-hasher';
import type {
  AcademyInvitationEmail,
  EmailDeliveryProvider,
  PasswordResetEmail,
} from '../src/email-delivery';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const ORIGIN = 'http://localhost:3000';

class RecordingEmailDeliveryProvider implements EmailDeliveryProvider {
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

  invitationToken(email: string): string {
    const message = [...this.invitations].reverse().find((entry) => entry.to === email);
    if (!message) throw new Error(`No invitation delivery for ${email}.`);
    return message.rawToken;
  }
}

function sessionCookie(response: {
  headers: Record<string, string | string[] | number | undefined>;
}): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== 'string') throw new Error('Expected a session cookie.');
  return value.split(';', 1)[0]!;
}

describe('Task 012 Academy Production Foundation', () => {
  let database: Database;
  let app: FastifyInstance;
  const passwords = new Argon2idPasswordHasher();
  let emailDelivery: RecordingEmailDeliveryProvider;

  beforeEach(async () => {
    database = await PGliteDatabase.create();
    await runMigrations(database);
    emailDelivery = new RecordingEmailDeliveryProvider();
    app = await buildApp({
      database,
      webOrigin: ORIGIN,
      now: () => NOW,
      emailDelivery,
    });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  async function bootstrap(input: {
    academyName: string;
    email: string;
    displayName: string;
    password: string;
  }) {
    return new AuthRepository(database).bootstrapOwner({
      academyName: input.academyName,
      email: input.email,
      normalizedEmail: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash: await passwords.hashPassword(input.password),
      now: NOW,
    });
  }

  async function login(
    email: string,
    password: string,
  ): Promise<{
    cookie: string;
    body: Record<string, unknown>;
  }> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: ORIGIN },
      payload: { email, password },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).not.toHaveProperty('rawSessionToken');
    return { cookie: sessionCookie(response), body: response.json() as Record<string, unknown> };
  }

  async function createMembership(
    academyId: string,
    cookie: string,
    role: 'OWNER' | 'ADMIN' | 'COACH' | 'STUDENT',
    displayName: string,
  ) {
    const response = await app.inject({
      method: 'POST',
      url: `/academies/${academyId}/memberships`,
      headers: { cookie, origin: ORIGIN },
      payload: { role, displayName },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }

  async function invite(input: {
    academyId: string;
    cookie: string;
    email: string;
    role: 'OWNER' | 'ADMIN' | 'COACH' | 'STUDENT';
    existingMembershipId?: string;
  }) {
    return app.inject({
      method: 'POST',
      url: `/academies/${input.academyId}/invitations`,
      headers: { cookie: input.cookie, origin: ORIGIN },
      payload: {
        email: input.email,
        role: input.role,
        existingMembershipId: input.existingMembershipId,
      },
    });
  }

  async function accept(input: {
    token: string;
    email: string;
    displayName: string;
    password: string;
    cookie?: string;
  }) {
    return app.inject({
      method: 'POST',
      url: `/auth/invitations/${input.token}/accept`,
      headers: { origin: ORIGIN, ...(input.cookie ? { cookie: input.cookie } : {}) },
      payload: {
        email: input.email,
        displayName: input.displayName,
        password: input.password,
      },
    });
  }

  it('hashes Argon2id passwords and accepts a long passphrase', async () => {
    const password = 'correct horse battery staple for chess academy';
    const hash = await passwords.hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$argon2id\$/u);
    await expect(passwords.verifyPassword(hash, password)).resolves.toBe(true);
    await expect(passwords.verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('runs bootstrap → session → existing Student claim → RBAC → consent → audit', async () => {
    const owner = await bootstrap({
      academyName: 'Knight Academy',
      email: 'owner@example.test',
      displayName: 'Owner',
      password: 'owner passphrase 123',
    });
    const ownerLogin = await login('OWNER@example.test', 'owner passphrase 123');
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: ownerLogin.cookie },
    });
    expect(me.json()).toMatchObject({
      email: 'owner@example.test',
      memberships: [{ academyId: owner.academyId, role: 'OWNER' }],
    });

    const playerId = randomUUID();
    await database.query(
      `INSERT INTO players (id, display_name, normalized_name)
       VALUES ($1, 'Student Player', 'student player')`,
      [playerId],
    );
    const studentMembership = await createMembership(
      owner.academyId,
      ownerLogin.cookie,
      'STUDENT',
      'Student A',
    );
    const studentProfile = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/students`,
      headers: { cookie: ownerLogin.cookie, origin: ORIGIN },
      payload: {
        membershipId: studentMembership.id,
        playerId,
        requiresGuardianConsent: true,
      },
    });
    expect(studentProfile.statusCode).toBe(201);
    const studentProfileId = studentProfile.json<{ student: { id: string } }>().student.id;

    const studentInvite = await invite({
      academyId: owner.academyId,
      cookie: ownerLogin.cookie,
      email: 'student@example.test',
      role: 'STUDENT',
      existingMembershipId: studentMembership.id,
    });
    expect(studentInvite.statusCode).toBe(201);
    expect(studentInvite.json()).not.toHaveProperty('rawInvitationToken');
    const token = emailDelivery.invitationToken('student@example.test');
    const persistedToken = await database.query<{ token_hash: string }>(
      `SELECT token_hash FROM academy_invitations WHERE existing_membership_id = $1`,
      [studentMembership.id],
    );
    expect(persistedToken.rows[0]!.token_hash).not.toBe(token);
    expect(persistedToken.rows[0]!.token_hash).toMatch(/^[a-f0-9]{64}$/u);

    const accepted = await accept({
      token,
      email: 'student@example.test',
      displayName: 'Student A',
      password: 'student passphrase 123',
    });
    expect(accepted.statusCode).toBe(201);
    const claimed = await database.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM academy_memberships WHERE id = $1`,
      [studentMembership.id],
    );
    expect(claimed.rows[0]!.id).toBe(studentMembership.id);
    expect(claimed.rows[0]!.user_id).toBeTruthy();

    const studentLogin = await login('student@example.test', 'student passphrase 123');
    const interactionId = randomUUID();
    const openedStudent = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/pilot/events`,
      headers: { cookie: ownerLogin.cookie, origin: ORIGIN },
      payload: {
        eventType: 'COACH_OPENED_STUDENT_INTELLIGENCE',
        studentProfileId,
        interactionId,
      },
    });
    expect(openedStudent.statusCode, openedStudent.body).toBe(201);
    const deduplicatedOpen = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/pilot/events`,
      headers: { cookie: ownerLogin.cookie, origin: ORIGIN },
      payload: {
        eventType: 'COACH_OPENED_STUDENT_INTELLIGENCE',
        studentProfileId,
        interactionId,
      },
    });
    expect(deduplicatedOpen.statusCode).toBe(200);
    expect(deduplicatedOpen.json()).toMatchObject({ deduplicated: true });
    const spoofedServerAction = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/pilot/events`,
      headers: { cookie: ownerLogin.cookie, origin: ORIGIN },
      payload: {
        eventType: 'COACH_CREATED_ASSIGNMENT',
        studentProfileId,
        interactionId: randomUUID(),
      },
    });
    expect(spoofedServerAction.statusCode).toBe(403);
    const studentSpoofedCoach = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/pilot/events`,
      headers: { cookie: studentLogin.cookie, origin: ORIGIN },
      payload: {
        eventType: 'COACH_OPENED_STUDENT_INTELLIGENCE',
        studentProfileId,
        interactionId: randomUUID(),
      },
    });
    expect(studentSpoofedCoach.statusCode).toBe(403);
    const pilotEventCounts = await database.query<{
      pilot_events: number;
      concept_evidence: number;
      training_evidence: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM pilot_events) AS pilot_events,
         (SELECT count(*)::int FROM concept_evidence_instances) AS concept_evidence,
         (SELECT count(*)::int FROM training_evidence_instances) AS training_evidence`,
    );
    expect(pilotEventCounts.rows[0]).toEqual({
      pilot_events: 1,
      concept_evidence: 0,
      training_evidence: 0,
    });
    const pending = await app.inject({
      method: 'GET',
      url: `/academies/${owner.academyId}/me/assignments`,
      headers: { cookie: studentLogin.cookie },
    });
    expect(pending.statusCode).toBe(403);
    expect(pending.json()).toMatchObject({ error: { code: 'GUARDIAN_CONSENT_REQUIRED' } });
    const selfGrant = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/students/${studentProfileId}/consent-records`,
      headers: { cookie: studentLogin.cookie, origin: ORIGIN },
      payload: { status: 'GRANTED' },
    });
    expect(selfGrant.statusCode).toBe(403);

    const studentRoster = await app.inject({
      method: 'GET',
      url: `/academies/${owner.academyId}/roster?ontologyVersion=1.0.0&coachMembershipId=${owner.membershipId}`,
      headers: { cookie: studentLogin.cookie },
    });
    expect(studentRoster.statusCode).toBe(403);
    expect(studentRoster.json()).toMatchObject({ error: { code: 'PERMISSION_DENIED' } });

    const consent = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/students/${studentProfileId}/consent-records`,
      headers: { cookie: ownerLogin.cookie, origin: ORIGIN },
      payload: { status: 'GRANTED', externalReference: 'academy-record-42' },
    });
    expect(consent.statusCode).toBe(201);
    const assignments = await app.inject({
      method: 'GET',
      url: `/academies/${owner.academyId}/me/assignments`,
      headers: { cookie: studentLogin.cookie },
    });
    expect(assignments.statusCode).toBe(200);
    expect(assignments.json()).toMatchObject({ assignments: [] });
    const revokedConsent = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/students/${studentProfileId}/consent-records`,
      headers: { cookie: ownerLogin.cookie, origin: ORIGIN },
      payload: { status: 'REVOKED', externalReference: 'academy-revocation-43' },
    });
    expect(revokedConsent.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/academies/${owner.academyId}/me/assignments`,
          headers: { cookie: studentLogin.cookie },
        })
      ).statusCode,
    ).toBe(403);

    const other = await bootstrap({
      academyName: 'Other Academy',
      email: 'other-owner@example.test',
      displayName: 'Other Owner',
      password: 'other owner passphrase',
    });
    const crossTenant = await app.inject({
      method: 'GET',
      url: `/academies/${other.academyId}/roster?ontologyVersion=1.0.0`,
      headers: { cookie: ownerLogin.cookie },
    });
    expect(crossTenant.statusCode).toBe(403);
    expect(crossTenant.json()).not.toHaveProperty('students');

    const audit = await app.inject({
      method: 'GET',
      url: `/academies/${owner.academyId}/audit`,
      headers: { cookie: ownerLogin.cookie },
    });
    expect(audit.statusCode).toBe(200);
    const actions = audit.json<{ events: Array<{ action: string; metadata: unknown }> }>().events;
    expect(actions.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'INVITATION_CREATED',
        'INVITATION_ACCEPTED',
        'GUARDIAN_CONSENT_RECORDED',
      ]),
    );
    expect(JSON.stringify(actions)).not.toContain(token);
    const loginAudit = await database.query<{ action: string }>(
      `SELECT action FROM security_audit_events
       WHERE actor_user_id = $1 AND action = 'AUTH_LOGIN_SUCCESS'`,
      [owner.userId],
    );
    expect(loginAudit.rows).toHaveLength(1);
    const denied = await database.query<{ action: string }>(
      `SELECT action FROM security_audit_events
       WHERE actor_user_id = $1 AND action = 'CROSS_TENANT_ACCESS_DENIED'`,
      [owner.userId],
    );
    expect(denied.rows).toHaveLength(1);
    const anyAudit = await database.query<{ id: string }>(
      `SELECT id FROM security_audit_events WHERE academy_id = $1 LIMIT 1`,
      [owner.academyId],
    );
    await expect(
      database.query(`UPDATE security_audit_events SET outcome = 'SUCCESS' WHERE id = $1`, [
        anyAudit.rows[0]!.id,
      ]),
    ).rejects.toThrow(/append-only/u);
  });

  it('enforces invitation and session lifecycle security', async () => {
    const owner = await bootstrap({
      academyName: 'Lifecycle Academy',
      email: 'owner@lifecycle.test',
      displayName: 'Owner',
      password: 'owner lifecycle password',
    });
    const ownerSession = await login('owner@lifecycle.test', 'owner lifecycle password');
    const lastOwner = await app.inject({
      method: 'PATCH',
      url: `/academies/${owner.academyId}/memberships/${owner.membershipId}`,
      headers: { cookie: ownerSession.cookie, origin: ORIGIN },
      payload: { role: 'ADMIN', status: 'ACTIVE' },
    });
    expect(lastOwner.statusCode).toBe(409);
    await createMembership(owner.academyId, ownerSession.cookie, 'OWNER', 'Second Owner');
    const safeDemotion = await app.inject({
      method: 'PATCH',
      url: `/academies/${owner.academyId}/memberships/${owner.membershipId}`,
      headers: { cookie: ownerSession.cookie, origin: ORIGIN },
      payload: { role: 'ADMIN', status: 'ACTIVE' },
    });
    expect(safeDemotion.statusCode).toBe(200);
    const coachInvite = await invite({
      academyId: owner.academyId,
      cookie: ownerSession.cookie,
      email: 'coach@lifecycle.test',
      role: 'COACH',
    });
    expect(coachInvite.statusCode).toBe(201);
    const coachToken = emailDelivery.invitationToken('coach@lifecycle.test');
    expect(
      (
        await accept({
          token: coachToken,
          email: 'coach@lifecycle.test',
          displayName: 'Coach',
          password: 'coach lifecycle password',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await accept({
          token: coachToken,
          email: 'coach@lifecycle.test',
          displayName: 'Coach',
          password: 'coach lifecycle password',
        })
      ).statusCode,
    ).toBe(409);

    const coachSession = await login('coach@lifecycle.test', 'coach lifecycle password');
    const deniedInvite = await invite({
      academyId: owner.academyId,
      cookie: coachSession.cookie,
      email: 'another@lifecycle.test',
      role: 'COACH',
    });
    expect(deniedInvite.statusCode).toBe(403);
    const evidenceBefore = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM training_evidence_instances`,
    );
    const coachImpersonation = await app.inject({
      method: 'POST',
      url: `/training/items/${randomUUID()}/attempts`,
      headers: { cookie: coachSession.cookie, origin: ORIGIN },
      payload: { playerId: randomUUID(), moveUci: 'e2e4' },
    });
    expect(coachImpersonation.statusCode).toBe(403);
    const evidenceAfter = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM training_evidence_instances`,
    );
    expect(evidenceAfter.rows[0]!.count).toBe(evidenceBefore.rows[0]!.count);
    const directBypass = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      headers: { cookie: coachSession.cookie, origin: ORIGIN },
      payload: {
        playerId: randomUUID(),
        ontologyVersion: '1.0.0',
        asOfDate: '2026-08-28',
      },
    });
    expect(directBypass.statusCode).toBe(404);

    const revocable = await invite({
      academyId: owner.academyId,
      cookie: ownerSession.cookie,
      email: 'revoked@lifecycle.test',
      role: 'COACH',
    });
    const revocableBody = revocable.json<{ invitation: { id: string } }>();
    const revoked = await app.inject({
      method: 'POST',
      url: `/academies/${owner.academyId}/invitations/${revocableBody.invitation.id}/revoke`,
      headers: { cookie: ownerSession.cookie, origin: ORIGIN },
    });
    expect(revoked.statusCode).toBe(200);
    expect(
      (
        await accept({
          token: emailDelivery.invitationToken('revoked@lifecycle.test'),
          email: 'revoked@lifecycle.test',
          displayName: 'Revoked',
          password: 'revoked lifecycle password',
        })
      ).statusCode,
    ).toBe(409);

    await invite({
      academyId: owner.academyId,
      cookie: ownerSession.cookie,
      email: 'intended@lifecycle.test',
      role: 'COACH',
    });
    expect(
      (
        await accept({
          token: emailDelivery.invitationToken('intended@lifecycle.test'),
          email: 'wrong@lifecycle.test',
          displayName: 'Wrong',
          password: 'wrong email passphrase',
        })
      ).statusCode,
    ).toBe(409);

    const expired = await invite({
      academyId: owner.academyId,
      cookie: ownerSession.cookie,
      email: 'expired@lifecycle.test',
      role: 'COACH',
    });
    const expiredBody = expired.json<{ invitation: { id: string } }>();
    await database.query(
      `UPDATE academy_invitations SET created_at = $2, expires_at = $3 WHERE id = $1`,
      [expiredBody.invitation.id, '2026-08-20T11:59:59.000Z', '2026-08-27T11:59:59.000Z'],
    );
    expect(
      (
        await accept({
          token: emailDelivery.invitationToken('expired@lifecycle.test'),
          email: 'expired@lifecycle.test',
          displayName: 'Expired',
          password: 'expired lifecycle password',
        })
      ).statusCode,
    ).toBe(410);

    const passwordChanged = await app.inject({
      method: 'POST',
      url: '/auth/password',
      headers: { cookie: ownerSession.cookie, origin: ORIGIN },
      payload: {
        currentPassword: 'owner lifecycle password',
        newPassword: 'owner lifecycle password changed',
      },
    });
    expect(passwordChanged.statusCode).toBe(200);
    const rotatedCookie = sessionCookie(passwordChanged);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { cookie: ownerSession.cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: rotatedCookie } }))
        .statusCode,
    ).toBe(200);
    const revokeAll = await app.inject({
      method: 'POST',
      url: '/auth/sessions/revoke-all',
      headers: { cookie: rotatedCookie, origin: ORIGIN },
    });
    expect(revokeAll.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: rotatedCookie } }))
        .statusCode,
    ).toBe(401);
  });

  it('rejects expired, logged-out, and disabled User sessions', async () => {
    const owner = await bootstrap({
      academyName: 'Session Academy',
      email: 'session@example.test',
      displayName: 'Session Owner',
      password: 'session lifecycle password',
    });
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'session@example.test', password: 'not the password' },
    });
    const unknownUser = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'unknown@example.test', password: 'not the password' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownUser.json());
    const first = await login('session@example.test', 'session lifecycle password');
    const csrfDenied = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: first.cookie, origin: 'https://evil.example' },
    });
    expect(csrfDenied.statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: first.cookie } }))
        .statusCode,
    ).toBe(200);
    const active = await database.query<{ id: string }>(
      `SELECT id FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      [owner.userId],
    );
    await database.query(
      `UPDATE auth_sessions SET created_at = $2, expires_at = $3 WHERE id = $1`,
      [active.rows[0]!.id, '2026-08-20T11:00:00.000Z', '2026-08-27T11:00:00.000Z'],
    );
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: first.cookie } }))
        .statusCode,
    ).toBe(401);

    const second = await login('session@example.test', 'session lifecycle password');
    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: second.cookie, origin: ORIGIN },
    });
    expect(logout.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: second.cookie } }))
        .statusCode,
    ).toBe(401);

    const third = await login('session@example.test', 'session lifecycle password');
    const disabled = await app.inject({
      method: 'POST',
      url: '/auth/disable',
      headers: { cookie: third.cookie, origin: ORIGIN },
      payload: { currentPassword: 'session lifecycle password' },
    });
    expect(disabled.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: third.cookie } }))
        .statusCode,
    ).toBe(401);
    const disabledLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'session@example.test', password: 'session lifecycle password' },
    });
    expect(disabledLogin.statusCode).toBe(401);
  });

  it('uses an HttpOnly Secure __Host cookie in production mode', async () => {
    await app.close();
    app = await buildApp({
      database,
      webOrigin: 'https://academy.example',
      secureCookies: true,
      now: () => NOW,
    });
    await bootstrap({
      academyName: 'Secure Academy',
      email: 'secure@example.test',
      displayName: 'Secure Owner',
      password: 'secure production password',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'https://academy.example' },
      payload: { email: 'secure@example.test', password: 'secure production password' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['set-cookie']).toContain('__Host-chess_session=');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('Secure');
    expect(response.headers['set-cookie']).toContain('SameSite=Lax');
  });
});
