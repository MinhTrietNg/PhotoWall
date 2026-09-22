/**
 * pw-state — DESIGN-D03. Empty / loading / error.
 *
 * Disc 64 in the matching tint with a 32px icon, H3 title, Body ink-2 copy.
 * Yellow = invitation, blue = waiting, red = error.
 * Always offers exactly one next action.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './StateBlock.module.css';

export type StateTone = 'empty' | 'loading' | 'error' | 'success';

const DEFAULT_ICON: Record<StateTone, IconName> = {
  empty: 'photoCamera',
  loading: 'hourglass',
  error: 'errorCircle',
  success: 'checkCircle',
};

export function StateBlock({
  tone,
  title,
  body,
  icon,
  action,
}: {
  tone: StateTone;
  title: string;
  body?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className={styles.block}>
      <span className={`${styles.disc} ${styles[tone]}`}>
        <Icon name={icon ?? DEFAULT_ICON[tone]} size={32} />
      </span>
      <h2 className={`u ${styles.title}`}>{title}</h2>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
