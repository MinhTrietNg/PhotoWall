/**
 * In-memory backend. No Firebase, no emulator, no network.
 *
 * Exists so the whole guest flow can be developed and demoed before P0.1/P0.4
 * land, and so component tests never need an emulator. It reproduces the parts
 * of the real contract the UI depends on: the rate limiter, the uploads-closed
 * switch, the error codes, and the pending -> approved status transition.
 *
 * Selected with VITE_BACKEND=mock (the default in development).
 */
import {
  SubmitFailure,
  type AppConfig,
  type GuestApi,
  type Photo,
  type SubmitInput,
  type Unsubscribe,
} from './types';

// Mirrors backend/src/schema.ts LIMITS.
const SUBMIT_INTERVAL_SECONDS = 60;
const MAX_SUBMITS_PER_USER = 20;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const DISPLAY_NAME_MAX = 40;

/** How long a mock photo sits in `pending` before it auto-approves. */
const MOCK_REVIEW_MS = 6000;

interface Store {
  uid: string | null;
  photos: Photo[];
  blobs: Map<string, Blob>;
  urls: Map<string, string>;
  config: AppConfig;
  approvedCount: number;
  lastSubmitAtMs: number;
  submitCount: number;
}

const store: Store = {
  uid: null,
  photos: [],
  blobs: new Map(),
  urls: new Map(),
  config: { uploadsOpen: true, eventName: 'GDGoC × Đoàn hội Khoa CNTT × AWS Student Club' },
  approvedCount: 128,
  lastSubmitAtMs: 0,
  submitCount: 0,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const l of [...listeners]) l();
}

function subscribe(l: Listener): Unsubscribe {
  listeners.add(l);
  // Match Firestore: the callback fires once with the current value.
  queueMicrotask(l);
  return () => listeners.delete(l);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeId() {
  return Math.random().toString(36).slice(2, 12);
}

/** Feeds progress callbacks so the upload screen behaves like the real thing. */
async function fakeUpload(onProgress?: (fraction: number | null) => void) {
  for (let step = 0; step <= 10; step++) {
    onProgress?.(step / 10);
    await wait(120);
  }
}

export function createMockBackend(): GuestApi {
  return {
    async ensureGuest() {
      await wait(150);
      store.uid ??= `mock-${makeId()}`;
      return store.uid;
    },

    async submitPhoto(input: SubmitInput, onProgress) {
      const displayName = input.displayName.trim();
      if (
        displayName.length < 1 ||
        displayName.length > DISPLAY_NAME_MAX ||
        input.image.type !== 'image/jpeg' ||
        input.image.size >= MAX_UPLOAD_BYTES
      ) {
        throw new SubmitFailure('invalid-input');
      }
      if (!store.config.uploadsOpen) throw new SubmitFailure('uploads-closed');
      if (store.submitCount >= MAX_SUBMITS_PER_USER) throw new SubmitFailure('quota-exceeded');

      const elapsed = (Date.now() - store.lastSubmitAtMs) / 1000;
      if (store.lastSubmitAtMs && elapsed < SUBMIT_INTERVAL_SECONDS) {
        throw new SubmitFailure(
          'rate-limited',
          undefined,
          Math.ceil(SUBMIT_INTERVAL_SECONDS - elapsed),
        );
      }

      const id = makeId();
      store.photos.unshift({
        id,
        ownerUid: store.uid ?? 'mock',
        displayName,
        frameVariant: input.frameVariant,
        status: 'uploading',
        storagePath: `photos/${id}/strip.jpg`,
        createdAtMs: Date.now(),
      });
      store.lastSubmitAtMs = Date.now();
      store.submitCount++;
      emit();

      await this.resumeSubmission(id, input.image, onProgress);
      return id;
    },

    async resumeSubmission(photoId, image, onProgress) {
      const photo = store.photos.find((p) => p.id === photoId);
      if (!photo) throw new SubmitFailure('unknown', photoId);

      // ?mockFail=upload reproduces E02 without unplugging the network.
      if (new URLSearchParams(location.search).get('mockFail') === 'upload') {
        onProgress?.(0.62);
        await wait(600);
        throw new SubmitFailure('upload-failed', photoId);
      }

      await fakeUpload(onProgress);
      store.blobs.set(photoId, image);
      photo.status = 'pending';
      photo.submittedAtMs = Date.now();
      emit();

      // Stand in for a moderator tapping Duyệt, so /done can be seen upgrading
      // from S08b to S08 in place.
      setTimeout(() => {
        const p = store.photos.find((x) => x.id === photoId);
        if (p?.status !== 'pending') return;
        p.status = 'approved';
        p.reviewedAtMs = Date.now();
        p.reviewedBy = 'mock-moderator@gdgoc.dev';
        store.approvedCount++;
        emit();
      }, MOCK_REVIEW_MS);
    },

    watchMyPhotos(cb) {
      return subscribe(() => cb(store.photos.filter((p) => p.ownerUid === store.uid)));
    },

    watchConfig(cb) {
      return subscribe(() => cb({ ...store.config }));
    },

    watchStats(cb) {
      return subscribe(() => cb({ approvedCount: store.approvedCount }));
    },

    async photoUrl(photoId) {
      const cached = store.urls.get(photoId);
      if (cached) return cached;
      const blob = store.blobs.get(photoId);
      if (!blob) throw new Error('not found');
      const url = URL.createObjectURL(blob);
      store.urls.set(photoId, url);
      return url;
    },
  };
}

/** Dev helper: flip the uploads switch from the console to exercise E03. */
export function mockSetUploadsOpen(open: boolean) {
  store.config.uploadsOpen = open;
  emit();
}
