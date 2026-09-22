/**
 * A / R / ↑↓ — DESIGN-D21 helper line. `A` approves the row under the cursor
 * the same way the "Duyệt" button does (no confirm); `R` opens the same
 * destructive dialog the "Gỡ" button opens, so keyboard and mouse never diverge.
 */
import { useEffect } from 'react';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

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
  onRemove: (id: string) => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled || rowIds.length === 0) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && TYPING_TAGS.has(target.tagName)) return;

      const id = rowIds[cursor];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor(Math.min(cursor + 1, rowIds.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor(Math.max(cursor - 1, 0));
      } else if ((e.key === 'a' || e.key === 'A') && onApprove && id) {
        onApprove(id);
      } else if ((e.key === 'r' || e.key === 'R') && id) {
        onRemove(id);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [rowIds, cursor, setCursor, onApprove, onRemove, enabled]);
}
