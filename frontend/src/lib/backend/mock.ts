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
import { stripFileName } from '@backend/export';
import {
  ReviewConflict,
  SubmitFailure,
  type AppConfig,
  type BulkResult,
  type GuestApi,
  type ModeratorAccount,
  type ModeratorApi,
  type ModTab,
  type Photo,
  type PhotoStatus,
  type ReviewReason,
  type SubmitInput,
  type Unsubscribe,
} from './types';

// Mirrors backend/src/schema.ts LIMITS.
const SUBMIT_INTERVAL_SECONDS = 60;
const MAX_SUBMITS_PER_USER = 3; // config.maxSubmitsPerUser default
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const DISPLAY_NAME_MAX = 24;

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
        showName: input.showName !== false,
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
      // from S07b to S07 in place.
      setTimeout(() => {
        const p = store.photos.find((x) => x.id === photoId);
        if (p?.status !== 'pending') return;
        p.status = 'approved';
        p.reviewedAtMs = Date.now();
        p.reviewedBy = 'mock-moderator@gdgoc.dev';
        store.approvedCount++;
        p.momentNo = store.approvedCount;
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

    async removeMyPhoto(photoId) {
      await wait(300);
      const p = store.photos.find((x) => x.id === photoId && x.ownerUid === store.uid);
      if (!p || (p.status !== 'pending' && p.status !== 'approved')) throw new Error('not removable');
      if (p.status === 'approved') store.approvedCount--;
      p.status = 'removed';
      p.reviewedBy = 'owner';
      p.reviewedAtMs = Date.now();
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
  };
}

// ------------------------------------------------------------ moderators

/** Board M02 "Người kiểm duyệt". GDGoC are admins; AWS SC and Đoàn hội moderate. */
const mockModerators: ModeratorAccount[] = [
  { email: 'lan@gdgoc.dev', role: 'admin', name: 'Lan Phạm', org: 'GDGoC' },
  { email: 'huy@gdgoc.dev', role: 'admin', name: 'Huy Trần', org: 'GDGoC' },
  { email: 'mai@aws-sc.vn', role: 'moderator', name: 'Mai Lê', org: 'AWS SC' },
  { email: 'duc@doanhoi.sgu', role: 'moderator', name: 'Đức Nguyễn', org: 'Đoàn hội' },
];

const RETENTION_MS = 24 * 3_600_000;

/** Sample queue content so M01/M02 are demoable with no emulator — DESIGN-D21. */
function seedModerationDemo() {
  if (store.photos.length > 0) return;
  const now = Date.now();
  const demo: Array<[string, string, PhotoStatus, string, number]> = [
    ['mock-131', 'Đức Huy', 'pending', 'f03-isf', 1],
    ['mock-130', 'Minh Triết', 'pending', 'f01-gdgoc', 4],
    ['mock-129', 'Lan Anh', 'pending', 'f02-aws', 6],
    ['mock-128', 'Hải Đăng', 'approved', 'f01-gdgoc', 20],
    ['mock-127', 'Thu Hà', 'approved', 'f03-isf', 40],
    ['mock-126', 'Quang Huy', 'removed', 'f02-aws', 90],
    ['mock-125', 'Bảo Ngọc', 'rejected', 'f01-gdgoc', 120],
  ];
  for (const [id, displayName, status, frameVariant, minutesAgo] of demo) {
    const createdAtMs = now - minutesAgo * 60_000;
    store.photos.push({
      id,
      ownerUid: `mock-guest-${id}`,
      displayName,
      showName: true,
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

function requireReviewable(photoId: string, ...from: PhotoStatus[]): Photo {
  const photo = store.photos.find((p) => p.id === photoId);
  if (!photo || !from.includes(photo.status)) throw new ReviewConflict(photoId);
  return photo;
}

function me(): ModeratorAccount | null {
  return mockModerators.find((m) => m.email === store.moderatorEmail) ?? null;
}

/** The mock enforces the same role split as the rules, so the UI can be tried as either role. */
function requireAdmin() {
  if (me()?.role !== 'admin') throw new Error('permission-denied: admin only');
}

function markReviewed(photo: Photo, status: PhotoStatus, reason?: ReviewReason) {
  photo.status = status;
  photo.reviewedAtMs = Date.now();
  photo.reviewedBy = store.moderatorEmail ?? undefined;
  photo.reviewReason = reason;
}

async function bulk(ids: string[], run: (id: string) => Promise<void>): Promise<BulkResult> {
  const result: BulkResult = { ok: [], conflicts: [], failed: [] };
  for (const id of ids) {
    try {
      await run(id);
      result.ok.push(id);
    } catch (e) {
      (e instanceof ReviewConflict ? result.conflicts : result.failed).push(id);
    }
  }
  return result;
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
      // ?mockRole=moderator signs in as a moderator (no M02) instead of an admin.
      const params = new URLSearchParams(location.search);
      store.moderatorEmail =
        params.get('mockFail') === 'denied'
          ? 'khach@gmail.com'
          : params.get('mockRole') === 'moderator'
            ? 'mai@aws-sc.vn'
            : 'lan@gdgoc.dev';
      emit();
    },

    async signOut() {
      store.moderatorEmail = null;
      emit();
    },

    async isModerator() {
      return me() !== null;
    },

    async getMyModerator() {
      return me();
    },

    async countTab(tab) {
      const statuses = tabStatuses(tab);
      return store.photos.filter((p) => statuses.includes(p.status)).length;
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
      markReviewed(photo, 'approved');
      store.approvedCount++;
      photo.momentNo ??= store.approvedCount;
      emit();
    },

    async reject(photoId, reason) {
      await wait(200);
      markReviewed(requireReviewable(photoId, 'pending'), 'rejected', reason);
      emit();
    },

    async remove(photoId, reason) {
      await wait(200);
      markReviewed(requireReviewable(photoId, 'approved'), 'removed', reason);
      store.approvedCount--;
      emit();
    },

    async restore(photoId) {
      await wait(200);
      const photo = requireReviewable(photoId, 'rejected', 'removed');
      if (photo.reviewedBy === 'owner' || photo.purgedAtMs || Date.now() - (photo.reviewedAtMs ?? 0) > RETENTION_MS) {
        throw new Error('permission-denied: not restorable');
      }
      markReviewed(photo, 'approved');
      store.approvedCount++;
      photo.momentNo ??= store.approvedCount;
      emit();
    },

    approveMany(ids) {
      return bulk(ids, (id) => this.approve(id));
    },

    rejectMany(ids, reason) {
      return bulk(ids, (id) => this.reject(id, reason));
    },

    removeMany(ids, reason) {
      return bulk(ids, (id) => this.remove(id, reason));
    },

    async purgeExpired() {
      let n = 0;
      for (const p of store.photos) {
        if ((p.status === 'rejected' || p.status === 'removed') && !p.purgedAtMs
          && Date.now() - (p.reviewedAtMs ?? 0) > RETENTION_MS) {
          p.purgedAtMs = Date.now();
          n++;
        }
      }
      if (n) emit();
      return n;
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
      requireAdmin();
      store.config = { ...store.config, uploadsOpen: open, uploadsChangedAtMs: Date.now() };
      emit();
    },

    async setEventName(eventName) {
      requireAdmin();
      store.config = { ...store.config, eventName };
      emit();
    },

    async updateConfig(patch) {
      requireAdmin();
      const flipped = patch.uploadsOpen !== undefined && patch.uploadsOpen !== store.config.uploadsOpen;
      store.config = { ...store.config, ...patch, ...(flipped ? { uploadsChangedAtMs: Date.now() } : {}) };
      emit();
    },

    async requestDisplayReload() {
      requireAdmin();
      store.config = { ...store.config, displayReloadAtMs: Date.now() };
      emit();
    },

    watchModerators(cb) {
      return subscribe(() => cb([...mockModerators]));
    },

    async saveModerator(email, data) {
      requireAdmin();
      const e = email.trim().toLowerCase();
      const i = mockModerators.findIndex((m) => m.email === e);
      const next = { email: e, ...data };
      if (i >= 0) mockModerators[i] = next;
      else mockModerators.push(next);
      emit();
    },

    async deleteModerator(email) {
      requireAdmin();
      const e = email.trim().toLowerCase();
      if (e === store.moderatorEmail) throw new Error('permission-denied: cannot remove yourself');
      const i = mockModerators.findIndex((m) => m.email === e);
      if (i >= 0) mockModerators.splice(i, 1);
      emit();
    },

    async exportParticipantsCsv() {
      requireAdmin();
      const rows = store.photos.filter((p) => p.status === 'approved');
      const lines = rows.map((p) => [p.momentNo ?? '', p.displayName, p.showName ? 'có' : 'không', p.frameVariant].join(','));
      return `\uFEFFKhoảnh khắc,Tên,Hiện tên,Khung\r\n${lines.join('\r\n')}\r\n`;
    },

    async listZipEntries() {
      requireAdmin();
      return store.photos
        .filter((p) => p.status === 'approved')
        .map((p) => ({ photoId: p.id, fileName: stripFileName(p) }));
    },

    async fetchStripBlob(photoId) {
      const blob = store.blobs.get(photoId);
      if (!blob) throw new Error('not found');
      return blob;
    },

    async scheduleDeletion(at) {
      requireAdmin();
      store.config = {
        ...store.config,
        deletionSchedule: { atMs: at.getTime(), requestedBy: store.moderatorEmail!, confirmedBy: null, executedAtMs: null },
      };
      emit();
    },

    async confirmDeletion() {
      requireAdmin();
      const s = store.config.deletionSchedule;
      if (!s || s.requestedBy === store.moderatorEmail) throw new Error('permission-denied: needs a second admin');
      store.config = { ...store.config, deletionSchedule: { ...s, confirmedBy: store.moderatorEmail } };
      emit();
    },

    async cancelDeletion() {
      requireAdmin();
      store.config = { ...store.config, deletionSchedule: null };
      emit();
    },

    async runDueDeletion() {
      const s = store.config.deletionSchedule;
      if (me()?.role !== 'admin' || !s?.confirmedBy || s.executedAtMs || Date.now() < s.atMs) return null;
      const photos = store.photos.length;
      store.photos = [];
      store.approvedCount = 0;
      store.config = { ...store.config, deletionSchedule: { ...s, executedAtMs: Date.now() } };
      emit();
      return { photos, users: 0 };
    },
  };
}
