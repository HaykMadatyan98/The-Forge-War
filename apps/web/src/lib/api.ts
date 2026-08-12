const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/v1';

const TOKEN_KEY = 'tfw_auth_token';
const SESSION_HINT = 'tfw_has_session';

export type PublicPlayer = {
  id: string;
  email: string;
  displayName: string | null;
  avatarKey: string | null;
  emailVerified?: boolean;
  createdAt?: string;
};

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function markSession(active: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (active) localStorage.setItem(SESSION_HINT, '1');
    else localStorage.removeItem(SESSION_HINT);
  } catch {
    /* ignore */
  }
  if (!active) setAuthToken(null);
}

export function isSessionActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(SESSION_HINT) === '1') return true;
  } catch {
    /* ignore */
  }
  return !!getAuthToken();
}

function authHeaders(json = true): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const t = getAuthToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

const cred: RequestCredentials = 'include';

async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: cred,
    headers: {
      ...authHeaders(init.method !== 'GET' && init.method !== 'HEAD'),
      ...(init.headers || {}),
    },
  });
}

export async function apiHealth() {
  const res = await fetch(`${API_URL}/health`, { cache: 'no-store', credentials: cred });
  if (!res.ok) throw new Error('api unhealthy');
  return res.json();
}

function parseError(data: any, fallback: string) {
  const msg =
    (typeof data?.message === 'string' && data.message) ||
    (Array.isArray(data?.message) && data.message[0]) ||
    fallback;
  return Object.assign(new Error(msg), { data, status: data?.statusCode });
}

function acceptSession(data: { token?: string; cookieAuth?: boolean }) {
  markSession(true);
  if (data.token) setAuthToken(data.token);
}

export async function registerPlayer(body: {
  email: string;
  password: string;
  displayName?: string;
  avatarKey?: string;
}) {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      avatarKey: body.avatarKey,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw parseError(data, 'register_failed');
  return data as {
    ok: true;
    needsVerification: true;
    email: string;
    message: string;
    devVerifyToken?: string;
  };
}

export async function loginPlayer(body: { email: string; password: string }) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: body.email,
      password: body.password,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw parseError(data, 'login_failed');
  acceptSession(data);
  return data as { token?: string; expiresAt: string; player: PublicPlayer; cookieAuth?: boolean };
}

export async function verifyEmailToken(token: string) {
  const res = await apiFetch('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw parseError(data, 'verify_failed');
  acceptSession(data);
  return data as { token?: string; expiresAt: string; player: PublicPlayer; cookieAuth?: boolean };
}

export async function resendVerification(email: string) {
  const res = await apiFetch('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw parseError(data, 'resend_failed');
  return data as { ok: true; message: string; devVerifyToken?: string };
}

export type OauthConfig = {
  google: boolean;
  apple: boolean;
  googleClientId: string | null;
  appleClientId: string | null;
  appleRedirectUri: string | null;
};

export async function fetchOauthConfig(): Promise<OauthConfig> {
  try {
    const res = await fetch(`${API_URL}/auth/oauth-config`, { cache: 'no-store', credentials: cred });
    if (!res.ok) {
      return { google: false, apple: false, googleClientId: null, appleClientId: null, appleRedirectUri: null };
    }
    return res.json();
  } catch {
    return { google: false, apple: false, googleClientId: null, appleClientId: null, appleRedirectUri: null };
  }
}

export async function oauthLogin(body: {
  provider: 'google' | 'apple';
  idToken: string;
  displayName?: string;
}) {
  const res = await apiFetch('/auth/oauth', {
    method: 'POST',
    body: JSON.stringify({
      provider: body.provider,
      idToken: body.idToken,
      displayName: body.displayName,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw parseError(data, 'oauth_failed');
  acceptSession(data);
  return data as { token?: string; expiresAt: string; player: PublicPlayer; cookieAuth?: boolean };
}

export async function logoutPlayer() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    /* offline */
  }
  markSession(false);
}

export async function fetchMe() {
  if (!isSessionActive() && !getAuthToken()) {
    // still try cookie session once
  }
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: authHeaders(false),
    cache: 'no-store',
    credentials: cred,
  });
  if (res.status === 401) {
    markSession(false);
    return null;
  }
  if (!res.ok) return null;
  markSession(true);
  return res.json() as Promise<{ player: PublicPlayer }>;
}

export async function updateProfile(body: { displayName?: string; avatarKey?: string }) {
  const res = await apiFetch('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw parseError(data, 'profile_failed');
  return data as { player: PublicPlayer };
}

export type PvpOpponent = {
  playerId: string;
  displayName: string;
  avatarKey: string | null;
  power: number;
  wins: number;
  losses: number;
  warriorCount: number;
  rosterPreview?: { name: string; level: number }[];
  squad: { warriors: any[]; items: Record<string, any>; power?: number };
};

export async function putPvpDefense() {
  const res = await apiFetch('/pvp/defense', {
    method: 'PUT',
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw parseError(data, 'defense_failed');
  return data as { ok: boolean; power: number; wins: number; losses: number; updatedAt?: string };
}

export async function fetchPvpOpponents(limit = 8, myPower?: number) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (myPower != null && myPower > 0) q.set('myPower', String(Math.round(myPower)));
  const res = await fetch(`${API_URL}/pvp/opponents?${q}`, {
    headers: authHeaders(false),
    cache: 'no-store',
    credentials: cred,
  });
  if (!res.ok) return { opponents: [] as PvpOpponent[] };
  return res.json() as Promise<{ opponents: PvpOpponent[] }>;
}

export async function fetchMyPvp() {
  const res = await fetch(`${API_URL}/pvp/me`, {
    headers: authHeaders(false),
    cache: 'no-store',
    credentials: cred,
  });
  if (!res.ok) return { defense: null };
  return res.json() as Promise<{
    defense: null | {
      power: number;
      wins: number;
      losses: number;
      updatedAt: string;
      displayName?: string | null;
      avatarKey?: string | null;
    };
  }>;
}

export async function startPvpChallenge(opponentId: string) {
  const res = await apiFetch('/pvp/challenge', {
    method: 'POST',
    body: JSON.stringify({ opponentId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw parseError(data, 'challenge_failed');
  return data as {
    matchId: string;
    expiresAt: string;
    opponent: PvpOpponent;
  };
}

export async function reportPvpResult(matchId: string, victory: boolean) {
  try {
    await apiFetch('/pvp/result', {
      method: 'POST',
      body: JSON.stringify({ matchId, victory }),
    });
  } catch {
    /* offline */
  }
}

/** Cloud save — authenticated player only. */
export async function pushSave(save: unknown) {
  if (!isSessionActive() && !getAuthToken()) return { skipped: true as const };
  const res = await apiFetch('/player/save', {
    method: 'PUT',
    body: JSON.stringify(save),
  });
  if (res.status === 409) return { conflict: true as const, body: await res.json() };
  if (res.status === 401) {
    markSession(false);
    return { unauthorized: true as const };
  }
  if (!res.ok) return { error: true as const };
  return res.json();
}

export async function pullSave() {
  if (!isSessionActive() && !getAuthToken()) return { save: null as unknown };
  const res = await fetch(`${API_URL}/player/save`, {
    headers: authHeaders(false),
    cache: 'no-store',
    credentials: cred,
  });
  if (!res.ok) return { save: null as unknown };
  return res.json() as Promise<{ save: unknown }>;
}

// Re-export for GameShell persist checks
export { getAuthToken as getAuthTokenLegacy };
