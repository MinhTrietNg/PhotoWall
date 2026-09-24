/**
 * The real backend, adapting backend/src/client.ts to the GuestApi port.
 *
 * Selected with VITE_BACKEND=firebase. Loaded dynamically so the Firebase SDK
 * stays out of the bundle when the mock is in use.
 *
 * Rules of engagement (docs/frontend-integration.md):
 *  - initBackend() runs exactly once, and initialises App Check before anything else.
 *  - Never setDoc/uploadBytes into photos/ directly; only these helpers perform
 *    the write sequence the security rules accept.
 *  - App Check blocks localhost: use the emulator, or register a debug token.
 */
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as authSignOut } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import {
  AlreadyReviewedError,
  SubmitError,
  approve as clientApprove,
  approveMany as clientApproveMany,
  cancelDeletion as clientCancelDeletion,
  confirmDeletion as clientConfirmDeletion,
  countPhotos as clientCountPhotos,
  deleteModerator as clientDeleteModerator,
  ensureGuest as clientEnsureGuest,
  fetchStripBlob as clientFetchStripBlob,
  getMyModerator as clientGetMyModerator,
  isModerator as clientIsModerator,
  listApprovedForExport as clientListApprovedForExport,
  photoUrl as clientPhotoUrl,
  purgeExpired as clientPurgeExpired,
  reject as clientReject,
  rejectMany as clientRejectMany,
  remove as clientRemove,
  removeMany as clientRemoveMany,
  removeMyPhoto as clientRemoveMyPhoto,
  requestDisplayReload as clientRequestDisplayReload,
  restore as clientRestore,
  resumeSubmission as clientResumeSubmission,
  runDueDeletion as clientRunDueDeletion,
  saveModerator as clientSaveModerator,
  scheduleDeletion as clientScheduleDeletion,
  setEventName as clientSetEventName,
  setUploadsOpen as clientSetUploadsOpen,
  submitPhoto as clientSubmitPhoto,
  updateConfig as clientUpdateConfig,
  watchApproved as clientWatchApproved,
  watchByStatus as clientWatchByStatus,
  watchConfig as clientWatchConfig,
  watchModerators as clientWatchModerators,
  watchMyPhotos as clientWatchMyPhotos,
  watchPending as clientWatchPending,
  watchStats as clientWatchStats,
  type Backend,
  type Photo as ClientPhoto,
} from '@backend/client';
import { stripFileName, toParticipantsCsv } from '@backend/export';
import { initBackend } from '@backend/init';
import { CONFIG_DEFAULTS, type ResolvedConfig } from '@backend/schema';

import {
  ReviewConflict,
  SubmitFailure,
  type AppConfig,
  type ConfigPatch,
  type DisplayApi,
  type DisplayConfig,
  type GuestApi,
  type ModeratorApi,
  type ModTab,
  type Photo,
  type SubmitErrorCode,
  type SubmitInput,
} from './types';

/** Firestore Timestamp | undefined -> epoch ms. */
function ms(value: { toMillis?: () => number } | null | undefined): number | undefined {
  return typeof value?.toMillis === 'function' ? value.toMillis() : undefined;
}

function toPhoto(p: ClientPhoto): Photo {
  return {
    id: p.id,
    ownerUid: p.ownerUid,
    displayName: p.displayName,
    frameVariant: p.frameVariant as string,
    status: p.status,
    storagePath: p.storagePath,
    createdAtMs: ms(p.createdAt) ?? Date.now(),
    submittedAtMs: ms(p.submittedAt),
    reviewedAtMs: ms(p.reviewedAt),
    reviewedBy: p.reviewedBy,
    momentNo: p.momentNo,
    showName: p.showName !== false,
    reviewReason: p.reviewReason,
    purgedAtMs: ms(p.purgedAt),
  };
}

