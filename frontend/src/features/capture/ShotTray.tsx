/**
 * The four-slot tray above the viewfinder — DESIGN-D06 / D07 / D08.
 *
 * Cells are 72x54, gap 12, radius 12. Four states taken from the artboards,
 * plus one for retaking a slot that already has a shot:
 *   done      2px green-500 border + a filled green check badge
 *   current   3px yellow border + a camera glyph  (S03)
 *   retake    3px yellow border and ring + the old shot + a yellow camera badge  (S03)
 *   reviewing 3px blue-500 border + the shot itself, no badge  (S04)
 *   todo      2px dashed ink-2 + the slot number
 */
import { useMemo } from 'react';
import { CameraAltGlyph, Icon } from '@/components/Icon';
import { useBlobUrls } from '@/lib/useBlobUrls';
import type { Shot } from '@/types/session';
import styles from './ShotTray.module.css';

export function ShotTray({
  shots,
  current,
  preview,
}: {
  shots: readonly (Shot | null)[];
  /** 1-based slot being captured right now. */
  current: number;
  /**
   * S04 only: the shot under review. It is not in `shots` yet — accepting it is
   * what puts it there — but the tray still has to show it, or the guest cannot
   * tell the difference between "reviewing slot 3" and "slot 3 still empty".
   */
  preview?: Blob | null;
}) {
  const blobs = useMemo(
    () => shots.map((s, i) => (i === current - 1 && preview ? preview : (s?.blob ?? null))),
    [shots, current, preview],
  );
  const urls = useBlobUrls(blobs);

  return (
    <div className={styles.tray}>
      {shots.map((shot, i) => {
        const slot = i + 1;
        const isCurrent = slot === current;
        // Back on a filled slot from S05: it is the one being shot, but it is
        // not empty, so neither `current` nor a plain `done` would say which.
        const state = isCurrent
          ? preview
            ? 'reviewing'
            : shot
              ? 'retake'
              : 'current'
          : shot
            ? 'done'
            : 'todo';
        const url = urls[i];
        return (
          <div key={slot} className={`${styles.cell} ${styles[state]}`}>
            {url ? (
              <>
                <img src={url} alt="" className={styles.thumb} />
                {state === 'done' ? (
                  <span className={styles.check} aria-hidden="true">
                    <Icon name="check" size={16} />
                  </span>
                ) : state === 'retake' ? (
                  <span className={styles.check} aria-hidden="true">
                    <CameraAltGlyph size={12} />
                  </span>
                ) : null}
              </>
            ) : state === 'current' ? (
              <CameraAltGlyph size={24} />
            ) : (
              <span className={`u ${styles.number}`}>{slot}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
