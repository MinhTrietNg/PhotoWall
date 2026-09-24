/**
 * pw-counter at big-screen size — DESIGN-D18 / D19 / D03.
 *
 * Up: the old number slides up and out while the new one slides in (400 ms
 * decel), the whole block pulses scale(1.02), and a yellow "+1" sits on the
 * corner for 1.5 s. Down (a strip taken down) has no drawn motion; it fades in
 * 150 ms, per Claude-Plan.md §14.2.
 */
import { useEffect, useRef, useState } from 'react';
import styles from './Counter.module.css';

const ROLL_MS = 400;
const BUMP_MS = 1500;

interface Roll {
  from: number;
  up: boolean;
  key: number;
}

const format = (n: number) => n.toLocaleString('vi-VN');

export function Counter({ value }: { value: number | null }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const seq = useRef(0);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [bump, setBump] = useState<{ delta: number; key: number } | null>(null);
  // Not an effect cleanup: a strip taken down 1 s after one landed must not
  // cancel the timer that hides the "+1", or the pill stays up for good.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const from = last.current;
    last.current = value;
    // The first reading is where the count already is, not a change.
    if (from === null || value === null || from === value) return;

    const later = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.current.delete(id);
        fn();
      }, ms);
      timers.current.add(id);
    };

    const key = ++seq.current;
    const up = value > from;
    setRoll({ from, up, key });
    later(ROLL_MS, () => setRoll((r) => (r?.key === key ? null : r)));

    if (up) {
      setBump({ delta: value - from, key });
      later(BUMP_MS, () => setBump((b) => (b?.key === key ? null : b)));
      cardRef.current?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }],
        { duration: ROLL_MS, easing: 'cubic-bezier(0, 0, 0, 1)' },
      );
    }
  }, [value]);

  return (
    <div ref={cardRef} className={styles.card}>
      <div className={`u ${styles.number}`}>
        {roll?.up ? (
          <span key={`out${roll.key}`} className={styles.out} aria-hidden="true">
            {format(roll.from)}
          </span>
        ) : null}
        <span key={roll?.key ?? 0} className={roll ? (roll.up ? styles.in : styles.fade) : undefined}>
          {value === null ? ' ' : format(value)}
        </span>
      </div>
      <span className={`u ${styles.caption}`}>KHOẢNH KHẮC</span>
      {bump ? (
        <span key={bump.key} className={`u ${styles.bump}`} aria-hidden="true">
          +{bump.delta}
        </span>
      ) : null}
    </div>
  );
}
