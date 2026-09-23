/**
 * The shot being reviewed on S04, handed from /camera/:n to /camera/:n/review.
 *
 * Deliberately a module singleton rather than router state: a Blob in
 * history.state survives navigation but not a reload, and a stale one would be
 * confusing. If it is missing, S04 simply sends the guest back to the camera.
 */
interface PendingShot {
  slot: number;
  blob: Blob;
  width: number;
  height: number;
  source: 'camera' | 'gallery';
}

let pending: PendingShot | null = null;

export function setPendingShot(shot: PendingShot) {
  pending = shot;
}

export function takePendingShot(slot: number): PendingShot | null {
  return pending?.slot === slot ? pending : null;
}

export function clearPendingShot() {
  pending = null;
}
