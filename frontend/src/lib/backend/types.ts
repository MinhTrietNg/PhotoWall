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
}

export interface AppConfig {
  uploadsOpen: boolean;
  eventName: string;
}

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
}

export type Unsubscribe = () => void;

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
   * S09 "Gỡ dải ảnh của tôi". Final: off the big screen and deleted, not restorable.
   * Only while the photo is pending or approved.
   */
  removeMyPhoto(photoId: string): Promise<void>;
}
