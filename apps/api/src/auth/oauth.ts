import { createPublicKey, createVerify, createHash } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

export type OauthProvider = 'google' | 'apple';

export type OauthIdentity = {
  provider: OauthProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
};

type Jwk = {
  kid?: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
};

type Jwks = { keys: Jwk[] };

const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function b64urlToBuffer(input: string) {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

function parseJwtParts(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new UnauthorizedException('invalid_oauth_token');
  const [h, p, s] = parts;
  let header: { alg?: string; kid?: string; typ?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlToBuffer(h).toString('utf8'));
    payload = JSON.parse(b64urlToBuffer(p).toString('utf8'));
  } catch {
    throw new UnauthorizedException('invalid_oauth_token');
  }
  return { header, payload, signingInput: `${h}.${p}`, signature: b64urlToBuffer(s) };
}

async function fetchJwks(url: string): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new UnauthorizedException('oauth_jwks_unavailable');
  const body = (await res.json()) as Jwks;
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(url, { at: Date.now(), keys });
  return keys;
}

function jwkToPem(jwk: Jwk) {
  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
    throw new UnauthorizedException('invalid_oauth_token');
  }
  const key = createPublicKey({
    key: { kty: 'RSA', n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
  return key;
}

async function verifyRs256(token: string, jwksUrl: string) {
  const { header, payload, signingInput, signature } = parseJwtParts(token);
  if (header.alg !== 'RS256') throw new UnauthorizedException('invalid_oauth_token');
  let keys = await fetchJwks(jwksUrl);
  let jwk = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
  if (!jwk) {
    // Force refresh once (key rotation)
    jwksCache.delete(jwksUrl);
    keys = await fetchJwks(jwksUrl);
    jwk = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
  }
  if (!jwk) throw new UnauthorizedException('invalid_oauth_token');

  const keyObject = jwkToPem(jwk);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(signingInput);
  verifier.end();
  const ok = verifier.verify(keyObject, signature);
  if (!ok) throw new UnauthorizedException('invalid_oauth_token');

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  if (exp && exp + 30 < now) throw new UnauthorizedException('invalid_oauth_token');
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : 0;
  if (nbf && nbf - 30 > now) throw new UnauthorizedException('invalid_oauth_token');

  return payload;
}

function audMatches(aud: unknown, expected: string) {
  if (typeof aud === 'string') return aud === expected;
  if (Array.isArray(aud)) return aud.includes(expected);
  return false;
}

export function oauthEnv() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
  const appleClientId = process.env.APPLE_CLIENT_ID?.trim() || '';
  return {
    googleClientId,
    appleClientId,
    google: Boolean(googleClientId),
    apple: Boolean(appleClientId),
    appleRedirectUri:
      process.env.APPLE_REDIRECT_URI?.trim() ||
      process.env.WEB_ORIGIN?.split(',')[0]?.trim() ||
      'http://localhost:3000',
  };
}

export async function verifyOauthIdToken(
  provider: OauthProvider,
  idToken: string,
): Promise<OauthIdentity> {
  const token = String(idToken || '').trim();
  if (!token) throw new BadRequestException('missing_id_token');

  const env = oauthEnv();
  if (provider === 'google') {
    if (!env.googleClientId) throw new BadRequestException('google_oauth_not_configured');
    const payload = await verifyRs256(token, 'https://www.googleapis.com/oauth2/v3/certs');
    const iss = str(payload.iss);
    if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
      throw new UnauthorizedException('invalid_oauth_token');
    }
    if (!audMatches(payload.aud, env.googleClientId)) {
      throw new UnauthorizedException('invalid_oauth_token');
    }
    const sub = str(payload.sub);
    if (!sub) throw new UnauthorizedException('invalid_oauth_token');
    const email = str(payload.email)?.toLowerCase();
    if (!email) throw new UnauthorizedException('oauth_email_required');
    if (payload.email_verified === false || payload.email_verified === 'false') {
      throw new UnauthorizedException('oauth_email_unverified');
    }
    const name = str(payload.name) || str(payload.given_name);
    return {
      provider: 'google',
      subject: sub,
      email,
      emailVerified: true,
      displayName: name,
    };
  }

  if (provider === 'apple') {
    if (!env.appleClientId) throw new BadRequestException('apple_oauth_not_configured');
    const payload = await verifyRs256(token, 'https://appleid.apple.com/auth/keys');
    if (str(payload.iss) !== 'https://appleid.apple.com') {
      throw new UnauthorizedException('invalid_oauth_token');
    }
    if (!audMatches(payload.aud, env.appleClientId)) {
      throw new UnauthorizedException('invalid_oauth_token');
    }
    const sub = str(payload.sub);
    if (!sub) throw new UnauthorizedException('invalid_oauth_token');
    const emailRaw = str(payload.email)?.toLowerCase();
    const email =
      emailRaw ||
      `apple.${createHash('sha256').update(sub).digest('hex').slice(0, 20)}@priv.local`;
    return {
      provider: 'apple',
      subject: sub,
      email,
      emailVerified: payload.email_verified !== false && payload.email_verified !== 'false',
      displayName: null,
    };
  }

  throw new BadRequestException('invalid_provider');
}
