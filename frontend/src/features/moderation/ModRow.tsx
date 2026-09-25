/**
 * pw-mod-row — DESIGN-D21 (M01) and the "Table row · kiểm duyệt" pattern on 02b.
 * One photo: checkbox, 44 strip, sender, time (+ waiting, red past 3 min on the
 * pending tab), status pill with its reason chip, and the S-size actions for
 * its tab — pending: Duyệt · Gỡ, on the wall: Gỡ, removed: Khôi phục.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import type { ModeratorAccount, ModeratorApi, ModTab, Photo } from '@/lib/backend';
import type { FrameTemplate } from '@/types/frame';
import { ConsoleIcon, type ConsoleIconName } from './ConsoleIcon';
import {
  formatClock,
  formatRetention,
  formatWaiting,
  reviewerName,
  rowMeta,
  safeSearchFlag,
  WAITING_OVERDUE_MS,
} from './format';
import styles from './ModTable.module.css';

const THUMB_WIDTH = 44;

/** Thumb URLs already resolved, so a row remounted by a tab switch shows its strip at once. */
const known = new Map<string, string>();

function useThumb(backend: ModeratorApi, photoId: string): string | null {
  const [url, setUrl] = useState<string | null>(() => known.get(photoId) ?? null);
  useEffect(() => {
    let alive = true;
    setUrl(known.get(photoId) ?? null);
    backend.thumbUrl(photoId).then(
      (u) => {
        known.set(photoId, u);
        if (alive) setUrl(u);
      },
      () => undefined, // not uploaded (demo rows) or already purged — keep the frame tile
    );
    return () => {
      alive = false;
    };
  }, [backend, photoId]);
  return url;
}

/** The strip at 44, in the same 2px ink / radius 8 wrapper the artboard draws. */
export function StripThumb({
  url,
  frame,
  width = THUMB_WIDTH,
}: {
  url: string | null;
  frame: FrameTemplate | undefined;
  width?: number;
}) {
  return (
    <span className={styles.thumb}>
      {url ? (
        <img src={url} alt="" style={{ width }} className={styles.thumbImg} loading="lazy" decoding="async" />
      ) : frame ? (
        // The uploaded JPEG already carries its frame; until it arrives (or if
        // it never will) the row shows that frame with its four slots empty.
        <PhotoWallFrame frame={frame} width={width} />
      ) : (
        <span className={styles.thumbImg} style={{ width }} />
      )}
    </span>
  );
}

type Tone = 'pending' | 'approved' | 'removed' | 'manual';

const PILL: Record<ModTab, { tone: Tone; icon: ConsoleIconName; label: string }> = {
  pending: { tone: 'pending', icon: 'hourglassTop', label: 'Chờ duyệt' },
  approved: { tone: 'approved', icon: 'visibility', label: 'Đang hiển thị' },
  removed: { tone: 'removed', icon: 'visibilityOff', label: 'Đã gỡ' },
};

export function isRestorable(photo: Photo, retentionHours: number, now: number): boolean {
  if (photo.reviewedBy === 'owner' || photo.purgedAtMs) return false;
  return now - (photo.reviewedAtMs ?? 0) < retentionHours * 3_600_000;
}

/**
 * The line under the status pill. A pending strip SafeSearch flagged says why
 * ("SafeSearch: violence · LIKELY"); any other pending strip is waiting for a
 * person — "Chế độ duyệt tay".
 */
