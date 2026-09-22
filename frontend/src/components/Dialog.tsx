/**
 * pw-dialog — DESIGN-D03.
 *
 * 342 wide, pad 24, radius 20, shadow-2, ink-55% scrim, 200ms scale .96 -> 1.
 * Esc and scrim click cancel. Focus is trapped and returned to the opener.
 * Cancel sits left, the destructive action right.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import styles from './Dialog.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  body,
  icon = 'warning',
  tone = 'destructive',
  confirmLabel,
  cancelLabel = 'Huỷ',
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  icon?: IconName;
  tone?: 'destructive' | 'default';
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Hand focus back to whatever opened the dialog.
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className={styles.scrim} onClick={onCancel}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`${styles.disc} ${tone === 'destructive' ? styles.discDanger : ''}`}>
          <Icon name={icon} size={24} />
        </span>

        <h2 id={titleId} className={`u ${styles.title}`}>
          {title}
        </h2>

        {body ? <p className={styles.body}>{body}</p> : null}
        {children}

        <div className={styles.actions}>
          <Button variant="secondary" size="m" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            size="m"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
