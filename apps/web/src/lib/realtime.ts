'use client';

import { io, Socket } from 'socket.io-client';
import { getAuthToken } from './api';
import { getApiOrigin } from './apiBase';

const API_BASE = getApiOrigin();

let socket: Socket | null = null;

export function getRealtimeSocket(): Socket {
  if (!socket) {
    socket = io(`${API_BASE}/realtime`, {
      auth: { token: getAuthToken() },
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}

export function connectRealtime() {
  const s = getRealtimeSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectRealtime() {
  socket?.disconnect();
}

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
};
