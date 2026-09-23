// Client-side "backend API" for PhotoWall. There is no server: these helpers
// perform the exact write sequences that firestore.rules / storage.rules accept.
import { connectAuthEmulator, signInAnonymously, type Auth } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getCountFromServer, getDoc,
  getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc,
  startAfter, Timestamp, updateDoc, where, writeBatch, type Firestore, type QueryDocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  connectStorageEmulator, deleteObject, getBlob, getDownloadURL, ref, uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import {
  FRAME_ID_PATTERN, LIMITS, OWNER_REVIEWER, isAcceptingUploads, paths, resolveConfig,
  type AppConfig, type FrameVariant, type ModeratorDoc, type ModeratorRole, type PhotoDoc,
  type PhotoStatus, type PublicStats, type ResolvedConfig, type ReviewReason, type UserDoc,
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
  | 'invalid-input' // empty/too long name, bad frame id, wrong type, file too large
  | 'uploads-closed' // switched off, or past closesAt
  | 'rate-limited' // see retryAfterSeconds
  | 'quota-exceeded' // config.maxSubmitsPerUser reached
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
  /** Frame id, e.g. "f01-gdgoc". */
  frameVariant: FrameVariant;
  /** S02 "Hiện tên trên màn hình lớn". Omitted = shown. */
  showName?: boolean;
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
    || !FRAME_ID_PATTERN.test(input.frameVariant)
  ) {
    throw new SubmitError('invalid-input');
  }

  const uid = requireUser(b).uid;
  const photoId = doc(collection(b.db, 'photos')).id;
  const batch = writeBatch(b.db);
  batch.set(doc(b.db, paths.photo(photoId)), {
    ownerUid: uid,
    displayName,
    ...(typeof input.showName === 'boolean' ? { showName: input.showName } : {}),
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
    throw new SubmitError('unknown', undefined, undefined, e);
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
  const [configSnap, ledger] = await Promise.all([
    getDoc(doc(b.db, paths.config)),
    getDoc(doc(b.db, paths.user(uid))),
  ]);
  const raw = configSnap.data() as AppConfig | undefined;
  if (!raw) return new SubmitError('uploads-closed');
  const config = resolveConfig(raw);
  if (!isAcceptingUploads(config)) return new SubmitError('uploads-closed');
  const l = ledger.data() as UserDoc | undefined;
  if (l) {
    if (l.submitCount >= config.maxSubmitsPerUser) return new SubmitError('quota-exceeded');
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

/**
 * S07 / S07b "Gỡ dải ảnh này". Off the big screen at once and never restorable; the
 * strip is kept for `removedRetentionHours` like any removal, then purged.
 * Works while the photo is pending or approved; throws AlreadyReviewedError otherwise.
 */
export async function removeMyPhoto(b: Backend, photoId: string): Promise<void> {
  const uid = requireUser(b).uid;
  const photoRef = doc(b.db, paths.photo(photoId));
  await runTransaction(b.db, async (tx) => {
    const cur = (await tx.get(photoRef)).data() as PhotoDoc | undefined;
    if (!cur || cur.ownerUid !== uid || (cur.status !== 'pending' && cur.status !== 'approved')) {
      throw new AlreadyReviewedError(photoId);
    }
    tx.update(photoRef, { status: 'removed', reviewedAt: serverTimestamp(), reviewedBy: OWNER_REVIEWER });
    if (cur.status === 'approved') {
      tx.set(doc(b.db, paths.stats), { approvedCount: increment(-1), lastOwnerRemoval: photoId }, { merge: true });
    }
  });
}

/** `config/app` with defaults filled in; null if the document does not exist. */
export function watchConfig(b: Backend, cb: (config: ResolvedConfig | null) => void): Unsubscribe {
  return onSnapshot(doc(b.db, paths.config), (s) => {
    const raw = s.data() as AppConfig | undefined;
    cb(raw ? resolveConfig(raw) : null);
  });
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

export function watchStats(b: Backend, cb: (stats: Required<PublicStats>) => void): Unsubscribe {
  return onSnapshot(doc(b.db, paths.stats), (s) => {
    const d = s.data() as PublicStats | undefined;
    cb({ approvedCount: d?.approvedCount ?? 0, momentSeq: d?.momentSeq ?? 0 });
  });
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

/** 'admin' | 'moderator' for a signed-in allowlisted Google account, else null. */
export async function getMyRole(b: Backend): Promise<ModeratorRole | null> {
  const email = b.auth.currentUser?.email;
  if (!email) return null;
  try {
    const snap = await getDoc(doc(b.db, paths.moderator(email)));
    return snap.exists() ? ((snap.data() as ModeratorDoc).role ?? 'moderator') : null;
  } catch {
    return null;
  }
}

export type Moderator = ModeratorDoc & { email: string; role: ModeratorRole };

/** The signed-in moderator's allowlist entry — "Lan · Admin GDGoC" — or null. */
export async function getMyModerator(b: Backend): Promise<Moderator | null> {
  const email = b.auth.currentUser?.email;
  if (!email) return null;
  try {
    const snap = await getDoc(doc(b.db, paths.moderator(email)));
    if (!snap.exists()) return null;
    const d = snap.data() as ModeratorDoc;
    return { ...d, email, role: d.role ?? 'moderator' };
  } catch {
    return null;
  }
}

/** True if the signed-in (Google) user is on the moderators allowlist. */
export async function isModerator(b: Backend): Promise<boolean> {
  return (await getMyRole(b)) !== null;
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
  b: Backend, statuses: PhotoStatus[], cb: (photos: Photo[]) => void, max = 200,
): Unsubscribe {
  const q = query(
    collection(b.db, 'photos'),
    where('status', 'in', statuses),
    orderBy('reviewedAt', 'desc'),
    limit(max),
  );
  return onSnapshot(q, (s) => cb(s.docs.map(toPhoto)));
}

/**
 * Exact number of photos in `statuses` — tab badges ("Đã duyệt · 325"), which the
 * 200-row lists cannot count. Costs one read per 1,000 photos.
 */
export async function countPhotos(b: Backend, statuses: PhotoStatus[]): Promise<number> {
  const s = await getCountFromServer(query(collection(b.db, 'photos'), where('status', 'in', statuses)));
  return s.data().count;
}

/** Thrown when the photo is no longer in the expected state (e.g. another moderator acted first). */
export class AlreadyReviewedError extends Error {}

interface Transition {
  from: PhotoStatus[];
  to: PhotoStatus;
  countDelta: -1 | 0 | 1;
  reason?: ReviewReason;
}

async function review(b: Backend, photoId: string, t: Transition) {
  // Two moderators approving different photos at once both read the same momentSeq;
  // the rules refuse the slower one (stale number) instead of the SDK retrying it.
  // If the photo is still in `from`, that was the cause — retry with fresh reads.
  for (let attempt = 1; ; attempt++) {
    try {
      return await reviewOnce(b, photoId, t);
    } catch (e) {
      if (!(e instanceof StaleReviewError) || attempt >= 5) throw e instanceof StaleReviewError ? e.cause : e;
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150 * attempt));
    }
  }
}

class StaleReviewError extends Error {
  constructor(readonly cause: unknown) {
    super('stale review');
  }
}

async function reviewOnce(b: Backend, photoId: string, t: Transition) {
  const email = requireUser(b).email;
  const photoRef = doc(b.db, paths.photo(photoId));
  const statsRef = doc(b.db, paths.stats);
  try {
    await runTransaction(b.db, async (tx) => {
      const cur = (await tx.get(photoRef)).data() as PhotoDoc | undefined;
      const stats = (await tx.get(statsRef)).data() as PublicStats | undefined;
      if (!cur || !t.from.includes(cur.status)) throw new AlreadyReviewedError(photoId);

      const update: Record<string, unknown> = { status: t.to, reviewedAt: serverTimestamp(), reviewedBy: email };
      const statsUpdate: Record<string, unknown> = {};
      if (t.to === 'approved') {
        update.reviewReason = deleteField();
        // "Khoảnh khắc #N" is assigned once, at the first approval.
        if (cur.momentNo == null) {
          const n = (stats?.momentSeq ?? 0) + 1;
          update.momentNo = n;
          statsUpdate.momentSeq = n;
        }
      }
      if (t.reason) update.reviewReason = t.reason;
      if (t.countDelta) statsUpdate.approvedCount = increment(t.countDelta);

      tx.update(photoRef, update);
      if (Object.keys(statsUpdate).length) tx.set(statsRef, statsUpdate, { merge: true });
    });
  } catch (e) {
    // A concurrent moderator can also surface as permission-denied (rules check `from`).
    if (errorCode(e) === 'permission-denied') {
      const now = (await getDoc(photoRef)).data()?.status;
      if (!t.from.includes(now)) throw new AlreadyReviewedError(photoId);
      throw new StaleReviewError(e);
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

/** "Duyệt": pending → approved, assigns "Khoảnh khắc #N". */
export function approve(b: Backend, photoId: string) {
  return review(b, photoId, { from: ['pending'], to: 'approved', countDelta: 1 });
}

/** "Gỡ" on a pending row. Kept for `removedRetentionHours` so it can be restored. */
export function reject(b: Backend, photoId: string, reason?: ReviewReason) {
  return review(b, photoId, { from: ['pending'], to: 'rejected', countDelta: 0, reason });
}

/** "Gỡ" on an approved row: leaves the big screen now, restorable for `removedRetentionHours`. */
export function remove(b: Backend, photoId: string, reason?: ReviewReason) {
  return review(b, photoId, { from: ['approved'], to: 'removed', countDelta: -1, reason });
}

/**
 * "Khôi phục": back to approved and onto the big screen. Refused by the rules once
 * the retention window has passed, the strip was purged, or the guest removed it.
 */
export function restore(b: Backend, photoId: string) {
  return review(b, photoId, { from: ['rejected', 'removed'], to: 'approved', countDelta: 1 });
}

export interface BulkResult {
  ok: string[];
  /** Another moderator handled these first. */
  conflicts: string[];
  failed: string[];
}

/** Runs one at a time: parallel reviews would fight over the shared counter. */
async function bulk(ids: string[], run: (id: string) => Promise<void>): Promise<BulkResult> {
  const result: BulkResult = { ok: [], conflicts: [], failed: [] };
  for (const id of ids) {
    try {
      await run(id);
      result.ok.push(id);
    } catch (e) {
      (e instanceof AlreadyReviewedError ? result.conflicts : result.failed).push(id);
    }
  }
  return result;
}

/** "Duyệt N ảnh". */
export function approveMany(b: Backend, ids: string[]) {
  return bulk(ids, (id) => approve(b, id));
}

/** "Gỡ N ảnh" on the pending tab. */
export function rejectMany(b: Backend, ids: string[], reason?: ReviewReason) {
  return bulk(ids, (id) => reject(b, id, reason));
}

/** "Gỡ N ảnh" on the approved tab. */
export function removeMany(b: Backend, ids: string[], reason?: ReviewReason) {
  return bulk(ids, (id) => remove(b, id, reason));
}

/**
 * Deletes strips removed/rejected longer than `removedRetentionHours` ago and marks
 * them purged. Call when the moderation console opens. Returns how many were purged.
 */
export async function purgeExpired(b: Backend): Promise<number> {
  const raw = (await getDoc(doc(b.db, paths.config))).data() as AppConfig | undefined;
  if (!raw) return 0;
  const cutoff = Timestamp.fromMillis(Date.now() - resolveConfig(raw).removedRetentionHours * 3_600_000);
  const s = await getDocs(query(
    collection(b.db, 'photos'),
    where('status', 'in', ['rejected', 'removed']),
    where('reviewedAt', '<', cutoff),
    orderBy('reviewedAt', 'desc'),
    limit(500),
  ));
  let purged = 0;
  for (const d of s.docs) {
    if ((d.data() as PhotoDoc).purgedAt) continue;
    try {
      await deleteStrip(b, d.id);
      await updateDoc(d.ref, { purgedAt: serverTimestamp() });
      purged++;
    } catch {
      // Clock skew near the cutoff: the rules refuse; the next sweep gets it.
    }
  }
  return purged;
}

// ------------------------------------------------------------ admin: settings (M02)

export type ConfigPatch = Partial<Omit<AppConfig, 'uploadsChangedAt' | 'displayReloadAt' | 'deletionSchedule'>>;

/** Admin only. `uploadsChangedAt` is stamped automatically when `uploadsOpen` flips. */
export async function updateConfig(b: Backend, patch: ConfigPatch): Promise<void> {
  const configRef = doc(b.db, paths.config);
  await runTransaction(b.db, async (tx) => {
    const cur = (await tx.get(configRef)).data() as AppConfig | undefined;
    const data: Record<string, unknown> = { ...patch };
    if (patch.uploadsOpen !== undefined && patch.uploadsOpen !== cur?.uploadsOpen) {
      data.uploadsChangedAt = serverTimestamp();
    }
    if (cur) tx.update(configRef, data);
    else tx.set(configRef, { uploadsOpen: false, eventName: '', ...data });
  });
}

export function setUploadsOpen(b: Backend, open: boolean) {
  return updateConfig(b, { uploadsOpen: open });
}

/** "Làm mới màn lớn": every big screen reloads when `displayReloadAt` changes. */
export async function requestDisplayReload(b: Backend): Promise<void> {
  await updateDoc(doc(b.db, paths.config), { displayReloadAt: serverTimestamp() });
}

// ------------------------------------------------------------ admin: moderators (M02)

/** Everyone on the allowlist. Readable by any moderator. */
export function watchModerators(b: Backend, cb: (list: Moderator[]) => void): Unsubscribe {
  return onSnapshot(collection(b.db, 'moderators'), (s) => cb(s.docs.map((d) => ({
    ...(d.data() as ModeratorDoc),
    email: d.id,
    role: (d.data() as ModeratorDoc).role ?? 'moderator',
  }))));
}

/** Admin only. Adds or updates a moderator; the email is normalised to lowercase. */
export async function saveModerator(
  b: Backend, email: string, data: { role: ModeratorRole; name?: string; org?: string },
): Promise<void> {
  const clean: Record<string, unknown> = { role: data.role };
  if (data.name?.trim()) clean.name = data.name.trim();
  if (data.org?.trim()) clean.org = data.org.trim();
  await setDoc(doc(b.db, paths.moderator(email.trim().toLowerCase())), clean);
}

/** Admin only. An admin cannot remove themselves. */
export async function deleteModerator(b: Backend, email: string): Promise<void> {
  await deleteDoc(doc(b.db, paths.moderator(email.trim().toLowerCase())));
}

export async function setEventName(b: Backend, eventName: string) {
  await updateDoc(doc(b.db, paths.config), { eventName });
}

// ------------------------------------------------------------ admin: export (M02 "Dữ liệu")

export interface ExportRow {
  id: string;
  displayName: string;
  showName: boolean;
  momentNo: number | null;
  frameVariant: string;
  submittedAt: Timestamp | null;
  reviewedAt: Timestamp | null;
  reviewedBy: string | null;
}

/**
 * Every photo currently on the wall, in moment order — the source for "Tải toàn bộ
 * dải ảnh (.zip)" and "Xuất danh sách tham gia (.csv)". Removed photos never appear.
 */
export async function listApprovedForExport(b: Backend): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  let after: QueryDocumentSnapshot | null = null;
  for (;;) {
    const page: QuerySnapshot = await getDocs(query(
      collection(b.db, 'photos'),
      where('status', '==', 'approved'),
      orderBy('reviewedAt', 'desc'),
      ...(after ? [startAfter(after)] : []),
      limit(300),
    ));
    for (const d of page.docs) {
      const p = d.data() as PhotoDoc;
      rows.push({
        id: d.id,
        displayName: p.displayName,
        showName: p.showName !== false,
        momentNo: p.momentNo ?? null,
        frameVariant: p.frameVariant,
        submittedAt: p.submittedAt ?? null,
        reviewedAt: p.reviewedAt ?? null,
        reviewedBy: p.reviewedBy ?? null,
      });
    }
    if (page.docs.length < 300) break;
    after = page.docs[page.docs.length - 1];
  }
  return rows.sort((a, c) => (a.momentNo ?? Infinity) - (c.momentNo ?? Infinity));
}

/** The stored strip as a Blob, for the ZIP export. */
export function fetchStripBlob(b: Backend, photoId: string): Promise<Blob> {
  return getBlob(ref(b.storage, paths.photoObject(photoId)));
}

// ------------------------------------------------------------ admin: scheduled wipe (M02 "Dữ liệu")

/** "Lên lịch xoá": admin only; an existing, not-yet-run schedule must be cancelled first. */
export async function scheduleDeletion(b: Backend, at: Date): Promise<void> {
  const email = requireUser(b).email;
  await updateDoc(doc(b.db, paths.config), {
    deletionSchedule: { at: Timestamp.fromDate(at), requestedBy: email, confirmedBy: null, executedAt: null },
  });
}

/** Second admin's confirmation. The admin who scheduled it cannot confirm it. */
export async function confirmDeletion(b: Backend): Promise<void> {
  await updateDoc(doc(b.db, paths.config), { 'deletionSchedule.confirmedBy': requireUser(b).email });
}

/** Cancels a schedule that has not run yet. */
export async function cancelDeletion(b: Backend): Promise<void> {
  await updateDoc(doc(b.db, paths.config), { deletionSchedule: null });
}

export interface WipeResult {
  photos: number;
  users: number;
}

/**
 * Runs the wipe if it is confirmed and due; otherwise does nothing and returns null.
 * Call when an admin opens the console. Deletes every strip, photo, rate-limit ledger
 * and the counter; keeps `config/app` and the moderators list.
 */
export async function runDueDeletion(b: Backend): Promise<WipeResult | null> {
  const configRef = doc(b.db, paths.config);
  const s = ((await getDoc(configRef)).data() as AppConfig | undefined)?.deletionSchedule;
  if (!s || !s.confirmedBy || s.executedAt || Date.now() < s.at.toMillis()) return null;

  const result: WipeResult = { photos: 0, users: 0 };
  for (;;) {
    const page = await getDocs(query(collection(b.db, 'photos'), limit(200)));
    if (page.empty) break;
    for (const d of page.docs) await deleteStrip(b, d.id);
    const batch = writeBatch(b.db);
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    result.photos += page.size;
  }
  for (;;) {
    const page = await getDocs(query(collection(b.db, 'users'), limit(400)));
    if (page.empty) break;
    const batch = writeBatch(b.db);
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    result.users += page.size;
  }
  await deleteDoc(doc(b.db, paths.stats));
  await updateDoc(configRef, { 'deletionSchedule.executedAt': serverTimestamp() });
  return result;
}
