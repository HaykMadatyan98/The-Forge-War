'use client';

import { AVATAR_KEYS, avatarSrc, t } from '@tfw/game';

/** Resize / compress image for account avatar storage (data URL). */
export async function compressAvatarFile(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const s = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - s) / 2;
  const sy = (bmp.height - s) / 2;
  ctx.drawImage(bmp, sx, sy, s, s, 0, 0, size, size);
  bmp.close();
  let data = canvas.toDataURL('image/jpeg', 0.72);
  if (data.length > 100_000) data = canvas.toDataURL('image/jpeg', 0.55);
  if (data.length > 120_000) throw new Error('avatar_too_large');
  return data;
}

export function AccountAvatar({
  avatarKey,
  name,
  size = 48,
  className = '',
}: {
  avatarKey?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const src = avatarSrc(avatarKey);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name || ''}
      width={size}
      height={size}
      className={`account-avatar ${className}`.trim()}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

export function AvatarPicker({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (v: string) => void;
  onError?: (msg: string) => void;
}) {
  const isCustom = value.startsWith('data:image/');

  async function onFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError?.(t('authAvatarBadType'));
      return;
    }
    try {
      onChange(await compressAvatarFile(file));
    } catch {
      onError?.(t('authAvatarTooLarge'));
    }
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-grid">
        {AVATAR_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`avatar-pick${!isCustom && value === k ? ' on' : ''}`}
            onClick={() => onChange(k)}
            aria-label={k}
          >
            <AccountAvatar avatarKey={k} size={48} name={k} />
          </button>
        ))}
        {isCustom ? (
          <span className="avatar-pick on" aria-label={t('authAvatarUpload')}>
            <AccountAvatar avatarKey={value} size={48} name={t('authAvatarUpload')} />
          </span>
        ) : null}
      </div>
      <div className="avatar-picker-actions">
        <label className="avatar-upload-btn">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => void onFile(e.target.files?.[0] || null)}
          />
          {t('authAvatarUpload')}
        </label>
        {isCustom ? (
          <button type="button" className="ghost avatar-clear-btn" onClick={() => onChange('p0')}>
            {t('authAvatarClear')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
