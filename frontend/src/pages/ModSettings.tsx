/**
 * M02 Cài đặt sự kiện — DESIGN-D22, route `/mod/settings` (internally
 * `/settings` in the admin app). Admin only (board 07).
 *
 * Six cards in two columns. Settings are edited as a draft and written in one
 * `updateConfig` by "Lưu"; the buttons inside a card — export, "Làm mới màn
 * lớn", the moderator list, the scheduled wipe — are actions and run at once.
 *
 * "Tự động duyệt" and "Ngưỡng SafeSearch" are drawn but have no backend: there
 * is no server to run SafeSearch, so every strip waits in "Chờ duyệt". They are
 * shown disabled rather than as switches that would do nothing
 * (Claude-Plan.md §20.5 #3, #8).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CONFIG_DEFAULTS, LIMITS } from '@backend/schema';
import { Button } from '@/components/Button';
import { Toggle } from '@/components/Controls';
import { Dialog } from '@/components/Dialog';
import { IconButton } from '@/components/IconButton';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { overlayUrl } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { ConsoleIcon, type ConsoleIconName } from '@/features/moderation/ConsoleIcon';
import { useToast } from '@/features/moderation/useToast';
import { buildZip, saveBlob } from '@/features/moderation/zip';
import {
  useModeratorBackend,
  type AppConfig,
  type ConfigPatch,
  type FrameSetting,
  type ModeratorAccount,
  type ModeratorRole,
} from '@/lib/backend';
import type { FrameTemplate } from '@/types/frame';
import styles from './ModSettings.module.css';

const MARQUEE_DEFAULT_PX = 40; // the big screen's own pace when the field is empty
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------------ draft

interface Draft {
  uploadsOpen: boolean;
  /** "HH:MM", or '' for no automatic close. */
  closesAt: string;
  maxSubmitsPerUser: string;
  allowGallery: boolean;
  removedRetentionHours: string;
  /** '' = the big screen's default pace. */
  marqueePxPerSec: string;
  showNames: boolean;
  arrivalCard: boolean;
  qrUrl: string;
  frames: FrameSetting[];
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The next time the clock reads HH:MM — today if it is still ahead, else tomorrow. */
function nextOccurrence(hhmm: string, now = new Date()): number {
  const [h, m] = hhmm.split(':').map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** config.frames in its saved order, then any frame the registry added since, all on by default. */
function frameOrder(saved: readonly FrameSetting[] | undefined, registry: readonly FrameTemplate[]): FrameSetting[] {
  const known = new Set(registry.map((f) => f.id));
  const kept = (saved ?? []).filter((f) => known.has(f.id));
  const seen = new Set(kept.map((f) => f.id));
  return [...kept, ...registry.filter((f) => !seen.has(f.id)).map((f) => ({ id: f.id, enabled: true }))];
}

function toDraft(c: AppConfig, registry: readonly FrameTemplate[]): Draft {
  return {
    uploadsOpen: c.uploadsOpen,
    closesAt: c.closesAtMs ? clock(c.closesAtMs) : '',
    // The Firebase adapter fills these in already; the defaults cover any port that doesn't.
    maxSubmitsPerUser: String(c.maxSubmitsPerUser ?? CONFIG_DEFAULTS.maxSubmitsPerUser),
    allowGallery: c.allowGallery ?? CONFIG_DEFAULTS.allowGallery,
    removedRetentionHours: String(c.removedRetentionHours ?? CONFIG_DEFAULTS.removedRetentionHours),
    marqueePxPerSec: c.marqueePxPerSec != null ? String(c.marqueePxPerSec) : '',
    showNames: c.showNames ?? CONFIG_DEFAULTS.showNames,
    arrivalCard: c.arrivalCard ?? CONFIG_DEFAULTS.arrivalCard,
    qrUrl: c.qrUrl ?? CONFIG_DEFAULTS.qrUrl,
    frames: frameOrder(c.frames, registry),
  };
}

type Errors = Partial<Record<keyof Draft, string>>;

function intIn(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (d.closesAt && !TIME_RE.test(d.closesAt)) e.closesAt = 'Nhập giờ dạng 17:30';
  if (intIn(d.maxSubmitsPerUser, 1, LIMITS.maxSubmitsPerUserCeiling) === null) {
    e.maxSubmitsPerUser = `Từ 1 đến ${LIMITS.maxSubmitsPerUserCeiling}`;
  }
  if (intIn(d.removedRetentionHours, 1, LIMITS.maxRetentionHours) === null) {
    e.removedRetentionHours = `Từ 1 đến ${LIMITS.maxRetentionHours} giờ`;
  }
  if (d.marqueePxPerSec && intIn(d.marqueePxPerSec, 5, 400) === null) e.marqueePxPerSec = 'Từ 5 đến 400';
  try {
    if (new URL(d.qrUrl).protocol !== 'https:') throw new Error();
  } catch {
    e.qrUrl = 'Link phải bắt đầu bằng https://';
  }
  return e;
}

/** Only what changed, so "Lưu" never rewrites a field another admin just set. */
function toPatch(d: Draft, base: Draft): ConfigPatch {
  const p: ConfigPatch = {};
  if (d.uploadsOpen !== base.uploadsOpen) p.uploadsOpen = d.uploadsOpen;
  if (d.closesAt !== base.closesAt) p.closesAtMs = d.closesAt ? nextOccurrence(d.closesAt) : null;
  if (d.maxSubmitsPerUser !== base.maxSubmitsPerUser) p.maxSubmitsPerUser = Number(d.maxSubmitsPerUser);
  if (d.allowGallery !== base.allowGallery) p.allowGallery = d.allowGallery;
  if (d.removedRetentionHours !== base.removedRetentionHours) p.removedRetentionHours = Number(d.removedRetentionHours);
  if (d.marqueePxPerSec !== base.marqueePxPerSec) p.marqueePxPerSec = d.marqueePxPerSec ? Number(d.marqueePxPerSec) : null;
  if (d.showNames !== base.showNames) p.showNames = d.showNames;
  if (d.arrivalCard !== base.arrivalCard) p.arrivalCard = d.arrivalCard;
  if (d.qrUrl !== base.qrUrl) p.qrUrl = d.qrUrl.trim();
  if (JSON.stringify(d.frames) !== JSON.stringify(base.frames)) p.frames = d.frames;
  return p;
}

/** The draft as the saved config will read back, so a saved form is no longer dirty. */
function normalize(d: Draft): Draft {
  const num = (t: string) => (t.trim() === '' ? '' : String(Number(t)));
  return {
    ...d,
    maxSubmitsPerUser: num(d.maxSubmitsPerUser),
    removedRetentionHours: num(d.removedRetentionHours),
    marqueePxPerSec: num(d.marqueePxPerSec),
    qrUrl: d.qrUrl.trim(),
  };
}

// ------------------------------------------------------------------ pieces

function Card({ icon, title, children }: { icon: ConsoleIconName; title: string; children: ReactNode }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.tile} aria-hidden="true">
          <ConsoleIcon name={icon} size={20} />
        </span>
        <h2 className={`u ${styles.cardTitle}`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** "Admin" with its padlock — 02a Tag 24 · admin. */
function AdminTag() {
  return (
    <span className={styles.adminTag}>
      <ConsoleIcon name="lockOutline" size={16} />
      Admin
    </span>
  );
}

/** A setting whose control is a switch: the whole line is the label. */
function SwitchLine({
  title,
  admin,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  admin?: boolean;
  desc?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`${styles.line} ${disabled ? styles.lineDisabled : ''}`}>
      <span className={styles.lineText}>
        <span className={styles.lineTitle}>
          {title}
          {admin ? <AdminTag /> : null}
        </span>
        {desc ? <span className={styles.lineDesc}>{desc}</span> : null}
      </span>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} label={title} />
    </label>
  );
}

