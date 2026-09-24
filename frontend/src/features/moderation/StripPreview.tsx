/**
 * The row's zoom button (M01): the strip at reading size, so a moderator can
 * check faces before pressing Duyệt. Same overlay contract as pw-dialog —
 * scrim, Esc or scrim closes, focus moves in and returns to the opener.
 */
import { useEffect, useId, useRef } from 'react';
import { IconButton } from '@/components/IconButton';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import type { Photo } from '@/lib/backend';
import type { FrameTemplate } from '@/types/frame';
import { ConsoleIcon } from './ConsoleIcon';
import { rowMeta } from './format';
import styles from './StripPreview.module.css';

export function StripPreview({
  photo,
  url,
  frame,
  onClose,
}: {
  photo: Photo;
  url: string | null;
  frame: FrameTemplate | undefined;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Tab') {
        // One focusable control: Tab stays on it, Esc closes.
        e.preventDefault();
        if (e.key === 'Escape') onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.strip}>
          {url ? (
            <img src={url} alt={`Dải ảnh của ${photo.displayName}`} className={styles.img} />
          ) : frame ? (
            <PhotoWallFrame frame={frame} width="fit" />
          ) : null}
        </div>
        <div className={styles.caption}>
          <div>
            <h2 id={titleId} className={styles.name}>
              {photo.displayName}
            </h2>
            <p className={styles.meta}>{rowMeta(photo)}</p>
          </div>
          <IconButton size="s" label="Đóng" onClick={onClose}>
            <ConsoleIcon name="close" size={20} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
