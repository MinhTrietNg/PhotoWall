/**
 * The console's one-line feedback — 02b "Toast · Snackbar", on-dark tone:
 * ink ground, radius 16, shadow-1, hides itself after 4 s (role=status).
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import styles from './Toast.module.css';

const AUTO_HIDE_MS = 4_000;

export function useToast(): [ReactNode, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [message]);

  const show = useCallback((next: string) => setMessage(next), []);
  const node = message ? (
    <p className={styles.toast} role="status">
      {message}
    </p>
  ) : null;
  return [node, show];
}
