import { randomUUID } from 'node:crypto';

import type { PasswordResetRepository } from '@chess-intelligent/db';
import {
  PASSWORD_POLICY_V1,
  PASSWORD_RESET_POLICY_V1,
  normalizeEmail,
  passwordResetExpiresAt,
  passwordResetRateLimitState,
  validatePassword,
} from '@chess-intelligent/domain';

import type { AuthApplicationService } from './auth-application';
import type { EmailDeliveryProvider } from './email-delivery';
import type { PasswordHasher } from './password-hasher';

export class PasswordResetApplicationError extends Error {
  constructor(
    readonly code: 'PASSWORD_RESET_TOKEN_INVALID' | 'PASSWORD_POLICY_VIOLATION',
    message: string,
  ) {
    super(message);
    this.name = 'PasswordResetApplicationError';
  }
}

export class PasswordResetApplicationService {
  constructor(
    private readonly repository: PasswordResetRepository,
    private readonly auth: AuthApplicationService,
    private readonly passwords: PasswordHasher,
    private readonly email: EmailDeliveryProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async request(input: { email: string; requestId?: string | null | undefined }): Promise<{
    status: 'PASSWORD_RESET_REQUEST_ACCEPTED';
    policyVersion: string;
  }> {
    const now = this.now();
    const normalizedEmail = normalizeEmail(input.email);
    const identifierSha256 = this.auth.hashOpaqueToken(`password-reset:${normalizedEmail}`);
    const since = new Date(now.getTime() - PASSWORD_RESET_POLICY_V1.requestWindowSeconds * 1000);
    const rate = passwordResetRateLimitState(
      await this.repository.getRecentRequestDates(identifierSha256, since),
      now,
    );

    if (!rate.throttled) {
      const token = this.auth.createInvitationToken();
      const expiresAt = passwordResetExpiresAt(now);
      const delivery = await this.repository.createRequest({
        identifierSha256,
        normalizedEmail,
        tokenId: randomUUID(),
        tokenHash: token.sha256,
        expiresAt,
        now,
        requestId: input.requestId,
      });
      if (delivery) {
        let delivered = false;
        try {
          await this.email.sendPasswordReset({
            to: delivery.email,
            displayName: delivery.displayName,
            rawToken: token.raw,
            expiresAt: expiresAt.toISOString(),
          });
          delivered = true;
        } catch {
          delivered = false;
        }
        await this.repository.recordDelivery({
          requestId: delivery.requestId,
          userId: delivery.userId,
          delivered,
          now: this.now(),
          correlationRequestId: input.requestId,
        });
      } else if (this.email.configured) {
        // Exercise the same external dependency without sending to an unverified address.
        // Public behavior remains identical whether the account exists or not.
        try {
          await this.email.verify();
        } catch {
          // Delivery health is exposed by /readyz and operational logs, not this public endpoint.
        }
      }
    } else if (this.email.configured) {
      try {
        await this.email.verify();
      } catch {
        // Throttling and provider health are intentionally not disclosed publicly.
      }
    }

    return {
      status: 'PASSWORD_RESET_REQUEST_ACCEPTED',
      policyVersion: PASSWORD_RESET_POLICY_V1.version,
    };
  }

  async complete(input: {
    rawToken: string;
    newPassword: string;
    requestId?: string | null | undefined;
  }): Promise<{ status: 'PASSWORD_RESET_COMPLETED'; sessionsRevoked: true }> {
    const policy = validatePassword(input.newPassword);
    if (!policy.valid) {
      throw new PasswordResetApplicationError(
        'PASSWORD_POLICY_VIOLATION',
        `The new password must contain ${PASSWORD_POLICY_V1.minimumLength} to ${PASSWORD_POLICY_V1.maximumLength} characters.`,
      );
    }
    const passwordHash = await this.passwords.hashPassword(input.newPassword);
    const completed = await this.repository.complete({
      tokenHash: this.auth.hashOpaqueToken(input.rawToken),
      passwordHash,
      now: this.now(),
      requestId: input.requestId,
    });
    if (!completed) {
      throw new PasswordResetApplicationError(
        'PASSWORD_RESET_TOKEN_INVALID',
        'The password reset token is invalid, expired, revoked, or already used.',
      );
    }
    return { status: 'PASSWORD_RESET_COMPLETED', sessionsRevoked: true };
  }
}
