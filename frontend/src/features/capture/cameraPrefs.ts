/**
 * How the guest likes to shoot — the 3s timer and which camera they use —
 * remembered from one shot to the next. Claude-Plan.md §12.1.
 *
 * Each /camera/:n remounts the screen, so plain component state went back to
 * the defaults on every shot: a guest who turned the timer on for shot 1
 * found it off again on shot 2, and one who shot 1 on the rear camera was
 * back on the front one.
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
  /** The rear camera; the front one otherwise. */
  backCamera: boolean;
}

// The artboards draw the timer pressed; the organisers asked for it off by
// default, so the shutter fires at once unless the guest asks for a countdown.
const DEFAULTS: CameraPrefs = { timerOn: false, backCamera: false };

function readPrefs(): CameraPrefs {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    // An older build may have left anything under this key: check each field.
    const stored = (raw ? JSON.parse(raw) : null) as Record<string, unknown> | null;
    return {
      timerOn: typeof stored?.timerOn === 'boolean' ? stored.timerOn : DEFAULTS.timerOn,
      backCamera: typeof stored?.backCamera === 'boolean' ? stored.backCamera : DEFAULTS.backCamera,
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
