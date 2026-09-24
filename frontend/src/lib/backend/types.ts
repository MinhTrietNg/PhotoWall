/**
 * The frontend's port to the backend.
 *
 * The UI talks only to this interface, never to Firestore directly. Two
 * implementations exist: `mock.ts` (in-memory, no Firebase — lets the whole flow
 * run with no emulator) and `firebase.ts` (the real backend/src/client.ts).
 *
 * Signatures mirror backend/src/client.ts. See Claude/Claude-Plan.md §12, §13.2.
 */

export type PhotoStatus = 'uploading' | 'pending' | 'approved' | 'rejected' | 'removed';

export interface Photo {
  id: string;
  ownerUid: string;
  displayName: string;
  /** The frame id, e.g. "f01-gdgoc". See Claude-Plan.md §20.5 #1. */
  frameVariant: string;
  status: PhotoStatus;
  storagePath: string;
  createdAtMs: number;
  submittedAtMs?: number;
  reviewedAtMs?: number;
  /** Moderator email, or 'owner' when the guest removed it themselves. */
  reviewedBy?: string;
  /** "Khoảnh khắc #N", set when the photo is first approved. */
  momentNo?: number;
  /** S02 "Hiện tên trên màn hình lớn". false = big screen shows "Tân sinh viên". */
  showName: boolean;
  /** Why a moderator removed it (M01 remove dialog). Never shown to the guest. */
  reviewReason?: ReviewReason;
  /** Set once the stored strip was deleted — no longer restorable or viewable. */
  purgedAtMs?: number;
}

/** M01 remove dialog: Không phù hợp · Trùng / lỗi ảnh · Người gửi yêu cầu. */
export type ReviewReason = 'inappropriate' | 'duplicate' | 'guest-request';

export interface FrameSetting {
  id: string;
  enabled: boolean;
}

/** M02 "Xoá toàn bộ dữ liệu sau sự kiện · cần 2 Admin xác nhận". */
export interface DeletionSchedule {
  atMs: number;
  requestedBy: string;
  confirmedBy: string | null;
  executedAtMs: number | null;
}

/** `config/app` — M02 settings. Fields other than the first two are filled with defaults. */
export interface AppConfig {
  uploadsOpen: boolean;
  eventName: string;
  /** When uploadsOpen last flipped — E03 "Đã đóng lúc 17:30". */
  uploadsChangedAtMs?: number | null;
  /** "Tự động đóng lúc". */
  closesAtMs?: number | null;
  /** "Giới hạn mỗi phiên" (1–20). */
  maxSubmitsPerUser?: number;
  /** "Cho phép chọn ảnh từ thư viện". */
  allowGallery?: boolean;
  /** "Giữ ảnh đã gỡ" in hours (1–168). */
  removedRetentionHours?: number;
  /** "Tốc độ trượt" px/s; null = the default 70 s per loop. */
  marqueePxPerSec?: number | null;
  /** "Hiện tên người gửi" on the big screen. */
  showNames?: boolean;
  /** "Card 'Vừa lên Wall'". */
  arrivalCard?: boolean;
  /** "Link trong mã QR". */
  qrUrl?: string;
  /** "Trạng thái khung": order and on/off; empty = frames.json as is. */
  frames?: FrameSetting[];
  /** "Làm mới màn lớn": big screens reload when this changes. */
  displayReloadAtMs?: number | null;
  deletionSchedule?: DeletionSchedule | null;
}

/** Fields an admin can write from M02 (the rest are stamped by the backend). */
export type ConfigPatch = Partial<
  Omit<AppConfig, 'uploadsChangedAtMs' | 'displayReloadAtMs' | 'deletionSchedule'>
>;

export type SubmitErrorCode =
  | 'invalid-input'
  | 'uploads-closed'
  | 'rate-limited'
  | 'quota-exceeded'
  | 'upload-failed'
  | 'unknown';

/**
 * Thrown by submit/resume. Carries everything the UI needs to pick a screen —
 * see the mapping table in Claude-Plan.md §14.1.
 */
export class SubmitFailure extends Error {
  constructor(
    readonly code: SubmitErrorCode,
    /** Present on `upload-failed`: retry with resumeSubmission(photoId, image). */
    readonly photoId?: string,
    /** Present on `rate-limited`. */
    readonly retryAfterSeconds?: number,
    readonly cause?: unknown,
  ) {
    super(code);
    this.name = 'SubmitFailure';
  }
}

