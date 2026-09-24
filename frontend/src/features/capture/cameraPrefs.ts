/**
 * The two toggles in the camera top bar — the 3s timer and the mirror —
 * remembered from one shot to the next. Claude-Plan.md §12.1.
 *
 * Each /camera/:n remounts the screen, so plain component state went back to
 * the design defaults on every shot: a guest who switched the timer off for
 * shot 1 found it counting down again on shot 2.
 *
 * sessionStorage, not the capture session: these are how the guest likes to
 * shoot, not part of the strip, so they outlive "Chụp bộ khác" and a reload but
 * not the tab. Every access is guarded — a private window or blocked site data
 * just falls back to the defaults.
 */
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'photowall.camera-prefs';

interface CameraPrefs {
  timerOn: boolean;
  mirrored: boolean;
}

// As every camera artboard draws them: timer pill pressed, mirror pill not.
const DEFAULTS: CameraPrefs = { timerOn: true, mirrored: false };

function readPrefs(): CameraPrefs {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    // An older build may have left anything under this key: check each field.
    const stored = (raw ? JSON.parse(raw) : null) as Record<string, unknown> | null;
    return {
      timerOn: typeof stored?.timerOn === 'boolean' ? stored.timerOn : DEFAULTS.timerOn,
      mirrored: typeof stored?.mirrored === 'boolean' ? stored.mirrored : DEFAULTS.mirrored,
    };
  } catch {
    return DEFAULTS;
  }
}

function writePref(key: keyof CameraPrefs, value: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPrefs(), [key]: value }));
  } catch {
    // Not remembered this time; the toggle itself still works.
  }
}

/** A useState for one toggle that the next shot starts from. */
export function useCameraPref(key: keyof CameraPrefs): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => readPrefs()[key]);
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      writePref(key, next);
    },
    [key],
  );
  return [value, set];
}
