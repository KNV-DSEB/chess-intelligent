import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SecurityAuditRepository } from '@chess-intelligent/db';
import {
  ACADEMY_MEMBERSHIP_ROLES,
  ACADEMY_MEMBERSHIP_STATUSES,
  PASSWORD_POLICY_V1,
  SECURITY_AUDIT_ACTIONS,
} from '@chess-intelligent/domain';

import type { AcademySecurityApplicationService } from './academy-security-application';
import type { AuthApplicationService } from './auth-application';
import type { PasswordResetApplicationService } from './password-reset-application';
import {
  clearSessionCookie,
  requestPrincipal,
  requireRequestPrincipal,
  setSessionCookie,
} from './auth-http';

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(PASSWORD_POLICY_V1.maximumLength),
});
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_POLICY_V1.maximumLength),
  newPassword: z
    .string()
    .min(PASSWORD_POLICY_V1.minimumLength)
    .max(PASSWORD_POLICY_V1.maximumLength),
});
const userDisableSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_POLICY_V1.maximumLength),
});
const passwordResetRequestSchema = z.object({ email: z.email().max(320) });
const passwordResetCompleteSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: z
    .string()
    .min(PASSWORD_POLICY_V1.minimumLength)
    .max(PASSWORD_POLICY_V1.maximumLength),
});
const academyParametersSchema = z.object({ academyId: z.uuid() });
const invitationParametersSchema = academyParametersSchema.extend({ invitationId: z.uuid() });
const publicInvitationParametersSchema = z.object({ token: z.string().min(32).max(256) });
const membershipParametersSchema = academyParametersSchema.extend({ membershipId: z.uuid() });
const studentParametersSchema = academyParametersSchema.extend({ studentId: z.uuid() });
const invitationSchema = z.object({
  email: z.email().max(320),
  role: z.enum(ACADEMY_MEMBERSHIP_ROLES),
  existingMembershipId: z.uuid().nullable().optional(),
});
const invitationAcceptSchema = z.object({
  email: z.email().max(320).optional(),
  displayName: z.string().trim().min(1).max(300),
  password: z.string().max(PASSWORD_POLICY_V1.maximumLength).optional(),
});
const membershipUpdateSchema = z.object({
  role: z.enum(ACADEMY_MEMBERSHIP_ROLES),
  status: z.enum(ACADEMY_MEMBERSHIP_STATUSES),
});
const consentRequirementSchema = z.object({ requiresGuardianConsent: z.boolean() });
const consentRecordSchema = z.object({
  status: z.enum(['PENDING', 'GRANTED', 'REVOKED']),
  externalReference: z.string().trim().min(1).max(500).nullable().optional(),
});
const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.enum(SECURITY_AUDIT_ACTIONS).optional(),
});

function invalid(code: string, message: string, details?: unknown) {
  return { error: { code, message, details } };
}

function requestId(request: FastifyRequest): string {
  return request.id;
}

