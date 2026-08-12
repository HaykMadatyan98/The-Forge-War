'use client';

import { useEffect, useState } from 'react';
import {
  BLUEPRINTS,
  GEAR_SLOTS,
  MINE_BRANCHES,
  SMELT_RECIPES,
  WEAPON_PROFILES,
  WEAPON_TYPES,
  createWarrior,
  deployCap,
  dismantleReturn,
  effectiveStats,
  formatEta,
  getLang,
  hasMats,
  inventoryCap,
  isItemEquipped,
  isResourceUnlocked,
  itemSellValue,
  jobProgress,
  listResearchable,
  freeInventoryIds,
  matBreakdown,
  mineYieldAmount,
  primaryWeaponType,
  rarityClass,
  masteryXpToNext,
  rosterCap,
  startCraftJob,
  startMineJob,
  startResearch,
  startSmeltJob,
  t,
  addResource,
  allMissionsInOrder,
  campaignProgress,
  isMissionUnlocked,
  masteryBonusSnapshot,
  masteryBonusTable,
  MASTERY_CAP,
  mineSlotsUsed,
  forgeSlotsUsed,
  mineNodeProgress,
  forgeBranchProgress,
  equipOnWarrior,
  autoEquipWarrior,
  unequipAll,
  bestItemForSlot,
  itemPowerScore,
  equipCandidates,
  craftJobDurationMs,
  mineJobDurationMs,
  skipSparkCost,
  skipJobWithSparks,
  tickJobs,
  energyCostForMine,
  energyCostForSmelt,
  energyCostForCraft,
  energyRegenEta,
  adsLeftToday,
  claimEnergyAd,
  buyEnergyWithSparks,
  ENERGY_AD_AMOUNT,
  ENERGY_SPARK_PACK,
  ENERGY_AD_DAILY_MAX,
  hasEnergy,
  tickEnergy,
  createBotDefenseSquad,
  extractDefenseSquad,
  pvpThreat,
  pvpThreatLabelKey,
} from '@tfw/game';
import { fetchMyPvp, fetchPvpOpponents, type PvpOpponent, type PublicPlayer } from '@/lib/api';
import { connectRealtime, type LiveMatchedEvent } from '@/lib/realtime';
import { IconGold, IconRes, IconSlot, IconSpark, IconWeapon, Portrait, Stars } from './icons';
import { AccountAvatar } from './AccountAvatar';
import { FancySelect, StatGrid, SubTabs, CostList } from './ui';
import { GearIcon } from './gearArt';
import { UnitModel } from './UnitModel';

function EnergyLine({ cost, state }: { cost: number; state: any }) {
  tickEnergy(state);
  const have = state.energy?.current ?? 0;
  const ok = have >= cost;
  return (
    <span style={{ color: ok ? 'var(--good)' : 'var(--bad)', fontSize: '0.8rem' }}>
      {t('energyCost')}: {cost} ({have})
    </span>
  );
}

