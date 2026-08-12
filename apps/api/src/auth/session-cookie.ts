import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'tfw_session';

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === '0') return false;
  if (process.env.COOKIE_SECURE === '1') return true;
  return isProduction();
}

export function cookieSameSite(): 'Lax' | 'Strict' | 'None' {
  const v = (process.env.COOKIE_SAMESITE || (isProduction() ? 'None' : 'Lax')).toLowerCase();
  if (v === 'strict') return 'Strict';
  if (v === 'none') return 'None';
  return 'Lax';
}

/** When false (production default), raw token is only in HttpOnly cookie — not JSON body. */
export function returnAuthTokenInBody(): boolean {
  if (process.env.RETURN_AUTH_TOKEN === '1') return true;
  if (process.env.RETURN_AUTH_TOKEN === '0') return false;
  return !isProduction();
}

function parseCookieHeader(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function bearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m ? m[1].trim() : null;
}

/** Prefer Authorization bearer, then HttpOnly session cookie. */
export function extractSessionToken(req: Request): string | null {
  const b = bearerToken(req.headers.authorization);
  if (b) return b;
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

function cookieHeader(value: string, expiresAt?: Date) {
  const sameSite = cookieSameSite();
  const secure = cookieSecure() || sameSite === 'None';
  const domain = process.env.COOKIE_DOMAIN?.trim();
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  if (expiresAt) parts.push(`Expires=${expiresAt.toUTCString()}`);
  else parts.push('Max-Age=0');
  return parts.join('; ');
}

export function setSessionCookie(res: Response, rawToken: string, expiresAt: Date) {
  res.append('Set-Cookie', cookieHeader(rawToken, expiresAt));
}

export function clearSessionCookie(res: Response) {
  res.append('Set-Cookie', cookieHeader('', new Date(0)));
}

export function attachAuthSession(res: Response, token: string, expiresAt: Date) {
  setSessionCookie(res, token, expiresAt);
}
