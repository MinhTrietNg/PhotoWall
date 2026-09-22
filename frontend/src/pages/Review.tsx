/**
 * S06 Xem lại dải ảnh — DESIGN-D10, route "/review".
 *
 * Last check before sending, with cheap per-slot repair. "Chụp lại hết" is
 * deliberately the secondary button — "Gửi lên Wall" is the only primary.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Icon, PaletteGlyph } from '@/components/Icon';
import { Steps } from '@/components/Steps';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { findFrame } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { useBlobUrls } from '@/lib/useBlobUrls';
import { useSession } from '@/state/SessionContext';
import { SHOT_COUNT, isSessionComplete } from '@/types/session';
import styles from './Review.module.css';

export function Review() {
  const navigate = useNavigate();
  const { session, clearShots } = useSession();
  const { registry } = useFrames();
  const [confirmReset, setConfirmReset] = useState(false);

  const frame = registry ? findFrame(registry, session.selectedFrameId) : undefined;
  const photos = useMemo(() => session.shots.map((s) => s?.blob ?? null), [session.shots]);
  const urls = useBlobUrls(photos);

  if (!isSessionComplete(session)) return <Navigate to="/camera/1" replace />;

  return (
    <Screen>
      <TopBar
        title="Xem lại"
        backTo="/frame"
        right={
          <Link to="/name" className={`pill pill--lg ${styles.namePill}`} aria-label="Sửa tên">
            <Icon name="person" size={16} />
            <span className={styles.nameText}>{session.displayName}</span>
            <Icon name="edit" size={16} />
          </Link>
        }
      />
      <Steps current={2} />

      <div className={styles.main}>
        <div className={styles.stripCard}>
          {frame ? <PhotoWallFrame frame={frame} width="fit" photos={photos} /> : null}
        </div>

        <div className={styles.side}>
          <span className="lbl">Chụp lại một ô</span>
          <div className={styles.grid}>
            {urls.map((url, i) => (
              <Link
                key={i}
                to={`/camera/${i + 1}`}
                className={styles.tile}
                aria-label={`Chụp lại ô ${i + 1}`}
              >
                {url ? <img src={url} alt="" className={styles.tileImg} /> : null}
                <span className={`u ${styles.tileNumber}`} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.tileAction} aria-hidden="true">
                  <Icon name="refresh" size={16} />
                </span>
              </Link>
            ))}
          </div>

          <span className={`lbl ${styles.frameLabel}`}>Khung</span>
          <Link to="/frame" className={`pill ${styles.frameChip}`}>
            <PaletteGlyph size={16} />
            <span className={styles.frameChipText}>
              {frame ? `${frame.label} · ${frame.title.split(' · ')[0]}` : '—'}
            </span>
            <Icon name="chevronRight" size={16} />
          </Link>

          <p className={styles.note}>
            <Icon name="visibility" size={16} />
            <span>Ảnh lên màn hình lớn đúng như bản xem trước. Gửi xong vẫn gỡ được.</span>
          </p>
        </div>
      </div>

      <div className={`screen__cta screen__cta--row ${styles.actions}`}>
        <Button variant="secondary" onClick={() => setConfirmReset(true)}>
          Chụp lại hết
        </Button>
        <Button iconEnd={<Icon name="arrowForward" />} onClick={() => navigate('/upload')}>
          Gửi lên Wall
        </Button>
      </div>

      <Dialog
        open={confirmReset}
        title={`Chụp lại cả ${SHOT_COUNT} tấm?`}
        body={`${SHOT_COUNT} ảnh hiện tại sẽ bị xoá. Nếu chỉ muốn sửa một tấm, bấm vào ô đó ở danh sách bên trên.`}
        confirmLabel="Chụp lại hết"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          clearShots();
          setConfirmReset(false);
          navigate('/camera/1');
        }}
      />
    </Screen>
  );
}
