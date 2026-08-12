/**
 * Transactional email. Logs links in non-production when SMTP missing.
 * Production: assertProductionConfig requires SMTP (unless REQUIRE_SMTP=0).
 */
import nodemailer from 'nodemailer';

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

export async function sendVerificationEmail(to: string, rawToken: string): Promise<void> {
  const link = `${webPublicOrigin()}/?verifyEmail=${encodeURIComponent(rawToken)}`;
  const subject = 'The Forge War — confirm your email';
  const text = `Confirm your email to activate your account:\n\n${link}\n\nIf you did not sign up, ignore this message.`;
  const html = `<p>Confirm your email to activate your account:</p><p><a href="${link}">${link}</a></p><p>If you did not sign up, ignore this message.</p>`;

  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[mail:dev] verify → ${to}\n${link}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[mail] SMTP not configured — cannot send to ${to}`);
    }
    return;
  }

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || 'noreply@localhost';
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
}