export interface SubmitInput {
  /** The composed 4-shot strip, JPEG, 1080 x 3400. */
  image: Blob;
  displayName: string;
  frameVariant: string;
  /** S02 "Hiện tên trên màn hình lớn". */
  showName?: boolean;
}

export type Unsubscribe = () => void;

// ------------------------------------------------------------ moderators

export interface ModeratorProfile {
  email: string;
}

/**
 * Board 07 · Phân quyền. `moderator` (AWS SC · Đoàn hội): duyệt, gỡ, khôi phục.
 * `admin` (GDGoC): additionally M02 — uploads switch, settings, frames, moderators,
 * export and the scheduled wipe. The rules enforce this; the UI should hide what
 * a role cannot do.
 */
export type ModeratorRole = 'admin' | 'moderator';

/** An allowlist entry — "Lan Phạm · lan@gdgoc.dev · Admin · GDGoC". */
export interface ModeratorAccount {
  email: string;
  role: ModeratorRole;
  name?: string;
  org?: string;
}

/** Result of a bulk action: which ids succeeded, lost to another moderator, or failed. */
export interface BulkResult {
  ok: string[];
  conflicts: string[];
  failed: string[];
}

/** One strip for "Tải toàn bộ dải ảnh (.zip)": its file name inside the ZIP. */
export interface ZipEntry {
  photoId: string;
  fileName: string;
}

/**
 * `rejected` (never made the wall) and `removed` (taken down after approval)
 * are one tab in the console — "Đã gỡ". Claude-Plan.md §20.5 #2.
 */
export type ModTab = 'pending' | 'approved' | 'removed';

/** Thrown by approve/reject/remove when another moderator already handled the photo. */
export class ReviewConflict extends Error {
  constructor(readonly photoId: string) {
    super(photoId);
    this.name = 'ReviewConflict';
  }
}

export interface ModeratorApi {
  /** The signed-in Google user, or null. Fires once immediately, then on change. */
  watchAuthState(cb: (user: ModeratorProfile | null) => void): Unsubscribe;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Whether the signed-in user is on the moderators allowlist. */
  isModerator(): Promise<boolean>;
  /** The signed-in user's allowlist entry (role, name, org), or null if not allowed. */
  getMyModerator(): Promise<ModeratorAccount | null>;

  /** Photos for one queue tab. `pending` is oldest-submitted first; the others newest-reviewed first. */
  watchTab(tab: ModTab, cb: (photos: Photo[]) => void, max?: number): Unsubscribe;
  /** Exact tab size for the badge — watchTab lists are capped at `max`. */
  countTab(tab: ModTab): Promise<number>;

  approve(photoId: string): Promise<void>;
  /** `pending -> rejected`. Kept `removedRetentionHours`, restorable. */
  reject(photoId: string, reason?: ReviewReason): Promise<void>;
  /** `approved -> removed`. Kept `removedRetentionHours`, restorable. */
  remove(photoId: string, reason?: ReviewReason): Promise<void>;
  /** "Khôi phục" on the Đã gỡ tab. Refused after the retention window or for a guest's own removal. */
  restore(photoId: string): Promise<void>;
  /** Bulk bar "Duyệt N ảnh" / "Gỡ N ảnh" — one at a time, never in parallel. */
  approveMany(photoIds: string[]): Promise<BulkResult>;
  rejectMany(photoIds: string[], reason?: ReviewReason): Promise<BulkResult>;
  removeMany(photoIds: string[], reason?: ReviewReason): Promise<BulkResult>;
  /** Deletes strips past the retention window. Call once when the console opens. */
  purgeExpired(): Promise<number>;

  /** Download URL for a photo the caller may read (any status, moderators can read all). */
  photoUrl(photoId: string): Promise<string>;

  watchConfig(cb: (config: AppConfig | null) => void): Unsubscribe;
  /** Admin only — the rules refuse moderators. */
  setUploadsOpen(open: boolean): Promise<void>;
  /** Admin only. */
  setEventName(name: string): Promise<void>;
  /** Admin only. M02 "Lưu": one write for every changed field. */
  updateConfig(patch: ConfigPatch): Promise<void>;
  /** Admin only. "Làm mới màn lớn". */
  requestDisplayReload(): Promise<void>;

