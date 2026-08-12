'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  STAT_CAP,
  createInitialState,
  deployCap,
  hasSave,
  loadSave,
  migrateState,
  setLang,
  t,
  tickJobs,
  writeSave,
  applyVictoryRewards,
  applyPvpVictory,
  applyPvpDefeat,
  buildBattleSummary,
  levelXpToNext,
  isMissionUnlocked,
  storyIntroKey,
  findMissionEntry,
  hubNextSteps,
  tickEnergy,
  energyRegenEta,
  formatEta,
} from '@tfw/game';
import {
  pushSave,
  loginPlayer,
  registerPlayer,
  logoutPlayer,
  fetchMe,
  pullSave,
  getAuthToken,
  isSessionActive,
  fetchOauthConfig,
  oauthLogin,
  updateProfile,
  putPvpDefense,
  reportPvpResult,
  startPvpChallenge,
  verifyEmailToken,
  resendVerification,
  forgotPassword,
  resetPassword,
  type PublicPlayer,
  type OauthConfig,
} from '@/lib/api';
import { mountGoogleButton, signInWithApple } from '@/lib/oauthClient';
import { IconGold, IconRes, IconSpark, Portrait } from './icons';
import { AccountAvatar, AvatarPicker } from './AccountAvatar';
import {
  BarracksView,
  CampaignView,
  ForgeView,
  InventoryView,
  MineView,
  PvpView,
  ResearchView,
  TavernView,
} from './HubViews';
import { MissionScreen } from './DeployBattle';
import { SocialPanel } from './SocialPanel';
import { connectRealtime } from '@/lib/realtime';

type Screen = 'boot' | 'hub' | 'deploy' | 'battle' | 'summary' | 'levelup' | 'briefing';
type HubTab =
  | 'campaign'
  | 'arena'
  | 'mine'
  | 'forge'
  | 'research'
  | 'barracks'
  | 'tavern'
  | 'inventory'
  | 'profile'
  | 'social';