export function registerSecurityRoutes(input: {
  app: FastifyInstance;
  auth: AuthApplicationService;
  passwordReset: PasswordResetApplicationService;
  security: AcademySecurityApplicationService;
  audit: SecurityAuditRepository;
  secureCookies: boolean;
}): void {
  const { app, auth, passwordReset, security, audit, secureCookies } = input;

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(invalid('INVALID_LOGIN_REQUEST', 'Invalid login request.'));
    }
    const result = await auth.login({
      ...body.data,
      userAgent: request.headers['user-agent'],
      requestId: requestId(request),
    });
    setSessionCookie(reply, result.rawSessionToken, result.session.expiresAt, secureCookies);
    return reply.send({ user: result.user, session: result.session });
  });

  app.post('/auth/logout', async (request, reply) => {
    const principal = await requestPrincipal(request, auth, secureCookies);
    await auth.logout(principal, requestId(request));
    clearSessionCookie(reply, secureCookies);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (request) => {
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    return auth.me(principal);
  });

  app.post('/auth/password', async (request, reply) => {
    const body = passwordChangeSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .code(400)
        .send(invalid('INVALID_PASSWORD_CHANGE', 'Invalid password change request.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    const result = await auth.changePassword({
      principal,
      ...body.data,
      userAgent: request.headers['user-agent'],
      requestId: requestId(request),
    });
    setSessionCookie(reply, result.rawSessionToken, result.session.expiresAt, secureCookies);
    return reply.send({ session: result.session, otherSessionsRevoked: true });
  });

  app.post('/auth/sessions/revoke-all', async (request, reply) => {
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    await auth.revokeAllSessions(principal, requestId(request));
    clearSessionCookie(reply, secureCookies);
    return reply.code(204).send();
  });

  app.post('/auth/disable', async (request, reply) => {
    const body = userDisableSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(invalid('INVALID_USER_DISABLE', 'Invalid User disable request.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    await auth.disableOwnUser({
      principal,
      currentPassword: body.data.currentPassword,
      requestId: requestId(request),
    });
    clearSessionCookie(reply, secureCookies);
    return reply.code(204).send();
  });

  app.post('/auth/password-reset/request', async (request, reply) => {
    const body = passwordResetRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .code(400)
        .send(invalid('INVALID_PASSWORD_RESET_REQUEST', 'Invalid password reset request.'));
    }
    return reply.code(202).send(
      await passwordReset.request({
        email: body.data.email,
        requestId: requestId(request),
      }),
    );
  });

  app.post('/auth/password-reset/complete', async (request, reply) => {
    const body = passwordResetCompleteSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .code(400)
        .send(invalid('INVALID_PASSWORD_RESET_COMPLETION', 'Invalid password reset completion.'));
    }
    return reply.send(
      await passwordReset.complete({
        rawToken: body.data.token,
        newPassword: body.data.newPassword,
        requestId: requestId(request),
      }),
    );
  });

  app.get('/auth/invitations/:token', async (request, reply) => {
    const parameters = publicInvitationParametersSchema.safeParse(request.params);
    if (!parameters.success) {
      return reply.code(400).send(invalid('INVALID_INVITATION_TOKEN', 'Invalid invitation token.'));
    }
    return security.inspectInvitation(parameters.data.token);
  });

  app.post('/auth/invitations/:token/accept', async (request, reply) => {
    const parameters = publicInvitationParametersSchema.safeParse(request.params);
    const body = invitationAcceptSchema.safeParse(request.body);
    if (!parameters.success || !body.success) {
      return reply
        .code(400)
        .send(invalid('INVALID_INVITATION_ACCEPTANCE', 'Invalid invitation acceptance.'));
    }
    const principal = await requestPrincipal(request, auth, secureCookies);
    const accepted = await security.acceptInvitation({
      rawToken: parameters.data.token,
      principal,
      ...body.data,
      requestId: requestId(request),
    });
    return reply.code(201).send(accepted);
  });

  app.post('/academies/:academyId/invitations', async (request, reply) => {
    const parameters = academyParametersSchema.safeParse(request.params);
    const body = invitationSchema.safeParse(request.body);
    if (!parameters.success || !body.success) {
      return reply.code(400).send(invalid('INVALID_INVITATION_REQUEST', 'Invalid invitation.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    return reply.code(201).send(
      await security.createInvitation({
        principal,
        academyId: parameters.data.academyId,
        ...body.data,
        requestId: requestId(request),
      }),
    );
  });

  app.get('/academies/:academyId/invitations', async (request, reply) => {
    const parameters = academyParametersSchema.safeParse(request.params);
    if (!parameters.success) {
      return reply.code(400).send(invalid('INVALID_ACADEMY_ID', 'Invalid Academy ID.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    return security.listInvitations({
      principal,
      academyId: parameters.data.academyId,
      requestId: requestId(request),
    });
  });

  app.post('/academies/:academyId/invitations/:invitationId/revoke', async (request, reply) => {
    const parameters = invitationParametersSchema.safeParse(request.params);
    if (!parameters.success) {
      return reply.code(400).send(invalid('INVALID_INVITATION_ID', 'Invalid invitation ID.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    return security.revokeInvitation({
      principal,
      ...parameters.data,
      requestId: requestId(request),
    });
  });

  app.get('/academies/:academyId/memberships', async (request, reply) => {
    const parameters = academyParametersSchema.safeParse(request.params);
    if (!parameters.success) {
      return reply.code(400).send(invalid('INVALID_ACADEMY_ID', 'Invalid Academy ID.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    return security.listMemberships({
      principal,
      academyId: parameters.data.academyId,
      requestId: requestId(request),
    });
  });

  app.patch('/academies/:academyId/memberships/:membershipId', async (request, reply) => {
    const parameters = membershipParametersSchema.safeParse(request.params);
    const body = membershipUpdateSchema.safeParse(request.body);
    if (!parameters.success || !body.success) {
      return reply
        .code(400)
        .send(invalid('INVALID_MEMBERSHIP_UPDATE', 'Invalid membership update.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    return security.updateMembership({
      principal,
      ...parameters.data,
      ...body.data,
      requestId: requestId(request),
    });
  });

  app.patch(
    '/academies/:academyId/students/:studentId/consent-requirement',
    async (request, reply) => {
      const parameters = studentParametersSchema.safeParse(request.params);
      const body = consentRequirementSchema.safeParse(request.body);
      if (!parameters.success || !body.success) {
        return reply
          .code(400)
          .send(invalid('INVALID_CONSENT_REQUIREMENT', 'Invalid consent boundary.'));
      }
      const principal = await requireRequestPrincipal(request, auth, secureCookies);
      await security.setGuardianConsentRequirement({
        principal,
        academyId: parameters.data.academyId,
        studentProfileId: parameters.data.studentId,
        ...body.data,
        requestId: requestId(request),
      });
      return reply.code(204).send();
    },
  );

  app.post('/academies/:academyId/students/:studentId/consent-records', async (request, reply) => {
    const parameters = studentParametersSchema.safeParse(request.params);
    const body = consentRecordSchema.safeParse(request.body);
    if (!parameters.success || !body.success) {
      return reply.code(400).send(invalid('INVALID_CONSENT_RECORD', 'Invalid consent record.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    const id = await security.recordGuardianConsent({
      principal,
      academyId: parameters.data.academyId,
      studentProfileId: parameters.data.studentId,
      ...body.data,
      requestId: requestId(request),
    });
    return reply.code(201).send({ id });
  });

  app.get('/academies/:academyId/audit', async (request, reply) => {
    const parameters = academyParametersSchema.safeParse(request.params);
    const query = auditQuerySchema.safeParse(request.query);
    if (!parameters.success || !query.success) {
      return reply.code(400).send(invalid('INVALID_AUDIT_QUERY', 'Invalid audit query.'));
    }
    const principal = await requireRequestPrincipal(request, auth, secureCookies);
    await security.requireCapability({
      principal,
      academyId: parameters.data.academyId,
      capability: 'AUDIT_READ',
      requestId: requestId(request),
    });
    return audit.listAcademyEvents({ academyId: parameters.data.academyId, ...query.data });
  });
}
