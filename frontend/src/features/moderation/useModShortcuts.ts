/**
 * A / R / ↑↓ — DESIGN-D21 helper line. `A` approves the row under the cursor
 * the same way the "Duyệt" button does (no confirm); `R` opens the same
 * destructive dialog the "Gỡ" button opens, so keyboard and mouse never diverge.
 */
import { useEffect } from 'react';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** A row's checkbox keeps focus after a click; the letters must still work there. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button']);

function isTyping(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return TYPING_TAGS.has(el.tagName) || el.isContentEditable;
}

export function useModShortcuts({
  rowIds,
  cursor,
  setCursor,
  onApprove,
  onRemove,
  enabled = true,
}: {
  rowIds: readonly string[];
  cursor: number;
  setCursor: (next: number) => void;
  /** Omit on tabs with no approve action (e.g. "Đã duyệt"). */
  onApprove?: (id: string) => void;
  /** Omit on tabs with nothing to remove ("Đã gỡ"). */
  onRemove?: (id: string) => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled || rowIds.length === 0) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && isTyping(target)) return;
      // Ctrl/⌘+R is the browser's reload, not "gỡ".
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const id = rowIds[cursor];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor(Math.min(cursor + 1, rowIds.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor(Math.max(cursor - 1, 0));
      } else if ((e.key === 'a' || e.key === 'A') && onApprove && id) {
        onApprove(id);
      } else if ((e.key === 'r' || e.key === 'R') && onRemove && id) {
        onRemove(id);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [rowIds, cursor, setCursor, onApprove, onRemove, enabled]);
}
