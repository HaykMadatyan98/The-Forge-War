/**
 * Transactional email: SMTP (Gmail etc.) or Resend.
 * Never throws — auth flows must survive mail failures.
 */
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export type MailSendResult = {
  sent: boolean;
  channel?: 'smtp' | 'resend' | 'log';
  error?: string;
};

export function webPublicOrigin(): string {
  const o =
    process.env.WEB_PUBLIC_URL?.trim() ||
    process.env.WEB_ORIGIN?.split(',')[0]?.trim() ||
    'http://localhost:3000';
  return o.replace(/\/$/, '');
}

export function allowDevEmailToken(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.ALLOW_DEV_EMAIL_TOKEN === '0') return false;
  if (process.env.ALLOW_DEV_EMAIL_TOKEN === '1') return true;
  return true;
}

export function returnVerifyTokenOnMailFail(): boolean {
  return process.env.RETURN_VERIFY_TOKEN_ON_MAIL_FAIL === '1';
}

/** Use SMTP first (recommended for Gmail without a custom domain). */
export function preferSmtp(): boolean {
  if (process.env.MAIL_PREFER_SMTP === '1') return true;
  if (process.env.MAIL_PREFER_SMTP === '0') return false;
  // Default: SMTP-only when Resend key is absent
  return !process.env.RESEND_API_KEY?.trim() && !!process.env.SMTP_HOST?.trim();
}

export function isMailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY?.trim() || process.env.SMTP_HOST?.trim());
}

function smtpUser(): string {
  return process.env.SMTP_USER?.trim() || '';
}

function mailFrom(): string {
  const explicit = process.env.SMTP_FROM?.trim();
  if (explicit) return explicit;
  const user = smtpUser();
  if (user) return `The Forge War <${user}>`;
  return 'The Forge War <onboarding@resend.dev>';
}

function logMailFailure(kind: string, to: string, link: string, error?: string) {
  // eslint-disable-next-line no-console
  console.error(`[mail] ${kind} not delivered → ${to}${error ? `: ${error}` : ''}\n${link}`);
}

async function sendViaResend(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<MailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, error: 'resend_not_configured' };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: mailFrom(),
      to,
      subject,
      text,
      html,
    });
    if (error) return { sent: false, error: `Resend: ${error.message}` };
    return { sent: true, channel: 'resend' };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendViaSmtp(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<MailSendResult> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return { sent: false, error: 'smtp_not_configured' };

  const user = smtpUser();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) {
    return { sent: false, error: 'smtp_credentials_missing' };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === '1' || port === 465;

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      ...(host.includes('gmail.com')
        ? { tls: { minVersion: 'TLSv1.2' as const } }
        : {}),
    });
    await transport.sendMail({ from: mailFrom(), to, subject, text, html });
    return { sent: true, channel: 'smtp' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Invalid login') || msg.includes('535')) {
      return {
        sent: false,
        error:
          `${msg} — use a Google App Password (not your normal password) with 2FA enabled`,
      };
    }
    return { sent: false, error: msg };
  }
}

async function deliverMail(
  kind: string,
  to: string,
  link: string,
  subject: string,
  text: string,
  html: string,
): Promise<MailSendResult> {
  const trySmtpFirst = preferSmtp();
  const channels = trySmtpFirst
    ? ([sendViaSmtp, sendViaResend] as const)
    : ([sendViaResend, sendViaSmtp] as const);

  let lastError: string | undefined;
  for (const send of channels) {
    const result = await send(to, subject, text, html);
    if (result.sent) return result;
    lastError = result.error;
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[mail:dev] ${kind} → ${to}\n${link}`);
    return { sent: false, channel: 'log', error: lastError };
  }

  logMailFailure(kind, to, link, lastError);
  return { sent: false, error: lastError };
}

export async function sendVerificationEmail(to: string, rawToken: string): Promise<MailSendResult> {
  const link = `${webPublicOrigin()}/?verifyEmail=${encodeURIComponent(rawToken)}`;
  const subject = 'The Forge War — confirm your email';
  const text = `Confirm your email to activate your account:\n\n${link}\n\nIf you did not sign up, ignore this message.`;
  const html = `<p>Confirm your email to activate your account:</p><p><a href="${link}">${link}</a></p><p>If you did not sign up, ignore this message.</p>`;
  return deliverMail('verify', to, link, subject, text, html);
}

export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<MailSendResult> {
  const link = `${webPublicOrigin()}/?resetPassword=${encodeURIComponent(rawToken)}`;
  const subject = 'The Forge War — reset your password';
  const text = `Reset your password:\n\n${link}\n\nIf you did not request this, ignore this message.`;
  const html = `<p>Reset your password:</p><p><a href="${link}">${link}</a></p><p>If you did not request this, ignore this message.</p>`;
  return deliverMail('reset', to, link, subject, text, html);
}
