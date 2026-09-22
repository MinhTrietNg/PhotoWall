/**
 * pw-mod-table — DESIGN-D21. Grid `44 96 1fr 170 330 220`, surface-2 header,
 * 2px line dividers. Rows come pre-sorted from the caller (ModQueue).
 */
import { StateBlock } from '@/components/StateBlock';
import type { ModeratorApi, ModTab, Photo } from '@/lib/backend';
import { ModRow } from './ModRow';
import styles from './ModTable.module.css';

const EMPTY_COPY: Record<ModTab, { title: string; body: string }> = {
  pending: {
    title: 'Hết hàng chờ',
    body: 'Ảnh mới tự hiện lên đầu danh sách, không cần tải lại.',
  },
  approved: { title: 'Chưa có ảnh nào', body: 'Ảnh được duyệt sẽ hiện ở đây.' },
  removed: { title: 'Chưa gỡ ảnh nào', body: 'Ảnh bị gỡ hoặc không được duyệt sẽ hiện ở đây.' },
};

export function ModTable({
  tab,
  rows,
  now,
  backend,
  selected,
  cursor,
  busyIds,
  onToggleSelect,
  onApprove,
  onRequestRemove,
}: {
  tab: ModTab;
  rows: Photo[];
  now: number;
  backend: ModeratorApi;
  selected: ReadonlySet<string>;
  cursor: number;
  busyIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onRequestRemove: (id: string) => void;
}) {
  const selectable = tab !== 'removed';

  return (
    <div className={styles.table}>
      <div className={styles.head} role="row">
        <span aria-hidden="true" />
        <span className="lbl">Ảnh</span>
        <span className="lbl">Người gửi</span>
        <span className="lbl">Thời gian</span>
        <span className="lbl">Trạng thái</span>
        <span className="lbl">Hành động</span>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <StateBlock tone="empty" icon="checkCircle" {...EMPTY_COPY[tab]} />
        </div>
      ) : (
        rows.map((photo, i) => (
          <ModRow
            key={photo.id}
            photo={photo}
            tab={tab}
            now={now}
            backend={backend}
            selectable={selectable}
            selected={selected.has(photo.id)}
            isCursor={i === cursor}
            busy={busyIds.has(photo.id)}
            onToggleSelect={onToggleSelect}
            onApprove={onApprove}
            onRequestRemove={onRequestRemove}
          />
        ))
      )}
    </div>
  );
}
