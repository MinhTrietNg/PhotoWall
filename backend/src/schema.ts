// Shared data contract for PhotoWall. Security rules cannot import this file,
// so every constant here is duplicated in firestore.rules / storage.rules —
// change both together.
import type { Timestamp } from 'firebase/firestore';

export const PHOTO_STATUSES = ['uploading', 'pending', 'approved', 'rejected', 'removed'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const FRAME_VARIANTS = ['light', 'dark'] as const;
export type FrameVariant = (typeof FRAME_VARIANTS)[number];

export const LIMITS = {
  submitIntervalSeconds: 60,
  maxSubmitsPerUser: 20,
  maxUploadBytes: 2 * 1024 * 1024,
  maxThumbBytes: 300 * 1024,
  displayNameMaxLength: 40,
} as const;

export const paths = {
  config: 'config/app',
  stats: 'stats/public',
  user: (uid: string) => `users/${uid}`,
  photo: (photoId: string) => `photos/${photoId}`,
  moderator: (email: string) => `moderators/${email}`,
  photoObject: (photoId: string) => `photos/${photoId}/strip.jpg`,
  /** Small copy of the strip (~400px wide) for the phone feed. */
  photoThumb: (photoId: string) => `photos/${photoId}/thumb.jpg`,
};

export interface AppConfig {
  uploadsOpen: boolean;
  eventName: string;
}

export interface PublicStats {
  approvedCount: number;
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
  reviewedBy?: string;
}
