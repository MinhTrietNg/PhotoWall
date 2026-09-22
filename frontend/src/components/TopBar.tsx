/**
 * pw-topbar — DESIGN-D02.
 *
 * Fixed height 76 = padding-top 20 + control 48 + 8 breathing.
 * The right slot ALWAYS occupies 48px even when empty, so the title stays
 * optically centred. Claude-Plan.md §6 / §10.3.
 */
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButtonLink } from './IconButton';
import styles from './TopBar.module.css';

export function TopBar({
  title,
  backTo,
  right,
  tone = 'light',
}: {
  title: ReactNode;
  backTo?: string;
  right?: ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <header className={`${styles.bar} ${tone === 'dark' ? styles.dark : ''}`}>
      <div className={styles.slot}>
        {backTo ? (
          <IconButtonLink to={backTo} label="Quay lại" tone={tone === 'dark' ? 'dark' : 'light'}>
            <Icon name="arrowBack" />
          </IconButtonLink>
        ) : null}
      </div>

      <div className={`u ${styles.title}`}>{title}</div>

      {/* Always present, always 48 wide — this is what centres the title. */}
      <div className={styles.slot}>{right}</div>
    </header>
  );
}
