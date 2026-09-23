/**
 * Drives M00 vs M01/M02 — DESIGN-D20. The error state on M00 ("chưa có quyền
 * kiểm duyệt") is a signed-in Google account that is not on the allowlist, so
 * this reports one status enum instead of two separate booleans.
 */
import { useEffect, useState } from 'react';
import type { ModeratorAccount, ModeratorApi, ModeratorProfile } from '@/lib/backend';

type ModeratorAuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'denied'; email: string }
  | { status: 'ok'; email: string; account: ModeratorAccount };

export function useModeratorAuth(backend: ModeratorApi): ModeratorAuthState {
  const [user, setUser] = useState<ModeratorProfile | null | undefined>(undefined);
  // undefined = still checking, null = not on the allowlist.
  const [account, setAccount] = useState<ModeratorAccount | null | undefined>(undefined);

  useEffect(() => backend.watchAuthState(setUser), [backend]);

  useEffect(() => {
    if (!user) {
      setAccount(undefined);
      return;
    }
    let alive = true;
    setAccount(undefined);
    backend.getMyModerator().then((a) => alive && setAccount(a));
    return () => {
      alive = false;
    };
  }, [backend, user]);

  if (user === undefined) return { status: 'loading' };
  if (user === null) return { status: 'signed-out' };
  if (account === undefined) return { status: 'loading' };
  return account ? { status: 'ok', email: user.email, account } : { status: 'denied', email: user.email };
}
