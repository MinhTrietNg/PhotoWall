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
import {
  AlreadyReviewedError,
  SubmitError,
  approve as clientApprove,
  ensureGuest as clientEnsureGuest,
  isModerator as clientIsModerator,
  photoUrl as clientPhotoUrl,
  reject as clientReject,
  remove as clientRemove,
  resumeSubmission as clientResumeSubmission,
  setEventName as clientSetEventName,
  setUploadsOpen as clientSetUploadsOpen,
  submitPhoto as clientSubmitPhoto,
  watchByStatus as clientWatchByStatus,
  watchConfig as clientWatchConfig,
  watchMyPhotos as clientWatchMyPhotos,
  watchPending as clientWatchPending,
  watchStats as clientWatchStats,
  type Backend,
  type Photo as ClientPhoto,
} from '@backend/client';
import { initBackend } from '@backend/init';

import {
  ReviewConflict,
  SubmitFailure,
  type GuestApi,
  type ModeratorApi,
  type ModTab,
  type Photo,
  type SubmitErrorCode,
  type SubmitInput,
} from './types';

/** Firestore Timestamp | undefined -> epoch ms. */
function ms(value: { toMillis?: () => number } | undefined): number | undefined {
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
          // frameVariant carries the real frame id. Requires P0.4 (FRAME_VARIANTS +
          // firestore.rules widened to the frame ids) — Claude-Plan.md §20.5 #1.
          frameVariant: input.frameVariant as never,
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

    watchConfig: (cb) => clientWatchConfig(backend, cb),

    watchStats: (cb) => clientWatchStats(backend, cb),

    photoUrl: (photoId) => clientPhotoUrl(backend, photoId),
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

    watchTab(tab: ModTab, cb, max = 200) {
      if (tab === 'pending') return clientWatchPending(backend, (photos) => cb(photos.map(toPhoto)));
      const statuses = tab === 'approved' ? (['approved'] as const) : (['rejected', 'removed'] as const);
      return clientWatchByStatus(backend, [...statuses], (photos) => cb(photos.map(toPhoto)), max);
    },

    async approve(photoId) {
      try {
        await clientApprove(backend, photoId);
      } catch (e) {
        if (e instanceof AlreadyReviewedError) throw new ReviewConflict(photoId);
        throw e;
      }
    },

    async reject(photoId) {
      try {
        await clientReject(backend, photoId);
      } catch (e) {
        if (e instanceof AlreadyReviewedError) throw new ReviewConflict(photoId);
        throw e;
      }
    },

    async remove(photoId) {
      try {
        await clientRemove(backend, photoId);
      } catch (e) {
        if (e instanceof AlreadyReviewedError) throw new ReviewConflict(photoId);
        throw e;
      }
    },

    photoUrl: (photoId) => clientPhotoUrl(backend, photoId),

    watchConfig: (cb) => clientWatchConfig(backend, cb),

    setUploadsOpen: (open) => clientSetUploadsOpen(backend, open),

    setEventName: (name) => clientSetEventName(backend, name),
  };
}
