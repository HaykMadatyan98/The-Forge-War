/** Normalize NEXT_PUBLIC_API_URL so it always ends with /v1 (common deploy typo). */
export function getApiV1Url(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/v1';
  const trimmed = raw.replace(/\/$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

/** API host without /v1 — used for Socket.IO. */
export function getApiOrigin(): string {
  return getApiV1Url().replace(/\/v1\/?$/, '');
}