function toConfig(c: ResolvedConfig | null): AppConfig | null {
  if (!c) return null;
  const s = c.deletionSchedule;
  return {
    uploadsOpen: c.uploadsOpen,
    eventName: c.eventName,
    uploadsChangedAtMs: ms(c.uploadsChangedAt) ?? null,
    closesAtMs: ms(c.closesAt) ?? null,
    maxSubmitsPerUser: c.maxSubmitsPerUser,
    allowGallery: c.allowGallery,
    removedRetentionHours: c.removedRetentionHours,
    marqueePxPerSec: c.marqueePxPerSec,
    showNames: c.showNames,
    arrivalCard: c.arrivalCard,
    qrUrl: c.qrUrl,
    frames: c.frames,
    displayReloadAtMs: ms(c.displayReloadAt) ?? null,
    deletionSchedule: s
      ? {
          atMs: s.at.toMillis(),
          requestedBy: s.requestedBy,
          confirmedBy: s.confirmedBy,
          executedAtMs: ms(s.executedAt) ?? null,
        }
      : null,
  };
}

/** The port speaks ms; the backend stores Timestamps. */
function fromPatch(patch: ConfigPatch) {
  const { closesAtMs, ...rest } = patch;
  return {
    ...rest,
    ...(closesAtMs !== undefined
      ? { closesAt: closesAtMs === null ? null : Timestamp.fromMillis(closesAtMs) }
      : {}),
  };
}

/** Re-throw the client's SubmitError as the port's SubmitFailure. */
function asFailure(e: unknown): SubmitFailure {
  if (e instanceof SubmitError) {
    return new SubmitFailure(
      e.code as SubmitErrorCode,
      e.photoId,
      e.retryAfterSeconds,
      e.cause ?? e,
    );
  }
  return new SubmitFailure('unknown', undefined, undefined, e);
}

/** AlreadyReviewedError -> the port's ReviewConflict. */
async function reviewing(photoId: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    if (e instanceof AlreadyReviewedError) throw new ReviewConflict(photoId);
    throw e;
  }
}

function tabStatuses(tab: ModTab) {
  return tab === 'pending' ? (['pending'] as const) : tab === 'approved' ? (['approved'] as const) : (['rejected', 'removed'] as const);
}

export function createFirebaseBackend(): GuestApi {
  const backend: Backend = initBackend({
    emulators: import.meta.env.DEV && import.meta.env.VITE_EMULATORS === '1',
  });

  return {
    ensureGuest: () => clientEnsureGuest(backend),

    async submitPhoto(input: SubmitInput, onProgress) {
      // client.ts uses uploadBytes (not resumable), so there is no bytesTransferred
      // to report. null tells the UI to show the indeterminate variant — which the
      // design specifies for exactly this case. Claude-Plan.md §6 (DESIGN-D11).
      onProgress?.(null);
      try {
        return await clientSubmitPhoto(backend, {
          image: input.image,
          displayName: input.displayName,
          frameVariant: input.frameVariant,
          showName: input.showName,
        });
      } catch (e) {
        throw asFailure(e);
      }
    },

    async resumeSubmission(photoId, image, onProgress) {
      onProgress?.(null);
      try {
        await clientResumeSubmission(backend, photoId, image);
      } catch (e) {
        throw asFailure(e);
      }
    },

    watchMyPhotos: (cb) => clientWatchMyPhotos(backend, (photos) => cb(photos.map(toPhoto))),

    watchConfig: (cb) => clientWatchConfig(backend, (c) => cb(toConfig(c))),

    watchStats: (cb) => clientWatchStats(backend, cb),

    photoUrl: (photoId) => clientPhotoUrl(backend, photoId),

    removeMyPhoto: (photoId) => clientRemoveMyPhoto(backend, photoId),
  };
}

// ------------------------------------------------------------ moderators

