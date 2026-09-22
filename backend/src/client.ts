// Client-side "backend API" for PhotoWall. There is no server: these helpers
// perform the exact write sequences that firestore.rules / storage.rules accept.
import { connectAuthEmulator, signInAnonymously, type Auth } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, startAfter, updateDoc, where, writeBatch,
  type Firestore, type QueryDocumentSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import {
  connectStorageEmulator, deleteObject, getDownloadURL, ref, uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import {
  LIMITS, paths, type AppConfig, type FrameVariant, type PhotoDoc, type PublicStats, type UserDoc,
} from './schema';

export interface Backend {
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

export type Photo = PhotoDoc & { id: string };

export function connectEmulators(b: Backend, host = '127.0.0.1') {
  connectAuthEmulator(b.auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(b.db, host, 8080);
  connectStorageEmulator(b.storage, host, 9199);
}

/** Guests (phones, big screen) use anonymous auth. */
export async function ensureGuest(b: Backend): Promise<string> {
  if (b.auth.currentUser) return b.auth.currentUser.uid;
  return (await signInAnonymously(b.auth)).user.uid;
}

function requireUser(b: Backend) {
  const user = b.auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user;
}

// Batched writes reject with a plain FirebaseError, not FirestoreError, so
// match on `code` rather than instanceof.
const errorCode = (e: unknown) => (e as { code?: string } | null)?.code;

const toPhoto = (snap: { id: string; data(): unknown }): Photo => ({ id: snap.id, ...(snap.data() as PhotoDoc) });

// ---------------------------------------------------------------- guests

export type SubmitErrorCode =
  | 'invalid-input' // empty/too long name, wrong type, file too large
  | 'uploads-closed'
  | 'rate-limited' // see retryAfterSeconds
  | 'quota-exceeded' // maxSubmitsPerUser reached
  | 'upload-failed' // doc created but upload failed; retry with resumeSubmission()
  | 'unknown';

export class SubmitError extends Error {
  constructor(
    readonly code: SubmitErrorCode,
    readonly photoId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

export interface SubmitInput {
  /** The composed 4-shot strip, JPEG. */
  image: Blob;
  /** Same strip scaled to ~400px wide, JPEG — shown in the phone feed. */
  thumbnail: Blob;
  displayName: string;
  frameVariant: FrameVariant;
}

/**
 * Submits a strip for moderation and returns its photo id.
 * 1. batch: photos/{id} (uploading) + users/{uid} rate-limit ledger
 * 2. upload photos/{id}/strip.jpg and thumb.jpg
 * 3. mark pending
 */
export async function submitPhoto(b: Backend, input: SubmitInput): Promise<string> {
  const displayName = input.displayName.trim();
  if (
    displayName.length < 1 || displayName.length > LIMITS.displayNameMaxLength
    || input.image.type !== 'image/jpeg' || input.image.size >= LIMITS.maxUploadBytes
    || input.thumbnail.type !== 'image/jpeg' || input.thumbnail.size >= LIMITS.maxThumbBytes
  ) {
    throw new SubmitError('invalid-input');
  }

  const uid = requireUser(b).uid;
  const photoId = doc(collection(b.db, 'photos')).id;
  const batch = writeBatch(b.db);
  batch.set(doc(b.db, paths.photo(photoId)), {
    ownerUid: uid,
    displayName,
    frameVariant: input.frameVariant,
    status: 'uploading',
    storagePath: paths.photoObject(photoId),
    createdAt: serverTimestamp(),
  });
  batch.set(
    doc(b.db, paths.user(uid)),
    { lastSubmitAt: serverTimestamp(), lastPhotoId: photoId, submitCount: increment(1) },
    { merge: true },
  );

  try {
    await batch.commit();
  } catch (e) {
    if (errorCode(e) === 'permission-denied') throw await diagnoseDenied(b, uid);
    throw new SubmitError('unknown');
  }

  await resumeSubmission(b, photoId, input.image, input.thumbnail);
  return photoId;
}

/** Steps 2–3 alone; safe to retry while the photo is still `uploading`. */
export async function resumeSubmission(
  b: Backend, photoId: string, image: Blob, thumbnail: Blob,
): Promise<void> {
  const metadata = { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' };
  try {
    await Promise.all([
      uploadBytes(ref(b.storage, paths.photoObject(photoId)), image, metadata),
      uploadBytes(ref(b.storage, paths.photoThumb(photoId)), thumbnail, metadata),
    ]);
    await updateDoc(doc(b.db, paths.photo(photoId)), { status: 'pending', submittedAt: serverTimestamp() });
  } catch {
    throw new SubmitError('upload-failed', photoId);
  }
}

/** Rules only say "denied"; read config + own ledger to tell the user why. */
async function diagnoseDenied(b: Backend, uid: string): Promise<SubmitError> {
  const [config, ledger] = await Promise.all([
    getDoc(doc(b.db, paths.config)),
    getDoc(doc(b.db, paths.user(uid))),
  ]);
  if (config.data()?.uploadsOpen !== true) return new SubmitError('uploads-closed');
  const l = ledger.data() as UserDoc | undefined;
  if (l) {
    if (l.submitCount >= LIMITS.maxSubmitsPerUser) return new SubmitError('quota-exceeded');
    const wait = LIMITS.submitIntervalSeconds - (Date.now() - l.lastSubmitAt.toMillis()) / 1000;
    if (wait > 0) return new SubmitError('rate-limited', undefined, Math.ceil(wait));
  }
  return new SubmitError('unknown');
}

/** The current user's own photos, newest first — shows their moderation status. */
export function watchMyPhotos(b: Backend, cb: (photos: Photo[]) => void): Unsubscribe {
  const q = query(
    collection(b.db, 'photos'),
    where('ownerUid', '==', requireUser(b).uid),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (s) => cb(s.docs.map(toPhoto)));
}

export function watchConfig(b: Backend, cb: (config: AppConfig | null) => void): Unsubscribe {
  return onSnapshot(doc(b.db, paths.config), (s) => cb((s.data() as AppConfig) ?? null));
}

// ------------------------------------------------------------ big screen

export interface ApprovedUpdate {
  /** Latest approved photos, newest first (up to `max`). */
  photos: Photo[];
  /** Newly approved since the previous callback — pop these on screen. Empty on first load. */
  added: Photo[];
  /** Ids no longer approved (removed by a moderator) — drop them from the slideshow. */
  removedIds: string[];
}

export function watchApproved(b: Backend, cb: (u: ApprovedUpdate) => void, max = 200): Unsubscribe {
  const q = query(
    collection(b.db, 'photos'),
    where('status', '==', 'approved'),
    orderBy('reviewedAt', 'desc'),
    limit(max),
  );
  let first = true;
  return onSnapshot(q, (s) => {
    const changes = s.docChanges();
    cb({
      photos: s.docs.map(toPhoto),
      added: first ? [] : changes.filter((c) => c.type === 'added').map((c) => toPhoto(c.doc)),
      removedIds: first ? [] : changes.filter((c) => c.type === 'removed').map((c) => c.doc.id),
    });
    first = false;
  });
}

export function watchStats(b: Backend, cb: (stats: PublicStats) => void): Unsubscribe {
  return onSnapshot(doc(b.db, paths.stats), (s) => cb((s.data() as PublicStats) ?? { approvedCount: 0 }));
}

const urlCache = new Map<string, Promise<string>>();

/**
 * Download URL for a photo the caller may read. Cached for the page's lifetime.
 * `thumb` is the small feed copy; fall back to `full` if it fails to load.
 */
export function photoUrl(b: Backend, photoId: string, size: 'full' | 'thumb' = 'full'): Promise<string> {
  const key = `${photoId}/${size}`;
  let url = urlCache.get(key);
  if (!url) {
    const path = size === 'thumb' ? paths.photoThumb(photoId) : paths.photoObject(photoId);
    url = getDownloadURL(ref(b.storage, path));
    url.catch(() => urlCache.delete(key));
    urlCache.set(key, url);
  }
  return url;
}

// ------------------------------------------------------------ phone feed

export interface FeedPage {
  photos: Photo[];
  /** Pass to the next loadFeedPage call; null when there are no more photos. */
  next: FeedCursor | null;
}

export type FeedCursor = QueryDocumentSnapshot;

/** One page of approved photos, newest first, for infinite scroll. */
export async function loadFeedPage(b: Backend, after: FeedCursor | null = null, pageSize = 20): Promise<FeedPage> {
  const q = query(
    collection(b.db, 'photos'),
    where('status', '==', 'approved'),
    orderBy('reviewedAt', 'desc'),
    ...(after ? [startAfter(after)] : []),
    limit(pageSize),
  );
  const s = await getDocs(q);
  return {
    photos: s.docs.map(toPhoto),
    next: s.docs.length === pageSize ? s.docs[s.docs.length - 1] : null,
  };
}

/**
 * Photos approved after `newest` (the top photo currently shown) — drives the
 * "N ảnh mới" button. On tap, prepend them and re-watch with the new top photo.
 */
export function watchNewInFeed(b: Backend, newest: Photo | null, cb: (photos: Photo[]) => void, max = 50): Unsubscribe {
  const q = query(
    collection(b.db, 'photos'),
    where('status', '==', 'approved'),
    ...(newest?.reviewedAt ? [where('reviewedAt', '>', newest.reviewedAt)] : []),
    orderBy('reviewedAt', 'desc'),
    limit(max),
  );
  return onSnapshot(q, (s) => cb(s.docs.map(toPhoto)));
}

// ------------------------------------------------------------ moderators

/** True if the signed-in (Google) user is on the moderators allowlist. */
export async function isModerator(b: Backend): Promise<boolean> {
  const email = b.auth.currentUser?.email;
  if (!email) return false;
  try {
    return (await getDoc(doc(b.db, paths.moderator(email)))).exists();
  } catch {
    return false;
  }
}

/** Pending queue, oldest first. */
export function watchPending(b: Backend, cb: (photos: Photo[]) => void): Unsubscribe {
  const q = query(collection(b.db, 'photos'), where('status', '==', 'pending'), orderBy('submittedAt'));
  return onSnapshot(q, (s) => cb(s.docs.map(toPhoto)));
}

/** Thrown when another moderator already handled the photo. */
export class AlreadyReviewedError extends Error {}

async function review(b: Backend, photoId: string, from: PhotoDoc['status'], to: PhotoDoc['status'], countDelta: number) {
  const email = requireUser(b).email;
  const photoRef = doc(b.db, paths.photo(photoId));
  try {
    await runTransaction(b.db, async (tx) => {
      const snap = await tx.get(photoRef);
      if (snap.data()?.status !== from) throw new AlreadyReviewedError(photoId);
      tx.update(photoRef, { status: to, reviewedAt: serverTimestamp(), reviewedBy: email });
      if (countDelta) tx.set(doc(b.db, paths.stats), { approvedCount: increment(countDelta) }, { merge: true });
    });
  } catch (e) {
    // A concurrent moderator can also surface as permission-denied (rule requires `from`).
    if (errorCode(e) === 'permission-denied') {
      const now = (await getDoc(photoRef)).data()?.status;
      if (now !== from) throw new AlreadyReviewedError(photoId);
    }
    throw e;
  }
}

/** Deletes the strip and thumbnail so any leaked download URL stops working. */
async function deleteFiles(b: Backend, photoId: string) {
  urlCache.delete(`${photoId}/full`);
  urlCache.delete(`${photoId}/thumb`);
  await Promise.all([paths.photoObject(photoId), paths.photoThumb(photoId)].map(async (path) => {
    try {
      await deleteObject(ref(b.storage, path));
    } catch (e) {
      if (errorCode(e) !== 'storage/object-not-found') throw e;
    }
  }));
}

export function approve(b: Backend, photoId: string) {
  return review(b, photoId, 'pending', 'approved', 1);
}

export async function reject(b: Backend, photoId: string) {
  await review(b, photoId, 'pending', 'rejected', 0);
  await deleteFiles(b, photoId);
}

/** Takes an approved photo down from the big screen. */
export async function remove(b: Backend, photoId: string) {
  await review(b, photoId, 'approved', 'removed', -1);
  await deleteFiles(b, photoId);
}

export async function setUploadsOpen(b: Backend, open: boolean) {
  await updateDoc(doc(b.db, paths.config), { uploadsOpen: open });
}
