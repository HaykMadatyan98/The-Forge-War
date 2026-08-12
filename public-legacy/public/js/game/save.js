import { SAVE_KEY } from '../data/catalog.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeSave(state) {
  state.updatedAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}
