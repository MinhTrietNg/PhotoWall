/**
 * PhotoWallFrame — the core component. DESIGN-D02 / D23 / D24.
 *
 * One box, four photo slots below, one PNG overlay above. Rendered at every size
 * the product needs: 18 (option thumb), 40-44 (hints, mod rows), 84-90 (done),
 * 150 (frame select), 168 (review), 186 (my strip), 230 (big screen), 1080 (export).
 *
 * Invariants it must never break (Claude-Plan.md §33):
 *   I1  the box is always 1080 : 3400
 *   I2  exactly four slots
 *   I3  overlay above photos, always
 *   I4  slot geometry comes only from frames.json, never hardcoded
 *
 * Slot percentages are DERIVED from the pixel rects so the DOM preview and the
 * canvas export can never drift apart.
 */
import { useMemo, type CSSProperties } from 'react';
import { useBlobUrls, type BlobLike } from '@/lib/useBlobUrls';
import { useMeasuredWidth } from '@/lib/useMeasuredWidth';
import { STRIP_ASPECT, slotRadiusAt, slotToPercent, type FrameTemplate } from '@/types/frame';
import { overlayUrl } from './frameRegistry';
import styles from './PhotoWallFrame.module.css';

type SlotPhoto = BlobLike;

interface PhotoWallFrameProps {
  frame: FrameTemplate;
  /** Up to four entries: a Blob, an already-resolved URL, or null for empty. */
  photos?: readonly SlotPhoto[];
  /**
   * Rendered width in px, or 'fit' to take the height of the parent and let
   * the ratio decide the width. 'fit' is what keeps the strip screens off a
   * hand-maintained height budget: the flex column hands the strip whatever is
   * left, and the strip never pushes the screen into a scroll.
   */
  width: number | 'fit';
  /** Empty slots show their number — the "empty" state on DESIGN-D02. */
  showSlotNumbers?: boolean;
  className?: string;
}

export function PhotoWallFrame({
  frame,
  photos,
  width,
  showSlotNumbers = false,
  className,
}: PhotoWallFrameProps) {
  // Always four entries, so an undefined `photos` still renders four empty slots.
  const slots = useMemo(
    () => Array.from({ length: 4 }, (_, i) => photos?.[i] ?? null),
    [photos],
  );
  const urls = useBlobUrls(slots);

  // Under 'fit' the width is only known after layout, so it is measured rather
  // than passed. The fixed case seeds it so the first paint already has the
  // right corner radius instead of a frame of square corners.
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>();
  const rendered = typeof width === 'number' ? width : measured;

  const radius = slotRadiusAt(frame.r, rendered);
  // The design draws the empty-slot number at 10px on a 40px-wide strip.
  const numberSize = Math.min(32, Math.max(6, Math.round(rendered * 0.25)));

  const box: CSSProperties =
    typeof width === 'number'
      ? { width, aspectRatio: STRIP_ASPECT }
      : { height: '100%', width: 'auto', maxWidth: '100%', aspectRatio: STRIP_ASPECT };

  return (
    <div
      ref={ref}
      className={[styles.frame, className].filter(Boolean).join(' ')}
      style={{ ...box, '--pw-slot-number-size': `${numberSize}px` } as CSSProperties}
      data-variant={frame.id}
    >
      {frame.slots.map((slot, i) => {
        const url = urls[i];
        return (
          <div
            key={i}
            className={styles.slot}
            data-name={`PhotoSlot0${i + 1}`}
            style={{ ...slotToPercent(slot), borderRadius: radius }}
          >
            {url ? (
              <img className={styles.photo} src={url} alt="" aria-hidden="true" />
            ) : showSlotNumbers ? (
              <span className={`u ${styles.number}`}>{i + 1}</span>
            ) : null}
          </div>
        );
      })}

      {/*
        The overlay is the top layer, so stickers, logos, borders and text can
        never be covered by a guest photo (invariant I3). The -1px/+2px bleed
        hides a sub-pixel seam at fractional scales — keep it.
      */}
      <img
        className={styles.overlay}
        data-name="FrameOverlay"
        src={overlayUrl(frame)}
        alt={frame.title}
        draggable={false}
      />
    </div>
  );
}
