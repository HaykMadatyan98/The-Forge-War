import { SAVE_KEY } from './catalog';

function storage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSave() {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeSave(state) {
  const ls = storage();
  if (!ls) return;
  state.updatedAt = Date.now();
  ls.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearSave() {
  storage()?.removeItem(SAVE_KEY);
}

export function hasSave() {
  return !!storage()?.getItem(SAVE_KEY);
}
