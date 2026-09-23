/** Guest capture session. See Claude/Claude-Plan.md §12 and §13.1. */
import type { FrameId } from './frame';

/** The design caps the name at 24 even though the backend allows 40 — the
 *  big-screen name pill is sized for 24. Claude-Plan.md §20.5 #5. */
export const NAME_MAX = 24;

/** Four shots per strip. Invariant I2. */
export const SHOT_COUNT = 4;

/** "Quay lại trong 30 phút hỏi: Tiếp tục bộ đang chụp?" — Claude-Plan.md §12.3. */
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

export interface Shot {
  /** Raw camera/gallery capture, before composition. */
  blob: Blob;
  width: number;
  height: number;
  capturedAt: number;
  source: 'camera' | 'gallery';
  /** How many times this slot was retaken — reported to analytics. */
  retakes: number;
}

export interface CaptureSession {
  displayName: string;
  showName: boolean;
  consentGiven: boolean;
  /** Always length SHOT_COUNT; null = not shot yet. */
  shots: (Shot | null)[];
  selectedFrameId: FrameId | null;
  startedAt: number;
  /**
   * When these four shots reached the Wall. A sent set stays in the session so
   * /done and /me can draw it, but it is not an unfinished one: offering
   * "Tiếp tục bộ đang chụp?" for it would upload the same strip a second time.
   * Any change to the shots clears it.
   */
  submittedAt?: number;
}

export function emptySession(): CaptureSession {
  return {
    displayName: '',
    showName: true,
    consentGiven: true,
    shots: Array.from({ length: SHOT_COUNT }, () => null),
    selectedFrameId: null,
    startedAt: Date.now(),
  };
}

export function shotCount(session: CaptureSession): number {
  return session.shots.filter(Boolean).length;
}

export function isSessionComplete(session: CaptureSession): boolean {
  return shotCount(session) === SHOT_COUNT && session.selectedFrameId !== null;
}

export function isNameValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX;
}

/** The first slot with no shot yet, 1-based; null when the strip is full. */
export function nextEmptySlot(session: CaptureSession): number | null {
  const i = session.shots.findIndex((s) => s === null);
  return i === -1 ? null : i + 1;
}
