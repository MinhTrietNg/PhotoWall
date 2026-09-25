/**
 * The row's zoom button (M01): the strip at reading size, so a moderator can
 * check faces before pressing Duyệt. Same overlay contract as pw-dialog —
 * scrim, Esc or scrim closes, focus moves in and returns to the opener.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { useModeratorBackend, type Photo } from '@/lib/backend';
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
  /** The row's thumb, shown until the full strip arrives. */
  url: string | null;
  frame: FrameTemplate | undefined;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const backend = useModeratorBackend();
  // Faces are checked here, so this loads the full strip, not the row's thumb.
  const [full, setFull] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    backend.photoUrl(photo.id).then(
      (u) => alive && setFull(u),
      () => undefined, // not uploaded (demo rows) or already purged
    );
    return () => {
      alive = false;
    };
  }, [backend, photo.id]);
  const src = full ?? url;

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
          {src ? (
            <img src={src} alt={`Dải ảnh của ${photo.displayName}`} className={styles.img} />
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
