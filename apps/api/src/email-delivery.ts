import { createTransport, type Transporter } from 'nodemailer';

export interface AcademyInvitationEmail {
  to: string;
  academyName: string;
  role: string;
  rawToken: string;
  expiresAt: string;
}

export interface PasswordResetEmail {
  to: string;
  displayName: string | null;
  rawToken: string;
  expiresAt: string;
}

export interface EmailDeliveryProvider {
  readonly configured: boolean;
  verify(): Promise<void>;
  sendAcademyInvitation(message: AcademyInvitationEmail): Promise<void>;
  sendPasswordReset(message: PasswordResetEmail): Promise<void>;
}

export class EmailDeliveryError extends Error {
  constructor(
    readonly code: 'EMAIL_DELIVERY_DISABLED' | 'EMAIL_DELIVERY_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export class DisabledEmailDeliveryProvider implements EmailDeliveryProvider {
  readonly configured = false;

  async verify(): Promise<void> {
    throw new EmailDeliveryError('EMAIL_DELIVERY_DISABLED', 'Email delivery is not configured.');
  }

  async sendAcademyInvitation(): Promise<void> {
    await this.verify();
  }

  async sendPasswordReset(): Promise<void> {
    await this.verify();
  }
}

export interface SmtpEmailDeliveryOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTls?: boolean | undefined;
  username?: string | undefined;
  password?: string | undefined;
  from: string;
  publicWebBaseUrl: string;
}

export class SmtpEmailDeliveryProvider implements EmailDeliveryProvider {
  readonly configured = true;
  private readonly transporter: Transporter;
  private readonly baseUrl: string;

  constructor(private readonly options: SmtpEmailDeliveryOptions) {
    this.baseUrl = options.publicWebBaseUrl.replace(/\/+$/u, '');
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      requireTLS: options.requireTls ?? false,
      auth: options.username ? { user: options.username, pass: options.password ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async verify(): Promise<void> {
    try {
      await this.transporter.verify();
    } catch {
      throw new EmailDeliveryError('EMAIL_DELIVERY_FAILED', 'SMTP verification failed.');
    }
  }

  async sendAcademyInvitation(message: AcademyInvitationEmail): Promise<void> {
    const url = `${this.baseUrl}/invitations/${encodeURIComponent(message.rawToken)}`;
    await this.send({
      to: message.to,
      subject: `Invitation to ${message.academyName}`,
      text: [
        `You were invited to ${message.academyName} as ${message.role}.`,
        `Accept the invitation: ${url}`,
        `This single-use link expires at ${message.expiresAt}.`,
      ].join('\n\n'),
    });
  }

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    const url = `${this.baseUrl}/password-reset/${encodeURIComponent(message.rawToken)}`;
    await this.send({
      to: message.to,
      subject: 'Reset your chess academy password',
      text: [
        message.displayName ? `Hello ${message.displayName},` : 'Hello,',
        `Reset your password: ${url}`,
        `This single-use link expires at ${message.expiresAt}.`,
        'If you did not request this, ignore this message.',
      ].join('\n\n'),
    });
  }

  private async send(message: { to: string; subject: string; text: string }): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.options.from, ...message });
    } catch {
      throw new EmailDeliveryError('EMAIL_DELIVERY_FAILED', 'SMTP delivery failed.');
    }
  }
}
