/**
 * "Tạo video timelapse" — M02. Plays the wall's strips in moment order onto a
 * canvas and records it, so the video comes straight out of the admin's
 * browser with no FFmpeg. Same shape as backend/scripts/timelapse.ts: 720 wide,
 * 8 strips a second.
 *
 * MediaRecorder records in real time, so 300 strips take ~40 s, and a hidden
 * tab's throttled timers would stretch every frame — the dialog asks the admin
 * to keep the tab open.
 */
import { CANVAS_H, CANVAS_W } from '@/types/frame';

const WIDTH = 720;
/** Even, as H.264 wants: 2266, what FFmpeg's scale=720:-2 gives. */
const HEIGHT = Math.floor((WIDTH * CANVAS_H) / CANVAS_W / 2) * 2;
const FRAME_MS = 1000 / 8;
/** The last strip stays up a moment, so the video does not end mid-blink. */
const LAST_HOLD_MS = 1500;
const BITRATE = 8_000_000;
const FETCH_CONCURRENCY = 6;
/** MP4 first (Chrome 126+, Safari); WebM where only that records. */
const TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

export interface TimelapseProgress {
  stage: 'fetch' | 'record';
  done: number;
  total: number;
}

export class TimelapseUnsupported extends Error {}

const sleepUntil = (at: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, at - performance.now())));

/** Downloads every strip, a few at a time; one that fails is left out, not fatal. */
async function fetchAll(
  ids: readonly string[],
  fetchBlob: (id: string) => Promise<Blob>,
  onProgress: (p: TimelapseProgress) => void,
): Promise<Blob[]> {
  const blobs: (Blob | null)[] = ids.map(() => null);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < ids.length) {
      const i = next++;
      try {
        blobs[i] = await fetchBlob(ids[i]);
      } catch {
        // purged, or a network blip: the video goes on without it
      }
      onProgress({ stage: 'fetch', done: ++done, total: ids.length });
    }
  }
  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  return blobs.filter((b): b is Blob => b !== null);
}

/** Records `ids` (already in moment order) into one video. `used` = strips that made it in. */
export async function renderTimelapse(
  ids: readonly string[],
  fetchBlob: (id: string) => Promise<Blob>,
  onProgress: (p: TimelapseProgress) => void,
): Promise<{ blob: Blob; ext: 'mp4' | 'webm'; used: number }> {
  const mimeType =
    typeof MediaRecorder === 'undefined' ? undefined : TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new TimelapseUnsupported();
  }

  const strips = await fetchAll(ids, fetchBlob, onProgress);
  if (strips.length === 0) throw new Error('no strip could be downloaded');

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new TimelapseUnsupported();
  ctx.imageSmoothingQuality = 'high';

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('MediaRecorder failed'));
  });

  let current = await createImageBitmap(strips[0]);
  recorder.start();
  try {
    for (let i = 0; i < strips.length; i++) {
      const shownAt = performance.now();
      ctx.drawImage(current, 0, 0, WIDTH, HEIGHT);
      track.requestFrame();
      onProgress({ stage: 'record', done: i + 1, total: strips.length });

      // Decode the next strip while this one is on screen.
      const upcoming = i + 1 < strips.length ? createImageBitmap(strips[i + 1]) : null;
      await sleepUntil(shownAt + (upcoming ? FRAME_MS : LAST_HOLD_MS));
      if (!upcoming) break;
      current.close();
      current = await upcoming;
    }
    // A closing frame fixes the last strip's length at LAST_HOLD_MS. Chrome
    // drops a frame from an unchanged canvas, so the strip is drawn again, and
    // one stopped at once never reaches the encoder, so the recorder waits a beat.
    ctx.drawImage(current, 0, 0, WIDTH, HEIGHT);
    track.requestFrame();
    await sleepUntil(performance.now() + FRAME_MS);
  } finally {
    current.close();
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  }
  await stopped;

  return {
    blob: new Blob(chunks, { type: mimeType.split(';')[0] }),
    ext: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm',
    used: strips.length,
  };
}
