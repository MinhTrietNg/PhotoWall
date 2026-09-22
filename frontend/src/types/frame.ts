/** Frame system types. See Claude/Claude-Plan.md §13.1 and §19. */

/** Pixel rectangle on the canonical 1080 x 3400 canvas: [x, y, w, h]. */
export type SlotRect = readonly [x: number, y: number, w: number, h: number];

/** The three ids come from the design; `string & {}` keeps F04+ open. */
export type FrameId = 'f01-gdgoc' | 'f02-aws' | 'f03-partners' | (string & {});

export interface FrameTemplate {
  id: FrameId;
  /** Internal design name, e.g. "Frame / F01 GDGoC". */
  name: string;
  /** Short label above the title on a frame card, e.g. "Khung 01". */
  label: string;
  /** Title shown to the guest, e.g. "GDGoC · Build Together". */
  title: string;
  /** File name under /frames/ — true-alpha PNG, exactly 1080 x 3400. */
  overlay: string;
  /** Exactly four slots, top to bottom. */
  slots: readonly [SlotRect, SlotRect, SlotRect, SlotRect];
  /** Corner radius in canvas px at 1080 wide (36 for every current frame). */
  r: number;
  /** Admin can hide a frame; hidden frames are not rendered at all. */
  enabled?: boolean;
}

export interface FrameRegistry {
  /** Always [1080, 3400]. */
  canvas: readonly [number, number];
  frames: FrameTemplate[];
}

/** The canonical canvas. Invariant I1 — never change these. */
export const CANVAS_W = 1080;
export const CANVAS_H = 3400;

/** Every strip rendering everywhere uses this ratio (1 : 3.148). */
export const STRIP_ASPECT = `${CANVAS_W} / ${CANVAS_H}`;

/** A slot rect expressed as CSS percentages of the canvas. */
export interface SlotPercent {
  left: string;
  top: string;
  width: string;
  height: string;
}

export function slotToPercent([x, y, w, h]: SlotRect): SlotPercent {
  return {
    left: `${(x / CANVAS_W) * 100}%`,
    top: `${(y / CANVAS_H) * 100}%`,
    width: `${(w / CANVAS_W) * 100}%`,
    height: `${(h / CANVAS_H) * 100}%`,
  };
}

/** Slot corner radius scaled to a rendered width. r is authored at 1080. */
export function slotRadiusAt(r: number, renderedWidth: number): number {
  return (r * renderedWidth) / CANVAS_W;
}
