/**
 * Shown while the backend module resolves.
 *
 * With VITE_BACKEND=firebase that is a ~580 kB chunk, which on venue wifi is
 * long enough that a blank screen would read as "broken". Uses no tokens beyond
 * the ones already in tokens.css so it can render before anything else is ready.
 */
import styles from './Splash.module.css';

export function Splash() {
  return (
    <div className={styles.splash} role="status" aria-label="Đang tải Photo Wall">
      <h1 className={`u ${styles.hero}`}>
        PHOTO
        <br />
        <span className={styles.wall}>WALL</span>
      </h1>
      <div className={styles.dots} aria-hidden="true">
        <span style={{ background: 'var(--pw-blue-500)' }} />
        <span style={{ background: 'var(--pw-red-500)' }} />
        <span style={{ background: 'var(--pw-yellow-500)' }} />
        <span style={{ background: 'var(--pw-green-500)' }} />
      </div>
    </div>
  );
}
