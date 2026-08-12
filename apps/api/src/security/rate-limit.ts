import type { NextFunction, Request, Response } from 'express';

type Bucket = number[];

const hits = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  if (Array.isArray(xf) && xf[0]) return xf[0].split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function prune(bucket: Bucket, windowMs: number, now: number) {
  const cut = now - windowMs;
  while (bucket.length && bucket[0] < cut) bucket.shift();
}

function limited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = hits.get(key);
  if (!bucket) {
    bucket = [];
    hits.set(key, bucket);
  }
  prune(bucket, windowMs, now);
  if (bucket.length >= limit) return true;
  bucket.push(now);
  return false;
}

/** Garbage-collect empty buckets occasionally */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of hits) {
    prune(b, 15 * 60_000, now);
    if (!b.length) hits.delete(k);
  }
}, 5 * 60_000).unref?.();

type Rule = { prefix: string; methods?: string[]; limit: number; windowMs: number };

const RULES: Rule[] = [
  { prefix: '/v1/auth/register', methods: ['POST'], limit: 5, windowMs: 60_000 },
  { prefix: '/v1/auth/login', methods: ['POST'], limit: 10, windowMs: 60_000 },
  { prefix: '/v1/auth/oauth', methods: ['POST'], limit: 15, windowMs: 60_000 },
  { prefix: '/v1/auth/resend-verification', methods: ['POST'], limit: 5, windowMs: 60_000 },
  { prefix: '/v1/auth/verify-email', methods: ['POST'], limit: 20, windowMs: 60_000 },
  { prefix: '/v1/player/save', limit: 40, windowMs: 60_000 },
  { prefix: '/v1/pvp/challenge', methods: ['POST'], limit: 20, windowMs: 60_000 },
  { prefix: '/v1/pvp/result', methods: ['POST'], limit: 30, windowMs: 60_000 },
  { prefix: '/v1/pvp/defense', methods: ['PUT'], limit: 20, windowMs: 60_000 },
  { prefix: '/v1/', limit: 240, windowMs: 60_000 },
];

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = (req.originalUrl || req.url || req.path || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();
  const ip = clientIp(req);

  for (const rule of RULES) {
    if (!path.startsWith(rule.prefix)) continue;
    if (rule.methods && !rule.methods.includes(method)) continue;
    const key = `${ip}|${rule.prefix}|${rule.methods ? method : '*'}`;
    if (limited(key, rule.limit, rule.windowMs)) {
      res.status(429).json({ statusCode: 429, message: 'rate_limited', error: 'Too Many Requests' });
      return;
    }
  }
  next();
}
