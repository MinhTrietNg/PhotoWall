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
import {
  SubmitError,
  ensureGuest as clientEnsureGuest,
  photoUrl as clientPhotoUrl,
  removeMyPhoto as clientRemoveMyPhoto,
  resumeSubmission as clientResumeSubmission,
  submitPhoto as clientSubmitPhoto,
  watchConfig as clientWatchConfig,
  watchMyPhotos as clientWatchMyPhotos,
  watchStats as clientWatchStats,
  type Backend,
  type Photo as ClientPhoto,
} from '@backend/client';
import { initBackend } from '@backend/init';

import {
  SubmitFailure,
  type GuestApi,
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
    momentNo: p.momentNo,
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
          frameVariant: input.frameVariant,
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

    removeMyPhoto: (photoId) => clientRemoveMyPhoto(backend, photoId),
  };
}
