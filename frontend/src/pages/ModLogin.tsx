/**
 * M00 Đăng nhập BTC — DESIGN-D20, route `/mod` (internally `/` in the admin
 * app). Drawn in its error state on the artboard, so both the clean and the
 * "not on the allowlist" state live on this one screen.
 */
import { useState } from 'react';
import { Button } from '@/components/Button';
import { ConsoleIcon } from '@/features/moderation/ConsoleIcon';
import styles from './ModLogin.module.css';

export function ModLogin({
  deniedEmail,
  onSignIn,
  title = 'Kiểm duyệt Photo Wall',
  body = 'Đăng nhập bằng tài khoản Google đã được GDGoC thêm vào danh sách kiểm duyệt. Khách tham gia không cần đăng nhập.',
}: {
  /** Set when a Google account signed in but is not on the moderators allowlist. */
  deniedEmail?: string;
  onSignIn: () => Promise<void>;
  /** The big screen reuses this gate with its own wording. */
  title?: string;
  body?: string;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      await onSignIn();
    } catch {
      setError('Đăng nhập chưa xong, thử lại nhé.');
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className={styles.page}>
      <span className={styles.circle} aria-hidden="true" />
      <span className={styles.square} aria-hidden="true" />

      <main className={styles.card}>
        <div className={styles.head}>
          <span className={styles.tile} aria-hidden="true">
            <ConsoleIcon name="adminPanelSettings" size={24} />
          </span>
          <div>
            <h1 className={`u ${styles.title}`}>{title}</h1>
            <p className={styles.sub}>Chỉ dành cho ban tổ chức</p>
          </div>
        </div>

        <p className={styles.body}>{body}</p>

        <Button
          block
          disabled={signingIn}
          iconStart={
            <span className={styles.gBadge} aria-hidden="true">
              G
            </span>
          }
          onClick={handleSignIn}
        >
          {signingIn ? 'Đang đăng nhập…' : 'Đăng nhập bằng Google'}
        </Button>

        {deniedEmail ? (
          <div className={styles.error} role="alert">
            <ConsoleIcon name="block" size={20} className={styles.errorIcon} />
            <p>
              <b>{deniedEmail}</b> chưa có quyền kiểm duyệt. Nhờ Admin GDGoC thêm bạn trong Cài đặt
              → Người kiểm duyệt.
            </p>
          </div>
        ) : null}
        {error ? (
          <div className={styles.error} role="alert">
            <ConsoleIcon name="block" size={20} className={styles.errorIcon} />
            <p>{error}</p>
          </div>
        ) : null}

        <div className={styles.footer}>
          <span>Phiên hết hạn sau 12 giờ</span>
          <a href="/">Về trang khách →</a>
        </div>
      </main>
    </div>
  );
}
