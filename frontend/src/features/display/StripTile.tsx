/**
 * pw-strip-tile at big-screen size — DESIGN-D18 / D03.
 *
 * A stored strip is already the composed 1080x3400 image, frame and all, so the
 * tile draws that image rather than rebuilding it from PhotoWallFrame: what the
 * wall shows is byte for byte what the guest downloaded.
 */
import type { CSSProperties, Ref } from 'react';
import { Icon } from '@/components/Icon';
import { useDisplayBackend, type Photo } from '@/lib/backend';
import { shownName } from './shownName';
import { useStripSrc } from './stripSrc';
import styles from './StripTile.module.css';

interface StripTileProps {
  photo: Photo;
  /** M02 "Hiện tên người gửi". Off still draws the pill, with "Tân sinh viên". */
  showNames: boolean;
  isNew: boolean;
  hidden?: boolean;
  leaving?: boolean;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

export function StripTile({
  photo,
  showNames,
  isNew,
  hidden = false,
  leaving = false,
  className,
  style,
  ref,
}: StripTileProps) {
  const src = useStripSrc(useDisplayBackend(), photo.id);

  return (
    <div
      ref={ref}
      className={[
        styles.tile,
        src ? null : styles.loading,
        hidden ? styles.hidden : null,
        leaving ? styles.leaving : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {src ? <img className={styles.strip} src={src} alt="" draggable={false} /> : null}
      <span className={styles.name}>
        <span>{shownName(photo, showNames)}</span>
      </span>
      {isNew ? (
        <span className={`u ${styles.newTag}`}>
          <Icon name="bolt" size={20} />
          MỚI
        </span>
      ) : null}
    </div>
  );
}
