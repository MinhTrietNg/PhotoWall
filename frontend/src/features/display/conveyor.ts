/**
 * The marquee's model. DESIGN-D18 / D19, Claude-Plan.md §6 "Marquee
 * implementation contract".
 *
 * The design's own prototype renders the track twice and animates it to -50%.
 * That loops seamlessly for a list that never changes, but this list does: a
 * strip landing at the head, or one being taken down, changes the width of the
 * track and with it what -50% means, so the whole wall would jump — the one
 * thing the contract forbids ("the track must not re-layout or jump").
 *
 * So this is a conveyor. Tiles sit in numbered slots on an endless tape that
 * moves left at a constant speed. A tile that has left the viewport is
 * recycled, and the next photo of the playlist is laid in the first empty slot
 * beyond the right edge — the same seamless loop, with the list read one tile
 * at a time instead of all at once. Tiles never move except with the tape, or
 * by an eased shift of whole slots when a strip lands or leaves, which reads as
 * the row making room rather than as a jump.
 *
 * Pure: no DOM, no React, no clock of its own. The component drives it.
 */
import type { Photo } from '@/lib/backend';

/** PhotoWallFrame 230 x 724 inside a 3px border. */
export const TILE_W = 236;
export const TILE_H = 730;
const GAP = 24;
export const SLOT = TILE_W + GAP;
/** `.pw-track { padding: 0 12px }`. */
const PAD = 12;
/** The artboard's 1236-wide viewport, inside its own 3px border. */
const ARTBOARD_VIEW_W = 1230;

/** Matches the arrival fly, so the room opens as the strip lands. */
export const SHIFT_MS = 600;
/** Claude-Plan.md §14.2: a removed tile fades 150 ms. */
export const LEAVE_MS = 150;
/** DESIGN-D03: the MỚI tag stays 6 s. */
export const NEW_TAG_MS = 6000;

export interface Tile {
  key: string;
  photo: Photo;
  slot: number;
  /** Laid down for a strip still flying in from the arrival card. */
  hidden: boolean;
  /** When the MỚI tag appeared; null = no tag. */
  newSince: number | null;
  /** Earned a MỚI tag but is not on screen yet — the 6 s start when it is. */
  newPending: boolean;
  leavingSince: number | null;
  /** px offset from the slot at `shiftAt`, easing to 0 over SHIFT_MS. */
  shiftFrom: number;
  shiftAt: number;
}

const decel = (p: number) => 1 - (1 - p) ** 3;

export class Conveyor {
  tiles: Tile[] = [];
  /** Tape px under the viewport's left edge. */
  private offset = 0;
  private nextSlot = 0;
  private seq = 0;
  /**
   * Inner width of the marquee viewport. 1230 on a 16:9 screen; wider when
   * the window is, since the stage then widens the marquee rather than
   * letterboxing. Only ever read, so a resize takes effect on the next step.
   */
  viewW = ARTBOARD_VIEW_W;

  constructor(private readonly nextPhoto: () => Photo | null) {}

  /** How many whole tiles fit side by side — one slideshow page. */
  get perView(): number {
    return Math.max(1, Math.floor((this.viewW - 2 * PAD + GAP) / SLOT));
  }

  /** The tile's left edge in viewport px, `ahead` px of tape from now. */
  x(tile: Tile, now: number, ahead = 0): number {
    return PAD + tile.slot * SLOT - this.offset - ahead + this.shiftAt(tile, now);
  }

