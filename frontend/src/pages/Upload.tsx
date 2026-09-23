/**
 * S06 Đang gửi — route "/upload".
 * E02 Gửi lỗi, rendered in place when the upload fails.
 * E03 is reached by redirect when the backend reports `uploads-closed`.
 *
 * Both states share the same centred column and the same "pipeline" figure —
 * strip, four Google blocks, wall tile — so the failure reads as the same
 * journey stalled rather than as a different screen.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Progress } from '@/components/Progress';
import { Steps } from '@/components/Steps';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { findFrame } from '@/features/frames/frameRegistry';
import { useFrames } from '@/features/frames/useFrames';
import { useUpload } from '@/features/submit/useUpload';
import { useSession } from '@/state/SessionContext';
import type { FrameTemplate } from '@/types/frame';
import { isSessionComplete } from '@/types/session';
import styles from './Upload.module.css';

export function Upload() {
  const navigate = useNavigate();
  const { session, markSubmitted } = useSession();
  const { registry } = useFrames();
  const { state, start, retry } = useUpload();
  const started = useRef(false);

  const frame = registry ? findFrame(registry, session.selectedFrameId) : undefined;
  const photos = useMemo(() => session.shots.map((s) => s?.blob ?? null), [session.shots]);
  const complete = isSessionComplete(session);

  useEffect(() => {
    if (started.current || !complete || !frame) return;
    started.current = true;
    const shots = session.shots.filter((s): s is NonNullable<typeof s> => Boolean(s));
    void start(
      shots.map((s) => s.blob),
      frame,
      session.displayName,
    );
  }, [complete, frame, session.shots, session.displayName, start]);

  useEffect(() => {
    if (state.phase === 'done' && state.photoId) {
      markSubmitted();
      navigate('/done', { replace: true });
    }
    if (state.errorCode === 'uploads-closed') navigate('/closed', { replace: true });
  }, [state.phase, state.photoId, state.errorCode, navigate, markSubmitted]);

  if (!complete) return <Navigate to="/camera/1" replace />;

  if (state.phase === 'failed') {
    return <UploadFailed state={state} frame={frame} photos={photos} onRetry={retry} />;
  }

  return (
    <Screen>
      <TopBar title="Bước 3 / 3" backTo="/finish" />
      <Steps current={3} />

      <div className={styles.body}>
        <Pipeline frame={frame} photos={photos} />

        <div className={styles.copy}>
          <h1 className={`u ${styles.title}`}>
            Đang gửi lên
            <br />
            Photo Wall…
          </h1>
          <p className={styles.sub}>Vài giây thôi. Đừng đóng trang nhé.</p>
        </div>

        <Progress
          value={state.phase === 'composing' ? null : state.progress}
          label={state.phase === 'composing' ? 'Đang ghép 4 ảnh…' : 'Ghép 4 ảnh xong · đang gửi'}
        />
      </div>

      <div className={`screen__cta ${styles.cancelRow}`}>
        <Button variant="text" onClick={() => navigate('/finish')}>
          Huỷ
        </Button>
      </div>
    </Screen>
  );
}

/**
 * Strip → four blocks → wall tile. Decorative, and the only looping animation
 * the design allows outside the live dot on the big screen.
 */
function Pipeline({
  frame,
  photos,
  failed,
}: {
  frame?: FrameTemplate;
  photos: (Blob | null)[];
  failed?: boolean;
}) {
  return (
    <div className={styles.pipeline} aria-hidden="true">
      <span className={styles.miniStrip}>
        {frame ? <PhotoWallFrame frame={frame} width={40} photos={photos} /> : null}
      </span>

      <span className={styles.dash} />

      <span className={styles.blocks}>
        <span className={styles.b1} />
        <span className={styles.b2} />
        <span className={styles.b3} />
        <span className={styles.b4} />
      </span>

      <span className={styles.dash} />

      <span className={`card ${styles.wallTile} ${failed ? styles.wallTileFailed : ''}`}>
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

/** E02. The blob is still in memory; retry resumes, never resubmits. */
function UploadFailed({
  state,
  frame,
  photos,
  onRetry,
}: {
  state: ReturnType<typeof useUpload>['state'];
  frame?: FrameTemplate;
  photos: (Blob | null)[];
  onRetry: () => void;
}) {
  const navigate = useNavigate();

  const copy =
    state.errorCode === 'rate-limited'
      ? {
          title: 'Chờ một chút nhé',
          body: `Bạn vừa gửi một dải ảnh. Chờ ${state.retryAfterSeconds ?? 60} giây nữa để gửi tiếp.`,
          icon: 'hourglass' as const,
        }
      : state.errorCode === 'quota-exceeded'
        ? {
            title: 'Bạn đã gửi đủ số ảnh',
            body: 'Cảm ơn bạn đã tham gia Photo Wall!',
            icon: 'checkCircle' as const,
          }
        : state.errorCode === 'invalid-input'
          ? {
              title: 'Ảnh chưa hợp lệ',
              body: 'Có lỗi khi ghép ảnh. Thử chụp lại dải ảnh giúp mình nhé.',
              icon: 'errorCircle' as const,
            }
          : {
              title: 'Gửi ảnh chưa thành công',
              body: 'Mạng hơi chập chờn. 4 ảnh của bạn vẫn còn đây, chỉ cần gửi lại thôi.',
              icon: 'wifiOff' as const,
            };

  const canResume = state.errorCode === 'upload-failed' && Boolean(state.photoId);

  return (
    <Screen>
      <TopBar title="Bước 3 / 3" backTo="/finish" />
      <Steps current={3} />

      <div className={styles.body}>
        <Pipeline frame={frame} photos={photos} failed />

        <div className={styles.copy}>
          <span className={styles.errorDisc} aria-hidden="true">
            <Icon name={copy.icon} size={32} />
          </span>
          <h1 className={`u ${styles.title}`}>{copy.title}</h1>
          <p className={styles.sub}>{copy.body}</p>
        </div>
      </div>

      <div className="screen__cta">
        {canResume ? (
          <Button block iconStart={<Icon name="refresh" />} onClick={onRetry}>
            Gửi lại
          </Button>
        ) : null}
        <Button variant="secondary" block onClick={() => navigate('/finish')}>
          Xem lại dải ảnh
        </Button>
      </div>
    </Screen>
  );
}
