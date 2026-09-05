import type {
  AcademyAccessRepository,
  AcademyActorRecord,
  AcademyInvitationRepository,
  AcademyRepository,
  ManagedMembershipRecord,
  SecurityAuditRepository,
  StudentActorContext,
} from '@chess-intelligent/db';
import {
  ACADEMY_INVITATION_POLICY_V1,
  canManageMembershipRole,
  hasAcademyCapability,
  invitationExpiresAt,
  normalizeEmail,
  studentSelfServiceAllowed,
  type AcademyCapability,
  type AcademyMembershipRoleV1,
  type AcademyMembershipStatus,
} from '@chess-intelligent/domain';

import type { AuthApplicationService, AuthenticatedPrincipal } from './auth-application';
import { DisabledEmailDeliveryProvider, type EmailDeliveryProvider } from './email-delivery';

export type AcademySecurityApplicationErrorCode =
  | 'ACADEMY_MEMBERSHIP_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'STUDENT_SELF_CONTEXT_REQUIRED'
  | 'TRAINING_ITEM_NOT_ASSIGNED_TO_STUDENT'
  | 'GUARDIAN_CONSENT_REQUIRED'
  | 'OWNER_ROLE_REQUIRES_OWNER'
  | 'MEMBERSHIP_MANAGEMENT_DENIED'
  | 'EMAIL_DELIVERY_REQUIRED'
  | 'EMAIL_DELIVERY_FAILED';

export class AcademySecurityApplicationError extends Error {
  constructor(
    readonly code: AcademySecurityApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AcademySecurityApplicationError';
  }
}

export class AcademySecurityApplicationService {
  constructor(
    private readonly access: AcademyAccessRepository,
    private readonly invitations: AcademyInvitationRepository,
    private readonly academies: AcademyRepository,
    private readonly audit: SecurityAuditRepository,
    private readonly auth: AuthApplicationService,
    private readonly now: () => Date = () => new Date(),
    private readonly email: EmailDeliveryProvider = new DisabledEmailDeliveryProvider(),
    private readonly exposeRawInvitationTokens = false,
  ) {}

