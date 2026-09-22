/**
 * M02 Cài đặt sự kiện — DESIGN-D22, route `/mod/settings` (internally
 * `/settings` in the admin app).
 *
 * The artboard draws ~18 settings across 6 sections; `config/app` only accepts
 * `{uploadsOpen, eventName}` (firestore.rules `hasOnly`). Everything else is
 * rendered here anyway, visibly disabled with the real backend behaviour noted
 * underneath, per the resolution in Claude-Plan.md §20.5 #10 and Phase 10's
 * P10.13–15 — do not ship a control that would silently do nothing.
 */
import { useEffect, useState } from 'react';
import { LIMITS } from '@backend/schema';
import { Button } from '@/components/Button';
import { IconButtonLink } from '@/components/IconButton';
import { Icon } from '@/components/Icon';
import { Field } from '@/components/Field';
import { SettingRow, Toggle } from '@/components/Controls';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { overlayUrl } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { useModeratorBackend, type AppConfig } from '@/lib/backend';
import styles from './ModSettings.module.css';

interface Draft {
  uploadsOpen: boolean;
  eventName: string;
}

const SOON = <span className="tag">Sắp có</span>;

export function ModSettings({ email }: { email: string }) {
  const backend = useModeratorBackend();
  const { registry } = useFrames();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(
    () =>
      backend.watchConfig((c) => {
        setConfig(c);
        // Seed the draft once — later live updates (e.g. the toggle on M01)
        // don't clobber an edit in progress. "Huỷ thay đổi" re-syncs explicitly.
        setDraft((prev) => (prev === null && c ? { uploadsOpen: c.uploadsOpen, eventName: c.eventName } : prev));
      }),
    [backend],
  );

  const dirty = Boolean(
    config && draft && (draft.uploadsOpen !== config.uploadsOpen || draft.eventName !== config.eventName),
  );

  function resetDraft() {
    if (config) setDraft({ uploadsOpen: config.uploadsOpen, eventName: config.eventName });
  }

  async function handleSave() {
    if (!config || !draft) return;
    setSaving(true);
    try {
      if (draft.uploadsOpen !== config.uploadsOpen) await backend.setUploadsOpen(draft.uploadsOpen);
      if (draft.eventName !== config.eventName) await backend.setEventName(draft.eventName);
    } finally {
      setSaving(false);
    }
  }

  const guestUrl = `${location.origin}/`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <IconButtonLink to="/" label="Quay lại">
            <Icon name="arrowBack" />
          </IconButtonLink>
          <div>
            <h1 className={`u ${styles.title}`}>Cài đặt sự kiện</h1>
            <p className={styles.sub}>
              Chỉ ban tổ chức thấy trang này · mọi thay đổi có hiệu lực ngay
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="m" disabled={!dirty || saving} onClick={resetDraft}>
            Huỷ thay đổi
          </Button>
          <Button size="m" disabled={!dirty || saving} onClick={() => void handleSave()}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </header>

      <section className={styles.section}>
        <span className={`lbl ${styles.sectionTitle}`}>Nhận ảnh</span>
        <div className={styles.rows}>
          <Field
            label="Tên sự kiện"
            value={draft?.eventName ?? ''}
            onChange={(e) => setDraft((d) => (d ? { ...d, eventName: e.target.value } : d))}
            maxLength={80}
          />
          <SettingRow
            title="Đang nhận ảnh"
            description={'Tắt → khách thấy màn "Đã đóng nhận ảnh", vẫn tải dải ảnh của mình được.'}
            control={
              <Toggle
                checked={draft?.uploadsOpen ?? false}
                onChange={(v) => setDraft((d) => (d ? { ...d, uploadsOpen: v } : d))}
                label="Đang nhận ảnh"
              />
            }
          />
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Tự động đóng lúc {SOON}</span>
            <span className={styles.staticValue}>Tắt/mở tay ở trên</span>
          </div>
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Giới hạn mỗi phiên {SOON}</span>
            <span className={styles.staticValue}>
              {LIMITS.maxSubmitsPerUser} bộ / phiên · 1 bộ / {LIMITS.submitIntervalSeconds}s — đổi trong
              firestore.rules
            </span>
          </div>
          <SettingRow
            title={<>Cho phép chọn ảnh từ thư viện {SOON}</>}
            description="Luôn bật — camera từ chối vẫn cho khách chọn ảnh có sẵn (E01)."
            control={<Toggle checked disabled onChange={() => undefined} label="Cho phép chọn ảnh từ thư viện" />}
          />
        </div>
      </section>

      <section className={styles.section}>
        <span className={`lbl ${styles.sectionTitle}`}>Kiểm duyệt</span>
        <div className={styles.rows}>
          <SettingRow
            title={<>Tự động duyệt {SOON}</>}
            description="Không có dịch vụ SafeSearch — mọi ảnh vào Chờ duyệt, cần người bấm Duyệt."
            control={<Toggle checked={false} disabled onChange={() => undefined} label="Tự động duyệt" />}
          />
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Ngưỡng SafeSearch {SOON}</span>
            <span className={styles.staticValue}>Chưa có dịch vụ kiểm tra ảnh</span>
          </div>
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Giữ ảnh đã gỡ {SOON}</span>
            <span className={styles.staticValue}>Xoá khỏi bộ nhớ ngay khi gỡ, không giữ lại</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <span className={`lbl ${styles.sectionTitle}`}>Màn hình lớn</span>
        <div className={styles.rows}>
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Tốc độ trượt {SOON}</span>
          </div>
          <SettingRow
            title={<>Hiện tên người gửi {SOON}</>}
            description="Luôn hiện — chưa có công tắc ẩn danh toàn sự kiện."
            control={<Toggle checked disabled onChange={() => undefined} label="Hiện tên người gửi" />}
          />
          <SettingRow
            title={<>Card "Vừa lên Wall" {SOON}</>}
            description="Luôn bật khi có ảnh mới được duyệt."
            control={<Toggle checked disabled onChange={() => undefined} label={'Card "Vừa lên Wall"'} />}
          />
          <div className={styles.qrRow}>
            <div>
              <span className="lbl">Link trong mã QR</span>
              <p className={styles.qrLink}>{guestUrl}</p>
            </div>
            <a className="btn btn--secondary btn--m" href="/display/" target="_blank" rel="noreferrer">
              Mở /display
            </a>
          </div>
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Làm mới màn hình lớn {SOON}</span>
            <span className={styles.staticValue}>Màn tự làm mới mỗi 6 giờ</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <span className={`lbl ${styles.sectionTitle}`}>
          Khung ảnh · bộ khung BTC {registry ? `(${registry.frames.length})` : ''}
        </span>
        <p className={styles.note}>
          Khách chọn 1 trong các khung đang bật. Thứ tự trên màn Chọn khung = thứ tự ở đây. Bật/tắt
          từng khung chưa lưu được — chỉnh trực tiếp trong <code>frames.json</code>.
        </p>
        <div className={styles.frameList}>
          {registry?.frames.map((frame) => (
            <div key={frame.id} className={styles.frameRow}>
              <PhotoWallFrame frame={frame} width={28} className={styles.frameThumb} />
              <span className={styles.frameName}>
                {frame.label} · {frame.title}
              </span>
              <span className={styles.frameFile}>{overlayUrl(frame).split('/').pop()}</span>
              <span className="tag">Đã khoá</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <span className={`lbl ${styles.sectionTitle}`}>Dữ liệu</span>
        <div className={styles.rows}>
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Tải toàn bộ dải ảnh (.zip) {SOON}</span>
            <Button variant="secondary" size="s" disabled>
              Tải .zip
            </Button>
          </div>
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Tạo video timelapse {SOON}</span>
            <Button variant="secondary" size="s" disabled>
              Tạo video
            </Button>
          </div>
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Xuất danh sách tham gia (.csv) {SOON}</span>
            <Button variant="secondary" size="s" disabled>
              Xuất .csv
            </Button>
          </div>
          <div className={styles.staticRow}>
            <span className={styles.rowTitleWithTag}>Xoá toàn bộ dữ liệu sau sự kiện {SOON}</span>
            <Button variant="destructive" size="s" disabled>
              Lên lịch xoá
            </Button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <span className={`lbl ${styles.sectionTitle}`}>Người kiểm duyệt</span>
        <div className={styles.staticRow}>
          <span className={styles.rowTitleWithTag}>{email}</span>
          <span className="tag">Kiểm duyệt</span>
        </div>
        <p className={styles.note}>
          Danh sách đầy đủ được quản lý trong Firebase console (<code>moderators/&#123;email&#125;</code>) —
          quy tắc bảo mật chỉ cho một tài khoản đọc đúng dòng của chính nó.
        </p>
      </section>
    </div>
  );
}
