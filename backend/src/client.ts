// Client-side "backend API" for PhotoWall. There is no server: these helpers
// perform the exact write sequences that firestore.rules / storage.rules accept.
import { connectAuthEmulator, signInAnonymously, type Auth } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDoc, increment, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, updateDoc, where, writeBatch,
  type Firestore, type Unsubscribe,
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

const toPhoto =(snap: { id: string; data(): unknown }): Photo => ({ id: snap.id, ...(snap.data() as PhotoDoc) });

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
    /** Underlying Firebase error, for logging. */
    readonly cause?: unknown,
  ) {
    super(code);
  }
}

export interface SubmitInput {
  /** The composed 4-shot strip, JPEG. */
  image: Blob;
  displayName: string;
  frameVariant: FrameVariant;
}

/**
 * Submits a strip for moderation and returns its photo id.
 * 1. batch: photos/{id} (uploading) + users/{uid} rate-limit ledger
 * 2. upload photos/{id}/strip.jpg
 * 3. mark pending
 */
export async function submitPhoto(b: Backend, input: SubmitInput): Promise<string> {
  const displayName = input.displayName.trim();
  if (
    displayName.length < 1 || displayName.length > LIMITS.displayNameMaxLength
    || input.image.type !== 'image/jpeg' || input.image.size >= LIMITS.maxUploadBytes
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

  await resumeSubmission(b, photoId, input.image);
  return photoId;
}

/** Steps 2–3 alone; safe to retry while the photo is still `uploading`. */
export async function resumeSubmission(b: Backend, photoId: string, image: Blob): Promise<void> {
  try {
    await uploadBytes(ref(b.storage, paths.photoObject(photoId)), image, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });
    await updateDoc(doc(b.db, paths.photo(photoId)), { status: 'pending', submittedAt: serverTimestamp() });
  } catch (e) {
    throw new SubmitError('upload-failed', photoId, undefined, e);
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

/** Download URL for a photo the caller may read. Cached for the page's lifetime. */
export function photoUrl(b: Backend, photoId: string): Promise<string> {
  let url = urlCache.get(photoId);
  if (!url) {
    url = getDownloadURL(ref(b.storage, paths.photoObject(photoId)));
    url.catch(() => urlCache.delete(photoId));
    urlCache.set(photoId, url);
  }
  return url;
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

/**
 * Photos in any of `statuses`, most recently reviewed first — the moderation
 * console's "Đã duyệt" (`['approved']`) and "Đã gỡ" (`['rejected','removed']`) tabs.
 * Reuses the status+reviewedAt index already declared for watchApproved.
 */
export function watchByStatus(
  b: Backend,
  statuses: PhotoDoc['status'][],
  cb: (photos: Photo[]) => void,
  max = 200,
): Unsubscribe {
  const q = query(
    collection(b.db, 'photos'),
    where('status', 'in', statuses),
    orderBy('reviewedAt', 'desc'),
    limit(max),
  );
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

/** Deletes the stored strip so any leaked download URL stops working. */
async function deleteStrip(b: Backend, photoId: string) {
  urlCache.delete(photoId);
  try {
    await deleteObject(ref(b.storage, paths.photoObject(photoId)));
  } catch (e) {
    if (errorCode(e) !== 'storage/object-not-found') throw e;
  }
}

export function approve(b: Backend, photoId: string) {
  return review(b, photoId, 'pending', 'approved', 1);
}

export async function reject(b: Backend, photoId: string) {
  await review(b, photoId, 'pending', 'rejected', 0);
  await deleteStrip(b, photoId);
}

/** Takes an approved photo down from the big screen. */
export async function remove(b: Backend, photoId: string) {
  await review(b, photoId, 'approved', 'removed', -1);
  await deleteStrip(b, photoId);
}

export async function setUploadsOpen(b: Backend, open: boolean) {
  await updateDoc(doc(b.db, paths.config), { uploadsOpen: open });
}

export async function setEventName(b: Backend, eventName: string) {
  await updateDoc(doc(b.db, paths.config), { eventName });
}
