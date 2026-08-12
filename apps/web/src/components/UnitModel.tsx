'use client';

import { useEffect, useState } from 'react';
import {
  clothColor,
  eyeColor,
  hairColor,
  metalPalette,
  resolveLoadout,
  skinTone,
  type VisualLoadout,
} from './gearVisual';
import { faceImageSrc, warriorImageSrc } from './artCatalog';
import { GearIcon } from './gearArt';

/**
 * Semi-realistic warrior: generated full-body art when available,
 * with SVG loadout overlay for icon-sized contexts (optional).
 */
export function UnitModel({
  warrior,
  itemsById,
  loadout: loadoutProp,
  size = 160,
  showPlatform = true,
  className,
  preferPainted = true,
}: {
  warrior?: any;
  itemsById?: Record<string, any>;
  loadout?: VisualLoadout;
  size?: number;
  showPlatform?: boolean;
  className?: string;
  /** Use AI full-figure render (default true) */
  preferPainted?: boolean;
}) {
  const L = loadoutProp || resolveLoadout(warrior, itemsById);
  const [imgFailed, setImgFailed] = useState(false);
  const artSrc = warriorImageSrc(L);

  useEffect(() => {
    setImgFailed(false);
  }, [artSrc]);

  if (preferPainted && artSrc && !imgFailed) {
    const h = size * 1.35;
    return (
      <div
        className={`unit-model unit-model-photo ${className || ''}`}
        style={{ width: size, height: h }}
      >
        {showPlatform ? <div className="unit-model-platform" /> : null}
        <img
          key={artSrc}
          src={artSrc}
          alt={L.name || warrior?.name || ''}
          width={size}
          height={h}
          draggable={false}
          className="unit-model-img"
          onError={() => setImgFailed(true)}
        />
        {/* equipment badges so gear swaps still read */}
        <div className="unit-model-gear-chips" aria-hidden>
          {L.weaponType && L.weaponType !== 'unarmed' ? (
            <GearIcon
              weaponType={L.weaponType}
              blueprintId={L.weaponBp || undefined}
              s={Math.max(28, Math.floor(size * 0.22))}
            />
          ) : (
            <span className="muted" style={{ fontSize: Math.max(11, size * 0.09) }}>
              ✊
            </span>
          )}
          {L.body !== 'cloth' ? (
            <GearIcon
              slot="body"
              blueprintId={L.body === 'iron' ? 'bp_iron_body' : 'bp_leather_body'}
              s={Math.max(24, Math.floor(size * 0.18))}
            />
          ) : null}
          {L.helm !== 'none' ? (
            <GearIcon slot="helm" blueprintId="bp_leather_helm" s={Math.max(22, Math.floor(size * 0.16))} />
          ) : null}
        </div>
      </div>
    );
  }

  return <UnitModelSvg warrior={warrior} itemsById={itemsById} loadout={L} size={size} showPlatform={showPlatform} className={className} />;
}

