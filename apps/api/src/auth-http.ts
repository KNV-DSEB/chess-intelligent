import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { isAllowedMutationOrigin, SESSION_POLICY_V1 } from '@chess-intelligent/domain';

import type {
  AuthApplicationError,
  AuthApplicationService,
  AuthenticatedPrincipal,
} from './auth-application';

export interface AuthHttpOptions {
  webOrigins: readonly string[];
  secureCookies: boolean;
}

export function sessionCookieName(secureCookies: boolean): string {
  return secureCookies
    ? SESSION_POLICY_V1.productionCookieName
    : SESSION_POLICY_V1.developmentCookieName;
}

export function setSessionCookie(
  reply: FastifyReply,
  rawToken: string,
  expiresAt: string,
  secureCookies: boolean,
): void {
  reply.setCookie(sessionCookieName(secureCookies), rawToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: SESSION_POLICY_V1.sameSite,
    path: SESSION_POLICY_V1.path,
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(reply: FastifyReply, secureCookies: boolean): void {
  reply.clearCookie(sessionCookieName(secureCookies), {
    httpOnly: true,
    secure: secureCookies,
    sameSite: SESSION_POLICY_V1.sameSite,
    path: SESSION_POLICY_V1.path,
  });
}

export async function requestPrincipal(
  request: FastifyRequest,
  auth: AuthApplicationService,
  secureCookies: boolean,
): Promise<AuthenticatedPrincipal | null> {
  return auth.authenticate(request.cookies[sessionCookieName(secureCookies)]);
}

export async function requireRequestPrincipal(
  request: FastifyRequest,
  auth: AuthApplicationService,
  secureCookies: boolean,
): Promise<AuthenticatedPrincipal> {
  return auth.requireAuthentication(request.cookies[sessionCookieName(secureCookies)]);
}

export function authErrorStatus(error: AuthApplicationError): number {
  if (error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'EMAIL_ALREADY_REGISTERED') return 409;
  if (error.code === 'PASSWORD_POLICY_VIOLATION') return 400;
  if (error.code === 'CURRENT_PASSWORD_INVALID' || error.code === 'INVALID_CREDENTIALS') return 401;
  if (error.code === 'USER_NOT_FOUND') return 404;
  return 401;
}

export function registerCsrfOriginBoundary(app: FastifyInstance, options: AuthHttpOptions): void {
  app.addHook('onRequest', async (request, reply) => {
    const cookieName = sessionCookieName(options.secureCookies);
    if (
      !isAllowedMutationOrigin({
        method: request.method,
        origin: request.headers.origin,
        allowedOrigins: options.webOrigins,
        hasSessionCookie: Boolean(request.cookies[cookieName]),
      })
    ) {
      return reply.code(403).send({
        error: {
          code: 'CSRF_ORIGIN_DENIED',
          message: 'The request Origin is not allowed for a cookie-authenticated mutation.',
        },
      });
    }
  });
}
