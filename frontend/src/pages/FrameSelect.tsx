/**
 * S05 Chọn khung — DESIGN-D09, route "/frame".
 *
 * Preview 150px on the left, option cards on the right. Tapping a card swaps
 * the overlay AND the slot geometry with a 160ms crossfade; the four photos stay
 * put and the box never resizes. The caption is a promise the export keeps:
 * "Xem trước đúng là ảnh sẽ tải về."
 */
import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { StateBlock } from '@/components/StateBlock';
import { Steps } from '@/components/Steps';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { FrameOption } from '@/features/frames/FrameOption';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { enabledFrames, findFrame } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { track } from '@/lib/analytics';
import { useSession } from '@/state/SessionContext';
import { SHOT_COUNT, shotCount } from '@/types/session';
import styles from './FrameSelect.module.css';

export function FrameSelect() {
  const navigate = useNavigate();
  const { session, selectFrame } = useSession();
  const { registry, error } = useFrames();

  const frames = useMemo(() => (registry ? enabledFrames(registry) : []), [registry]);
  const selected = registry ? findFrame(registry, session.selectedFrameId) : undefined;
  const photos = useMemo(() => session.shots.map((s) => s?.blob ?? null), [session.shots]);

  // Auto-select: no choice made yet, or the chosen frame was disabled by Admin.
  useEffect(() => {
    if (frames.length === 0) return;
    if (!selected || selected.enabled === false) selectFrame(frames[0].id);
  }, [frames, selected, selectFrame]);

  if (shotCount(session) < SHOT_COUNT) return <Navigate to="/camera/1" replace />;

  if (error) {
    return (
      <Screen>
        <TopBar title="Chọn khung" backTo={`/camera/${SHOT_COUNT}`} />
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
      <TopBar
        title="Chọn khung"
        backTo={`/camera/${SHOT_COUNT}`}
        right={
          <span className="pill pill--lg">
            <Icon name="check" size={16} />
            {SHOT_COUNT} / {SHOT_COUNT} ảnh
          </span>
        }
      />
      <Steps current={2} />

      <div className={styles.main}>
        <div className={styles.previewCol}>
          <div className={styles.previewCard}>
            {selected ? (
              // key forces a remount per variant so the crossfade actually runs.
              <div key={selected.id} className={styles.fade}>
                <PhotoWallFrame frame={selected} width="fit" photos={photos} />
              </div>
            ) : (
              <div className={styles.previewSkeleton} />
            )}
          </div>
          <p className={styles.caption}>Xem trước đúng là ảnh sẽ tải về. Bấm thẻ để đổi khung.</p>
        </div>

        <div className={styles.optionCol} role="group" aria-label="Khung có sẵn">
          <span className={`lbl ${styles.optionLabel}`}>Khung có sẵn · {frames.length}</span>
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
      </div>

      <div className="screen__cta">
        <Button
          block
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            track('pw_frame_select', { variant: selected.id });
            navigate('/review');
          }}
        >
          Dùng khung này
        </Button>
      </div>
    </Screen>
  );
}
