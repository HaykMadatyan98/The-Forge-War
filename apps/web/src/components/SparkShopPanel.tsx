'use client';

import {
  PORTRAIT_FRAMES,
  SPARK_SLOT_COST,
  SPARK_SLOT_MAX_TOTAL,
  buyEconomySlot,
  effectiveForgeSlots,
  effectiveMineSlots,
  ensureCosmetics,
  setPortraitFrame,
  t,
  unlockPortraitFrame,
} from '@tfw/game';
import { IconSpark } from './icons';
import { AccountAvatar } from './AccountAvatar';

export function SparkShopPanel({
  state,
  avatarKey,
  onClose,
  refresh,
  flash,
}: {
  state: any;
  avatarKey?: string | null;
  onClose?: () => void;
  refresh: () => void;
  flash: (m: string) => void;
}) {
  ensureCosmetics(state);
  const mineSlots = effectiveMineSlots(state);
  const forgeSlots = effectiveForgeSlots(state);

  function buySlot(domain: 'mine' | 'forge') {
    const res = buyEconomySlot(state, domain);
    if (!res.ok) {
      if (res.err === 'no_sparks') flash(`${t('noSparks')} (${SPARK_SLOT_COST})`);
      else if (res.err === 'max_slots') flash(t('buySlotMax'));
      else flash(res.err || 'err');
      return;
    }
    flash(`${t('buySlotOk')}: ${res.slots}/${SPARK_SLOT_MAX_TOTAL}`);
    refresh();
  }

  return (
    <div className="spark-shop-panel">
      <div className="spark-shop-panel-head">
        <div>
          <h3>{t('sparkShopTitle')}</h3>
          <p className="muted">{t('sparkShopHint')}</p>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="resource-chip res-chip-ico">
            <IconSpark s={16} /> <b>{state.sparks || 0}</b>
          </span>
          {onClose ? (
            <button type="button" className="ghost" onClick={onClose}>
              {t('cancel')}
            </button>
          ) : null}
        </div>
      </div>

      <p className="muted" style={{ fontSize: '0.82rem' }}>
        {t('sparksHint')}
      </p>

      <div className="spark-shop-slot-row">
        <button
          type="button"
          className={mineSlots < SPARK_SLOT_MAX_TOTAL && (state.sparks || 0) >= SPARK_SLOT_COST ? 'primary' : 'ghost'}
          disabled={mineSlots >= SPARK_SLOT_MAX_TOTAL || (state.sparks || 0) < SPARK_SLOT_COST}
          onClick={() => buySlot('mine')}
        >
          <IconSpark s={14} /> {t('buySlotMine')} · {SPARK_SLOT_COST}
          <span className="muted"> ({mineSlots}/{SPARK_SLOT_MAX_TOTAL})</span>
        </button>
        <button
          type="button"
          className={forgeSlots < SPARK_SLOT_MAX_TOTAL && (state.sparks || 0) >= SPARK_SLOT_COST ? 'primary' : 'ghost'}
          disabled={forgeSlots >= SPARK_SLOT_MAX_TOTAL || (state.sparks || 0) < SPARK_SLOT_COST}
          onClick={() => buySlot('forge')}
        >
          <IconSpark s={14} /> {t('buySlotForge')} · {SPARK_SLOT_COST}
          <span className="muted"> ({forgeSlots}/{SPARK_SLOT_MAX_TOTAL})</span>
        </button>
      </div>

      <div className="frame-grid">
        {PORTRAIT_FRAMES.map((f) => {
          const owned = state.cosmetics.frames.includes(f.id);
          const active = state.cosmetics.frame === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={`frame-pick ${active ? 'on' : ''}`}
              onClick={() => {
                if (owned) {
                  setPortraitFrame(state, f.id);
                  refresh();
                  return;
                }
                const res = unlockPortraitFrame(state, f.id);
                if (!res.ok) {
                  flash(res.err === 'no_sparks' ? `${t('noSparks')} (${f.cost})` : res.err || 'err');
                  return;
                }
                refresh();
                flash(res.already ? t('frameEquip') : `${t('frameUnlock')}: ${t(f.labelKey)}`);
              }}
            >
              <AccountAvatar avatarKey={avatarKey || 'p0'} name={t(f.labelKey)} size={48} frame={f.id} />
              <span>{t(f.labelKey)}</span>
              <span className="muted">
                {owned ? t('frameEquip') : (
                  <>
                    <IconSpark s={12} /> {f.cost || '—'}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
