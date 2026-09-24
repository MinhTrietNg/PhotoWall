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
  // undefined = still checking, null = signed out. Kept as the email, not the
  // profile object: an adapter may report the same user again (the mock does
  // on every change), and a new object must not send the console back through
  // "loading" — that unmounts the page and drops whatever was being typed.
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  // undefined = still checking, null = not on the allowlist.
  const [account, setAccount] = useState<ModeratorAccount | null | undefined>(undefined);

  useEffect(
    () => backend.watchAuthState((user: ModeratorProfile | null) => setEmail(user?.email ?? null)),
    [backend],
  );

  useEffect(() => {
    setAccount(undefined);
    if (!email) return;
    let alive = true;
    backend.getMyModerator().then((a) => alive && setAccount(a));
    return () => {
      alive = false;
    };
  }, [backend, email]);

  if (email === undefined) return { status: 'loading' };
  if (email === null) return { status: 'signed-out' };
  if (account === undefined) return { status: 'loading' };
  return account ? { status: 'ok', email, account } : { status: 'denied', email };
}