  /** M02 "Người kiểm duyệt". Readable by any moderator. */
  watchModerators(cb: (list: ModeratorAccount[]) => void): Unsubscribe;
  /** Admin only. "Thêm" / change role. */
  saveModerator(email: string, data: { role: ModeratorRole; name?: string; org?: string }): Promise<void>;
  /** Admin only; an admin cannot remove themselves. */
  deleteModerator(email: string): Promise<void>;

  /** Admin. "Xuất danh sách tham gia (.csv)" — CSV text (UTF-8 BOM), wall photos only. */
  exportParticipantsCsv(): Promise<string>;
  /** Admin. "Tải toàn bộ dải ảnh (.zip)" — wall photos in moment order with their ZIP file names. */
  listZipEntries(): Promise<ZipEntry[]>;
  /** One strip's bytes for the ZIP. */
  fetchStripBlob(photoId: string): Promise<Blob>;

  /** Admin. "Lên lịch xoá" — a second admin must confirm. */
  scheduleDeletion(at: Date): Promise<void>;
  /** Admin other than the one who scheduled it. */
  confirmDeletion(): Promise<void>;
  cancelDeletion(): Promise<void>;
  /** Admin. Runs a confirmed, due wipe (call when the console opens); null if nothing ran. */
  runDueDeletion(): Promise<{ photos: number; users: number } | null>;
}

export interface GuestApi {
  /**
   * Anonymous sign-in. MUST only be called when the guest presses Send, never on
   * page load — the venue shares one wifi IP and Firebase caps new anonymous
   * accounts per IP. Claude-Plan.md §12.4.
   */
  ensureGuest(): Promise<string>;

  /** Creates the photo doc, uploads the strip, marks it pending. Returns the id. */
  submitPhoto(input: SubmitInput, onProgress?: (fraction: number | null) => void): Promise<string>;

  /**
   * Upload + mark-pending only. The retry path after `upload-failed`.
   * Never call submitPhoto again — that trips the 60s rate limiter.
   */
  resumeSubmission(
    photoId: string,
    image: Blob,
    onProgress?: (fraction: number | null) => void,
  ): Promise<void>;

  /** The signed-in guest's own photos, newest first. Live. */
  watchMyPhotos(cb: (photos: Photo[]) => void): Unsubscribe;

  /** Event config. Drives the uploads-closed redirect. Live. */
  watchConfig(cb: (config: AppConfig | null) => void): Unsubscribe;

  /** Approved-photo count, for "Khoảnh khắc thứ N". Live. */
  watchStats(cb: (stats: { approvedCount: number }) => void): Unsubscribe;

  /** Download URL for a photo the caller may read. Cached. */
  photoUrl(photoId: string): Promise<string>;

  /**
   * "Gỡ dải ảnh này" on S07 / S07b. Final: off the big screen at once, never restorable
   * (the strip is kept 24 h for the organisers, then deleted).
   * Only while the photo is pending or approved.
   */
  removeMyPhoto(photoId: string): Promise<void>;
}

// ------------------------------------------------------------ big screen

export interface ApprovedUpdate {
  /** The latest approved photos, newest-approved first (up to `max`). */
  photos: Photo[];
  /** Entered the list since the previous callback. Always empty on the first one. */
  added: Photo[];
  /** Left the list since the previous callback — removed, or pushed out of the window. */
  removedIds: string[];
}

/** The "Màn hình lớn" section of config/app (DESIGN-D22), defaults filled in. */
export interface DisplayConfig {
  /** "Hiện tên người gửi". */
  showNames: boolean;
  /** "Card 'Vừa lên Wall'". Off: a new strip goes straight into the track. */
  arrivalCard: boolean;
  /** "Tốc độ trượt". null = the design's pace. */
  marqueePxPerSec: number | null;
  /** "Link trong mã QR". */
  qrUrl: string;
  /** "Làm mới màn lớn": every big screen reloads when this changes. */
  reloadRequestedAtMs: number | null;
}

/** The kiosk at /display/. Read-only, and signed out: approved strips are public. */
export interface DisplayApi {
  watchApproved(cb: (update: ApprovedUpdate) => void, max?: number): Unsubscribe;
  /** approvedCount = strips on the wall right now. */
  watchStats(cb: (stats: { approvedCount: number }) => void): Unsubscribe;
  watchConfig(cb: (config: DisplayConfig) => void): Unsubscribe;
  photoUrl(photoId: string): Promise<string>;
}
