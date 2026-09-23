/**
 * E03 Đã đóng nhận ảnh — DESIGN-D17, route "/closed".
 *
 * Reached by the global guard whenever config.uploadsOpen flips to false.
 * Guests can still get their own strip back — the copy promises seven days —
 * so "Dải ảnh của tôi" cannot depend on the strip still being in memory from
 * this visit. It falls back to the guest's newest photo on the backend, which
 * is what survives a reload or a later visit.
 */
import { useEffect, useState } from 'react';
import { Screen } from '@/components/Screen';
import { ButtonLink } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PartnerLine } from '@/components/PartnerLine';
import { getSubmission } from '@/features/submit/submission';
import { useBackend } from '@/lib/backend';
import styles from './Closed.module.css';

export function Closed() {
  const backend = useBackend();
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const submission = getSubmission();

  useEffect(() => backend.watchStats((s) => setApprovedCount(s.approvedCount)), [backend]);

  useEffect(
    () =>
      backend.watchMyPhotos((photos) => {
        const kept = photos.filter((p) => p.status !== 'removed' && p.status !== 'rejected');
        kept.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setLatestId(kept[0]?.id ?? null);
      }),
    [backend],
  );

  const myStripId = submission?.photoId ?? latestId;

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
          Cảm ơn {approvedCount !== null ? <b>{approvedCount} khoảnh khắc</b> : 'mọi người'}. Bạn
          vẫn tải lại dải ảnh của mình được trong 7 ngày.
        </p>
      </div>

      <div className="screen__cta">
        {myStripId ? (
          <ButtonLink
            to={`/me/${myStripId}`}
            block
            iconStart={<Icon name="person" />}
          >
            Dải ảnh của tôi
          </ButtonLink>
        ) : null}
        <ButtonLink to="/" variant="secondary" block iconStart={<Icon name="home" />}>
          Về trang chủ
        </ButtonLink>
      </div>
    </Screen>
  );
}