function EnergyRestorePanel({
  state,
  refresh,
  flash,
}: {
  state: any;
  refresh: () => void;
  flash: (m: string) => void;
}) {
  tickEnergy(state);
  const e = state.energy || { current: 0, max: 30 };
  const eta = energyRegenEta(state);
  const adsLeft = adsLeftToday(state);
  const full = e.current >= e.max;

  return (
    <div className="card energy-panel" style={{ marginBottom: '0.75rem', padding: '0.65rem 0.75rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <b>{t('energyPanel')}</b>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {e.current}/{e.max}
            {!full && eta > 0 ? ` · ${t('energyRegen')} ${formatEta(eta)}` : full ? ` · ${t('energyFull')}` : ''}
            {' · '}
            {t('energyTimeHint')}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ghost"
            disabled={adsLeft <= 0 || full}
            onClick={() => {
              // Simulated rewarded ad (real SDK can replace this later)
              const res = claimEnergyAd(state);
              if (!res.ok) {
                flash(res.err === 'ads_done' ? t('energyAdDone') : res.err);
                return;
              }
              flash(`${t('energyAd')}: ${t('energyAdGain')} (${res.adsLeft} left)`);
              refresh();
            }}
            title={t('energyAdGain')}
          >
            {t('energyAd')} +{ENERGY_AD_AMOUNT} ({adsLeft}/{ENERGY_AD_DAILY_MAX})
          </button>
          <button
            type="button"
            className="primary"
            disabled={(state.sparks || 0) < ENERGY_SPARK_PACK.sparks || full}
            onClick={() => {
              const res = buyEnergyWithSparks(state);
              if (!res.ok) {
                flash(res.err === 'no_sparks' ? t('noSparks') : res.err);
                return;
              }
              flash(`${t('energyBuySparks')}: +${res.gained}`);
              refresh();
            }}
            title={t('energyBuyHint')}
          >
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <IconSpark s={14} />
              {t('energyBuySparks')} +{ENERGY_SPARK_PACK.energy}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function trySkipJob(
  state: any,
  domain: 'mine' | 'forge' | 'research',
  index: number,
  refresh: () => void,
  flash: (m: string) => void,
) {
  const res = skipJobWithSparks(state, domain, index);
  if (!res.ok) {
    if (res.err === 'no_sparks') flash(`${t('noSparks')} (${res.cost || '?'} ${t('sparks')})`);
    else flash(res.err || 'err');
    return;
  }
  const done = tickJobs(state);
  refresh();
  if (done.length) {
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
      } else if (d.kind === 'research') parts.push(`${t('jobDoneResearch')} ${t(d.blueprintId)}`);
    }
    if (parts.length) flash(`${t('skipWithSparks')} −${res.cost} · ${parts.join(' · ')}`);
  }
}

function SkipSparkBtn({
  job,
  domain,
  index,
  state,
  refresh,
  flash,
}: {
  job: any;
  domain: 'mine' | 'forge' | 'research';
  index: number;
  state: any;
  refresh: () => void;
  flash: (m: string) => void;
}) {
  const now = Date.now();
  if (!job || job.endsAt <= now) return null;
  const cost = skipSparkCost(job, now);
  const can = (state.sparks || 0) >= cost;
  return (
    <button
      type="button"
      className={can ? 'primary' : 'ghost'}
      style={{ marginTop: 6, width: '100%', fontSize: '0.82rem' }}
      disabled={!can}
      onClick={() => trySkipJob(state, domain, index, refresh, flash)}
      title={t('sparksHint')}
    >
      <span className="row" style={{ justifyContent: 'center', gap: 6 }}>
        <IconSpark s={14} />
        {t('skipWithSparks')} · {cost}
      </span>
    </button>
  );
}

export function CampaignView({ state, onFight }: { state: any; onFight: (id: string, d: string) => void }) {
  const progress = campaignProgress(state);
  const missions = allMissionsInOrder();
  return (
    <>
      <div className="panel-header">
        <div>
          <h2>{t('campaign')}</h2>
          <p className="muted">{t('story_fields')}</p>
        </div>
        <div className="muted">
          {t('chapterProgress')}: {progress.cleared}/{progress.total} ({progress.percent}%)
          <br />
          {t('deployCap')}: {deployCap(state)} · {t('rosterCap')}: {state.warriors.length}/{rosterCap(state)}
        </div>
      </div>

      {progress.next ? (
        <div className="card campaign-next" style={{ marginBottom: '0.85rem' }}>
          <div className="muted">{t('campaignNext')}</div>
          <h3 style={{ margin: '0.2rem 0' }}>{t(progress.next.id)}</h3>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            {t(`intro_${progress.next.id}`)}
          </p>
          <div className="row" style={{ marginTop: '0.5rem', justifyContent: 'space-between' }}>
            <span className="muted">
              {t(progress.next.regionId)} · {t('foesLabel')} {progress.next.enemies} · Lv{progress.next.enemyLvl}
              {progress.next.boss ? ` · ${t('boss')}` : ''}
            </span>
            <MissionFight missionId={progress.next.id} onFight={onFight} primary />
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: '0.85rem' }}>
          <b>{t('campaignCleared')}</b>
          <p className="muted">{t('outro_hills_boss')}</p>
        </div>
      )}

      <h3>{t('campaignPath')}</h3>
      <div className="campaign-path">
        {missions.map((m: any, i: number) => {
          const cleared = !!state.campaign.cleared[m.id];
          const open = isMissionUnlocked(state, m.id);
          const isNext = progress.next?.id === m.id;
          return (
            <div className="mission-row" key={m.id}>
              <div className="mission-rail" aria-hidden>
                {i > 0 ? <span className="mission-rail-seg mission-rail-seg-top" /> : null}
                <span
                  className={`mission-dot ${cleared ? 'cleared' : ''} ${isNext ? 'current' : ''} ${!open ? 'locked' : ''}`}
                />
                {i < missions.length - 1 ? <span className="mission-rail-seg mission-rail-seg-bot" /> : null}
              </div>
              <div
                className={`card mission-node ${cleared ? 'cleared' : ''} ${isNext ? 'current' : ''} ${!open ? 'locked-card' : ''}`}
              >
                <div className="row" style={{ justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {i + 1}.
                      </span>
                      <b>{t(m.id)}</b>
                      {m.boss ? <span className="badge">{t('boss')}</span> : null}
                      {cleared ? (
                        <span className="badge" style={{ borderColor: 'var(--good)', color: 'var(--good)' }}>
                          ✓ {t('campaignCleared')}
                        </span>
                      ) : open ? (
                        <span className="badge">{t('campaignAvailable')}</span>
                      ) : (
                        <span className="badge">{t('campaignLocked')}</span>
                      )}
                    </div>
                    <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.86rem' }}>
                      {t(m.regionId)} · {t('foesLabel')} {m.enemies} · Lv{m.enemyLvl}
                    </p>
                    {open && !cleared ? (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.88rem', color: 'var(--text)' }}>
                        {t(`intro_${m.id}`)}
                      </p>
                    ) : null}
                    {cleared ? (
                      <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                        {t(`outro_${m.id}`)}
                      </p>
                    ) : null}
                  </div>
                  {open ? (
                    <MissionFight missionId={m.id} onFight={onFight} primary={isNext} />
                  ) : (
                    <span className="muted" style={{ fontSize: '0.8rem', maxWidth: 120, textAlign: 'right' }}>
                      {t('campaignLocked')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function MissionFight({
  missionId,
  onFight,
  primary,
}: {
  missionId: string;
  onFight: (id: string, d: string) => void;
  primary?: boolean;
}) {
  const [diff, setDiff] = useState('normal');
  return (
    <div className="row" style={{ flexShrink: 0 }}>
      <FancySelect
        value={diff}
        onChange={setDiff}
        options={[
          { value: 'normal', label: t('normal') },
          { value: 'hard', label: t('hard') },
          { value: 'brutal', label: t('brutal') },
        ]}
      />
      <button type="button" className={primary ? 'primary' : ''} onClick={() => onFight(missionId, diff)}>
        {t('fight')}
      </button>
    </div>
  );
}

export function MineView({ state, refresh, flash }: { state: any; refresh: () => void; flash: (m: string) => void }) {
  const [branch, setBranch] = useState<'metal' | 'wood' | 'leather'>('metal');
  const now = Date.now();
  tickEnergy(state);
  const def = MINE_BRANCHES[branch];
  const used = mineSlotsUsed(state);
  const maxSlots = state.mine.slots;
  const free = Math.max(0, maxSlots - used);

  const branchStock = [...def.mine, ...def.smelt.map((id: string) => SMELT_RECIPES[id]?.output).filter(Boolean)];

  return (
    <>
      <div className="panel-header">
        <div>
          <h2>{t('mine')}</h2>
          <p className="muted">
            {t('slotsUsed')}: {used}/{maxSlots}
            {free > 0 ? ` · ${free} free` : ` · ${t('noSlot')}`}
          </p>
        </div>
        <div className="econ-slot-bar" title={`${used}/${maxSlots}`}>
          {Array.from({ length: maxSlots }).map((_, i) => (
            <span key={i} className={`econ-slot-pip ${i < used ? 'fill' : ''}`} />
          ))}
        </div>
      </div>
      <EnergyRestorePanel state={state} refresh={refresh} flash={flash} />
      <SubTabs
        active={branch}
        onChange={(id) => setBranch(id as any)}
        tabs={[
          { id: 'metal', label: t('branchMetal') },
          { id: 'wood', label: t('branchWood') },
          { id: 'leather', label: t('branchLeather') },
        ]}
      />

      <div className="stock-strip">
        {branchStock.map((id: string) => (
          <span className="stock-chip" key={id}>
            <IconRes id={id} s={16} />
            {t(id)} <b>{state.resources[id] || 0}</b>
          </span>
        ))}
      </div>

      <h3>{t('queueTitle')}</h3>
      <div className="grid-cards">
        {!state.mine.jobs.length ? <div className="card muted">{t('emptySlot')}</div> : null}
        {state.mine.jobs.map((j: any, i: number) => {
          const p = Math.round(jobProgress(j, now) * 100);
          const rid = j.type === 'mine' ? j.resource : SMELT_RECIPES[j.recipeId]?.output;
          const qty =
            j.type === 'mine'
              ? j.amount ?? mineYieldAmount(state, j.resource)
              : SMELT_RECIPES[j.recipeId]?.amount ?? 1;
          const ready = j.endsAt <= now;
          return (
            <div className={`card job-card ${ready ? 'job-ready' : ''}`} key={i}>
              <div className="card-title-row">
                <IconRes id={rid || ''} />
                <b>{t(rid)}</b>
                {ready ? <span className="badge">{t('claim')}</span> : null}
              </div>
              <div className="muted">
                {j.type === 'mine' ? t('mineYield') : t('smeltOut')}:{' '}
                <b style={{ color: 'var(--good)' }}>+{qty}</b>
                {j.tier ? ` · ${t('jobTier')} ${j.tier}` : ''}
              </div>
              <div className="muted">{ready ? '…' : formatEta(j.endsAt - now)}</div>
              <div className="progress">
                <i style={{ width: `${p}%` }} />
              </div>
              <SkipSparkBtn job={j} domain="mine" index={i} state={state} refresh={refresh} flash={flash} />
            </div>
          );
        })}
      </div>
      <h3 style={{ marginTop: '1rem' }}>{t('startMine')}</h3>
      <div className="grid-cards">
        {def.mine.map((r) => {
          const open = isResourceUnlocked(state, r);
          const yieldAmt = mineYieldAmount(state, r);
          const prog = mineNodeProgress(state, r);
          return (
            <div className={`card ${open ? '' : 'locked-card'}`} key={r}>
              <div className="card-title-row">
                <IconRes id={r} s={28} />
                <h3>{t(r)}</h3>
              </div>
              {open ? (
                <>
                  <div className="muted">
                    {t('nodeLevel')} Lv {prog.level}
                    {prog.level < 10 ? ` · ${t('xpToNext')} ${prog.into}/${prog.need}` : ''}
                  </div>
                  <div className="progress progress-thin" style={{ margin: '0.35rem 0' }}>
                    <i style={{ width: `${Math.round(prog.pct * 100)}%` }} />
                  </div>
                  <div className="yield-line">
                    {t('mineYield')}: <b>+{yieldAmt}</b>
                    <span className="muted"> · {formatEta(mineJobDurationMs(r))}</span>
                  </div>
                  <div className="muted">
                    {t('stockLine')}: {state.resources[r] || 0}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <EnergyLine cost={energyCostForMine(r)} state={state} />
                  </div>
                  <button
                    type="button"
                    className="primary"
                    style={{ marginTop: '0.5rem' }}
                    disabled={free <= 0 || !hasEnergy(state, energyCostForMine(r))}
                    onClick={() => {
                      const res = startMineJob(state, r);
                      if (!res.ok) {
                        if (res.err === 'no_slot') flash(t('noSlot'));
                        else if (res.err === 'locked') flash(t('lockedByResearch'));
                        else if (res.err === 'no_energy') flash(`${t('noEnergy')} (${res.need})`);
                        else flash(res.err);
                      } else refresh();
                    }}
                  >
                    {t('startMine')} (+{yieldAmt})
                  </button>
                </>
              ) : (
                <p className="muted">{t('lockedByResearch')}</p>
              )}
            </div>
          );
        })}
      </div>
      <h3 style={{ marginTop: '1rem' }}>{t('refining')}</h3>
      <div className="grid-cards">
        {def.smelt.map((id) => {
          const recipe = SMELT_RECIPES[id];
          if (!recipe) return null;
          const open =
            isResourceUnlocked(state, recipe.output) || isResourceUnlocked(state, Object.keys(recipe.input)[0]);
          return (
            <div className={`card ${open ? '' : 'locked-card'}`} key={id}>
              <div className="card-title-row">
                <IconRes id={recipe.output} s={28} />
                <h3>{t(recipe.output)}</h3>
              </div>
              {open ? (
                <>
                  <div className="muted">
                    {t('stockLine')}: <b>{state.resources[recipe.output] || 0}</b>
                  </div>
                  <div className="yield-line">
                    {t('smeltOut')}: <b>+{recipe.amount}</b> {t(recipe.output)}
                  </div>
                  <CostList state={state} cost={recipe.input} />
                  <div style={{ marginTop: 4 }}>
                    <EnergyLine cost={energyCostForSmelt(id)} state={state} />
                  </div>
                  <button
                    type="button"
                    style={{ marginTop: '0.5rem' }}
                    disabled={!hasMats(state, recipe.input) || free <= 0 || !hasEnergy(state, energyCostForSmelt(id))}
                    onClick={() => {
                      const res = startSmeltJob(state, id);
                      if (!res.ok) {
                        if (res.err === 'no_mats') {
                          const miss = matBreakdown(state, recipe.input)
                            .filter((r) => !r.ok)
                            .map((r) => `${t(r.key)} (${r.missing})`)
                            .join(', ');
                          flash(`${t('missing')}: ${miss}`);
                        } else if (res.err === 'no_slot') flash(t('noSlot'));
                        else if (res.err === 'no_energy') flash(`${t('noEnergy')} (${res.need})`);
                        else flash(res.err === 'locked' ? t('lockedByResearch') : res.err);
                      } else refresh();
                    }}
                  >
                    {t('refining')}
                  </button>
                </>
              ) : (
                <p className="muted">{t('lockedByResearch')}</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ForgeView({ state, refresh, flash }: { state: any; refresh: () => void; flash: (m: string) => void }) {
  const [branch, setBranch] = useState('melee');
  const now = Date.now();
  tickEnergy(state);
  const list = Object.values(BLUEPRINTS).filter((bp: any) => bp.branch === branch);
  const used = forgeSlotsUsed(state);
  const maxSlots = state.forge.slots;
  const free = Math.max(0, maxSlots - used);
  const branchProg = forgeBranchProgress(state, branch);

  return (
    <>
      <div className="panel-header">
        <div>
          <h2>{t('forge')}</h2>
          <p className="muted">
            {t('slotsUsed')}: {used}/{maxSlots}
            {free > 0 ? ` · ${free} free` : ` · ${t('noSlot')}`}
          </p>
        </div>
        <div className="econ-slot-bar">
          {Array.from({ length: maxSlots }).map((_, i) => (
            <span key={i} className={`econ-slot-pip ${i < used ? 'fill' : ''}`} />
          ))}
        </div>
      </div>
      <EnergyRestorePanel state={state} refresh={refresh} flash={flash} />
      <SubTabs
        active={branch}
        onChange={setBranch}
        tabs={[
          { id: 'melee', label: t('branchMelee') },
          { id: 'pole', label: t('branchPole') },
          { id: 'ranged', label: t('branchRanged') },
          { id: 'armor', label: t('branchArmor') },
        ]}
      />
      <div className="card" style={{ marginBottom: '0.75rem', padding: '0.55rem 0.75rem' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            {t('forgeLevel')}: <b>Lv {branchProg.level}</b>
          </span>
          <span className="muted">
            {t('xpToNext')} {branchProg.into}/{branchProg.need}
          </span>
        </div>
        <div className="progress progress-thin" style={{ marginTop: 6 }}>
          <i style={{ width: `${Math.round(branchProg.pct * 100)}%` }} />
        </div>
      </div>
      <h3>{t('queueTitle')}</h3>
      <div className="grid-cards">
        {!state.forge.jobs.length ? <div className="card muted">{t('emptySlot')}</div> : null}
        {state.forge.jobs.map((j: any, i: number) => (
          <div className="card job-card" key={i}>
            <div className="card-title-row">
              <GearIcon
                blueprintId={j.blueprintId}
                weaponType={BLUEPRINTS[j.blueprintId]?.weaponType}
                slot={BLUEPRINTS[j.blueprintId]?.slot}
                s={36}
              />
              <b>{t(j.blueprintId)}</b>
            </div>
            <div className="muted">
              {formatEta(j.endsAt - now)}
              {j.tier ? ` · ${t('jobTier')} ${j.tier}` : ''}
            </div>
            <div className="progress">
              <i style={{ width: `${Math.round(jobProgress(j, now) * 100)}%` }} />
            </div>
            <SkipSparkBtn job={j} domain="forge" index={i} state={state} refresh={refresh} flash={flash} />
          </div>
        ))}
      </div>
      <div className="grid-cards" style={{ marginTop: '1rem' }}>
        {list.map((bp: any) => {
          const open = state.research.unlocked.includes(bp.id);
          const profile = bp.weaponType ? WEAPON_PROFILES[bp.weaponType] : null;
          return (
            <div className={`card ${open ? '' : 'locked-card'}`} key={bp.id}>
              <div className="card-title-row">
                <GearIcon blueprintId={bp.id} weaponType={bp.weaponType} slot={bp.slot} s={40} />
                <h3>{t(bp.id)}</h3>
              </div>
              <div className="muted">
                {open ? t('unlocked') : t('locked')} · T{bp.tier}
                {bp.weaponType ? ` · ${t(bp.weaponType)}` : ` · ${t(bp.slot)}`}
              </div>
              {bp.base ? <GearBonusLine base={bp.base} /> : null}
              {profile ? (
                <div className="muted gear-profile">
                  {t('rangeLabel')}: {profile.rangeMin}–{profile.rangeMax}
                  {profile.hands === 2 ? ` · ${t('hands2h')}` : ''}
                </div>
              ) : null}
              {open ? <CostList state={state} cost={bp.cost || {}} /> : <p className="muted">{t('lockedByResearch')}</p>}
              {open ? (
                <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  {t('craftEta')}: ~{formatEta(craftJobDurationMs(bp))} · T{bp.tier}
                  {' · '}
                  <EnergyLine cost={energyCostForCraft(bp.id)} state={state} />
                </div>
              ) : null}
              <button
                type="button"
                className="primary"
                style={{ marginTop: '0.5rem' }}
                disabled={!open || !hasMats(state, bp.cost) || free <= 0 || !hasEnergy(state, energyCostForCraft(bp.id))}
                onClick={() => {
                  const res = startCraftJob(state, bp.id);
                  if (!res.ok) {
                    if (res.err === 'no_mats') {
                      const miss = matBreakdown(state, bp.cost)
                        .filter((r) => !r.ok)
                        .map((r) => `${t(r.key)} (${r.missing})`)
                        .join(', ');
                      flash(`${t('missing')}: ${miss}`);
                    } else if (res.err === 'inv_full') flash(t('invFull'));
                    else if (res.err === 'no_slot') flash(t('noSlot'));
                    else if (res.err === 'no_energy') flash(`${t('noEnergy')} (${res.need})`);
                    else flash(res.err);
                  } else refresh();
                }}
              >
                {t('craft')}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ResearchView({ state, refresh, flash }: { state: any; refresh: () => void; flash: (m: string) => void }) {
  const list = listResearchable(state);
  const q = state.research.queue;
  return (
    <>
      <div className="panel-header">
        <div>
          <h2>{t('research')}</h2>
          <p className="muted">{t('researchHint')}</p>
        </div>
      </div>
      <div className="card research-queue">
        {q ? (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="muted">{t('researching')}</div>
                <b style={{ fontSize: '1.05rem' }}>{t(q.blueprintId)}</b>
              </div>
              <span className="badge">{formatEta(q.endsAt - Date.now())}</span>
            </div>
            <div className="progress" style={{ marginTop: '0.65rem' }}>
              <i style={{ width: `${Math.round(jobProgress(q) * 100)}%` }} />
            </div>
            <SkipSparkBtn job={q} domain="research" index={0} state={state} refresh={refresh} flash={flash} />
          </>
        ) : (
          <span className="muted">{t('emptySlot')}</span>
        )}
      </div>
      <div className="grid-cards research-grid">
        {list.map((tech: any) => {
          const busy = !!state.research.queue;
          const can = !busy && state.gold >= tech.gold;
          const bp = BLUEPRINTS[tech.blueprintId];
          return (
            <div className="card research-card" key={tech.id}>
              <div className="research-card-top">
                <div className="research-icon-wrap">
                  <GearIcon
                    blueprintId={tech.blueprintId}
                    weaponType={bp?.weaponType}
                    slot={bp?.slot}
                    s={36}
                  />
                </div>
                <div className="research-card-meta">
                  <h3>{t(tech.blueprintId)}</h3>
                  <p className="muted research-desc">
                    {t('researchUnlock')}. {t('researchAlsoResources')}.
                  </p>
                </div>
              </div>
              <div className="research-card-foot">
                <div className="cost-pill">
                  <IconGold s={16} />
                  <span>{tech.gold}</span>
                  <span className="muted">{t('gold')}</span>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={!can}
                  onClick={() => {
                    const res = startResearch(state, tech);
                    if (!res.ok) flash(res.err === 'no_gold' ? t('noGold') : res.err);
                    else refresh();
                  }}
                >
                  {t('researchStart')}
                </button>
              </div>
            </div>
          );
        })}
        {!list.length ? <div className="card muted">{t('researchDone')}</div> : null}
      </div>
    </>
  );
}

export function BarracksView({ state, refresh, flash }: { state: any; refresh: () => void; flash: (m: string) => void }) {
  const [selectedId, setSelectedId] = useState(state.warriors[0]?.id || null);
  const [section, setSection] = useState<'hero' | 'stats' | 'mastery' | 'equip'>('hero');
  const [masteryOpen, setMasteryOpen] = useState<string | null>(null);
  const w = state.warriors.find((x: any) => x.id === selectedId) || state.warriors[0];
  if (!w) return <p className="muted">{t('empty')}</p>;
  const idx = state.warriors.findIndex((x: any) => x.id === w.id);
  const st = effectiveStats(w, state.items);
  const activeW = primaryWeaponType(w, state.items);

  function equipTo(slot: string, itemId: string) {
    const res = equipOnWarrior(state, w, slot, itemId);
    if (!res.ok) return flash(res.err === 'slot' ? t('equip') : res.err || 'err');
    refresh();
  }

  const masteryTable = masteryBonusTable(MASTERY_CAP);

  function formatMasteryRow(snap: ReturnType<typeof masteryBonusSnapshot>) {
    const bits: string[] = [
      `${t('masteryDmgAcc')}: ×${(snap.mult).toFixed(2)} (${snap.multPct}%)`,
      `${t('acc')}: +${snap.accFlat}`,
    ];
    if (snap.atkPct > 0) bits.push(`${t('atk')}: +${snap.atkPctText}%`);
    if (snap.defFlat > 0) bits.push(`${t('def')}: +${snap.defFlat}`);
    if (snap.extraAttacks > 0) bits.push(`${t('masteryExtraHits')}: +${snap.extraAttacks}`);
    return bits.join(' · ');
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <h2>{t('barracks')}</h2>
          <p className="muted">
            {t('deployCap')} {deployCap(state)} · {t('rosterCap')} {rosterCap(state)} · Lv {state.barracksLevel}
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            onClick={() => {
              const prev = state.warriors[(idx - 1 + state.warriors.length) % state.warriors.length];
              setSelectedId(prev.id);
              setMasteryOpen(null);
            }}
          >
            {t('prevHero')}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = state.warriors[(idx + 1) % state.warriors.length];
              setSelectedId(next.id);
              setMasteryOpen(null);
            }}
          >
            {t('nextHero')}
          </button>
        </div>
      </div>

      <section className="barracks-section">
        <h3 className="barracks-section-title">{t('barracksRoster')}</h3>
        <div className="warrior-grid">
          {state.warriors.map((hero: any) => (
            <button
              key={hero.id}
              type="button"
              className={`warrior-card ${hero.id === w.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedId(hero.id);
                setMasteryOpen(null);
              }}
            >
              <Portrait seed={hero.portraitSeed || 1} name={hero.name} size={72} warrior={hero} itemsById={state.items} />
              <div className={`wname ${rarityClass(hero.rarity)}`}>{hero.name}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {t('level')} {hero.level} · {t(primaryWeaponType(hero, state.items))}
              </div>
              {(() => {
                const hs = effectiveStats(hero, state.items);
                const wt = primaryWeaponType(hero, state.items);
                return (
                  <div className="warrior-card-meta">
                    <span>
                      {t('atk')} {hs.atk}
                    </span>
                    <span>
                      {t('def')} {hs.def}
                    </span>
                    {wt !== 'unarmed' ? (
                      <span className="row" style={{ gap: 3 }}>
                        <IconWeapon type={wt} s={16} />
                        <Stars n={hero.mastery[wt]?.stars || 0} max={10} />
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.72rem' }}>
                        {t('fists')}
                      </span>
                    )}
                  </div>
                );
              })()}
            </button>
          ))}
        </div>
      </section>

      <div className="barracks-detail card">
        <div className="barracks-detail-head">
          <div className="row" style={{ gap: '0.75rem', alignItems: 'center' }}>
            <Portrait seed={w.portraitSeed || 1} name={w.name} size={64} warrior={w} itemsById={state.items} />
            <div>
              <h3 className={rarityClass(w.rarity)} style={{ margin: 0 }}>
                {w.name}
              </h3>
              <div className="muted">
                {t('level')} {w.level} · <span className={rarityClass(w.rarity)}>{t(w.rarity)}</span>
                {` · ${t(primaryWeaponType(w, state.items))}`}
                {` · ${t('atk')} ${st.atk} · ${t('def')} ${st.def}`}
              </div>
            </div>
          </div>
          <SubTabs
            active={section}
            onChange={(id) => setSection(id as typeof section)}
            tabs={[
              { id: 'hero', label: t('barracksSectionHero') },
              { id: 'stats', label: t('stats') },
              { id: 'mastery', label: t('allMastery') },
              { id: 'equip', label: t('equip') },
            ]}
          />
        </div>

        {section === 'hero' ? (
          <section className="barracks-panel">
            <div className="unit-stage">
              <UnitModel warrior={w} itemsById={state.items} size={200} />
              <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
                {t('barracksHeroHint')}
              </p>
            </div>
            <label className="barracks-name-field">
              <span className="muted">{t('barracksRename')}</span>
              <input
                value={w.name}
                onChange={(e) => {
                  w.name = e.target.value.slice(0, 28);
                  refresh();
                }}
              />
            </label>
          </section>
        ) : null}

        {section === 'stats' ? (
          <section className="barracks-panel">
            <h4 style={{ margin: '0 0 0.5rem' }}>{t('stats')}</h4>
            <StatGrid stats={{ ...st, move: st.move }} />
          </section>
        ) : null}

        {section === 'mastery' ? (
          <section className="barracks-panel">
            <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.88rem' }}>
              {t('masteryClickHint')}
            </p>
            <div className="mastery-grid">
              {WEAPON_TYPES.map((wt) => {
                const m = w.mastery[wt] || { stars: 0, xp: 0 };
                const open = masteryOpen === wt;
                const snap = masteryBonusSnapshot(m.stars || 0);
                const xpNeed = masteryXpToNext(m.stars || 0);
                return (
                  <div key={wt} className={`mastery-card ${wt === activeW ? 'active-w' : ''} ${open ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="mastery-card-btn"
                      onClick={() => setMasteryOpen(open ? null : wt)}
                      aria-expanded={open}
                    >
                      <IconWeapon type={wt} s={26} />
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div className="row" style={{ justifyContent: 'space-between', gap: '0.35rem' }}>
                          <b>{t(wt)}</b>
                          <span className="muted" style={{ fontSize: '0.78rem' }}>
                            {open ? '▾' : '▸'} {t('masteryDetails')}
                          </span>
                        </div>
                        <Stars n={m.stars} max={10} />
                        <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                          XP {Math.round(m.xp || 0)}
                          {(m.stars || 0) < MASTERY_CAP ? ` / ${xpNeed}` : ''}
                        </div>
                        <div className="mastery-now muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                          {t('masteryNow')}: {formatMasteryRow(snap)}
                        </div>
                      </div>
                    </button>
                    {open ? (
                      <div className="mastery-expand">
                        <div className="mastery-expand-title muted">{t('masteryByStars')}</div>
                        <div className="mastery-levels">
                          {masteryTable.map((row) => {
                            const isCur = row.stars === (m.stars || 0);
                            const unlocked = row.stars <= (m.stars || 0);
                            return (
                              <div
                                key={row.stars}
                                className={`mastery-level-row ${isCur ? 'current' : ''} ${unlocked ? 'unlocked' : 'locked'}`}
                              >
                                <span className="mastery-level-star">
                                  ★ {row.stars}
                                </span>
                                <span className="mastery-level-fx">{formatMasteryRow(row)}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mastery-milestones muted">
                          <div>
                            <b>★5</b> — {t('masteryMilestone5')}
                          </div>
                          <div>
                            <b>★7</b> — {t('masteryMilestone7')}
                          </div>
                          <div>
                            <b>★10</b> — {t('masteryMilestone10')}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {section === 'equip' ? (
          <section className="barracks-panel">
            <div className="row" style={{ marginBottom: '0.65rem', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const n = autoEquipWarrior(state, w);
                  refresh();
                  flash(n ? `${t('autoEquip')}: ${n}` : t('empty'));
                }}
              >
                {t('autoEquip')}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  unequipAll(w);
                  refresh();
                }}
              >
                {t('stripGear')}
              </button>
            </div>
            <div className="equip-slots">
              {GEAR_SLOTS.map((slot) => {
                const equipped = w.equip[slot] ? state.items[w.equip[slot]] : null;
                const best = bestItemForSlot(state, w, slot);
                const canUpgrade = best && (!equipped || itemPowerScore(best) > itemPowerScore(equipped));
                const options = [
                  { value: '', label: t('empty') },
                  ...equipCandidates(state, w, slot).map((it: any) => ({
                    value: it.id,
                    label: `${t(it.blueprintId)} (${t(it.rarity)}) ${Object.entries(it.stats || {})
                      .map(([k, v]) => `${t(k)}+${v}`)
                      .join(' ')}`,
                  })),
                ];
                return (
                  <div className="equip-slot" key={slot}>
                    <h4>
                      <IconSlot slot={slot} s={18} blueprintId={equipped?.blueprintId || slot} /> {t(slot)}
                    </h4>
                    <div className="equip-preview">
                      {equipped ? (
                        <GearIcon
                          blueprintId={equipped.blueprintId}
                          weaponType={equipped.weaponType}
                          slot={equipped.slot}
                          s={40}
                        />
                      ) : (
                        <span className="muted equip-empty-icon">—</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className={equipped ? rarityClass(equipped.rarity) : 'muted'}
                          style={{ fontSize: '0.85rem' }}
                        >
                          {equipped ? t(equipped.blueprintId) : t('equipEmpty')}
                        </div>
                        {equipped?.stats ? (
                          <div className="muted" style={{ fontSize: '0.75rem' }}>
                            {Object.entries(equipped.stats)
                              .map(([k, v]) => `${t(k)}+${v}`)
                              .join(' · ')}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <FancySelect value={w.equip[slot] || ''} options={options} onChange={(v) => equipTo(slot, v)} />
                    {canUpgrade && best ? (
                      <button
                        type="button"
                        className="equip-best-btn"
                        style={{ marginTop: 6, width: '100%' }}
                        onClick={() => equipTo(slot, best.id)}
                      >
                        {t('bestEquip')}: {t(best.blueprintId)} ({t(best.rarity)})
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

export function TavernView({ state, refresh, flash }: { state: any; refresh: () => void; flash: (m: string) => void }) {
  const costGold = 40 + state.warriors.length * 15;
  const hire = (pay: 'gold' | 'sparks') => {
    if (state.warriors.length >= rosterCap(state)) return;
    if (pay === 'gold') {
      if (state.gold < costGold) return flash(t('noGold'));
      state.gold -= costGold;
    } else {
      if (state.sparks < 1) return;
      state.sparks -= 1;
    }
    state.warriors.push(createWarrior({ lang: getLang() }));
    refresh();
  };
  return (
    <>
      <div className="panel-header">
        <div>
          <h2>{t('tavern')}</h2>
          <p className="muted">
            {t('rosterCap')}: {state.warriors.length}/{rosterCap(state)}
          </p>
        </div>
      </div>
      <div className="grid-cards">
        <div className="card">
          <h3 className="card-title-row">
            <IconGold /> {t('hire')}
          </h3>
          <p className="muted">
            {costGold} {t('gold')}
          </p>
          <button type="button" className="primary" onClick={() => hire('gold')}>
            {t('hire')}
          </button>
        </div>
        <div className="card">
          <h3>{t('hire')} — {t('sparks')}</h3>
          <p className="muted">1 {t('sparks')}</p>
          <button type="button" onClick={() => hire('sparks')}>
            {t('hire')}
          </button>
        </div>
      </div>
    </>
  );
}

export function InventoryView({ state, refresh }: { state: any; refresh: () => void }) {
  const freeIds = freeInventoryIds(state);
  return (
    <>
      <div className="panel-header">
        <h2>
          {t('inventory')} — {t('freeItems')} {freeIds.length}/{inventoryCap(state)}
        </h2>
      </div>
      {!freeIds.length ? <p className="muted">{t('warehouseEmpty')}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>{t('c')}</th>
            <th>{t('stats')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {freeIds.map((id: string) => {
            const it = state.items[id];
            if (!it) return null;
            return (
              <tr key={id}>
                <td>
                  <span className="row">
                    <GearIcon
                      blueprintId={it.blueprintId}
                      weaponType={it.weaponType}
                      slot={it.slot}
                      s={28}
                    />
                    {t(it.blueprintId)}
                  </span>
                </td>
                <td className={rarityClass(it.rarity)}>{t(it.rarity)}</td>
                <td className="muted">
                  {Object.entries(it.stats)
                    .map(([k, v]) => `${t(k)} +${v}`)
                    .join(' · ')}
                </td>
                <td className="row">
                  <button
                    type="button"
                    onClick={() => {
                      state.gold += itemSellValue(it);
                      state.inventory = state.inventory.filter((x: string) => x !== id);
                      delete state.items[id];
                      refresh();
                    }}
                  >
                    {t('sell')} ({itemSellValue(it)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ret = dismantleReturn(it);
                      for (const [k, n] of Object.entries(ret)) addResource(state, k, n as number);
                      state.inventory = state.inventory.filter((x: string) => x !== id);
                      delete state.items[id];
                      refresh();
                    }}
                  >
                    {t('dismantle')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function GearBonusLine({ base }: { base: Record<string, number> }) {
  const entries = Object.entries(base || {}).filter(([, v]) => typeof v === 'number' && v !== 0);
  if (!entries.length) return null;
  return (
    <div className="gear-bonuses" aria-label={t('gearStats')}>
      {entries.map(([k, v]) => (
        <span className="gear-bonus" key={k}>
          <span className="muted">{t(k)}</span>{' '}
          <b className={v > 0 ? 'bonus-pos' : 'bonus-neg'}>
            {v > 0 ? '+' : ''}
            {v}
          </b>
        </span>
      ))}
    </div>
  );
}

export function PvpView({
  state,
  player,
  flash,
  onAttack,
  onPostDefense,
}: {
  state: any;
  player: PublicPlayer | null;
  flash: (m: string) => void;
  onAttack: (op: {
    playerId: string;
    displayName?: string;
    avatarKey?: string | null;
    isBot?: boolean;
    squad: { warriors: any[]; items: Record<string, any>; power?: number };
  }) => void;
  onPostDefense: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'players' | 'ai'>('players');
  const [opponents, setOpponents] = useState<PvpOpponent[]>([]);
  const [mine, setMine] = useState<{
    power: number;
    wins: number;
    losses: number;
    updatedAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'queued' | 'matched'>('idle');
  const [liveMatch, setLiveMatch] = useState<LiveMatchedEvent | null>(null);
  const myPower = extractDefenseSquad(state).power || 0;
  const defenseStale =
    !!mine && Math.abs((mine.power || 0) - myPower) >= 8;
  const defenseMissing = !!player && !mine;

  function reload() {
    if (!player) return;
    setLoading(true);
    Promise.all([fetchPvpOpponents(12, myPower), fetchMyPvp()])
      .then(([list, me]) => {
        setOpponents(list.opponents || []);
        setMine(me.defense);
      })
      .catch(() => flash(t('authFail')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  useEffect(() => {
    if (!player) return;
    const sock = connectRealtime();
    const onMatched = (ev: LiveMatchedEvent) => {
      setLiveStatus('matched');
      setLiveMatch(ev);
      flash(t('livePvpMatched') || 'Live match found!');
    };
    sock.on('live:matched', onMatched);
    return () => {
      sock.off('live:matched', onMatched);
    };
  }, [player, flash]);

  function joinLiveQueue() {
    if (!player) return;
    const sock = connectRealtime();
    setLiveStatus('queued');
    sock.emit('live:queue', {}, (res: { status?: string; error?: string }) => {
      if (res?.error) {
        setLiveStatus('idle');
        flash(t('livePvpFail') || 'Queue failed');
      } else if (res?.status === 'queued') {
        flash(t('livePvpQueued') || 'Searching opponent…');
      }
    });
  }

  async function postDefense() {
    setPosting(true);
    try {
      await onPostDefense();
      reload();
    } finally {
      setPosting(false);
    }
  }

  function fightAi(difficulty: 'easy' | 'normal' | 'hard') {
    if (!state.warriors?.length) {
      flash(t('pvpDefenseNeed'));
      return;
    }
    const bot = createBotDefenseSquad(Date.now() % 97, difficulty, myPower);
    onAttack({
      playerId: `bot_${difficulty}_${Date.now()}`,
      displayName: bot.displayName,
      avatarKey: bot.avatarKey,
      isBot: true,
      squad: bot,
    });
  }

  function powerBar(my: number, their: number) {
    const max = Math.max(my, their, 1);
    return (
      <div className="pvp-power-bar" title={`${my} vs ${their}`}>
        <i className="mine" style={{ width: `${Math.round((my / max) * 100)}%` }} />
        <i className="theirs" style={{ width: `${Math.round((their / max) * 100)}%` }} />
      </div>
    );
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <h2>{t('pvpTitle')}</h2>
          <p className="muted">{mode === 'players' ? t('pvpHintPlayers') : t('pvpHintAi')}</p>
        </div>
        <div className="pvp-stats">
          <div>
            {t('pvpPower')}: <b>{myPower}</b>
          </div>
          {mine ? (
            <div className="muted">
              {t('pvpRecord')}: {mine.wins}
              {t('pvpWins')} / {mine.losses}
              {t('pvpLosses')}
            </div>
          ) : null}
        </div>
      </div>

      {player ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>{t('livePvp') || 'Live PvP'}</h3>
          <p className="muted">{t('livePvpHint') || 'Real-time matchmaking via WebSocket'}</p>
          {liveMatch ? (
            <p>
              {t('livePvpOpponent') || 'Opponent'}: <b>{liveMatch.opponentId.slice(0, 8)}…</b>
            </p>
          ) : null}
          <div className="row" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="primary"
              disabled={liveStatus === 'queued'}
              onClick={joinLiveQueue}
            >
              {liveStatus === 'queued' ? t('livePvpSearching') || 'Searching…' : t('livePvpJoin') || 'Find match'}
            </button>
            {liveStatus !== 'idle' ? (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  connectRealtime().emit('live:leave');
                  setLiveStatus('idle');
                  setLiveMatch(null);
                }}
              >
                {t('cancel') || 'Cancel'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {player ? (
        <div
          className={`pvp-defense-banner ${defenseMissing ? 'missing' : defenseStale ? 'stale' : 'ok'}`}
        >
          <div>
            {defenseMissing ? (
              <>
                <b>{t('pvpDefenseMissing')}</b>
                <p className="muted">{t('pvpDefenseMissingHint')}</p>
              </>
            ) : defenseStale ? (
              <>
                <b>{t('pvpDefenseStale')}</b>
                <p className="muted">
                  {t('pvpDefensePosted')}: {mine!.power} → {t('pvpPower')} {myPower}
                </p>
              </>
            ) : (
              <>
                <b>{t('pvpDefenseLive')}</b>
                <p className="muted">
                  {t('pvpDefensePosted')}: {mine!.power}
                </p>
              </>
            )}
          </div>
          <button type="button" className="primary" disabled={posting || !state.warriors?.length} onClick={() => void postDefense()}>
            {posting ? '…' : defenseMissing ? t('pvpSetDefense') : t('pvpUpdateDefense')}
          </button>
        </div>
      ) : null}

      <div className="boot-tabs pvp-mode-tabs">
        <button
          type="button"
          className={mode === 'players' ? 'primary' : 'ghost'}
          onClick={() => setMode('players')}
        >
          {t('pvpModePlayers')}
        </button>
        <button type="button" className={mode === 'ai' ? 'primary' : 'ghost'} onClick={() => setMode('ai')}>
          {t('pvpModeAi')}
        </button>
      </div>

      {mode === 'players' ? (
        <>
          {!player ? (
            <p className="muted">{t('pvpNeedLogin')}</p>
          ) : (
            <div className="row pvp-toolbar">
              <button type="button" className="ghost" disabled={loading} onClick={reload}>
                {loading ? '…' : t('pvpRefresh')}
              </button>
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                {t('pvpMatchNear')}
              </span>
            </div>
          )}

          <div className="pvp-list">
            {!player ? null : opponents.length === 0 ? (
              <div className="card pvp-card">
                <p className="muted">{t('pvpNoOpponentsHuman')}</p>
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  {t('pvpNoOpponentsHumanHint')}
                </p>
              </div>
            ) : (
              opponents.map((op) => {
                const threat = pvpThreat(myPower, op.power);
                const preview =
                  op.rosterPreview ||
                  (op.squad?.warriors || []).slice(0, 4).map((w: any) => ({
                    name: w.name || '?',
                    level: w.level || 1,
                  }));
                return (
                  <div key={op.playerId} className="card pvp-card">
                    <div className="pvp-card-main">
                      <AccountAvatar avatarKey={op.avatarKey} name={op.displayName} size={52} />
                      <div className="pvp-card-body">
                        <div className="pvp-card-top">
                          <b>{op.displayName}</b>
                          <span className={`pvp-threat threat-${threat}`}>{t(pvpThreatLabelKey(threat))}</span>
                        </div>
                        <div className="muted pvp-card-meta">
                          {t('pvpPower')} {op.power}
                          <span className="dot">·</span>
                          {op.warriorCount} {t('pvpWarriors')}
                          <span className="dot">·</span>
                          {op.wins}
                          {t('pvpWins')}/{op.losses}
                          {t('pvpLosses')}
                        </div>
                        {powerBar(myPower, op.power)}
                        {preview.length ? (
                          <div className="pvp-roster-preview">
                            {preview.map((w, i) => (
                              <span key={i}>
                                {w.name} <em>Lv{w.level}</em>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="primary"
                        disabled={!state.warriors?.length}
                        onClick={() =>
                          onAttack({
                            playerId: op.playerId,
                            displayName: op.displayName,
                            avatarKey: op.avatarKey,
                            isBot: false,
                            squad: op.squad,
                          })
                        }
                      >
                        {t('pvpFight')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="pvp-ai-grid">
          {(['easy', 'normal', 'hard'] as const).map((d) => {
            const sample = createBotDefenseSquad(7, d, myPower);
            const threat = pvpThreat(myPower, sample.power || 1);
            return (
              <div key={d} className={`card pvp-card pvp-ai-card tier-${d}`}>
                <div className="pvp-ai-head">
                  <AccountAvatar avatarKey={sample.avatarKey} name={sample.displayName} size={44} />
                  <div>
                    <b>
                      {d === 'easy' ? t('pvpAiEasy') : d === 'hard' ? t('pvpAiHard') : t('pvpAiNormal')}
                    </b>
                    <div>
                      <span className={`pvp-threat threat-${threat}`}>{t(pvpThreatLabelKey(threat))}</span>
                    </div>
                  </div>
                </div>
                <p className="muted pvp-ai-hint">
                  {d === 'easy' ? t('pvpAiEasyHint') : d === 'hard' ? t('pvpAiHardHint') : t('pvpAiNormalHint')}
                </p>
                <div className="muted pvp-card-meta">
                  {t('pvpPower')} ~{sample.power}
                  <span className="dot">·</span>
                  {sample.warriors.length} {t('pvpWarriors')}
                </div>
                {powerBar(myPower, sample.power || 1)}
                <button
                  type="button"
                  className="primary"
                  style={{ width: '100%', marginTop: 10 }}
                  disabled={!state.warriors?.length}
                  onClick={() => fightAi(d)}
                >
                  {t('pvpFight')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

