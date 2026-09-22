/**
 * The partner text strip on S01 and E03 — DESIGN-D04 / D17.
 *
 * NOTE the order here is the TEXT order from the artboards, which is NOT the
 * same as the logo order used on the big screen footer and inside frame F03
 * (Đoàn · SGU · HSV · ISF × GDGoC × AWS). Both are confirmed design decisions;
 * they are not interchangeable. Claude-Plan.md §8.1, invariant I6.
 */
import styles from './PartnerLine.module.css';

const PARTS = ['GDGoC', 'Đoàn hội Khoa CNTT', 'AWS Student Club'] as const;

export function PartnerLine() {
  return (
    <p className={styles.line}>
      {PARTS.map((part, i) => (
        <span key={part}>
          {i > 0 ? <span className={styles.sep}>×</span> : null}
          {part}
        </span>
      ))}
    </p>
  );
}
