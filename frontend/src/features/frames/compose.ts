/**
 * Canvas composition + JPEG export. DESIGN-D23 / D30, Claude-Plan.md §18.2.
 *
 * Every constant here comes from the design: canvas 1080x3400, quality 0.82,
 * fallback 0.75, target <= 600 KB, hard ceiling 2 MB (enforced by storage.rules),
 * EXIF honoured via createImageBitmap, overlay drawn last.
 *
 * The promise this keeps: "Xem trước đúng là ảnh sẽ tải về." The DOM preview and
 * this canvas read the same slot rectangles out of frames.json, so they agree.
 */
import { CANVAS_H, CANVAS_W, type FrameTemplate, type SlotRect } from '@/types/frame';
import { overlayUrl } from './frameRegistry';

const JPEG_QUALITY = 0.82;
const JPEG_QUALITY_FALLBACK = 0.75;
const TARGET_BYTES = 600 * 1024;
/** storage.rules requires strictly less than 2 MB. */
const MAX_BYTES = 2 * 1024 * 1024;
/**
 * The small copy the wall and the moderation rows load: 230px tiles at up to
 * 2x density, ~60–90 KB instead of ~600. storage.rules caps it under 300 KB.
 */
const THUMB_W = 480;
const THUMB_QUALITY = 0.8;
const THUMB_MAX_BYTES = 300 * 1024;

class ComposeError extends Error {}

/** object-fit: cover with a centre crop. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  [x, y, w, h]: SlotRect,
) {
  const scale = Math.max(w / width, h / height);
  const dw = width * scale;
  const dh = height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** roundRect is widely available but still worth guarding. */
function roundRectPath(ctx: CanvasRenderingContext2D, [x, y, w, h]: SlotRect, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  // imageOrientation: 'from-image' is what keeps EXIF-rotated phone photos upright.
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // Safari < 16 throws on the options bag rather than ignoring it. These
    // blobs are our own canvas JPEGs and carry no EXIF, so dropping the hint
    // costs nothing — and losing the export entirely would cost the strip.
    return await createImageBitmap(blob);
  }
}

function loadOverlay(frame: FrameTemplate): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ComposeError(`không tải được khung ${frame.overlay}`));
    img.src = overlayUrl(frame);
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ComposeError('canvas.toBlob trả về null'))),
      'image/jpeg',
      quality,
    );
  });
}

interface ComposeResult {
  blob: Blob;
  /** The same strip at THUMB_W; undefined if it came out too big to be allowed. */
  thumb: Blob | undefined;
  width: number;
  height: number;
  quality: number;
}

/**
 * Composes four shots into one 1080x3400 JPEG inside the given frame.
 * Throws ComposeError if there are not exactly four shots, or the result cannot
 * be squeezed under the 2 MB hard limit.
 */
export async function composeStrip(
  shots: readonly Blob[],
  frame: FrameTemplate,
): Promise<ComposeResult> {
  if (shots.length !== 4 || shots.some((s) => !s)) {
    throw new ComposeError('cần đúng 4 ảnh để ghép dải');
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new ComposeError('trình duyệt không hỗ trợ canvas 2D');

  // Opaque cream ground, so any sub-pixel seam reads as background, never black.
  ctx.fillStyle = '#FAF7F2';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Bottom layer: the four photos, one at a time so we never hold four decoded
  // 12MP bitmaps at once.
  for (let i = 0; i < 4; i++) {
    const bitmap = await decode(shots[i]);
    try {
      ctx.save();
      roundRectPath(ctx, frame.slots[i], frame.r);
      ctx.clip();
      drawCover(ctx, bitmap, bitmap.width, bitmap.height, frame.slots[i]);
      ctx.restore();
    } finally {
      bitmap.close();
    }
  }

  // Top layer: the organiser artwork. Drawn at exactly 0,0,1080,3400 — never
  // scaled non-uniformly (invariant I3 + the anti-distortion rule).
  const overlay = await loadOverlay(frame);
  ctx.drawImage(overlay, 0, 0, CANVAS_W, CANVAS_H);

  let quality = JPEG_QUALITY;
  let blob = await toBlob(canvas, quality);
  if (blob.size > TARGET_BYTES) {
    quality = JPEG_QUALITY_FALLBACK;
    blob = await toBlob(canvas, quality);
  }
  if (blob.size >= MAX_BYTES) {
    throw new ComposeError(`ảnh ghép ${Math.round(blob.size / 1024)} KB, vượt giới hạn 2 MB`);
  }

  return { blob, thumb: await makeThumb(canvas), width: CANVAS_W, height: CANVAS_H, quality };
}

/** Readers fall back to the full strip without one, so a failure here costs speed, not the strip. */
async function makeThumb(source: HTMLCanvasElement): Promise<Blob | undefined> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = Math.round((THUMB_W * CANVAS_H) / CANVAS_W);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const thumb = await toBlob(canvas, THUMB_QUALITY);
    return thumb.size < THUMB_MAX_BYTES ? thumb : undefined;
  } catch {
    return undefined;
  }
}
