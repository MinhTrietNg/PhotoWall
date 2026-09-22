/**
 * Backend provider. Resolves one GuestApi for the whole app and hands it to the
 * tree through context, so `initBackend()` can only ever run once.
 */
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import type { GuestApi, ModeratorApi } from './types';

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

const ModeratorBackendContext = createContext<ModeratorApi | null>(null);

let pendingModerator: Promise<ModeratorApi> | null = null;

function loadModeratorBackend(): Promise<ModeratorApi> {
  pendingModerator ??= (async () => {
    if (import.meta.env.VITE_BACKEND === 'firebase') {
      const { createFirebaseModeratorBackend } = await import('./firebase');
      return createFirebaseModeratorBackend();
    }
    const { createMockModeratorBackend } = await import('./mock');
    return createMockModeratorBackend();
  })();
  return pendingModerator;
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

/** Same lazy-load shape as BackendProvider, for the moderation console (admin app). */
export function ModeratorBackendProvider({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [api, setApi] = useState<ModeratorApi | null>(null);

  useEffect(() => {
    let alive = true;
    loadModeratorBackend().then((b) => {
      if (alive) setApi(b);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!api) return <>{fallback}</>;
  return <ModeratorBackendContext value={api}>{children}</ModeratorBackendContext>;
}

export function useModeratorBackend(): ModeratorApi {
  const api = use(ModeratorBackendContext);
  if (!api) throw new Error('useModeratorBackend must be used inside <ModeratorBackendProvider>');
  return api;
}

export * from './types';
