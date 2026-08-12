/** Google Identity Services + Sign in with Apple JS helpers. */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          prompt: (cb?: (n: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean }) => void) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
          cancel: () => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (cfg: Record<string, unknown>) => void;
        signIn: () => Promise<{
          authorization: { id_token: string; code?: string };
          user?: { name?: { firstName?: string; lastName?: string }; email?: string };
        }>;
      };
    };
  }
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no_document'));
      return;
    }
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any)._tfwLoaded || window.google || window.AppleID) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('script_load_failed')));
      return;
    }
    const s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => {
      (s as any)._tfwLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error('script_load_failed'));
    document.head.appendChild(s);
  });
}

/**
 * Render Google button into container.
 * Returns cleanup that cancels in-flight GIS UI.
 */
export function mountGoogleButton(
  el: HTMLElement,
  clientId: string,
  onToken: (idToken: string) => void,
  onError?: (err: Error) => void,
): () => void {
  let cancelled = false;
  loadScript('https://accounts.google.com/gsi/client', 'tfw-gsi')
    .then(() => {
      if (cancelled || !window.google?.accounts?.id) {
        onError?.(new Error('google_sdk_missing'));
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response?.credential) onToken(response.credential);
          else onError?.(new Error('google_no_credential'));
        },
        auto_select: false,
      });
      el.innerHTML = '';
      window.google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: Math.max(280, el.clientWidth || 320),
        logo_alignment: 'left',
      });
    })
    .catch((e) => onError?.(e instanceof Error ? e : new Error(String(e))));

  return () => {
    cancelled = true;
    try {
      window.google?.accounts?.id?.cancel();
    } catch {
      /* ignore */
    }
  };
}

export async function signInWithApple(cfg: {
  clientId: string;
  redirectURI: string;
}): Promise<{ idToken: string; displayName?: string }> {
  await loadScript(
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
    'tfw-apple',
  );
  if (!window.AppleID?.auth) throw new Error('apple_sdk_missing');

  window.AppleID.auth.init({
    clientId: cfg.clientId,
    scope: 'name email',
    redirectURI: cfg.redirectURI,
    usePopup: true,
  });

  try {
    const data = await window.AppleID.auth.signIn();
    const idToken = data?.authorization?.id_token;
    if (!idToken) throw new Error('apple_no_token');
    const first = data.user?.name?.firstName;
    const last = data.user?.name?.lastName;
    const displayName = [first, last].filter(Boolean).join(' ') || undefined;
    return { idToken, displayName };
  } catch (e: any) {
    const code = e?.error || e?.message;
    if (code === 'popup_closed_by_user' || String(code).includes('user_cancelled')) {
      throw new Error('oauth_cancelled');
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}
