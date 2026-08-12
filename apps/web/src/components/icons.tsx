'use client';

/** Colorful game icons: PNG art when available, SVG fallback */

import { useState } from 'react';
import { resourceImageSrc } from './artCatalog';
import { GearIcon } from './gearArt';
import { UnitPortrait } from './UnitModel';

const size = (s?: number) => s ?? 22;

export function IconGold({ s }: { s?: number }) {
  return (
    <svg width={size(s)} height={size(s)} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="#c9a227" stroke="#7a5a10" strokeWidth="2" />
      <circle cx="16" cy="16" r="8" fill="#f0d060" />
      <text x="16" y="20" textAnchor="middle" fontSize="11" fontWeight="700" fill="#6a4a08">
        G
      </text>
    </svg>
  );
}

export function IconSpark({ s }: { s?: number }) {
  return (
    <svg width={size(s)} height={size(s)} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 2 L19 12 L30 12 L21 18 L24 28 L16 22 L8 28 L11 18 L2 12 L13 12 Z" fill="#8ec8ff" stroke="#3a6a9a" />
    </svg>
  );
}

export function IconRes({ id, s }: { id: string; s?: number }) {
  const n = size(s);
  const src = resourceImageSrc(id);
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={n}
        height={n}
        className="res-icon-img"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }

  return <IconResSvg id={id} s={n} />;
}

function IconResSvg({ id, s }: { id: string; s: number }) {
  if (id.includes('ore') || id.includes('bar') || id === 'coal' || id.includes('mythril') || id.includes('steel')) {
    const fill = id.includes('copper')
      ? '#c07040'
      : id.includes('iron') || id === 'coal'
        ? '#6a6a72'
        : id.includes('myth')
          ? '#70c0e0'
          : '#8a9098';
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <path d="M6 22 L12 8 L20 8 L26 22 Z" fill={fill} stroke="#2a2018" strokeWidth="1.5" />
        <path d="M10 18 L16 10 L22 18" fill="none" stroke="#fff4" strokeWidth="1.5" />
      </svg>
    );
  }
  if (id.includes('wood') || id.includes('yew') || id.includes('ash') || id.includes('plank')) {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <rect x="10" y="4" width="12" height="24" rx="3" fill="#6b4423" stroke="#3a2410" />
        <path d="M10 10 H22 M10 16 H22 M10 22 H22" stroke="#4a3018" strokeWidth="1.2" />
      </svg>
    );
  }
  if (id.includes('hide') || id.includes('leather') || id.includes('scale')) {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <ellipse cx="16" cy="18" rx="11" ry="8" fill="#8a5a3a" stroke="#3a2410" />
        <path d="M8 16 Q16 8 24 16" fill="none" stroke="#c49060" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
      <rect x="6" y="6" width="20" height="20" rx="4" fill="#4a4038" />
    </svg>
  );
}

export function IconWeapon({ type, s, blueprintId }: { type?: string; s?: number; blueprintId?: string }) {
  if (!type || type === 'unarmed') {
    const n = size(s);
    return (
      <svg width={n} height={n} viewBox="0 0 32 32" aria-hidden>
        <circle cx="11" cy="18" r="6" fill="#c4a070" stroke="#3a2410" strokeWidth="1.2" />
        <circle cx="21" cy="18" r="6" fill="#b89060" stroke="#3a2410" strokeWidth="1.2" />
        <path d="M8 14 Q11 8 16 10 Q21 8 24 14" fill="none" stroke="#3a2410" strokeWidth="1.2" />
      </svg>
    );
  }
  return <GearIcon weaponType={type} s={s} blueprintId={blueprintId || type} />;
}

export function IconSlot({ slot, s, blueprintId }: { slot: string; s?: number; blueprintId?: string }) {
  return <GearIcon slot={slot} s={s} blueprintId={blueprintId || slot} />;
}

export function IconStat({ stat, s }: { stat: string; s?: number }) {
  const colors: Record<string, string> = {
    hp: '#6a9a4e',
    atk: '#c45c26',
    def: '#4a7ac8',
    spd: '#d4a04a',
    acc: '#8ac',
    eva: '#5aac9a',
    crit: '#c66',
    blk: '#789',
    sta: '#a87',
  };
  const n = size(s);
  return (
    <svg width={n} height={n} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill={colors[stat] || '#666'} stroke="#1a1510" />
      <text x="12" y="16" textAnchor="middle" fontSize="9" fill="#111" fontWeight="800">
        {(stat || '?').slice(0, 1).toUpperCase()}
      </text>
    </svg>
  );
}

export function Portrait({
  seed,
  name,
  size = 64,
  warrior,
  itemsById,
}: {
  seed: number;
  name: string;
  size?: number;
  warrior?: any;
  itemsById?: Record<string, any>;
}) {
  if (warrior) {
    return <UnitPortrait warrior={warrior} itemsById={itemsById} size={size} name={name} />;
  }
  // Fallback bust without equip data
  return (
    <UnitPortrait
      loadout={{
        seed,
        name,
        weaponType: 'unarmed',
        weaponMetal: 'iron',
        offhand: null,
        helm: 'none',
        body: 'cloth',
        legs: 'cloth',
        accessory: false,
      }}
      size={size}
      name={name}
    />
  );
}

export function Stars({ n, max = 10 }: { n: number; max?: number }) {
  const v = Math.max(0, Math.min(max, n | 0));
  const pct = Math.round((v / max) * 100);
  return (
    <span className="stars-wrap" aria-label={`${v}/${max}`}>
      <span className="stars-label">
        <span className="star on">★</span>
        <b>
          {v}
        </b>
        <span className="muted">/{max}</span>
      </span>
      <span className="stars-bar">
        <i style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
