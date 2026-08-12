'use client';

import { useState } from 'react';
import { hubTabUnlocked, type HubTabId } from '@tfw/game';
import { t } from '@tfw/game';
import { AccountAvatar } from './AccountAvatar';
import type { PublicPlayer } from '@/lib/api';

export type HubTab = HubTabId;

type NavItem = { id: HubTab; label: string; icon: string };

const FIGHT_TABS: NavItem[] = [
  { id: 'campaign', label: 'campaign', icon: '⚔' },
  { id: 'quests', label: 'quests', icon: '✦' },
  { id: 'arena', label: 'pvp', icon: '◈' },
];

const BASE_TABS: NavItem[] = [
  { id: 'mine', label: 'mine', icon: '⛏' },
  { id: 'forge', label: 'forge', icon: '⚒' },
  { id: 'research', label: 'research', icon: '◎' },
  { id: 'barracks', label: 'barracks', icon: '⛨' },
  { id: 'tavern', label: 'tavern', icon: '⌂' },
  { id: 'inventory', label: 'inventory', icon: '▣' },
];

const ACCOUNT_TABS: NavItem[] = [
  { id: 'social', label: 'social', icon: '☍' },
  { id: 'profile', label: 'profileTab', icon: '☺' },
];

function visibleItems(items: NavItem[], state: any) {
  return items.filter((item) => hubTabUnlocked(state, item.id));
}

export function HubNav({
  hubTab,
  setHubTab,
  state,
  player,
  onboardingTarget,
  onSettings,
}: {
  hubTab: HubTab;
  setHubTab: (tab: HubTab) => void;
  state: any;
  player: PublicPlayer | null;
  onboardingTarget?: HubTab | null;
  onSettings: () => void;
}) {
  const [sheet, setSheet] = useState<'base' | 'more' | null>(null);

  function pick(tab: HubTab) {
    if (!hubTabUnlocked(state, tab)) return;
    setHubTab(tab);
    setSheet(null);
  }

  function navBtn(item: NavItem) {
    const locked = !hubTabUnlocked(state, item.id);
    const active = hubTab === item.id;
    const highlight = onboardingTarget === item.id;
    return (
      <button
        key={item.id}
        type="button"
        data-hub-tab={item.id}
        className={`hub-nav-item ${active ? 'active' : ''} ${highlight ? 'onboarding-target' : ''} ${locked ? 'locked' : ''}`}
        disabled={locked}
        title={locked ? t('onboardingTabLocked') : undefined}
        onClick={() => pick(item.id)}
      >
        <span className="hub-nav-ico" aria-hidden>
          {item.icon}
        </span>
        <span className="hub-nav-label">{t(item.label)}</span>
      </button>
    );
  }

  const fight = visibleItems(FIGHT_TABS, state);
  const base = visibleItems(BASE_TABS, state);
  const account = visibleItems(ACCOUNT_TABS, state);

  return (
    <>
      <nav className="hub-nav hub-nav-desktop" aria-label={t('hubNavLabel')}>
        <div className="hub-brand-block">
          <div className="hub-brand">{t('gameTitle')}</div>
          <div className="hub-brand-tag muted">Hub</div>
        </div>

        <div className="hub-nav-scroll">
          {fight.length ? (
            <div className="hub-nav-group">
              <div className="hub-nav-group-label muted">{t('hubGroupFight')}</div>
              {fight.map((item) => navBtn(item))}
            </div>
          ) : null}

          {base.length ? (
            <div className="hub-nav-group">
              <div className="hub-nav-group-label muted">{t('hubGroupBase')}</div>
              {base.map((item) => navBtn(item))}
            </div>
          ) : null}

          {account.length ? (
            <div className="hub-nav-group">
              <div className="hub-nav-group-label muted">{t('hubGroupAccount')}</div>
              {account.map((item) => navBtn(item))}
            </div>
          ) : null}
        </div>

        <div className="hub-nav-footer">
          {player ? (
            <button type="button" className="hub-player-chip" onClick={() => pick('profile')}>
              <AccountAvatar avatarKey={player.avatarKey} name={player.displayName || '?'} size={28} />
              <span className="hub-player-name">{player.displayName || player.email.split('@')[0]}</span>
            </button>
          ) : null}
          {player?.role === 'admin' ? (
            <a href="/admin" className="ghost hub-nav-foot">
              Admin
            </a>
          ) : null}
          <button type="button" className="ghost hub-nav-foot" onClick={onSettings}>
            {t('settings')}
          </button>
        </div>
      </nav>

      <nav className="hub-nav-mobile-bar" aria-label={t('hubNavLabel')}>
        <button
          type="button"
          data-hub-tab="campaign"
          className={`hub-mobile-btn ${hubTab === 'campaign' ? 'active' : ''} ${onboardingTarget === 'campaign' ? 'onboarding-target' : ''}`}
          onClick={() => pick('campaign')}
        >
          <span className="hub-mobile-icon" aria-hidden>
            ⚔
          </span>
          <span>{t('campaign')}</span>
        </button>
        <button
          type="button"
          data-hub-tab="quests"
          className={`hub-mobile-btn ${hubTab === 'quests' ? 'active' : ''}`}
          onClick={() => pick('quests')}
        >
          <span className="hub-mobile-icon" aria-hidden>
            ✦
          </span>
          <span>{t('quests')}</span>
        </button>
        <button
          type="button"
          className={`hub-mobile-btn ${['mine', 'forge', 'research', 'barracks', 'tavern', 'inventory'].includes(hubTab) ? 'active' : ''} ${onboardingTarget === 'forge' || onboardingTarget === 'barracks' || onboardingTarget === 'mine' ? 'onboarding-target' : ''}`}
          onClick={() => setSheet('base')}
        >
          <span className="hub-mobile-icon" aria-hidden>
            ⚒
          </span>
          <span>{t('hubNavBase')}</span>
        </button>
        <button
          type="button"
          className={`hub-mobile-btn ${['arena', 'social', 'profile'].includes(hubTab) ? 'active' : ''}`}
          onClick={() => setSheet('more')}
        >
          <span className="hub-mobile-icon" aria-hidden>
            ☰
          </span>
          <span>{t('hubNavMore')}</span>
        </button>
      </nav>

      {sheet ? (
        <div className="hub-sheet-backdrop" onClick={() => setSheet(null)} role="presentation">
          <div className="hub-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="hub-sheet-head">
              <b>{sheet === 'base' ? t('hubGroupBase') : t('hubNavMore')}</b>
              <button type="button" className="ghost" onClick={() => setSheet(null)}>
                {t('cancel')}
              </button>
            </div>
            <div className="hub-sheet-grid">
              {(sheet === 'base' ? base : [...fight.filter((f) => f.id === 'arena'), ...account]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-hub-tab={item.id}
                  className={`hub-sheet-item ${hubTab === item.id ? 'active' : ''} ${onboardingTarget === item.id ? 'onboarding-target' : ''}`}
                  disabled={!hubTabUnlocked(state, item.id)}
                  onClick={() => pick(item.id)}
                >
                  <span className="hub-sheet-ico" aria-hidden>
                    {item.icon}
                  </span>
                  {t(item.label)}
                </button>
              ))}
              {sheet === 'more' ? (
                <button type="button" className="hub-sheet-item" onClick={onSettings}>
                  {t('settings')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
