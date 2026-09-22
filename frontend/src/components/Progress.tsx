/**
 * pw-progress — DESIGN-D03.
 *
 * Determinate: bar h16, radius full, 2px ink border, blue-700 fill, with the
 * Body-S 700 labels UNDER the bar (what on the left, % on the right).
 * Indeterminate (no bytesTransferred): four 16px blocks running in sequence,
 * stagger 120ms.
 */
import styles from './Progress.module.css';

export function Progress({
  value,
  label,
}: {
  /** 0..1, or null for the indeterminate variant. */
  value: number | null;
  label: string;
}) {
  if (value === null) {
    return (
      <div className={styles.wrap}>
        <div className={styles.blocks} role="progressbar" aria-label={label}>
          <span className={styles.block} style={{ background: 'var(--pw-blue-500)' }} />
          <span className={styles.block} style={{ background: 'var(--pw-red-500)' }} />
          <span className={styles.block} style={{ background: 'var(--pw-yellow-500)' }} />
          <span className={styles.block} style={{ background: 'var(--pw-green-500)' }} />
        </div>
        <div className={styles.labels}>
          <span className={styles.what}>{label}</span>
        </div>
      </div>
    );
  }

  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={styles.wrap}>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.labels}>
        <span className={styles.what}>{label}</span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}