export function createFirebaseModeratorBackend(): ModeratorApi {
  const backend: Backend = initBackend({
    emulators: import.meta.env.DEV && import.meta.env.VITE_EMULATORS === '1',
  });

  return {
    watchAuthState(cb) {
      return onAuthStateChanged(backend.auth, (user) => cb(user?.email ? { email: user.email } : null));
    },

    async signIn() {
      await signInWithPopup(backend.auth, new GoogleAuthProvider());
    },

    signOut: () => authSignOut(backend.auth),

    isModerator: () => clientIsModerator(backend),

    getMyModerator: () => clientGetMyModerator(backend),

    watchTab(tab: ModTab, cb, max = 200) {
      if (tab === 'pending') return clientWatchPending(backend, (photos) => cb(photos.map(toPhoto)));
      return clientWatchByStatus(backend, [...tabStatuses(tab)], (photos) => cb(photos.map(toPhoto)), max);
    },

    countTab: (tab) => clientCountPhotos(backend, [...tabStatuses(tab)]),

    approve: (photoId) => reviewing(photoId, () => clientApprove(backend, photoId)),
    reject: (photoId, reason) => reviewing(photoId, () => clientReject(backend, photoId, reason)),
    remove: (photoId, reason) => reviewing(photoId, () => clientRemove(backend, photoId, reason)),
    restore: (photoId) => reviewing(photoId, () => clientRestore(backend, photoId)),

    approveMany: (ids) => clientApproveMany(backend, ids),
    rejectMany: (ids, reason) => clientRejectMany(backend, ids, reason),
    removeMany: (ids, reason) => clientRemoveMany(backend, ids, reason),

    purgeExpired: () => clientPurgeExpired(backend),

    photoUrl: (photoId) => clientPhotoUrl(backend, photoId),

    watchConfig: (cb) => clientWatchConfig(backend, (c) => cb(toConfig(c))),

    setUploadsOpen: (open) => clientSetUploadsOpen(backend, open),

    setEventName: (name) => clientSetEventName(backend, name),

    updateConfig: (patch) => clientUpdateConfig(backend, fromPatch(patch)),

    requestDisplayReload: () => clientRequestDisplayReload(backend),

    watchModerators: (cb) =>
      clientWatchModerators(backend, (list) =>
        cb(list.map(({ email, role, name, org }) => ({ email, role, name, org }))),
      ),

    saveModerator: (email, data) => clientSaveModerator(backend, email, data),

    deleteModerator: (email) => clientDeleteModerator(backend, email),

    exportParticipantsCsv: async () => toParticipantsCsv(await clientListApprovedForExport(backend)),

    listZipEntries: async () =>
      (await clientListApprovedForExport(backend)).map((row) => ({ photoId: row.id, fileName: stripFileName(row) })),

    fetchStripBlob: (photoId) => clientFetchStripBlob(backend, photoId),

    scheduleDeletion: (at) => clientScheduleDeletion(backend, at),

    confirmDeletion: () => clientConfirmDeletion(backend),

    cancelDeletion: () => clientCancelDeletion(backend),

    runDueDeletion: () => clientRunDueDeletion(backend),
  };
}

// ------------------------------------------------------------ big screen

/** config/app may not exist yet; the screen then runs on the design's defaults. */
function toDisplayConfig(config: ResolvedConfig | null): DisplayConfig {
  const c = config ?? CONFIG_DEFAULTS;
  return {
    showNames: c.showNames,
    arrivalCard: c.arrivalCard,
    marqueePxPerSec: c.marqueePxPerSec,
    qrUrl: c.qrUrl,
    reloadRequestedAtMs: ms(c.displayReloadAt ?? undefined) ?? null,
  };
}

export function createFirebaseDisplayBackend(): DisplayApi {
  // No sign-in: the rules let anyone read approved photos, stats/public and config/app.
  const backend: Backend = initBackend({
    emulators: import.meta.env.DEV && import.meta.env.VITE_EMULATORS === '1',
  });

  return {
    watchApproved: (cb, max) =>
      clientWatchApproved(
        backend,
        (u) =>
          cb({
            photos: u.photos.map(toPhoto),
            added: u.added.map(toPhoto),
            removedIds: u.removedIds,
          }),
        max,
      ),

    watchStats: (cb) => clientWatchStats(backend, ({ approvedCount }) => cb({ approvedCount })),

    watchConfig: (cb) => clientWatchConfig(backend, (c) => cb(toDisplayConfig(c))),

    photoUrl: (photoId) => clientPhotoUrl(backend, photoId),
  };
}