function UnitModelSvg({
  warrior,
  itemsById,
  loadout: loadoutProp,
  size = 160,
  showPlatform = true,
  className,
}: {
  warrior?: any;
  itemsById?: Record<string, any>;
  loadout?: VisualLoadout;
  size?: number;
  showPlatform?: boolean;
  className?: string;
}) {
  const L = loadoutProp || resolveLoadout(warrior, itemsById);
  const skin = skinTone(L.seed);
  const cloth = clothColor(L.seed);
  const hair = hairColor(L.seed);
  const eyes = eyeColor(L.seed);
  const wPal = metalPalette(L.weaponMetal);
  const bodyPal =
    L.body === 'iron'
      ? metalPalette('iron')
      : L.body === 'leather'
        ? metalPalette('leather')
        : cloth;
  const helmPal = L.helm === 'metal' ? metalPalette('iron') : metalPalette('leather');
  const legPal = L.legs === 'leather' ? metalPalette('leather') : cloth;
  const boot = { light: '#5a4030', mid: '#3a2818', dark: '#1a1008' };
  const uid = `um-${L.seed}-${L.weaponType}-${L.body}-${L.helm}-${L.offhand || 'x'}-${L.legs}`;
  const beard = Math.abs(L.seed * 13) % 5 === 0;

  return (
    <svg
      className={className || 'unit-model'}
      width={size}
      height={size * 1.35}
      viewBox="0 0 100 140"
      aria-hidden
      role="img"
    >
      <defs>
        {/* Skin volume */}
        <radialGradient id={`${uid}-face`} cx="42%" cy="38%" r="58%">
          <stop offset="0%" stopColor={skin.light} />
          <stop offset="55%" stopColor={skin.mid} />
          <stop offset="100%" stopColor={skin.dark} />
        </radialGradient>
        <linearGradient id={`${uid}-skin-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skin.light} />
          <stop offset="50%" stopColor={skin.mid} />
          <stop offset="100%" stopColor={skin.deep} />
        </linearGradient>
        <linearGradient id={`${uid}-skin-arm`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={skin.light} />
          <stop offset="100%" stopColor={skin.dark} />
        </linearGradient>
        <linearGradient id={`${uid}-body`} x1="0.2" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={bodyPal.light} />
          <stop offset="40%" stopColor={bodyPal.mid} />
          <stop offset="100%" stopColor={bodyPal.dark} />
        </linearGradient>
        <linearGradient id={`${uid}-body-side`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={bodyPal.dark} />
          <stop offset="35%" stopColor={bodyPal.mid} />
          <stop offset="100%" stopColor={bodyPal.light} />
        </linearGradient>
        <linearGradient id={`${uid}-leg-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={legPal.dark} />
          <stop offset="50%" stopColor={legPal.mid} />
          <stop offset="100%" stopColor={legPal.light} />
        </linearGradient>
        <linearGradient id={`${uid}-leg-r`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor={legPal.dark} />
          <stop offset="50%" stopColor={legPal.mid} />
          <stop offset="100%" stopColor={legPal.light} />
        </linearGradient>
        <linearGradient id={`${uid}-boot`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={boot.light} />
          <stop offset="100%" stopColor={boot.dark} />
        </linearGradient>
        <linearGradient id={`${uid}-hair`} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={hair.light} />
          <stop offset="55%" stopColor={hair.mid} />
          <stop offset="100%" stopColor={hair.dark} />
        </linearGradient>
        <linearGradient id={`${uid}-helm`} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={helmPal.light} />
          <stop offset="50%" stopColor={helmPal.mid} />
          <stop offset="100%" stopColor={helmPal.dark} />
        </linearGradient>
        <linearGradient id={`${uid}-w`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={wPal.light} />
          <stop offset="45%" stopColor={wPal.mid} />
          <stop offset="100%" stopColor={wPal.dark} />
        </linearGradient>
        <linearGradient id={`${uid}-shield`} x1="0" y1="0" x2="1" y2="1">
          <stop
            offset="0%"
            stopColor={L.offhand === 'shield_wood' ? metalPalette('wood').light : metalPalette('iron').light}
          />
          <stop
            offset="100%"
            stopColor={L.offhand === 'shield_wood' ? metalPalette('wood').dark : metalPalette('iron').dark}
          />
        </linearGradient>
        <radialGradient id={`${uid}-ao`} cx="50%" cy="40%" r="60%">
          <stop offset="60%" stopColor="#0000" />
          <stop offset="100%" stopColor="#0006" />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#000" floodOpacity="0.4" />
        </filter>
        <filter id={`${uid}-in`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.6" result="b" />
          <feOffset dy="0.5" result="o" />
          <feComposite in="o" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="s" />
          <feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.25 0" />
          <feBlend in="SourceGraphic" mode="normal" />
        </filter>
      </defs>

      {showPlatform ? (
        <g>
          <ellipse cx="50" cy="132" rx="28" ry="6.5" fill="#00000055" />
          <ellipse cx="50" cy="131" rx="22" ry="4" fill="#2a221855" />
        </g>
      ) : null}

      <g filter={`url(#${uid}-soft)`}>
        {/* ——— BACK LEG (right, slightly behind) ——— */}
        <path
          d="M52 72
             C56 78 58 88 59 100
             C60 108 61 116 60 122
             L52 123
             C51 114 50 104 49 96
             C48 86 48 78 50 72 Z"
          fill={`url(#${uid}-leg-r)`}
        />
        {/* boot R */}
        <path
          d="M49 118 C50 122 52 126 62 127 L64 123 C58 121 54 118 52 114 Z"
          fill={`url(#${uid}-boot)`}
        />
        <path d="M52 120 H61" stroke={boot.dark} strokeWidth="0.6" opacity="0.5" />

        {/* ——— TORSO back mass ——— */}
        <path
          d="M34 42
             C38 38 50 36 58 40
             C64 44 66 52 65 62
             C64 72 60 78 50 80
             C40 78 36 72 35 62
             C34 52 32 46 34 42 Z"
          fill={`url(#${uid}-body)`}
        />

        {/* ——— LEFT LEG (front) ——— */}
        <path
          d="M40 72
             C36 78 34 88 33 100
             C32 110 31 116 32 123
             L42 124
             C43 114 44 104 45 96
             C46 86 46 78 44 72 Z"
          fill={`url(#${uid}-leg-l)`}
        />
        <path
          d="M31 118 C30 122 32 127 42 128 L44 124 C38 122 34 118 33 114 Z"
          fill={`url(#${uid}-boot)`}
        />
        <path d="M34 120 H42" stroke={boot.dark} strokeWidth="0.6" opacity="0.5" />

        {L.legs === 'leather' ? (
          <g opacity="0.55">
            <path d="M36 88 Q40 90 44 88" fill="none" stroke={legPal.dark} strokeWidth="1.1" />
            <path d="M54 88 Q58 90 60 88" fill="none" stroke={legPal.dark} strokeWidth="1.1" />
            <path d="M35 102 H44 M52 102 H60" stroke={legPal.dark} strokeWidth="0.9" />
          </g>
        ) : (
          <g opacity="0.35">
            <path d="M38 82 Q42 86 44 94" fill="none" stroke={legPal.dark} strokeWidth="0.8" />
            <path d="M54 82 Q56 88 58 96" fill="none" stroke={legPal.dark} strokeWidth="0.8" />
          </g>
        )}

        {/* belt */}
        <path d="M36 76 C42 80 58 80 64 76 L63 80 C56 84 42 84 37 80 Z" fill="#2a2018" />
        <rect x="46" y="76.5" width="7" height="5" rx="1" fill={metalPalette('gold').mid} stroke={metalPalette('gold').dark} strokeWidth="0.4" />

        {/* ——— TORSO front plates / folds ——— */}
        <path
          d="M36 44
             C42 40 54 40 60 44
             C63 48 64 56 63 64
             C62 72 56 76 50 77
             C44 76 38 72 37 64
             C36 56 35 48 36 44 Z"
          fill={`url(#${uid}-body-side)`}
          opacity="0.95"
        />
        {L.body === 'iron' ? (
          <g>
            <path d="M40 48 H58 M40 56 H58 M40 64 H56" stroke={bodyPal.dark} strokeWidth="0.9" opacity="0.5" />
            <path d="M42 46 L50 50 L58 46 L56 70 L50 74 L44 70 Z" fill="none" stroke={bodyPal.light} strokeWidth="0.7" opacity="0.55" />
            <circle cx="50" cy="58" r="2.4" fill={bodyPal.light} stroke={bodyPal.dark} strokeWidth="0.5" />
            {/* shoulder cops */}
            <ellipse cx="36" cy="46" rx="6" ry="4.5" fill={bodyPal.mid} stroke={bodyPal.dark} strokeWidth="0.5" />
            <ellipse cx="64" cy="46" rx="6" ry="4.5" fill={bodyPal.mid} stroke={bodyPal.dark} strokeWidth="0.5" />
          </g>
        ) : L.body === 'leather' ? (
          <g>
            <path d="M42 48 Q50 54 58 48" fill="none" stroke={bodyPal.dark} strokeWidth="1.1" opacity="0.55" />
            <path d="M40 58 Q50 66 60 58" fill="none" stroke={bodyPal.dark} strokeWidth="1.1" opacity="0.5" />
            <path d="M44 50 L40 68 L46 70 L50 54 Z" fill={bodyPal.dark} opacity="0.15" />
            <path d="M56 50 L60 68 L54 70 L50 54 Z" fill={bodyPal.light} opacity="0.12" />
          </g>
        ) : (
          <g opacity="0.4">
            <path d="M42 52 Q50 50 58 52" fill="none" stroke="#fff" strokeWidth="0.8" />
            <path d="M40 62 Q50 66 60 62" fill="none" stroke={bodyPal.dark} strokeWidth="0.9" />
          </g>
        )}
        {/* neckline / collar */}
        <path d="M44 42 Q50 46 56 42 L55 46 Q50 50 45 46 Z" fill={bodyPal.dark} opacity="0.55" />

        {/* ——— LEFT ARM (shield side, slightly back) ——— */}
        <path
          d="M36 46
             C30 50 26 58 24 66
             C22 72 22 76 26 78
             C30 76 32 72 34 66
             C36 58 38 52 38 48 Z"
          fill={`url(#${uid}-skin-arm)`}
        />
        {/* sleeve L */}
        <path
          d="M36 46 C32 50 30 56 30 60 L36 62 C38 56 38 50 38 48 Z"
          fill={bodyPal.mid}
          stroke={bodyPal.dark}
          strokeWidth="0.35"
          opacity="0.95"
        />
        {/* hand L */}
        <ellipse cx="25" cy="78" rx="4.2" ry="3.6" fill={`url(#${uid}-skin-v)`} transform="rotate(-20 25 78)" />

        {/* Shield over left arm */}
        {L.offhand ? (
          <g transform="translate(18,58)">
            <path
              d="M0 -6
                 C8 -8 14 -4 15 6
                 C15 16 8 26 0 30
                 C-8 26 -15 16 -15 6
                 C-14 -4 -8 -8 0 -6 Z"
              fill={`url(#${uid}-shield)`}
              stroke={L.offhand === 'shield_wood' ? metalPalette('wood').dark : metalPalette('iron').dark}
              strokeWidth="0.9"
            />
            <path d="M-6 -2 Q0 2 6 -2" fill="none" stroke="#fff4" strokeWidth="0.7" />
            <circle cx="0" cy="8" r="3.2" fill={metalPalette('gold').mid} stroke={metalPalette('gold').dark} strokeWidth="0.5" />
            <circle cx="0" cy="7.2" r="1" fill={metalPalette('gold').light} opacity="0.7" />
          </g>
        ) : null}

        {/* ——— RIGHT ARM (weapon) ——— */}
        <path
          d="M62 46
             C68 48 74 56 78 66
             C80 72 80 78 76 80
             C72 76 70 72 68 66
             C66 58 64 50 62 48 Z"
          fill={`url(#${uid}-skin-arm)`}
        />
        <path
          d="M62 46 C66 48 70 54 72 60 L66 62 C64 56 62 50 62 48 Z"
          fill={bodyPal.mid}
          stroke={bodyPal.dark}
          strokeWidth="0.35"
          opacity="0.95"
        />
        {/* right hand */}
        <ellipse cx="77" cy="80" rx="4.5" ry="3.8" fill={`url(#${uid}-skin-v)`} transform="rotate(25 77 80)" />
        {/* fingers hint */}
        <path d="M75 79 L74 84 M78 80 L79 85 M80 79 L82 83" stroke={skin.dark} strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />

        {/* Weapon gripped in right hand (empty when unarmed) */}
        {L.weaponType && L.weaponType !== 'unarmed' ? (
          <g transform="translate(78,78)">{weaponDetail(L.weaponType, uid, wPal)}</g>
        ) : null}

        {/* neck */}
        <path d="M46 38 C48 42 52 42 54 38 L53 44 C51 46 49 46 47 44 Z" fill={`url(#${uid}-skin-v)`} />

        {/* ——— HEAD ——— */}
        <g>
          {/* jaw + cranium */}
          <path
            d="M42 28
               C42 20 45 14 50 13
               C55 14 58 20 58 28
               C58 34 56 38 53 40
               C51 41 49 41 47 40
               C44 38 42 34 42 28 Z"
            fill={`url(#${uid}-face)`}
          />
          {/* ear */}
          <path d="M41.5 26 C39 26 38 30 40 32 C42 31 42.5 28 41.5 26 Z" fill={skin.mid} stroke={skin.dark} strokeWidth="0.35" />
          {/* cheek shade */}
          <ellipse cx="54.5" cy="30" rx="3.2" ry="4" fill={skin.dark} opacity="0.18" />
          <ellipse cx="45.5" cy="30" rx="2.4" ry="3.5" fill={skin.dark} opacity="0.12" />
          {/* nose */}
          <path d="M50 28 L51.5 33 L48.5 33.5" fill="none" stroke={skin.dark} strokeWidth="0.75" strokeLinecap="round" opacity="0.55" />
          <path d="M48.2 33.2 Q50 34.2 51.8 33.2" fill="none" stroke={skin.deep} strokeWidth="0.5" opacity="0.35" />
          {/* brows */}
          <path d="M44.5 25.5 Q47 24.2 49 25.8" fill="none" stroke={hair.mid} strokeWidth="0.9" strokeLinecap="round" />
          <path d="M51 25.8 Q53.5 24.2 56 25.5" fill="none" stroke={hair.mid} strokeWidth="0.9" strokeLinecap="round" />
          {/* eyes */}
          <ellipse cx="46.8" cy="28" rx="2.3" ry="1.5" fill="#f4ece4" />
          <ellipse cx="53.4" cy="28" rx="2.3" ry="1.5" fill="#f4ece4" />
          <ellipse cx="47" cy="28.1" rx="1.15" ry="1.2" fill={eyes} />
          <ellipse cx="53.6" cy="28.1" rx="1.15" ry="1.2" fill={eyes} />
          <circle cx="47.35" cy="27.7" r="0.4" fill="#fff" opacity="0.85" />
          <circle cx="53.95" cy="27.7" r="0.4" fill="#fff" opacity="0.85" />
          {/* upper lid */}
          <path d="M44.6 27.2 Q46.8 26.2 49 27.4" fill="none" stroke={skin.dark} strokeWidth="0.55" opacity="0.5" />
          <path d="M51.2 27.4 Q53.4 26.2 55.6 27.2" fill="none" stroke={skin.dark} strokeWidth="0.55" opacity="0.5" />
          {/* mouth */}
          <path d="M47.5 36 Q50 37.6 52.8 36" fill="none" stroke={skin.deep} strokeWidth="0.85" strokeLinecap="round" opacity="0.55" />
          <path d="M48 36.2 Q50 35.4 52.2 36.1" fill="none" stroke={skin.light} strokeWidth="0.45" opacity="0.4" />
          {/* soft chin shadow */}
          <ellipse cx="50" cy="38.5" rx="4" ry="1.6" fill={skin.deep} opacity="0.15" />

          {beard && L.helm === 'none' ? (
            <path
              d="M44 34 C45 40 48 44 50 44 C52 44 55 40 56 34 C54 36 52 38 50 38 C48 38 46 36 44 34 Z"
              fill={`url(#${uid}-hair)`}
              opacity="0.85"
            />
          ) : null}

          {/* Hair mass (if no full metal helm covering) */}
          {L.helm === 'none' ? (
            <g>
              <path
                d="M41.5 26
                   C41 16 45 11 50 10.5
                   C55 11 59 16 58.5 26
                   C57 22 54 18 50 17.5
                   C46 18 43 22 41.5 26 Z"
                fill={`url(#${uid}-hair)`}
              />
              {/* strands */}
              <path d="M44 18 C45 22 44 28 43 32" fill="none" stroke={hair.dark} strokeWidth="0.7" opacity="0.45" />
              <path d="M50 12 C51 18 50 24 51 30" fill="none" stroke={hair.light} strokeWidth="0.7" opacity="0.35" />
              <path d="M56 18 C55 24 56 28 57 32" fill="none" stroke={hair.dark} strokeWidth="0.7" opacity="0.4" />
              {/* sideburn / temple */}
              <path d="M42 26 C41 30 42 34 43 36" fill="none" stroke={hair.mid} strokeWidth="1.2" opacity="0.55" />
            </g>
          ) : (
            <g>
              {/* Helm */}
              <path
                d="M40.5 28
                   C41 16 45 10 50 9.5
                   C55 10 59 16 59.5 28
                   C59 32 58 34 56 35
                   L54 30 Q50 26 46 30 L44 35
                   C42 34 41 32 40.5 28 Z"
                fill={`url(#${uid}-helm)`}
                stroke={helmPal.dark}
                strokeWidth="0.55"
              />
              <path d="M44 28 H56" stroke="#0a0a0c" strokeWidth="2.2" opacity="0.75" strokeLinecap="round" />
              <path d="M45 26 Q50 23 55 26" fill="none" stroke={helmPal.light} strokeWidth="0.7" opacity="0.55" />
              {L.helm === 'metal' ? (
                <g>
                  <path d="M41 30 L37 38 L43 35" fill={helmPal.mid} stroke={helmPal.dark} strokeWidth="0.4" />
                  <path d="M59 30 L63 38 L57 35" fill={helmPal.mid} stroke={helmPal.dark} strokeWidth="0.4" />
                  <path d="M48 10 L50 6 L52 10" fill={metalPalette('gold').mid} stroke={metalPalette('gold').dark} strokeWidth="0.35" />
                </g>
              ) : (
                <path d="M43 18 Q50 14 57 18" fill="none" stroke={helmPal.dark} strokeWidth="0.8" opacity="0.4" />
              )}
            </g>
          )}
        </g>

        {/* ring accessory on left hand finger-ish */}
        {L.accessory ? (
          <g transform="translate(24,76)">
            <circle cx="0" cy="0" r="2.6" fill="none" stroke={metalPalette('gold').mid} strokeWidth="1.15" />
            <circle cx="0" cy="-2.1" r="1.15" fill={metalPalette('gold').light} stroke={metalPalette('gold').dark} strokeWidth="0.35" />
          </g>
        ) : null}

        {L.boss ? (
          <path d="M46 6 L50 2 L54 6 L53 11 L47 11 Z" fill="#e0c050" stroke="#8a7010" strokeWidth="0.45" />
        ) : null}

        {/* ambient contact shadow on torso */}
        <ellipse cx="50" cy="72" rx="14" ry="3" fill="#000" opacity="0.12" />
      </g>
    </svg>
  );
}

function weaponDetail(
  type: string,
  uid: string,
  pal: { light: string; mid: string; dark: string },
) {
  const blade = `url(#${uid}-w)`;
  switch (type) {
    case 'bow':
      return (
        <g transform="rotate(-8)">
          <path d="M2 -22 Q-12 0 2 22" fill="none" stroke={pal.mid} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M2 -22 Q-8 0 2 22" fill="none" stroke={pal.light} strokeWidth="1.1" opacity="0.6" />
          <line x1="2" y1="-22" x2="2" y2="22" stroke="#e8e4dc" strokeWidth="0.85" />
          <line x1="2" y1="0" x2="16" y2="-2" stroke={blade} strokeWidth="1.3" strokeLinecap="round" />
          <path d="M16 -2 L20 -5 L20 1 Z" fill={pal.light} />
        </g>
      );
    case 'crossbow':
      return (
        <g transform="rotate(15)">
          <rect x="-3" y="-14" width="5" height="26" rx="1.2" fill="#6a4a28" stroke="#3a2410" strokeWidth="0.4" />
          <rect x="-14" y="-3" width="28" height="4.2" rx="1" fill={blade} stroke={pal.dark} strokeWidth="0.4" />
          <path d="M-14 -1 Q-16 -8 -8 -12" fill="none" stroke={pal.light} strokeWidth="1.2" />
          <path d="M14 -1 Q16 -8 8 -12" fill="none" stroke={pal.light} strokeWidth="1.2" />
          <line x1="-8" y1="-12" x2="8" y2="-12" stroke="#ddd" strokeWidth="0.8" />
        </g>
      );
    case 'spear':
      return (
        <g transform="rotate(-35)">
          <line x1="0" y1="18" x2="0" y2="-26" stroke="#8a5a2e" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M0 -30 L5 -22 L0 -20 L-5 -22 Z" fill={blade} stroke={pal.dark} strokeWidth="0.4" />
          <path d="M0 -28 L2 -23" stroke={pal.light} strokeWidth="0.6" opacity="0.7" />
        </g>
      );
    case 'greatsword':
      return (
        <g transform="rotate(-40)">
          <path d="M-1.5 12 L-1 -28 L3 -30 L4 12 Z" fill={blade} stroke={pal.dark} strokeWidth="0.4" />
          <path d="M-0.5 -26 L1.5 -27 L2 8" stroke={pal.light} strokeWidth="0.7" opacity="0.55" />
          <rect x="-6" y="10" width="12" height="2.8" rx="0.4" fill="#6a4a28" />
          <rect x="-2" y="12.5" width="4" height="6" rx="0.5" fill="#3a2410" />
          <circle cx="0" cy="11.2" r="1.3" fill={pal.light} />
        </g>
      );
    case 'axemace':
      return (
        <g transform="rotate(-30)">
          <line x1="0" y1="14" x2="2" y2="-18" stroke="#6a4a28" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M0 -20 L14 -14 L12 0 L-1 -6 Z" fill={blade} stroke={pal.dark} strokeWidth="0.45" />
          <path d="M3 -16 L10 -12" stroke={pal.light} strokeWidth="0.8" opacity="0.55" />
        </g>
      );
    case 'thrown':
      return (
        <g transform="rotate(-50)">
          <path d="M-3 6 L10 -12 L14 -8 L1 10 Z" fill={blade} stroke={pal.dark} strokeWidth="0.4" />
          <path d="M0 4 L9 -8" stroke={pal.light} strokeWidth="0.6" opacity="0.5" />
        </g>
      );
    case 'shield':
      return (
        <g>
          <path d="M0 -10 L10 -5 V8 C10 16 0 20 0 20 C0 20 -10 16 -10 8 V-5 Z" fill={blade} />
        </g>
      );
    default:
      return (
        <g transform="rotate(-42)">
          <path d="M-1 10 L0 -24 L3.2 -25 L4 11 Z" fill={blade} stroke={pal.dark} strokeWidth="0.35" />
          <path d="M0.3 -22 L1.8 -22.5 L2.4 6" stroke={pal.light} strokeWidth="0.65" opacity="0.55" />
          <rect x="-5" y="8.5" width="10" height="2.4" rx="0.35" fill="#6a4a28" />
          <rect x="-1.6" y="10.5" width="3.6" height="5.5" rx="0.4" fill="#3a2410" />
          <circle cx="0.2" cy="9.5" r="1.1" fill={pal.light} />
        </g>
      );
  }
}

/** Square portrait: dedicated face art matching warrior identity (w0–w4). */
export function UnitPortrait({
  warrior,
  itemsById,
  loadout,
  size = 64,
  name,
}: {
  warrior?: any;
  itemsById?: Record<string, any>;
  loadout?: VisualLoadout;
  size?: number;
  name?: string;
}) {
  const L = loadout || resolveLoadout(warrior, itemsById);
  const [failed, setFailed] = useState(false);
  const src = faceImageSrc(L.seed);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className="portrait unit-portrait"
      style={{ width: size, height: size }}
      title={name || L.name || warrior?.name}
    >
      <span className="portrait-ring" />
      {!failed ? (
        <img
          key={src}
          src={src}
          alt=""
          className="unit-portrait-photo unit-portrait-face"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="unit-portrait-inner">
          <UnitModel warrior={warrior} itemsById={itemsById} loadout={L} size={size * 1.55} showPlatform={false} preferPainted={false} />
        </div>
      )}
      <span className="unit-portrait-wep">
        <GearIcon weaponType={L.weaponType} blueprintId={L.weaponBp || undefined} s={Math.max(14, size * 0.28)} />
      </span>
    </div>
  );
}
