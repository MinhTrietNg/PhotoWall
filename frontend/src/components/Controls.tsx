/**
 * pw-toggle · pw-checkbox · setting row — DESIGN-D02.
 *
 * Both controls wrap a real, visually-hidden <input> so they are focusable and
 * announced; the visible part is aria-hidden. Toggle 48x28 with a 20px knob;
 * checkbox 24 with radius 8 and a 16px check.
 */
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Controls.module.css';

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        type="checkbox"
        className={styles.srOnly}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden="true" className={`${styles.track} ${checked ? styles.trackOn : ''}`}>
        <span className={styles.knob} />
      </span>
    </>
  );
}

/**
 * Settings row: a whole-row <label>, so the entire card is the hit target.
 * pad 12/16, radius 16, 2px ink border.
 */
export function SettingRow({
  title,
  description,
  control,
  tone = 'surface',
}: {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  tone?: 'surface' | 'warning';
}) {
  return (
    <label className={`${styles.row} ${tone === 'warning' ? styles.rowWarning : ''}`}>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        {description ? <span className={styles.rowDesc}>{description}</span> : null}
      </span>
      {control}
    </label>
  );
}

/** Consent-style row: checkbox on the left, wrapping copy on the right. */
export function CheckRow({
  checked,
  onChange,
  label,
  children,
  tone = 'warning',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  children: ReactNode;
  tone?: 'surface' | 'warning';
}) {
  return (
    <label className={`${styles.checkRow} ${tone === 'warning' ? styles.rowWarning : ''}`}>
      <input
        type="checkbox"
        className={styles.srOnly}
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden="true" className={`${styles.box} ${checked ? styles.boxOn : ''}`}>
        {checked ? <Icon name="check" size={16} /> : null}
      </span>
      <span className={styles.checkText}>{children}</span>
    </label>
  );
}
