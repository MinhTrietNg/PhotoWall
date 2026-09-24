/**
 * Which "Vừa lên Wall!" card plays next. DESIGN-D19 / D32, Claude-Plan.md §6.
 *
 * Each card holds the screen for 6.3 s (700 rise + 5000 hold + 600 fly), so a
 * moderator approving ten strips in a row would otherwise queue a minute of
 * cards. The rule — marked "Trong spec" on DESIGN-D32, never drawn — is at most
 * three cards waiting; anything beyond merges into one "+N dải ảnh mới" card
 * that plays after them.
 */
import type { Photo } from '@/lib/backend';

export const MAX_QUEUED_CARDS = 3;

export type ArrivalItem =
  | { kind: 'photo'; photo: Photo }
  | { kind: 'merged'; photos: Photo[] };

export class ArrivalQueue {
  private cards: Photo[] = [];
  private overflow: Photo[] = [];

  /** `playing` is what is on screen now: a single card counts towards the three. */
  push(photos: readonly Photo[], playing: ArrivalItem | null) {
    for (const photo of photos) {
      const held = this.cards.length + (playing?.kind === 'photo' ? 1 : 0);
      if (held < MAX_QUEUED_CARDS && this.overflow.length === 0) this.cards.push(photo);
      else this.overflow.push(photo);
    }
  }

  next(): ArrivalItem | null {
    const photo = this.cards.shift();
    if (photo) return { kind: 'photo', photo };
    if (this.overflow.length === 0) return null;
    const photos = this.overflow;
    this.overflow = [];
    // One strip left over is just another card, not a "+1 dải ảnh mới".
    return photos.length === 1 ? { kind: 'photo', photo: photos[0] } : { kind: 'merged', photos };
  }

  /** A strip taken down before its card played never gets one. */
  forget(photoId: string) {
    this.cards = this.cards.filter((p) => p.id !== photoId);
    this.overflow = this.overflow.filter((p) => p.id !== photoId);
  }

  get pendingIds(): string[] {
    return [...this.cards, ...this.overflow].map((p) => p.id);
  }
}

export function itemPhotos(item: ArrivalItem): Photo[] {
  return item.kind === 'photo' ? [item.photo] : item.photos;
}
