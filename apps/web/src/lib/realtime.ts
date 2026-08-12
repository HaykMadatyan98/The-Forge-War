'use client';

import { io, Socket } from 'socket.io-client';
import { getAuthToken } from './api';
import { getApiOrigin } from './apiBase';

const API_BASE = getApiOrigin();

export const LIVE_QUEUE_TIMEOUT_MS = 90_000;

export type RealtimeStatus = {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  lastError: string | null;
  reconnectAttempts: number;
  connectedAt: number | null;
  disconnectedAt: number | null;
};

export type ChatMessageEvent = {
  id: string;
  body: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
  sender?: { id: string; displayName: string | null; avatarKey: string | null };
};

export type LiveMatchedEvent = {
  matchId: string;
  opponentId: string;
  youAre?: 'A' | 'B';
  opponent?: {
    warriors: any[];
    items: Record<string, any>;
    power: number;
    displayName: string;
    avatarKey: string | null;
  };
};

let socket: Socket | null = null;
let wired = false;
const statusListeners = new Set<(s: RealtimeStatus) => void>();

const status: RealtimeStatus = {
  connected: false,
  connecting: false,
  reconnecting: false,
  lastError: null,
  reconnectAttempts: 0,
  connectedAt: null,
  disconnectedAt: null,
};

function emitStatus() {
  for (const fn of statusListeners) fn({ ...status });
}

export function getRealtimeStatus(): RealtimeStatus {
  return { ...status };
}

export function subscribeRealtimeStatus(fn: (s: RealtimeStatus) => void) {
  statusListeners.add(fn);
  fn({ ...status });
  return () => {
    statusListeners.delete(fn);
  };
}

function wireSocket(s: Socket) {
  if (wired) return;
  wired = true;

  s.on('connect', () => {
    status.connected = true;
    status.connecting = false;
    status.reconnecting = false;
    status.lastError = null;
    status.connectedAt = Date.now();
    status.disconnectedAt = null;
    emitStatus();
  });

  s.on('disconnect', (reason) => {
    status.connected = false;
    status.connecting = false;
    status.disconnectedAt = Date.now();
    status.lastError = reason || 'disconnect';
    emitStatus();
  });

  s.on('connect_error', (err) => {
    status.connected = false;
    status.connecting = false;
    status.lastError = err?.message || 'connect_error';
    emitStatus();
  });

  s.io.on('reconnect_attempt', (attempt) => {
    status.reconnecting = true;
    status.reconnectAttempts = attempt;
    emitStatus();
  });

  s.io.on('reconnect', () => {
    status.reconnecting = false;
    status.reconnectAttempts = 0;
    emitStatus();
  });

  s.io.on('reconnect_failed', () => {
    status.reconnecting = false;
    status.lastError = 'reconnect_failed';
    emitStatus();
  });
}

export function getRealtimeSocket(): Socket {
  if (!socket) {
    socket = io(`${API_BASE}/realtime`, {
      auth: { token: getAuthToken() },
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1200,
      reconnectionDelayMax: 8000,
      timeout: 12_000,
    });
    wireSocket(socket);
  }
  return socket;
}

export function connectRealtime() {
  const s = getRealtimeSocket();
  s.auth = { ...(s.auth || {}), token: getAuthToken() };
  if (!s.connected && !s.active) {
    status.connecting = true;
    emitStatus();
    s.connect();
  }
  return s;
}

export function reconnectRealtime() {
  const s = getRealtimeSocket();
  s.auth = { ...(s.auth || {}), token: getAuthToken() };
  if (s.connected) s.disconnect();
  status.connecting = true;
  status.lastError = null;
  emitStatus();
  s.connect();
  return s;
}

export function disconnectRealtime() {
  if (!socket) return;
  socket.disconnect();
  status.connected = false;
  status.connecting = false;
  status.reconnecting = false;
  status.disconnectedAt = Date.now();
  emitStatus();
}
