/**
 * Strip images for the big screen, at the size the big screen shows them.
 *
 * The wall loads each strip's 480-wide thumb (the full 1080x3400 only for
 * strips sent before thumbs existed). Decoded, 80 of those is still ~230 MB for
 * an 8-hour run, so each is decoded once, redrawn at tile size for this
 * screen's density, re-encoded small, and the bitmap dropped.
 *
 * Anything that goes wrong on the way (a CORS miss, a decoder that refuses)
 * falls back to the original URL: a heavier wall beats an empty tile.
 */
import { useEffect, useState } from 'react';
import type { DisplayApi } from '@/lib/backend';
import { CANVAS_H, CANVAS_W } from '@/types/frame';
import { fitStage } from './stage';

/** The widest a strip is drawn anywhere on this screen: the 230px tile. */
const DRAWN_W = 230;
const QUALITY = 0.9;

const cache = new Map<string, Promise<string>>();
/** The same srcs once resolved, so a tile mounting later has its image on its first frame. */
const ready = new Map<string, string>();
/** Only URLs made here are ours to revoke; thumbUrl's are the backend's. */
const owned = new Set<string>();

async function shrink(url: string): Promise<string> {
  try {
    const density = Math.min(3, Math.max(1, window.devicePixelRatio * fitStage().scale));
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const width = Math.min(bitmap.width, CANVAS_W, Math.ceil(DRAWN_W * density));
    const height = Math.round((width * CANVAS_H) / CANVAS_W);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d canvas');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('toBlob failed');
    const small = URL.createObjectURL(blob);
    owned.add(small);
    return small;
  } catch (error) {
    console.warn('[photowall] strip kept at full size', error);
    return url;
  }
}

function stripSrc(api: DisplayApi, photoId: string): Promise<string> {
  let src = cache.get(photoId);
  if (!src) {
    const pending = api.thumbUrl(photoId).then(shrink);
    pending.then(
      (url) => cache.get(photoId) === pending && ready.set(photoId, url),
      () => cache.delete(photoId),
    );
    cache.set(photoId, pending);
    src = pending;
  }
  return src;
}

async function decoded(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
}

/**
 * Resolves once every strip is fetched and decoded, or after `timeoutMs`,
 * whichever is first. A strip that fails is not waited on: it shows late or not
 * at all, never holds the others back.
 */
export function prepareStrips(api: DisplayApi, ids: readonly string[], timeoutMs: number): Promise<void> {
  const all = Promise.all(ids.map((id) => stripSrc(api, id).then(decoded).catch(() => undefined)));
  return Promise.race([all.then(() => undefined), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

/**
 * Lets go of every strip no longer on the wall. Called after the approved list
 * changes, once the tiles showing a removed strip have had time to fade out.
 */
export function keepStrips(ids: ReadonlySet<string>) {
  for (const [id, src] of cache) {
    if (ids.has(id)) continue;
    cache.delete(id);
    ready.delete(id);
    void src.then((url) => {
      if (owned.delete(url)) URL.revokeObjectURL(url);
    });
  }
}

/** The src for one strip, or null while it is still being fetched. */
export function useStripSrc(api: DisplayApi, photoId: string): string | null {
  const [src, setSrc] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    stripSrc(api, photoId).then(
      (url) => alive && setSrc({ id: photoId, url }),
      (error) => console.error('[photowall] strip failed to load', photoId, error),
    );
    return () => {
      alive = false;
    };
  }, [api, photoId]);
  return src?.id === photoId ? src.url : (ready.get(photoId) ?? null);
}
