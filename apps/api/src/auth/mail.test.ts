import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMailConfigured, preferSmtp } from './mail';

describe('mail config', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it('prefers SMTP when MAIL_PREFER_SMTP=1', () => {
    process.env.MAIL_PREFER_SMTP = '1';
    process.env.RESEND_API_KEY = 're_test';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    expect(preferSmtp()).toBe(true);
  });

  it('uses SMTP when Resend key absent', () => {
    delete process.env.MAIL_PREFER_SMTP;
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = 'smtp.gmail.com';
    expect(preferSmtp()).toBe(true);
    expect(isMailConfigured()).toBe(true);
  });
});
