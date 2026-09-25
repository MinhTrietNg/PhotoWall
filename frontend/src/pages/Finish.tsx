/**
 * S05 Hoàn thiện dải ảnh — route "/finish".
 *
 * Choosing the frame and the last check before sending are one screen. The
 * strip on the left is the real composition at preview size; the cards beside
 * it swap its frame in place with a 160ms crossfade, the four photos staying
 * put and the box never resizing; each tile under them retakes one slot.
 * "Chụp lại hết" is deliberately the secondary — "Gửi lên Wall" is the only
 * primary.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { StateBlock } from '@/components/StateBlock';
import { Steps } from '@/components/Steps';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { FrameOption } from '@/features/frames/FrameOption';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { useAppConfig } from '@/features/config/useAppConfig';
import { enabledFrames } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { track } from '@/lib/analytics';
import { useBlobUrls } from '@/lib/useBlobUrls';
import { useSession } from '@/state/SessionContext';
import { SHOT_COUNT, shotCount } from '@/types/session';
import styles from './Finish.module.css';

export function Finish() {
  const navigate = useNavigate();
  const { session, selectFrame, clearShots } = useSession();
  const { registry, error } = useFrames();
  const config = useAppConfig();
  const [confirmReset, setConfirmReset] = useState(false);

  // Held back until the config is in, so a frame the Admin switched off never flashes up.
  const frames = useMemo(
    () => (registry && config !== undefined ? enabledFrames(registry, config?.frames) : []),
    [registry, config],
  );
  const selected = frames.find((f) => f.id === session.selectedFrameId);
  const photos = useMemo(() => session.shots.map((s) => s?.blob ?? null), [session.shots]);
  const urls = useBlobUrls(photos);

  // Auto-select: no choice made yet, or the chosen frame was switched off by Admin.
  useEffect(() => {
    if (frames.length > 0 && !selected) selectFrame(frames[0].id);
  }, [frames, selected, selectFrame]);

  if (shotCount(session) < SHOT_COUNT) return <Navigate to="/camera/1" replace />;

  const topBar = (
    <TopBar
      title="Hoàn thiện dải ảnh"
      backTo={`/camera/${SHOT_COUNT}`}
      right={
        <span className="pill pill--lg">
          <Icon name="check" size={16} />
          {SHOT_COUNT} / {SHOT_COUNT} ảnh
        </span>
      }
    />
  );

  if (error) {
    return (
      <Screen>
        {topBar}
        <StateBlock
          tone="error"
          title="Chưa tải được bộ khung"
          body="Kiểm tra mạng rồi thử lại nhé."
          action={
            <Button block onClick={() => location.reload()}>
              Thử lại
            </Button>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {topBar}
      <Steps current={2} />

      <div className={styles.main}>
        <div className={styles.stripCard}>
          {selected ? (
            // key forces a remount per variant so the crossfade actually runs.
            <div key={selected.id} className={styles.fade}>
              <PhotoWallFrame frame={selected} width="fit" photos={photos} />
            </div>
          ) : (
            <div className={styles.skeleton} />
          )}
        </div>

        <div className={styles.side}>
          <span className="lbl">Khung · {frames.length} mẫu</span>
          <div className={styles.frames} role="group" aria-label="Khung">
            {frames.map((frame) => (
              <FrameOption
                key={frame.id}
                frame={frame}
                selected={frame.id === session.selectedFrameId}
                photos={photos}
                onSelect={selectFrame}
              />
            ))}
          </div>

          <span className={`lbl ${styles.retakeLabel}`}>Chụp lại một ô</span>
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
        </div>
      </div>

      <div className={`screen__cta screen__cta--row ${styles.cta}`}>
        <Button variant="secondary" onClick={() => setConfirmReset(true)}>
          Chụp lại hết
        </Button>
        <Button
          iconEnd={<Icon name="arrowForward" />}
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            track('pw_frame_select', { variant: selected.id });
            navigate('/upload');
          }}
        >
          Gửi lên Wall
        </Button>
      </div>

      <Dialog
        open={confirmReset}
        title={`Chụp lại cả ${SHOT_COUNT} tấm?`}
        body={`${SHOT_COUNT} ảnh hiện tại sẽ bị xoá. Nếu chỉ muốn sửa một tấm, chạm vào ô đó ở "Chụp lại một ô".`}
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
