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
  ReviewConflict,
  SubmitFailure,
  type AppConfig,
  type GuestApi,
  type ModeratorApi,
  type ModTab,
  type Photo,
  type PhotoStatus,
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
  moderatorEmail: string | null;
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
  moderatorEmail: null,
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

// ------------------------------------------------------------ moderators

const MODERATOR_ALLOWLIST = new Set([
  'lan@gdgoc.dev',
  'huy@gdgoc.dev',
  'mai@aws-sc.vn',
  'duc@doanhoi.sgu',
]);

/** Sample queue content so M01/M02 are demoable with no emulator — DESIGN-D21. */
function seedModerationDemo() {
  if (store.photos.length > 0) return;
  const now = Date.now();
  const demo: Array<[string, string, PhotoStatus, string, number]> = [
    ['mock-131', 'Đức Huy', 'pending', 'f03-partners', 1],
    ['mock-130', 'Minh Triết', 'pending', 'f01-gdgoc', 4],
    ['mock-129', 'Lan Anh', 'pending', 'f02-aws', 6],
    ['mock-128', 'Hải Đăng', 'approved', 'f01-gdgoc', 20],
    ['mock-127', 'Thu Hà', 'approved', 'f03-partners', 40],
    ['mock-126', 'Quang Huy', 'removed', 'f02-aws', 90],
    ['mock-125', 'Bảo Ngọc', 'rejected', 'f01-gdgoc', 120],
  ];
  for (const [id, displayName, status, frameVariant, minutesAgo] of demo) {
    const createdAtMs = now - minutesAgo * 60_000;
    store.photos.push({
      id,
      ownerUid: `mock-guest-${id}`,
      displayName,
      frameVariant,
      status,
      storagePath: `photos/${id}/strip.jpg`,
      createdAtMs,
      submittedAtMs: createdAtMs + 2_000,
      reviewedAtMs: status === 'pending' ? undefined : createdAtMs + 90_000,
      reviewedBy: status === 'pending' ? undefined : 'lan@gdgoc.dev',
    });
  }
}

function requireReviewable(photoId: string, from: PhotoStatus): Photo {
  const photo = store.photos.find((p) => p.id === photoId);
  if (!photo || photo.status !== from) throw new ReviewConflict(photoId);
  return photo;
}

function tabStatuses(tab: ModTab): PhotoStatus[] {
  return tab === 'pending' ? ['pending'] : tab === 'approved' ? ['approved'] : ['rejected', 'removed'];
}

export function createMockModeratorBackend(): ModeratorApi {
  seedModerationDemo();

  return {
    watchAuthState(cb) {
      return subscribe(() => cb(store.moderatorEmail ? { email: store.moderatorEmail } : null));
    },

    async signIn() {
      await wait(300);
      // ?mockFail=denied reproduces the M00 "not on the allowlist" error with no real Google account.
      const denied = new URLSearchParams(location.search).get('mockFail') === 'denied';
      store.moderatorEmail = denied ? 'khach@gmail.com' : 'lan@gdgoc.dev';
      emit();
    },

    async signOut() {
      store.moderatorEmail = null;
      emit();
    },

    async isModerator() {
      return store.moderatorEmail !== null && MODERATOR_ALLOWLIST.has(store.moderatorEmail);
    },

    watchTab(tab, cb, max = 200) {
      const statuses = tabStatuses(tab);
      return subscribe(() => {
        const rows = store.photos
          .filter((p) => statuses.includes(p.status))
          .sort((a, b) =>
            tab === 'pending'
              ? (a.submittedAtMs ?? a.createdAtMs) - (b.submittedAtMs ?? b.createdAtMs)
              : (b.reviewedAtMs ?? 0) - (a.reviewedAtMs ?? 0),
          )
          .slice(0, max);
        cb(rows);
      });
    },

    async approve(photoId) {
      await wait(200);
      const photo = requireReviewable(photoId, 'pending');
      photo.status = 'approved';
      photo.reviewedAtMs = Date.now();
      photo.reviewedBy = store.moderatorEmail ?? undefined;
      store.approvedCount++;
      emit();
    },

    async reject(photoId) {
      await wait(200);
      const photo = requireReviewable(photoId, 'pending');
      photo.status = 'rejected';
      photo.reviewedAtMs = Date.now();
      photo.reviewedBy = store.moderatorEmail ?? undefined;
      emit();
    },

    async remove(photoId) {
      await wait(200);
      const photo = requireReviewable(photoId, 'approved');
      photo.status = 'removed';
      photo.reviewedAtMs = Date.now();
      photo.reviewedBy = store.moderatorEmail ?? undefined;
      store.approvedCount--;
      emit();
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

    watchConfig(cb) {
      return subscribe(() => cb({ ...store.config }));
    },

    async setUploadsOpen(open) {
      store.config = { ...store.config, uploadsOpen: open };
      emit();
    },

    async setEventName(eventName) {
      store.config = { ...store.config, eventName };
      emit();
    },
  };
}
