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
import { composeStrip } from '@/features/frames/compose';
import { findFrame, loadFrames } from '@/features/frames/frameRegistry';
import {
  ReviewConflict,
  SubmitFailure,
  type AppConfig,
  type ApprovedUpdate,
  type BulkResult,
  type DisplayApi,
  type DisplayConfig,
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

/**
 * Sample queue content so M01/M02 are demoable with no emulator — DESIGN-D21.
 * The three pending rows are the artboard's: Đức Huy #131 on F03, Bảo Trân
 * #130 and Gia Hân #127 on F02, waiting 1, 2 and 6 minutes.
 */
function seedModerationDemo() {
  if (store.photos.length > 0) return;
  const now = Date.now();
  const demo: Array<[number, string, PhotoStatus, string, number]> = [
    [131, 'Đức Huy', 'pending', 'f03-isf', 1],
    [130, 'Bảo Trân', 'pending', 'f02-aws', 2],
    [127, 'Gia Hân', 'pending', 'f02-aws', 6],
    [129, 'Minh Triết', 'approved', 'f01-gdgoc', 12],
    [128, 'Thu Hà', 'approved', 'f01-gdgoc', 30],
    [126, 'Quốc Bảo', 'approved', 'f02-aws', 45],
    [121, 'Khánh Vy', 'removed', 'f02-aws', 50],
    [118, 'Hải Đăng', 'rejected', 'f01-gdgoc', 80],
  ];
  for (const [n, displayName, status, frameVariant, minutesAgo] of demo) {
    const id = String(n);
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

// ------------------------------------------------------------ big screen

/**
 * /display runs in its own tab, so it cannot see the guest or moderator mock
 * above. It gets its own wall instead: the fourteen strips DESIGN-D18 draws,
 * and a new approval every half minute so the arrival sequence (D19) plays on
 * its own. `?mockBurst=5` lands five at once to show the queue merging, and the
 * console has `photowallDisplay.arrive(n, name?)`, `.remove(id?)` and `.config({...})`.
 */
const MOCK_ARRIVAL_MS = 30_000;

const DEMO_NAMES = [
  'Minh Triết',
  'Thu Hà',
  'Quốc Bảo',
  'Lan Anh',
  'Gia Hân',
  'Khánh Vy',
  'Hải Đăng',
  'Bảo Ngọc',
  'Đức Huy',
  'Mai Phương',
  'Tuấn Kiệt',
  'Ngọc Hân',
  'Phúc An',
  'Nguyễn Hoàng Thanh Tâm',
];
const DEMO_FRAMES = ['f01-gdgoc', 'f02-aws', 'f03-isf'];
// The pastel slots of the strip tiles on DESIGN-D03: blue, yellow, green, red.
const DEMO_TINTS = [
  ['#d2e3fc', '#4285f4'],
  ['#feefc3', '#fbbc04'],
  ['#ceead6', '#34a853'],
  ['#fad2cf', '#ea4335'],
] as const;

interface DisplayStore {
  approved: Photo[];
  approvedCount: number;
  momentSeq: number;
  config: DisplayConfig;
}

let displayStore: DisplayStore | null = null;
let demoSeq = 0;

function demoPhoto(momentNo: number, reviewedAtMs: number): Photo {
  const n = demoSeq++;
  return {
    id: `mock-d${n}`,
    ownerUid: `mock-guest-d${n}`,
    displayName: DEMO_NAMES[n % DEMO_NAMES.length],
    frameVariant: DEMO_FRAMES[n % DEMO_FRAMES.length],
    status: 'approved',
    storagePath: `photos/mock-d${n}/strip.jpg`,
    createdAtMs: reviewedAtMs - 90_000,
    submittedAtMs: reviewedAtMs - 88_000,
    reviewedAtMs,
    reviewedBy: 'mock-moderator@gdgoc.dev',
    momentNo,
    // One guest in five switched the name off on S02, so "Tân sinh viên" shows up too.
    showName: n % 5 !== 3,
  };
}

/** A 4:3 "shot": a tint with a head-and-shoulders silhouette, like the design's placeholders. */
function demoShot(light: string, strong: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no 2d canvas'));
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = strong;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(400, 250, 105, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(400, 620, 230, 200, 0, Math.PI, 0);
  ctx.fill();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

const demoStrips = new Map<string, Promise<string>>();

/** One composed strip per frame and tint rotation, shared by every photo that maps to it. */
function demoStripUrl(photo: Photo): Promise<string> {
  const rotation = Number(photo.id.replace(/\D/g, '')) % DEMO_TINTS.length;
  const key = `${photo.frameVariant}:${rotation}`;
  let url = demoStrips.get(key);
  if (!url) {
    url = (async () => {
      const registry = await loadFrames();
      const frame = findFrame(registry, photo.frameVariant) ?? registry.frames[0];
      const shots = await Promise.all(
        [0, 1, 2, 3].map((i) => {
          const [light, strong] = DEMO_TINTS[(rotation + i) % DEMO_TINTS.length];
          return demoShot(light, strong);
        }),
      );
      const { blob } = await composeStrip(shots, frame);
      return URL.createObjectURL(blob);
    })();
    url.catch(() => demoStrips.delete(key));
    demoStrips.set(key, url);
  }
  return url;
}

export function createMockDisplayBackend(): DisplayApi {
  const now = Date.now();
  const d: DisplayStore = (displayStore ??= {
    // Newest first, three minutes apart, as watchApproved orders them.
    approved: Array.from({ length: 14 }, (_, i) => demoPhoto(128 - i, now - i * 180_000)),
    approvedCount: 128,
    momentSeq: 128,
    config: {
      showNames: true,
      arrivalCard: true,
      marqueePxPerSec: null,
      qrUrl: `${location.origin}/`,
      reloadRequestedAtMs: null,
    },
  });

  const approvedListeners = new Set<{ cb: (u: ApprovedUpdate) => void; max: number }>();
  const statsListeners = new Set<(stats: { approvedCount: number }) => void>();
  const configListeners = new Set<(config: DisplayConfig) => void>();

  function publish(added: Photo[], removedIds: string[]) {
    for (const l of approvedListeners) {
      l.cb({ photos: d.approved.slice(0, l.max), added, removedIds });
    }
    for (const l of statsListeners) l({ approvedCount: d.approvedCount });
  }

  function arrive(count = 1, name?: string) {
    const added = Array.from({ length: count }, () => {
      const photo = demoPhoto(++d.momentSeq, Date.now());
      return name ? { ...photo, displayName: name } : photo;
    });
    d.approved.unshift(...added.reverse());
    d.approvedCount += count;
    publish(added, []);
  }

  function remove(photoId = d.approved[0]?.id) {
    const i = d.approved.findIndex((p) => p.id === photoId);
    if (i < 0) return;
    d.approved.splice(i, 1);
    d.approvedCount--;
    publish([], [photoId]);
  }

  setInterval(() => arrive(1), MOCK_ARRIVAL_MS);
  const burst = Number(new URLSearchParams(location.search).get('mockBurst'));
  if (burst > 0) setTimeout(() => arrive(burst), 4000);

  (globalThis as { photowallDisplay?: unknown }).photowallDisplay = {
    arrive,
    remove,
    config(patch: Partial<DisplayConfig>) {
      d.config = { ...d.config, ...patch };
      for (const l of configListeners) l({ ...d.config });
    },
  };

  return {
    watchApproved(cb, max = 200) {
      const listener = { cb, max };
      approvedListeners.add(listener);
      queueMicrotask(() => cb({ photos: d.approved.slice(0, max), added: [], removedIds: [] }));
      return () => approvedListeners.delete(listener);
    },

    watchStats(cb) {
      statsListeners.add(cb);
      queueMicrotask(() => cb({ approvedCount: d.approvedCount }));
      return () => statsListeners.delete(cb);
    },

    watchConfig(cb) {
      configListeners.add(cb);
      queueMicrotask(() => cb({ ...d.config }));
      return () => configListeners.delete(cb);
    },

    async photoUrl(photoId) {
      const photo = d.approved.find((p) => p.id === photoId);
      if (!photo) throw new Error('not found');
      return demoStripUrl(photo);
    },
  };
}
