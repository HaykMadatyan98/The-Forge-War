/** Shared image loader for canvas/map art (warriors, projectiles). */

type CacheEntry = HTMLImageElement | 'loading' | 'error';

const cache = new Map<string, CacheEntry>();
const waiters = new Map<string, Set<() => void>>();

function notify(src: string) {
  const set = waiters.get(src);
  if (!set) return;
  waiters.delete(src);
  for (const fn of set) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe once when image reaches ready or error. */
export function onArtReady(src: string, cb: () => void) {
  if (!src || typeof window === 'undefined') return;
  const cur = cache.get(src);
  if (cur instanceof HTMLImageElement && cur.complete && cur.naturalWidth > 0) {
    // Defer so callers never recurse into getArtImage → onReady → getArtImage
    queueMicrotask(() => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
    return;
  }
  if (cur === 'error') return;
  let set = waiters.get(src);
  if (!set) {
    set = new Set();
    waiters.set(src, set);
  }
  set.add(cb);
}

/**
 * Returns a complete HTMLImageElement if loaded; otherwise kicks off load and returns null.
 * Call with onReady to re-paint when art appears.
 *
 * Important: if the image is already ready, onReady is NOT invoked synchronously
 * (the return value is enough). This avoids infinite recursion when onReady re-calls getArtImage.
 */
export function getArtImage(src: string | null | undefined, onReady?: () => void): HTMLImageElement | null {
  if (!src || typeof window === 'undefined') return null;

  const cur = cache.get(src);
  if (cur instanceof HTMLImageElement) {
    if (cur.complete && cur.naturalWidth > 0) return cur;
    // Incomplete cached element — wait for load path
    if (onReady) onArtReady(src, onReady);
    return null;
  }
  if (cur === 'error') return null;
  if (cur === 'loading') {
    if (onReady) onArtReady(src, onReady);
    return null;
  }

  // First request: arm waiter before starting load
  if (onReady) onArtReady(src, onReady);

  const img = new Image();
  img.decoding = 'async';
  cache.set(src, 'loading');
  img.onload = () => {
    cache.set(src, img);
    notify(src);
  };
  img.onerror = () => {
    cache.set(src, 'error');
    notify(src);
  };
  img.src = src;
  // Sync-complete from HTTP cache
  if (img.complete && img.naturalWidth > 0) {
    cache.set(src, img);
    notify(src);
    return img;
  }
  return null;
}

export function preloadArt(srcs: string[]) {
  for (const s of srcs) getArtImage(s);
}

export function isArtError(src: string) {
  return cache.get(src) === 'error';
}
