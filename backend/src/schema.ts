// Shared data contract for PhotoWall. Security rules cannot import this file,
// so every constant here is duplicated in firestore.rules / storage.rules —
// change both together.
import type { Timestamp } from 'firebase/firestore';

export const PHOTO_STATUSES = ['uploading', 'pending', 'approved', 'rejected', 'removed'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

/** Frame ids from frontend/public/frames/frames.json, e.g. "f01-gdgoc". */
export const FRAME_ID_PATTERN = /^f[0-9]{2}-[a-z0-9-]{1,30}$/;
export type FrameVariant = string;

export const LIMITS = {
  submitIntervalSeconds: 60,
  maxSubmitsPerUser: 20,
  maxUploadBytes: 2 * 1024 * 1024,
  displayNameMaxLength: 40,
} as const;

export const paths = {
  config: 'config/app',
  stats: 'stats/public',
  user: (uid: string) => `users/${uid}`,
  photo: (photoId: string) => `photos/${photoId}`,
  moderator: (email: string) => `moderators/${email}`,
  photoObject: (photoId: string) => `photos/${photoId}/strip.jpg`,
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
