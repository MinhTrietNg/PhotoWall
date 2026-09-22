/**
 * pw-mod-row — DESIGN-D21. One photo: thumb, sender, time (+ waiting, red past
 * 3 min on the pending tab), status, and the S-size actions for its tab.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import type { ModeratorApi, ModTab, Photo } from '@/lib/backend';
import { formatClock, formatWaiting, frameShortLabel, WAITING_OVERDUE_MS } from './format';
import styles from './ModTable.module.css';

function useThumb(backend: ModeratorApi, photoId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    backend.photoUrl(photoId).then(
      (u) => alive && setUrl(u),
      () => undefined, // demo rows with no uploaded blob — show the fallback tile
    );
    return () => {
      alive = false;
    };
  }, [backend, photoId]);
  return url;
}

function StatusPill({ photo }: { photo: Photo }) {
  if (photo.status === 'pending') {
    return <span className={`pill ${styles.pillPending}`}>Chờ duyệt</span>;
  }
  if (photo.status === 'approved') {
    return <span className={`pill ${styles.pillApproved}`}>Đang hiển thị</span>;
  }
  // rejected vs removed is internal bookkeeping only — guests are never told which. §20.5 #2.
  return (
    <span className={`pill ${styles.pillGone}`}>
      {photo.status === 'rejected' ? 'Gỡ trước khi duyệt' : 'Gỡ khỏi Wall'}
    </span>
  );
}

export function ModRow({
  photo,
  tab,
  now,
  backend,
  selectable,
  selected,
  isCursor,
  busy,
  onToggleSelect,
  onApprove,
  onRequestRemove,
}: {
  photo: Photo;
  tab: ModTab;
  now: number;
  backend: ModeratorApi;
  selectable: boolean;
  selected: boolean;
  isCursor: boolean;
  busy: boolean;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onRequestRemove: (id: string) => void;
}) {
  const url = useThumb(backend, photo.id);
  const waitingSince = photo.submittedAtMs ?? photo.createdAtMs;
  const overdue = tab === 'pending' && now - waitingSince > WAITING_OVERDUE_MS;

  return (
    <div
      className={[styles.row, selected ? styles.rowSelected : '', isCursor ? styles.rowCursor : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.checkboxCell}>
        {selectable ? (
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={selected}
            onChange={() => onToggleSelect(photo.id)}
            aria-label={`Chọn dải ảnh của ${photo.displayName}`}
          />
        ) : null}
      </div>

      {url ? (
        <img className={styles.thumb} src={url} alt="" />
      ) : (
        <div className={styles.thumbFallback} aria-hidden="true">
          <Icon name="photoCamera" size={16} />
        </div>
      )}

      <div className={styles.who}>
        <span className={styles.name}>{photo.displayName}</span>
        <span className={styles.meta}>
          #{photo.id.slice(-4)} · khung {frameShortLabel(photo.frameVariant)}
        </span>
      </div>

      <div className={styles.time}>
        <span className={styles.clock}>{formatClock(waitingSince)}</span>
        {tab === 'pending' ? (
          <span className={`${styles.waiting} ${overdue ? styles.waitingOverdue : ''}`}>
            {formatWaiting(waitingSince, now)}
          </span>
        ) : photo.reviewedBy ? (
          <span className={styles.reviewer}>bởi {photo.reviewedBy}</span>
        ) : null}
      </div>

      <div className={styles.statusCell}>
        <StatusPill photo={photo} />
      </div>

      <div className={styles.actions}>
        {tab === 'pending' ? (
          <>
            <Button
              variant="success"
              size="s"
              disabled={busy}
              onClick={() => onApprove(photo.id)}
            >
              Duyệt
            </Button>
            <Button
              variant="destructive"
              size="s"
              disabled={busy}
              onClick={() => onRequestRemove(photo.id)}
            >
              Gỡ
            </Button>
          </>
        ) : tab === 'approved' ? (
          <Button variant="destructive" size="s" disabled={busy} onClick={() => onRequestRemove(photo.id)}>
            Gỡ
          </Button>
        ) : null}
      </div>
    </div>
  );
}
