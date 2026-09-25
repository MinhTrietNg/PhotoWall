/**
 * The counter's number, kept in step with the wall: a new strip's "+1" lands
 * when its card rises (or its tile goes in), not when the stats doc changes —
 * that arrives first, while the strip is still being fetched. A strip taken
 * down counts down at once.
 *
 * Wall reports each announcement; every announced strip lets the count climb
 * by one. Stats and the approved list are separate listeners and may arrive in
 * either order, so an announcement that lands first is kept as credit for the
 * stats change that follows. Anything still held after CATCH_UP_MS is shown
 * anyway, so a strip that is never announced (off-screen, failed to load)
 * cannot freeze the count.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayApi } from '@/lib/backend';

const CATCH_UP_MS = 12_000;
/** Credit from an announcement that beat its stats change; unused after this, it lapses. */
const CREDIT_MS = 5_000;

export function useAnnouncedCount(api: DisplayApi): [number | null, (count: number) => void] {
  const [shown, setShown] = useState<number | null>(null);
  const shownRef = useRef<number | null>(null);
  const latest = useRef<number | null>(null);
  const credit = useRef(0);
  const catchUp = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lapse = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sync = useCallback(() => {
    const target = latest.current;
    const now = shownRef.current;
    let next = target;
    if (target !== null && now !== null && target > now) {
      const up = Math.min(target - now, credit.current);
      credit.current -= up;
      next = now + up;
    }
    shownRef.current = next;
    setShown(next);

    clearTimeout(catchUp.current);
    if (next !== target) {
      catchUp.current = setTimeout(() => {
        credit.current = 0;
        shownRef.current = latest.current;
        setShown(latest.current);
      }, CATCH_UP_MS);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = api.watchStats((s) => {
      latest.current = s.approvedCount;
      sync();
    });
    return () => {
      unsubscribe();
      clearTimeout(catchUp.current);
      clearTimeout(lapse.current);
    };
  }, [api, sync]);

  const onAnnounce = useCallback(
    (count: number) => {
      credit.current += count;
      sync();
      clearTimeout(lapse.current);
      lapse.current = setTimeout(() => {
        credit.current = 0;
      }, CREDIT_MS);
    },
    [sync],
  );

  return [shown, onAnnounce];
}
