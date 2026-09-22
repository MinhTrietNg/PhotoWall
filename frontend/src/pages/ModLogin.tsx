/**
 * M00 Đăng nhập BTC — DESIGN-D20, route `/mod` (internally `/` in the admin
 * app). Drawn in its error state on the artboard, so both the clean and the
 * "not on the allowlist" state live on this one screen.
 */
import { useState } from 'react';
import { Button } from '@/components/Button';
import { GoogleGlyph, Icon } from '@/components/Icon';
import styles from './ModLogin.module.css';

export function ModLogin({
  deniedEmail,
  onSignIn,
}: {
  /** Set when a Google account signed in but is not on the moderators allowlist. */
  deniedEmail?: string;
  onSignIn: () => Promise<void>;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      await onSignIn();
    } catch {
      setError('Đăng nhập thất bại, thử lại nhé.');
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.logo} aria-hidden="true">
          <Icon name="photoCamera" size={24} />
        </span>

        <h1 className={`u ${styles.title}`}>Kiểm duyệt Photo Wall</h1>
        <p className={styles.sub}>Chỉ dành cho ban tổ chức</p>
        <p className={styles.body}>
          Đăng nhập bằng tài khoản Google đã được GDGoC thêm vào danh sách kiểm duyệt. Khách tham
          gia không cần đăng nhập.
        </p>

        {deniedEmail ? (
          <p className={styles.error}>
            <b>{deniedEmail}</b> chưa có quyền kiểm duyệt. Nhờ Admin GDGoC thêm bạn trong Cài đặt
            → Người kiểm duyệt.
          </p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <Button
          variant="secondary"
          block
          disabled={signingIn}
          iconStart={<GoogleGlyph />}
          onClick={handleSignIn}
        >
          {signingIn ? 'Đang đăng nhập…' : 'Đăng nhập bằng Google'}
        </Button>

        <p className={styles.footer}>
          Phiên hết hạn sau 12 giờ · <a href="/">Về trang khách →</a>
        </p>
      </div>
    </div>
  );
}
