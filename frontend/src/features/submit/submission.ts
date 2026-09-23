/**
 * The strip that was just composed and sent.
 *
 * Kept in memory on purpose: the design says to download from the blob already
 * in hand rather than re-fetching from the server, and the E02 retry path needs
 * the same blob to call resumeSubmission with. Claude-Plan.md §14.1.
 */
interface Submission {
  blob: Blob;
  /** Set once the photo doc exists; undefined while composing. */
  photoId?: string;
  frameId: string;
  displayName: string;
}

let current: Submission | null = null;

export function setSubmission(next: Submission | null) {
  current = next;
}

export function getSubmission(): Submission | null {
  return current;
}

export function attachPhotoId(photoId: string) {
  if (current) current.photoId = photoId;
}
