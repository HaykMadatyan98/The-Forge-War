/**
 * Account avatars: 5 unique painted faces, or a client-compressed data-URL upload.
 */

export const AVATAR_KEYS = ['p0', 'p1', 'p2', 'p3', 'p4'] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

/** Public paths for the five distinct portraits (face_w0…w4). */
export const AVATAR_PRESET_SRC: Record<AvatarKey, string> = {
  p0: '/art/portraits/face_w0.png',
  p1: '/art/portraits/face_w1.png',
  p2: '/art/portraits/face_w2.png',
  p3: '/art/portraits/face_w3.png',
  p4: '/art/portraits/face_w4.png',
};

export function isAvatarKey(v: unknown): v is AvatarKey {
  return typeof v === 'string' && (AVATAR_KEYS as readonly string[]).includes(v);
}

/** Accept preset p0–p4, legacy a1–a12, or data-URL custom image. */
export function isAvatarValue(v: unknown): boolean {
  if (typeof v !== 'string' || !v.trim()) return false;
  const s = v.trim();
  if (isAvatarKey(s)) return true;
  if (/^a([1-9]|1[0-2])$/.test(s)) return true;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(s) && s.length <= 120_000) return true;
  return false;
}

/** Map any stored avatar to a resolvable image URL (relative or data). */
export function avatarSrc(avatarKey: string | null | undefined, fallback: AvatarKey = 'p0'): string {
  if (!avatarKey) return AVATAR_PRESET_SRC[fallback];
  const s = avatarKey.trim();
  if (s.startsWith('data:image/')) return s;
  if (isAvatarKey(s)) return AVATAR_PRESET_SRC[s];
  const leg = /^a(\d+)$/i.exec(s);
  if (leg) {
    const n = (Math.max(1, Number(leg[1])) - 1) % 5;
    return AVATAR_PRESET_SRC[`p${n}` as AvatarKey];
  }
  return AVATAR_PRESET_SRC[fallback];
}

/** Seed for 3D warriors when needed (from preset index). Custom → 0. */
export function avatarSeed(avatarKey: string | null | undefined, fallback = 0): number {
  if (!avatarKey) return fallback;
  const s = avatarKey.trim();
  if (isAvatarKey(s)) return Number(s[1]);
  const leg = /^a(\d+)$/i.exec(s);
  if (leg) return (Math.max(1, Number(leg[1])) - 1) % 5;
  if (s.startsWith('data:image/')) return fallback;
  return fallback;
}

/** Normalize for API storage. Returns null if invalid. */
export function normalizeAvatarValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (isAvatarKey(s)) return s;
  const leg = /^a(\d+)$/i.exec(s);
  if (leg) {
    const n = (Math.max(1, Number(leg[1])) - 1) % 5;
    return `p${n}`;
  }
  if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(s) && s.length >= 32 && s.length <= 120_000) {
    return s;
  }
  return null;
}

export function normalizeDisplayName(raw: unknown): string | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 24);
  if (s.length < 2) return null;
  return s;
}
