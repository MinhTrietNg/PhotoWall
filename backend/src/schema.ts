// Shared data contract for PhotoWall. Security rules cannot import this file,
// so every constant here is duplicated in firestore.rules / storage.rules —
// change both together.
import type { Timestamp } from 'firebase/firestore';

export const PHOTO_STATUSES = ['uploading', 'pending', 'approved', 'rejected', 'removed'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

/** Frame ids from frontend/public/frames/frames.json, e.g. "f01-gdgoc". */
export const FRAME_ID_PATTERN = /^f[0-9]{2}-[a-z0-9-]{1,30}$/;
export type FrameVariant = string;

/** Reasons offered by the moderation console's remove dialog (DESIGN-D21). */
export const REVIEW_REASONS = ['inappropriate', 'duplicate', 'guest-request'] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

/** `reviewedBy` value when the guest removed their own photo. Such removals are final. */
export const OWNER_REVIEWER = 'owner';

export const MODERATOR_ROLES = ['admin', 'moderator'] as const;
export type ModeratorRole = (typeof MODERATOR_ROLES)[number];

export const LIMITS = {
  submitIntervalSeconds: 60,
  /** Upper bound an admin may set for `maxSubmitsPerUser`. */
  maxSubmitsPerUserCeiling: 20,
  maxUploadBytes: 2 * 1024 * 1024,
  displayNameMaxLength: 40,
  maxRetentionHours: 168,
} as const;

export const paths = {
  config: 'config/app',
  stats: 'stats/public',
  user: (uid: string) => `users/${uid}`,
  photo: (photoId: string) => `photos/${photoId}`,
  moderator: (email: string) => `moderators/${email}`,
  photoObject: (photoId: string) => `photos/${photoId}/strip.jpg`,
};

export interface FrameSetting {
  id: string;
  enabled: boolean;
}

/**
 * `config/app` (DESIGN-D22 · M02). Only `uploadsOpen` and `eventName` are required;
 * read it through `resolveConfig` to fill the rest with defaults.
 */
export interface AppConfig {
  uploadsOpen: boolean;
  eventName: string;
  /** Set by the server whenever `uploadsOpen` flips — "Đã đóng lúc 17:30". */
  uploadsChangedAt?: Timestamp | null;
  /** "Tự động đóng lúc": uploads are refused by the rules from this moment. */
  closesAt?: Timestamp | null;
  /** "Giới hạn mỗi phiên": strips per guest, 1–20. */
  maxSubmitsPerUser?: number;
  /** "Cho phép chọn ảnh từ thư viện". Enforced by the frontend only. */
  allowGallery?: boolean;
  /** "Giữ ảnh đã gỡ": hours a removed/rejected strip can still be restored. */
  removedRetentionHours?: number;
  /** "Tốc độ trượt" in px/s; null = the design's 70 s per loop. */
  marqueePxPerSec?: number | null;
  /** "Hiện tên người gửi" on the big screen. */
  showNames?: boolean;
  /** "Card 'Vừa lên Wall'" on the big screen. */
  arrivalCard?: boolean;
  /** "Link trong mã QR". */
  qrUrl?: string;
  /** "Trạng thái khung": order = order on the frame picker; disabled frames are hidden. */
  frames?: FrameSetting[];
  /** "Làm mới màn lớn": the big screen reloads when this changes. */
  displayReloadAt?: Timestamp | null;
}

export const CONFIG_DEFAULTS = {
  uploadsChangedAt: null,
  closesAt: null,
  maxSubmitsPerUser: 3,
  allowGallery: true,
  removedRetentionHours: 24,
  marqueePxPerSec: null,
  showNames: true,
  arrivalCard: true,
  qrUrl: 'https://photowall-gdgocsgu.web.app/',
  frames: [] as FrameSetting[],
  displayReloadAt: null,
} satisfies Omit<Required<AppConfig>, 'uploadsOpen' | 'eventName'>;

export type ResolvedConfig = Required<AppConfig>;

export function resolveConfig(raw: AppConfig): ResolvedConfig {
  return { ...CONFIG_DEFAULTS, ...raw } as ResolvedConfig;
}

/** Mirrors the rules: open, and before `closesAt` if one is set. */
export function isAcceptingUploads(config: ResolvedConfig, now: number = Date.now()): boolean {
  return config.uploadsOpen && (config.closesAt == null || now < config.closesAt.toMillis());
}

export interface PublicStats {
  /** Strips currently on the wall. */
  approvedCount: number;
  /** Every approval ever; source of "Khoảnh khắc #N". Never decreases. */
  momentSeq?: number;
}

export interface ModeratorDoc {
  role?: ModeratorRole;
  name?: string;
  org?: string;
  note?: string;
}

export interface UserDoc {
  lastSubmitAt: Timestamp;
  lastPhotoId: string;
  submitCount: number;
}

export interface PhotoDoc {
  ownerUid: string;
  displayName: string;
  frameVariant: FrameVariant;
  status: PhotoStatus;
  storagePath: string;
  createdAt: Timestamp;
  submittedAt?: Timestamp;
  reviewedAt?: Timestamp;
  /** Moderator email, or OWNER_REVIEWER when the guest removed it. */
  reviewedBy?: string;
  /** "Khoảnh khắc #N", assigned at first approval. */
  momentNo?: number;
  reviewReason?: ReviewReason;
  /** Set once the stored strip has been deleted; the photo can no longer be restored. */
  purgedAt?: Timestamp;
}
