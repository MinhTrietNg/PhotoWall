/**
 * pw-steps — DESIGN-D02. Display only, never interactive.
 * done = green-700 + check · current = ink · todo = white / ink-2 / line border.
 */
import { Icon } from './Icon';
import styles from './Steps.module.css';

export const GUEST_STEPS = ['1 · Tên', '2 · Chụp', '3 · Gửi'] as const;

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className={styles.row}>
      {GUEST_STEPS.map((label, i) => {
        const index = i + 1;
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <div key={label} className={`${styles.chip} ${styles[state]}`}>
            {state === 'done' ? <Icon name="check" size={16} /> : null}
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
