/**
 * Frame registry — reads /frames/frames.json at runtime.
 *
 * The registry is fetched, not bundled, so adding frame F04 is "1 PNG + 1 JSON
 * line, no code change" (Claude-Plan.md §19.7). That also means a typo in the
 * JSON silently produces a wrong export, so everything is validated on load.
 */
import { CANVAS_H, CANVAS_W, type FrameRegistry, type FrameTemplate } from '@/types/frame';

export const FRAMES_BASE = '/frames';
const REGISTRY_URL = `${FRAMES_BASE}/frames.json`;

export class FrameRegistryError extends Error {}

function fail(message: string): never {
  throw new FrameRegistryError(`frames.json: ${message}`);
}

function validate(data: unknown): FrameRegistry {
  if (typeof data !== 'object' || data === null) fail('not an object');
  const registry = data as FrameRegistry;

  const canvas = registry.canvas;
  if (!Array.isArray(canvas) || canvas[0] !== CANVAS_W || canvas[1] !== CANVAS_H) {
    fail(`canvas must be [${CANVAS_W}, ${CANVAS_H}] — invariant I1`);
  }
  if (!Array.isArray(registry.frames) || registry.frames.length === 0) fail('no frames');

  const seen = new Set<string>();
  for (const frame of registry.frames) {
    if (!frame.id) fail('a frame has no id');
    if (seen.has(frame.id)) fail(`duplicate id "${frame.id}"`);
    seen.add(frame.id);

    if (!frame.overlay) fail(`"${frame.id}" has no overlay`);
    if (!Array.isArray(frame.slots) || frame.slots.length !== 4) {
      fail(`"${frame.id}" must have exactly 4 slots — invariant I2`);
    }
    frame.slots.forEach((slot, i) => {
      if (!Array.isArray(slot) || slot.length !== 4 || slot.some((n) => typeof n !== 'number')) {
        fail(`"${frame.id}" slot ${i + 1} is not [x, y, w, h]`);
      }
      const [x, y, w, h] = slot;
      if (w <= 0 || h <= 0) fail(`"${frame.id}" slot ${i + 1} has a non-positive size`);
      if (x < 0 || y < 0 || x + w > CANVAS_W || y + h > CANVAS_H) {
        fail(`"${frame.id}" slot ${i + 1} falls outside the ${CANVAS_W}x${CANVAS_H} canvas`);
      }
    });
    if (typeof frame.r !== 'number' || frame.r < 0) fail(`"${frame.id}" has an invalid radius`);
  }

  return registry;
}

let cache: Promise<FrameRegistry> | null = null;

export function loadFrames(): Promise<FrameRegistry> {
  cache ??= fetch(REGISTRY_URL)
    .then((res) => {
      if (!res.ok) fail(`HTTP ${res.status}`);
      return res.json();
    })
    .then(validate)
    .catch((error) => {
      cache = null; // let a later mount retry
      throw error;
    });
  return cache;
}

/** Frames the guest may choose. Admin-disabled frames are hidden, not greyed. */
export function enabledFrames(registry: FrameRegistry): FrameTemplate[] {
  return registry.frames.filter((f) => f.enabled !== false);
}

export function findFrame(registry: FrameRegistry, id: string | null): FrameTemplate | undefined {
  return registry.frames.find((f) => f.id === id);
}

export function overlayUrl(frame: FrameTemplate): string {
  return `${FRAMES_BASE}/${frame.overlay}`;
}

/** Browser-cache the overlay PNGs so switching frames is instant. */
export function preloadOverlays(frames: FrameTemplate[]): void {
  for (const frame of frames) {
    const img = new Image();
    img.decoding = 'async';
    img.src = overlayUrl(frame);
  }
}
