'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  acceptFriend,
  fetchChatThread,
  fetchFriends,
  fetchPendingFriends,
  removeFriendByPlayer,
  sendChatMessage,
  sendFriendRequest,
  type ChatMessage,
  type FriendEntry,
  type PendingFriends,
} from '@/lib/api';
import { connectRealtime, type ChatMessageEvent } from '@/lib/realtime';
import { AccountAvatar } from './AccountAvatar';
import { t } from '@tfw/game';

export function SocialPanel({
  playerId,
  flash,
}: {
  playerId: string;
  flash: (m: string) => void;
}) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [pending, setPending] = useState<PendingFriends>({ incoming: [], outgoing: [] });
  const [selected, setSelected] = useState<FriendEntry | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [addId, setAddId] = useState('');
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [f, p] = await Promise.all([fetchFriends(), fetchPendingFriends()]);
      setFriends(f.friends);
      setPending(p);
    } catch {
      flash(t('socialLoadFail') || 'Could not load friends');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const sock = connectRealtime();
    const onMsg = (msg: ChatMessageEvent) => {
      if (!selected) return;
      if (msg.senderId === selected.player.id || msg.receiverId === selected.player.id) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    sock.on('chat:message', onMsg);
    return () => {
      sock.off('chat:message', onMsg);
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    void fetchChatThread(selected.player.id).then((r) => setMessages(r.messages));
  }, [selected]);

  async function send() {
    if (!selected || !draft.trim()) return;
    try {
      await sendChatMessage(selected.player.id, draft.trim());
      setDraft('');
      const r = await fetchChatThread(selected.player.id);
      setMessages(r.messages);
    } catch {
      flash(t('chatSendFail') || 'Send failed');
    }
  }

  return (
    <div className="social-panel">
      <div className="panel-header">
        <div>
          <h2>{t('social') || 'Social'}</h2>
          <p className="muted">{t('friendsAndChat') || 'Friends & chat'}</p>
        </div>
        <button type="button" className="ghost" disabled={loading} onClick={() => void reload()}>
          {t('refresh') || 'Refresh'}
        </button>
      </div>

      <div className="social-add row" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder={t('friendPlayerId') || 'Player ID'}
          value={addId}
          onChange={(e) => setAddId(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="primary"
          onClick={() =>
            void sendFriendRequest(addId.trim())
              .then(() => {
                setAddId('');
                flash(t('friendRequestSent') || 'Request sent');
                return reload();
              })
              .catch(() => flash(t('friendRequestFail') || 'Request failed'))
          }
        >
          {t('addFriend') || 'Add'}
        </button>
      </div>

      {pending.incoming.length > 0 ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h3>{t('friendRequests') || 'Requests'}</h3>
          {pending.incoming.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <span>{r.player.displayName || r.player.email}</span>
              <button type="button" className="primary" onClick={() => void acceptFriend(r.id).then(reload)}>
                {t('accept') || 'Accept'}
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <div className="social-grid">
        <div className="social-list">
          <h3>{t('friends') || 'Friends'}</h3>
          {friends.length === 0 ? <p className="muted">{t('noFriends') || 'No friends yet'}</p> : null}
          {friends.map((f) => (
            <button
              key={f.player.id}
              type="button"
              className={`social-friend${selected?.player.id === f.player.id ? ' active' : ''}`}
              onClick={() => setSelected(f)}
            >
              <AccountAvatar avatarKey={f.player.avatarKey} name={f.player.displayName || f.player.email} size={32} />
              <span>{f.player.displayName || f.player.email}</span>
            </button>
          ))}
        </div>

        <div className="social-chat card">
          {selected ? (
            <>
              <h3>{selected.player.displayName || selected.player.email}</h3>
              <div className="social-messages">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`social-msg${m.senderId === playerId ? ' mine' : ''}`}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              <div className="row" style={{ gap: '0.5rem', marginTop: '0.75rem' }}>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('chatPlaceholder') || 'Message…'}
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void send();
                  }}
                />
                <button type="button" className="primary" onClick={() => void send()}>
                  {t('send') || 'Send'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    void removeFriendByPlayer(selected.player.id)
                      .then(() => {
                        setSelected(null);
                        return reload();
                      })
                      .catch(() => flash(t('friendRequestFail') || 'Remove failed'))
                  }
                  title={t('removeFriend') || 'Remove'}
                >
                  ×
                </button>
              </div>
            </>
          ) : (
            <p className="muted">{t('pickFriend') || 'Select a friend to chat'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
