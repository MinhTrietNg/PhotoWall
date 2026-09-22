/**
 * E03 Đã đóng nhận ảnh — DESIGN-D17, route "/closed".
 *
 * Reached by the global guard whenever config.uploadsOpen flips to false.
 * Guests can still get their own strip back.
 */
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PartnerLine } from '@/components/PartnerLine';
import { getSubmission } from '@/features/submit/submission';
import { useBackend } from '@/lib/backend';
import styles from './Closed.module.css';

export function Closed() {
  const backend = useBackend();
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const submission = getSubmission();

  useEffect(() => backend.watchStats((s) => setApprovedCount(s.approvedCount)), [backend]);

  return (
    <div className="screen">
      <div className={styles.partner}>
        <PartnerLine />
      </div>

      <div className={styles.body}>
        <span className={styles.disc} aria-hidden="true">
          <Icon name="eventBusy" size={32} />
        </span>

        <h1 className={`u ${styles.title}`}>Wall đã đóng nhận ảnh</h1>

        <p className={styles.text}>
          Cảm ơn {approvedCount !== null ? <b>{approvedCount} khoảnh khắc</b> : 'mọi người'}. Bạn
          vẫn tải lại dải ảnh của mình được trong 7 ngày.
        </p>
      </div>

      <div className="screen__cta">
        {submission?.photoId ? (
          <ButtonLink to={`/me/${submission.photoId}`} block>
            Dải ảnh của tôi
          </ButtonLink>
        ) : null}
        <ButtonLink to="/" variant="secondary" block>
          Về trang chủ
        </ButtonLink>
      </div>
    </div>
  );
}
