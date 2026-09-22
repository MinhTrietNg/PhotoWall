/**
 * pw-frame-option — DESIGN-D02 / D09.
 *
 * 184 x 73, pad 4 8 4 4, gap 8, radius 12. Thumbnail is an 18x57 PhotoWallFrame
 * in a 2px ink / radius 4 wrapper. Selected = blue border + 3px blue-100 halo +
 * a 20px check disc. The set behaves as a radiogroup over the enabled frames.
 */
import type { FrameTemplate } from '@/types/frame';
import { Icon } from '@/components/Icon';
import { PhotoWallFrame } from './PhotoWallFrame';
import styles from './FrameOption.module.css';

export function FrameOption({
  frame,
  selected,
  onSelect,
}: {
  frame: FrameTemplate;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`${styles.option} ${selected ? styles.selected : ''}`}
      onClick={() => onSelect(frame.id)}
    >
      <span className={styles.thumb}>
        <PhotoWallFrame frame={frame} width={18} />
      </span>

      <span className={styles.text}>
        <span className={`lbl ${styles.label}`}>{frame.label}</span>
        <span className={styles.title}>{frame.title}</span>
      </span>

      {selected ? (
        <span className={styles.check} aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
      ) : null}
    </button>
  );
}