function reasonChip(
  photo: Photo,
  tab: ModTab,
  now: number,
  retentionHours: number,
  moderators: readonly ModeratorAccount[],
): { tone: Tone; icon: ConsoleIconName; text: string } {
  if (tab === 'pending') {
    const flag = safeSearchFlag(photo.safeSearch);
    return flag
      ? { tone: 'removed', icon: 'warning', text: flag }
      : { tone: 'manual', icon: 'backHand', text: 'Chế độ duyệt tay' };
  }
  const at = photo.reviewedAtMs ?? photo.createdAtMs;
  if (tab === 'approved') {
    return {
      tone: 'approved',
      icon: 'check',
      text: `${reviewerName(photo.reviewedBy, moderators)} duyệt · ${formatClock(at)}`,
    };
  }
  const who = photo.reviewedBy === 'owner' ? 'Người gửi tự gỡ' : `${reviewerName(photo.reviewedBy, moderators)} gỡ`;
  const left = photo.purgedAtMs ? 'đã xoá hẳn' : formatRetention(at, retentionHours, now);
  return { tone: 'removed', icon: 'delete', text: `${who} · ${formatClock(at)} · ${left}` };
}

export function ModRow({
  photo,
  tab,
  now,
  backend,
  frame,
  moderators,
  retentionHours,
  selectable,
  selected,
  isCursor,
  busy,
  onToggleSelect,
  onApprove,
  onRequestRemove,
  onRestore,
  onPreview,
}: {
  photo: Photo;
  tab: ModTab;
  now: number;
  backend: ModeratorApi;
  frame: FrameTemplate | undefined;
  moderators: readonly ModeratorAccount[];
  retentionHours: number;
  selectable: boolean;
  selected: boolean;
  isCursor: boolean;
  busy: boolean;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onRequestRemove: (id: string) => void;
  onRestore: (id: string) => void;
  onPreview: (photo: Photo, url: string | null) => void;
}) {
  const url = useThumb(backend, photo.id);
  const submittedAt = photo.submittedAtMs ?? photo.createdAtMs;
  const overdue = tab === 'pending' && now - submittedAt > WAITING_OVERDUE_MS;
  const pill = PILL[tab];
  const chip = reasonChip(photo, tab, now, retentionHours, moderators);

  return (
    <div
      className={[styles.row, selected ? styles.rowSelected : '', isCursor ? styles.rowCursor : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.checkCell}>
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

      <div>
        <StripThumb url={url} frame={frame} />
      </div>

      <div className={styles.who}>
        <span className={styles.name}>{photo.displayName}</span>
        <span className={styles.meta}>{rowMeta(photo)}</span>
      </div>

      <div className={styles.time}>
        <span className={styles.clock}>{formatClock(submittedAt)}</span>
        {tab === 'pending' ? (
          <span className={`${styles.waiting} ${overdue ? styles.waitingOverdue : ''}`}>
            {formatWaiting(submittedAt, now)}
          </span>
        ) : null}
      </div>

      <div className={styles.status}>
        <span className={`${styles.pill} ${styles[pill.tone]}`}>
          <ConsoleIcon name={pill.icon} size={16} />
          {pill.label}
        </span>
        <span className={`${styles.chip} ${styles[`chip-${chip.tone}`]}`}>
          <ConsoleIcon name={chip.icon} size={16} />
          {chip.text}
        </span>
      </div>

      <div className={styles.actions}>
        <IconButton
          size="s"
          label={`Xem lớn dải ảnh của ${photo.displayName}`}
          onClick={() => onPreview(photo, url)}
        >
          <ConsoleIcon name="zoomIn" size={20} />
        </IconButton>
        {tab === 'pending' ? (
          <Button
            variant="success"
            size="s"
            disabled={busy}
            iconStart={<ConsoleIcon name="check" size={16} />}
            onClick={() => onApprove(photo.id)}
          >
            Duyệt
          </Button>
        ) : null}
        {tab !== 'removed' ? (
          <Button
            variant="secondary"
            size="s"
            className={styles.remove}
            disabled={busy}
            iconStart={<ConsoleIcon name="delete" size={16} />}
            onClick={() => onRequestRemove(photo.id)}
          >
            Gỡ
          </Button>
        ) : isRestorable(photo, retentionHours, now) ? (
          <Button
            variant="tonal"
            size="s"
            disabled={busy}
            iconStart={<ConsoleIcon name="history" size={16} />}
            onClick={() => onRestore(photo.id)}
          >
            Khôi phục
          </Button>
        ) : null}
      </div>
    </div>
  );
}