  /**
   * Moves the tape `dx` px and brings the tiles up to date. True when the set
   * of tiles or a tag changed, i.e. when the component has to re-render.
   */
  step(now: number, dx: number): boolean {
    this.offset += dx;
    let changed = false;

    for (const tile of this.tiles.filter((t) => t.leavingSince !== null)) {
      if (now - (tile.leavingSince ?? now) >= LEAVE_MS) {
        this.cut(tile, now);
        changed = true;
      }
    }

    const kept = this.tiles.filter((t) => this.x(t, now) + TILE_W > 0);
    if (kept.length !== this.tiles.length) {
      this.tiles = kept;
      changed = true;
    }

    // Starting from nothing — first load, or a wall that had emptied — fills
    // the whole viewport at once rather than waiting for tiles to scroll in.
    if (this.tiles.length === 0) this.nextSlot = Math.max(this.nextSlot, this.firstVisibleSlot());
    while (PAD + this.nextSlot * SLOT - this.offset < this.viewW + SLOT) {
      const photo = this.nextPhoto();
      if (!photo) break;
      this.tiles.push(this.make(photo, this.nextSlot++, now));
      changed = true;
    }

    for (const tile of this.tiles) {
      if (tile.newPending && !tile.hidden && this.x(tile, now) < this.viewW) {
        tile.newPending = false;
        tile.newSince = now;
        changed = true;
      } else if (tile.newSince !== null && now - tile.newSince >= NEW_TAG_MS) {
        tile.newSince = null;
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Makes room at the head for strips about to land: the rightmost slot that
   * will be wholly on screen once the tape has moved `ahead` px, and everything
   * from it rightwards slides over one slot per strip. The new tiles are laid
   * down hidden; `reveal` shows them once the flying strip is on top of them.
   */
  insert(photos: readonly Photo[], now: number, ahead: number): Tile[] {
    let k = Math.floor((this.offset + ahead + this.viewW - PAD - TILE_W) / SLOT);
    if (this.tiles.length === 0) this.nextSlot = k;
    k = Math.min(k, this.nextSlot);

    const n = photos.length;
    for (const tile of this.tiles) {
      if (tile.slot < k) continue;
      tile.shiftFrom = this.shiftAt(tile, now) - n * SLOT;
      tile.shiftAt = now;
      tile.slot += n;
    }
    this.nextSlot += n;

    const added = photos.map((photo, i) => ({
      ...this.make(photo, k + i, now),
      hidden: true,
      newPending: true,
    }));
    this.tiles = [...this.tiles, ...added].sort((a, b) => a.slot - b.slot);
    return added;
  }

  reveal(keys: readonly string[]) {
    for (const tile of this.tiles) if (keys.includes(tile.key)) tile.hidden = false;
  }

  /** Fades out every tile showing this photo; `step` closes the gap after. */
  drop(photoId: string, now: number): boolean {
    let hit = false;
    for (const tile of this.tiles) {
      if (tile.photo.id === photoId && tile.leavingSince === null) {
        tile.leavingSince = now;
        hit = true;
      }
    }
    return hit;
  }

  private cut(gone: Tile, now: number) {
    this.tiles = this.tiles.filter((t) => t !== gone);
    for (const tile of this.tiles) {
      if (tile.slot <= gone.slot) continue;
      tile.shiftFrom = this.shiftAt(tile, now) + SLOT;
      tile.shiftAt = now;
      tile.slot -= 1;
    }
    this.nextSlot -= 1;
  }

  private shiftAt(tile: Tile, now: number): number {
    if (tile.shiftFrom === 0) return 0;
    const p = Math.min(1, (now - tile.shiftAt) / SHIFT_MS);
    if (p >= 1) tile.shiftFrom = 0;
    return tile.shiftFrom * (1 - decel(p));
  }

  /** The leftmost slot whose tile would still show at least a sliver. */
  private firstVisibleSlot(): number {
    return Math.floor((this.offset - PAD - TILE_W) / SLOT) + 1;
  }

  private make(photo: Photo, slot: number, now: number): Tile {
    return {
      key: `t${this.seq++}`,
      photo,
      slot,
      hidden: false,
      newSince: null,
      newPending: false,
      leavingSince: null,
      shiftFrom: 0,
      shiftAt: now,
    };
  }
}

/**
 * The order the conveyor lays photos in: the approved list, newest first, round
 * and round. A strip whose arrival card is still on screen is skipped, so it
 * cannot scroll in on its own before it has landed.
 */
export class Playlist {
  private photos: Photo[] = [];
  private cursor = 0;
  private nextId: string | null = null;
  readonly inFlight = new Set<string>();

  set(photos: Photo[]) {
    this.photos = photos;
    // Carry on from the same photo if it is still there, not from the same index.
    const at = this.nextId ? photos.findIndex((p) => p.id === this.nextId) : -1;
    if (at >= 0) this.cursor = at;
  }

  get size(): number {
    return this.photos.length;
  }

  next(): Photo | null {
    const n = this.photos.length;
    for (let tries = 0; tries < n; tries++) {
      const photo = this.photos[(this.cursor + tries) % n];
      if (this.inFlight.has(photo.id)) continue;
      this.cursor = (this.cursor + tries + 1) % n;
      this.nextId = this.photos[this.cursor].id;
      return photo;
    }
    return null;
  }
}
