/**
 * M01 Kiểm duyệt — DESIGN-D21, route `/mod` (internally `/` in the admin app).
 * Fixed desktop layout, no mobile variant. Staff clear the queue with the
 * keyboard: A duyệt · R gỡ · ↑↓ chọn dòng — Claude-Plan.md §6 / Phase 10.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconButton, IconButtonLink } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { Tabs, type TabItem } from '@/components/Tabs';
import { ModTable } from '@/features/moderation/ModTable';
import { useModShortcuts } from '@/features/moderation/useModShortcuts';
import {
  ReviewConflict,
  useModeratorBackend,
  type ModTab,
  type Photo,
} from '@/lib/backend';
import styles from './ModQueue.module.css';

type Rows = Record<ModTab, Photo[]>;
const EMPTY_ROWS: Rows = { pending: [], approved: [], removed: [] };

function sortRows(tab: ModTab, rows: Photo[], sort: 'newest' | 'oldest'): Photo[] {
  const time = (p: Photo) =>
    tab === 'pending' ? (p.submittedAtMs ?? p.createdAtMs) : (p.reviewedAtMs ?? p.createdAtMs);
  const sorted = [...rows].sort((a, b) => time(a) - time(b));
  return sort === 'newest' ? sorted.reverse() : sorted;
}

export function ModQueue({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const backend = useModeratorBackend();

  const [rows, setRows] = useState<Rows>(EMPTY_ROWS);
  const [tab, setTab] = useState<ModTab>('pending');
  const [sort, setSort] = useState<'newest' | 'oldest'>('oldest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [removeTarget, setRemoveTarget] = useState<string[] | null>(null);
  const [uploadsOpen, setUploadsOpenState] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tabs: ModTab[] = ['pending', 'approved', 'removed'];
    const unsubs = tabs.map((t) => backend.watchTab(t, (photos) => setRows((r) => ({ ...r, [t]: photos }))));
    return () => unsubs.forEach((u) => u());
  }, [backend]);

  useEffect(() => backend.watchConfig((c) => setUploadsOpenState(c?.uploadsOpen ?? null)), [backend]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Switching tabs starts a fresh cursor and selection.
  useEffect(() => {
    setCursor(0);
    setSelected(new Set());
  }, [tab]);

  const activeRows = useMemo(() => sortRows(tab, rows[tab], sort), [rows, tab, sort]);
  const rowIds = useMemo(() => activeRows.map((p) => p.id), [activeRows]);

  // A row can disappear mid-session (another moderator handled it, or the tab
  // switched) — never let the cursor or the selection point at nothing.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rowIds.length - 1)));
    setSelected((s) => new Set([...s].filter((id) => rowIds.includes(id))));
  }, [rowIds]);

  async function withBusy(ids: string[], run: (id: string) => Promise<void>) {
    setBusyIds((b) => new Set([...b, ...ids]));
    try {
      await Promise.all(
        ids.map(async (id) => {
          try {
            await run(id);
          } catch (e) {
            // Another moderator already handled it — the row vanishes via the
            // live snapshot on its own, nothing else to do. Claude-Plan.md §10.9.
            if (!(e instanceof ReviewConflict)) throw e;
          }
        }),
      );
    } catch (e) {
      if (import.meta.env.DEV) console.error('[moderation]', e);
    } finally {
      setBusyIds((b) => new Set([...b].filter((id) => !ids.includes(id))));
      setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
    }
  }

  const approveIds = (ids: string[]) => withBusy(ids, (id) => backend.approve(id));
  const removeIds = (ids: string[]) =>
    withBusy(ids, (id) => (tab === 'pending' ? backend.reject(id) : backend.remove(id)));

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useModShortcuts({
    rowIds,
    cursor,
    setCursor,
    onApprove: tab === 'pending' ? (id) => void approveIds([id]) : undefined,
    onRemove: (id) => setRemoveTarget([id]),
    enabled: removeTarget === null,
  });

  const tabItems: readonly TabItem<ModTab>[] = [
    { value: 'pending', label: 'Chờ duyệt', count: rows.pending.length, tone: 'pending' },
    { value: 'approved', label: 'Đã duyệt', count: rows.approved.length },
    { value: 'removed', label: 'Đã gỡ', count: rows.removed.length },
  ];

  const confirmCount = removeTarget?.length ?? 0;
  const confirmName = confirmCount === 1 ? activeRows.find((p) => p.id === removeTarget?.[0])?.displayName : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logoTile} aria-hidden="true">
            <Icon name="photoCamera" size={24} />
          </span>
          <div>
            <h1 className={`u ${styles.title}`}>Photo Wall · Kiểm duyệt</h1>
            <p className={styles.sub}>Duyệt · gỡ — mọi thay đổi lên màn hình lớn ngay</p>
          </div>
        </div>

        <div className={styles.pills}>
          <span className="pill pill--lg">{rows.approved.length} dải ảnh</span>
          {uploadsOpen !== null ? (
            <button
              type="button"
              className={`pill pill--lg ${styles.uploadsPill} ${uploadsOpen ? styles.uploadsOpen : styles.uploadsClosed}`}
              onClick={() => backend.setUploadsOpen(!uploadsOpen)}
            >
              {uploadsOpen ? 'Đang nhận ảnh' : 'Đã tạm dừng'}
            </button>
          ) : null}
          <IconButtonLink to="/settings" label="Cài đặt sự kiện" size="s">
            <Icon name="settings" size={20} />
          </IconButtonLink>
          <span className="pill pill--on-ink">{email}</span>
          <IconButton label="Đăng xuất" size="s" onClick={onSignOut}>
            <Icon name="logout" size={20} />
          </IconButton>
        </div>
      </header>

      <div className={styles.tabsRow}>
        <Tabs items={tabItems} value={tab} onChange={setTab} />
        {tab !== 'removed' ? (
          <select
            className={styles.sort}
            value={sort}
            onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
            aria-label="Sắp xếp"
          >
            <option value="oldest">Chờ lâu nhất trước</option>
            <option value="newest">Mới nhất trước</option>
          </select>
        ) : null}
      </div>

      <p className={styles.helper}>
        Mục tiêu &lt; 3 phút / ảnh. Phím tắt: <b>A</b> duyệt · <b>R</b> gỡ · <b>↑↓</b> chọn dòng.
      </p>

      <ModTable
        tab={tab}
        rows={activeRows}
        now={now}
        backend={backend}
        selected={selected}
        cursor={cursor}
        busyIds={busyIds}
        onToggleSelect={toggleSelect}
        onApprove={(id) => void approveIds([id])}
        onRequestRemove={(id) => setRemoveTarget([id])}
      />

      {selected.size > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkLabel}>{selected.size} dải ảnh đã chọn</span>
          <div className={styles.bulkActions}>
            <Button variant="text" size="m" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
            {tab === 'pending' ? (
              <Button variant="success" size="m" onClick={() => void approveIds([...selected])}>
                Duyệt {selected.size} ảnh
              </Button>
            ) : null}
            <Button variant="destructive" size="m" onClick={() => setRemoveTarget([...selected])}>
              Gỡ {selected.size} ảnh
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={removeTarget !== null}
        title={confirmName ? `Gỡ dải ảnh của ${confirmName}?` : `Gỡ ${confirmCount} dải ảnh?`}
        body={
          tab === 'pending'
            ? 'Ảnh sẽ không lên màn hình lớn. Người gửi thấy "Đã gỡ bởi BTC", không hiện lý do.'
            : 'Ảnh biến khỏi màn hình lớn ngay. Người gửi thấy "Đã gỡ bởi BTC", không hiện lý do.'
        }
        confirmLabel="Gỡ ảnh"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          const ids = removeTarget ?? [];
          setRemoveTarget(null);
          void removeIds(ids);
        }}
      />
    </div>
  );
}