  async requireCapability(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    capability: AcademyCapability;
    requestId?: string | null | undefined;
  }): Promise<AcademyActorRecord> {
    const actor = await this.access.resolveAcademyActor(input.principal.userId, input.academyId);
    if (!actor) {
      await this.audit.append({
        // The caller may supply a nonexistent Academy UUID. Keeping this null
        // avoids turning a denied lookup into an audit foreign-key failure;
        // targetId still preserves the exact requested tenant identifier.
        academyId: null,
        actorUserId: input.principal.userId,
        sessionId: input.principal.sessionId,
        action: 'CROSS_TENANT_ACCESS_DENIED',
        targetType: 'ACADEMY',
        targetId: input.academyId,
        outcome: 'DENIED',
        requestId: input.requestId,
        metadata: { requiredCapability: input.capability },
      });
      throw new AcademySecurityApplicationError(
        'ACADEMY_MEMBERSHIP_REQUIRED',
        'An active membership in the requested Academy is required.',
      );
    }
    if (!hasAcademyCapability(actor.role, input.capability)) {
      await this.audit.append({
        academyId: input.academyId,
        actorUserId: input.principal.userId,
        actorMembershipId: actor.membershipId,
        sessionId: input.principal.sessionId,
        action: 'PERMISSION_DENIED',
        targetType: 'ACADEMY',
        targetId: input.academyId,
        outcome: 'DENIED',
        requestId: input.requestId,
        metadata: { role: actor.role, requiredCapability: input.capability },
      });
      throw new AcademySecurityApplicationError(
        'PERMISSION_DENIED',
        'The authenticated Academy role does not permit this action.',
      );
    }
    return actor;
  }

  async requireStudentSelf(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    requestId?: string | null | undefined;
  }): Promise<StudentActorContext> {
    const student = await this.access.resolveStudentActor(input.principal.userId, input.academyId);
    if (!student || !hasAcademyCapability(student.role, 'STUDENT_SELF_READ')) {
      await this.audit.append({
        academyId: input.academyId,
        actorUserId: input.principal.userId,
        sessionId: input.principal.sessionId,
        action: 'PERMISSION_DENIED',
        targetType: 'STUDENT_SELF_SERVICE',
        outcome: 'DENIED',
        requestId: input.requestId,
      });
      throw new AcademySecurityApplicationError(
        'STUDENT_SELF_CONTEXT_REQUIRED',
        'An active STUDENT membership and StudentProfile are required.',
      );
    }
    return student;
  }

  async requireTrainingItemStudent(input: {
    principal: AuthenticatedPrincipal;
    trainingItemId: string;
    requireConsent: boolean;
    requestId?: string | null | undefined;
  }): Promise<StudentActorContext & { assignmentId: string; trainingItemId: string }> {
    const student = await this.access.resolveAssignedStudentItem(
      input.principal.userId,
      input.trainingItemId,
    );
    if (!student || !hasAcademyCapability(student.role, 'TRAINING_SELF_SUBMIT')) {
      await this.audit.append({
        actorUserId: input.principal.userId,
        sessionId: input.principal.sessionId,
        action: 'PERMISSION_DENIED',
        targetType: 'TRAINING_ITEM',
        targetId: input.trainingItemId,
        outcome: 'DENIED',
        requestId: input.requestId,
      });
      throw new AcademySecurityApplicationError(
        'TRAINING_ITEM_NOT_ASSIGNED_TO_STUDENT',
        'The TrainingItem is not assigned to the authenticated Student.',
      );
    }
    if (input.requireConsent && !studentSelfServiceAllowed(student.consentStatus)) {
      throw new AcademySecurityApplicationError(
        'GUARDIAN_CONSENT_REQUIRED',
        'Academy-recorded guardian consent is required before scored training.',
      );
    }
    return student;
  }

  async createInvitation(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    email: string;
    role: AcademyMembershipRoleV1;
    existingMembershipId?: string | null | undefined;
    requestId?: string | null | undefined;
  }) {
    const actor = await this.requireCapability({
      principal: input.principal,
      academyId: input.academyId,
      capability: 'INVITATION_MANAGE',
      requestId: input.requestId,
    });
    if (input.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new AcademySecurityApplicationError(
        'OWNER_ROLE_REQUIRES_OWNER',
        'Only an OWNER may create an OWNER invitation.',
      );
    }
    if (!this.email.configured && !this.exposeRawInvitationTokens) {
      throw new AcademySecurityApplicationError(
        'EMAIL_DELIVERY_REQUIRED',
        'Email delivery must be configured before an invitation can be issued.',
      );
    }
    const token = this.auth.createInvitationToken();
    const now = this.now();
    let invitation = await this.invitations.create({
      academyId: input.academyId,
      normalizedEmail: normalizeEmail(input.email),
      role: input.role,
      existingMembershipId: input.existingMembershipId,
      actor,
      sessionId: input.principal.sessionId,
      tokenHash: token.sha256,
      expiresAt: invitationExpiresAt(now),
      now,
      requestId: input.requestId,
    });
    if (!this.email.configured) {
      if (this.exposeRawInvitationTokens) {
        return {
          invitation,
          rawInvitationToken: token.raw,
          tokenDisplayPolicy: 'DEVELOPMENT_ONLY_RETURNED_ONCE_NOT_PERSISTED',
          deliveryStatus: 'EMAIL_DELIVERY_DISABLED_DEVELOPMENT',
          invitationPolicyVersion: ACADEMY_INVITATION_POLICY_V1.version,
        };
      }
      throw new Error('Unreachable invitation delivery configuration.');
    }
    await this.invitations.beginDelivery({
      academyId: input.academyId,
      invitationId: invitation.id,
      actor,
      sessionId: input.principal.sessionId,
      now,
      requestId: input.requestId,
    });
    try {
      await this.email.sendAcademyInvitation({
        to: invitation.normalizedEmail,
        academyName: invitation.academyName,
        role: invitation.role,
        rawToken: token.raw,
        expiresAt: invitation.expiresAt,
      });
      invitation = await this.invitations.completeDelivery({
        academyId: input.academyId,
        invitationId: invitation.id,
        actor,
        sessionId: input.principal.sessionId,
        delivered: true,
        now: this.now(),
        requestId: input.requestId,
      });
    } catch {
      await this.invitations.completeDelivery({
        academyId: input.academyId,
        invitationId: invitation.id,
        actor,
        sessionId: input.principal.sessionId,
        delivered: false,
        now: this.now(),
        requestId: input.requestId,
      });
      throw new AcademySecurityApplicationError(
        'EMAIL_DELIVERY_FAILED',
        'Invitation delivery failed. The invitation was not exposed to the caller.',
      );
    }
    return {
      invitation,
      tokenDisplayPolicy: 'DELIVERED_ONLY_NOT_PERSISTED_OR_RETURNED',
      deliveryStatus: invitation.deliveryStatus,
      invitationPolicyVersion: ACADEMY_INVITATION_POLICY_V1.version,
    };
  }

  async inspectInvitation(rawToken: string) {
    return this.invitations.inspect(this.auth.hashOpaqueToken(rawToken), this.now());
  }

  async acceptInvitation(input: {
    rawToken: string;
    principal?: AuthenticatedPrincipal | null | undefined;
    email?: string | undefined;
    displayName: string;
    password?: string | undefined;
    requestId?: string | null | undefined;
  }) {
    let email = input.email;
    let normalizedEmail: string;
    let passwordHash: string | undefined;
    if (input.principal) {
      const user = await this.auth.me(input.principal);
      email = user.email;
      normalizedEmail = user.normalizedEmail;
    } else {
      if (!email || !input.password) {
        throw new AcademySecurityApplicationError(
          'PERMISSION_DENIED',
          'A new invited User requires email and password.',
        );
      }
      normalizedEmail = normalizeEmail(email);
      passwordHash = await this.auth.hashNewPassword(input.password);
    }
    return this.invitations.accept({
      tokenHash: this.auth.hashOpaqueToken(input.rawToken),
      normalizedEmail,
      email: email!,
      displayName: input.displayName,
      passwordHash,
      existingUserId: input.principal?.userId,
      now: this.now(),
      requestId: input.requestId,
    });
  }

  async listInvitations(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    requestId?: string | null | undefined;
  }) {
    await this.requireCapability({ ...input, capability: 'INVITATION_MANAGE' });
    return this.invitations.list(input.academyId, this.now());
  }

  async revokeInvitation(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    invitationId: string;
    requestId?: string | null | undefined;
  }) {
    const actor = await this.requireCapability({ ...input, capability: 'INVITATION_MANAGE' });
    return this.invitations.revoke({
      academyId: input.academyId,
      invitationId: input.invitationId,
      actor,
      sessionId: input.principal.sessionId,
      now: this.now(),
      requestId: input.requestId,
    });
  }

  async createMembership(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    role: AcademyMembershipRoleV1;
    displayName: string;
    requestId?: string | null | undefined;
  }) {
    const actor = await this.requireCapability({ ...input, capability: 'MEMBERSHIP_MANAGE' });
    if (input.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new AcademySecurityApplicationError(
        'OWNER_ROLE_REQUIRES_OWNER',
        'Only an OWNER may create an OWNER membership.',
      );
    }
    return this.academies.createMembership(input);
  }

  async updateMembership(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    membershipId: string;
    role: AcademyMembershipRoleV1;
    status: AcademyMembershipStatus;
    requestId?: string | null | undefined;
  }): Promise<ManagedMembershipRecord> {
    const actor = await this.requireCapability({ ...input, capability: 'MEMBERSHIP_MANAGE' });
    const target = await this.access.getMembership(input.academyId, input.membershipId);
    if (!target || !canManageMembershipRole(actor.role, target.role, input.role)) {
      throw new AcademySecurityApplicationError(
        'MEMBERSHIP_MANAGEMENT_DENIED',
        'The authenticated role may not manage this membership transition.',
      );
    }
    return this.access.updateMembership({
      academyId: input.academyId,
      membershipId: input.membershipId,
      actor,
      role: input.role,
      status: input.status,
      sessionId: input.principal.sessionId,
      requestId: input.requestId,
      now: this.now(),
    });
  }

  async listMemberships(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    requestId?: string | null | undefined;
  }) {
    await this.requireCapability({ ...input, capability: 'MEMBERSHIP_MANAGE' });
    return this.access.listAcademyMemberships(input.academyId);
  }

  async setGuardianConsentRequirement(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    studentProfileId: string;
    requiresGuardianConsent: boolean;
    requestId?: string | null | undefined;
  }): Promise<void> {
    const actor = await this.requireCapability({ ...input, capability: 'CONSENT_MANAGE' });
    await this.access.setGuardianConsentRequirement({
      academyId: input.academyId,
      studentProfileId: input.studentProfileId,
      requiresGuardianConsent: input.requiresGuardianConsent,
      actor,
      sessionId: input.principal.sessionId,
      requestId: input.requestId,
      now: this.now(),
    });
  }

  async recordGuardianConsent(input: {
    principal: AuthenticatedPrincipal;
    academyId: string;
    studentProfileId: string;
    status: 'PENDING' | 'GRANTED' | 'REVOKED';
    externalReference?: string | null | undefined;
    requestId?: string | null | undefined;
  }) {
    const actor = await this.requireCapability({ ...input, capability: 'CONSENT_MANAGE' });
    return this.access.recordGuardianConsent({
      academyId: input.academyId,
      studentProfileId: input.studentProfileId,
      status: input.status,
      externalReference: input.externalReference,
      actor,
      sessionId: input.principal.sessionId,
      requestId: input.requestId,
      now: this.now(),
    });
  }

  async recordAssignmentAudit(input: {
    principal: AuthenticatedPrincipal;
    actor: AcademyActorRecord;
    academyId: string;
    assignmentId: string;
    action: 'ASSIGNMENT_CREATED' | 'ASSIGNMENT_CANCELLED';
    requestId?: string | null | undefined;
  }): Promise<void> {
    await this.audit.append({
      academyId: input.academyId,
      actorUserId: input.principal.userId,
      actorMembershipId: input.actor.membershipId,
      sessionId: input.principal.sessionId,
      action: input.action,
      targetType: 'TRAINING_ASSIGNMENT',
      targetId: input.assignmentId,
      outcome: 'SUCCESS',
      requestId: input.requestId,
      occurredAt: this.now(),
    });
  }
}
