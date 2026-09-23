/**
 * E03 Đã đóng nhận ảnh — route "/closed".
 *
 * Reached by the global guard whenever config.uploadsOpen flips to false.
 * Nothing is left to do here but go home: there is no "my strip" screen, and
 * the done screen is where a guest downloads, shares or removes theirs.
 */
import { useEffect, useState } from 'react';
import { Screen } from '@/components/Screen';
import { ButtonLink } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PartnerLine } from '@/components/PartnerLine';
import { useBackend } from '@/lib/backend';
import styles from './Closed.module.css';

export function Closed() {
  const backend = useBackend();
  const [approvedCount, setApprovedCount] = useState<number | null>(null);

  useEffect(() => backend.watchStats((s) => setApprovedCount(s.approvedCount)), [backend]);

  return (
    <Screen>
      <div className={styles.partner}>
        <PartnerLine />
      </div>

      <div className={styles.body}>
        <span className={styles.disc} aria-hidden="true">
          <Icon name="lock" size={48} />
        </span>

        <h1 className={`u ${styles.title}`}>Wall đã đóng nhận ảnh</h1>

        <p className={styles.text}>
          Cảm ơn{' '}
          {approvedCount !== null ? <b>{approvedCount} khoảnh khắc</b> : 'mọi khoảnh khắc'} đã
          lên màn hình lớn hôm nay. Hẹn gặp lại ở sự kiện sau!
        </p>
      </div>

      <div className="screen__cta">
        <ButtonLink to="/" block iconStart={<Icon name="home" />}>
          Về trang chủ
        </ButtonLink>
      </div>
    </Screen>
  );
}
