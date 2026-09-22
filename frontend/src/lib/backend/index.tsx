/**
 * Backend provider. Resolves one GuestApi for the whole app and hands it to the
 * tree through context, so `initBackend()` can only ever run once.
 */
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import type { GuestApi } from './types';

const BackendContext = createContext<GuestApi | null>(null);

let pending: Promise<GuestApi> | null = null;

/** Firebase in production builds; mock by default in dev unless VITE_BACKEND=firebase. */
function loadBackend(): Promise<GuestApi> {
  pending ??= (async () => {
    const useFirebase =
      import.meta.env.VITE_BACKEND === 'firebase' ||
      (import.meta.env.PROD && import.meta.env.VITE_BACKEND !== 'mock');
    if (useFirebase) {
      const { createFirebaseBackend } = await import('./firebase');
      return createFirebaseBackend();
    }
    const { createMockBackend } = await import('./mock');
    return createMockBackend();
  })();
  return pending;
}

export function BackendProvider({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [api, setApi] = useState<GuestApi | null>(null);

  useEffect(() => {
    let alive = true;
    loadBackend().then((b) => {
      if (alive) setApi(b);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!api) return <>{fallback}</>;
  return <BackendContext value={api}>{children}</BackendContext>;
}

export function useBackend(): GuestApi {
  const api = use(BackendContext);
  if (!api) throw new Error('useBackend must be used inside <BackendProvider>');
  return api;
}

export * from './types';
