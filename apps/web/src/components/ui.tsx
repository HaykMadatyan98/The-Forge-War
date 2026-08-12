'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconRes, IconStat } from './icons';
import { matBreakdown, t } from '@tfw/game';

type Opt = { value: string; label: string; disabled?: boolean };

export function FancySelect({
  value,
  options,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  const placeMenu = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const maxH = 240;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const openUp = spaceBelow < 100 && r.top > spaceBelow;
    setMenuBox({
      top: openUp ? Math.max(8, r.top - Math.min(maxH, options.length * 42) - 4) : r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 140),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    placeMenu();
    const onWin = () => placeMenu();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const menu =
    open && menuBox && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="fselect-menu fselect-menu-portal"
            role="listbox"
            style={{
              position: 'fixed',
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              zIndex: 10000,
            }}
          >
            {options.map((o) => (
              <button
                key={o.value || 'empty'}
                type="button"
                role="option"
                disabled={o.disabled}
                className={`fselect-opt ${o.value === value ? 'active' : ''}`}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`fselect ${open ? 'is-open' : ''} ${className}`} ref={ref}>
      <button
        ref={btnRef}
        type="button"
        className="fselect-btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="fselect-label">{current?.label || placeholder || t('pickItem')}</span>
        <span className="fselect-caret">{open ? '▴' : '▾'}</span>
      </button>
      {menu}
    </div>
  );
}

/** Cost list with have / need / stock on warehouse */
export function CostList({ state, cost }: { state: any; cost: Record<string, number> }) {
  const rows = matBreakdown(state, cost || {});
  if (!rows.length) return null;
  const missing = rows.filter((r) => !r.ok);
  return (
    <div className="cost-list">
      <div className="cost-list-title muted">{t('costTitle')}</div>
      <div className="cost-list-rows">
        {rows.map((r) => (
          <div className={`cost-row ${r.ok ? 'ok' : 'short'}`} key={r.key}>
            <span className="cost-row-name">
              <IconRes id={r.key === 'gold' ? 'gold' : r.key} s={18} />
              <span className="cost-row-label">{t(r.key)}</span>
            </span>
            <span className="cost-row-nums" title={`${t('stock')}: ${r.have}`}>
              <span className="cost-stock muted">{t('stock')}</span>
              <span className={r.ok ? 'cost-have' : 'warn-text'}>{r.have}</span>
              <span className="muted"> / {r.need}</span>
            </span>
          </div>
        ))}
      </div>
      {missing.length ? (
        <div className="cost-missing">
          <b>{t('missing')}:</b> {missing.map((r) => `${t(r.key)} (−${r.missing})`).join(', ')}
        </div>
      ) : (
        <div className="cost-ready">{t('readyToCraft')}</div>
      )}
    </div>
  );
}

export function StatGrid({ stats }: { stats: Record<string, number> }) {
  const keys = ['hp', 'atk', 'def', 'spd', 'acc', 'eva', 'crit', 'blk', 'sta', 'move'];
  const maxRef: Record<string, number> = {
    hp: 80,
    atk: 40,
    def: 40,
    spd: 30,
    acc: 30,
    eva: 30,
    crit: 30,
    blk: 30,
    sta: 60,
    move: 8,
  };
  return (
    <div className="stat-grid">
      {keys.map((k) => {
        const v = stats[k] ?? 0;
        const pct = Math.min(100, Math.round((v / (maxRef[k] || 40)) * 100));
        return (
          <div className="stat-row" key={k}>
            <div className="stat-label">
              <IconStat stat={k === 'move' ? 'spd' : k} s={18} />
              <span>{t(k === 'move' ? 'movePts' : k)}</span>
            </div>
            <div className="stat-bar-wrap">
              <div className="stat-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
              <b className="stat-val">{v}</b>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SubTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="subtabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === active ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
