/**
 * M01 Kiểm duyệt — DESIGN-D21, route `/mod` (internally `/` in the admin app).
 * Fixed desktop layout, no mobile variant (board 06). Staff clear the queue
 * with the keyboard: A duyệt · R gỡ · ↑↓ chọn dòng — Claude-Plan.md §6 / Phase 10.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { IconButton, IconButtonLink } from '@/components/IconButton';
import { Tabs, type TabItem } from '@/components/Tabs';
import { useFrames } from '@/features/frames/useFrames';
import { ConsoleIcon } from '@/features/moderation/ConsoleIcon';
import { formatClock, photoNumber } from '@/features/moderation/format';
import { ModTable } from '@/features/moderation/ModTable';
import { StripPreview } from '@/features/moderation/StripPreview';
import { useModShortcuts } from '@/features/moderation/useModShortcuts';
import { useToast } from '@/features/moderation/useToast';
import {
  ReviewConflict,
  useModeratorBackend,
  type AppConfig,
  type BulkResult,
  type ModeratorAccount,
  type ModTab,
  type Photo,
  type ReviewReason,
} from '@/lib/backend';
import styles from './ModQueue.module.css';

type Sort = 'newest' | 'oldest';
type PerTab<T> = Record<ModTab, T>;

const TABS: readonly ModTab[] = ['pending', 'approved', 'removed'];
/** watchTab's default cap; past it the badge asks the backend for the exact size. */
const LIST_CAP = 200;
const DEFAULT_RETENTION_HOURS = 24;

/** M01 remove dialog. The reason is logged for the organisers; the guest never sees it. */
const REASONS: readonly { value: ReviewReason; label: string }[] = [
  { value: 'inappropriate', label: 'Không phù hợp' },
  { value: 'duplicate', label: 'Trùng / lỗi ảnh' },
  { value: 'guest-request', label: 'Người gửi yêu cầu' },
];

/** Search ignores case and Vietnamese marks, so "duc huy" finds "Đức Huy". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function matches(photo: Photo, query: string): boolean {
  const q = fold(query.trim()).replace(/^#/, '');
  if (!q) return true;
  return (
    fold(photo.displayName).includes(q) ||
    photoNumber(photo).toLowerCase().includes(q) ||
    photo.id.toLowerCase().includes(q)
  );
}

function sortRows(tab: ModTab, rows: Photo[], sort: Sort): Photo[] {
  const time = (p: Photo) =>
    tab === 'pending' ? (p.submittedAtMs ?? p.createdAtMs) : (p.reviewedAtMs ?? p.createdAtMs);
  const sorted = [...rows].sort((a, b) => time(a) - time(b));
  return sort === 'newest' ? sorted.reverse() : sorted;
}

/** "Lan · Admin GDGoC" / "Mai · Kiểm duyệt AWS SC" — DESIGN-D21 header pill. */
function accountLabel(a: ModeratorAccount): string {
  const who = a.name?.split(' ')[0] ?? a.email.split('@')[0];
  const role = a.role === 'admin' ? 'Admin' : 'Kiểm duyệt';
  return [who, [role, a.org].filter(Boolean).join(' ')].join(' · ');
}

