import { useEffect, useRef, useState } from 'react';

export type BlobLike = Blob | string | null | undefined;

const EMPTY: readonly BlobLike[] = [];

/**
 * A stable id per Blob, so the effect below can key on *contents* rather than
 * on array identity. Callers are then free to build their input inline —
 * `photos={shots.map((s) => s?.blob ?? null)}` — without re-creating object
 * URLs on every render.
 */
const blobIds = new WeakMap<Blob, number>();
let nextBlobId = 0;

function keyOf(item: BlobLike): string {
  if (!item) return '-';
  if (typeof item === 'string') return `s:${item}`;
  let id = blobIds.get(item);
  if (id === undefined) {
    id = ++nextBlobId;
    blobIds.set(item, id);
  }
  return `b:${id}`;
}

/**
 * Turns Blobs into object URLs and revokes the ones it created when the inputs
 * change or the component unmounts. Strings are passed through untouched, so a
 * caller can mix already-resolved URLs with fresh blobs.
 *
 * The URLs are created inside the effect, not during render. Creating them in
 * a useMemo and revoking them from an effect cleanup looks equivalent but is
 * not: StrictMode runs setup, cleanup, setup on mount, so the cleanup revoked
 * the URLs the committed DOM was already pointing at, and whether the image
 * survived came down to whether the browser had started fetching it yet.
 */
export function useBlobUrls(items: readonly BlobLike[] | undefined): (string | null)[] {
  const list = items ?? EMPTY;
  const key = list.map(keyOf).join('|');

  const [created, setCreated] = useState<(string | null)[]>([]);

  // The effect keys on `key`, so it must read the current list without
  // depending on its identity.
  const listRef = useRef(list);
  listRef.current = list;

  useEffect(() => {
    const own: string[] = [];
    const urls = listRef.current.map((item) => {
      if (!item || typeof item === 'string') return null;
      const url = URL.createObjectURL(item);
      own.push(url);
      return url;
    });
    setCreated(urls);
    return () => {
      own.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key]);

  // Derived per render so the result always matches `list` in length, and so
  // plain string URLs resolve on the very first render.
  return list.map((item, i) => {
    if (!item) return null;
    if (typeof item === 'string') return item;
    return created[i] ?? null;
  });
}
