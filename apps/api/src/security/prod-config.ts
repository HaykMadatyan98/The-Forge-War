/**
 * Fail-fast production configuration checks.
 */
import { isProduction } from '../auth/session-cookie';
import { allowDevEmailToken } from '../auth/mail';

export function assertProductionConfig() {
  if (!isProduction()) return;

  const errors: string[] = [];

  if (!process.env.DATABASE_URL?.trim()) {
    errors.push('DATABASE_URL is required');
  }
  if (process.env.DATABASE_URL?.includes('tfw:tfw@') || process.env.DATABASE_URL?.includes('tfw_local_dev_only')) {
    errors.push('DATABASE_URL still uses a local/dev password — set a strong production password');
  }

  const origins = (process.env.WEB_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!origins.length) {
    errors.push('WEB_ORIGIN must list exact browser origin(s), e.g. https://game.example.com');
  }
  for (const o of origins) {
    if (o.includes('localhost') || o.includes('127.0.0.1')) {
      errors.push(`WEB_ORIGIN must not use localhost in production (${o})`);
    }
    if (!o.startsWith('https://') && process.env.ALLOW_HTTP_ORIGIN !== '1') {
      errors.push(`WEB_ORIGIN should be https in production (${o}); set ALLOW_HTTP_ORIGIN=1 to override`);
    }
  }

  if (process.env.ALLOW_DEV_EMAIL_TOKEN === '1') {
    errors.push('ALLOW_DEV_EMAIL_TOKEN=1 is forbidden in production');
  }
  if (allowDevEmailToken()) {
    errors.push('Dev email tokens must be disabled in production');
  }

  if (!process.env.SMTP_HOST?.trim() && process.env.REQUIRE_SMTP !== '0') {
    errors.push(
      'SMTP_HOST is required in production for email verification (set REQUIRE_SMTP=0 only for emergency)',
    );
  }

  if (errors.length) {
    // eslint-disable-next-line no-console
    console.error('[tfw] Production config errors:\n - ' + errors.join('\n - '));
    throw new Error('Invalid production configuration');
  }
}