export function GameShell() {
  const [lang, setLangState] = useState<'en' | 'ru'>('en');
  const [screen, setScreen] = useState<Screen>('boot');
  const [hubTab, setHubTab] = useState<HubTab>('campaign');
  const [state, setState] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [battle, setBattle] = useState<any>(null);
  const [deploy, setDeploy] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [briefing, setBriefing] = useState<any>(null);
  /** After level-up: go hub, or open next story mission. */
  const [postLevelUp, setPostLevelUp] = useState<
    null | { kind: 'hub' } | { kind: 'mission'; missionId: string; difficulty: string }
  >(null);
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [bootStep, setBootStep] = useState<'auth' | 'menu'>('auth');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authNick, setAuthNick] = useState('');
  const [authAvatar, setAuthAvatar] = useState<string>('p0');
  const [authBusy, setAuthBusy] = useState(false);
  const [awaitingVerify, setAwaitingVerify] = useState(false);
  const [profileNick, setProfileNick] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('p0');
  const [pvpMatchId, setPvpMatchId] = useState<string | null>(null);
  const [pvpDeploy, setPvpDeploy] = useState<{ ids: string[]; positions: { x: number; y: number }[] } | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [resetToken, setResetToken] = useState('');
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [oauthCfg, setOauthCfg] = useState<OauthConfig | null>(null);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const saved = loadSave();
    if (saved?.lang) {
      setLang(saved.lang);
      setLangState(saved.lang);
    }
    try {
      localStorage.removeItem('tfw_guest_id');
    } catch {
      /* ignore */
    }
    // Cookie session may exist without local token (production)
    fetchMe()
      .then((r) => {
        if (r?.player) {
          setPlayer(r.player);
          setProfileNick(r.player.displayName || '');
          setProfileAvatar(r.player.avatarKey || 'p0');
          setBootStep('menu');
        }
      })
      .catch(() => {});
    fetchOauthConfig().then(setOauthCfg).catch(() => {});

    try {
      const params = new URLSearchParams(window.location.search);
      const vt = params.get('verifyEmail');
      const rt = params.get('resetPassword');
      if (rt) {
        setResetToken(rt);
        setAuthMode('reset');
        setBootStep('auth');
        params.delete('resetPassword');
        const qs = params.toString();
        window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
      }
      if (vt) {
        void verifyEmailToken(vt)
          .then(async (res) => {
            setPlayer(res.player);
            setAuthPass('');
            setAwaitingVerify(false);
            setProfileNick(res.player.displayName || '');
            setProfileAvatar(res.player.avatarKey || 'p0');
            setBootStep('menu');
            setMsg(t('authEmailVerified'));
            setTimeout(() => setMsg(''), 2800);
            try {
              const cloud = await pullSave();
              if (cloud?.save && typeof cloud.save === 'object') writeSave(cloud.save as any);
            } catch {
              /* empty */
            }
            params.delete('verifyEmail');
            const qs = params.toString();
            window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
          })
          .catch(() => {
            setMsg(t('authVerifyFail'));
            setTimeout(() => setMsg(''), 2800);
          });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => {
      const done = tickJobs(state);
      const before = state.energy?.current;
      tickEnergy(state);
      const energyChanged = state.energy?.current !== before;
      if (done.length) {
        persist(state);
        setState({ ...state });
        const parts: string[] = [];
        for (const d of done) {
          if (d.kind === 'mine') {
            const eta = d.duration ? ` · ${formatEta(d.duration)}` : '';
            parts.push(`${t('jobDoneMine')} +${d.amount}${eta}`);
          } else if (d.kind === 'smelt') {
            const eta = d.duration ? ` · ${formatEta(d.duration)}` : '';
            parts.push(`${t('jobDoneSmelt')} +${d.amount}${eta}`);
          } else if (d.kind === 'craft') {
            const eta = d.duration ? ` · ${formatEta(d.duration)}` : '';
            parts.push(`${t('jobDoneCraft')} (${t(d.rarity)})${eta}`);
          } else if (d.kind === 'research') {
            parts.push(`${t('jobDoneResearch')} ${t(d.blueprintId)}`);
            if (d.unlockedResources?.length) {
              parts.push(
                `${t('unlockedNew')}: ${[...new Set(d.unlockedResources as string[])].map((k) => t(k)).join(', ')}`,
              );
            }
          }
        }
        if (parts.length) flash(parts.join(' · '));
      } else if (energyChanged) {
        persist(state);
        setState({ ...state });
      } else if (state.mine.jobs.length || state.forge.jobs.length || state.research.queue) {
        tick((n) => n + 1);
      } else if (state.energy && state.energy.current < state.energy.max) {
        // re-render ETA progress without full persist
        tick((n) => n + 1);
      }
    }, 500);
    return () => clearInterval(id);
  }, [state]);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(''), 2800);
  }

  function persist(s: any) {
    writeSave(s);
    if (isSessionActive() || getAuthToken()) {
      // Cloud save first, then rebuild defense from server copy
      pushSave(s)
        .then(() => {
          if (s?.warriors?.length) return putPvpDefense();
        })
        .catch(() => {});
    }
  }

  function chooseLang(l: 'en' | 'ru') {
    setLang(l);
    setLangState(l);
  }

  function newGame() {
    if (hasSave() && !confirm(t('saveWarn'))) return;
    const s = createInitialState(lang);
    setState(s);
    persist(s);
    setScreen('hub');
    setHubTab('campaign');
  }

  function continueGame() {
    void (async () => {
      let raw = loadSave();
      try {
        if (isSessionActive() || getAuthToken()) {
          const cloud = await pullSave();
          const c = cloud?.save as any;
          if (c && typeof c === 'object') {
            if (!raw || (Number(c.updatedAt) || 0) >= (Number(raw.updatedAt) || 0)) {
              raw = c;
            }
          }
        }
      } catch {
        /* offline */
      }
      if (!raw) return;
      const s = migrateState(raw);
      setLang(s.lang || lang);
      setLangState(s.lang || lang);
      tickJobs(s);
      setState(s);
      persist(s);
      setScreen('hub');
    })();
  }

  async function finishAuth(res: { player: PublicPlayer }) {
    setPlayer(res.player);
    setAuthPass('');
    setAwaitingVerify(false);
    setProfileNick(res.player.displayName || '');
    setProfileAvatar(res.player.avatarKey || 'p0');
    setBootStep('menu');
    connectRealtime();
    flash(`${t('authOk')}: ${res.player.displayName || res.player.email}`);
    try {
      const cloud = await pullSave();
      if (cloud?.save && typeof cloud.save === 'object') {
        writeSave(cloud.save as any);
      }
    } catch {
      /* empty cloud ok */
    }
  }

  async function doAuth(mode: 'login' | 'register') {
    setAuthBusy(true);
    try {
      if (mode === 'register') {
        const reg = await registerPlayer({
          email: authEmail,
          password: authPass,
          displayName: authNick || undefined,
          avatarKey: authAvatar,
        });
        setAwaitingVerify(true);
        flash(t('authCheckEmail'));
        if (reg.devVerifyToken) console.info('[dev] verify token', reg.devVerifyToken);
        if (reg.verifyToken) {
          await finishAuth(await verifyEmailToken(reg.verifyToken));
          return;
        }
        if (reg.emailDeliveryFailed) {
          flash(t('authMailFailed') || t('authCheckEmail'));
        }
        return;
      }
      const res = await loginPlayer({ email: authEmail, password: authPass });
      await finishAuth(res);
    } catch (e: any) {
      const msg = e?.data?.message || e?.message || 'err';
      const key =
        msg === 'email_taken'
          ? 'authEmailTaken'
          : msg === 'bad_credentials'
            ? 'authBadCreds'
            : msg === 'password_min_8' || msg === 'password_min_6'
              ? 'authPassShort'
              : msg === 'email_not_verified'
                ? 'authEmailNotVerified'
                : msg === 'rate_limited'
                  ? 'authRateLimited'
                  : 'authFail';
      if (msg === 'email_not_verified') setAwaitingVerify(true);
      flash(t(key));
    } finally {
      setAuthBusy(false);
    }
  }

  async function doResendVerify() {
    if (!authEmail.trim()) {
      flash(t('authFail'));
      return;
    }
    setAuthBusy(true);
    try {
      const r = await resendVerification(authEmail);
      flash(t('authCheckEmail'));
      if (r.devVerifyToken) console.info('[dev] verify token', r.devVerifyToken);
      if (r.verifyToken) {
        await finishAuth(await verifyEmailToken(r.verifyToken));
        return;
      }
      if (r.emailDeliveryFailed) {
        flash(t('authMailFailed') || t('authCheckEmail'));
      }
    } catch {
      flash(t('authFail'));
    } finally {
      setAuthBusy(false);
    }
  }

  const onOauthToken = useCallback(
    async (provider: 'google' | 'apple', idToken: string, displayName?: string) => {
      setAuthBusy(true);
      try {
        const res = await oauthLogin({ provider, idToken, displayName });
        await finishAuth(res);
      } catch (e: any) {
        const msg = e?.data?.message || e?.message || 'err';
        if (msg === 'oauth_cancelled' || msg === 'google_prompt_dismissed' || msg === 'google_timeout') {
          /* silent */
        } else if (
          msg === 'google_oauth_not_configured' ||
          msg === 'apple_oauth_not_configured' ||
          msg === 'oauth_not_configured'
        ) {
          flash(t('authOauthNotConfigured'));
        } else if (msg === 'rate_limited') {
          flash(t('authRateLimited'));
        } else {
          flash(t('authOauthFail'));
        }
      } finally {
        setAuthBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (bootStep !== 'auth' || !oauthCfg?.google || !oauthCfg.googleClientId) return;
    const el = googleBtnRef.current;
    if (!el) return;
    return mountGoogleButton(
      el,
      oauthCfg.googleClientId,
      (idToken) => {
        void onOauthToken('google', idToken);
      },
      () => flash(t('authOauthFail')),
    );
  }, [bootStep, oauthCfg, onOauthToken]);

  async function doApple() {
    if (!oauthCfg?.appleClientId || !oauthCfg.appleRedirectUri) {
      flash(t('authOauthNotConfigured'));
      return;
    }
    setAuthBusy(true);
    try {
      const { idToken, displayName } = await signInWithApple({
        clientId: oauthCfg.appleClientId,
        redirectURI: oauthCfg.appleRedirectUri,
      });
      await onOauthToken('apple', idToken, displayName);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg !== 'oauth_cancelled') flash(t('authOauthFail'));
      setAuthBusy(false);
    }
  }

  async function doLogout() {
    await logoutPlayer();
    setPlayer(null);
    setBootStep('auth');
    setAuthEmail('');
    setAuthPass('');
    flash(t('authLoggedOut'));
  }

  function refresh() {
    if (!state) return;
    persist(state);
    setState({ ...state });
  }

  function beginDeploy(missionId: string, difficulty: string) {
    if (!isMissionUnlocked(state, missionId)) {
      flash(t('campaignLocked'));
      return;
    }
    setBriefing({ missionId, difficulty });
    setScreen('briefing');
  }

  function confirmBriefing() {
    if (!briefing) return;
    const cap = deployCap(state);
    const selected = state.warriors.slice(0, cap).map((w: any) => w.id);
    const positions: Record<string, { x: number; y: number }> = {};
    selected.forEach((id: string, i: number) => {
      positions[id] = { x: 1, y: Math.min(9, 1 + i) };
    });
    setDeploy({
      missionId: briefing.missionId,
      difficulty: briefing.difficulty,
      selected,
      positions,
    });
    setBriefing(null);
    setScreen('deploy');
  }

  async function beginPvp(opponent: {
    playerId: string;
    displayName?: string;
    avatarKey?: string | null;
    isBot?: boolean;
    squad: { warriors: any[]; items: Record<string, any>; power?: number };
  }) {
    if (!state?.warriors?.length) {
      flash(t('pvpDefenseNeed'));
      return;
    }
    const isBot = !!opponent.isBot || opponent.playerId.startsWith('bot_');
    let squad = opponent.squad;
    let matchId: string | null = null;
    let displayName = opponent.displayName;
    let avatarKey = opponent.avatarKey;

    if (!isBot) {
      if (!isSessionActive() && !getAuthToken()) {
        flash(t('pvpNeedLogin'));
        return;
      }
      try {
        const ch = await startPvpChallenge(opponent.playerId);
        matchId = ch.matchId;
        squad = ch.opponent.squad;
        displayName = ch.opponent.displayName;
        avatarKey = ch.opponent.avatarKey;
      } catch (e: any) {
        const msg = e?.data?.message || e?.message || '';
        if (msg === 'defender_cooldown') flash(t('pvpCooldownCooldown'));
        else if (msg === 'match_rate_limited' || msg === 'rate_limited') flash(t('authRateLimited'));
        else if (msg === 'no_cloud_save' || msg === 'empty_squad') flash(t('pvpDefenseNeed'));
        else flash(t('pvpChallengeFail'));
        return;
      }
    }

    const cap = deployCap(state);
    const selected = state.warriors.slice(0, cap).map((w: any) => w.id);
    const positions: Record<string, { x: number; y: number }> = {};
    selected.forEach((id: string, i: number) => {
      positions[id] = { x: 1, y: Math.min(9, 1 + i) };
    });
    setPvpMatchId(matchId);
    setDeploy({
      kind: 'pvp',
      missionId: 'pvp_arena',
      difficulty: 'normal',
      selected,
      positions,
      defenderSquad: squad,
      opponentName: displayName,
      opponentAvatar: avatarKey,
      opponentId: opponent.playerId,
      matchId,
      isBot,
    });
    setScreen('deploy');
  }

  function endBattleResult(mode: 'victory' | 'defeat', finishedBattle?: any) {
    const b = finishedBattle || battle;
    if (!b) return;
    b.mode = mode;
    let res: any = { rewards: {}, unlocked: [], levelUps: [] };
    const isPvp = b.kind === 'pvp' || b.missionId === 'pvp_arena';
    if (isPvp) {
      if (mode === 'victory') {
        res = applyPvpVictory(state, b);
        persist(state);
        setState({ ...state });
      } else {
        res = applyPvpDefeat(state, b);
      }
      if (pvpMatchId) {
        const ids = deploy?.selected || [];
        const positions = ids.map((id: string) => deploy?.positions?.[id] || { x: 1, y: 2 });
        void reportPvpResult(pvpMatchId, mode === 'victory', {
          deployWarriorIds: ids,
          deployPositions: positions,
        });
        setPvpMatchId(null);
      }
    } else if (mode === 'victory') {
      res = applyVictoryRewards(state, b);
      persist(state);
      setState({ ...state });
    } else {
      res.summary = buildBattleSummary(state, b, {}, []);
    }
    const sum = res.summary || buildBattleSummary(state, b, res.rewards || {}, res.unlocked || []);
    setSummary(sum);
    setBattle(null);
    setDeploy(null);
    setScreen('summary');
  }

  function leaveSummary(goto: 'hub' | 'next') {
    const sum = summary;
    const difficulty = sum?.difficulty || 'normal';
    const nextId = sum?.nextMissionId as string | undefined;
    const isPvp = sum?.kind === 'pvp' || sum?.missionId === 'pvp_arena';
    const hasLevel = state?.warriors?.some((w: any) => (w.freePoints || 0) > 0);
    setSummary(null);

    if (goto === 'next' && nextId && !isPvp) {
      if (hasLevel) {
        setPostLevelUp({ kind: 'mission', missionId: nextId, difficulty });
        setScreen('levelup');
      } else {
        setHubTab('campaign');
        beginDeploy(nextId, difficulty);
      }
      return;
    }

    if (hasLevel) {
      setPostLevelUp({ kind: 'hub' });
      setScreen('levelup');
    } else {
      setHubTab(isPvp ? 'arena' : 'campaign');
      setScreen('hub');
    }
  }

  async function saveProfile() {
    if (!player) return;
    try {
      const res = await updateProfile({
        displayName: profileNick,
        avatarKey: profileAvatar,
      });
      setPlayer(res.player);
      flash(t('profileSaved'));
    } catch {
      flash(t('authFail'));
    }
  }

  function finishLevelUpFlow() {
    const next = postLevelUp;
    setPostLevelUp(null);
    persist(state);
    setState({ ...state, warriors: [...state.warriors] });
    if (next?.kind === 'mission') {
      setHubTab('campaign');
      beginDeploy(next.missionId, next.difficulty);
    } else {
      setHubTab('campaign');
      setScreen('hub');
    }
  }

  if (screen === 'boot') {
    const showAuth = bootStep === 'auth' || !player;

    if (showAuth) {
      return (
        <div className="screen boot">
          <div className="boot-card">
            <h1>{t('gameTitle')}</h1>
            <p className="tag">{t('tagline')}</p>
            <div className="boot-tabs">
              <button
                type="button"
                className={authTab === 'login' ? 'primary' : 'ghost'}
                onClick={() => setAuthTab('login')}
              >
                {t('authLogin')}
              </button>
              <button
                type="button"
                className={authTab === 'register' ? 'primary' : 'ghost'}
                onClick={() => setAuthTab('register')}
              >
                {t('authRegister')}
              </button>
            </div>
            <form
              className="boot-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!authBusy && authEmail && authPass.length >= 8) void doAuth(authTab);
              }}
            >
              <label className="boot-field">
                <span>{t('authEmail')}</span>
                <input
                  type="email"
                  name="email"
                  inputMode="email"
                  placeholder="you@mail.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </label>
              <label className="boot-field">
                <span>{t('authPassword')}</span>
                <input
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  autoComplete={authTab === 'register' ? 'new-password' : 'current-password'}
                  minLength={8}
                  required
                />
              </label>
              {authTab === 'register' ? (
                <>
                  <label className="boot-field">
                    <span>{t('authNick')}</span>
                    <input
                      type="text"
                      name="displayName"
                      placeholder="Commander"
                      value={authNick}
                      onChange={(e) => setAuthNick(e.target.value)}
                      autoComplete="nickname"
                      maxLength={24}
                    />
                  </label>
                  <div className="boot-field">
                    <span>{t('authAvatar')}</span>
                    <AvatarPicker value={authAvatar} onChange={setAuthAvatar} onError={flash} />
                  </div>
                  <p className="muted" style={{ fontSize: '0.82rem', margin: 0 }}>
                    {t('authVerifyHint')}
                  </p>
                </>
              ) : null}
              <button
                type="submit"
                className="primary boot-submit"
                disabled={authBusy || !authEmail.trim() || authPass.length < 8}
              >
                {authBusy ? '…' : authTab === 'register' ? t('authRegister') : t('authLogin')}
              </button>
              {authTab === 'login' ? (
                <button
                  type="button"
                  className="ghost boot-submit"
                  disabled={authBusy}
                  onClick={() => {
                    setAuthMode('forgot');
                    void (async () => {
                      if (!authEmail.trim()) {
                        flash(t('authEmail'));
                        return;
                      }
                      setAuthBusy(true);
                      try {
                        const r = await forgotPassword(authEmail);
                        flash(t('authCheckEmail'));
                        if (r.devResetToken) console.info('[dev] reset token', r.devResetToken);
                      } catch {
                        flash(t('authResetFail') || 'Reset failed');
                      } finally {
                        setAuthBusy(false);
                      }
                    })();
                  }}
                >
                  {t('authForgot') || 'Forgot password?'}
                </button>
              ) : null}
              {authMode === 'reset' ? (
                <button
                  type="button"
                  className="primary boot-submit"
                  disabled={authBusy || authPass.length < 8}
                  onClick={() =>
                    void (async () => {
                      setAuthBusy(true);
                      try {
                        await resetPassword(resetToken, authPass);
                        setAuthMode('login');
                        flash(t('authResetOk') || 'Password updated');
                      } catch {
                        flash(t('authResetFail') || 'Reset failed');
                      } finally {
                        setAuthBusy(false);
                      }
                    })()
                  }
                >
                  {t('authResetSubmit') || 'Set new password'}
                </button>
              ) : null}
              {awaitingVerify ? (
                <button
                  type="button"
                  className="ghost boot-submit"
                  disabled={authBusy}
                  onClick={() => void doResendVerify()}
                >
                  {t('authResendVerify')}
                </button>
              ) : null}
              {awaitingVerify ? (
                <div
                  className="card"
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.65rem 0.75rem',
                    borderColor: 'var(--accent2)',
                    background: 'rgba(201,162,39,0.08)',
                  }}
                >
                  <b>{t('authVerifyPendingTitle')}</b>
                  <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                    {t('authVerifyPendingBody')} <b>{authEmail || '—'}</b>
                  </p>
                  <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>
                    {t('authVerifyPendingTip')}
                  </p>
                </div>
              ) : null}
            </form>

            {(oauthCfg?.google || oauthCfg?.apple) && (
              <div className="boot-oauth">
                <div className="boot-oauth-divider">
                  <span>{t('authOr')}</span>
                </div>
                {oauthCfg.google && oauthCfg.googleClientId ? (
                  <div
                    ref={googleBtnRef}
                    className={`boot-google-btn${authBusy ? ' is-busy' : ''}`}
                    aria-label={t('authGoogle')}
                  />
                ) : null}
                {oauthCfg.apple && oauthCfg.appleClientId ? (
                  <button
                    type="button"
                    className="boot-apple-btn"
                    disabled={authBusy}
                    onClick={() => void doApple()}
                  >
                    <span className="boot-apple-logo" aria-hidden>
                      
                    </span>
                    {t('authApple')}
                  </button>
                ) : null}
              </div>
            )}

            <p className="muted boot-hint">{t('authHint')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="screen boot">
        <div className="boot-card">
          <h1>{t('gameTitle')}</h1>
          <p className="tag">{t('tagline')}</p>
          <div className="boot-account">
            <AccountAvatar
              avatarKey={player.avatarKey}
              name={player.displayName || player.email}
              size={48}
            />
            <span className="muted">
              {t('authSignedIn')}:{' '}
              <b className="boot-account-name">{player.displayName || player.email}</b>
            </span>
            <button type="button" className="ghost boot-logout" onClick={() => void doLogout()}>
              {t('authLogout')}
            </button>
          </div>
          <div className="boot-profile-edit">
            <label className="boot-field">
              <span>{t('authNick')}</span>
              <input
                type="text"
                value={profileNick}
                onChange={(e) => setProfileNick(e.target.value)}
                maxLength={24}
              />
            </label>
            <div className="boot-field">
              <span>{t('authAvatar')}</span>
              <AvatarPicker value={profileAvatar} onChange={setProfileAvatar} onError={flash} />
            </div>
            <button type="button" className="ghost" onClick={() => void saveProfile()}>
              {t('profileSave')}
            </button>
          </div>
          <p className="muted boot-section-label">{t('chooseLang')}</p>
          <div className="actions">
            <div className="boot-tabs">
              <button type="button" className={lang === 'en' ? 'primary' : ''} onClick={() => chooseLang('en')}>
                English
              </button>
              <button type="button" className={lang === 'ru' ? 'primary' : ''} onClick={() => chooseLang('ru')}>
                Русский
              </button>
            </div>
            <button type="button" className="primary" onClick={newGame}>
              {t('newGame')}
            </button>
            <button type="button" disabled={!hasSave() && !isSessionActive() && !getAuthToken()} onClick={continueGame}>
              {t('continue')}
            </button>
          </div>
          <p className="muted boot-hint">{t('youAreSmith')}</p>
          <p className="muted boot-hint boot-hint-sm">{t('reforgeSaveHint')}</p>
        </div>
      </div>
    );
  }

  if (screen === 'briefing' && briefing) {
    const entry = findMissionEntry(briefing.missionId);
    return (
      <div className="screen boot">
        <div className="boot-card summary-card" style={{ width: 'min(560px, 100%)', textAlign: 'left' }}>
          <p className="muted" style={{ marginBottom: 0 }}>
            {t('briefing')} · {t(briefing.difficulty)}
          </p>
          <h2 style={{ color: 'var(--accent2)' }}>{t(briefing.missionId)}</h2>
          {entry ? (
            <p className="muted">
              {t(entry.regionId)} · {t('foesLabel')} {entry.enemies} · Lv{entry.enemyLvl}
              {entry.boss ? ` · ${t('boss')}` : ''}
            </p>
          ) : null}
          <p style={{ lineHeight: 1.5 }}>{t(storyIntroKey(briefing.missionId))}</p>
          <div className="row" style={{ marginTop: '1.25rem', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setBriefing(null);
                setScreen('hub');
              }}
            >
              {t('backHub')}
            </button>
            <button type="button" className="primary" style={{ flex: 1 }} onClick={confirmBriefing}>
              {t('deploySquad')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'deploy' && deploy) {
    return (
      <MissionScreen
        state={state}
        deploy={deploy}
        setDeploy={setDeploy}
        onBack={() => {
          setDeploy(null);
          setScreen('hub');
        }}
        onVictory={(b) => endBattleResult('victory', b)}
        onDefeat={(b) => endBattleResult('defeat', b)}
      />
    );
  }

  if (screen === 'summary' && summary) {
    return (
      <BattleSummaryView
        summary={summary}
        state={state}
        onContinue={() => leaveSummary('hub')}
        onNextMission={summary.nextMissionId ? () => leaveSummary('next') : undefined}
        onGoTab={(tab) => {
          setSummary(null);
          if (tab === 'levelup') {
            setPostLevelUp({ kind: 'hub' });
            setScreen('levelup');
            return;
          }
          setHubTab(tab as HubTab);
          setScreen('hub');
        }}
      />
    );
  }

  if (screen === 'levelup' && state) {
    return (
      <LevelUpScreen
        state={state}
        onPersist={() => {
          persist(state);
          setState({ ...state, warriors: [...state.warriors] });
        }}
        onAllDone={finishLevelUpFlow}
      />
    );
  }

  if (!state) return null;

  const resChips = (state.unlockedResources || []).filter((k: string) =>
    ['copper_ore', 'iron_ore', 'softwood', 'scrap_hide', 'coal'].includes(k),
  );
  const freePts = state.warriors?.filter((w: any) => (w.freePoints || 0) > 0) || [];
  const guideSteps = hubNextSteps(state, 3);

  function goGuide(tab: string) {
    if (tab === 'levelup') {
      setScreen('levelup');
      return;
    }
    setHubTab(tab as HubTab);
  }

  return (
    <div className="hub">
      <nav className="hub-nav">
        <div className="hub-brand">{t('gameTitle')}</div>
        {(
          [
            ['campaign', t('campaign')],
            ['arena', t('pvp')],
            ['mine', t('mine')],
            ['forge', t('forge')],
            ['research', t('research')],
            ['barracks', t('barracks')],
            ['tavern', t('tavern')],
            ['inventory', t('inventory')],
            ['social', t('social') || 'Social'],
            ['profile', t('profileTab')],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={hubTab === id ? 'active' : ''} onClick={() => setHubTab(id)}>
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {player ? (
          <div className="hub-player-chip" onClick={() => setHubTab('profile')} role="button">
            <AccountAvatar avatarKey={player.avatarKey} name={player.displayName || '?'} size={28} />
            <span>{player.displayName || player.email.split('@')[0]}</span>
          </div>
        ) : null}
              {player?.role === 'admin' ? (
                <a href="/admin" className="ghost" style={{ marginLeft: '0.5rem' }}>
                  Admin
                </a>
              ) : null}
              <button type="button" className="ghost" onClick={() => setScreen('boot')}>
          {t('settings')}
        </button>
      </nav>
      <div className="hub-main">
        <div className="topbar">
          <span
            className="resource-chip res-chip-ico energy-chip"
            title={
              (state.energy?.current ?? 0) < (state.energy?.max ?? 30)
                ? `${t('energyRegen')}: ${formatEta(energyRegenEta(state))}`
                : t('energyFull')
            }
          >
            <span className="energy-bolt" aria-hidden>
              ⚡
            </span>
            <b>
              {state.energy?.current ?? 0}/{state.energy?.max ?? 30}
            </b>
          </span>
          <span className="resource-chip res-chip-ico">
            <IconGold s={18} /> <b>{state.gold}</b>
          </span>
          <span className="resource-chip res-chip-ico">
            <IconSpark s={18} /> <b>{state.sparks}</b>
          </span>
          {resChips.map((k: string) => (
            <span className="resource-chip res-chip-ico" key={k}>
              <IconRes id={k} s={18} />
              <b>{state.resources[k] || 0}</b>
            </span>
          ))}
          {msg ? <span className="warn">{msg}</span> : null}
        </div>
        {freePts.length ? (
          <div className="hub-banner">
            <span>
              {t('freePointsBanner')}: {freePts.map((w: any) => w.name).join(', ')}
            </span>
            <button type="button" className="primary" onClick={() => setScreen('levelup')}>
              {t('spendPoints')}
            </button>
          </div>
        ) : null}
        {!state.flags?.loopSeen ? (
          <div className="hub-banner loop-hint">
            <span>{t('smithLoopHint')}</span>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                state.flags = { ...(state.flags || {}), loopSeen: true };
                persist(state);
                setState({ ...state });
              }}
            >
              OK
            </button>
          </div>
        ) : null}
        {guideSteps.length ? (
          <div className="hub-guide">
            <div className="hub-guide-label muted">{t('guideNext')}</div>
            <div className="hub-guide-row">
              {guideSteps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`hub-guide-card ${s.tab === hubTab || (s.tab === 'levelup' && freePts.length) ? 'here' : ''}`}
                  onClick={() => {
                    if (!state.flags?.loopSeen) {
                      state.flags = { ...(state.flags || {}), loopSeen: true };
                      persist(state);
                    }
                    goGuide(s.tab);
                  }}
                >
                  <b>{t(s.labelKey)}</b>
                  {s.detailKey ? <span className="muted">{t(s.detailKey)}</span> : null}
                  {s.meta?.missionId ? (
                    <span className="hub-guide-meta">{t(String(s.meta.missionId))}</span>
                  ) : null}
                  {s.meta?.bp ? <span className="hub-guide-meta">{t(String(s.meta.bp))}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="panel">
          {hubTab === 'campaign' && <CampaignView state={state} onFight={beginDeploy} />}
          {hubTab === 'arena' && (
            <PvpView
              state={state}
              player={player}
              flash={flash}
              onAttack={(op) => void beginPvp(op)}
              onPostDefense={async () => {
                if (!isSessionActive() && !getAuthToken()) {
                  flash(t('pvpNeedLogin'));
                  return;
                }
                if (!state.warriors?.length) {
                  flash(t('pvpDefenseNeed'));
                  return;
                }
                try {
                  // Ensure latest save is on server before building defense
                  await pushSave(state);
                  await putPvpDefense();
                  flash(t('pvpDefenseOk'));
                } catch (e: any) {
                  const msg = e?.data?.message || e?.message || '';
                  if (msg === 'no_cloud_save' || msg === 'empty_squad') flash(t('pvpDefenseNeed'));
                  else flash(t('authFail'));
                }
              }}
            />
          )}
          {hubTab === 'mine' && <MineView state={state} refresh={refresh} flash={flash} />}
          {hubTab === 'forge' && <ForgeView state={state} refresh={refresh} flash={flash} />}
          {hubTab === 'research' && <ResearchView state={state} refresh={refresh} flash={flash} />}
          {hubTab === 'barracks' && <BarracksView state={state} refresh={refresh} flash={flash} />}
          {hubTab === 'tavern' && (
            <TavernView
              state={state}
              refresh={() => {
                refresh();
                setHubTab('barracks');
              }}
              flash={flash}
            />
          )}
          {hubTab === 'inventory' && <InventoryView state={state} refresh={refresh} />}
          {hubTab === 'social' && player ? (
            <SocialPanel playerId={player.id} flash={flash} />
          ) : null}
          {hubTab === 'profile' && player ? (
            <div>
              <div className="panel-header">
                <div>
                  <h2>{t('profileTab')}</h2>
                  <p className="muted">{player.email}</p>
                </div>
                <AccountAvatar avatarKey={profileAvatar} name={profileNick || '?'} size={72} />
              </div>
              <label className="boot-field" style={{ maxWidth: 360 }}>
                <span>{t('authNick')}</span>
                <input
                  type="text"
                  value={profileNick}
                  onChange={(e) => setProfileNick(e.target.value)}
                  maxLength={24}
                />
              </label>
              <div className="boot-field" style={{ marginTop: 12 }}>
                <span>{t('authAvatar')}</span>
                <AvatarPicker value={profileAvatar} onChange={setProfileAvatar} onError={flash} />
              </div>
              <button type="button" className="primary" style={{ marginTop: 12 }} onClick={() => void saveProfile()}>
                {t('profileSave')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BattleSummaryView({
  summary,
  state,
  onContinue,
  onNextMission,
  onGoTab,
}: {
  summary: any;
  state?: any;
  onContinue: () => void;
  onNextMission?: () => void;
  onGoTab?: (tab: string) => void;
}) {
  const win = summary.result === 'victory';
  const hasLevelUps = (summary.levelUps || []).length > 0;
  const isPvp = summary.kind === 'pvp' || summary.missionId === 'pvp_arena';
  const nextSteps =
    summary.nextSteps?.length > 0 ? summary.nextSteps : state ? hubNextSteps(state, 3) : [];
  return (
    <div className="screen boot">
      <div className="boot-card summary-card" style={{ width: 'min(560px, 100%)', textAlign: 'left' }}>
        <h2 style={{ color: win ? 'var(--good)' : 'var(--bad)', textAlign: 'center' }}>
          {win ? t('victory') : t('defeat')}
        </h2>
        <p className="muted" style={{ textAlign: 'center' }}>
          {isPvp && summary.opponentName
            ? `${t('pvp_arena')} · ${summary.opponentName}`
            : t(summary.missionId)}{' '}
          · {isPvp ? t(summary.isBot ? 'pvpModeAi' : 'pvpModePlayers') : t(summary.difficulty || 'normal')} ·{' '}
          {t('rounds')}: {summary.rounds}
        </p>
        {isPvp && summary.opponentName ? (
          <div className="summary-pvp-opp">
            <AccountAvatar
              avatarKey={summary.opponentAvatar}
              name={summary.opponentName}
              size={40}
            />
            <div>
              <b>{summary.opponentName}</b>
              {summary.defenderPower ? (
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {t('pvpPower')} {summary.defenderPower}
                  {summary.attackerPower
                    ? ` · ${t('pvpYours')} ${summary.attackerPower}`
                    : ''}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="summary-stat-row">
          <div className="summary-pill">
            <span className="muted">{t('damage')}</span>
            <b>{summary.totalDamage || 0}</b>
          </div>
          <div className="summary-pill">
            <span className="muted">{t('kills')}</span>
            <b>{summary.totalKills || 0}</b>
          </div>
          <div className="summary-pill">
            <span className="muted">{t('fallen')}</span>
            <b>{(summary.roster || []).filter((r: any) => !r.survived).length}</b>
          </div>
        </div>

        <h3 style={{ marginTop: '1rem' }}>{t('squad')}</h3>
        <div className="stack">
          {(summary.roster || []).map((r: any) => (
            <div className="card" key={r.id} style={{ padding: '0.55rem 0.7rem' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b className={r.survived ? '' : 'muted'}>
                  {r.name} {r.survived ? '' : `· ${t('fallen')}`}
                </b>
                <span className="muted">
                  {t('level')} {r.level || 1} · {t(r.weaponType || 'unarmed')} · HP {r.hp}/{r.maxHp}
                </span>
              </div>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {t('damage')} {r.damage} · {t('kills')} {r.kills} · {t('hits')} {r.hits} · {t('misses')} {r.misses}
              </div>
              {r.levelsGained?.length ? (
                <div style={{ marginTop: '0.25rem', color: 'var(--accent2)', fontSize: '0.88rem' }}>
                  {t('summaryGrew')}: +{r.levelsGained.length} → {t('level')} {r.level}
                  {r.freePoints > 0 ? ` · ${t('freePointsSoon')}: ${r.freePoints}` : ''}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {win && summary.rewards && Object.keys(summary.rewards).length ? (
          <>
            <h3 style={{ marginTop: '1rem' }}>{t('rewards')}</h3>
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              {Object.entries(summary.rewards).map(([k, v]) => (
                <span className="cost-pill" key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {k === 'gold' ? <IconGold s={16} /> : k === 'sparks' ? <IconSpark s={16} /> : <IconRes id={k} s={16} />}
                  <span>
                    {k === 'gold' ? t('gold') : k === 'sparks' ? t('sparks') : t(k)}: <b>{v as number}</b>
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : null}

        {win && summary.unlocked?.length ? (
          <p className="warn" style={{ marginTop: '0.75rem' }}>
            {t('unlockedNew')}: {summary.unlocked.map((k: string) => t(k)).join(', ')}
          </p>
        ) : null}

        {win && summary.storyOutroKey ? (
          <div className="card" style={{ marginTop: '1rem', padding: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              {t('storyContinue')}
            </div>
            <p style={{ margin: '0.35rem 0 0', lineHeight: 1.45 }}>{t(summary.storyOutroKey)}</p>
            {summary.nextMissionId ? (
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.88rem' }}>
                {t('campaignNext')}: <b style={{ color: 'var(--accent2)' }}>{t(summary.nextMissionId)}</b>
              </p>
            ) : null}
          </div>
        ) : null}

        {nextSteps.length ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.35rem' }}>
              {t('summaryNext')}
            </div>
            <div className="hub-guide-row">
              {nextSteps.map((s: any) => (
                <button
                  key={s.id}
                  type="button"
                  className="hub-guide-card"
                  onClick={() => {
                    if (s.tab === 'levelup') {
                      onContinue();
                      return;
                    }
                    if (onGoTab) {
                      onGoTab(s.tab);
                      return;
                    }
                    onContinue();
                  }}
                >
                  <b>{t(s.labelKey)}</b>
                  {s.detailKey ? <span className="muted">{t(s.detailKey)}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="stack" style={{ marginTop: '1.25rem', gap: '0.5rem' }}>
          {win && onNextMission ? (
            <button type="button" className="primary" style={{ width: '100%' }} onClick={onNextMission}>
              {hasLevelUps ? `${t('levelUp')} → ${t('campaignNext')}` : t('campaignNext')}
              {summary.nextMissionId ? `: ${t(summary.nextMissionId)}` : ''}
            </button>
          ) : null}
          <button
            type="button"
            className={win && onNextMission ? 'ghost' : 'primary'}
            style={{ width: '100%' }}
            onClick={onContinue}
          >
            {hasLevelUps && !onNextMission ? t('levelUp') : t('continueHub')}
          </button>
        </div>
      </div>
    </div>
  );
}

function totalStatWithDraft(w: any, k: string, draftPts: Record<string, number>) {
  const p = (w.points[k] || 0) + (draftPts[k] || 0);
  if (k === 'hp') return (w.base.hp || 0) + p * 3;
  if (k === 'sta') return (w.base.sta || 0) + p * 2;
  return (w.base[k] || 0) + p;
}

function LevelUpScreen({
  state,
  onPersist,
  onAllDone,
}: {
  state: any;
  onPersist: () => void;
  onAllDone: () => void;
}) {
  const pending = state.warriors.filter((w: any) => (w.freePoints || 0) > 0);
  const [rev, setRev] = useState(0);
  const [warId, setWarId] = useState(pending[0]?.id || '');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [spend, setSpend] = useState(0);

  // reset only when switching warrior or after confirmed apply (rev)
  useEffect(() => {
    if (!pending.length) return;
    if (!pending.some((x: any) => x.id === warId)) {
      setWarId(pending[0].id);
    }
    setDraft({});
    setSpend(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warId, pending.map((p: any) => p.id).join(','), rev]);

  const finish = useCallback(() => {
    onAllDone();
  }, [onAllDone]);

  useEffect(() => {
    if (!pending.length) {
      const id = window.setTimeout(finish, 40);
      return () => window.clearTimeout(id);
    }
  }, [pending.length, finish, rev]);

  if (!pending.length) {
    return (
      <div className="screen boot">
        <div className="boot-card">
          <p className="muted">{t('levelUpEmpty')}</p>
        </div>
      </div>
    );
  }

  const w = pending.find((x: any) => x.id === warId) || pending[0];
  const keys = ['hp', 'atk', 'def', 'spd', 'acc', 'eva', 'crit', 'blk', 'sta'];
  const freeLeft = Math.max(0, (w.freePoints || 0) - spend);
  const need = levelXpToNext(w.level);
  const xpPct = need > 0 ? Math.min(100, Math.round(((w.xp || 0) / need) * 100)) : 0;
  const dirty = spend > 0;

  function bump(k: string) {
    if (freeLeft <= 0) return;
    const next = totalStatWithDraft(w, k, { ...draft, [k]: (draft[k] || 0) + 1 });
    if (k !== 'hp' && k !== 'sta' && next > STAT_CAP) return;
    setDraft((d) => ({ ...d, [k]: (d[k] || 0) + 1 }));
    setSpend((s) => s + 1);
  }

  function confirmDraft() {
    if (!dirty) {
      // nothing to apply — next / finish
      if (pending.length > 1) {
        const rest = pending.filter((x: any) => x.id !== w.id);
        setWarId(rest[0].id);
        setDraft({});
        setSpend(0);
        setRev((n) => n + 1);
        return;
      }
      onAllDone();
      return;
    }
    for (const k of keys) {
      if (draft[k]) w.points[k] = (w.points[k] || 0) + draft[k];
    }
    w.freePoints = Math.max(0, (w.freePoints || 0) - spend);
    setDraft({});
    setSpend(0);
    onPersist();
    setRev((n) => n + 1);
    if (!(w.freePoints > 0) && !state.warriors.some((x: any) => x.id !== w.id && (x.freePoints || 0) > 0)) {
      onAllDone();
      return;
    }
    if ((w.freePoints || 0) <= 0 && pending.length > 1) {
      const next = state.warriors.find((x: any) => x.id !== w.id && (x.freePoints || 0) > 0);
      if (next) setWarId(next.id);
    }
  }

  function resetDraft() {
    setDraft({});
    setSpend(0);
  }

  return (
    <div className="screen boot">
      <div className="boot-card levelup-card" style={{ width: 'min(560px, 100%)', textAlign: 'left' }}>
        <div className="row" style={{ gap: '0.85rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <Portrait seed={w.portraitSeed || 1} name={w.name} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{t('levelUp')}</h2>
            <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{w.name}</div>
            <p className="muted" style={{ margin: '0.2rem 0 0' }}>
              {t('level')} {w.level} · {t('pointsLeft')}:{' '}
              <b style={{ color: 'var(--accent2)' }}>{freeLeft}</b>
              {dirty ? ` · ${t('allocated')}: ${spend}` : ''}
            </p>
          </div>
        </div>

        <p className="muted" style={{ fontSize: '0.88rem', marginTop: 0 }}>
          {t('draftHint')} {t('autoGainNote')}
        </p>

        <div className="levelup-xp" style={{ marginBottom: '0.85rem' }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span className="muted">{t('xpLabel')}</span>
            <span>
              {Math.round(w.xp || 0)} / {need}
            </span>
          </div>
          <div className="bar" style={{ height: 8, marginTop: 4 }}>
            <div style={{ width: `${xpPct}%`, height: '100%', background: 'var(--accent2)', borderRadius: 4 }} />
          </div>
        </div>

        <div className="stack levelup-stats">
          {keys.map((k) => {
            const draftN = draft[k] || 0;
            const total = totalStatWithDraft(w, k, draft);
            const capped = k !== 'hp' && k !== 'sta' && total >= STAT_CAP;
            const hint = k === 'hp' ? t('ptHintHp') : k === 'sta' ? t('ptHintSta') : t('ptHintStat');
            return (
              <div className="levelup-stat-row" key={k}>
                <div className="levelup-stat-meta">
                  <b>{t(k)}</b>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>
                    {t('currentStat')} <strong style={{ color: 'var(--text)' }}>{total}</strong>
                    {draftN ? ` · +${draftN}` : ''} · {hint}
                  </span>
                </div>
                <button type="button" disabled={freeLeft <= 0 || capped} onClick={() => bump(k)}>
                  +1
                </button>
              </div>
            );
          })}
        </div>

        <div className="row" style={{ marginTop: '1rem', gap: '0.5rem' }}>
          <button type="button" className="ghost" disabled={!dirty} onClick={resetDraft} style={{ flex: 1 }}>
            {t('resetDraft')}
          </button>
          <button type="button" className="primary" style={{ flex: 2 }} onClick={confirmDraft}>
            {dirty ? t('confirmLevelUp') : pending.length > 1 ? t('nextWarrior') : t('finishLevelUp')}
          </button>
        </div>
      </div>
    </div>
  );
}