/** A setting with an S field (160 wide) and its unit on the right. */
function FieldLine({
  id,
  title,
  suffix,
  error,
  children,
}: {
  id: string;
  title: string;
  suffix?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.line}>
      <span className={styles.lineText}>
        <label htmlFor={id} className={styles.lineTitle}>
          {title}
        </label>
        {error ? (
          <span className={styles.lineError} id={`${id}-error`}>
            <ConsoleIcon name="errorCircle" size={16} />
            {error}
          </span>
        ) : null}
      </span>
      <span className={styles.fieldGroup}>
        {children}
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      </span>
    </div>
  );
}

function roleLabel(m: ModeratorAccount): string {
  const role = m.role === 'admin' ? 'Admin' : 'Kiểm duyệt';
  return m.org ? `${role} · ${m.org}` : role;
}

/** Initial discs keep each organisation's colour: GDGoC blue, AWS SC green, Đoàn hội red. */
function avatarTone(m: ModeratorAccount): string {
  const org = (m.org ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (org.includes('gdgoc')) return styles.avatarBlue;
  if (org.includes('aws')) return styles.avatarGreen;
  if (org.includes('doan') || org.includes('đoan')) return styles.avatarRed;
  return m.role === 'admin' ? styles.avatarBlue : styles.avatarYellow;
}

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Pending =
  | { kind: 'leave' }
  | { kind: 'schedule'; day: string }
  | { kind: 'confirm-wipe' }
  | { kind: 'timelapse' }
  | { kind: 'remove-moderator'; account: ModeratorAccount };

// ------------------------------------------------------------------ page

export function ModSettings({ account }: { account: ModeratorAccount }) {
  const backend = useModeratorBackend();
  const navigate = useNavigate();
  const { registry } = useFrames();
  const [toast, showToast] = useToast();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [moderators, setModerators] = useState<ModeratorAccount[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<ModeratorRole>('moderator');
  const [adding, setAdding] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  // Errors show on a field once it is edited, and on every field after a refused save.
  const [showAllErrors, setShowAllErrors] = useState(false);

  const frames = useMemo(() => registry?.frames ?? [], [registry]);

  useEffect(() => backend.watchConfig(setConfig), [backend]);
  useEffect(() => backend.watchModerators(setModerators), [backend]);

  // Seed the draft once both halves are known. Later live updates (the uploads
  // pill on M01, another admin) don't clobber an edit in progress; "Huỷ thay
  // đổi" re-syncs on purpose.
  const base = useMemo(() => (config && registry ? toDraft(config, frames) : null), [config, registry, frames]);
  useEffect(() => {
    if (base) setDraft((d) => d ?? base);
  }, [base]);

  const allErrors = draft ? validate(draft) : {};
  const hasErrors = Object.keys(allErrors).length > 0;
  const errors: Errors = {};
  for (const key of Object.keys(allErrors) as (keyof Draft)[]) {
    if (showAllErrors || (draft && base && draft[key] !== base[key])) errors[key] = allErrors[key];
  }
  const patch = draft && base ? toPatch(draft, base) : {};
  const dirty = Object.keys(patch).length > 0;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!dirty) {
      showToast('Chưa có thay đổi nào để lưu.');
      return;
    }
    if (hasErrors) {
      setShowAllErrors(true);
      showToast('Còn ô chưa hợp lệ — sửa ô có dấu đỏ rồi lưu lại nhé.');
      return;
    }
    setSaving(true);
    try {
      await backend.updateConfig(patch);
      // Kept, not re-seeded: the live config catches up to it and it stops being dirty.
      setDraft((d) => (d ? normalize(d) : d));
      showToast('Đã lưu — thay đổi có hiệu lực ngay.');
    } catch (e) {
      if (import.meta.env.DEV) console.error('[settings]', e);
      showToast('Chưa lưu được — kiểm tra mạng rồi thử lại.');
    } finally {
      setSaving(false);
    }
  }

  function toggleFrame(id: string, enabled: boolean) {
    if (!draft) return;
    set(
      'frames',
      draft.frames.map((f) => (f.id === id ? { ...f, enabled } : f)),
    );
  }

  async function reloadDisplays() {
    try {
      await backend.requestDisplayReload();
      showToast('Đã gửi lệnh — màn hình lớn sẽ tải lại trong vài giây.');
    } catch {
      showToast('Chưa gửi được lệnh làm mới — thử lại nhé.');
    }
  }

  async function downloadZip() {
    try {
      const entries = await backend.listZipEntries();
      if (entries.length === 0) {
        showToast('Chưa có dải ảnh nào đang hiển thị để tải.');
        return;
      }
      setZipProgress({ done: 0, total: entries.length });
      const files = [];
      for (const [i, entry] of entries.entries()) {
        const blob = await backend.fetchStripBlob(entry.photoId);
        files.push({ name: entry.fileName, data: new Uint8Array(await blob.arrayBuffer()) });
        setZipProgress({ done: i + 1, total: entries.length });
      }
      saveBlob(buildZip(files), 'photowall.zip');
    } catch (e) {
      if (import.meta.env.DEV) console.error('[zip]', e);
      showToast('Chưa tải được file .zip — thử lại nhé.');
    } finally {
      setZipProgress(null);
    }
  }

  async function downloadCsv() {
    setCsvBusy(true);
    try {
      const csv = await backend.exportParticipantsCsv();
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'photowall-tham-gia.csv');
    } catch {
      showToast('Chưa xuất được danh sách — thử lại nhé.');
    } finally {
      setCsvBusy(false);
    }
  }

  async function addModerator() {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      showToast('Nhập đúng email Google người đó dùng để đăng nhập.');
      return;
    }
    setAdding(true);
    try {
      const existed = moderators.some((m) => m.email === email);
      await backend.saveModerator(email, { role: newRole });
      setNewEmail('');
      showToast(existed ? `Đã đổi quyền của ${email}.` : `Đã thêm ${email}.`);
    } catch {
      showToast('Chưa thêm được — Admin không tự hạ quyền của mình được.');
    } finally {
      setAdding(false);
    }
  }

  const closeDialog = useCallback(() => setPending(null), []);

  async function runPending() {
    const p = pending;
    setPending(null);
    if (!p) return;
    try {
      if (p.kind === 'leave') navigate('/');
      else if (p.kind === 'timelapse') void downloadZip();
      else if (p.kind === 'remove-moderator') {
        await backend.deleteModerator(p.account.email);
        showToast(`Đã gỡ quyền của ${p.account.name ?? p.account.email}.`);
      } else if (p.kind === 'schedule') {
        if (!p.day) return;
        const [y, m, d] = p.day.split('-').map(Number);
        await backend.scheduleDeletion(new Date(y, m - 1, d, 23, 59));
        showToast('Đã lên lịch — cần thêm một Admin xác nhận.');
      } else if (p.kind === 'confirm-wipe') {
        await backend.confirmDeletion();
        showToast('Đã xác nhận — dữ liệu sẽ xoá vào ngày đã hẹn.');
      }
    } catch {
      showToast('Chưa làm được — thử lại nhé.');
    }
  }

  async function cancelWipe() {
    try {
      await backend.cancelDeletion();
      showToast('Đã huỷ lịch xoá dữ liệu.');
    } catch {
      showToast('Chưa huỷ được lịch — thử lại nhé.');
    }
  }

  const schedule = config?.deletionSchedule ?? null;
  const reviewerName = (email: string) =>
    moderators.find((m) => m.email === email)?.name?.split(' ')[0] ?? email.split('@')[0];
  const enabledCount = draft?.frames.filter((f) => f.enabled).length ?? 0;
  const off = !draft;

  let wipeLine: string;
  let wipeActions: ReactNode;
  if (!schedule) {
    wipeLine = 'Chưa lên lịch · cần 2 Admin xác nhận';
    wipeActions = (
      <Button
        variant="destructive"
        size="s"
        onClick={() => setPending({ kind: 'schedule', day: isoDay(Date.now() + 7 * 86_400_000) })}
      >
        Lên lịch xoá
      </Button>
    );
  } else if (schedule.executedAtMs) {
    wipeLine = `Đã xoá ngày ${shortDate(schedule.executedAtMs)}`;
    wipeActions = null;
  } else if (!schedule.confirmedBy) {
    const mine = schedule.requestedBy === account.email;
    wipeLine = mine
      ? `Lên lịch ${shortDate(schedule.atMs)} · cần 2 Admin xác nhận`
      : `Lên lịch ${shortDate(schedule.atMs)} bởi ${reviewerName(schedule.requestedBy)} · cần bạn xác nhận`;
    wipeActions = (
      <>
        <Button variant="secondary" size="s" onClick={() => void cancelWipe()}>
          Huỷ lịch
        </Button>
        {mine ? null : (
          <Button variant="destructive" size="s" onClick={() => setPending({ kind: 'confirm-wipe' })}>
            Xác nhận xoá
          </Button>
        )}
      </>
    );
  } else {
    wipeLine = `Xoá ngày ${shortDate(schedule.atMs)} · ${reviewerName(schedule.requestedBy)} và ${reviewerName(schedule.confirmedBy)} đã xác nhận`;
    wipeActions = (
      <Button variant="secondary" size="s" onClick={() => void cancelWipe()}>
        Huỷ lịch
      </Button>
    );
  }

  const dialog = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case 'leave':
        return {
          title: 'Bỏ các thay đổi chưa lưu?',
          body: 'Những ô bạn vừa sửa sẽ trở lại như cũ.',
          confirm: 'Bỏ thay đổi',
          icon: <ConsoleIcon name="warning" size={24} />,
          tone: 'destructive' as const,
        };
      case 'timelapse':
        return {
          title: 'Tạo video timelapse',
          body: 'Video được ghép trên máy có FFmpeg từ file .zip: tải file về, rồi chạy cd backend && npm run timelapse -- photowall.zip.',
          confirm: 'Tải .zip',
          icon: <ConsoleIcon name="movie" size={24} />,
          tone: 'default' as const,
        };
      case 'remove-moderator':
        return {
          title: `Gỡ quyền của ${pending.account.name ?? pending.account.email}?`,
          body: 'Người này sẽ không vào được trang kiểm duyệt nữa. Thêm lại được bất cứ lúc nào.',
          confirm: 'Gỡ quyền',
          icon: <ConsoleIcon name="personRemove" size={24} />,
          tone: 'destructive' as const,
        };
      case 'schedule':
        return {
          title: 'Lên lịch xoá toàn bộ dữ liệu?',
          body: 'Mọi dải ảnh, bộ đếm và giới hạn gửi sẽ bị xoá hẳn vào cuối ngày hẹn — cần một Admin khác xác nhận. Cài đặt và danh sách người kiểm duyệt được giữ.',
          confirm: 'Lên lịch xoá',
          icon: <ConsoleIcon name="delete" size={24} />,
          tone: 'destructive' as const,
        };
      case 'confirm-wipe':
        return {
          title: 'Xác nhận xoá toàn bộ dữ liệu?',
          body: `Dữ liệu sẽ bị xoá hẳn vào ngày ${schedule ? shortDate(schedule.atMs) : ''}, không khôi phục được.`,
          confirm: 'Xác nhận xoá',
          icon: <ConsoleIcon name="delete" size={24} />,
          tone: 'destructive' as const,
        };
    }
  })();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <IconButton
            label="Quay lại trang kiểm duyệt"
            onClick={() => (dirty ? setPending({ kind: 'leave' }) : navigate('/'))}
          >
            <ConsoleIcon name="arrowBack" />
          </IconButton>
          <div>
            <h1 className={`u ${styles.title}`}>Cài đặt sự kiện</h1>
            <p className={styles.sub}>
              Chỉ Admin GDGoC thấy trang này · mọi thay đổi có hiệu lực ngay và được ghi log
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="m"
            disabled={saving}
            onClick={() => {
              setDraft(base);
              setShowAllErrors(false);
            }}
          >
            Huỷ thay đổi
          </Button>
          <Button size="m" disabled={saving} iconStart={<ConsoleIcon name="check" size={20} />} onClick={() => void save()}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </header>

      <div className={styles.grid}>
        <Card icon="toggleOn" title="Nhận ảnh">
          <SwitchLine
            title="Đang nhận ảnh"
            admin
            desc={'Tắt → khách thấy màn "Đã đóng nhận ảnh", vẫn tải dải ảnh của mình được'}
            checked={draft?.uploadsOpen ?? false}
            disabled={off}
            onChange={(v) => set('uploadsOpen', v)}
          />
          <FieldLine id="closes-at" title="Tự động đóng lúc" suffix="giờ địa phương" error={errors.closesAt}>
            <input
              id="closes-at"
              className={styles.input}
              inputMode="numeric"
              placeholder="--:--"
              maxLength={5}
              value={draft?.closesAt ?? ''}
              disabled={off}
              aria-invalid={errors.closesAt ? true : undefined}
              onChange={(e) => set('closesAt', e.target.value)}
            />
          </FieldLine>
          <FieldLine
            id="max-submits"
            title="Giới hạn mỗi phiên"
            suffix={`bộ ảnh / phiên · 1 bộ / ${LIMITS.submitIntervalSeconds === 60 ? 'phút' : `${LIMITS.submitIntervalSeconds} giây`}`}
            error={errors.maxSubmitsPerUser}
          >
            <input
              id="max-submits"
              className={styles.input}
              inputMode="numeric"
              value={draft?.maxSubmitsPerUser ?? ''}
              disabled={off}
              aria-invalid={errors.maxSubmitsPerUser ? true : undefined}
              onChange={(e) => set('maxSubmitsPerUser', e.target.value)}
            />
          </FieldLine>
          <SwitchLine
            title="Cho phép chọn ảnh từ thư viện"
            desc="Tắt nếu cần ảnh chụp tại chỗ 100%"
            checked={draft?.allowGallery ?? true}
            disabled={off}
            onChange={(v) => set('allowGallery', v)}
          />
        </Card>

        <Card icon="verifiedUser" title="Kiểm duyệt">
          <SwitchLine
            title="Tự động duyệt"
            admin
            desc="Ảnh không bị SafeSearch gắn cờ lên Wall ngay; tắt → mọi ảnh vào Chờ duyệt"
            checked={false}
            disabled
            onChange={() => undefined}
          />
          <FieldLine id="safesearch" title="Ngưỡng SafeSearch" suffix="adult · violence · racy">
            <input
              id="safesearch"
              className={styles.input}
              placeholder="POSSIBLE"
              disabled
              title="Chưa có dịch vụ SafeSearch — mọi ảnh đều chờ người duyệt"
            />
          </FieldLine>
          <FieldLine
            id="retention"
            title="Giữ ảnh đã gỡ"
            suffix="giờ rồi xoá hẳn"
            error={errors.removedRetentionHours}
          >
            <input
              id="retention"
              className={styles.input}
              inputMode="numeric"
              value={draft?.removedRetentionHours ?? ''}
              disabled={off}
              aria-invalid={errors.removedRetentionHours ? true : undefined}
              onChange={(e) => set('removedRetentionHours', e.target.value)}
            />
          </FieldLine>
        </Card>

        <Card icon="tv" title="Màn hình lớn">
          <FieldLine id="marquee" title="Tốc độ trượt" suffix="px / giây" error={errors.marqueePxPerSec}>
            <input
              id="marquee"
              className={styles.input}
              inputMode="numeric"
              placeholder={String(MARQUEE_DEFAULT_PX)}
              value={draft?.marqueePxPerSec ?? ''}
              disabled={off}
              aria-invalid={errors.marqueePxPerSec ? true : undefined}
              onChange={(e) => set('marqueePxPerSec', e.target.value)}
            />
          </FieldLine>
          <SwitchLine
            title="Hiện tên người gửi"
            desc="Tắt nếu có yêu cầu ẩn danh toàn sự kiện"
            checked={draft?.showNames ?? true}
            disabled={off}
            onChange={(v) => set('showNames', v)}
          />
          <SwitchLine
            title={'Card "Vừa lên Wall"'}
            admin
            desc="Trượt từ dưới lên khi có ảnh mới, giữ 5 s"
            checked={draft?.arrivalCard ?? true}
            disabled={off}
            onChange={(v) => set('arrivalCard', v)}
          />
          <FieldLine id="qr-url" title="Link trong mã QR" error={errors.qrUrl}>
            <input
              id="qr-url"
              className={styles.input}
              type="url"
              value={draft?.qrUrl ?? ''}
              disabled={off}
              aria-invalid={errors.qrUrl ? true : undefined}
              onChange={(e) => set('qrUrl', e.target.value)}
            />
          </FieldLine>
          <div className={styles.buttonsRow}>
            <a className="btn btn--tonal btn--s" href="/display/" target="_blank" rel="noreferrer">
              <ConsoleIcon name="openInNew" size={16} />
              <span>Mở /display</span>
            </a>
            <Button
              variant="secondary"
              size="s"
              iconStart={<ConsoleIcon name="refresh" size={16} />}
              onClick={() => void reloadDisplays()}
            >
              Làm mới màn lớn
            </Button>
          </div>
        </Card>

        <Card icon="palette" title="Khung ảnh">
          <div className={styles.frameHead}>
            <span className={styles.lineTitle}>Trạng thái khung · bộ khung BTC ({frames.length})</span>
            <span className={styles.lockedBadge}>
              <ConsoleIcon name="lockOutline" size={16} />
              Đã khoá · duyệt 24.09
            </span>
          </div>
          <div className={styles.frameGrid}>
            {(draft?.frames ?? frameOrder([], frames)).map((setting) => {
              const frame = frames.find((f) => f.id === setting.id);
              if (!frame) return null;
              const number = frame.label.replace(/\D+/g, '') || frame.label;
              const last = setting.enabled && enabledCount === 1;
              return (
                <label key={frame.id} className={styles.frameRow} title={last ? 'Phải còn ít nhất 1 khung đang bật' : undefined}>
                  <span className={styles.frameThumb}>
                    <PhotoWallFrame frame={frame} width={14} />
                  </span>
                  <span className={styles.frameText}>
                    <span className={styles.frameName}>
                      {number} · {frame.title}
                    </span>
                    <span className={styles.frameFile}>{overlayUrl(frame).split('/').pop()}</span>
                  </span>
                  <Toggle
                    size="s"
                    checked={setting.enabled}
                    disabled={off || last}
                    onChange={(v) => toggleFrame(frame.id, v)}
                    label={`Khung ${number} · ${frame.title}`}
                  />
                </label>
              );
            })}
          </div>
          <p className={styles.note}>
            Khách chọn 1 trong các khung đang bật. Tắt khung → màn Chọn khung ẩn thẻ đó; nếu chỉ còn 1 khung thì
            tự chọn sẵn. Thứ tự trên màn Chọn khung = thứ tự ở đây.
          </p>
        </Card>

        <Card icon="downloadForOffline" title="Dữ liệu">
          <p className={styles.note}>Xuất chỉ gồm ảnh đang hiển thị. Ảnh đã gỡ không bao giờ vào bản xuất.</p>
          <div className={styles.exports}>
            <Button
              variant="secondary"
              size="m"
              block
              className={styles.exportButton}
              disabled={zipProgress !== null}
              iconStart={<ConsoleIcon name="folderZip" size={20} />}
              onClick={() => void downloadZip()}
            >
              {zipProgress
                ? `Đang gói ${zipProgress.done}/${zipProgress.total} dải ảnh…`
                : 'Tải toàn bộ dải ảnh (.zip)'}
            </Button>
            <Button
              variant="secondary"
              size="m"
              block
              className={styles.exportButton}
              iconStart={<ConsoleIcon name="movie" size={20} />}
              onClick={() => setPending({ kind: 'timelapse' })}
            >
              Tạo video timelapse
            </Button>
            <Button
              variant="secondary"
              size="m"
              block
              className={styles.exportButton}
              disabled={csvBusy}
              iconStart={<ConsoleIcon name="tableView" size={20} />}
              onClick={() => void downloadCsv()}
            >
              Xuất danh sách tham gia (.csv)
            </Button>
          </div>
          <div className={styles.danger}>
            <div>
              <p className={styles.dangerTitle}>Xoá toàn bộ dữ liệu sau sự kiện</p>
              <p className={styles.dangerLine}>{wipeLine}</p>
            </div>
            <div className={styles.dangerActions}>{wipeActions}</div>
          </div>
        </Card>

        <Card icon="manageAccounts" title="Người kiểm duyệt">
          <ul className={styles.people}>
            {moderators.map((m) => {
              const self = m.email === account.email;
              return (
                <li key={m.email} className={styles.person}>
                  <span className={`${styles.avatar} ${avatarTone(m)}`} aria-hidden="true">
                    {(m.name ?? m.email).charAt(0).toUpperCase()}
                  </span>
                  <span className={styles.personText}>
                    <span className={styles.personName}>{m.name ?? m.email.split('@')[0]}</span>
                    <span className={styles.personEmail}>{m.email}</span>
                  </span>
                  <span className={`${styles.role} ${m.role === 'admin' ? styles.roleAdmin : ''}`}>
                    {roleLabel(m)}
                  </span>
                  <IconButton
                    size="s"
                    className={styles.removePerson}
                    label={self ? 'Không tự gỡ quyền của mình được' : `Gỡ quyền của ${m.name ?? m.email}`}
                    disabled={self}
                    onClick={() => setPending({ kind: 'remove-moderator', account: m })}
                  >
                    <ConsoleIcon name="personRemove" size={20} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
          <form
            className={styles.addRow}
            onSubmit={(e) => {
              e.preventDefault();
              void addModerator();
            }}
          >
            <input
              className={styles.addEmail}
              type="email"
              placeholder="email@…"
              aria-label="Email Google của người kiểm duyệt"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <select
              className={styles.addRole}
              aria-label="Quyền"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as ModeratorRole)}
            >
              <option value="moderator">Kiểm duyệt</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" size="m" disabled={adding} iconStart={<ConsoleIcon name="personAdd" size={20} />}>
              Thêm
            </Button>
          </form>
        </Card>
      </div>

      <Dialog
        open={pending !== null}
        title={dialog?.title ?? ''}
        body={dialog?.body}
        icon={dialog?.icon}
        tone={dialog?.tone}
        confirmLabel={dialog?.confirm ?? ''}
        cancelLabel={pending?.kind === 'timelapse' ? 'Đóng' : 'Huỷ'}
        onCancel={closeDialog}
        onConfirm={() => void runPending()}
      >
        {pending?.kind === 'schedule' ? (
          <label className={styles.dialogField}>
            <span className={styles.lineTitle}>Ngày xoá</span>
            <input
              type="date"
              className={styles.input}
              min={isoDay(Date.now())}
              value={pending.day}
              onChange={(e) => setPending({ kind: 'schedule', day: e.target.value })}
            />
          </label>
        ) : null}
      </Dialog>

      {toast}
    </div>
  );
}
