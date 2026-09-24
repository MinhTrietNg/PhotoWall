/**
 * The kiosk looks after itself. DESIGN-D18 / D30: reload every 6 hours, which
 * also drops whatever an 8-hour run has accumulated; and M02's "Làm mới màn
 * lớn" reloads every open big screen at once, by moving `displayReloadAt`.
 */
import { useEffect, useRef } from 'react';

const RELOAD_EVERY_MS = 6 * 60 * 60 * 1000;

/** `requestedAtMs` is undefined until config/app has been read at least once. */
export function useKioskReload(requestedAtMs: number | null | undefined) {
  useEffect(() => {
    const id = setTimeout(() => location.reload(), RELOAD_EVERY_MS);
    return () => clearTimeout(id);
  }, []);

  // The first value is the request this page was loaded after, not a new one.
  const seen = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (requestedAtMs === undefined) return;
    if (seen.current === undefined) seen.current = requestedAtMs;
    else if (requestedAtMs !== seen.current) location.reload();
  }, [requestedAtMs]);
}
