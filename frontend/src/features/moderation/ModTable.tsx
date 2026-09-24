/**
 * pw-mod-table — DESIGN-D21. One card that fills the page below the toolbar:
 * a surface-2 column header (with the select-all box), the helper line, the
 * rows, and — while anything is selected — the ink bulk bar along its bottom.
 * Rows come pre-sorted and pre-filtered from the caller (ModQueue).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ModeratorAccount, ModeratorApi, ModTab, Photo } from '@/lib/backend';
import type { FrameTemplate } from '@/types/frame';
import { ConsoleIcon } from './ConsoleIcon';
import { ModRow } from './ModRow';
import styles from './ModTable.module.css';

export function ModTable({
  tab,
  rows,
  loaded,
  endNote,
  helper,
  footer,
  now,
  backend,
  frames,
  moderators,
  retentionHours,
  selected,
  cursor,
  busyIds,
  onToggleAll,
  onToggleSelect,
  onApprove,
  onRequestRemove,
  onRestore,
  onPreview,
}: {
  tab: ModTab;
  rows: Photo[];
  /** False until the tab's first snapshot arrives. */
  loaded: boolean;
  /** The line under the last row, e.g. "Hết hàng chờ · ảnh mới tự hiện lên đầu…". */
  endNote: string;
  helper: ReactNode;
  footer?: ReactNode;
  now: number;
  backend: ModeratorApi;
  frames: readonly FrameTemplate[];
  moderators: readonly ModeratorAccount[];
  retentionHours: number;
  selected: ReadonlySet<string>;
  cursor: number;
  busyIds: ReadonlySet<string>;
  onToggleAll: () => void;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onRequestRemove: (id: string) => void;
  onRestore: (id: string) => void;
  onPreview: (photo: Photo, url: string | null) => void;
}) {
  // Restoring is one strip at a time, so the removed tab has nothing to select.
  const selectable = tab !== 'removed';
  const count = rows.filter((p) => selected.has(p.id)).length;
  const allRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = count > 0 && count < rows.length;
  }, [count, rows.length]);

  return (
    <section className={styles.table} aria-label="Danh sách dải ảnh">
      <div className={styles.head}>
        <div className={styles.checkCell}>
          {selectable && rows.length > 0 ? (
            <input
              ref={allRef}
              type="checkbox"
              className={styles.checkbox}
              checked={count > 0 && count === rows.length}
              onChange={onToggleAll}
              aria-label="Chọn tất cả dải ảnh trong tab này"
            />
          ) : null}
        </div>
        <span className="lbl">Ảnh</span>
        <span className="lbl">Người gửi</span>
        <span className="lbl">Thời gian</span>
        <span className="lbl">Trạng thái · lý do</span>
        <span className={`lbl ${styles.headActions}`}>Hành động</span>
      </div>

      <p className={styles.helper}>
        <ConsoleIcon name="info" size={16} className={styles.helperIcon} />
        <span>{helper}</span>
      </p>

      <div className={styles.body}>
        {rows.map((photo, i) => (
          <ModRow
            key={photo.id}
            photo={photo}
            tab={tab}
            now={now}
            backend={backend}
            frame={frames.find((f) => f.id === photo.frameVariant)}
            moderators={moderators}
            retentionHours={retentionHours}
            selectable={selectable}
            selected={selected.has(photo.id)}
            isCursor={i === cursor}
            busy={busyIds.has(photo.id)}
            onToggleSelect={onToggleSelect}
            onApprove={onApprove}
            onRequestRemove={onRequestRemove}
            onRestore={onRestore}
            onPreview={onPreview}
          />
        ))}
        <p className={styles.end} role="status">
          <ConsoleIcon name={loaded ? 'sync' : 'hourglassTop'} size={16} />
          {loaded ? endNote : 'Đang tải danh sách…'}
        </p>
      </div>

      {footer}
    </section>
  );
}