export function ModQueue({ account, onSignOut }: { account: ModeratorAccount; onSignOut: () => void }) {
  const backend = useModeratorBackend();
  const { registry } = useFrames();
  const isAdmin = account.role === 'admin';

  const [rows, setRows] = useState<PerTab<Photo[]>>({ pending: [], approved: [], removed: [] });
  const [loaded, setLoaded] = useState<PerTab<boolean>>({ pending: false, approved: false, removed: false });
  const [exact, setExact] = useState<PerTab<number | null>>({ pending: null, approved: null, removed: null });
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [moderators, setModerators] = useState<ModeratorAccount[]>([]);
  const [tab, setTab] = useState<ModTab>('pending');
  const [sort, setSort] = useState<Sort>('newest');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  // The row cursor only shows once the keyboard is in use; the artboard draws none.
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [removeTarget, setRemoveTarget] = useState<string[] | null>(null);
  const [reason, setReason] = useState<ReviewReason>('inappropriate');
  const [preview, setPreview] = useState<{ photo: Photo; url: string | null } | null>(null);
  const [toast, setToast] = useToast();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsubs = TABS.map((t) =>
      backend.watchTab(t, (photos) => {
        setRows((r) => ({ ...r, [t]: photos }));
        setLoaded((l) => (l[t] ? l : { ...l, [t]: true }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [backend]);

  // The lists stop at LIST_CAP; only then is the true size worth a count query.
  useEffect(() => {
    for (const t of TABS) {
      if (rows[t].length < LIST_CAP) continue;
      backend.countTab(t).then(
        (n) => setExact((e) => ({ ...e, [t]: n })),
        () => undefined,
      );
    }
  }, [backend, rows]);

  useEffect(() => backend.watchConfig(setConfig), [backend]);
  useEffect(() => backend.watchModerators(setModerators), [backend]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Switching tabs starts a fresh cursor and selection.
  useEffect(() => {
    setCursor(0);
    setSelected(new Set());
  }, [tab]);

  const count = (t: ModTab) => (rows[t].length >= LIST_CAP ? (exact[t] ?? rows[t].length) : rows[t].length);
  const retentionHours = config?.removedRetentionHours ?? DEFAULT_RETENTION_HOURS;
  const uploadsOpen = config?.uploadsOpen ?? null;

  const activeRows = useMemo(
    () => sortRows(tab, rows[tab].filter((p) => matches(p, query)), sort),
    [rows, tab, sort, query],
  );
  const rowIds = useMemo(() => activeRows.map((p) => p.id), [activeRows]);

  // A row can disappear mid-session (another moderator handled it, or the
  // search narrowed) — never let the cursor or the selection point at nothing.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rowIds.length - 1)));
    setSelected((s) => {
      const kept = [...s].filter((id) => rowIds.includes(id));
      return kept.length === s.size ? s : new Set(kept);
    });
  }, [rowIds]);

  async function run(ids: string[], action: () => Promise<BulkResult | void>, failed: string) {
    setBusyIds((b) => new Set([...b, ...ids]));
    try {
      const result = await action();
      // Conflicts are photos another moderator handled first — the live
      // snapshot already moved them, so only real failures are reported.
      if (result && result.failed.length > 0) setToast(`${failed} ${result.failed.length} dải ảnh — thử lại nhé.`);
    } catch (e) {
      if (!(e instanceof ReviewConflict)) {
        if (import.meta.env.DEV) console.error('[moderation]', e);
        setToast(`${failed} dải ảnh này — thử lại nhé.`);
      }
    } finally {
      setBusyIds((b) => new Set([...b].filter((id) => !ids.includes(id))));
      setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
    }
  }

  const approveIds = (ids: string[]) =>
    run(ids, () => (ids.length === 1 ? backend.approve(ids[0]) : backend.approveMany(ids)), 'Chưa duyệt được');

  const removeIds = (ids: string[], why: ReviewReason) =>
    run(
      ids,
      () =>
        tab === 'pending'
          ? ids.length === 1
            ? backend.reject(ids[0], why)
            : backend.rejectMany(ids, why)
          : ids.length === 1
            ? backend.remove(ids[0], why)
            : backend.removeMany(ids, why),
      'Chưa gỡ được',
    );

  const restoreId = (id: string) => run([id], () => backend.restore(id), 'Chưa khôi phục được');

  function requestRemove(ids: string[]) {
    setReason('inappropriate');
    setRemoveTarget(ids);
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => (s.size === rowIds.length ? new Set() : new Set(rowIds)));
  }

  const closeRemove = useCallback(() => setRemoveTarget(null), []);
  const closePreview = useCallback(() => setPreview(null), []);

  // A first A or R only reveals the cursor, so a key never acts on a row the
  // moderator cannot see.
  const onKeyboard = (act: () => void) => () => (keyboardNav ? act() : setKeyboardNav(true));

  useModShortcuts({
    rowIds,
    cursor,
    setCursor: (next) => {
      setKeyboardNav(true);
      setCursor(next);
    },
    onApprove: tab === 'pending' ? (id) => onKeyboard(() => void approveIds([id]))() : undefined,
    onRemove: tab === 'removed' ? undefined : (id) => onKeyboard(() => requestRemove([id]))(),
    enabled: removeTarget === null && preview === null,
  });

  const tabItems: readonly TabItem<ModTab>[] = [
    { value: 'pending', label: 'Chờ duyệt', count: count('pending'), tone: 'pending' },
    { value: 'approved', label: 'Đã duyệt', count: count('approved') },
    { value: 'removed', label: 'Đã gỡ', count: count('removed') },
  ];

  const helper =
    tab === 'removed' ? (
      <>
        Ảnh đã gỡ giữ <b>{retentionHours} giờ</b> rồi xoá hẳn; người gửi thấy “Đã gỡ bởi BTC” (không hiện
        lý do). Khôi phục → quay lại Đã duyệt và lên màn hình lớn ở đầu băng.
      </>
    ) : (
      <>
        <b>Mục tiêu &lt; 3 phút / ảnh.</b> Thời gian chờ đỏ khi quá 3 phút. Duyệt = lên màn hình lớn ngay;
        Gỡ = ẩn ngay, khôi phục được {retentionHours} h. Phím tắt: <kbd className="kbd">A</kbd> duyệt ·{' '}
        <kbd className="kbd">R</kbd> gỡ · <kbd className="kbd">↑↓</kbd> chọn dòng.
      </>
    );

  const where = sort === 'newest' ? 'lên đầu danh sách' : 'ở cuối danh sách';
  const endNote = query.trim()
    ? activeRows.length === 0
      ? `Không có dải ảnh nào khớp “${query.trim()}”`
      : 'Hết kết quả tìm kiếm'
    : tab === 'pending'
      ? `Hết hàng chờ · ảnh mới tự hiện ${where}, không cần tải lại`
      : tab === 'approved'
        ? `Hết danh sách · ảnh vừa duyệt tự hiện ${where}, không cần tải lại`
        : `Hết danh sách · ảnh đã gỡ quá ${retentionHours} giờ được xoá hẳn`;

  const target = removeTarget ?? [];
  const single = target.length === 1 ? activeRows.find((p) => p.id === target[0]) : undefined;
  const onWall = tab === 'approved';

  const bulkBar =
    selected.size > 0 ? (
      <div className={styles.bulk}>
        <div className={styles.bulkLabel}>
          <ConsoleIcon name="checkBox" size={20} className={styles.bulkIcon} />
          <span>{selected.size} dải ảnh đã chọn</span>
          <button type="button" className={styles.bulkClear} onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
        </div>
        <div className={styles.bulkActions}>
          {tab === 'pending' ? (
            <Button
              variant="success"
              size="s"
              iconStart={<ConsoleIcon name="doneAll" size={16} />}
              onClick={() => void approveIds([...selected])}
            >
              Duyệt {selected.size} ảnh
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="s"
            className={styles.bulkRemove}
            iconStart={<ConsoleIcon name="delete" size={16} />}
            onClick={() => requestRemove([...selected])}
          >
            Gỡ {selected.size} ảnh
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logoTile} aria-hidden="true">
            <ConsoleIcon name="adminPanelSettings" size={24} />
          </span>
          <div>
            <h1 className={`u ${styles.title}`}>Photo Wall · Kiểm duyệt</h1>
            <p className={styles.sub}>Duyệt · gỡ · khôi phục — mọi thay đổi lên màn hình lớn ngay</p>
          </div>
        </div>

        <div className={styles.pills}>
          <span className={styles.pill}>
            <ConsoleIcon name="photoLibrary" size={16} />
            {count('pending') + count('approved') + count('removed')} dải ảnh
          </span>
          {uploadsOpen !== null ? (
            isAdmin ? (
              <button
                type="button"
                className={`${styles.pill} ${uploadsOpen ? styles.open : styles.closed}`}
                aria-pressed={uploadsOpen}
                title={uploadsOpen ? 'Bấm để đóng nhận ảnh' : 'Bấm để mở lại nhận ảnh'}
                onClick={() => void backend.setUploadsOpen(!uploadsOpen)}
              >
                <ConsoleIcon name={uploadsOpen ? 'toggleOn' : 'toggleOff'} size={20} />
                {uploadsOpen ? 'Đang nhận ảnh' : 'Đã đóng nhận ảnh'}
              </button>
            ) : (
              // Moderators see the state; only an admin may switch it (board 07).
              <span className={`${styles.pill} ${uploadsOpen ? styles.open : styles.closed}`}>
                <ConsoleIcon name={uploadsOpen ? 'toggleOn' : 'toggleOff'} size={20} />
                {uploadsOpen ? 'Đang nhận ảnh' : 'Đã đóng nhận ảnh'}
              </span>
            )
          ) : null}
          {isAdmin ? (
            <IconButtonLink to="/settings" label="Cài đặt sự kiện" className={styles.ibtn}>
              <ConsoleIcon name="settings" size={20} />
            </IconButtonLink>
          ) : null}
          <span className={`${styles.pill} ${styles.user}`} title={account.email}>
            <ConsoleIcon name="manageAccounts" size={16} />
            {accountLabel(account)}
          </span>
          <IconButton label="Đăng xuất" className={styles.ibtn} onClick={onSignOut}>
            <ConsoleIcon name="logout" size={20} />
          </IconButton>
        </div>
      </header>

      <div className={styles.toolbar}>
        <Tabs items={tabItems} value={tab} onChange={setTab} />
        <div className={styles.filters}>
          <label className={styles.search}>
            <ConsoleIcon name="search" size={20} className={styles.searchIcon} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc #id…"
              aria-label="Tìm theo tên hoặc #id"
            />
          </label>
          <select
            className={styles.sort}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sắp xếp"
          >
            <option value="newest">Mới nhất trước</option>
            <option value="oldest">{tab === 'pending' ? 'Chờ lâu nhất trước' : 'Cũ nhất trước'}</option>
          </select>
        </div>
      </div>

      <ModTable
        tab={tab}
        rows={activeRows}
        loaded={loaded[tab]}
        endNote={endNote}
        helper={helper}
        footer={bulkBar}
        now={now}
        backend={backend}
        frames={registry?.frames ?? []}
        moderators={moderators}
        retentionHours={retentionHours}
        selected={selected}
        cursor={keyboardNav ? cursor : -1}
        busyIds={busyIds}
        onToggleAll={toggleAll}
        onToggleSelect={toggleSelect}
        onApprove={(id) => void approveIds([id])}
        onRequestRemove={(id) => requestRemove([id])}
        onRestore={(id) => void restoreId(id)}
        onPreview={(photo, url) => setPreview({ photo, url })}
      />

      <Dialog
        open={removeTarget !== null}
        icon="delete"
        title={single ? `Gỡ dải ảnh của ${single.displayName}?` : `Gỡ ${target.length} dải ảnh?`}
        confirmLabel="Gỡ ảnh"
        onCancel={closeRemove}
        onConfirm={() => {
          setRemoveTarget(null);
          void removeIds(target, reason);
        }}
      >
        {single ? (
          <p className={styles.dialogMeta}>
            #{photoNumber(single)} · {formatClock(single.submittedAtMs ?? single.createdAtMs)}
          </p>
        ) : null}
        <p className={styles.dialogBody}>
          {onWall ? 'Ảnh biến mất khỏi màn hình lớn ngay.' : 'Ảnh sẽ không lên màn hình lớn.'} Có thể khôi
          phục trong {retentionHours} giờ ở tab Đã gỡ.
        </p>
        <fieldset className={styles.reasons}>
          <legend className={styles.reasonsLegend}>Lý do (ghi log nội bộ, người gửi không thấy)</legend>
          {REASONS.map((r) => (
            <label key={r.value} className={styles.reason}>
              <input
                type="radio"
                name="remove-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              {r.label}
            </label>
          ))}
        </fieldset>
      </Dialog>

      {preview ? (
        <StripPreview
          photo={preview.photo}
          url={preview.url}
          frame={registry?.frames.find((f) => f.id === preview.photo.frameVariant)}
          onClose={closePreview}
        />
      ) : null}

      {toast}
    </div>
  );
}
