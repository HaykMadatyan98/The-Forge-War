'use client';

import { useEffect, useState } from 'react';
import { fetchAdminPlayers, fetchAdminStats, setAdminRole, type PublicPlayer } from '@/lib/api';
import Link from 'next/link';

export default function AdminPage() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [s, p] = await Promise.all([fetchAdminStats(), fetchAdminPlayers()]);
        setStats(s);
        setPlayers(p.players);
      } catch (e: any) {
        setError(e?.message || 'admin_denied');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="screen boot"><p>Loading admin…</p></div>;
  if (error) {
    return (
      <div className="screen boot">
        <div className="boot-card">
          <h1>Admin</h1>
          <p className="muted">{error}</p>
          <Link href="/">← Back to game</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="screen boot">
      <div className="boot-card" style={{ width: 'min(720px, 100%)', textAlign: 'left' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>Admin</h1>
          <Link href="/">← Game</Link>
        </div>
        {stats ? (
          <div className="grid-cards" style={{ marginBottom: '1.5rem' }}>
            {Object.entries(stats).filter(([k]) => k !== 'time').map(([k, v]) => (
              <div key={k} className="card">
                <strong>{k}</strong>
                <div>{v}</div>
              </div>
            ))}
          </div>
        ) : null}
        <h2>Players</h2>
        <div className="admin-table">
          {players.map((p) => (
            <div key={p.id} className="row admin-row" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
              <span style={{ flex: 1 }}>{p.displayName || p.email}</span>
              <span className="muted" style={{ fontSize: '0.8rem' }}>{p.role || 'user'}</span>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  void setAdminRole(p.id, p.role === 'admin' ? 'user' : 'admin').then(async () => {
                    const refreshed = await fetchAdminPlayers();
                    setPlayers(refreshed.players);
                  })
                }
              >
                {p.role === 'admin' ? 'Demote' : 'Promote'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
