/**
 * S04 Kiểm tra ảnh — DESIGN-D07, route "/camera/:n/review".
 *
 * Lets the guest reject a bad shot before it costs them the whole strip.
 * "Dùng ảnh này" is one of only two places the Success button variant is
 * allowed in the whole product (the other is "Duyệt" in moderation).
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { ShotTray } from '@/features/capture/ShotTray';
import { clearPendingShot, takePendingShot } from '@/features/capture/pendingShot';
import { track } from '@/lib/analytics';
import { useBlobUrls } from '@/lib/useBlobUrls';
import { useSession } from '@/state/SessionContext';
import { SHOT_COUNT } from '@/types/session';
import styles from './ShotReview.module.css';

export function ShotReview() {
  const { n } = useParams();
  const slot = Number(n);
  const navigate = useNavigate();
  const { session, setShot } = useSession();

  /*
   * Claimed once, on mount, and held for the lifetime of the screen. Reading
   * the module singleton on every render would be fragile: the cleanup below
   * runs on mount under StrictMode, so the second render would find nothing
   * and bounce the guest back to the camera with their shot already taken.
   */
  const [pending] = useState(() => takePendingShot(slot));
  const blobs = useMemo(() => [pending?.blob ?? null], [pending]);
  const [url] = useBlobUrls(blobs);

  // The blob lives in memory only; a reload drops it, so go back and reshoot.
  useEffect(() => () => clearPendingShot(), []);

  if (!Number.isInteger(slot) || slot < 1 || slot > SHOT_COUNT) return <Navigate to="/" replace />;
  if (!pending || pending.slot !== slot) return <Navigate to={`/camera/${slot}`} replace />;

  function accept() {
    if (!pending) return;
    const previous = session.shots[slot - 1];

    setShot(slot, {
      blob: pending.blob,
      width: pending.width,
      height: pending.height,
      capturedAt: Date.now(),
      source: pending.source,
      retakes: 0, // SessionContext carries the running count forward
    });
    track('pw_capture', {
      index: slot,
      source: pending.source,
      retakes: previous ? previous.retakes + 1 : 0,
    });
    clearPendingShot();

    // Slots can be retaken out of order from /review, so jump to the next gap
    // rather than blindly to slot + 1.
    const filled = session.shots.map((shot, i) => i === slot - 1 || Boolean(shot));
    const gap = filled.indexOf(false);
    navigate(gap === -1 ? '/finish' : `/camera/${gap + 1}`);
  }

  return (
    <Screen tone="dark">
      <TopBar
        tone="dark"
        title={`Ảnh ${slot} / ${SHOT_COUNT}`}
        backTo={`/camera/${slot}`}
        right={
          session.displayName ? (
            <span className={`pill pill--lg pill--on-ink ${styles.namePill}`}>
              <Icon name="person" size={16} />
              <span className={styles.nameText}>{session.displayName}</span>
            </span>
          ) : undefined
        }
      />

      {/* `preview` is what makes the current cell show this shot, blue-bordered. */}
      <ShotTray shots={session.shots} current={slot} preview={pending.blob} />

      <div className={styles.previewWrap}>
        <div className={styles.stage}>
          <div className={styles.preview}>
            {url ? <img src={url} alt="Ảnh vừa chụp" className={styles.photo} /> : null}
            <span className={`pill ${styles.badge}`}>
              <Icon name="check" size={16} />
              Vừa chụp
            </span>
          </div>
          <h1 className={`u ${styles.title}`}>Tấm này được chứ?</h1>
        </div>
      </div>

      {/* 42 / 58, not half and half — "Dùng ảnh này" has to stay the bigger target. */}
      <div className={`screen__cta screen__cta--row ${styles.dock}`}>
        <Button variant="secondary" iconStart={<Icon name="refresh" />} onClick={() => navigate(`/camera/${slot}`)}>
          Chụp lại
        </Button>
        <Button variant="success" iconEnd={<Icon name="arrowForward" />} onClick={accept}>
          Dùng ảnh này
        </Button>
      </div>
    </Screen>
  );
}
