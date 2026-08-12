'use client';

import { useId, useState } from 'react';
import { metalFromId, metalPalette } from './gearVisual';
import { gearImageSrc } from './artCatalog';

const size = (s?: number) => s ?? 40;

/** Preferred: generated PNG art; falls back to painted SVG glyph. */
export function GearIcon({
  blueprintId,
  weaponType,
  slot,
  s,
}: {
  blueprintId?: string | null;
  weaponType?: string;
  slot?: string;
  s?: number;
}) {
  const n = size(s);
  const src = gearImageSrc({ blueprintId, weaponType, slot });
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={n}
        height={n}
        className="gear-icon gear-icon-img"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }

  return <GearIconSvg blueprintId={blueprintId} weaponType={weaponType} slot={slot} s={s} />;
}

function GearIconSvg({
  blueprintId,
  weaponType,
  slot,
  s,
}: {
  blueprintId?: string | null;
  weaponType?: string;
  slot?: string;
  s?: number;
}) {
  const n = size(s);
  const uid = useId().replace(/:/g, '');
  const id = blueprintId || '';
  const metal = metalFromId(id);
  const pal = metalPalette(metal);
  const type = weaponType || inferType(id, slot);

  return (
    <svg width={n} height={n} viewBox="0 0 64 64" aria-hidden className="gear-icon">
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={pal.light} />
          <stop offset="45%" stopColor={pal.mid} />
          <stop offset="100%" stopColor={pal.dark} />
        </linearGradient>
        <radialGradient id={`shine-${uid}`} cx="35%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#ffffff55" />
          <stop offset="100%" stopColor="#ffffff00" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="10" fill="#1c1610" stroke="#5a4834" strokeWidth="1.5" />
      <rect x="6" y="6" width="52" height="52" rx="8" fill={`url(#shine-${uid})`} />
      {renderArt(type, pal, id, `url(#g-${uid})`)}
    </svg>
  );
}

function inferType(id: string, slot?: string) {
  if (id.includes('greatsword')) return 'greatsword';
  if (id.includes('sword')) return 'sword';
  if (id.includes('axe')) return 'axemace';
  if (id.includes('spear')) return 'spear';
  if (id.includes('crossbow')) return 'crossbow';
  if (id.includes('bow')) return 'bow';
  if (id.includes('throw') || id.includes('knife')) return 'thrown';
  if (id.includes('shield')) return 'shield';
  if (id.includes('helm')) return 'helm';
  if (id.includes('body') || id.includes('plate') || id.includes('armor')) return 'body';
  if (id.includes('legs') || id.includes('greave')) return 'legs';
  if (id.includes('ring')) return 'accessory';
  if (slot === 'body') return 'body';
  if (slot === 'helm') return 'helm';
  if (slot === 'legs') return 'legs';
  if (slot === 'offhand') return 'shield';
  if (slot === 'accessory') return 'accessory';
  return id || 'sword';
}

function renderArt(
  type: string,
  pal: { light: string; mid: string; dark: string },
  id: string,
  g: string,
) {
  switch (type) {
    case 'sword':
      return (
        <g>
          <path d="M32 8 L36 12 L30 48 L26 46 Z" fill={g} stroke={pal.dark} strokeWidth="1" />
          <path d="M31 10 L34 12 L29 42" stroke="#fff6" strokeWidth="1" fill="none" />
          <rect x="20" y="44" width="24" height="4" rx="1" fill="#6a4a28" stroke="#3a2810" />
          <rect x="28" y="48" width="8" height="8" rx="1" fill="#4a3018" />
          <circle cx="32" cy="46" r="2" fill={pal.light} />
        </g>
      );
    case 'greatsword':
      return (
        <g>
          <path d="M30 6 L38 10 L34 50 L26 46 Z" fill={g} stroke={pal.dark} />
          <path d="M32 8 L35 11 L31 46" stroke="#fff5" strokeWidth="1.2" fill="none" />
          <rect x="16" y="46" width="32" height="5" rx="1" fill="#6a4a28" />
          <rect x="28" y="51" width="8" height="7" fill="#3a2410" />
        </g>
      );
    case 'axemace':
      return (
        <g>
          <line x1="22" y1="54" x2="40" y2="12" stroke="#6a4a28" strokeWidth="4" strokeLinecap="round" />
          <path d="M36 8 L54 16 L48 30 L34 22 Z" fill={g} stroke={pal.dark} />
        </g>
      );
    case 'spear':
      return (
        <g>
          <line x1="18" y1="54" x2="44" y2="12" stroke="#8a5a2e" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M42 6 L54 14 L44 20 L38 12 Z" fill={g} stroke={pal.dark} />
        </g>
      );
    case 'bow':
      return (
        <g>
          <path d="M18 10 Q8 32 18 54" fill="none" stroke={pal.mid} strokeWidth="4" strokeLinecap="round" />
          <line x1="18" y1="10" x2="18" y2="54" stroke="#ddd" strokeWidth="1.2" />
          <line x1="18" y1="32" x2="48" y2="32" stroke={g} strokeWidth="2" />
        </g>
      );
    case 'crossbow':
      return (
        <g>
          <rect x="14" y="28" width="36" height="6" rx="2" fill={pal.mid} stroke={pal.dark} />
          <rect x="28" y="18" width="6" height="28" rx="1" fill="#6a4a28" />
        </g>
      );
    case 'thrown':
      return (
        <g>
          <path d="M12 40 L40 12 L48 18 L20 46 Z" fill={g} stroke={pal.dark} />
        </g>
      );
    case 'shield':
      return (
        <g>
          <path
            d="M32 8 L52 16 V32 C52 46 32 56 32 56 C32 56 12 46 12 32 V16 Z"
            fill={g}
            stroke={pal.dark}
            strokeWidth="1.5"
          />
          <circle cx="32" cy="30" r="6" fill={id.includes('iron') ? pal.light : '#c9a227'} stroke={pal.dark} />
        </g>
      );
    case 'helm':
      return (
        <g>
          <ellipse cx="32" cy="38" rx="16" ry="14" fill={g} stroke={pal.dark} />
          <path d="M16 34 Q32 12 48 34" fill={pal.mid} stroke={pal.dark} />
          <rect x="22" y="34" width="20" height="6" rx="1" fill="#1a1814" />
        </g>
      );
    case 'body':
      return (
        <g>
          <path d="M20 16 L32 12 L44 16 L48 28 L44 52 L20 52 L16 28 Z" fill={g} stroke={pal.dark} />
        </g>
      );
    case 'legs':
      return (
        <g>
          <path d="M22 12 H42 L40 28 L46 52 H36 L32 34 L28 52 H18 L24 28 Z" fill={g} stroke={pal.dark} />
        </g>
      );
    case 'accessory':
      return (
        <g>
          <circle cx="32" cy="32" r="14" fill="none" stroke={g} strokeWidth="5" />
          <circle cx="32" cy="20" r="5" fill={pal.light} stroke={pal.dark} />
        </g>
      );
    default:
      return <circle cx="32" cy="32" r="14" fill={g} />;
  }
}

export function WeaponTypeIcon({ type, s }: { type: string; s?: number }) {
  return <GearIcon weaponType={type} s={s} blueprintId={`type_${type}`} />;
}

export function ArmorSlotIcon({ slot, s }: { slot: string; s?: number }) {
  return <GearIcon slot={slot} s={s} blueprintId={slot} />;
}
