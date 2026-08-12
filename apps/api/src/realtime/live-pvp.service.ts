import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

export type LiveMatch = {
  id: string;
  playerA: string;
  playerB: string;
  createdAt: number;
  status: 'waiting' | 'active' | 'finished';
  winnerId?: string;
};

@Injectable()
export class LivePvpService {
  private queue: string[] = [];
  private matches = new Map<string, LiveMatch>();
  private playerMatch = new Map<string, string>();

  joinQueue(playerId: string): { status: 'queued' } | { status: 'matched'; matchId: string; opponentId: string } {
    if (this.playerMatch.has(playerId)) {
      const mid = this.playerMatch.get(playerId)!;
      const m = this.matches.get(mid);
      if (m && m.status !== 'finished') {
        const opp = m.playerA === playerId ? m.playerB : m.playerA;
        return { status: 'matched', matchId: mid, opponentId: opp };
      }
    }

    const idx = this.queue.indexOf(playerId);
    if (idx >= 0) this.queue.splice(idx, 1);
    this.queue.push(playerId);

    if (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;
      const matchId = randomBytes(8).toString('hex');
      const match: LiveMatch = {
        id: matchId,
        playerA: a,
        playerB: b,
        createdAt: Date.now(),
        status: 'active',
      };
      this.matches.set(matchId, match);
      this.playerMatch.set(a, matchId);
      this.playerMatch.set(b, matchId);
      return { status: 'matched', matchId, opponentId: b };
    }

    return { status: 'queued' };
  }

  leaveQueue(playerId: string) {
    this.queue = this.queue.filter((id) => id !== playerId);
    const mid = this.playerMatch.get(playerId);
    if (mid) {
      const m = this.matches.get(mid);
      if (m && m.status === 'waiting') {
        this.matches.delete(mid);
        this.playerMatch.delete(m.playerA);
        this.playerMatch.delete(m.playerB);
      }
    }
    return { ok: true };
  }

  finishMatch(matchId: string, winnerId: string) {
    const m = this.matches.get(matchId);
    if (!m) return null;
    m.status = 'finished';
    m.winnerId = winnerId;
    this.playerMatch.delete(m.playerA);
    this.playerMatch.delete(m.playerB);
    return m;
  }

  getMatch(matchId: string) {
    return this.matches.get(matchId) || null;
  }

  getMatchForPlayer(playerId: string) {
    const mid = this.playerMatch.get(playerId);
    if (!mid) return null;
    return this.matches.get(mid) || null;
  }
}
