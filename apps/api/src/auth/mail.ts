/**
 * Transactional email via Resend (preferred) or SMTP fallback.
 * Logs links in non-production when neither is configured.
 */
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

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
  return true; // dev convenience
}

export function isMailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY?.trim() || process.env.SMTP_HOST?.trim());
}

function mailFrom(): string {
  return process.env.SMTP_FROM?.trim() || 'The Forge War <onboarding@resend.dev>';
}

async function sendViaResend(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: mailFrom(),
    to,
    subject,
    text,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return true;
}

async function sendViaSmtp(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return false;

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = mailFrom();
  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS required when SMTP_HOST is set');
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === '1' || port === 465;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  await transport.sendMail({ from, to, subject, text, html });
  return true;
}

export async function sendVerificationEmail(to: string, rawToken: string): Promise<void> {
  const link = `${webPublicOrigin()}/?verifyEmail=${encodeURIComponent(rawToken)}`;
  const subject = 'The Forge War — confirm your email';
  const text = `Confirm your email to activate your account:\n\n${link}\n\nIf you did not sign up, ignore this message.`;
  const html = `<p>Confirm your email to activate your account:</p><p><a href="${link}">${link}</a></p><p>If you did not sign up, ignore this message.</p>`;

  if (await sendViaResend(to, subject, text, html)) return;
  if (await sendViaSmtp(to, subject, text, html)) return;

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[mail:dev] verify → ${to}\n${link}`);
  } else {
    // eslint-disable-next-line no-console
    console.error(`[mail] mail not configured — cannot send to ${to}`);
  }
}
