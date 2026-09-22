/**
 * The four-slot tray above the viewfinder — DESIGN-D06 / D03.
 *
 * Cells are 72x54, gap 12, radius 12. Three states:
 *   done    2px green-500 border + a check
 *   current 3px yellow border + a camera glyph
 *   todo    2px dashed ink-2 + the slot number
 */
import { useMemo } from 'react';
import { CameraAltGlyph, Icon } from '@/components/Icon';
import { useBlobUrls } from '@/lib/useBlobUrls';
import type { Shot } from '@/types/session';
import styles from './ShotTray.module.css';

export function ShotTray({
  shots,
  current,
}: {
  shots: readonly (Shot | null)[];
  /** 1-based slot being captured right now. */
  current: number;
}) {
  const blobs = useMemo(() => shots.map((s) => s?.blob ?? null), [shots]);
  const urls = useBlobUrls(blobs);

  return (
    <div className={styles.tray}>
      {shots.map((shot, i) => {
        const slot = i + 1;
        const state = shot ? 'done' : slot === current ? 'current' : 'todo';
        const url = urls[i];
        return (
          <div key={slot} className={`${styles.cell} ${styles[state]}`}>
            {shot && url ? (
              <>
                <img src={url} alt="" className={styles.thumb} />
                <span className={styles.check} aria-hidden="true">
                  <Icon name="check" size={16} />
                </span>
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
