/**
 * Drives M00 vs M01/M02 — DESIGN-D20. The error state on M00 ("chưa có quyền
 * kiểm duyệt") is a signed-in Google account that is not on the allowlist, so
 * this reports one status enum instead of two separate booleans.
 */
import { useEffect, useState } from 'react';
import type { ModeratorApi, ModeratorProfile } from '@/lib/backend';

export type ModeratorAuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'denied'; email: string }
  | { status: 'ok'; email: string };

export function useModeratorAuth(backend: ModeratorApi): ModeratorAuthState {
  const [user, setUser] = useState<ModeratorProfile | null | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => backend.watchAuthState(setUser), [backend]);

  useEffect(() => {
    if (!user) {
      setAllowed(null);
      return;
    }
    let alive = true;
    setAllowed(null);
    backend.isModerator().then((ok) => alive && setAllowed(ok));
    return () => {
      alive = false;
    };
  }, [backend, user]);

  if (user === undefined) return { status: 'loading' };
  if (user === null) return { status: 'signed-out' };
  if (allowed === null) return { status: 'loading' };
  return allowed ? { status: 'ok', email: user.email } : { status: 'denied', email: user.email };
}
